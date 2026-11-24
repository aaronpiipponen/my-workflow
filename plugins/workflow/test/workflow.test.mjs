// Verify the workflow plugin against a mock OpenCode context.
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

import plugin, {
  commitRoot,
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

// A Git checkout on branch `demo`, the plan whose folder holds the scope.
function workspace(shape = {}) {
  const root = mkdtempSync(path.join(tmpdir(), "wf-"))
  const files = {
    "AGENT-INSTRUCTIONS/BUILDING/REPO-RULES.md": RULES,
    "AGENT-INSTRUCTIONS/BUILDING/VERIFICATION-COMMITS-DEPLOY.md": "verification rules\n",
    "AGENT-INSTRUCTIONS/PLANS/demo/scope.md": "current scope\n",
    "AGENT-INSTRUCTIONS/PLANNING/phase-template.md": TEMPLATE,
    "AGENT-INSTRUCTIONS/LOCAL/workspace.json": JSON.stringify({ integration: "main", resources: [] }),
    ...shape,
  }
  for (const [relative, text] of Object.entries(files)) {
    const file = path.join(root, relative)
    mkdirSync(path.dirname(file), { recursive: true })
    writeFileSync(file, text)
  }
  execFileSync("git", ["-C", root, "init", "-q", "-b", "demo"])
  return root
}

// Build a workflow repository with one skill and one command, beside its workspace.
function workflowRepo() {
  const root = mkdtempSync(path.join(tmpdir(), "wf-repo-"))
  const files = {
    "AGENT-INSTRUCTIONS/BUILDING/DEBUGGING.md": "debugging loop text\n",
    "skills/debugging/SKILL.md":
      "---\nname: Debugging\ndescription: Diagnose bugs.\nsource: AGENT-INSTRUCTIONS/BUILDING/DEBUGGING.md\n---\n\nFollow the loop.\n",
    "commands/release.md": "---\ndescription: Release\nworktree: plan\n---\n\nAct as release orchestrator. $ARGUMENTS\n",
    "commands/plan.md": "---\ndescription: Plan\nworktree: plan\n---\n\nAct as plan orchestrator. This plan: $ARGUMENTS\n",
    // Links each worktree's `AGENT-INSTRUCTIONS` to the root, the part of the real setup script a
    // new plan needs; the real script also registers the workspace in the workflow repository.
    "setup/setup-workspace.py": [
      "import os, sys",
      "from pathlib import Path",
      "root = Path(sys.argv[1])",
      "for tree in root.iterdir():",
      "    link = tree / 'AGENT-INSTRUCTIONS'",
      "    if (tree / '.git').is_file() and not link.exists():",
      "        link.symlink_to(root / 'AGENT-INSTRUCTIONS')",
      "",
    ].join("\n"),
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
        { file: "AGENT-INSTRUCTIONS/PLANS/{plan}/scope.md", optional: true },
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

  const captured = { hook: null, tools: [], asserted: [], skills: [], commands: [], prompts: [], messages: [], skillReloads: 0, moves: [], notes: [], events: [], directories: new Map(), agents: new Map(), metadata: new Map(), models: new Map(), created: 0 }
  const store = new Map()
  const directories = captured.directories
  const ctx = {
    options: { bindings: localFile, defaults: defaultsFile, workflow: workflowRepo() },
    location: { directory: root },
    rpc: {
      register: async (_definition, handlers) => {
        captured.rpc = handlers
        return { events: { emit: async (name, data) => captured.events.push({ name, data }) } }
      },
    },
    storage: {
      get: async (key) => store.get(key),
      set: async (key, value) => store.set(key, value),
    },
    skill: {
      transform: async (callback) => {
        callback({ add: (skill) => captured.skills.push(skill) })
        return { dispose: async () => {} }
      },
      reload: async () => {
        captured.skillReloads++
      },
    },
    command: {
      transform: async (callback) => {
        callback({ add: (command) => captured.commands.push(command) })
        return { dispose: async () => {} }
      },
    },
    session: {
      get: async ({ sessionID }) => ({
        location: { directory: directories.get(sessionID) ?? root },
        agent: captured.agents.get(sessionID) ?? "build",
        metadata: captured.metadata.get(sessionID) ?? {},
      }),
      update: async ({ sessionID, metadata }) => captured.metadata.set(sessionID, metadata),
      create: async (input) => {
        captured.created += 1
        const id = `new-${captured.created}`
        captured.directories.set(id, input.location?.directory ?? root)
        captured.agents.set(id, input.agent ?? "build")
        captured.metadata.set(id, input.metadata ?? {})
        captured.models.set(id, input.model)
        return { id }
      },
      move: async ({ sessionID, directory }) => {
        captured.moves.push({ sessionID, directory })
        directories.set(sessionID, directory)
      },
      synthetic: async (input) => captured.notes.push(input),
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
check("injects the scope of the branch's plan", injected.includes("<!-- role-context: AGENT-INSTRUCTIONS/PLANS/demo/scope.md -->\ncurrent scope"))
check("marks the source of each part", injected.includes("<!-- role-context: AGENT-INSTRUCTIONS/BUILDING/REPO-RULES.md -->"))
execFileSync("git", ["-C", roots.other, "checkout", "-q", "-b", "no-plan"])
const planless = harness(roots.other)
await plugin.setup(planless.ctx)
const planlessEvent = { sessionID: "s-np", agent: "phase-implementer", system: [], messages: [], tools: {}, options: {} }
await planless.captured.hook(planlessEvent)
const planlessText = planlessEvent.system.map((part) => part.text).join("\n")
check("a branch without a plan folder gets no plan files", planlessText.includes("method zero") && !planlessText.includes("current scope"))

const judge = await run("s2", "finding-judge")
check("an agent with no entries gets no context", judge.system.length === 0)

const unknown = await run("s3", "seam-scout")
check("an agent absent from the matrix gets no context", unknown.system.length === 0)

const outsider = await run("s4", "phase-implementer", roots.other)
check("a workspace outside the bindings gets no context", outsider.system.length === 0)

const beforeMove = await run("s-move", "phase-implementer", roots.main)
const afterMove = await run("s-move", "phase-implementer", roots.other)
check("a moved session follows its new directory", beforeMove.system.length > 0 && afterMove.system.length === 0)

// Check that a workspace registered while the service runs takes effect on the next request.
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

// Check that an edit reaches a fresh session at once, but a snapshotted one only on reload.
const snapRoot = workspace()
const snap = harness(snapRoot, {
  agents: { build: [{ file: "AGENT-INSTRUCTIONS/BUILDING/REPO-RULES.md", sections: ["0"] }] },
})
await plugin.setup(snap.ctx)
const snapRun = async (sessionID) => {
  const event = { sessionID, agent: "build", system: [], messages: [], tools: {}, options: {} }
  await snap.captured.hook(event)
  return event.system.map((part) => part.text).join("\n")
}
const initial = await snapRun("snap-a")
await snapRun("snap-other")
check("a session snapshots the injected text", initial.includes("method zero"))
snap.ctx.session.get = async () => ({ location: { directory: snapRoot } })
writeFileSync(path.join(snapRoot, "AGENT-INSTRUCTIONS/BUILDING/REPO-RULES.md"), "# Rules\n\n## 0. Changed\n\nnew method\n")
check("an edit does not change an existing session's prefix", (await snapRun("snap-a")).includes("method zero"))
check("a fresh session reads the edited file", (await snapRun("snap-b")).includes("new method"))
check("no skill reload happened on ordinary requests", snap.captured.skillReloads === 0)
const reloadCommand = snap.captured.commands.find((command) => command.name === "workflow-reload")
check("registers /workflow-reload", typeof reloadCommand?.execute === "function")
await reloadCommand.execute({ sessionID: "snap-a" })
check("/workflow-reload reloads the skill registry once", snap.captured.skillReloads === 1)
check("/workflow-reload updates the existing session", (await snapRun("snap-a")).includes("new method"))
check("/workflow-reload leaves every other session's snapshot alone", (await snapRun("snap-other")).includes("method zero"))

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

mkdirSync(path.join(roots.main, "AGENT-INSTRUCTIONS", "LOCAL"), { recursive: true })
writeFileSync(path.join(roots.main, "AGENT-INSTRUCTIONS", "LOCAL", "emptied.md"), "\n")
const emptied = harness(roots.main, {
  agents: { "phase-implementer": [{ file: "AGENT-INSTRUCTIONS/LOCAL/emptied.md", optional: true, sections: ["1"] }] },
})
await plugin.setup(emptied.ctx)
const emptiedEvent = { sessionID: "s6e", agent: "phase-implementer", system: [], messages: [], tools: {}, options: {} }
await emptied.captured.hook(emptiedEvent)
check("an emptied slot injects nothing, even where sections are selected", emptiedEvent.system.length === 0)

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
  "echo x >> AGENT-INSTRUCTIONS/PLANS/demo/handoff.md",
  "python3 -c \"open('AGENT-INSTRUCTIONS/PLANS/demo/scope.md','w')\"",
]
for (const command of reads) {
  check(`allows: ${command.slice(0, 40)}`, (await evaluate("s20", command)).effect === "allow")
}
check("denies the long in-place flag", (await evaluate("s18", "sed --in-place 's/a/b/' AGENT-INSTRUCTIONS/BUILDING/REPO-RULES.md")).effect === "deny")
// Check that a workflow command marks its session for role file delivery.
const roled = harness(roots.main, {
  bindings: {
    agents: { build: [{ file: "AGENT-INSTRUCTIONS/PLANS/{plan}/scope.md" }] },
    roles: {
      release: [
        { file: "AGENT-INSTRUCTIONS/PLANS/{plan}/scope.md" },
        { file: "AGENT-INSTRUCTIONS/BUILDING/VERIFICATION-COMMITS-DEPLOY.md" },
      ],
    },
  },
})
await plugin.setup(roled.ctx)
// A release runs in a worktree, not in the workspace root.
const releaseTree = path.join(roots.main, "main")
mkdirSync(releaseTree, { recursive: true })
symlinkSync(path.join(roots.main, "AGENT-INSTRUCTIONS"), path.join(releaseTree, "AGENT-INSTRUCTIONS"))
roled.captured.directories.set("r1", releaseTree)
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

// Check that instruction edits are held until the agent-instructions skill is loaded.
const edit = async (sessionID, file) => {
  const event = { sessionID, action: "edit", resources: [file], effect: "allow" }
  await roled.captured.evaluate(event)
  return event
}
const held = await edit("e1", path.join(roots.main, "AGENT-INSTRUCTIONS/BUILDING/REPO-RULES.md"))
check("holds an instruction edit before the skill is loaded", held.effect === "deny" && /agent-instructions/.test(held.message))
check("leaves plan files editable", (await edit("e1", path.join(roots.main, "AGENT-INSTRUCTIONS/PLANS/x/full-plan.md"))).effect === "allow")
check("holds an edit named through the root's real folder", isInstructionPath("/r/AGENT-INSTRUCTIONS/LOCAL/gates.md", "/r/plan-a", "/w", "/r"))
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

// A workspace root with a project repository, the integration branch's worktree and the plan
// templates, for /plan-new and the /plan move.
const git = (cwd, ...args) => execFileSync("git", ["-C", cwd, "-c", "user.email=t@t", "-c", "user.name=t", ...args], { encoding: "utf8" }).trim()
const space = mkdtempSync(path.join(tmpdir(), "wf-space-"))
const seed = path.join(space, "seed")
mkdirSync(seed)
git(seed, "init", "-q", "-b", "main")
writeFileSync(path.join(seed, "app.py"), "print(1)\n")
git(seed, "add", "app.py")
git(seed, "commit", "-q", "-m", "start")
git(space, "clone", "-q", "--bare", seed, "project.git")
const templates = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..", "..", "AGENT-INSTRUCTIONS", "PLANNING", "plan-templates")
for (const name of ["full-plan.md", "scope.md", "handoff.md"].flatMap((file) => [file, `shadow/${file}`])) {
  const target = path.join(space, "AGENT-INSTRUCTIONS", "PLANNING", "plan-templates", name)
  mkdirSync(path.dirname(target), { recursive: true })
  writeFileSync(target, readFileSync(path.join(templates, name), "utf8"))
}
writeFileSync(path.join(space, "AGENT-INSTRUCTIONS", "PLANNING", "README.md"), "planning\n")
for (const folder of ["archive", "shared"]) mkdirSync(path.join(space, "AGENT-INSTRUCTIONS", "PLANS", folder), { recursive: true })
mkdirSync(path.join(space, "AGENT-INSTRUCTIONS", "LOCAL"), { recursive: true })
writeFileSync(path.join(space, "AGENT-INSTRUCTIONS", "LOCAL", "workspace.json"), JSON.stringify({ integration: "main", resources: [] }))
const modelsFile = path.join(space, "AGENT-INSTRUCTIONS", "LOCAL", "models.json")
const sessionModels = {
  plan: { model: "prov/plan-model", variant: "high" },
  release: { model: "prov/team/release-model" },
  shadow: { model: "prov/shadow-model", variant: "low" },
}
writeFileSync(modelsFile, JSON.stringify({ opencode: {}, sessions: sessionModels }))

const spaced = harness(space)
await plugin.setup(spaced.ctx)
const planNew = (name) => spaced.captured.rpc.planNew({ directory: space, name })
const made = await planNew("plan-x")
check("plan-new reports the created plan", made.message.startsWith("Created plan plan-x: branch plan-x from main"), made.message)
check("plan-new branches from the integration branch", git(path.join(space, "project.git"), "rev-parse", "plan-x") === git(path.join(space, "project.git"), "rev-parse", "main"))
check("plan-new checks the branch out in a worktree in the root", git(path.join(space, "plan-x"), "symbolic-ref", "--short", "HEAD") === "plan-x")
check("plan-new links the worktree through the setup script", readFileSync(path.join(space, "plan-x", "AGENT-INSTRUCTIONS", "LOCAL", "workspace.json"), "utf8").includes("main"))
const newPlan = (file) => readFileSync(path.join(space, "AGENT-INSTRUCTIONS", "PLANS", "plan-x", file), "utf8")
check("plan-new writes the starting files from the templates", newPlan("full-plan.md").startsWith("# plan-x\n") && newPlan("full-plan.md").includes("| Phase | Title | Status |") && newPlan("handoff.md").includes("## Learned rules") && newPlan("scope.md").includes("`plan-x`"))
check("plan-new refuses an existing plan", (await planNew("plan-x")).message.includes("already exists"))
check("plan-new refuses a reserved name", (await planNew("shared")).message.includes("reserved"))
check("plan-new refuses an invalid branch name", (await planNew("bad..name")).message.includes("not a valid branch name"))
check("plan-new refuses a directory outside a workspace", (await spaced.captured.rpc.planNew({ directory: tmpdir(), name: "y" })).message.includes("not in a workspace"))

const planCommand = spaced.captured.commands.find((command) => command.name === "plan")
const releaseCommand = spaced.captured.commands.find((command) => command.name === "release")
const prompts = spaced.captured.prompts
const last = () => prompts.at(-1)
const runCommand = async (command, sessionID, text) => {
  try {
    await command.execute({ sessionID, prompt: { text }, delivery: "steer" })
    return null
  } catch (error) {
    return error.message
  }
}

check(
  "/plan without a name opens the plan picker",
  await (async () => {
    const result = await runCommand(planCommand, "p1", "")
    const event = spaced.captured.events.at(-1)
    return result === null && event?.name === "pickPlan" && event.data.action === "plan" && event.data.plans.join() === "plan-x" && !prompts.length
  })(),
)
const unknownPlan = await runCommand(planCommand, "p1", "plan-y")
check("/plan with an unknown plan fails visibly", unknownPlan?.includes("plan-y is not a plan") && !spaced.captured.created && !prompts.length)
const planned = await runCommand(planCommand, "p1", "plan-x build the thing")
check(
  "/plan in the root starts a new session in the plan's worktree",
  planned === null && spaced.captured.created === 1 && last().sessionID === "new-1" && spaced.captured.directories.get("new-1") === path.join(space, "plan-x"),
)
check("/plan sends the rest of the words to the new session", last().text === "Act as plan orchestrator. This plan: build the thing")
check("/plan records the plan role on the new session and leaves the root chat alone", spaced.captured.metadata.get("new-1")?.workflowRole === "plan" && !spaced.captured.metadata.get("p1"))
check("/plan opens the new session", spaced.captured.events.at(-1)?.name === "started" && spaced.captured.events.at(-1).data.sessionID === "new-1")
check("/plan's new session runs on the workspace's plan model", JSON.stringify(spaced.captured.models.get("new-1")) === JSON.stringify({ providerID: "prov", id: "plan-model", variant: "high" }))
const secondPlan = await runCommand(planCommand, "new-1", "more")
check("/plan refuses a session that already runs a role", secondPlan?.includes("already runs the plan role") && spaced.captured.created === 1)
spaced.captured.directories.set("p2", path.join(space, "plan-x"))
const here = await runCommand(planCommand, "p2", "more")
check("/plan in a plan's worktree runs in the session", here === null && spaced.captured.created === 1 && last().sessionID === "p2" && last().text === "Act as plan orchestrator. This plan: more")
spaced.captured.directories.set("p3", space)
spaced.captured.agents.set("p3", "coordinator")
const coord = await runCommand(planCommand, "p3", "plan-x")
check("/plan refuses the coordinator", coord?.includes("the coordinator cannot run /plan") && spaced.captured.created === 1)
spaced.captured.directories.set("p3s", path.join(space, "plan-x"))
spaced.captured.metadata.set("p3s", { shadowOrchestrator: true })
const shadowChat = await runCommand(releaseCommand, "p3s", "")
check("/release refuses a shadow orchestrator's session in a plan's worktree", shadowChat?.includes("a shadow orchestrator cannot run /release") && !spaced.captured.metadata.get("p3s")?.workflowRole)

const mainTree = path.join(space, "main")
git(path.join(space, "project.git"), "worktree", "add", "-q", "../main", "main")
symlinkSync(path.join(space, "AGENT-INSTRUCTIONS"), path.join(mainTree, "AGENT-INSTRUCTIONS"))
spaced.captured.directories.set("p4", mainTree)
const fromMain = await runCommand(planCommand, "p4", "plan-x")
check(
  "/plan in the integration worktree starts a new session in the plan's worktree",
  fromMain === null && spaced.captured.created === 2 && last().sessionID === "new-2" && spaced.captured.directories.get("new-2") === path.join(space, "plan-x"),
)

spaced.captured.directories.set("p5", space)
const releasePicker = await runCommand(releaseCommand, "p5", "")
check("/release without a name opens the release picker", releasePicker === null && spaced.captured.events.at(-1)?.name === "pickPlan" && spaced.captured.events.at(-1).data.action === "release")
const released = await runCommand(releaseCommand, "p5", "plan-x close it")
check(
  "/release from the root starts a new session in the plan's worktree",
  released === null && spaced.captured.created === 3 && last().sessionID === "new-3" && spaced.captured.directories.get("new-3") === path.join(space, "plan-x"),
)
check("/release sends its words to the new session", last().text === "Act as release orchestrator. close it")
check("/release records the release role on the new session", spaced.captured.metadata.get("new-3")?.workflowRole === "release")
spaced.captured.directories.set("p6", path.join(space, "plan-x"))
const releaseHere = await runCommand(releaseCommand, "p6", "")
check("/release in a plan's worktree runs in the session", releaseHere === null && spaced.captured.created === 3 && last().sessionID === "p6")
spaced.captured.directories.set("p7", mainTree)
const hotfix = await runCommand(releaseCommand, "p7", "")
check(
  "/release in the integration worktree starts a hotfix session there",
  hotfix === null && spaced.captured.created === 4 && last().sessionID === "new-4" && spaced.captured.directories.get("new-4") === mainTree && spaced.captured.metadata.get("new-4")?.workflowRole === "release",
)
check("a hotfix runs on the release model, whose id keeps its slashes", JSON.stringify(spaced.captured.models.get("new-4")) === JSON.stringify({ providerID: "prov", id: "team/release-model" }))
const otherTree = path.join(space, "other")
git(path.join(space, "project.git"), "worktree", "add", "-q", "-b", "other", "../other", "main")
symlinkSync(path.join(space, "AGENT-INSTRUCTIONS"), path.join(otherTree, "AGENT-INSTRUCTIONS"))
spaced.captured.directories.set("p8", otherTree)
const random = await runCommand(releaseCommand, "p8", "")
check("/release refuses a worktree that is neither", random?.includes("run /release from the workspace root, the integration worktree or a plan's worktree"))

// /shadow-plan: the filled one-phase templates, the workspace's own fence, and the working session.
writeFileSync(path.join(space, "AGENT-INSTRUCTIONS", "LOCAL", "shadow-scope.md"), "## This workspace's shadow plan rules\n\nNever edit TODO.md.\n")
const shadowMade = await spaced.captured.rpc.planNew({ directory: space, name: "shadow-x", kind: "shadow" })
const shadowPlan = (file) => readFileSync(path.join(space, "AGENT-INSTRUCTIONS", "PLANS", "shadow-x", file), "utf8")
check("shadow-plan reports the plan and its session", shadowMade.message.startsWith("Created shadow plan shadow-x: branch shadow-x from main") && shadowMade.message.includes("/shadow-register"), shadowMade.message)
check("shadow-plan writes one active cleanup phase", /\| S1 \| [^|]+ \| active \|/.test(shadowPlan("full-plan.md")) && shadowPlan("full-plan.md").startsWith("# shadow-x\n"))
check("shadow-plan appends the workspace's own fence to the scope", shadowPlan("scope.md").includes("`shadow-x`") && shadowPlan("scope.md").trimEnd().endsWith("Never edit TODO.md."))
check(
  "shadow-plan opens a working session with no role in the worktree",
  spaced.captured.directories.get(`new-${spaced.captured.created}`) === path.join(space, "shadow-x") &&
    !spaced.captured.metadata.get(`new-${spaced.captured.created}`)?.workflowRole &&
    spaced.captured.events.at(-1)?.name === "started",
)
check("shadow-plan's session runs on the shadow model", JSON.stringify(spaced.captured.models.get(`new-${spaced.captured.created}`)) === JSON.stringify({ providerID: "prov", id: "shadow-model", variant: "low" }))
writeFileSync(modelsFile, JSON.stringify({ opencode: {}, sessions: { plan: sessionModels.plan, release: sessionModels.release } }))
const noShadowModel = await spaced.captured.rpc.planNew({ directory: space, name: "shadow-y", kind: "shadow" })
check(
  "shadow-plan without a shadow model fails before creating anything",
  noShadowModel.message.includes('no "sessions" model for "shadow"') && !existsSync(path.join(space, "shadow-y")) && !existsSync(path.join(space, "AGENT-INSTRUCTIONS", "PLANS", "shadow-y")),
)
writeFileSync(modelsFile, JSON.stringify({ opencode: {}, sessions: { release: sessionModels.release } }))
spaced.captured.directories.set("p9", space)
const noPlanModel = await runCommand(planCommand, "p9", "plan-x")
check("/plan without a plan model fails, naming the missing entry", noPlanModel?.includes('no "sessions" model for "plan"'))
writeFileSync(modelsFile, JSON.stringify({ opencode: {}, sessions: { ...sessionModels, plan: { model: "no-provider" } } }))
check("a model without a provider fails", (await runCommand(planCommand, "p9", "plan-x"))?.includes('must be "<provider>/<model>"'))
check("shadow-plan refuses an unknown kind", (await spaced.captured.rpc.planNew({ directory: space, name: "z", kind: "other" })).message.includes('unknown plan kind "other"'))

// Check that the workspace root's changes are committed, and an unchanged root makes no commit.
const commitDir = workspace()
execFileSync("git", ["-C", commitDir, "config", "user.email", "test@example.com"])
execFileSync("git", ["-C", commitDir, "config", "user.name", "Test"])
check("commits a changed root", await commitRoot(commitDir, "Record a round of test"))
const subject = execFileSync("git", ["-C", commitDir, "log", "-1", "--format=%s"], { encoding: "utf8" }).trim()
check("names the round in the commit", subject === "Record a round of test")
check("makes no commit when nothing changed", !(await commitRoot(commitDir, "Record a round of test")))

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)
