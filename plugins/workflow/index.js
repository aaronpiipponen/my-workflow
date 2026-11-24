// Deliver the workflow's instruction text, commands and phase scaffolding to agents.
//
// A workspace root holds `AGENT-INSTRUCTIONS/` and one Git worktree per plan; each worktree links
// `AGENT-INSTRUCTIONS` and `AGENTS.md` to the root, so paths resolve the same from every worktree.
// A worktree's branch names its plan, and a binding path containing `{plan}` resolves to that plan.
// The context hook builds each agent's injected text once per session and reuses it byte-for-byte,
// so a file edit reaches the session only on `/workflow-reload`. A session started with `/plan` or
// `/release` also receives that role's files. The plugin registers commands and skills,
// holds instruction edits until the `agent-instructions` skill is loaded, refuses shell writes
// to the instruction tree, and commits the workspace root after every finished session round.
// The pure helpers are exported for the test suite.

import { execFile, execFileSync } from "node:child_process"
import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"

import { Workflow } from "./rpc.js"
import { createPlan, listPlans, readSettings, sessionModel } from "./workspace.js"

const PLUGIN_DIR = path.dirname(fileURLToPath(import.meta.url))
const WORKFLOW_DIR = path.resolve(PLUGIN_DIR, "..", "..")
const STATE_KEY = Symbol.for("opencode.workflow.state")
// Bump when a change to the shape below makes a previous load's state unsafe to read.
const STATE_VERSION = 2
const ROUND_ENDS = ["session.execution.succeeded", "session.execution.failed", "session.execution.interrupted"]
const run = promisify(execFile)
const README_SKILL = "agent-instructions"
const COORDINATOR_AGENT = "coordinator"
const FRONTMATTER = /^---\n([\s\S]*?)\n---\n?/
const SECTION_HEADING = /^##\s+(.+)$/
const NUMBERED_HEADING = /^(\d+[a-z]?)\.\s+(.*)$/
const PHASE_FENCE = /```markdown\n([\s\S]*?)```/g
// The edit tool writes through the shared-text symlinks and holds an edit until the
// `agent-instructions` skill is loaded. A shell command that names an instruction file and writes
// is refused. A command that reaches such a file through the tool's workdir without naming it is
// left to `setup-workspace.py --check`. The plan folders, each holding its plan's scope and
// handoff, are working state.
const WORKING_STATE = /^PLANS$/
const INSTRUCTION_FILE = /AGENT-INSTRUCTIONS\/(?!PLANS\/)[\w.-]|(?:^|[\s"'=/])AGENTS\.md\b/
// A redirection or `tee` writes only its target; other writers are judged by the named file.
const REDIRECT_TARGET = /(?:^|[^<>0-9&])>>?\s*(['"]?)([^\s'";|&<>]+)\1|\btee\b((?:\s+-[a-z-]+)*\s+[^|;&]+)/g
const WRITER =
  /\b(?:sed|perl)\b[^|;&]*\s(?:-[a-zA-Z]*i|--in-place)\b|\b(?:mv|cp|rm|ln|install|truncate|touch|dd)\b|\b(?:python3?|node|ruby|perl)\b[\s\S]*(?:\bwrite|\bopen\s*\([^)]*['"][wax]|\bunlink\b|\brename\b|\bwrite_text\b)/

/** Report whether a shell command writes a file in the instruction tree. */
export function writesInstructions(command) {
  for (const match of command.matchAll(REDIRECT_TARGET)) {
    if (INSTRUCTION_FILE.test(match[2] ?? match[3] ?? "")) return true
  }
  return WRITER.test(command) && INSTRUCTION_FILE.test(command)
}

/**
 * Split a rule document into its preamble and level-two sections, keeping the headings.
 *
 * A section is addressable by its number when it has one ("3a") and by its title otherwise
 * ("Content rules").
 */
export function splitSections(text) {
  const preamble = []
  const sections = new Map()
  let current = null
  const index = (heading) => {
    const numbered = NUMBERED_HEADING.exec(heading)
    const title = (numbered ? numbered[2] : heading).trim().toLowerCase()
    return [title, ...(numbered ? [numbered[1]] : [])]
  }
  for (const line of text.split("\n")) {
    const match = SECTION_HEADING.exec(line)
    if (match) {
      const keys = index(match[1])
      current = keys
      const block = [line]
      for (const key of keys) sections.set(key, block)
    } else if (current !== null) {
      sections.get(current[0]).push(line)
    } else {
      preamble.push(line)
    }
  }
  return { preamble, sections }
}

/** Return the requested sections in the order asked for. */
export function selectSections(text, ids, file) {
  const { preamble, sections } = splitSections(text)
  const body = [...preamble]
  for (const id of ids) {
    const lines = sections.get(id.toLowerCase())
    if (!lines) throw new Error(`${file}: no section "${id}"`)
    body.push(...lines)
  }
  return body.join("\n").trim()
}

/** Extract the fenced skeleton from a phase template; the product shape is first. */
export function renderPhase(template, { id, title, kind }) {
  const blocks = [...template.matchAll(PHASE_FENCE)].map((match) => match[1])
  const skeleton = kind === "experiment" ? blocks[1] : blocks[0]
  if (!skeleton) throw new Error(`phase template has no ${kind ?? "product"} skeleton`)
  return skeleton.replaceAll("<id>", id).replaceAll("<short title>", title).trim() + "\n"
}

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, "utf8"))
  } catch (error) {
    throw new Error(`${file}: ${error.message}`)
  }
}

function pathSegments(value) {
  return path.resolve(value).split(path.sep).filter(Boolean)
}

/** Compare whole path segments, so /projects-two never matches a /projects entry. */
export function isPathPrefix(prefix, target) {
  if (prefix.length > target.length) return false
  return prefix.every((segment, index) => segment === target[index])
}

/**
 * Return the bindings that apply to an agent and role, in delivery order.
 *
 * The "*" entries come first, the agent's next and the role's last. An entry that an earlier list
 * names with the same sections is delivered once.
 */
export function entriesFor(bindings, agent, role) {
  const lists = [
    ["*", bindings.agents?.["*"] ?? []],
    [agent, bindings.agents?.[agent] ?? []],
    [`role ${role}`, role ? (bindings.roles?.[role] ?? []) : []],
  ]
  const seen = new Set()
  const entries = []
  for (const [name, list] of lists) {
    if (!Array.isArray(list)) throw new Error(`bindings: "${name}" must be an array`)
    for (const entry of list) {
      const key = JSON.stringify([entry.file, entry.sections ?? null])
      if (seen.has(key)) continue
      seen.add(key)
      entries.push(entry)
    }
  }
  return entries
}

/** Split a workflow Markdown file into its flat front matter and its body. */
export function parseFrontmatter(text, file) {
  const match = FRONTMATTER.exec(text)
  if (!match) throw new Error(`${file}: no front matter`)
  const fields = {}
  for (const line of match[1].split("\n")) {
    if (!line.trim()) continue
    const colon = line.indexOf(":")
    if (colon < 1) throw new Error(`${file}: front matter line "${line}" is not "key: value"`)
    fields[line.slice(0, colon).trim()] = line.slice(colon + 1).trim()
  }
  return { fields, body: text.slice(match[0].length).trim() }
}

/** Place a command's arguments at `$ARGUMENTS`, or append them when it names no place. */
export function renderCommand(body, args) {
  const text = (args ?? "").trim()
  if (body.includes("$ARGUMENTS")) return body.replaceAll("$ARGUMENTS", text)
  return text ? `${body}\n\n${text}` : body
}

/**
 * Report whether a file is part of the instruction tree, named through the worktree's link, the
 * workspace root's real folder or the workflow repository.
 */
export function isInstructionPath(file, workspace, workflow, root = workspace) {
  const inside = (root) => {
    const relative = path.relative(root, file).split(path.sep)
    return (
      relative[0] === "AGENT-INSTRUCTIONS" && relative.length > 1 && !WORKING_STATE.test(relative[1])
    )
  }
  return path.relative(workspace, file) === "AGENTS.md" || inside(workspace) || inside(root) || inside(workflow)
}

/** Read every workflow skill: its front matter, guidance and source file. */
export function readSkills(workflow) {
  const root = path.join(workflow, "skills")
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const file = path.join(root, entry.name, "SKILL.md")
      const { fields, body } = parseFrontmatter(readFileSync(file, "utf8"), file)
      if (!fields.name || !fields.description || !fields.source) {
        throw new Error(`${file}: front matter needs name, description and source`)
      }
      return { id: entry.name, file, ...fields, body, sourceFile: path.join(workflow, fields.source) }
    })
}

/** Report whether a message loaded a skill, as an attachment or a completed tool call. */
export function loadsSkill(message, id) {
  if (message.type === "skill") return message.skill === id
  if (message.type !== "assistant") return false
  return (message.content ?? []).some(
    (part) =>
      part.type === "tool" &&
      part.name === "skill" &&
      part.state?.status === "completed" &&
      part.state.input?.id === id,
  )
}

/** Return a skill's guidance followed by its source file's text. */
export function skillContent(skill) {
  const source = readFileSync(skill.sourceFile, "utf8").trim()
  return `${skill.body}\n\n<!-- skill-source: ${skill.source} -->\n${source}`
}

/**
 * Return the plan a directory works on: its checked-out branch, when the workspace has a plan
 * folder of that name. The release's `main` worktree and the root itself have no plan.
 */
export function planOf(directory) {
  const branch = branchOf(directory)
  return branch && existsSync(path.join(directory, "AGENT-INSTRUCTIONS", "PLANS", branch)) ? branch : null
}

/** Return a directory's checked-out branch, or null outside Git or on a detached HEAD. */
export function branchOf(directory) {
  try {
    return (
      execFileSync("git", ["-C", directory, "symbolic-ref", "--short", "-q", "HEAD"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim() || null
    )
  } catch {
    // Not a Git checkout, or a detached HEAD: neither names a branch.
    return null
  }
}

/** Return the workspace root: the real directory the session's `AGENT-INSTRUCTIONS` link names. */
export function rootOf(directory) {
  const instructions = path.join(directory, "AGENT-INSTRUCTIONS")
  return existsSync(instructions) ? path.dirname(realpathSync(instructions)) : null
}

/**
 * Resolve one binding entry to its injected text, relative to the workspace.
 *
 * A path containing `{plan}` names a file of the session's plan; a session without a plan skips it.
 */
export function loadEntry(workspace, entry, plan = null) {
  if (entry.file.includes("{plan}") && !plan) return null
  const file = path.resolve(workspace, entry.file.replaceAll("{plan}", plan))
  if (!existsSync(file)) {
    if (entry.optional) return null
    throw new Error(`bindings: ${entry.file} is missing in ${workspace}`)
  }
  const text = readFileSync(file, "utf8")
  // An emptied slot is one the workspace does not use; it has no sections to select.
  if (!text.trim()) return null
  if (!entry.sections) return text.trim()
  return selectSections(text, entry.sections, file)
}

/**
 * Commit every change in the workspace root, which keeps the plans' history.
 *
 * Returns whether a commit was made. The root's own `.gitignore` keeps the project repository,
 * the worktrees and the workflow links out.
 */
export async function commitRoot(root, message) {
  await run("git", ["-C", root, "add", "-A"])
  try {
    await run("git", ["-C", root, "diff", "--cached", "--quiet"])
    return false
  } catch (error) {
    // `diff --quiet` exits 1 when something is staged; anything else is a real failure.
    if (error.code !== 1) throw error
  }
  await run("git", ["-C", root, "commit", "-q", "-m", message])
  return true
}

/**
 * Process-wide state that a reloaded build must find and read safely.
 *
 * OpenCode reloads this plugin whenever its files change, and the state below outlives that
 * reload. A previous load may have stored a shape this code cannot read, so every field is
 * validated: a field with the wrong shape is replaced, and the injection snapshots are adopted
 * whenever they validate, because dropping them would rebuild every running session's prompt.
 */
export function processState() {
  const previous = globalThis[STATE_KEY]
  const usable = previous?.version === STATE_VERSION
  const next = {
    version: STATE_VERSION,
    roles: usable && previous.roles instanceof Map ? previous.roles : new Map(),
    readme: usable && previous.readme instanceof Set ? previous.readme : new Set(),
    injections: previous?.injections instanceof Map ? previous.injections : new Map(),
    commits: previous?.commits instanceof Map ? previous.commits : new Map(),
  }
  globalThis[STATE_KEY] = next
  return next
}

export default {
  id: "workflow",

  async setup(ctx) {
    if (typeof ctx?.session?.hook !== "function" || typeof ctx?.tool?.transform !== "function") return

    const bindingsFile = ctx.options?.bindings ?? path.join(PLUGIN_DIR, "bindings.json")
    const defaultFile = ctx.options?.defaults ?? path.join(PLUGIN_DIR, "bindings.default.json")
    const workflow = ctx.options?.workflow ?? WORKFLOW_DIR
    const logFile = ctx.options?.logFile

    const log = (line) => {
      if (!logFile) return
      try {
        writeFileSync(logFile, `${new Date().toISOString()} workflow: ${line}\n`, { flag: "a" })
      } catch {
        // A failed log write has no other channel to report through.
      }
    }

    // The local file holds the governed workspaces and optional overrides. Both files are read on
    // each change so a workspace that `setup-workspace.py` adds while the service runs takes effect.
    const stampOf = (file) => {
      try {
        const stat = statSync(file)
        return `${stat.mtimeMs}:${stat.size}`
      } catch {
        return "missing"
      }
    }
    let cached = null
    const settings = () => {
      const stamp = `${stampOf(defaultFile)}|${stampOf(bindingsFile)}`
      if (cached?.stamp === stamp) return cached
      const defaults = readJson(defaultFile)
      const local = existsSync(bindingsFile) ? readJson(bindingsFile) : { workspaces: [] }
      cached = {
        stamp,
        workspaces: (local.workspaces ?? []).map(pathSegments),
        agents: { ...(defaults.agents ?? {}), ...(local.agents ?? {}) },
        roles: { ...(defaults.roles ?? {}), ...(local.roles ?? {}) },
      }
      return cached
    }

    const state = processState()
    const roles = state.roles
    const readmeLoaded = state.readme
    const injections = state.injections

    // Read on every call: a session can move to another directory, and a cached directory would
    // keep applying the old workspace's rules and edit guard.
    const workspaceOf = async (sessionID) => {
      const info = await ctx.session.get({ sessionID })
      return info?.location?.directory ?? ""
    }

    const governs = (directory) => {
      const target = pathSegments(directory)
      return settings().workspaces.some((prefix) => isPathPrefix(prefix, target))
    }

    // A workflow command marks its session's role durably, preserving those files across a restart.
    const roleOf = async (sessionID) => {
      if (roles.has(sessionID)) return roles.get(sessionID)
      const stored = await ctx.storage.get(`role/${sessionID}`)
      if (typeof stored === "string") roles.set(sessionID, stored)
      return typeof stored === "string" ? stored : undefined
    }

    // The skill registry changes on `/workflow-reload` only: a source edit alone would change the
    // system prompt and void the cache. A malformed skill fails that reload, not the plugin load.
    await ctx.session.hook("context", async (event) => {
      const directory = await workspaceOf(event.sessionID)
      if (!directory || !governs(directory)) return
      const role = await roleOf(event.sessionID)
      const key = `${event.sessionID}|${directory}|${event.agent}|${role ?? ""}`
      let parts = injections.get(key)
      if (!parts) {
        parts = []
        const plan = planOf(directory)
        for (const entry of entriesFor(settings(), event.agent, role)) {
          const text = loadEntry(directory, entry, plan)
          const source = plan ? entry.file.replaceAll("{plan}", plan) : entry.file
          if (text && text.trim()) parts.push({ type: "text", text: `<!-- role-context: ${source} -->\n${text}` })
        }
        injections.set(key, parts)
      }
      if (parts.length) event.system.push(...parts)
    })

    // Hold instruction edits until the session has loaded the `agent-instructions` skill.
    const hasReadme = async (sessionID) => {
      if (readmeLoaded.has(sessionID)) return true
      const messages = await ctx.session.context({ sessionID })
      const loaded = messages.some((message) => loadsSkill(message, README_SKILL))
      if (loaded) readmeLoaded.add(sessionID)
      return loaded
    }

    // A rename over a symlink detaches the workspace from the workflow while the text looks right.
    await ctx.permission.hook("evaluate", async (event) => {
      if (event.action === "edit") {
        const directory = await workspaceOf(event.sessionID)
        if (!directory || !governs(directory)) return
        const root = rootOf(directory) ?? directory
        const held = event.resources.some((file) =>
          isInstructionPath(path.resolve(directory, file), directory, workflow, root),
        )
        if (!held || (await hasReadme(event.sessionID))) return
        event.effect = "deny"
        event.message =
          `Load the \`${README_SKILL}\` skill before editing the workflow instructions, then retry ` +
          "this edit. It says which rule belongs in the shared text and which in the workspace's LOCAL/."
        return
      }
      if (event.action !== "shell") return
      for (const command of event.resources) {
        if (!writesInstructions(command)) continue
        const directory = await workspaceOf(event.sessionID)
        if (!directory || !governs(directory)) continue
        event.effect = "deny"
        // Name the missing skill so the retry does not need a second refusal.
        const skill = (await hasReadme(event.sessionID))
          ? ""
          : `Load the \`${README_SKILL}\` skill first; the edit tool holds instruction edits until it is loaded. `
        event.message =
          "Write workflow instruction files with the edit tool, not the shell. " +
          skill +
          "The shared text is delivered as symlinks that a shell writer can replace with a regular " +
          "file. Plan folders, with their scope and handoff, and product code are not restricted."
      }
    })

    const location = ctx.location?.directory ?? ""

    // Every plugin instance receives every session's events, so each commits only for sessions in
    // its own location. Commits to one root run one at a time, since worktrees share the root.
    const commits = state.commits
    const recordRound = async (sessionID) => {
      const directory = await workspaceOf(sessionID)
      if (directory !== location || !governs(directory)) return
      const root = rootOf(directory)
      if (!root) return
      const info = await ctx.session.get({ sessionID })
      const message = `Record a round of ${info?.title || sessionID}`
      const previous = commits.get(root) ?? Promise.resolve()
      const next = previous.then(() => commitRoot(root, message))
      // The chain only orders commits; this round's failure is reported through `await next`.
      commits.set(root, next.catch(() => {}))
      if (await next) log(`committed ${root}: ${message}`)
    }
    const controller = new AbortController()
    if (location && typeof ctx.event?.subscribe === "function") {
      ;(async () => {
        for await (const event of ctx.event.subscribe({ types: ROUND_ENDS, signal: controller.signal })) {
          recordRound(event.data.sessionID).catch((error) => log(`root commit failed: ${error.message}`))
        }
      })().catch((error) => {
        if (!controller.signal.aborted) log(`event stream ended: ${error.message}`)
      })
    }

    await ctx.skill.transform((editor) => {
      if (!location || !governs(location)) return
      for (const skill of readSkills(workflow)) {
        editor.add({
          id: skill.id,
          name: skill.name,
          description: skill.description,
          path: skill.file,
          content: skillContent(skill),
        })
      }
    })

    // `/plan-new` and `/shadow-plan`, typed in the terminal UI, create a plan; the method answers
    // with a message, because a thrown error reaches the terminal UI without its text. A shadow plan
    // also opens the user's working session in its worktree, where they register the shadow.
    let rpc
    if (typeof ctx.rpc?.register === "function") {
      rpc = await ctx.rpc.register(Workflow, {
        planNew: async ({ directory, name, kind = "plan" }) => {
          const command = kind === "shadow" ? "shadow-plan" : "plan-new"
          try {
            const root = rootOf(directory)
            if (!root || !governs(directory)) throw new Error(`${directory} is not in a workspace`)
            // Read before anything is created, so a missing model leaves no half-made plan.
            const model = kind === "shadow" ? sessionModel(root, "shadow") : null
            const created = await createPlan(root, name.trim(), workflow, kind)
            log(`${kind} ${name} created in ${created.worktree}`)
            const made = `branch ${name} from ${created.integration}, worktree ${created.worktree}`
            if (kind !== "shadow") return { message: `Created plan ${name}: ${made}. Start it with /plan ${name}.` }
            const session = await ctx.session.create({ title: `Shadow ${name}`, agent: "build", model, location: { directory: created.worktree } })
            if (!session?.id) throw new Error(`created ${made}, but its working session was not created`)
            if (rpc?.events?.emit) await rpc.events.emit("started", { sessionID: session.id })
            return { message: `Created shadow plan ${name}: ${made}. Run /shadow-register in its new session.` }
          } catch (error) {
            return { message: `/${command} failed: ${error.message}` }
          }
        },
      })
    }

    /**
     * Move a session that runs a `worktree: plan` command into its plan's worktree, before any
     * rule is injected or the command body is submitted. A session already in a plan's worktree
     * stays; in the root, the first word of the arguments names the plan, and without it the
     * terminal UI offers the plans. Returns the arguments left for the body, or null to stop.
     */
    // The plan a command names, or null after offering the picker.
    const choosePlan = async (sessionID, text, command) => {
      const root = rootOf(await workspaceOf(sessionID))
      const [, name, rest] = /^\s*(\S*)\s*([\s\S]*)$/.exec(text ?? "")
      if (!name) {
        const plans = listPlans(root)
        if (!plans.length) throw new Error("this workspace has no plan yet; create one with /plan-new")
        if (rpc?.events?.emit) await rpc.events.emit("pickPlan", { sessionID, plans, action: command })
        return null
      }
      const worktree = path.join(root, name)
      if (!listPlans(root).includes(name) || !existsSync(worktree) || planOf(worktree) !== name) {
        throw new Error(`${name} is not a plan with its own worktree; create it with /plan-new`)
      }
      return { name, rest, worktree }
    }
    // Where a command runs: in this session when it is already in a plan's worktree, otherwise in
    // a new session in the chosen plan's worktree. From the integration worktree, `/release` is a
    // hotfix with no plan. A picker returns null.
    const commandTarget = async (sessionID, text, command) => {
      const session = await ctx.session.get({ sessionID })
      if (session?.agent === COORDINATOR_AGENT) throw new Error(`the coordinator cannot run /${command}; open a plan's worktree session`)
      // The shadow-orchestrator plugin marks its session; it keeps its own role.
      if (session?.metadata?.shadowOrchestrator) throw new Error(`a shadow orchestrator cannot run /${command}; open a new chat for it`)
      const existing = await roleOf(sessionID)
      if (existing) throw new Error(`this session already runs the ${existing} role; open a new chat for /${command}`)
      const directory = await workspaceOf(sessionID)
      const root = rootOf(directory)
      if (!root) throw new Error("this session is not in a workspace")
      if (planOf(directory)) return { directory, args: text, here: true }
      const atRoot = path.resolve(directory) === path.resolve(root)
      const atIntegration = branchOf(directory) === readSettings(root).integration
      if (command === "release" && atIntegration) return { directory, args: text, here: false, hotfix: true }
      if (!atRoot && !atIntegration) throw new Error(`run /${command} from the workspace root, the integration worktree or a plan's worktree`)
      const plan = await choosePlan(sessionID, text, command)
      return plan && { directory: plan.worktree, args: plan.rest, here: false }
    }
    // The role is kept in the plugin's storage for injection and on the session's metadata so the
    // coordinator plugin can tell a plan orchestrator from a release session.
    const setRole = async (sessionID, role) => {
      await ctx.storage.set(`role/${sessionID}`, role)
      roles.set(sessionID, role)
      const session = await ctx.session.get({ sessionID })
      await ctx.session.update({ sessionID, metadata: { ...(session?.metadata ?? {}), workflowRole: role } })
    }
    // A command typed in the root or the integration worktree starts its own session there, so the
    // chat it was typed in keeps its own role and directory. The new session runs on the model the
    // workspace names for the role.
    const startSession = async (sourceID, role, target, body, delivery) => {
      const source = await ctx.session.get({ sessionID: sourceID })
      const model = sessionModel(rootOf(target.directory), role)
      const title = target.hotfix ? "Release hotfix" : `${role === "plan" ? "Plan" : "Release"} ${path.basename(target.directory)}`
      const created = await ctx.session.create({
        title,
        agent: source?.agent ?? "build",
        model,
        location: { directory: target.directory },
      })
      const sessionID = created?.id
      if (!sessionID) throw new Error("the new session was not created")
      await setRole(sessionID, role)
      await ctx.session.prompt({ sessionID, text: renderCommand(body, target.args), delivery })
      log(`started ${role} in ${target.directory} as ${sessionID}`)
      if (rpc?.events?.emit) await rpc.events.emit("started", { sessionID })
      return sessionID
    }

    // Register the orchestrator commands from their prompt files.
    await ctx.command.transform((editor) => {
      if (!location || !governs(location)) return
      const root = path.join(workflow, "commands")
      for (const name of readdirSync(root).filter((file) => file.endsWith(".md"))) {
        const file = path.join(root, name)
        const role = name.slice(0, -".md".length)
        const { fields } = parseFrontmatter(readFileSync(file, "utf8"), file)
        editor.add({
          name: role,
          description: fields.description,
          execute: async ({ sessionID, prompt, delivery }) => {
            const { body, fields } = parseFrontmatter(readFileSync(file, "utf8"), file)
            if (fields.worktree !== "plan") {
              const existing = await roleOf(sessionID)
              if (existing) throw new Error(`this session already runs the ${existing} role; open a new chat for /${role}`)
              await setRole(sessionID, role)
              await ctx.session.prompt({ ...prompt, sessionID, text: renderCommand(body, prompt.text), delivery })
              return
            }
            const target = await commandTarget(sessionID, prompt.text, role)
            if (!target) return
            if (target.here) {
              await setRole(sessionID, role)
              log(`role ${role} for ${sessionID}`)
              await ctx.session.prompt({ sessionID, text: renderCommand(body, target.args), delivery })
            } else {
              await startSession(sessionID, role, target, body, delivery)
            }
          },
        })
      }
      // Apply a batch of edits once: both actions change the system prompt and void its cache.
      editor.add({
        name: "workflow-reload",
        description: "Apply workflow instruction edits from disk now, instead of on the next session.",
        // Only the invoking session's snapshot is dropped: clearing every session's would change the
        // system prompt of every running session at once and void all of their read caches.
        execute: async ({ sessionID }) => {
          for (const key of injections.keys()) if (key.startsWith(`${sessionID}|`)) injections.delete(key)
          await ctx.skill.reload()
          log(`injection reloaded for ${sessionID}; skills reloaded`)
        },
      })
    })

    await ctx.tool.transform((editor) => {
      editor.add({
        name: "phase_new",
        description:
          "Create one phase document from the repository's phase template, with every required section present.",
        input: {
          type: "object",
          properties: {
            plan: { type: "string", description: "Plan slug under AGENT-INSTRUCTIONS/PLANS/." },
            id: { type: "string", description: "Phase id, for example P3 or S1-R2." },
            title: { type: "string", description: "Short phase title." },
            kind: {
              type: "string",
              enum: ["product", "experiment"],
              description: "Skeleton to use. Defaults to product.",
            },
          },
          required: ["plan", "id", "title"],
          additionalProperties: false,
        },
        execute: async (input, context) => {
          const directory = await workspaceOf(context.sessionID)
          if (!governs(directory)) throw new Error("this workspace has no workflow bindings")
          const template = path.join(directory, "AGENT-INSTRUCTIONS", "PLANNING", "phase-template.md")
          const slug = input.title
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, "")
          const target = path.join(
            directory,
            "AGENT-INSTRUCTIONS",
            "PLANS",
            input.plan,
            "phases",
            `${input.id}-${slug}.md`,
          )
          if (existsSync(target)) throw new Error(`${path.relative(directory, target)} already exists`)
          await ctx.permission.assert({
            sessionID: context.sessionID,
            source: { type: "tool", messageID: context.messageID, id: context.id },
            action: "edit",
            resources: [target],
          })
          const body = renderPhase(readFileSync(template, "utf8"), input)
          mkdirSync(path.dirname(target), { recursive: true })
          writeFileSync(target, body)
          log(`phase_new ${path.relative(directory, target)}`)
          return { content: `Created ${path.relative(directory, target)}` }
        },
      })
    })

    return () => controller.abort()
  },
}
