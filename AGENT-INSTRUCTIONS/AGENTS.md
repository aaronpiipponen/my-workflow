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

## Authority

Source, signatures and configuration are authoritative. Inspect the actual tree and source
directly. Agent instructions may point into the checkout's documentation set, and that set never
links to agent material.

## How the workflow reaches you

The workflow's rule files are the source of truth for what agents receive; they are not a reading
list. The workflow plugin delivers them:

- **Injected every request.** Each session receives its role's rules in the system prompt. The main
  chat agent receives the repository rules (`AGENT-INSTRUCTIONS/BUILDING/REPO-RULES.md`), the
  checkout's domain invariants and the scope fence. Each subagent receives its own sections, and a
  session started with `/plan` or `/release` also receives that orchestrator's procedure. Pasting a
  command's text does not start its role; run the command.
- **Skills, on demand.** Procedures that only some work needs are skills whose content is the shared
  text itself: debugging, documentation style, documentation workflow, plan authoring, phase
  detailing, phase remediation and `agent-instructions`. Load the matching skill when the work
  starts.
- **Held edits.** An edit under `AGENT-INSTRUCTIONS/` outside `PLANS/`, or to `AGENTS.md`, is held
  until the session has loaded the `agent-instructions` skill, which says which rule belongs in the
  shared text and which in the checkout's `LOCAL/`.

Working state is read, not injected: the plan named for the work (`AGENT-INSTRUCTIONS/PLANS/`; a
completed plan moves to `PLANS/archive/`), and the canonical subagents and their allowed use in
`AGENT-INSTRUCTIONS/SUBAGENTS/README.md`. Writing subagents are forbidden except the named agents
and the two sanctioned workflows defined there: the serial phase workflow and the release. Code
edits stay inside the claimed scope of `AGENT-INSTRUCTIONS/CURRENT-SCOPE.md`; documentation and
planning edits remain allowed. `AGENT-INSTRUCTIONS/ORCHESTRATOR-HANDOFF.md` is the plan
orchestrator's living handoff; child agents do not read or edit it.

If a task conflicts with these instructions, stop and ask.

Resume an interrupted or unfinished subagent in its exact session when continuing its authorized
task. No additional user approval is needed for that continuation. Resuming a fully finished
subagent requires explicit user approval; otherwise use a fresh session for follow-up work.
Preserve user stop instructions, unresolved user-owned decisions, hard invariants and tool
boundaries. Report an actual tool refusal accurately instead of inventing one or silently
substituting a replacement child.
