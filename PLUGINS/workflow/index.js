// Deliver the workflow's instruction text and phase scaffolding to the agents that need it.
//
// The context hook appends each agent's declared files to the system prompt, so the text cannot be
// forgotten. It builds that text once per session and reuses it byte-for-byte on later requests:
// changing the prefix voids the prompt cache, so edits do not take effect until `/workflow-reload`.
// A session started with one of the workflow commands (`/plan`, `/release`) also receives that role's
// files. A checkpoint's bindings list which workspaces the hook applies to and, when it differs from
// the default matrix, which agents and roles.
//
// The plugin also owns the workflow commands, registers the workflow skills with the shared text
// they name as their content, and holds edits to the instruction tree until the session has loaded
// the `agent-instructions` skill.
//
// The pure helpers stay exported for the test suite.

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const PLUGIN_DIR = path.dirname(fileURLToPath(import.meta.url))
const WORKFLOW_DIR = path.resolve(PLUGIN_DIR, "..", "..")
const WORKSPACE_KEY = Symbol.for("opencode.workflow.workspaces")
const ROLE_KEY = Symbol.for("opencode.workflow.roles")
const README_KEY = Symbol.for("opencode.workflow.readme")
const INJECTION_KEY = Symbol.for("opencode.workflow.injections")
const README_SKILL = "agent-instructions"
const FRONTMATTER = /^---\n([\s\S]*?)\n---\n?/
const SECTION_HEADING = /^##\s+(.+)$/
const NUMBERED_HEADING = /^(\d+[a-z]?)\.\s+(.*)$/
const PHASE_FENCE = /```markdown\n([\s\S]*?)```/g
// The instruction tree is written with the edit tool only: it writes through the shared-text
// symlinks, and its permission check holds an edit until the `agent-instructions` skill is loaded.
// A shell command that names an instruction file and writes is refused. Product code is left
// alone: the agents use `sed -i` there. Known gap: a command that reaches an instruction file
// through the tool's own workdir without naming it. `setup-repo.py --check` is the backstop for
// detached links.
// The plan folders, the scope fence and the orchestrator handoff are working state, not rules.
const WORKING_STATE = /^(?:PLANS|CURRENT-SCOPE\.md|ORCHESTRATOR-HANDOFF\.md)$/
const INSTRUCTION_FILE =
  /AGENT-INSTRUCTIONS\/(?!PLANS\/|CURRENT-SCOPE\.md|ORCHESTRATOR-HANDOFF\.md)[\w.-]|(?:^|[\s"'=/])AGENTS\.md\b/
// A redirection or `tee` writes only its target; every other writer is judged by the instruction
// file the command names.
const REDIRECT_TARGET = /(?:^|[^<>0-9&])>>?\s*(['"]?)([^\s'";|&<>]+)\1|\btee\b((?:\s+-[a-z-]+)*\s+[^|;&]+)/g
const WRITER =
  /\b(?:sed|perl)\b[^|;&]*\s(?:-[a-zA-Z]*i|--in-place)\b|\b(?:mv|cp|rm|ln|install|truncate|touch|dd)\b|\b(?:python3?|node|ruby|perl)\b[\s\S]*(?:\bwrite|\bopen\s*\([^)]*['"][wax]|\bunlink\b|\brename\b|\bwrite_text\b)/

export function writesInstructions(command) {
  for (const match of command.matchAll(REDIRECT_TARGET)) {
    if (INSTRUCTION_FILE.test(match[2] ?? match[3] ?? "")) return true
  }
  return WRITER.test(command) && INSTRUCTION_FILE.test(command)
}

// Split a rule document into its preamble and its level-two sections, keeping the headings. A
// section is addressable by its number when it has one ("3a") and by its title otherwise
// ("Content rules"), so a binding selects the text a role needs and nothing else.
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

// Return the requested sections in the order asked for, so bindings control the reading order.
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

// Extract the fenced skeleton a phase template offers; the product shape is the first one.
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

// Compare whole path segments, so /projects-two never matches a /projects entry.
export function isPathPrefix(prefix, target) {
  if (prefix.length > target.length) return false
  return prefix.every((segment, index) => segment === target[index])
}

// The "*" key applies to every agent in the workspace, ahead of the agent's own entries, and a
// session's role adds its entries last. An entry that an earlier list already names with the same
// sections is delivered once.
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

// Split a workflow Markdown file into its flat `key: value` front matter and its body.
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

// A command's prompt is its body with the user's arguments in place of `$ARGUMENTS`, or appended
// when the body names no place for them.
export function renderCommand(body, args) {
  const text = (args ?? "").trim()
  if (body.includes("$ARGUMENTS")) return body.replaceAll("$ARGUMENTS", text)
  return text ? `${body}\n\n${text}` : body
}

// The instruction tree outside the plan folders, in the checkout or in the workflow repository
// itself, plus the bootstrap `AGENTS.md`.
export function isInstructionPath(file, workspace, workflow) {
  const inside = (root) => {
    const relative = path.relative(root, file).split(path.sep)
    return (
      relative[0] === "AGENT-INSTRUCTIONS" && relative.length > 1 && !WORKING_STATE.test(relative[1])
    )
  }
  return path.relative(workspace, file) === "AGENTS.md" || inside(workspace) || inside(workflow)
}

// Every workflow skill: its front matter, its guidance and the shared file whose text it carries.
export function readSkills(workflow) {
  const root = path.join(workflow, "SKILLS")
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

// A skill reaches a session as a user attachment (a `skill` message) or as a completed `skill`
// tool call the model made.
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

export function skillContent(skill) {
  const source = readFileSync(skill.sourceFile, "utf8").trim()
  return `${skill.body}\n\n<!-- skill-source: ${skill.source} -->\n${source}`
}

// Resolve one entry to the text to inject. Relative paths resolve against the workspace, so a
// symlinked AGENT-INSTRUCTIONS/ and a direct checkout behave the same.
export function loadEntry(workspace, entry) {
  const file = path.resolve(workspace, entry.file)
  if (!existsSync(file)) {
    if (entry.optional) return null
    throw new Error(`bindings: ${entry.file} is missing in ${workspace}`)
  }
  const text = readFileSync(file, "utf8")
  if (!entry.sections) return text.trim()
  return selectSections(text, entry.sections, file)
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
        // A failed log write cannot be reported through the log.
      }
    }

    // The local file is machine state: which checkouts this plugin governs, plus optional
    // per-agent and per-role overrides. `setup-repo.py` adds a workspace while the service is
    // running, so the two files are re-read whenever either changes rather than only at plugin load.
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

    const shared = (globalThis[WORKSPACE_KEY] ??= new Map())
    const directories = shared
    const roles = (globalThis[ROLE_KEY] ??= new Map())
    const readmeLoaded = (globalThis[README_KEY] ??= new Set())
    const injections = (globalThis[INJECTION_KEY] ??= new Map())

    const workspaceOf = async (sessionID) => {
      if (directories.has(sessionID)) return directories.get(sessionID)
      const info = await ctx.session.get({ sessionID })
      const directory = info?.location?.directory ?? ""
      directories.set(sessionID, directory)
      return directory
    }

    const governs = (directory) => {
      const target = pathSegments(directory)
      return settings().workspaces.some((prefix) => isPathPrefix(prefix, target))
    }

    // A workflow command marks its session with the command's role. The mark is durable, so a
    // restarted service still delivers the role's files to that session.
    const roleOf = async (sessionID) => {
      if (roles.has(sessionID)) return roles.get(sessionID)
      const stored = await ctx.storage.get(`role/${sessionID}`)
      if (typeof stored === "string") roles.set(sessionID, stored)
      return typeof stored === "string" ? stored : undefined
    }

    // Skills carry the shared text as their content. The registry changes only on an explicit
    // `/workflow-reload`; a source edit alone never reloads it, because changing the system prompt
    // voids the prompt cache. A malformed skill fails the reload, not the plugin load.
    await ctx.session.hook("context", async (event) => {
      const directory = await workspaceOf(event.sessionID)
      if (!directory || !governs(directory)) return
      const role = await roleOf(event.sessionID)
      const key = `${event.sessionID}|${event.agent}|${role ?? ""}`
      let parts = injections.get(key)
      if (!parts) {
        parts = []
        for (const entry of entriesFor(settings(), event.agent, role)) {
          const text = loadEntry(directory, entry)
          if (text && text.trim()) parts.push({ type: "text", text: `<!-- role-context: ${entry.file} -->\n${text}` })
        }
        injections.set(key, parts)
      }
      if (parts.length) event.system.push(...parts)
    })

    // Edits to the instruction tree wait until the session has loaded the skill that says where a
    // rule belongs. The plan folders are working state and are not held.
    const hasReadme = async (sessionID) => {
      if (readmeLoaded.has(sessionID)) return true
      const messages = await ctx.session.context({ sessionID })
      const loaded = messages.some((message) => loadsSkill(message, README_SKILL))
      if (loaded) readmeLoaded.add(sessionID)
      return loaded
    }

    // A rename-based writer replaces a symlink with a regular file, which detaches the checkout
    // from the workflow while the text still looks right. Only shared workflow text is refused;
    // the agents use in-place editors on product code and that is fine.
    await ctx.permission.hook("evaluate", async (event) => {
      if (event.action === "edit") {
        const directory = await workspaceOf(event.sessionID)
        if (!directory || !governs(directory)) return
        const held = event.resources.some((file) =>
          isInstructionPath(path.resolve(directory, file), directory, workflow),
        )
        if (!held || (await hasReadme(event.sessionID))) return
        event.effect = "deny"
        event.message =
          `Load the \`${README_SKILL}\` skill before editing the workflow instructions, then retry ` +
          "this edit. It says which rule belongs in the shared text and which in the checkout's LOCAL/."
        return
      }
      if (event.action !== "shell") return
      for (const command of event.resources) {
        if (!writesInstructions(command)) continue
        const directory = await workspaceOf(event.sessionID)
        if (!directory || !governs(directory)) continue
        event.effect = "deny"
        // Naming the missing skill here saves the edit tool's own refusal on the retry.
        const skill = (await hasReadme(event.sessionID))
          ? ""
          : `Load the \`${README_SKILL}\` skill first; the edit tool holds instruction edits until it is loaded. `
        event.message =
          "Write workflow instruction files with the edit tool, not the shell. " +
          skill +
          "The shared text is delivered as symlinks that a shell writer can replace with a regular " +
          "file. Plan folders, the scope fence, the handoff and product code are not restricted."
      }
    })

    const location = ctx.location?.directory ?? ""

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

    // The orchestrator commands. Each one marks its session's role, then sends the command's
    // prompt as the user's message.
    await ctx.command.transform((editor) => {
      if (!location || !governs(location)) return
      const root = path.join(workflow, "COMMANDS")
      for (const name of readdirSync(root).filter((file) => file.endsWith(".md"))) {
        const file = path.join(root, name)
        const role = name.slice(0, -".md".length)
        const { fields } = parseFrontmatter(readFileSync(file, "utf8"), file)
        editor.add({
          name: role,
          description: fields.description,
          execute: async ({ sessionID, prompt, delivery }) => {
            const { body } = parseFrontmatter(readFileSync(file, "utf8"), file)
            await ctx.storage.set(`role/${sessionID}`, role)
            roles.set(sessionID, role)
            log(`role ${role} for ${sessionID}`)
            await ctx.session.prompt({ ...prompt, sessionID, text: renderCommand(body, prompt.text), delivery })
          },
        })
      }
      // One deliberate refresh for a batch of instruction edits: drop every session's snapshot
      // and reload the skill registry. Both change the system prompt, so this is the single point
      // where a cache void is expected.
      editor.add({
        name: "workflow-reload",
        description: "Apply workflow instruction edits from disk now, instead of on the next session.",
        execute: async () => {
          injections.clear()
          await ctx.skill.reload()
          log("injection and skills reloaded")
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
  },
}
