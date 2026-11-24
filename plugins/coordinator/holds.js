// Hold pairs: two plans stopped before their overlapping phases while the overlap is settled.
//
// One record per pair names the pair id, the leading plan, the reason, whether the pair's channel
// is open, and its two sides: each side's plan, the phase whose implementer may not start yet, and
// whether its orchestrator has reached the hold. Phases are named by the ids of each plan's status
// table. Records live in `holds.json` in the coordinator's state directory; the design a pair agrees
// on is `AGENT-INSTRUCTIONS/PLANS/shared/<pair>.md`.

import { existsSync } from "node:fs"
import path from "node:path"

import { phaseStatuses } from "./plans.js"
import { readState, stateDir, writeState } from "./state.js"

export const HELD_AGENT = "phase-implementer"
// A phase in one of these statuses is never implemented again, so a hold on it would stop nothing.
const UNHELD_STATUSES = new Set(["done", "not applicable"])

export function holdsFile(root) {
  return path.join(stateDir(root), "holds.json")
}

/** Return the path of a pair's shared design, one file for both plans. */
export function sharedDesign(root, pair) {
  return path.join(root, "AGENT-INSTRUCTIONS", "PLANS", "shared", `${pair}.md`)
}

const nonEmpty = (value) => typeof value === "string" && value.trim() !== ""

/** Read and validate the workspace's hold pairs; a missing file holds nothing. */
export function readHolds(root) {
  const file = holdsFile(root)
  const pairs = readState(file, { pairs: [] }).pairs
  if (!Array.isArray(pairs)) throw new Error(`${file}: "pairs" must be an array`)
  for (const [index, record] of pairs.entries()) {
    const where = `${file}: pairs[${index}]`
    for (const field of ["pair", "leading", "reason"]) {
      if (!nonEmpty(record?.[field])) throw new Error(`${where}.${field} must be a non-empty string`)
    }
    if (typeof record.channel !== "boolean") throw new Error(`${where}.channel must be true or false`)
    if (!Array.isArray(record.sides) || record.sides.length !== 2) throw new Error(`${where}.sides must hold two sides`)
    for (const side of record.sides) {
      if (!nonEmpty(side?.plan) || !nonEmpty(side?.phase) || typeof side.reached !== "boolean") {
        throw new Error(`${where}.sides: each side needs a plan, a phase and reached true or false`)
      }
    }
  }
  return pairs
}

function writeHolds(root, pairs) {
  writeState(holdsFile(root), { pairs })
}

/** Return one plan's side of a pair and its partner's side. */
export function sidesOf(record, plan) {
  const self = record.sides.find((side) => side.plan === plan)
  return { self, partner: record.sides.find((side) => side !== self) }
}

/** Return the pair a plan takes part in, or undefined. */
export function pairOfPlan(pairs, plan) {
  return pairs.find((record) => record.sides.some((side) => side.plan === plan))
}

/**
 * Arm one hold pair: both plans stop before their named phase, one of them leading.
 *
 * Both plans must be linked, and each phase must be in its plan's status table, not yet done or
 * dropped, and without a started implementer (`startedPhases(plan)` lists those), because a hold
 * stops a plan only before an implementer starts. A plan takes part in at most one armed pair; a
 * second overlap waits until the first is released.
 */
export function armPair(root, { first, second, leading, reason }, linkedPlans, startedPhases) {
  for (const side of [first, second]) {
    if (!side?.plan || !side?.phase) throw new Error("each side needs a plan and a phase")
    if (!linkedPlans.includes(side.plan)) throw new Error(`${side.plan} is not linked to the coordinator`)
    const status = phaseStatuses(root, side.plan)[side.phase]
    if (status === undefined) throw new Error(`${side.plan}'s status table has no phase ${side.phase}`)
    if (UNHELD_STATUSES.has(status)) {
      throw new Error(`phase ${side.phase} of ${side.plan} is ${status}; hold that plan's next phase that is not yet done`)
    }
    if (startedPhases(side.plan).has(side.phase)) {
      throw new Error(
        `the implementer of phase ${side.phase} of ${side.plan} has already started; hold that plan's next phase ` +
          `whose implementer has not started, with ${side.plan} leading`,
      )
    }
  }
  if (first.plan === second.plan) throw new Error("a hold pair needs two different plans")
  if (leading !== first.plan && leading !== second.plan) throw new Error(`leading must be ${first.plan} or ${second.plan}`)
  if (!reason?.trim()) throw new Error("a hold pair needs a reason")
  const pairs = readHolds(root)
  for (const side of [first, second]) {
    const busy = pairOfPlan(pairs, side.plan)
    if (busy) throw new Error(`${side.plan} is already held in pair ${busy.pair}; release it first`)
  }
  // The held phases make the id unique, so a later overlap between the same plans gets its own
  // shared design.
  const pair = `${first.plan}-${first.phase}+${second.plan}-${second.phase}`
  if (existsSync(sharedDesign(root, pair))) throw new Error(`pair ${pair} was already settled; a new overlap needs different held phases`)
  const side = ({ plan, phase }) => ({ plan, phase, reached: false })
  writeHolds(root, [...pairs, { pair, leading, reason: reason.trim(), channel: false, sides: [side(first), side(second)] }])
  return pair
}

function findPair(pairs, pair) {
  const record = pairs.find((candidate) => candidate.pair === pair)
  if (!record) throw new Error(`no armed pair ${pair}`)
  return record
}

/** Release one hold pair. */
export function releasePair(root, pair) {
  const pairs = readHolds(root)
  findPair(pairs, pair)
  writeHolds(root, pairs.filter((record) => record.pair !== pair))
}

/** Record that a plan's orchestrator reached its hold; returns whether this is the first time. */
export function markReached(root, plan) {
  const pairs = readHolds(root)
  const record = pairOfPlan(pairs, plan)
  const { self } = record ? sidesOf(record, plan) : {}
  if (!self || self.reached) return false
  self.reached = true
  writeHolds(root, pairs)
  return true
}

/** Open a pair's channel once both orchestrators reached their holds; returns the pair. */
export function openChannel(root, pair) {
  const pairs = readHolds(root)
  const record = findPair(pairs, pair)
  const waiting = record.sides.filter((side) => !side.reached).map((side) => side.plan)
  if (waiting.length) throw new Error(`${waiting.join(" and ")} has not reached its hold yet`)
  record.channel = true
  writeHolds(root, pairs)
  return record
}

/** Return the open pair a plan leads, or undefined. */
export function ledPair(pairs, plan) {
  return pairs.find((record) => record.leading === plan && record.channel)
}

/** Return the pair that holds this phase of this plan, or undefined. */
export function holdFor(pairs, plan, phase) {
  return pairs.find((record) => record.sides.some((side) => side.plan === plan && side.phase === phase))
}

/** Return each held phase of one plan that its status table no longer lists or marks not applicable. */
export function removedHolds(root, pairs, plan) {
  const statuses = phaseStatuses(root, plan)
  return pairs
    .map((record) => ({ pair: record.pair, phase: sidesOf(record, plan).self?.phase }))
    .filter(({ phase }) => phase && (statuses[phase] === undefined || statuses[phase] === "not applicable"))
}

/** Return the refusal the held orchestrator reads as the tool's error. */
export function holdMessage(record, plan) {
  const { self, partner } = sidesOf(record, plan)
  return (
    `COORDINATOR HOLD: phase ${self.phase} of ${plan} may not start yet. It overlaps phase ` +
    `${partner.phase} of ${partner.plan}: ${record.reason}. Stop here: start no other phase and ` +
    "no other implementer, and do not retry this call. Tell the user in one line that the plan is " +
    "held and why, then end your turn. The coordinator or the partner orchestrator will message you " +
    "when the overlap is settled."
  )
}

/** Return a one-line-per-side summary the coordinator reads after each change. */
export function describeHolds(pairs) {
  if (!pairs.length) return "No holds are armed."
  return pairs
    .flatMap((record) =>
      record.sides.map((side) => {
        const notes = [record.leading === side.plan && "leading", side.reached && "reached", record.channel && "channel open"].filter(Boolean)
        return `${record.pair}: ${side.plan} held before phase ${side.phase}${notes.length ? ` (${notes.join(", ")})` : ""}`
      }),
    )
    .join("\n")
}
