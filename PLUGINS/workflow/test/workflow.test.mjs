// Verify the workflow plugin against a mock OpenCode context.
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

import plugin, {
  entriesFor,
  isInstructionPath,
  isPathPrefix,
  renderCommand,
  renderPhase,
  selectSections,
  splitSections,
} from "../index.js"

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

const RULES = [
  "# Rules",
  "",
  "## 0. The one rule",
  "",
  "method zero",
  "",
  "## 1. What this repo is",
  "",
  "domain one",
  "",
  "## 2. Hard invariants",
  "",
  "domain two",
  "",
  "## 3. Code style",
  "",
  "method three",
  "",
].join("\n")

const TEMPLATE = [
  "# Phase template",
  "",
  "```markdown",
  "## Phase <id> - <short title>",
  "",
  "**Scope:** <exact boundary>.",
  "```",
  "",
  "## Experiment brief variant",
  "",
  "```markdown",
  "## Phase <id> - <short title>",
  "",
  "**Question:** <the one question>.",
  "```",
  "",
].join("\n")

function workspace(shape = {}) {
  const root = mkdtempSync(path.join(tmpdir(), "wf-"))
  const files = {
    "AGENT-INSTRUCTIONS/BUILDING/REPO-RULES.md": RULES,
    "AGENT-INSTRUCTIONS/BUILDING/VERIFICATION-COMMITS-DEPLOY.md": "verification rules\n",
    "AGENT-INSTRUCTIONS/CURRENT-SCOPE.md": "current scope\n",
    "AGENT-INSTRUCTIONS/PLANNING/phase-template.md": TEMPLATE,
    ...shape,
  }
  for (const [relative, text] of Object.entries(files)) {
    const file = path.join(root, relative)
    mkdirSync(path.dirname(file), { recursive: true })
    writeFileSync(file, text)
  }
  return root
}

// A workflow repository with one skill and one command, beside the checkout it governs.
function workflowRepo() {
  const root = mkdtempSync(path.join(tmpdir(), "wf-repo-"))
  const files = {
    "AGENT-INSTRUCTIONS/BUILDING/DEBUGGING.md": "debugging loop text\n",
    "SKILLS/debugging/SKILL.md":
      "---\nname: Debugging\ndescription: Diagnose bugs.\nsource: AGENT-INSTRUCTIONS/BUILDING/DEBUGGING.md\n---\n\nFollow the loop.\n",
    "COMMANDS/release.md": "---\ndescription: Release\n---\n\nAct as release orchestrator. $ARGUMENTS\n",
  }
  for (const [relative, text] of Object.entries(files)) {
    const file = path.join(root, relative)
    mkdirSync(path.dirname(file), { recursive: true })
    writeFileSync(file, text)
  }
  return root
}

function harness(root, { workspaces = [root], agents, bindings } = {}) {
  const defaults = bindings ?? {
    agents: {
      "phase-implementer": [
        { file: "AGENT-INSTRUCTIONS/BUILDING/REPO-RULES.md", sections: ["0", "3"] },
        { file: "AGENT-INSTRUCTIONS/BUILDING/VERIFICATION-COMMITS-DEPLOY.md" },
        { file: "AGENT-INSTRUCTIONS/CURRENT-SCOPE.md", optional: true },
      ],
      "phase-advancer": [{ file: "AGENT-INSTRUCTIONS/BUILDING/MISSING.md" }],
      "finding-judge": [],
      ...agents,
    },
  }
  const defaultsFile = path.join(root, "bindings.default.json")
  const localFile = path.join(root, "bindings.json")
  writeFileSync(defaultsFile, JSON.stringify(defaults))
  writeFileSync(localFile, JSON.stringify({ workspaces }))

  const captured = { hook: null, tools: [], asserted: [], skills: [], commands: [], prompts: [], messages: [] }
  const store = new Map()
  const ctx = {
    options: { bindings: localFile, defaults: defaultsFile, workflow: workflowRepo() },
    location: { directory: root },
    storage: {
      get: async (key) => store.get(key),
      set: async (key, value) => store.set(key, value),
    },
    skill: {
      transform: async (callback) => {
        callback({ add: (skill) => captured.skills.push(skill) })
        return { dispose: async () => {} }
      },
      reload: async () => {},
    },
    command: {
      transform: async (callback) => {
        callback({ add: (command) => captured.commands.push(command) })
        return { dispose: async () => {} }
      },
    },
    session: {
      get: async () => ({ location: { directory: root } }),
      context: async () => captured.messages,
      prompt: async (input) => captured.prompts.push(input),
      hook: async (name, callback) => {
        if (name === "context") captured.hook = callback
        return { dispose: async () => {} }
      },
    },
    tool: {
      transform: async (callback) => {
        callback({
          add: (tool) => captured.tools.push(tool),
          namespace: () => {},
        })
        return { dispose: async () => {} }
      },
    },
    permission: {
      assert: async (input) => captured.asserted.push(input),
      hook: async (name, callback) => {
        if (name === "evaluate") captured.evaluate = callback
        return { dispose: async () => {} }
      },
    },
  }
  return { ctx, captured }
}

const roots = {
  main: workspace(),
  other: workspace(),
}

const { ctx, captured } = harness(roots.main, { workspaces: [roots.main] })
await plugin.setup(ctx)
check("setup registers a context hook", typeof captured.hook === "function")
check("setup registers one tool", captured.tools.length === 1 && captured.tools[0].name === "phase_new")

const run = async (sessionID, agent, directory = roots.main) => {
  const event = { sessionID, agent, system: [], messages: [], tools: {}, options: {} }
  const previous = ctx.session.get
  ctx.session.get = async () => ({ location: { directory } })
  await captured.hook(event)
  ctx.session.get = previous
  return event
}

const implemented = await run("s1", "phase-implementer")
const injected = implemented.system.map((part) => part.text).join("\n")
check("injects the requested sections", injected.includes("method zero") && injected.includes("method three"))
check("omits sections that were not requested", !injected.includes("domain one") && !injected.includes("domain two"))
check("injects a whole file when no sections are named", injected.includes("verification rules"))
check("injects an optional file that exists", injected.includes("current scope"))
check("marks the source of each part", injected.includes("<!-- role-context: AGENT-INSTRUCTIONS/BUILDING/REPO-RULES.md -->"))

const judge = await run("s2", "finding-judge")
check("an agent with no entries gets no context", judge.system.length === 0)

const unknown = await run("s3", "seam-scout")
check("an agent absent from the matrix gets no context", unknown.system.length === 0)

const outsider = await run("s4", "phase-implementer", roots.other)
check("a workspace outside the bindings gets no context", outsider.system.length === 0)

// setup-repo adds a workspace while the service runs, so the next request must see the change.
const late = harness(roots.main, { workspaces: [] })
await plugin.setup(late.ctx)
const before = await (async () => {
  const event = { sessionID: "s-late", agent: "phase-implementer", system: [], messages: [], tools: {}, options: {} }
  await late.captured.hook(event)
  return event.system.length
})()
check("an unregistered workspace gets nothing", before === 0)
writeFileSync(
  path.join(roots.main, "bindings.json"),
  JSON.stringify({ workspaces: [roots.main] }),
)
const after = await (async () => {
  const event = { sessionID: "s-late", agent: "phase-implementer", system: [], messages: [], tools: {}, options: {} }
  await late.captured.hook(event)
  return event.system.length
})()
check("a workspace registered while running is picked up without a restart", after > 0)

let missingThrew = false
const missing = harness(roots.main, {
  agents: { "phase-implementer": [{ file: "AGENT-INSTRUCTIONS/BUILDING/NOPE.md" }] },
})
await plugin.setup(missing.ctx)
try {
  await missing.captured.hook({
    sessionID: "s5",
    agent: "phase-implementer",
    system: [],
    messages: [],
    tools: {},
    options: {},
  })
} catch {
  missingThrew = true
}
check("a missing required file fails loudly", missingThrew)

const optional = harness(roots.main, {
  agents: { "phase-implementer": [{ file: "AGENT-INSTRUCTIONS/BUILDING/NOPE.md", optional: true }] },
})
await plugin.setup(optional.ctx)
const optionalEvent = { sessionID: "s6", agent: "phase-implementer", system: [], messages: [], tools: {}, options: {} }
await optional.captured.hook(optionalEvent)
check("a missing optional file is skipped", optionalEvent.system.length === 0)

const evaluate = async (sessionID, command, directory = roots.main) => {
  const event = { sessionID, action: "shell", resources: [command], effect: "allow" }
  const previous = ctx.session.get
  ctx.session.get = async () => ({ location: { directory } })
  await captured.evaluate(event)
  ctx.session.get = previous
  return event
}

const denied = await evaluate("s10", "sed -i 's/a/b/' AGENT-INSTRUCTIONS/BUILDING/REPO-RULES.md")
check("denies an in-place edit of shared text", denied.effect === "deny")
check("explains why it was denied", /symlink/.test(denied.message ?? ""))
check("denies perl -i too", (await evaluate("s11", "perl -pi -e 's/a/b/' AGENT-INSTRUCTIONS/PLANNING/README.md")).effect === "deny")
check("denies a move onto a shared file link", (await evaluate("s12", "mv draft.md AGENTS.md")).effect === "deny")
check("allows a plain read", (await evaluate("s13", "sed -n '1,20p' AGENT-INSTRUCTIONS/BUILDING/REPO-RULES.md")).effect === "allow")
check("allows an ordinary command", (await evaluate("s14", "git status --short")).effect === "allow")
check("leaves an ungoverned workspace alone", (await evaluate("s15", "sed -i 's/a/b/' AGENT-INSTRUCTIONS/BUILDING/REPO-RULES.md", roots.other)).effect === "allow")

check("denies an in-place edit of AGENTS.md", (await evaluate("s16", "sed -i 's/a/b/' AGENTS.md")).effect === "deny")
check("allows an in-place edit of product code", (await evaluate("s17", "sed -i 's/a/b/' src/foo.py")).effect === "allow")
check("names the skill in a shell refusal before it is loaded", /agent-instructions/.test(denied.message ?? ""))
const writes = [
  "cat > AGENT-INSTRUCTIONS/LOCAL/publish.md <<'E'",
  "echo x >> AGENT-INSTRUCTIONS/BUILDING/REPO-RULES.md",
  "printf x | tee -a AGENT-INSTRUCTIONS/README.md",
  "python3 -c \"open('AGENT-INSTRUCTIONS/LOCAL/gates.md','w').write('x')\"",
  "cp draft.md /w/AGENT-INSTRUCTIONS/PLANNING/phase-template.md",
]
for (const command of writes) {
  check(`denies a shell write: ${command.slice(0, 40)}`, (await evaluate("s19", command)).effect === "deny")
}
const reads = [
  "cat AGENT-INSTRUCTIONS/README.md > /tmp/copy.md",
  "grep -n rule AGENT-INSTRUCTIONS/BUILDING/REPO-RULES.md 2>/dev/null",
  "cat > AGENT-INSTRUCTIONS/PLANS/demo/docs-pass.md <<'E'",
  "echo x >> AGENT-INSTRUCTIONS/ORCHESTRATOR-HANDOFF.md",
  "python3 -c \"open('AGENT-INSTRUCTIONS/CURRENT-SCOPE.md','w')\"",
]
for (const command of reads) {
  check(`allows: ${command.slice(0, 40)}`, (await evaluate("s20", command)).effect === "allow")
}
check("denies the long in-place flag", (await evaluate("s18", "sed --in-place 's/a/b/' AGENT-INSTRUCTIONS/BUILDING/REPO-RULES.md")).effect === "deny")
// A workflow command marks its session, and the session then receives the role's files.
const roled = harness(roots.main, {
  bindings: {
    agents: { build: [{ file: "AGENT-INSTRUCTIONS/CURRENT-SCOPE.md" }] },
    roles: {
      release: [
        { file: "AGENT-INSTRUCTIONS/CURRENT-SCOPE.md" },
        { file: "AGENT-INSTRUCTIONS/BUILDING/VERIFICATION-COMMITS-DEPLOY.md" },
      ],
    },
  },
})
await plugin.setup(roled.ctx)
const release = roled.captured.commands.find((command) => command.name === "release")
check("registers the workflow commands", release?.description === "Release")
const ask = async (sessionID) => {
  const event = { sessionID, agent: "build", system: [], messages: [], tools: {}, options: {} }
  await roled.captured.hook(event)
  return event.system.map((part) => part.text).join("\n")
}
check("a plain session gets no role files", !(await ask("r1")).includes("verification rules"))
await release.execute({ sessionID: "r1", prompt: { text: "for plan x" }, delivery: "steer" })
check("the command sends its prompt with the arguments", roled.captured.prompts.at(-1)?.text === "Act as release orchestrator. for plan x")
const roleText = await ask("r1")
check("a marked session gets the role files", roleText.includes("verification rules"))
check("a file the agent already gets is not repeated", roleText.split("current scope").length === 2)

const skill = roled.captured.skills.find((entry) => entry.id === "debugging")
check("a skill carries its guidance and the shared text", skill?.content.includes("Follow the loop.") && skill.content.includes("debugging loop text"))

// Edits to the instruction tree are held until the session has loaded the agent-instructions skill.
const edit = async (sessionID, file) => {
  const event = { sessionID, action: "edit", resources: [file], effect: "allow" }
  await roled.captured.evaluate(event)
  return event
}
const held = await edit("e1", path.join(roots.main, "AGENT-INSTRUCTIONS/BUILDING/REPO-RULES.md"))
check("holds an instruction edit before the skill is loaded", held.effect === "deny" && /agent-instructions/.test(held.message))
check("leaves plan files editable", (await edit("e1", path.join(roots.main, "AGENT-INSTRUCTIONS/PLANS/x/full-plan.md"))).effect === "allow")
check("leaves the scope fence and the handoff editable", (await edit("e1", path.join(roots.main, "AGENT-INSTRUCTIONS/CURRENT-SCOPE.md"))).effect === "allow" && (await edit("e1", path.join(roots.main, "AGENT-INSTRUCTIONS/ORCHESTRATOR-HANDOFF.md"))).effect === "allow")
check("leaves product files editable", (await edit("e1", path.join(roots.main, "src/app.py"))).effect === "allow")
roled.captured.messages.push({
  type: "assistant",
  content: [{ type: "tool", name: "skill", state: { status: "completed", input: { id: "agent-instructions" } } }],
})
check("allows the edit once the model has loaded the skill", (await edit("e1", path.join(roots.main, "AGENTS.md"))).effect === "allow")
check("allows the edit in a session whose user attached the skill", (await (async () => {
  roled.captured.messages.splice(0, roled.captured.messages.length, { type: "skill", skill: "agent-instructions" })
  return edit("e2", path.join(roots.main, "AGENTS.md"))
})()).effect === "allow")

check("orders entries star, agent, role", entriesFor({ agents: { "*": [{ file: "a" }], x: [{ file: "b" }] }, roles: { r: [{ file: "c" }] } }, "x", "r").map((e) => e.file).join() === "a,b,c")
check("appends arguments when the body names no place", renderCommand("Body", "extra") === "Body\n\nextra")
check("treats the workflow repository's instructions as instruction paths", isInstructionPath("/w/AGENT-INSTRUCTIONS/README.md", "/c", "/w"))

const sections = splitSections(RULES)
check("splits numbered sections", ["0", "1", "2", "3"].every((id) => sections.sections.has(id)))
check("keeps the preamble out of the sections", sections.preamble.includes("# Rules"))
check("selects in the requested order", selectSections(RULES, ["3", "0"]).indexOf("method three") < selectSections(RULES, ["3", "0"]).indexOf("method zero"))
let unknownSectionThrew = false
try {
  selectSections(RULES, ["9"], "rules")
} catch {
  unknownSectionThrew = true
}
check("an unknown section fails loudly", unknownSectionThrew)
check("selects a section by its title too", selectSections(RULES, ["code style"]).includes("method three"))
let unknownTitleThrew = false
try {
  selectSections(RULES, ["no such section"], "rules")
} catch {
  unknownTitleThrew = true
}
check("an unknown title fails loudly", unknownTitleThrew)

check("matches whole path segments", isPathPrefix(["/a", "b"], ["/a", "b", "c"]) && !isPathPrefix(["/a", "b"], ["/a", "bc"]))
check("renders the product skeleton by default", renderPhase(TEMPLATE, { id: "P1", title: "Thing" }).includes("**Scope:**"))
check("renders the experiment skeleton on request", renderPhase(TEMPLATE, { id: "E1", title: "Thing", kind: "experiment" }).includes("**Question:**"))
check("substitutes the id and title", renderPhase(TEMPLATE, { id: "P1", title: "Thing" }).includes("## Phase P1 - Thing"))

const phaseTool = captured.tools[0]
const created = await phaseTool.execute(
  { plan: "demo", id: "P1", title: "Wire the thing" },
  { sessionID: "s7", messageID: "m1", id: "t1" },
)
const phaseFile = path.join(roots.main, "AGENT-INSTRUCTIONS/PLANS/demo/phases/P1-wire-the-thing.md")
check("phase_new writes the phase document", readFileSync(phaseFile, "utf8").includes("## Phase P1 - Wire the thing"))
check("phase_new reports the created path", created.content.includes("P1-wire-the-thing.md"))
check("phase_new asks for edit permission on the target", captured.asserted.at(-1)?.resources.includes(phaseFile))

let duplicateThrew = false
try {
  await phaseTool.execute({ plan: "demo", id: "P1", title: "Wire the thing" }, { sessionID: "s7", messageID: "m2", id: "t2" })
} catch {
  duplicateThrew = true
}
check("phase_new refuses to overwrite an existing phase", duplicateThrew)

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)
