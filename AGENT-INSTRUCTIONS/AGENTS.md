# AGENTS.md - agent bootstrap

## The one rule that matters most

*NEVER* blindly trust built infrastructure or documents. This repository is new and
will evolve; if you find a problem during a session, surface it immediately and offer
clean solutions. Never silently defer or ignore a discovered problem.

**Do not tape things together.** Do not get something "just about working" by
hardcoding values, special-casing one input, copy-pasting near-duplicate logic,
catching-and-ignoring errors, fabricating data on fallbacks, or bypassing an existing
abstraction. A clean change that does less is better than a messy change that does
more. If you cannot do it cleanly, **stop and say so** instead of shipping a hack.

Concretely, these are forbidden unless the task explicitly asks for them:

- Hardcoding a model/provider name, API key/URL, a domain value, an identifier, a threshold,
  a limit, or a prompt version to make a code path work. Use validated configuration or
  parameters.
- Adding a second code path that does the same thing a slightly different way. Extend
  or reuse the existing one.
- `try/except: pass` (Python) or `catch {}` (JS) to silence a failure. Fail loudly or
  handle it deliberately.
- Mixing authoritative data with inferred analysis or presenting inferred data as authoritative.
- Faking/mocking real product behavior to make a test or demo pass.

When existing code solves part of the problem, use it. Search before writing.

**Read before you write.** Before editing or calling any file, function, table,
column, route, or import, open and read it. Never invent or guess a name, signature,
or schema from memory. A plan may name a future path that has not been created yet.
Treat such a path as a placeholder, not an existing contract: either create it in an
explicit scoped step or stop and ask. Never fabricate it.

## The Second rule

This is a *HOBBY* project, not a commercial or high-assurance system. Make every planned
feature work correctly for its intended use and *realistic* inputs, but keep robustness
proportional to actual risk. Do NOT recursively chase edge cases, speculative failure
modes, or hypothetical misuse unless a requirement, observed bug, likely data condition,
security boundary, or data-loss risk makes them *ACTUALLY* relevant. **Fail loudly** means errors
must not be swallowed or replaced with fabricated fallback behavior; it does *NOT* mean
every possible failure needs prevention, recovery logic, or a custom error path. An
uncommon unsupported case SHOULD raise a clear error and stop. ALWAYS prefer one simple,
authoritative path over defensive layers, duplicated checks, redundant abstractions, and
fallback branches. Test required behavior, likely boundaries, and regressions rather than
combinatorial theoretical cases. Ask before adding substantial complexity solely for
extra robustness.

## Project sources of truth

The checkout's own sources are named in `AGENT-INSTRUCTIONS/LOCAL/project.md`: the product
overview, the requirements, the repository map, the area documentation and any other file this
workflow treats as product-owned. Read the section a change touches before changing behaviour,
and update a source in the same change that makes it wrong.

- `AGENT-INSTRUCTIONS/BUILDING/REPO-RULES.md` - binding engineering rules; the checkout's domain
  invariants are in `AGENT-INSTRUCTIONS/LOCAL/repo-rules-domain.md`.

## Authority

Source, signatures and configuration are authoritative. Inspect the actual tree and source
directly. Agent instructions may point into the checkout's documentation set, and that set never
links to agent material.

## Always read the area README before working

`AGENT-INSTRUCTIONS/` is split by concern. Each subdirectory's `README.md` is its entry
point and names what to read next.

- `AGENT-INSTRUCTIONS/README.md` - before editing any instruction: it says which rule belongs in the
  shared file and which in the checkout's `LOCAL/`, and when to ask instead of guessing.
- `AGENT-INSTRUCTIONS/BUILDING/README.md` - always before code changes.
- `AGENT-INSTRUCTIONS/PLANNING/README.md` - for scoping, detailing, executing, or
  remediating a plan/phase.
- `AGENT-INSTRUCTIONS/PLANS/README.md` - when a plan or phase is named. A completed plan moves to
  `PLANS/archive/`.
- `AGENT-INSTRUCTIONS/SUBAGENTS/README.md` - canonical subagents and their allowed use.
  Writing subagents are forbidden except the named agents and the two sanctioned workflows defined
  there: the serial phase workflow and the release.
- `AGENT-INSTRUCTIONS/CURRENT-SCOPE.md` - active per-branch scope fence. Code edits must
  stay inside its claimed scope; documentation and planning edits remain allowed.
- `AGENT-INSTRUCTIONS/ORCHESTRATOR-HANDOFF.md` - plan orchestrator's living handoff (the `/plan`
  session only); child agents do not read or edit it.

If a task conflicts with these instructions, stop and ask.

Resume an interrupted or unfinished subagent in its exact session when continuing its authorized
task. No additional user approval is needed for that continuation. Resuming a fully finished
subagent requires explicit user approval; otherwise use a fresh session for follow-up work.
Preserve user stop instructions, unresolved user-owned decisions, hard invariants and tool
boundaries. Report an actual tool refusal accurately instead of inventing one or silently
substituting a replacement child.
