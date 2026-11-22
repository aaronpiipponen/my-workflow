// Deliver the workflow's instruction text, commands and phase scaffolding to agents.
//
// The context hook builds each agent's injected text once per session and reuses it byte-for-byte,
// so a file edit reaches the session only on `/workflow-reload`. A session started with `/plan` or
// `/release` also receives that role's files. The plugin registers commands and skills,
// holds instruction edits until the `agent-instructions` skill is loaded, and refuses shell writes
// to the instruction tree. The pure helpers are exported for the test suite.

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const PLUGIN_DIR = path.dirname(fileURLToPath(import.meta.url))
const WORKFLOW_DIR = path.resolve(PLUGIN_DIR, "..", "..")
const ROLE_KEY = Symbol.for("opencode.workflow.roles")
const README_KEY = Symbol.for("opencode.workflow.readme")
const INJECTION_KEY = Symbol.for("opencode.workflow.injections")
const README_SKILL = "agent-instructions"
const FRONTMATTER = /^---\n([\s\S]*?)\n---\n?/
const SECTION_HEADING = /^##\s+(.+)$/
const NUMBERED_HEADING = /^(\d+[a-z]?)\.\s+(.*)$/
const PHASE_FENCE = /```markdown\n([\s\S]*?)```/g
// The edit tool writes through the shared-text symlinks and holds an edit until the
// `agent-instructions` skill is loaded. A shell command that names an instruction file and writes
// is refused. A command that reaches such a file through the tool's workdir without naming it is
// left to `setup-repo.py --check`. The plan folders, scope fence and handoff are working state.
const WORKING_STATE = /^(?:PLANS|CURRENT-SCOPE\.md|ORCHESTRATOR-HANDOFF\.md)$/
const INSTRUCTION_FILE =
  /AGENT-INSTRUCTIONS\/(?!PLANS\/|CURRENT-SCOPE\.md|ORCHESTRATOR-HANDOFF\.md)[\w.-]|(?:^|[\s"'=/])AGENTS\.md\b/
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

/** Report whether a file in either tree is part of the instruction tree. */
export function isInstructionPath(file, workspace, workflow) {
  const inside = (root) => {
    const relative = path.relative(root, file).split(path.sep)
    return (
      relative[0] === "AGENT-INSTRUCTIONS" && relative.length > 1 && !WORKING_STATE.test(relative[1])
    )
  }
  return path.relative(workspace, file) === "AGENTS.md" || inside(workspace) || inside(workflow)
}

/** Read every workflow skill: its front matter, guidance and source file. */
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

/** Resolve one binding entry to its injected text, relative to the workspace. */
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
        // A failed log write has no other channel to report through.
      }
    }

    // The local file holds the governed workspaces and optional overrides. Both files are read on
    // each change so a workspace that `setup-repo.py` adds while the service runs takes effect.
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

    const roles = (globalThis[ROLE_KEY] ??= new Map())
    const readmeLoaded = (globalThis[README_KEY] ??= new Set())
    const injections = (globalThis[INJECTION_KEY] ??= new Map())

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
        for (const entry of entriesFor(settings(), event.agent, role)) {
          const text = loadEntry(directory, entry)
          if (text && text.trim()) parts.push({ type: "text", text: `<!-- role-context: ${entry.file} -->\n${text}` })
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

    // A rename over a symlink detaches the checkout from the workflow while the text looks right.
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
        // Name the missing skill so the retry does not need a second refusal.
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

    // Register the orchestrator commands from their prompt files.
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
      // Apply a batch of edits once: both actions change the system prompt and void its cache.
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
