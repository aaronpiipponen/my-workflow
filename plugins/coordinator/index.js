// Coordinate plan orchestrators that work in parallel, each on its own worktree of one workspace.
//
// `/coordinator-link`, typed by the user in a plan orchestrator's chat, links that session to the
// workspace's coordinator session, starting the coordinator in the workspace root first when there
// is none; the terminal UI then opens the new session. The coordinator learns about linked plans
// only through messages appended to its conversation: each plan once when linked, then one feed
// message per finished orchestrator round with the orchestrator's message, its children's reports,
// the plan's changes and any hold it reached. In a plan, `phase_subagent` starts every phase
// implementer and records the phase on its session. The coordinator arms hold pairs that make
// `phase_subagent` refuse a held phase, opens a channel through which the leading orchestrator talks to its
// partner, and the leader closes it when the overlap is settled. Every session may lock the
// workspace's shared resources. The state lives in `<workspace root>/.opencode/coordinator/`.

import { existsSync } from "node:fs"
import path from "node:path"

import { assertSubagentAllowed, assistantText, errorText, lastRound, resolveAgent } from "../subagent-foreground/index.js"
import { branchOf, planOf, rootOf } from "../workflow/index.js"
import { coordinatorModel, readSettings } from "../workflow/workspace.js"
import { planChanges, planSnapshot, reportSummary, unlistedFiles } from "./feed.js"
import {
  armPair,
  describeHolds,
  HELD_AGENT,
  holdFor,
  holdMessage,
  ledPair,
  markReached,
  openChannel,
  pairOfPlan,
  readHolds,
  releasePair,
  removedHolds,
  sharedDesign,
  sidesOf,
} from "./holds.js"
import { readInbox, writeInbox } from "./inbox.js"
import { describeLocks, readLocks, releaseLock, requestLock, takeLock } from "./locks.js"
import { phaseStatuses, planDir } from "./plans.js"
import { Coordinator } from "./rpc.js"
import { linkSession, readLinks, sessionOfPlan, unlinkSession } from "./state.js"

// Both subagent tools start a child; in a plan, `phase_subagent` starts every phase implementer.
const SUBAGENT_TOOLS = new Set(["subagent", "subagent_foreground"])
const PHASE_TOOL = "phase_subagent"
const COORDINATOR_AGENT = "coordinator"
const ROUND_ENDS = ["session.execution.succeeded", "session.execution.failed", "session.execution.interrupted"]
const FEED_EVENTS = ["session.created", "session.text.ended", "session.compaction.ended", ...ROUND_ENDS]
// How many of an orchestrator's latest user and assistant messages a refresh after compaction sends.
const REFRESH_MESSAGES = 20
const METADATA = { coordinator: true }

export default {
  id: "coordinator",

  async setup(ctx) {
    // The terminal UI loads the same entry without these services; its part is tui.js.
    if (typeof ctx?.tool?.hook !== "function" || typeof ctx?.tool?.transform !== "function") return

    const location = ctx.location?.directory ?? ""
    const locationRoot = location ? rootOf(location) : null
    const locationPlan = locationRoot ? planOf(location) : null

    const info = (sessionID) => ctx.session.get({ sessionID })
    const workspaceOf = async (sessionID) => {
      const session = await info(sessionID)
      const directory = session?.location?.directory
      const root = directory && rootOf(directory)
      if (!root) throw new Error("this session is not in a workspace")
      return { session, directory, root, plan: planOf(directory) }
    }
    // A note in a session's conversation that does not start a turn.
    const note = (sessionID, text) =>
      ctx.session.synthetic({ sessionID, text, description: "coordinator", resume: false })
    // A message that starts or queues a turn.
    const tell = (sessionID, text) => ctx.session.prompt({ sessionID, text, metadata: METADATA })

    // A deleted session cannot be read and yields null; any other failure is thrown.
    const existing = async (sessionID) => {
      try {
        return await info(sessionID)
      } catch (error) {
        if (!/not ?found/i.test(`${error?._tag ?? ""} ${error?.message ?? ""}`)) throw error
        return null
      }
    }

    // A coordinator session that was deleted or archived is replaced on the next link.
    const liveCoordinator = async (root) => {
      const { coordinator } = readLinks(root)
      if (!coordinator) return null
      const session = await existing(coordinator)
      return session && !session.time?.archived ? coordinator : null
    }

    const requireCoordinator = async (sessionID) => {
      const workspace = await workspaceOf(sessionID)
      if (workspace.session?.agent !== COORDINATOR_AGENT) throw new Error("only the coordinator session may do this")
      return workspace.root
    }

    const linkedPlan = async (sessionID) => {
      const { root } = await workspaceOf(sessionID)
      const plan = readLinks(root).linked[sessionID]
      if (!plan) throw new Error("this session is not linked to the coordinator; the user links it with /coordinator-link")
      return { root, plan }
    }

    // What this location's linked orchestrator did in the current round, sent at the round's end.
    // It is kept on disk, so a plugin reload in the middle of a round loses no report.
    const inbox = locationPlan ? readInbox(locationRoot, locationPlan) : { pending: [], children: {}, lastText: {} }
    const save = () => locationPlan && writeInbox(locationRoot, locationPlan, inbox)
    const addPending = (text) => {
      inbox.pending.push(text)
      save()
    }

    // A closed plan's folder moves to `PLANS/archive/`, so its orchestrator leaves the coordinator.
    // Returns whether the plan was closed.
    const closeIfArchived = async (root, plan) => {
      if (existsSync(path.join(planDir(root, plan), "full-plan.md"))) return false
      const orchestrator = sessionOfPlan(readLinks(root), plan)
      if (!orchestrator) return true
      unlinkSession(root, orchestrator)
      const coordinator = await liveCoordinator(root)
      if (coordinator) await tell(coordinator, `PLAN CLOSED: ${plan} is archived and no longer linked; drop it from your picture.`)
      return true
    }

    const flush = async (root, plan) => {
      if (await closeIfArchived(root, plan)) {
        inbox.pending = []
        save()
        return
      }
      const coordinator = await liveCoordinator(root)
      if (!coordinator) throw new Error(`the coordinator of ${root} is gone; link a session again to restart it`)
      const changes = await planChanges(root, plan)
      const removed = removedHolds(root, readHolds(root), plan).map(
        ({ pair, phase }) => `HELD PHASE REMOVED: ${plan}'s status table no longer lists phase ${phase} as a phase to implement; it is held in pair ${pair}.`,
      )
      const parts = [`FEED from ${plan}`, ...inbox.pending, ...removed, changes].filter(Boolean)
      await tell(coordinator, parts.join("\n\n"))
      inbox.pending = []
      save()
    }

    // After the coordinator's conversation is compacted, each worktree's instance sends it its plan
    // again: the whole full plan, its touched-files blocks and the orchestrator's last messages.
    const refresh = async (coordinator) => {
      const orchestrator = sessionOfPlan(readLinks(locationRoot), locationPlan)
      if (!orchestrator) return
      // Only the text of user and assistant messages counts, so the window never starts at a tool result.
      const messages = (await ctx.session.context({ sessionID: orchestrator }))
        .flatMap((message) => {
          const text = message.type === "user" ? message.text?.trim() : message.type === "assistant" ? assistantText(message) : ""
          return text ? [`${message.type === "user" ? "User" : "Orchestrator"}: ${text}`] : []
        })
        .slice(-REFRESH_MESSAGES)
      await note(
        coordinator,
        [
          `REFRESH after compaction: ${locationPlan} (orchestrator session ${orchestrator})`,
          planSnapshot(locationRoot, locationPlan),
          `The orchestrator's last ${messages.length} messages:\n\n${messages.join("\n\n")}`,
          `Armed holds:\n${describeHolds(readHolds(locationRoot))}`,
        ].join("\n\n"),
      )
    }

    // A session that was deleted or archived can never release its lock, and only the holder or its
    // parent may. The queue's sessions that ended are skipped the same way.
    const gone = async (sessionID) => {
      const session = await existing(sessionID)
      return !session || Boolean(session.time?.archived)
    }
    const liveWaiters = async (held) => {
      const waiters = []
      for (const waiter of Array.isArray(held.waiters) ? held.waiters : []) {
        if (!(await gone(waiter.holder))) waiters.push(waiter)
      }
      return waiters
    }
    const grant = (lock) =>
      tell(lock.holder, `LOCK GRANTED: "${lock.resource}" is yours now (since ${lock.since}: ${lock.reason}). Release it with lock_release when done.`)

    // Release every lock whose holder session is gone, handing it to the first live waiter, before
    // any lock is read, so an abandoned lock never blocks the workspace.
    const releaseAbandoned = async (root) => {
      for (const held of readLocks(root)) {
        if (!(await gone(held.holder))) continue
        const waiters = await liveWaiters(held)
        const next = waiters.shift() ?? null
        const { granted } = releaseLock(root, { resource: held.resource, caller: held.holder, next, waiters })
        if (granted) await grant(granted)
      }
    }

    // A shell command whose pattern a workspace locks is refused until the session, or one of its
    // ancestors, holds the lock. The two comments in the workspace settings are the refusal text.
    const refusedShell = async (event) => {
      const command = event.input?.command
      if (typeof command !== "string" || !command.trim()) return
      const session = await info(event.sessionID)
      const directory = session?.location?.directory
      const root = directory && rootOf(directory)
      if (!root) return
      // A checkout of the workflow repository itself has an instruction tree but is no workspace.
      if (!existsSync(path.join(root, "AGENT-INSTRUCTIONS", "LOCAL", "workspace.json"))) return
      const locked = readSettings(root).locked_commands ?? {}
      if (!Object.keys(locked).length) return
      const ancestors = []
      for (let parent = session?.parentID; parent; parent = (await info(parent))?.parentID) ancestors.push(parent)
      await releaseAbandoned(root)
      const locks = readLocks(root)
      const refused = []
      for (const [resource, entry] of Object.entries(locked)) {
        if (!entry.shell.some((pattern) => new RegExp(pattern).test(command))) continue
        const held = locks.find((lock) => lock.resource === resource)
        if (held && (held.holder === event.sessionID || ancestors.includes(held.holder))) continue
        if (held) {
          refused.push(
            `LOCK REQUIRED: "${resource}"\n${entry.comment_held}\nHeld by session ${held.holder} (plan ${held.plan ?? "none"}) since ${held.since}: ${held.reason}.`,
          )
        } else {
          refused.push(`LOCK REQUIRED: "${resource}"\n${entry.comment_free}`)
        }
      }
      if (refused.length) throw new Error(refused.join("\n\n"))
    }

    // In a plan every implementer starts through `phase_subagent`, which checks the holds and records
    // the phase on the child session. A plain subagent call may only send a follow-up to such a child.
    await ctx.tool.hook("execute.before", async (event) => {
      if (event.tool === "shell") {
        await refusedShell(event)
        return
      }
      if (!SUBAGENT_TOOLS.has(event.tool) || event.input?.agent !== HELD_AGENT) return
      const session = await info(event.sessionID)
      const directory = session?.location?.directory
      const root = directory && rootOf(directory)
      const plan = root && planOf(directory)
      if (!plan) return
      // A release session in the plan's worktree may start an implementer on the user's word; its
      // plan is closed, so no hold applies.
      if (session?.metadata?.workflowRole === "release") return
      const target = event.input.sessionID
      if (target && (await info(target))?.metadata?.phase) return
      // A thrown error refuses the call before the permission check; the caller reads the message.
      throw new Error(
        `start the phase-implementer of ${plan} with ${PHASE_TOOL} and the phase id; send further details ` +
          "to it afterwards with this tool and its sessionID.",
      )
    })

    // Each worktree's instance feeds its own plan and reminds its own sessions of their locks, so
    // no event is handled twice; every instance receives every session's events.
    const controller = new AbortController()
    const onEvent = async (event) => {
      const sessionID = event.data.sessionID
      const links = locationPlan ? readLinks(locationRoot) : { coordinator: null, linked: {} }
      const mine = links.linked[sessionID] === locationPlan
      if (event.type === "session.compaction.ended") {
        if (locationPlan && sessionID === links.coordinator) await refresh(sessionID)
        return
      }
      if (event.type === "session.created") {
        if (event.data.parentID && links.linked[event.data.parentID] === locationPlan) {
          inbox.children[sessionID] = { agent: event.data.agent, title: event.data.title, phase: event.data.metadata?.phase }
          save()
        }
        return
      }
      if (event.type === "session.text.ended") {
        if (mine || inbox.children[sessionID]) {
          inbox.lastText[sessionID] = event.data.text
          save()
        }
        return
      }
      const outcome = event.type.slice("session.execution.".length)
      const child = inbox.children[sessionID]
      if (child) {
        const report = inbox.lastText[sessionID] ?? "(no text)"
        const phase = child.phase ? ` for phase ${child.phase}` : ""
        inbox.pending.push(`Report from ${child.agent} "${child.title}"${phase} (${outcome}):\n${reportSummary(child.agent, report)}`)
        if (child.agent === "phase-implementer") {
          const unlisted = await unlistedFiles(locationRoot, locationPlan, location, report)
          if (unlisted?.length) {
            inbox.pending.push(`UNLISTED FILES: the ${locationPlan} implementer also changed ${unlisted.join(", ")}, which no touched-files block lists.`)
          }
        }
        delete inbox.lastText[sessionID]
        save()
      }
      if (mine) {
        inbox.pending.push(`The ${locationPlan} orchestrator ended its round (${outcome}) with:\n${inbox.lastText[sessionID] ?? "(no text)"}`)
        delete inbox.lastText[sessionID]
        save()
        await flush(locationRoot, locationPlan)
      }
      await remindLocks(sessionID)
    }
    const remindLocks = async (sessionID) => {
      const held = readLocks(locationRoot).filter((lock) => lock.holder === sessionID)
      if (!held.length) return
      const session = await info(sessionID)
      if (session?.location?.directory !== location) return
      const names = held.map((lock) => `"${lock.resource}"`).join(", ")
      const queued = held.reduce((count, lock) => count + (Array.isArray(lock.waiters) ? lock.waiters.length : 0), 0)
      const target = session.parentID ?? sessionID
      const whose = session.parentID ? `Your child session ${sessionID} (${session.agent}) finished a round and still holds` : "You still hold"
      const waiting = queued ? ` ${queued} session(s) are queued; releasing grants the first.` : ""
      await note(target, `LOCK REMINDER: ${whose} ${names}. Release each with lock_release as soon as the work that needs it is done.${waiting}`)
    }
    // A worktree whose plan was archived while no round of its orchestrator ended still holds the
    // link; its instance, which no longer finds the plan, closes it when it loads.
    const branch = locationRoot && !locationPlan ? branchOf(location) : null
    if (branch && sessionOfPlan(readLinks(locationRoot), branch)) {
      await closeIfArchived(locationRoot, branch).catch((error) => console.error(`coordinator: closing ${branch} failed: ${error.message}`))
    }

    if (locationRoot && typeof ctx.event?.subscribe === "function") {
      ;(async () => {
        // One event at a time: a child's report must be in the feed before its parent's round ends
        // and sends it.
        for await (const event of ctx.event.subscribe({ types: FEED_EVENTS, signal: controller.signal })) {
          try {
            await onEvent(event)
          } catch (error) {
            console.error(`coordinator: ${event.type} failed: ${error.message}`)
          }
        }
      })().catch((error) => {
        if (!controller.signal.aborted) console.error(`coordinator: event stream ended: ${error.message}`)
      })
    }

    // The `/orchestrators` dialog lists the linked orchestrators and acts on one. Each method
    // returns its outcome as a message, because a thrown error reaches the terminal UI without its text.
    const orchestrators = async ({ directory }) => {
      const root = rootOf(directory)
      if (!root) return { message: `${directory} is not in a workspace`, orchestrators: [] }
      if (path.resolve(directory) !== path.resolve(root)) {
        return { message: "run /orchestrators from the workspace root, not from a plan's worktree", orchestrators: [] }
      }
      const pairs = readHolds(root)
      const rows = []
      for (const [sessionID, plan] of Object.entries(readLinks(root).linked)) {
        const session = await existing(sessionID)
        const pair = pairOfPlan(pairs, plan)
        const side = pair && sidesOf(pair, plan).self
        rows.push({
          sessionID,
          plan,
          title: session ? (session.title ?? "") : "(deleted session)",
          // A session is busy when its last round started after its last idle moment.
          running: (session?.time?.busy ?? 0) > (session?.time?.idle ?? 0),
          hold: side ? `held before ${side.phase} in ${pair.pair}${side.reached ? ", reached" : ""}` : "no hold",
        })
      }
      return { message: rows.length ? `${rows.length} linked orchestrators` : "No orchestrator is linked.", orchestrators: rows }
    }
    const orchestratorAction = async ({ directory, sessionID, action }) => {
      try {
        const root = rootOf(directory)
        if (!root) throw new Error(`${directory} is not in a workspace`)
        if (path.resolve(directory) !== path.resolve(root)) throw new Error("run /orchestrators from the workspace root")
        const plan = readLinks(root).linked[sessionID]
        if (!plan) throw new Error(`session ${sessionID} is not linked`)
        if (action === "interrupt") {
          await ctx.session.interrupt({ sessionID })
          return { message: `Interrupted the ${plan} orchestrator.` }
        }
        // An unlinked plan is never fed or held, so a plan in an armed pair keeps its link.
        const pair = pairOfPlan(readHolds(root), plan)
        if (pair) throw new Error(`${plan} is in the armed pair ${pair.pair}; the coordinator releases it first`)
        unlinkSession(root, sessionID)
        if (action === "archive") await ctx.session.update({ sessionID, archived: true })
        return { message: `${action === "archive" ? "Archived and unlinked" : "Unlinked"} the ${plan} orchestrator.` }
      } catch (error) {
        return { message: `The ${action} failed: ${error.message}` }
      }
    }

    let rpc
    if (typeof ctx.rpc?.register === "function") rpc = await ctx.rpc.register(Coordinator, { orchestrators, orchestratorAction })

    const link = async (sessionID) => {
      const { root, plan, session } = await workspaceOf(sessionID)
      if (!plan) throw new Error("this session's worktree branch has no plan folder; link a plan orchestrator's session")
      if (session?.agent === COORDINATOR_AGENT) throw new Error("the coordinator cannot link itself")
      if (session?.metadata?.workflowRole === "release") {
        throw new Error("this session is the plan's release, not its orchestrator; link the plan orchestrator's session")
      }
      if (session?.metadata?.shadowOrchestrator) {
        throw new Error("this session is a shadow orchestrator, not the plan orchestrator; link the plan orchestrator's session")
      }
      const linked = sessionOfPlan(readLinks(root), plan)
      if (linked && linked !== sessionID) {
        const current = await existing(linked)
        if (current && !current.time?.archived) {
          throw new Error(`${plan} is already linked to session ${linked}; unlink it with /orchestrators first`)
        }
      }
      const settings = readSettings(root)
      let coordinator = await liveCoordinator(root)
      let started = false
      if (!coordinator) {
        const model = coordinatorModel(root)
        const created = await ctx.session.create({ title: "Coordinator", agent: COORDINATOR_AGENT, model, location: { directory: root } })
        coordinator = created?.id
        if (!coordinator) throw new Error("the coordinator session was not created")
        started = true
      }
      linkSession(root, sessionID, plan, coordinator)
      const intro = started
        ? [
            `You coordinate the plans of the workspace ${root}. The integration branch is ` +
              `${settings.integration}. Linked plans arrive as LINKED messages and their progress as FEED messages.`,
          ]
        : []
      await tell(
        coordinator,
        [...intro, `LINKED ${plan} (orchestrator session ${sessionID})`, planSnapshot(root, plan), `Armed holds:\n${describeHolds(readHolds(root))}`].join("\n\n"),
      )
      if (started && rpc?.events?.emit) await rpc.events.emit("started", { sessionID: coordinator })
      return `Linked plan ${plan} to the coordinator (session ${coordinator}${started ? ", started now" : ""}).`
    }

    await ctx.command.transform((editor) => {
      editor.add({
        name: "coordinator-link",
        description: "Link this plan orchestrator to the workspace's coordinator, starting the coordinator if needed",
        execute: async ({ sessionID }) => {
          let text
          try {
            text = await link(sessionID)
          } catch (error) {
            text = `The coordinator link failed: ${error.message}`
          }
          await note(sessionID, text)
        },
      })
    })

    const side = {
      type: "object",
      properties: {
        plan: { type: "string", description: "Plan name: its branch and its folder under AGENT-INSTRUCTIONS/PLANS/." },
        phase: { type: "string", description: "Id of the phase, from the plan's status table, whose implementer may not start yet." },
      },
      required: ["plan", "phase"],
      additionalProperties: false,
    }
    const tool = (name, description, properties, execute) => ({
      name,
      description,
      input: { type: "object", properties, required: Object.keys(properties), additionalProperties: false },
      execute: async (input, context) => ({ content: await execute(input, context.sessionID) }),
    })

    // Start the implementer of one phase of this location's plan, in the background like the plain
    // subagent tool. The prompt is built here, so the recorded phase is always the phase implemented.
    const startPhase = async ({ phase }, context) => {
      const { root, plan, session } = await workspaceOf(context.sessionID)
      if (plan !== locationPlan) throw new Error(`${PHASE_TOOL} runs only in a plan's worktree`)
      if (session?.metadata?.workflowRole !== "plan") {
        throw new Error(`${PHASE_TOOL} is for a plan orchestrator; start one with /plan`)
      }
      const pairs = readHolds(root)
      const held = holdFor(pairs, plan, phase)
      if (held) {
        if (markReached(root, plan)) addPending(`HOLD REACHED: ${plan} stopped before phase ${phase} (pair ${held.pair}).`)
        throw new Error(holdMessage(held, plan))
      }
      const status = phaseStatuses(root, plan)[phase]
      if (status === undefined) throw new Error(`${plan}'s status table has no phase ${phase}`)
      if (status !== "active") throw new Error(`phase ${phase} of ${plan} is ${status}; only the active phase is implemented`)
      const child = await resolveAgent(ctx, HELD_AGENT)
      await assertSubagentAllowed(ctx, child, context)
      const created = await ctx.session.create({ parentID: context.sessionID, agent: child.id, title: `Implement phase ${phase}`, metadata: { phase } })
      if (!created?.id) throw new Error(`the ${HELD_AGENT} session for phase ${phase} was not created`)
      addPending(`IMPLEMENTER STARTED: ${plan} phase ${phase} (session ${created.id}); a hold can no longer stop this phase.`)
      await ctx.session.prompt({
        sessionID: created.id,
        text:
          `Implement phase ${phase} of ${plan}. Read current authoritative files; no inherited context. ` +
          "Never use the question tool; return USER DECISION REQUIRED or BLOCKED instead.",
      })
      return {
        content:
          `Started the ${HELD_AGENT} for phase ${phase} of ${plan} in session ${created.id}; its report arrives when it ` +
          `finishes. Send it any further detail or requirement with the subagent tool, agent ${HELD_AGENT} and sessionID ${created.id}.`,
        metadata: { sessionID: created.id, phase },
      }
    }

    await ctx.tool.transform((editor) => {
      if (locationPlan) {
        editor.add({
          name: PHASE_TOOL,
          description:
            `Start the ${HELD_AGENT} of one phase of this plan in a background child session. Give only the phase id from the ` +
            "status table: the tool writes the implementer's prompt itself, and returns the child's sessionID. Send any further " +
            "detail, requirement or blocker context to the running or finished child afterwards with the subagent tool and that " +
            "sessionID. A coordinator hold refuses the start with a COORDINATOR HOLD error.",
          input: {
            type: "object",
            properties: { phase: { type: "string", description: "The active phase's id from the plan's status table, for example A2 or A2.1." } },
            required: ["phase"],
            additionalProperties: false,
          },
          options: { codemode: false },
          execute: startPhase,
        })
      }
      editor.add(
        tool(
          "hold_arm",
          "Coordinator only. Arm a hold pair from a HOOK SET verdict: both plans stop before their named phase's implementer starts. Both plans must be linked, each phase must be in its status table and not done, and a plan whose overlapping work is already implemented leads. Returns every armed hold.",
          {
            first: side,
            second: side,
            leading: { type: "string", description: "The leading plan, one of the two." },
            reason: { type: "string", description: "The verdict's reason, shown to both orchestrators." },
          },
          async (input, sessionID) => {
            const root = await requireCoordinator(sessionID)
            // The implementers each plan's worktree recorded starting, from that plan's inbox.
            const startedPhases = (plan) =>
              new Set(
                Object.values(readInbox(root, plan).children)
                  .filter((child) => child.agent === HELD_AGENT && child.phase)
                  .map((child) => child.phase),
              )
            const pair = armPair(root, input, Object.values(readLinks(root).linked), startedPhases)
            // Tell both orchestrators now: one that is idle would otherwise never reach its hold,
            // and the pair's channel opens only once both have.
            const links = readLinks(root)
            for (const [side, partner] of [
              [input.first, input.second],
              [input.second, input.first],
            ]) {
              const orchestrator = sessionOfPlan(links, side.plan)
              if (!orchestrator) continue
              await tell(
                orchestrator,
                `HOLD ARMED (pair ${pair}): phase ${side.phase} of ${side.plan} overlaps phase ${partner.phase} of ` +
                  `${partner.plan}: ${input.reason.trim()} ${input.leading === side.plan ? "You lead" : `${partner.plan} leads`} ` +
                  "the settlement. Continue your loop as usual up to the implementer start of your held phase and " +
                  "make that phase_subagent call even though you know it is held: its refusal records that you " +
                  "stopped, and the channel opens only once both plans did. Then follow the COORDINATOR HOLD message. " +
                  "This grants no decision authority.",
              )
            }
            return `Armed ${pair}; both orchestrators are told.\n${describeHolds(readHolds(root))}`
          },
        ),
      )
      editor.add(
        tool(
          "hold_release",
          "Coordinator only. Release one hold pair by its id. Returns every hold still armed.",
          { pair: { type: "string", description: "The pair id hold_arm returned." } },
          async ({ pair }, sessionID) => {
            const root = await requireCoordinator(sessionID)
            const record = readHolds(root).find((candidate) => candidate.pair === pair)
            releasePair(root, pair)
            // A held orchestrator waits for a message, so each side hears that its hold is gone.
            const links = readLinks(root)
            for (const side of record.sides) {
              const orchestrator = sessionOfPlan(links, side.plan)
              if (orchestrator) {
                await tell(orchestrator, `HOLD RELEASED (pair ${pair}): phase ${side.phase} of ${side.plan} is no longer held. Continue your loop.`)
              }
            }
            return `Released ${pair}; both orchestrators are told.\n${describeHolds(readHolds(root))}`
          },
        ),
      )
      editor.add(
        tool(
          "channel_open",
          "Coordinator only. Once both orchestrators of a pair reached their holds, open the pair's channel and tell the leading orchestrator to settle the overlap.",
          { pair: { type: "string", description: "The pair id." } },
          async ({ pair }, sessionID) => {
            const root = await requireCoordinator(sessionID)
            const record = openChannel(root, pair)
            const { self: leader, partner } = sidesOf(record, record.leading)
            const leaderSession = sessionOfPlan(readLinks(root), leader.plan)
            if (!leaderSession) throw new Error(`no session is linked for ${leader.plan}`)
            await tell(
              leaderSession,
              `CHANNEL OPEN (pair ${pair}): you lead the overlap between phase ${leader.phase} of ${leader.plan} and ` +
                `phase ${partner.phase} of ${partner.plan}: ${record.reason}. Settle it with the ${partner.plan} ` +
                `orchestrator through channel_send, write the agreed design to ${path.relative(root, sharedDesign(root, pair))}, ` +
                "follow the /plan resolution steps, and finish with channel_close.",
            )
            return `Opened the channel of ${pair}; ${leader.plan} leads.\n${describeHolds(readHolds(root))}`
          },
        ),
      )
      editor.add(
        tool(
          "channel_send",
          "Leading orchestrator of an open pair only. Send one message to the partner orchestrator and wait for its reply, which this call returns.",
          { text: { type: "string", description: "The message to the partner orchestrator." } },
          async ({ text }, sessionID) => {
            const { root, plan } = await linkedPlan(sessionID)
            const led = ledPair(readHolds(root), plan)
            if (!led) throw new Error("you lead no open channel; the coordinator opens one with CHANNEL OPEN")
            const { partner } = sidesOf(led, plan)
            const partnerSession = sessionOfPlan(readLinks(root), partner.plan)
            if (!partnerSession) throw new Error(`no session is linked for ${partner.plan}`)
            await tell(partnerSession, `CHANNEL from the ${plan} orchestrator (pair ${led.pair}). Answer in your reply:\n\n${text}`)
            await ctx.session.wait({ sessionID: partnerSession })
            const { idle, assistant } = lastRound(await ctx.session.context({ sessionID: partnerSession }))
            if (!idle || idle.outcome !== "succeeded") {
              throw new Error(`the ${partner.plan} orchestrator's round ended with ${idle?.outcome ?? "no outcome"}: ${errorText(idle?.error ?? assistant?.error)}`)
            }
            return assistantText(assistant) || "(the partner replied with no text)"
          },
        ),
      )
      editor.add(
        tool(
          "channel_notify",
          "Partner orchestrator of an open pair only. Send one message to the leading orchestrator without waiting for a reply, for example that your resolution phase file is ready or that I answered a question. The leader reads it in its next turn.",
          { text: { type: "string", description: "The message to the leading orchestrator." } },
          async ({ text }, sessionID) => {
            const { root, plan } = await linkedPlan(sessionID)
            const pairs = readHolds(root)
            const open = pairOfPlan(pairs, plan)
            if (!open?.channel || open.leading === plan) throw new Error("you are the partner of no open channel")
            const leaderSession = sessionOfPlan(readLinks(root), open.leading)
            if (!leaderSession) throw new Error(`no session is linked for ${open.leading}`)
            await tell(leaderSession, `CHANNEL NOTE from the ${plan} orchestrator (pair ${open.pair}):\n\n${text}`)
            return `Sent to the ${open.leading} orchestrator.`
          },
        ),
      )
      editor.add(
        tool(
          "channel_close",
          "Leading orchestrator of an open pair only. End the conflict once both resolution phase files passed your acceptance check: release the pair's holds and send the partner its RESOLVED message. The channel is gone afterwards.",
          { message: { type: "string", description: "For the partner: its resolution phase file and what to do next." } },
          async ({ message }, sessionID) => {
            const { root, plan } = await linkedPlan(sessionID)
            const led = ledPair(readHolds(root), plan)
            if (!led) throw new Error("you lead no open channel")
            const { pair } = led
            const { partner } = sidesOf(led, plan)
            // The leader's one advancer writes both resolution phases. Refuse to settle a pair that
            // only has one of them, so a leader cannot close while waiting on a partner that never
            // writes its own file.
            for (const side of led.sides) {
              const resolution = `${side.phase}r`
              const status = phaseStatuses(root, side.plan)[resolution]
              if (status !== "active" && status !== "done") {
                throw new Error(
                  `the ${side.plan} resolution phase ${resolution} is ${status ?? "missing"} in its status table; ` +
                    "the leader's one phase-advancer writes both resolution phases before channel_close",
                )
              }
            }
            const links = readLinks(root)
            releasePair(root, pair)
            const partnerSession = sessionOfPlan(links, partner.plan)
            if (partnerSession) await tell(partnerSession, `RESOLVED (pair ${pair}) by the ${plan} orchestrator:\n\n${message}`)
            const coordinator = await liveCoordinator(root)
            if (coordinator) await tell(coordinator, `PAIR RESOLVED: ${pair}, closed by ${plan}; its holds are released.\n${describeHolds(readHolds(root))}`)
            return `Closed ${pair}; both holds are released and ${partner.plan} has its RESOLVED message.`
          },
        ),
      )
      editor.add(
        tool(
          "lock_take",
          "Lock one of the workspace's shared resources before using it. Fails, naming the holder, when another session holds it; then queue with lock_request or wait.",
          {
            resource: { type: "string", description: "Resource name from the workspace settings." },
            reason: { type: "string", description: "What the lock is for." },
          },
          async ({ resource, reason }, sessionID) => {
            const { root, plan, session } = await workspaceOf(sessionID)
            const ancestors = []
            for (let parent = session?.parentID; parent; parent = (await info(parent))?.parentID) ancestors.push(parent)
            await releaseAbandoned(root)
            const lock = takeLock(root, { resource, holder: sessionID, ancestors, plan, reason })
            if (lock.holder !== sessionID) {
              return `Granted: you may use "${lock.resource}" now, under the lock your parent session ${lock.holder} holds. That session releases it.`
            }
            return `Locked "${lock.resource}" since ${lock.since}. Release it with lock_release when done.`
          },
        ),
      )
      editor.add(
        tool(
          "lock_request",
          "Take a shared resource, or queue for it when another session holds it. The lock transfers to the first waiting session when it is released, and that session is woken with LOCK GRANTED.",
          {
            resource: { type: "string", description: "Resource name from the workspace settings." },
            reason: { type: "string", description: "What the lock is for." },
          },
          async ({ resource, reason }, sessionID) => {
            const { root, plan, session } = await workspaceOf(sessionID)
            const ancestors = []
            for (let parent = session?.parentID; parent; parent = (await info(parent))?.parentID) ancestors.push(parent)
            await releaseAbandoned(root)
            const result = requestLock(root, { resource, holder: sessionID, ancestors, plan, reason })
            if (result.kind === "taken") {
              return `Locked "${result.lock.resource}" since ${result.lock.since}. Release it with lock_release when done.`
            }
            if (result.kind === "held") {
              if (result.lock.holder === sessionID) return `You already hold "${result.lock.resource}" since ${result.lock.since}.`
              return `Granted: you may use "${result.lock.resource}" now, under the lock your parent session ${result.lock.holder} holds. That session releases it.`
            }
            const holder = result.lock
            return (
              `Queued for "${resource}" behind session ${holder.holder} (plan ${holder.plan ?? "none"}) since ${holder.since}: ${holder.reason}. ` +
              `You are position ${result.position}; you will be woken with LOCK GRANTED when it is released.`
            )
          },
        ),
      )
      editor.add(
        tool(
          "lock_release",
          "Release a resource lock this session or one of its children holds. The first waiting session receives it.",
          { resource: { type: "string", description: "Resource name." } },
          async ({ resource }, sessionID) => {
            const { root } = await workspaceOf(sessionID)
            await releaseAbandoned(root)
            const held = readLocks(root).find((lock) => lock.resource === resource)
            const holderParent = held ? (await info(held.holder))?.parentID : undefined
            const waiters = held ? await liveWaiters(held) : []
            const next = waiters.shift() ?? null
            const { granted } = releaseLock(root, { resource, caller: sessionID, holderParent, next, waiters })
            if (!granted) return `Released "${resource}".`
            await grant(granted)
            return `Released "${resource}"; granted to session ${granted.holder}.`
          },
        ),
      )
      editor.add(
        tool("lock_list", "List the workspace's resource locks.", {}, async (_input, sessionID) => {
          const { root } = await workspaceOf(sessionID)
          await releaseAbandoned(root)
          return describeLocks(readLocks(root))
        }),
      )
    })

    return () => controller.abort()
  },
}
