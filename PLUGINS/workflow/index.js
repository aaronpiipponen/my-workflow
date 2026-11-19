// Deliver the workflow's instruction text and phase scaffolding to the agents that need it.
//
// The context hook appends each agent's declared files to the system prompt of every request,
// so the text cannot be forgotten and needs no read. A checkpoint's bindings list which
// workspaces the hook applies to and, when it differs from the default matrix, which agents.
//
// Two pure helpers stay exported for the test suite: section slicing and template rendering.

import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const PLUGIN_DIR = path.dirname(fileURLToPath(import.meta.url))
const WORKSPACE_KEY = Symbol.for("opencode.workflow.workspaces")
const SECTION_HEADING = /^##\s+(.+)$/
const NUMBERED_HEADING = /^(\d+[a-z]?)\.\s+(.*)$/
const PHASE_FENCE = /```markdown\n([\s\S]*?)```/g
// Writers that rename instead of writing in place, applied only when the command names shared
// workflow text. Product code is deliberately left alone: the agents use `sed -i` there.
// Known gap: a command that reaches shared text through the tool's own workdir without naming
// it. `setup-repo.py --check` is the backstop for that.
const DETACHING = /\b(?:sed|perl)\b[^|;&]*\s(?:-[a-zA-Z]*i|--in-place)\b|\bmv\b[^|;&]*/
const SHARED_TEXT =
  /AGENT-INSTRUCTIONS\/(?:BUILDING|PLANNING|SUBAGENTS|README\.md|PLANS\/README\.md|PUBLISHING\/export\.py)\b|(?:^|[\s"'=])AGENTS\.md\b/

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

function entriesFor(bindings, agent) {
  // The "*" key applies to every agent in the workspace, ahead of the agent's own entries.
  const shared = bindings.agents?.["*"] ?? []
  const own = bindings.agents?.[agent] ?? []
  if (!Array.isArray(shared) || !Array.isArray(own)) {
    throw new Error(`bindings: "${agent}" must be an array`)
  }
  return [...shared, ...own]
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
    // per-agent overrides. `setup-repo.py` adds a workspace while the service is running, so the
    // two files are re-read whenever either changes rather than only at plugin load.
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
      }
      return cached
    }

    const shared = (globalThis[WORKSPACE_KEY] ??= new Map())
    const directories = shared

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

    await ctx.session.hook("context", async (event) => {
      const directory = await workspaceOf(event.sessionID)
      if (!directory || !governs(directory)) return
      const parts = []
      for (const entry of entriesFor({ agents: settings().agents }, event.agent)) {
        const text = loadEntry(directory, entry)
        if (text && text.trim()) parts.push({ type: "text", text: `<!-- role-context: ${entry.file} -->\n${text}` })
      }
      if (parts.length) event.system.push(...parts)
    })

    // A rename-based writer replaces a symlink with a regular file, which detaches the checkout
    // from the workflow while the text still looks right. Only shared workflow text is refused;
    // the agents use in-place editors on product code and that is fine.
    await ctx.permission.hook("evaluate", async (event) => {
      if (event.action !== "shell") return
      for (const command of event.resources) {
        if (!DETACHING.test(command) || !SHARED_TEXT.test(command)) continue
        const directory = await workspaceOf(event.sessionID)
        if (!directory || !governs(directory)) continue
        event.effect = "deny"
        event.message =
          "Shared workflow text is delivered as symlinks; an in-place editor (sed -i, perl -i) or " +
          "a move replaces the link with a regular file and detaches this checkout. Use the edit " +
          "tool, which writes through the link. Product code is not restricted."
      }
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
