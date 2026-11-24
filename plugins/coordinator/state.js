// The coordinator's state files.
//
// Every file lives under `<workspace root>/.opencode/coordinator/`, outside the root's tracked
// instruction tree, and is written whole through a renamed sibling so a reader never sees half a
// file.

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs"
import path from "node:path"

/** The coordinator's state directory in a workspace root. */
export function stateDir(root) {
  return path.join(root, ".opencode", "coordinator")
}

/** Read one JSON state file; a missing file yields the fallback. */
export function readState(file, fallback) {
  if (!existsSync(file)) return fallback
  try {
    return JSON.parse(readFileSync(file, "utf8"))
  } catch (error) {
    throw new Error(`${file}: ${error.message}`)
  }
}

/** Write one JSON state file whole. */
export function writeState(file, value) {
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(`${file}.tmp`, JSON.stringify(value, null, 2) + "\n")
  renameSync(`${file}.tmp`, file)
}

/**
 * The coordinator binding and the linked orchestrators: `{ coordinator, linked: { sessionID: plan } }`.
 * One orchestrator session is linked per plan.
 */
export function linksFile(root) {
  return path.join(stateDir(root), "links.json")
}

export function readLinks(root) {
  const links = readState(linksFile(root), { coordinator: null, linked: {} })
  if (typeof links.linked !== "object" || links.linked === null) throw new Error(`${linksFile(root)}: "linked" must be an object`)
  return links
}

/** Link a session to its plan, replacing an earlier session linked for the same plan. */
export function linkSession(root, sessionID, plan, coordinator) {
  const links = readLinks(root)
  for (const [linked, linkedPlan] of Object.entries(links.linked)) if (linkedPlan === plan) delete links.linked[linked]
  links.linked[sessionID] = plan
  links.coordinator = coordinator
  writeState(linksFile(root), links)
  return links
}

/** Unlink one session; returns the plan it was linked for. */
export function unlinkSession(root, sessionID) {
  const links = readLinks(root)
  const plan = links.linked[sessionID]
  if (!plan) throw new Error(`session ${sessionID} is not linked`)
  delete links.linked[sessionID]
  writeState(linksFile(root), links)
  return plan
}

/** The session linked for a plan, or undefined. */
export function sessionOfPlan(links, plan) {
  return Object.entries(links.linked).find(([, linkedPlan]) => linkedPlan === plan)?.[0]
}
