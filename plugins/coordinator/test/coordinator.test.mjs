// Verify the coordinator plugin against a real workspace layout and a mock OpenCode context.
import { execFileSync } from "node:child_process"
import { mkdirSync, mkdtempSync, renameSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

import plugin from "../index.js"
import { holdsFile, readHolds } from "../holds.js"
import { readInbox } from "../inbox.js"
import { readLinks } from "../state.js"

let passed = 0
let failed = 0
function check(name, condition, extra = "") {
  if (condition) {
    passed++
    console.log("ok   " + name)
  } else {
    failed++
    console.log("FAIL " + name + (extra ? "  -> " + extra : ""))
  }
}

// A workspace root with three plans, its settings and one worktree per branch.
const root = mkdtempSync(path.join(tmpdir(), "coord-"))
const write = (relative, text) => {
  const file = path.join(root, relative)
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, text)
}
// A full plan with a phase status table of [phase id, status] rows.
const plan = (name, rows) =>
  write(
    `AGENT-INSTRUCTIONS/PLANS/${name}/full-plan.md`,
    `# ${name}\n\n## Phase status\n\n| Phase | Title | Status | Phase file |\n|---|---|---|---|\n` +
      rows.map(([phase, status]) => `| ${phase} | Work | ${status} | - |`).join("\n") +
      "\n\n## Binding design rules\n\n- One rule.\n",
  )
plan("plan-a", [["A1", "active"], ["A2", "planned"], ["A3", "planned"], ["A4", "planned"], ["A5", "not applicable"]])
plan("plan-b", [["B1", "active"], ["B2", "planned"]])
plan("plan-c", [["C1", "active"]])
write(
  "AGENT-INSTRUCTIONS/PLANS/plan-a/phases/A2-x.md",
  "## Phase A2\n\n**Touched files:**\n<!-- touched-files:start -->\n- `hit.py` - changed: material\n<!-- touched-files:end -->\n",
)
write(
  "AGENT-INSTRUCTIONS/LOCAL/models.json",
  JSON.stringify({
    opencode: { coordinator: { model: "prov/coordinator-model", variant: "low" } },
    sessions: {},
  }),
)
write(
  "AGENT-INSTRUCTIONS/LOCAL/workspace.json",
  JSON.stringify({
    integration: "main",
    resources: ["private instance", "worker"],
    locked_commands: {
      "private instance": {
        comment_free: 'The private instance lock is free. Take it with lock_take "private instance" "<reason>", then run the command again.',
        comment_held: 'The private instance lock is held by another session. Queue with lock_request "private instance" "<reason>".',
        shell: ["deploy-private-instance"],
      },
      worker: {
        comment_free: 'The worker lock is free. Take it with lock_take "worker" "<reason>", then run the command again.',
        comment_held: 'The worker lock is held by another session. Queue with lock_request "worker" "<reason>".',
        shell: ["deploy-private-instance"],
      },
    },
  }),
)
const worktree = (branch) => {
  const directory = path.join(root, branch)
  mkdirSync(directory)
  execFileSync("git", ["-C", directory, "init", "-q", "-b", branch])
  symlinkSync(path.join(root, "AGENT-INSTRUCTIONS"), path.join(directory, "AGENT-INSTRUCTIONS"))
  return directory
}
const directories = { "plan-a": worktree("plan-a"), "plan-b": worktree("plan-b"), "plan-c": worktree("plan-c"), main: worktree("main"), root }
// A checkout of the workflow repository itself: an instruction tree, but no workspace settings.
const workflowCheckout = mkdtempSync(path.join(tmpdir(), "workflow-checkout-"))
mkdirSync(path.join(workflowCheckout, "AGENT-INSTRUCTIONS"))
directories.repo = workflowCheckout

// A controllable event stream that, like OpenCode's, delivers every event to every subscriber.
const subscribers = []
const emit = (event) => {
  for (const subscriber of subscribers) {
    subscriber.queue.push(event)
    subscriber.wake?.()
  }
}
async function* stream(signal) {
  const subscriber = { queue: [] }
  subscribers.push(subscriber)
  while (!signal.aborted) {
    while (subscriber.queue.length && !signal.aborted) yield subscriber.queue.shift()
    await new Promise((resolve) => (subscriber.wake = resolve))
  }
}
// Wait for the round-end handler. A check that reads what the handler sent passes the state it
// waits for, so the wait never depends on how fast the runner is; without one it is a short drain.
const settle = async (done) => {
  if (!done) {
    await new Promise((resolve) => setTimeout(resolve, 50))
    return
  }
  const deadline = Date.now() + 3000
  while (!done()) {
    if (Date.now() > deadline) throw new Error("the round-end handler did not reach the state within 3 s")
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
}
const feedsFrom = (plan) => prompts.filter((prompt) => prompt.text.startsWith(`FEED from ${plan}`))

const sessions = new Map()
const prompts = []
const notes = []
const replies = new Map()
const contexts = new Map()
const emitted = []
const permissions = []
const interrupted = []
let rpcHandlers
let created = 0
const session = (id, where, extra = {}) => sessions.set(id, { id, agent: "build", location: { directory: directories[where] }, ...extra })

const setup = async (where) => {
  const tools = {}
  const commands = {}
  let before
  const ctx = {
    location: { directory: directories[where] },
    session: {
      get: async ({ sessionID }) => {
        if (!sessions.has(sessionID)) throw Object.assign(new Error(`Session not found: ${sessionID}`), { _tag: "SessionNotFoundError" })
        return sessions.get(sessionID)
      },
      create: async (input) => {
        const id = `${input.parentID ? "child" : "coord"}-${++created}`
        const parent = input.parentID && sessions.get(input.parentID)
        sessions.set(id, { id, ...input, location: input.location ?? parent?.location })
        return { id }
      },
      prompt: async (input) => prompts.push(input),
      interrupt: async ({ sessionID }) => interrupted.push(sessionID),
      update: async ({ sessionID, archived }) => Object.assign(sessions.get(sessionID), { time: { ...sessions.get(sessionID).time, archived: archived ? 1 : undefined } }),
      synthetic: async (input) => notes.push(input),
      wait: async () => {},
      context: async ({ sessionID }) =>
        contexts.get(sessionID) ?? [
          { type: "assistant", content: [{ type: "text", text: replies.get(sessionID) ?? "" }] },
          { type: "idle", outcome: "succeeded" },
        ],
    },
    tool: {
      hook: async (name, callback) => {
        if (name === "execute.before") before = callback
        return { dispose: async () => {} }
      },
      transform: async (callback) => {
        callback({ add: (tool) => (tools[tool.name] = tool) })
        return { dispose: async () => {} }
      },
    },
    command: {
      transform: async (callback) => {
        callback({ add: (command) => (commands[command.name] = command) })
        return { dispose: async () => {} }
      },
    },
    agent: { list: async () => ({ data: [{ id: "phase-implementer" }, { id: "phase-advancer" }] }) },
    permission: { assert: async (input) => permissions.push(input) },
    event: { subscribe: ({ signal }) => stream(signal) },
    rpc: {
      register: async (_definition, handlers) => {
        rpcHandlers = handlers
        return { events: { emit: async (name, data) => emitted.push({ name, data }) } }
      },
    },
  }
  const dispose = await plugin.setup(ctx)
  const call = async (name, input, sessionID) => {
    try {
      return (await tools[name].execute(input, { sessionID, agent: "plan", messageID: "msg", id: "call" })).content
    } catch (error) {
      return `ERROR ${error.message}`
    }
  }
  const start = async (sessionID, input, tool = "subagent") => {
    try {
      await before({ tool, sessionID, input })
      return null
    } catch (error) {
      return error.message
    }
  }
  return { tools, commands, call, start, dispose }
}

session("orch-a", "plan-a", { metadata: { workflowRole: "plan" } })
session("orch-b", "plan-b", { metadata: { workflowRole: "plan" } })
session("orch-c", "plan-c", { metadata: { workflowRole: "plan" } })
session("plain-a", "plan-a")
session("rel-a", "plan-a", { metadata: { workflowRole: "release" } })
session("shadow-a", "plan-a", { metadata: { shadowOrchestrator: true } })
session("release", "main")
const a = await setup("plan-a")
const b = await setup("plan-b")
check("registers the link command and every tool", a.commands["coordinator-link"] && ["phase_subagent", "hold_arm", "hold_release", "channel_open", "channel_send", "channel_notify", "channel_close", "lock_take", "lock_release", "lock_list"].every((name) => a.tools[name]))
const rootInstance = await setup("root")
check("offers phase_subagent only in a plan's worktree", !rootInstance.tools.phase_subagent && rootInstance.tools.hold_arm)
rootInstance.dispose()

// Linking.
await a.commands["coordinator-link"].execute({ sessionID: "orch-a" })
const coordinator = readLinks(root).coordinator
check("the first link starts a coordinator in the root", sessions.get(coordinator)?.agent === "coordinator" && sessions.get(coordinator).location.directory === root)
check("the coordinator starts on its configured model", JSON.stringify(sessions.get(coordinator)?.model) === JSON.stringify({ providerID: "prov", id: "coordinator-model", variant: "low" }))
check("the terminal UI is told to open it", emitted.at(-1)?.data.sessionID === coordinator)
const linkedMessage = prompts.at(-1)
check("the coordinator receives the plan once", linkedMessage.sessionID === coordinator && linkedMessage.text.includes("LINKED plan-a") && linkedMessage.text.includes("| A1 | Work | active | - |"))
check("the link message carries the touched files and the integration branch", linkedMessage.text.includes("`hit.py` - changed: material") && linkedMessage.text.includes("integration branch is main"))
check("the orchestrator is told it is linked", notes.at(-1)?.text.startsWith("Linked plan plan-a"))
await b.commands["coordinator-link"].execute({ sessionID: "orch-b" })
check("a second link reuses the coordinator", readLinks(root).coordinator === coordinator && emitted.length === 1)
await a.commands["coordinator-link"].execute({ sessionID: "release" })
check("a session without a plan cannot be linked", notes.at(-1)?.text.includes("has no plan folder"))

// The feed: one message per orchestrator round, with child reports and plan changes.
const before = prompts.length
emit({ type: "session.created", data: { sessionID: "child-1", parentID: "orch-a", agent: "phase-advancer", title: "Detail A3" } })
emit({ type: "session.text.ended", data: { sessionID: "child-1", text: "DETAIL READY for A3" } })
emit({ type: "session.execution.succeeded", data: { sessionID: "child-1" } })
await settle()
check("a child's report waits for its orchestrator's round", prompts.length === before)
plan("plan-a", [["A1", "done"], ["A2", "active"], ["A3", "planned"], ["A4", "planned"], ["A5", "not applicable"]])
write(
  "AGENT-INSTRUCTIONS/PLANS/plan-a/phases/A3-y.md",
  "## Phase A3\n\n**Touched files:**\n<!-- touched-files:start -->\n- `render.py` - changed: scatter\n<!-- touched-files:end -->\n",
)
emit({ type: "session.text.ended", data: { sessionID: "orch-a", text: "Phase A3 is detailed; starting its implementer." } })
emit({ type: "session.execution.succeeded", data: { sessionID: "orch-a" } })
await settle(() => prompts.slice(before).some((prompt) => prompt.text.startsWith("FEED from plan-a")))
const feeds = prompts.slice(before).filter((prompt) => prompt.text.startsWith("FEED from plan-a"))
check("plan-a's worktree sends one feed per round", feeds.length === 1, prompts.slice(before).map((prompt) => prompt.text.slice(0, 30)).join(" | "))
const feed = feeds[0]?.text ?? ""
check("the feed carries the child's report", feed.includes('Report from phase-advancer "Detail A3" (succeeded):\nDETAIL READY for A3'))
check("the feed carries the orchestrator's message", feed.includes("starting its implementer"))
check("the feed carries the plan diff, not the whole plan", feed.includes("-| A1 | Work | active | - |") && feed.includes("+| A1 | Work | done | - |") && !feed.includes("Full plan of"))
check("the feed carries only the new touched-files block", feed.includes("`render.py` - changed: scatter") && !feed.includes("`hit.py`"))
const feedsBefore = feedsFrom("plan-a").length
emit({ type: "session.execution.succeeded", data: { sessionID: "orch-a" } })
await settle(() => feedsFrom("plan-a").length > feedsBefore)
check("an unchanged plan adds no plan section", !prompts.at(-1).text.includes("Change to the full plan"))

// Shortened reports and files no touched-files block lists.
const g = (...args) => execFileSync("git", ["-C", directories["plan-a"], "-c", "user.email=t@t", "-c", "user.name=t", ...args], { encoding: "utf8" }).trim()
writeFileSync(path.join(directories["plan-a"], "render.py"), "base\n")
g("add", "render.py")
g("commit", "-q", "-m", "base")
const base = g("rev-parse", "HEAD")
writeFileSync(path.join(directories["plan-a"], "render.py"), "changed\n")
writeFileSync(path.join(directories["plan-a"], "lib.rs"), "mod x;\n")
g("add", "render.py", "lib.rs")
g("commit", "-q", "-m", "head")
const head = g("rev-parse", "HEAD")
const receipt = [
  "Summary of the work, long narration the coordinator does not need.",
  "VERIFICATION RECEIPT",
  `REVISION: ${base}..${head}`,
  "TEST BUDGET: 1/0",
  "PASS: cargo test - 9 passed",
  "REVIEW: 1 - abc - no real finding",
  "",
  "RELEVANT COMMENTS FOR ADVANCER",
  "Changed the scatter signature.",
  "",
  "USER-SPECIFIC TEST",
  "NOT REQUIRED",
].join("\n")
const verdict = ["MODE: REVIEW AND ADVANCE", "PHASE VERDICT: COMPLETE", "FINISHED PHASE: A3 done", "NEXT UNIT: Z1", "VERIFICATION ACTION: REUSED receipt", "ORCHESTRATOR COMMENTS: NONE"].join("\n")
const childRound = (id, agent, text, metadata) => {
  emit({ type: "session.created", data: { sessionID: id, parentID: "orch-a", agent, title: id, metadata } })
  emit({ type: "session.text.ended", data: { sessionID: id, text } })
  emit({ type: "session.execution.succeeded", data: { sessionID: id } })
}
childRound("impl-1", "phase-implementer", receipt, { phase: "A2" })
childRound("adv-1", "phase-advancer", verdict)
childRound("scout-1", "ops-scout", "a long map of the code")
const reportsBefore = feedsFrom("plan-a").length
emit({ type: "session.execution.succeeded", data: { sessionID: "orch-a" } })
await settle(() => feedsFrom("plan-a").length > reportsBefore)
const shortFeed = feedsFrom("plan-a").at(-1).text
check("an implementer report names the phase recorded on its session", shortFeed.includes('Report from phase-implementer "impl-1" for phase A2 (succeeded)'))
check("a report without a recorded phase names none", shortFeed.includes('Report from phase-advancer "adv-1" (succeeded)'))
check("an implementer report keeps its revision, comments and user test", shortFeed.includes(`REVISION: ${base}..${head}`) && shortFeed.includes("Comments: Changed the scatter signature.") && shortFeed.includes("User test: NOT REQUIRED"))
check("an implementer report drops its narration and test lines", !shortFeed.includes("long narration") && !shortFeed.includes("cargo test"))
check("an advancer report keeps its verdict fields only", shortFeed.includes("PHASE VERDICT: COMPLETE") && shortFeed.includes("NEXT UNIT: Z1") && !shortFeed.includes("VERIFICATION ACTION"))
check("a scout report is only named", shortFeed.includes('Report from ops-scout "scout-1" (succeeded):\n(report not forwarded)') && !shortFeed.includes("long map"))
check("reports a changed file no touched-files block lists", shortFeed.includes("UNLISTED FILES: the plan-a implementer also changed lib.rs,"))
check("a listed file is not reported", !/UNLISTED FILES[^\n]*render\.py/.test(shortFeed))

// Implementer starts: phase_subagent records the phase on the child; a plain start is refused.
const plain = { agent: "phase-implementer", description: "x", prompt: "Implement phase A2 of plan-a." }
check("refuses a plain implementer start in a plan, pointing at phase_subagent", (await a.start("orch-a", plain))?.includes("with phase_subagent and the phase id"))
check("refuses a plain start through the waiting subagent tool too", (await a.start("orch-a", plain, "subagent_foreground")) !== null)
check("lets other roles start plainly", (await a.start("orch-a", { agent: "phase-advancer", prompt: "DETAIL ACTIVE: phase A3 of plan-a" })) === null)
check("does not refuse a session without a plan", (await a.start("release", plain)) === null)
const started = await a.call("phase_subagent", { phase: "A2" }, "orch-a")
const implementer = [...sessions.values()].find((entry) => entry.parentID === "orch-a" && entry.metadata?.phase === "A2")
check("starts the active phase's implementer as a child with the phase on its session", implementer?.agent === "phase-implementer" && started.includes(`session ${implementer.id}`), started)
check("writes the implementer's prompt from the phase id", prompts.at(-1).sessionID === implementer?.id && prompts.at(-1).text.startsWith("Implement phase A2 of plan-a.") && prompts.at(-1).text.includes("Never use the question tool"))
const startedBefore = feedsFrom("plan-a").length
emit({ type: "session.execution.succeeded", data: { sessionID: "orch-a" } })
await settle(() => feedsFrom("plan-a").length > startedBefore)
check("the next feed reports the started implementer", prompts.at(-1).text.includes(`IMPLEMENTER STARTED: plan-a phase A2 (session ${implementer?.id})`))
check("authorizes the child like the subagent tool", permissions.at(-1)?.action === "subagent" && permissions.at(-1).resources[0] === "phase-implementer")
check("lets a follow-up reach a child phase_subagent started", (await a.start("orch-a", { ...plain, sessionID: implementer?.id })) === null)
check("refuses a follow-up to a session without a recorded phase", (await a.start("orch-a", { ...plain, sessionID: "orch-b" })) !== null)
check("refuses phase_subagent from a session without the plan role", (await a.call("phase_subagent", { phase: "A2" }, "plain-a")).includes("for a plan orchestrator"))
check("refuses phase_subagent from the release session", (await a.call("phase_subagent", { phase: "A2" }, "rel-a")).includes("for a plan orchestrator"))
check("a release session may start a plain implementer", (await a.start("rel-a", plain)) === null)
check("a session without a role may not", (await a.start("plain-a", plain)) !== null)
check("refuses to link the release session as the orchestrator", (await a.commands["coordinator-link"].execute({ sessionID: "rel-a" }), notes.at(-1)?.text.includes("release, not its orchestrator")))
check("refuses to link a shadow orchestrator session", (await a.commands["coordinator-link"].execute({ sessionID: "shadow-a" }), notes.at(-1)?.text.includes("shadow orchestrator, not the plan orchestrator")))
check("refuses a phase the status table does not list", (await a.call("phase_subagent", { phase: "A9" }, "orch-a")).includes("has no phase A9"))
check("refuses a phase that is not active", (await a.call("phase_subagent", { phase: "A3" }, "orch-a")).includes("A3 of plan-a is planned"))

// Holds and the channel.
const arm = { first: { plan: "plan-a", phase: "A3" }, second: { plan: "plan-b", phase: "B1" }, leading: "plan-a", reason: "both change the hit record" }
check("an orchestrator cannot arm a hold", (await a.call("hold_arm", arm, "orch-a")).includes("only the coordinator"))
check("refuses a plan that is not linked", (await a.call("hold_arm", { ...arm, second: { plan: "plan-c", phase: "C1" } }, coordinator)).includes("plan-c is not linked"))
check("refuses a phase the status table does not list", (await a.call("hold_arm", { ...arm, first: { plan: "plan-a", phase: "A9" } }, coordinator)).includes("has no phase A9"))
check("refuses a done phase", (await a.call("hold_arm", { ...arm, first: { plan: "plan-a", phase: "A1" } }, coordinator)).includes("A1 of plan-a is done"))
check("refuses a not applicable phase", (await a.call("hold_arm", { ...arm, first: { plan: "plan-a", phase: "A5" } }, coordinator)).includes("A5 of plan-a is not applicable"))
const armed = await a.call("hold_arm", arm, coordinator)
check("the coordinator arms a pair", armed.startsWith("Armed plan-a-A3+plan-b-B1") && armed.includes("plan-a held before phase A3 (leading)"), armed)
check("stores one record per pair", readHolds(root).length === 1 && readHolds(root)[0].sides.length === 2)
const told = prompts.slice(-2)
check("arming tells both orchestrators, waking an idle one", told.map((prompt) => prompt.sessionID).sort().join() === "orch-a,orch-b" && told.every((prompt) => prompt.text.startsWith("HOLD ARMED")))
check(
  "the hold message names the partner phase, the reason and the leader",
  told.find((prompt) => prompt.sessionID === "orch-b")?.text.includes("phase B1 of plan-b overlaps phase A3 of plan-a: both change the hit record plan-a leads"),
)
plan("plan-a", [["A1", "done"], ["A2", "done"], ["A3", "active"], ["A4", "planned"], ["A5", "not applicable"]])
const refused = await a.call("phase_subagent", { phase: "A3" }, "orch-a")
check("refuses the held phase's implementer and names the partner", refused.startsWith("ERROR COORDINATOR HOLD") && refused.includes("phase B1 of plan-b"), refused)
check("cannot open the channel before both stopped", (await a.call("channel_open", { pair: "plan-a-A3+plan-b-B1" }, coordinator)).includes("plan-b has not reached"))
const reachedBefore = feedsFrom("plan-a").length
emit({ type: "session.execution.succeeded", data: { sessionID: "orch-a" } })
await settle(() => feedsFrom("plan-a").length > reachedBefore)
check("the next feed reports the reached hold", prompts.at(-1).text.includes("HOLD REACHED: plan-a stopped before phase A3"))
await b.call("phase_subagent", { phase: "B1" }, "orch-b")
const opened = await a.call("channel_open", { pair: "plan-a-A3+plan-b-B1" }, coordinator)
check("opens the channel once both stopped", opened.includes("plan-a leads") && prompts.at(-1).sessionID === "orch-a" && prompts.at(-1).text.startsWith("CHANNEL OPEN"), opened)
check("the leader is told the one shared design file", prompts.at(-1).text.includes("AGENT-INSTRUCTIONS/PLANS/shared/plan-a-A3+plan-b-B1.md"))
check("the partner cannot use the channel", (await b.call("channel_send", { text: "hi" }, "orch-b")).includes("lead no open channel"))
replies.set("orch-b", "B1 keeps uv on the record; add material after it.")
const reply = await a.call("channel_send", { text: "Which fields does B1 need?" }, "orch-a")
check("the leader's message reaches the partner", prompts.at(-1).sessionID === "orch-b" && prompts.at(-1).text.includes("Which fields does B1 need?"))
check("the leader gets the partner's reply", reply === "B1 keeps uv on the record; add material after it.", reply)
check("the leader cannot notify itself", (await a.call("channel_notify", { text: "x" }, "orch-a")).includes("partner of no open channel"))
const notified = await b.call("channel_notify", { text: "B1r is detailed." }, "orch-b")
check("the partner notifies the leader without waiting", notified === "Sent to the plan-a orchestrator." && prompts.at(-1).sessionID === "orch-a" && prompts.at(-1).text.includes("CHANNEL NOTE from the plan-b orchestrator") && prompts.at(-1).text.includes("B1r is detailed."))
const premature = await a.call("channel_close", { message: "Implement phases/B1r-shared-hit-record.md." }, "orch-a")
check("refuses to close without both resolution phases", premature.includes("resolution phase A3r") && premature.includes("phase-advancer writes both"), premature)
plan("plan-a", [["A1", "done"], ["A2", "done"], ["A3", "active"], ["A3r", "active"], ["A4", "planned"], ["A5", "not applicable"]])
plan("plan-b", [["B1", "active"], ["B1r", "active"], ["B2", "planned"]])
const closed = await a.call("channel_close", { message: "Implement phases/B1r-shared-hit-record.md." }, "orch-a")
check("closing releases both holds", closed.startsWith("Closed plan-a-A3+plan-b-B1") && readHolds(root).length === 0, closed)
check("the partner gets its RESOLVED message", prompts.some((prompt) => prompt.sessionID === "orch-b" && prompt.text.startsWith("RESOLVED (pair plan-a-A3+plan-b-B1)")))
check("the coordinator hears the pair resolved", prompts.at(-1).sessionID === coordinator && prompts.at(-1).text.startsWith("PAIR RESOLVED"))
check("the channel is gone afterwards", (await a.call("channel_send", { text: "hi" }, "orch-a")).includes("lead no open channel"))
check("a released hold lets the phase start", (await a.call("phase_subagent", { phase: "A3" }, "orch-a")).startsWith("Started the phase-implementer for phase A3"))

await a.commands["coordinator-link"].execute({ sessionID: "orch-c" })
await a.call("hold_arm", arm, coordinator)
check("refuses a second pair for a held plan", (await a.call("hold_arm", { ...arm, second: { plan: "plan-c", phase: "C1" } }, coordinator)).includes("already held"))
check("refuses an unknown plan", (await a.call("hold_arm", { ...arm, first: { plan: "plan-x", phase: "X1" } }, coordinator)).includes("plan-x is not linked"))
plan("plan-a", [["A1", "done"], ["A2", "done"], ["A3.1", "active"], ["A3.2", "planned"], ["A4", "planned"], ["A5", "not applicable"]])
const removedBefore = feedsFrom("plan-a").length
emit({ type: "session.execution.succeeded", data: { sessionID: "orch-a" } })
await settle(() => feedsFrom("plan-a").length > removedBefore)
check("reports a held phase that left the status table", prompts.at(-1).text.includes("HELD PHASE REMOVED: plan-a's status table no longer lists phase A3"), prompts.at(-1).text)
check("the coordinator releases a pair", (await a.call("hold_release", { pair: "plan-a-A3+plan-b-B1" }, coordinator)).includes("No holds are armed."))
check(
  "releasing tells both orchestrators",
  prompts.slice(-2).map((prompt) => prompt.sessionID).sort().join() === "orch-a,orch-b" && prompts.slice(-2).every((prompt) => prompt.text.startsWith("HOLD RELEASED (pair plan-a-A3+plan-b-B1)")),
)
check("releasing an unknown pair fails", (await a.call("hold_release", { pair: "plan-a-A3+plan-b-B1" }, coordinator)).includes("no armed pair"))
plan("plan-a", [["A1", "done"], ["A2", "done"], ["A3", "active"], ["A3.2.1", "planned"], ["A4", "planned"], ["A5", "not applicable"]])
write("AGENT-INSTRUCTIONS/PLANS/shared/plan-a-A3+plan-b-B1.md", "design\n")
check("a settled pair cannot be armed again", (await a.call("hold_arm", arm, coordinator)).includes("already settled"))
check("holds a nested split phase", (await a.call("hold_arm", { ...arm, first: { plan: "plan-a", phase: "A3.2.1" } }, coordinator)).startsWith("Armed plan-a-A3.2.1+plan-b-B1"))
await a.call("hold_release", { pair: "plan-a-A3.2.1+plan-b-B1" }, coordinator)

// Locks.
session("impl-a", "plan-a", { parentID: "orch-a", agent: "phase-implementer" })
check("refuses a resource the workspace does not name", (await a.call("lock_take", { resource: "gpu", reason: "x" }, "impl-a")).includes('unknown resource "gpu"'))
check("takes a free resource", (await a.call("lock_take", { resource: "private instance", reason: "deploy A3" }, "impl-a")).startsWith('Locked "private instance"'))
session("impl-a-child", "plan-a", { parentID: "impl-a", agent: "ops-scout" })
check("a child works under its parent's lock", (await a.call("lock_take", { resource: "private instance", reason: "check" }, "impl-a-child")).startsWith('Granted: you may use "private instance" now, under the lock your parent session impl-a holds'))
check("refuses a held resource, naming the holder", (await b.call("lock_take", { resource: "private instance", reason: "deploy B1" }, "orch-b")).includes("locked by session impl-a (plan plan-a)"))
emit({ type: "session.execution.succeeded", data: { sessionID: "impl-a" } })
await settle(() => notes.some((entry) => entry.text.startsWith("LOCK REMINDER")))
check("reminds the holder's parent after the holder's round", notes.some((entry) => entry.sessionID === "orch-a" && entry.text.startsWith("LOCK REMINDER") && entry.text.includes("impl-a")))
check("the other worktree does not remind twice", notes.filter((entry) => entry.text.startsWith("LOCK REMINDER")).length === 1)
check("only the holder or its parent releases", (await b.call("lock_release", { resource: "private instance" }, "orch-b")).includes("only it or its parent"))
check("the holder's parent releases a finished child's lock", (await a.call("lock_release", { resource: "private instance" }, "orch-a")) === 'Released "private instance".')
check("lists no locks afterwards", (await a.call("lock_list", {}, "orch-a")) === "No resource is locked.")

// Locked shell commands and the queue.
const shell = (sessionID, command) => a.start(sessionID, { command }, "shell")
session("repo-a", "repo")
check("allows a shell command in a workflow checkout that is no workspace", (await shell("repo-a", "deploy-private-instance")) === null)
const refuses = (await shell("orch-a", "deploy-private-instance --now")) ?? ""
check("refuses a locked command while both locks are free", refuses.includes('lock_take "private instance"') && refuses.includes('lock_take "worker"'))
await a.call("lock_take", { resource: "private instance", reason: "deploy a" }, "orch-a")
check("still refuses while one of two matched locks is free", ((await shell("orch-a", "deploy-private-instance")) ?? "").includes('lock_take "worker"'))
await a.call("lock_take", { resource: "worker", reason: "deploy a" }, "orch-a")
check("allows the holder of every matched lock", (await shell("orch-a", "deploy-private-instance")) === null)
check("allows a child under the holder", (await shell("impl-a", "deploy-private-instance")) === null)
const heldRefusal = (await shell("orch-b", "deploy-private-instance")) ?? ""
check("names the holder and the queue command", heldRefusal.includes('lock_request "private instance"') && heldRefusal.includes("Held by session orch-a"))
const queued = await a.call("lock_request", { resource: "worker", reason: "deploy b" }, "orch-b")
check("queues a request behind the holder", queued.includes("Queued for \"worker\"") && queued.includes("position 1"), queued)
const transferred = await a.call("lock_release", { resource: "worker" }, "orch-a")
check(
  "transfers the lock and wakes the waiter",
  transferred.includes("granted to session orch-b") && prompts.at(-1).sessionID === "orch-b" && prompts.at(-1).text.startsWith("LOCK GRANTED"),
  transferred,
)
check("the granted session owns the lock", (await a.call("lock_list", {}, "orch-b")).includes("worker: session orch-b"))
await a.call("lock_release", { resource: "private instance" }, "orch-a")
await a.call("lock_request", { resource: "private instance", reason: "deploy b" }, "orch-b")
check("the granted session runs the command once it holds every match", (await shell("orch-b", "deploy-private-instance")) === null)
await a.call("lock_release", { resource: "worker" }, "orch-b")
await a.call("lock_release", { resource: "private instance" }, "orch-b")

// A waiter whose session ended is dropped when the lock is released.
session("wait-dead", "plan-c")
await a.call("lock_take", { resource: "worker", reason: "deploy a" }, "orch-a")
check("queues a second waiter", (await a.call("lock_request", { resource: "worker", reason: "deploy c" }, "wait-dead")).includes("position 1"))
sessions.delete("wait-dead")
check("drops a waiter whose session ended", (await a.call("lock_release", { resource: "worker" }, "orch-a")) === 'Released "worker".')
check("no lock remains after the dead waiter is dropped", (await a.call("lock_list", {}, "orch-a")) === "No resource is locked.")

// A lock whose holder session ended is released, to the first live waiter if any.
session("hold-dead", "plan-c")
await a.call("lock_take", { resource: "worker", reason: "deploy c" }, "hold-dead")
await a.call("lock_request", { resource: "worker", reason: "deploy b" }, "orch-b")
sessions.delete("hold-dead")
check("grants a dead holder's lock to the first waiter", (await a.call("lock_list", {}, "orch-a")).startsWith("worker: session orch-b") && prompts.at(-1).sessionID === "orch-b" && prompts.at(-1).text.startsWith("LOCK GRANTED"))
await a.call("lock_release", { resource: "worker" }, "orch-b")
session("hold-archived", "plan-c")
await a.call("lock_take", { resource: "worker", reason: "deploy c" }, "hold-archived")
sessions.get("hold-archived").time = { archived: 1 }
check("an archived holder's lock is free to take", (await a.call("lock_take", { resource: "worker", reason: "deploy a" }, "orch-a")).startsWith('Locked "worker"'))
check("a locked command no longer waits for a dead holder", ((await shell("orch-a", "deploy-private-instance")) ?? "").includes('lock_take "private instance"') && !((await shell("orch-a", "deploy-private-instance")) ?? "").includes("worker"))
await a.call("lock_release", { resource: "worker" }, "orch-a")

// The /orchestrators dialog's methods.
sessions.get("orch-a").time = { busy: 20, idle: 10 }
sessions.get("orch-b").time = { busy: 10, idle: 20 }
const laterArm = { ...arm, first: { plan: "plan-a", phase: "A4" } }
check("arms a later overlap of the same plans as its own pair", (await a.call("hold_arm", laterArm, coordinator)).startsWith("Armed plan-a-A4+plan-b-B1"))
check("refuses the orchestrators list outside the workspace root", (await rpcHandlers.orchestrators({ directory: directories["plan-a"] })).message.startsWith("run /orchestrators from the workspace root"))
check("refuses an orchestrator action outside the workspace root", (await rpcHandlers.orchestratorAction({ directory: directories["plan-a"], sessionID: "orch-a", action: "unlink" })).message.includes("run /orchestrators from the workspace root"))
const listed = await rpcHandlers.orchestrators({ directory: root })
const rowA = listed.orchestrators.find((row) => row.plan === "plan-a")
check("lists every linked orchestrator", listed.orchestrators.map((row) => row.plan).sort().join() === "plan-a,plan-b,plan-c", listed.message)
check("shows whether an orchestrator runs and its hold", rowA?.running === true && rowA.hold === "held before A4 in plan-a-A4+plan-b-B1" && listed.orchestrators.find((row) => row.plan === "plan-b").running === false)
const action = (sessionID, name) => rpcHandlers.orchestratorAction({ directory: root, sessionID, action: name })
check("interrupts an orchestrator", (await action("orch-a", "interrupt")).message === "Interrupted the plan-a orchestrator." && interrupted.at(-1) === "orch-a")
check("keeps a plan in an armed pair linked", (await action("orch-a", "unlink")).message.includes("is in the armed pair") && readLinks(root).linked["orch-a"] === "plan-a")
await a.call("hold_release", { pair: "plan-a-A4+plan-b-B1" }, coordinator)
emit({ type: "session.created", data: { sessionID: "impl-a4", parentID: "orch-a", agent: "phase-implementer", title: "Implement phase A4", metadata: { phase: "A4" } } })
await settle()
check("refuses a phase whose implementer already started", (await a.call("hold_arm", laterArm, coordinator)).includes("the implementer of phase A4 of plan-a has already started"))
check("unlinks an orchestrator", (await action("orch-c", "unlink")).message === "Unlinked the plan-c orchestrator." && !readLinks(root).linked["orch-c"])
check("an unlinked session cannot be acted on", (await action("orch-c", "archive")).message.includes("is not linked"))
await a.commands["coordinator-link"].execute({ sessionID: "orch-c" })
check("archives and unlinks an orchestrator", (await action("orch-c", "archive")).message === "Archived and unlinked the plan-c orchestrator." && sessions.get("orch-c").time.archived && !readLinks(root).linked["orch-c"])

// A reload in the middle of a round keeps the reports collected so far.
childRound("adv-2", "phase-advancer", verdict)
await settle(() => readInbox(root, "plan-a").pending.some((line) => line.includes("adv-2")))
a.dispose()
const reloaded = await setup("plan-a")
const reloadFed = feedsFrom("plan-a").length
emit({ type: "session.execution.succeeded", data: { sessionID: "orch-a" } })
await settle(() => feedsFrom("plan-a").length > reloadFed)
const afterReload = feedsFrom("plan-a").at(-1).text
check("a reloaded instance sends the report collected before the reload", afterReload.includes('Report from phase-advancer "adv-2" (succeeded)'))
const reloadFeeds = feedsFrom("plan-a").length
emit({ type: "session.execution.succeeded", data: { sessionID: "orch-a" } })
await settle(() => feedsFrom("plan-a").length > reloadFeeds)
check("a sent report is not sent again", !prompts.at(-1).text.includes("adv-2"))

// A compacted coordinator receives each linked plan again.
const toolOnly = { type: "assistant", content: [{ type: "tool", id: "t", name: "read" }] }
contexts.set("orch-a", [
  ...Array.from({ length: 12 }, (_, index) => [{ type: "user", text: `question ${index}` }, toolOnly, { type: "assistant", content: [{ type: "text", text: `answer ${index}` }] }]).flat(),
  { type: "idle", outcome: "succeeded" },
])
const notesBefore = notes.length
emit({ type: "session.compaction.ended", data: { sessionID: coordinator } })
await settle()
const refreshes = notes.slice(notesBefore).filter((entry) => entry.sessionID === coordinator && entry.text.startsWith("REFRESH after compaction"))
check("each linked plan's worktree refreshes the compacted coordinator", refreshes.map((entry) => entry.text.split("\n")[0].split(": ")[1].split(" ")[0]).sort().join() === "plan-a,plan-b")
const refreshA = refreshes.find((entry) => entry.text.includes("REFRESH after compaction: plan-a"))?.text ?? ""
check("a refresh carries the whole full plan", refreshA.includes("Full plan of plan-a") && refreshA.includes("| A3 | Work | active | - |"))
check("a refresh carries the last 20 text messages and no tool result", refreshA.includes("The orchestrator's last 20 messages:\n\nUser: question 2\n\nOrchestrator: answer 2") && refreshA.includes("Orchestrator: answer 11") && !refreshA.includes("question 1\n"))
emit({ type: "session.compaction.ended", data: { sessionID: "orch-a" } })
await settle()
check("an orchestrator's own compaction sends no refresh", notes.length === notesBefore + 2)

writeFileSync(holdsFile(root), JSON.stringify({ pairs: [{ pair: "x", leading: "plan-a", reason: "r", channel: false, sides: [{ plan: "plan-a", phase: "A3" }] }] }))
check("a malformed hold file fails loudly", (await reloaded.call("phase_subagent", { phase: "A3" }, "orch-a")).includes("sides must hold two sides"))

// A closed plan leaves the coordinator: at its worktree's next round end, or when an instance loads
// in a worktree whose plan is already archived.
writeFileSync(holdsFile(root), JSON.stringify({ pairs: [] }))
const archive = (plan) => {
  mkdirSync(path.join(root, "AGENT-INSTRUCTIONS/PLANS/archive"), { recursive: true })
  renameSync(path.join(root, "AGENT-INSTRUCTIONS/PLANS", plan), path.join(root, "AGENT-INSTRUCTIONS/PLANS/archive", plan))
}
archive("plan-b")
emit({ type: "session.execution.succeeded", data: { sessionID: "orch-b" } })
await settle()
check("a round end in an archived plan unlinks it", !readLinks(root).linked["orch-b"] && prompts.at(-1).text.startsWith("PLAN CLOSED: plan-b"))
session("orch-c2", "plan-c")
await reloaded.commands["coordinator-link"].execute({ sessionID: "orch-c2" })
archive("plan-c")
const closedInstance = await setup("plan-c")
check("an instance loading in an archived plan's worktree unlinks it", !readLinks(root).linked["orch-c2"] && prompts.at(-1).text.startsWith("PLAN CLOSED: plan-c"))
closedInstance.dispose()

reloaded.dispose()
b.dispose()
for (const subscriber of subscribers) subscriber.wake?.()
console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)
