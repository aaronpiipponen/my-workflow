// What the coordinator learns about a linked plan, as messages appended to its conversation.
//
// The coordinator receives a plan's `full-plan.md` and its touched-files blocks once, when the plan
// is linked, and afterwards only what changed: a diff of `full-plan.md` and each new, changed or
// removed touched-files block. The last state sent is kept under `sent/<plan>/` in the
// coordinator's state directory, so a change is reported once.

import { execFile } from "node:child_process"
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { promisify } from "node:util"

import { planDir, readPlan } from "./plans.js"
import { readState, stateDir, writeState } from "./state.js"

const run = promisify(execFile)
const BLOCK = /<!-- touched-files:start -->\n([\s\S]*?)<!-- touched-files:end -->/

// The parts of each phase role's closing block the coordinator needs, by the block's own titles
// (`phase-implementer.md` and `phase-advancer.md`, "Return to orchestrator").
const IMPLEMENTER_SECTIONS = ["VERIFICATION RECEIPT", "RELEVANT COMMENTS FOR ADVANCER", "USER-SPECIFIC TEST"]
const ADVANCER_FIELDS = ["MODE", "PHASE VERDICT", "FINISHED PHASE", "NEXT UNIT", "ORCHESTRATOR COMMENTS"]
const ADVANCER_ALL = [...ADVANCER_FIELDS, "VERIFICATION ACTION"]

// Each titled section's lines, keyed by title; a section ends where the next title starts.
function sections(text, titles, line) {
  const found = {}
  let current = null
  for (const row of text.split("\n")) {
    const title = titles.find((name) => line(row, name))
    if (title) {
      current = title
      found[title] = [row]
    } else if (current) {
      found[current].push(row)
    }
  }
  return found
}

/**
 * Shorten one child's report to what the coordinator needs.
 *
 * A phase implementer keeps its revision, its comments for the advancer and whether a user test is
 * required; a phase advancer keeps its verdict fields. Every other role is named only. A report
 * without its titled block is kept whole, so nothing is silently lost.
 */
export function reportSummary(agent, text) {
  if (agent === "phase-implementer") {
    const found = sections(text, IMPLEMENTER_SECTIONS, (row, name) => row.trim() === name)
    if (!found["VERIFICATION RECEIPT"]) return text.trim()
    const revision = found["VERIFICATION RECEIPT"].find((row) => row.startsWith("REVISION:"))
    const comments = (found["RELEVANT COMMENTS FOR ADVANCER"] ?? []).slice(1).join("\n").trim()
    const userTest = (found["USER-SPECIFIC TEST"] ?? []).slice(1).find((row) => row.trim())
    return [revision, `Comments: ${comments || "NONE"}`, `User test: ${userTest?.trim() ?? "not stated"}`].filter(Boolean).join("\n")
  }
  if (agent === "phase-advancer") {
    const found = sections(text, ADVANCER_ALL, (row, name) => row.startsWith(`${name}:`))
    if (!found["PHASE VERDICT"]) return text.trim()
    return ADVANCER_FIELDS.filter((name) => found[name]).map((name) => found[name].join("\n").trim()).join("\n")
  }
  return "(report not forwarded)"
}

/** The paths a touched-files block lists: the first backticked path of each entry. */
export function blockPaths(block) {
  return block
    .split("\n")
    .map((row) => /^-\s+`([^`]+)`/.exec(row.trim())?.[1])
    .filter((value) => value && !value.startsWith("<"))
}

/**
 * The files an implementer changed that no detailed phase of its plan lists, from the revision
 * range in its report. An unlisted file is an overlap no investigation has seen yet.
 */
export async function unlistedFiles(root, plan, worktree, report) {
  const range = /^REVISION:\s*([0-9a-f]{7,40}\.\.[0-9a-f]{7,40})\s*$/m.exec(report)?.[1]
  if (!range) return null
  const { stdout } = await run("git", ["-C", worktree, "diff", "--name-only", range])
  const listed = new Set(Object.values(touchedBlocks(root, plan)).flatMap(blockPaths))
  return stdout.split("\n").filter((file) => file && !listed.has(file))
}

/** Each detailed phase document's touched-files block, by file name. */
export function touchedBlocks(root, plan) {
  const phases = path.join(planDir(root, plan), "phases")
  if (!existsSync(phases)) return {}
  const blocks = {}
  for (const name of readdirSync(phases).filter((file) => file.endsWith(".md")).sort()) {
    const match = BLOCK.exec(readFileSync(path.join(phases, name), "utf8"))
    blocks[name] = match ? match[1].trim() : "(no touched-files block)"
  }
  return blocks
}

function sentDir(root, plan) {
  return path.join(stateDir(root), "sent", plan)
}

function remember(root, plan, text, blocks) {
  const dir = sentDir(root, plan)
  mkdirSync(dir, { recursive: true })
  writeFileSync(path.join(dir, "full-plan.md"), text)
  writeState(path.join(dir, "blocks.json"), blocks)
}

function formatBlocks(plan, blocks) {
  return Object.entries(blocks).map(([name, block]) => `Touched files of ${plan} phases/${name}:\n${block}`)
}

/** The whole plan and its blocks, for the link message; records them as sent. */
export function planSnapshot(root, plan) {
  const text = readPlan(root, plan)
  const blocks = touchedBlocks(root, plan)
  remember(root, plan, text, blocks)
  return [`Full plan of ${plan}:\n${text.trim()}`, ...formatBlocks(plan, blocks)].join("\n\n")
}

/** What changed in a plan since it was last sent, or an empty string; records the new state. */
export async function planChanges(root, plan) {
  const dir = sentDir(root, plan)
  const text = readPlan(root, plan)
  const blocks = touchedBlocks(root, plan)
  const before = readState(path.join(dir, "blocks.json"), {})
  const parts = []
  const previous = path.join(dir, "full-plan.md")
  if (!existsSync(previous)) {
    parts.push(`Full plan of ${plan}:\n${text.trim()}`)
  } else if (readFileSync(previous, "utf8") !== text) {
    const current = path.join(dir, "full-plan.next.md")
    writeFileSync(current, text)
    try {
      await run("git", ["diff", "--no-index", "--no-color", "-U1", "--", previous, current])
    } catch (error) {
      // `git diff --no-index` exits 1 when the files differ, with the diff on stdout.
      if (error.code !== 1) throw error
      const diff = error.stdout.split("\n").filter((line) => !line.startsWith("diff --git") && !line.startsWith("index ")).join("\n")
      parts.push(`Change to the full plan of ${plan}:\n${diff.trim()}`)
    }
  }
  const changed = Object.fromEntries(Object.entries(blocks).filter(([name, block]) => before[name] !== block))
  parts.push(...formatBlocks(plan, changed))
  for (const name of Object.keys(before).filter((name) => !(name in blocks))) {
    parts.push(`Phase document ${plan} phases/${name} is no longer active.`)
  }
  remember(root, plan, text, blocks)
  return parts.join("\n\n")
}
