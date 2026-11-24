// Locks on the shared resources a workspace names, so parallel plans never use one at once.
//
// A lock names its resource, the holding session, that session's plan, a reason and when it was
// taken. Locks live in `locks.json` in the coordinator's state directory; the lockable resource
// names come from the workspace settings.

import path from "node:path"

import { readSettings } from "../workflow/workspace.js"
import { readState, stateDir, writeState } from "./state.js"

export function locksFile(root) {
  return path.join(stateDir(root), "locks.json")
}

export function readLocks(root) {
  const locks = readState(locksFile(root), { locks: [] }).locks
  if (!Array.isArray(locks)) throw new Error(`${locksFile(root)}: "locks" must be an array`)
  return locks
}

/**
 * Take a lock, or fail naming the current holder. Taking a lock one already holds is a no-op, and so
 * is taking a lock one of the caller's ancestors holds (`ancestors`, parent first): a child works
 * under its parent's lock.
 */
export function takeLock(root, { resource, holder, ancestors = [], plan, reason, now = new Date() }) {
  const { resources } = readSettings(root)
  if (!resources.includes(resource)) {
    throw new Error(`unknown resource "${resource}"; the workspace names: ${resources.join(", ") || "none"}`)
  }
  if (!reason?.trim()) throw new Error("a lock needs a reason")
  const locks = readLocks(root)
  const held = locks.find((lock) => lock.resource === resource)
  if (held?.holder === holder || ancestors.includes(held?.holder)) {
    dropWaiter(root, locks, held, holder)
    return held
  }
  if (held) {
    throw new Error(
      `"${resource}" is locked by session ${held.holder} (plan ${held.plan ?? "none"}) since ${held.since}: ${held.reason}. ` +
        `Wait for its release, or queue with lock_request for "${resource}" and continue when it is granted.`,
    )
  }
  const lock = { resource, holder, plan: plan ?? null, reason: reason.trim(), since: now.toISOString() }
  writeState(locksFile(root), { locks: [...locks, lock] })
  return lock
}

/** Remove a session's queue entry when it already works under the lock it queued for. */
function dropWaiter(root, locks, held, holder) {
  const waiters = Array.isArray(held.waiters) ? held.waiters : []
  const kept = waiters.filter((waiter) => waiter.holder !== holder)
  if (kept.length === waiters.length) return
  held.waiters = kept
  writeState(locksFile(root), { locks })
}

/**
 * Take a lock, or queue for it when another session holds it.
 *
 * A free lock is taken at once. A lock held by the caller or an ancestor is returned as held. Any
 * other holder puts the caller at the end of the lock's FIFO queue.
 */
export function requestLock(root, { resource, holder, ancestors = [], plan, reason, now = new Date() }) {
  const { resources } = readSettings(root)
  if (!resources.includes(resource)) {
    throw new Error(`unknown resource "${resource}"; the workspace names: ${resources.join(", ") || "none"}`)
  }
  if (!reason?.trim()) throw new Error("a lock needs a reason")
  const locks = readLocks(root)
  const held = locks.find((lock) => lock.resource === resource)
  if (!held) {
    const lock = { resource, holder, plan: plan ?? null, reason: reason.trim(), since: now.toISOString() }
    writeState(locksFile(root), { locks: [...locks, lock] })
    return { kind: "taken", lock }
  }
  if (held.holder === holder || ancestors.includes(held.holder)) {
    dropWaiter(root, locks, held, holder)
    return { kind: "held", lock: held }
  }
  const waiters = Array.isArray(held.waiters) ? held.waiters : []
  const queued = waiters.find((waiter) => waiter.holder === holder)
  if (queued) return { kind: "queued", lock: held, position: waiters.indexOf(queued) + 1 }
  const waiter = { holder, plan: plan ?? null, reason: reason.trim(), since: now.toISOString() }
  held.waiters = [...waiters, waiter]
  writeState(locksFile(root), { locks: locks.map((lock) => (lock === held ? held : lock)) })
  return { kind: "queued", lock: held, position: held.waiters.length }
}

/**
 * Release a lock; only its holder or the holder's parent may.
 *
 * `next` is the waiter that takes the lock next, and `waiters` the live queue behind it. Without a
 * next waiter the lock is removed.
 */
export function releaseLock(root, { resource, caller, holderParent, next = null, waiters = [] }) {
  const locks = readLocks(root)
  const held = locks.find((lock) => lock.resource === resource)
  if (!held) throw new Error(`"${resource}" is not locked`)
  if (held.holder !== caller && holderParent !== caller) {
    throw new Error(`"${resource}" is locked by session ${held.holder}; only it or its parent may release it`)
  }
  if (!next) {
    writeState(locksFile(root), { locks: locks.filter((lock) => lock !== held) })
    return { released: held, granted: null }
  }
  const granted = {
    ...held,
    holder: next.holder,
    plan: next.plan ?? null,
    reason: next.reason,
    since: next.since,
    waiters,
  }
  writeState(locksFile(root), { locks: locks.map((lock) => (lock === held ? granted : lock)) })
  return { released: held, granted }
}

/** One line per lock and its queue, or a note that none is held. */
export function describeLocks(locks) {
  if (!locks.length) return "No resource is locked."
  return locks
    .map((lock) => {
      const waiters = Array.isArray(lock.waiters) ? lock.waiters : []
      const queue = waiters.length ? `; queued: ${waiters.map((waiter) => waiter.holder).join(", ")}` : ""
      return `${lock.resource}: session ${lock.holder} (plan ${lock.plan ?? "none"}) since ${lock.since}: ${lock.reason}${queue}`
    })
    .join("\n")
}
