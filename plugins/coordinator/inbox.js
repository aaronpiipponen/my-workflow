// The feed collected for one plan since its orchestrator's last round, kept on disk.
//
// A plugin reload replaces the instance that collects it, so the reports gathered so far, the
// children known to belong to the plan and the last text of each session live in
// `feed/<plan>.json` in the coordinator's state directory, written after every change and read when
// the instance loads.

import path from "node:path"

import { readState, stateDir, writeState } from "./state.js"

export function inboxFile(root, plan) {
  return path.join(stateDir(root), "feed", `${plan}.json`)
}

const isRecord = (value) => typeof value === "object" && value !== null && !Array.isArray(value)

/**
 * Read a plan's inbox: `pending` feed parts, `children` by session id (agent, title and phase), and
 * `lastText` by session id. A missing file is an empty inbox.
 */
export function readInbox(root, plan) {
  const file = inboxFile(root, plan)
  const inbox = readState(file, { pending: [], children: {}, lastText: {} })
  if (!Array.isArray(inbox.pending) || inbox.pending.some((part) => typeof part !== "string")) {
    throw new Error(`${file}: "pending" must be a list of texts`)
  }
  if (!isRecord(inbox.children) || !Object.values(inbox.children).every(isRecord)) {
    throw new Error(`${file}: "children" must map session ids to records`)
  }
  if (!isRecord(inbox.lastText) || Object.values(inbox.lastText).some((text) => typeof text !== "string")) {
    throw new Error(`${file}: "lastText" must map session ids to texts`)
  }
  return inbox
}

export function writeInbox(root, plan, inbox) {
  writeState(inboxFile(root, plan), inbox)
}
