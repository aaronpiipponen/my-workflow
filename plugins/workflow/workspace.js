// A workspace's settings, its plans, and the creation of a new plan with its branch and worktree.
//
// A plan is a folder under `AGENT-INSTRUCTIONS/PLANS/` of the workspace root, a branch of the same
// name in `project.git`, and that branch's worktree in the root. `PLANS/archive/` holds closed plans
// and `PLANS/shared/` the designs two plans agreed on, so neither name is a plan.

import { execFile } from "node:child_process"
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { promisify } from "node:util"

const run = promisify(execFile)
const RESERVED = new Set(["archive", "shared"])
// The files a new plan starts with, filled from `PLANNING/plan-templates/` with `{plan}` replaced.
const PLAN_FILES = ["full-plan.md", "scope.md", "handoff.md"]
const KINDS = new Set(["plan", "shadow"])

/** Read the workspace settings: the integration branch and the lockable resources. */
export function readSettings(root) {
  const file = path.join(root, "AGENT-INSTRUCTIONS", "LOCAL", "workspace.json")
  if (!existsSync(file)) throw new Error(`${file} is missing; copy it from setup/local.example/workspace.json`)
  let settings
  try {
    settings = JSON.parse(readFileSync(file, "utf8"))
  } catch (error) {
    throw new Error(`${file}: ${error.message}`)
  }
  if (typeof settings.integration !== "string" || !settings.integration.trim()) {
    throw new Error(`${file}: "integration" must name the integration branch`)
  }
  if (!Array.isArray(settings.resources) || settings.resources.some((name) => typeof name !== "string" || !name.trim())) {
    throw new Error(`${file}: "resources" must be a list of resource names`)
  }
  const locked = settings.locked_commands ?? {}
  if (!locked || typeof locked !== "object" || Array.isArray(locked)) {
    throw new Error(`${file}: "locked_commands" must map a resource to its shell matches and comments`)
  }
  for (const [resource, entry] of Object.entries(locked)) {
    if (!settings.resources.includes(resource)) {
      throw new Error(`${file}: "locked_commands" names "${resource}", which is not in "resources"`)
    }
    for (const field of ["comment_free", "comment_held"]) {
      if (typeof entry?.[field] !== "string" || !entry[field].trim()) {
        throw new Error(`${file}: "${resource}" needs a non-empty "${field}"`)
      }
    }
    if (!Array.isArray(entry.shell) || !entry.shell.length) {
      throw new Error(`${file}: "${resource}" needs at least one shell pattern`)
    }
    for (const pattern of entry.shell) {
      if (typeof pattern !== "string" || !pattern.trim()) {
        throw new Error(`${file}: "${resource}" has an empty shell pattern`)
      }
      try {
        new RegExp(pattern)
      } catch (error) {
        throw new Error(`${file}: "${resource}" has an invalid shell pattern: ${error.message}`)
      }
    }
  }
  return settings
}

/** Read the workspace's `LOCAL/models.json`, or fail naming the file. */
function readModels(root) {
  const file = path.join(root, "AGENT-INSTRUCTIONS", "LOCAL", "models.json")
  if (!existsSync(file)) throw new Error(`${file} is missing; copy it from setup/local.example/models.json`)
  try {
    return { file, models: JSON.parse(readFileSync(file, "utf8")) }
  } catch (error) {
    throw new Error(`${file}: ${error.message}`)
  }
}

/** Turn one `{ model, variant }` assignment into the service's model reference. */
function modelRef(file, table, name, entry) {
  if (!entry) throw new Error(`${file} has no "${table}" model for "${name}"; add one as setup/local.example/models.json shows`)
  // The agent table also accepts the short string form gen_agents.py accepts.
  if (typeof entry === "string") entry = { model: entry }
  // The provider is the first segment; a model id may itself contain slashes.
  const slash = typeof entry.model === "string" ? entry.model.indexOf("/") : -1
  if (slash < 1 || slash === entry.model.length - 1) {
    throw new Error(`${file}: "${table}"."${name}"."model" must be "<provider>/<model>"`)
  }
  if (entry.variant !== undefined && (typeof entry.variant !== "string" || !entry.variant.trim())) {
    throw new Error(`${file}: "${table}"."${name}"."variant" must be a non-empty string when present`)
  }
  return { providerID: entry.model.slice(0, slash), id: entry.model.slice(slash + 1), ...(entry.variant ? { variant: entry.variant } : {}) }
}

/**
 * The model of a session the workflow opens for `role` (`plan`, `release` or `shadow`), from the
 * `sessions` table of the workspace's `LOCAL/models.json`, as the service's model reference. These
 * roles have no stamped agent persona; their procedure is the command text.
 */
export function sessionModel(root, role) {
  const { file, models } = readModels(root)
  return modelRef(file, "sessions", role, models.sessions?.[role])
}

/** The model of a session the coordinator plugin starts: one `sessions` entry, like the orchestrators'. */
export function coordinatorModel(root) {
  return sessionModel(root, "coordinator")
}

/** List the plans of a workspace: the folders under `PLANS/`, sorted. */
export function listPlans(root) {
  const plans = path.join(root, "AGENT-INSTRUCTIONS", "PLANS")
  if (!existsSync(plans)) return []
  return readdirSync(plans, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !RESERVED.has(entry.name))
    .map((entry) => entry.name)
    .sort()
}

/**
 * Create a plan: its branch from the integration branch, its worktree in the root linked like
 * every worktree, and its plan folder with the starting files.
 *
 * `workflow` is the workflow repository, whose `setup/setup-workspace.py` links the worktree.
 * `kind` picks the starting files: `plan` the empty templates, `shadow` the filled one-phase
 * templates of `plan-templates/shadow/`, whose `scope.md` also receives the workspace's own
 * `LOCAL/shadow-scope.md` unless that slot is missing or empty.
 */
export async function createPlan(root, name, workflow, kind = "plan") {
  if (!KINDS.has(kind)) throw new Error(`unknown plan kind "${kind}"`)
  if (!name) throw new Error("a plan needs a name")
  if (RESERVED.has(name)) throw new Error(`"${name}" is reserved under PLANS/; choose another name`)
  try {
    await run("git", ["check-ref-format", "--branch", name])
  } catch {
    throw new Error(`"${name}" is not a valid branch name`)
  }
  const folder = path.join(root, "AGENT-INSTRUCTIONS", "PLANS", name)
  const worktree = path.join(root, name)
  if (existsSync(folder)) throw new Error(`a plan named ${name} already exists`)
  if (existsSync(worktree)) throw new Error(`${worktree} already exists`)
  const { integration } = readSettings(root)
  await run("git", ["-C", path.join(root, "project.git"), "worktree", "add", "-q", "-b", name, worktree, integration])
  try {
    await run("python3", [path.join(workflow, "setup", "setup-workspace.py"), root])
  } catch (error) {
    throw new Error(`setup-workspace.py could not link the worktree ${worktree}:\n${error.stdout ?? ""}${error.stderr ?? ""}`)
  }
  const base = path.join(root, "AGENT-INSTRUCTIONS", "PLANNING", "plan-templates")
  const templates = kind === "shadow" ? path.join(base, "shadow") : base
  const localScope = path.join(root, "AGENT-INSTRUCTIONS", "LOCAL", "shadow-scope.md")
  mkdirSync(folder, { recursive: true })
  for (const file of PLAN_FILES) {
    let text = readFileSync(path.join(templates, file), "utf8")
    const fence = kind === "shadow" && file === "scope.md" && existsSync(localScope) ? readFileSync(localScope, "utf8").trim() : ""
    if (fence) text = `${text.trimEnd()}\n\n${fence}\n`
    writeFileSync(path.join(folder, file), text.replaceAll("{plan}", name))
  }
  return { folder, worktree, integration }
}
