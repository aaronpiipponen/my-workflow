// A plan's folder in the workspace root and the phase status table of its `full-plan.md`.
//
// The status table is the single source of truth for a plan's phases: its `Phase` column holds each
// phase id, which never changes once assigned, and its `Status` column the phase's status.

import { existsSync, readFileSync } from "node:fs"
import path from "node:path"

export function planDir(root, plan) {
  return path.join(root, "AGENT-INSTRUCTIONS", "PLANS", plan)
}

/** Read a plan's `full-plan.md`; a missing plan is an error. */
export function readPlan(root, plan) {
  const file = path.join(planDir(root, plan), "full-plan.md")
  if (!existsSync(file)) throw new Error(`no plan ${plan}: AGENT-INSTRUCTIONS/PLANS/${plan}/full-plan.md is missing`)
  return readFileSync(file, "utf8")
}

const cells = (row) => row.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim())

/**
 * Return each phase's status, `{ phase id: status }`, in table order, from the status table: the
 * first Markdown table whose header starts with `Phase` and has a `Status` column.
 */
export function phaseStatuses(root, plan) {
  const rows = readPlan(root, plan).split("\n")
  const header = rows.findIndex((row) => {
    const names = row.trim().startsWith("|") ? cells(row) : []
    return names[0] === "Phase" && names.includes("Status")
  })
  if (header === -1) throw new Error(`${plan}'s full-plan.md has no phase status table (a table whose header starts with | Phase | and has a Status column)`)
  const status = cells(rows[header]).indexOf("Status")
  const phases = {}
  for (const row of rows.slice(header + 2)) {
    if (!row.trim().startsWith("|")) break
    const values = cells(row)
    if (values[0]) phases[values[0]] = values[status]
  }
  return phases
}
