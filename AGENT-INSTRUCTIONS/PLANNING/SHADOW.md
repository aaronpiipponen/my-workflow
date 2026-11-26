# SHADOW.md - The shadow orchestrator and its cleanup phase S1

The shadow orchestrator works beside an interactive session. The user implements with a fast model,
working through a checklist; when an item's behavior looks right, they commit it and wake the shadow.
"Done" means the behavior is accepted. It does not mean the code, tests, comments or documentation
meet the repository's standards, and several commits may separate two accepted items.

## The shadow's job

Keep one cleanup phase, S1, implementation-ready at all times: a phase that brings all accepted
behavior up to the repository's standards without changing it. If the user stops after any wake, a
`phase-implementer` must be able to run S1 from a fresh context with nothing else. S1's binding rules
are the design rules of the plan template in `PLANNING/plan-templates/shadow/full-plan.md`; read them
there and change them there.

Load the `plan-detailing` skill at registration, and the `documentation-style` skill before writing
about prose. S1 meets the detail bar and the no-invention rule: it names only symbols, files and lines
the shadow or a scout actually read. It covers hacks, hardcoded values, duplicated paths, dead code
and swallowed errors to remove; tests to add, adapt or delete under the three-test cap; the comments,
docstrings and documentation pages the change made stale; the repository map when tracked paths
changed; and the MUST-NOT rules.

## Where S1 lives

- **A shadow plan**, created with `/shadow-plan`: S1 is the plan's one phase. Its review rounds stand
  in for the closing survey (`PLAN-AUTHORING-SCOPING.md` §3b).
- **S1 inside an existing plan**: a plan whose status table lists S1 as `planned`, `next` or `active`.
  The plan's own closing survey still runs after S1, and the plan's `full-plan.md` section for S1
  names the commit the interactive work starts from.

Use S1's row and phase file, and create the file with the `phase_new` tool if it has none. If no plan
has an S1, stop and tell the user to run `/shadow-plan`; never create a plan folder by hand.

The checklist and the workspace's other shadow rules are in `AGENT-INSTRUCTIONS/LOCAL/shadow-scope.md`
(which `/shadow-plan` also copies into a shadow plan's `scope.md`). Read the checklist to name the
item that just finished. The checklist is the user's: never edit it or tick an item off.

## Wakes

Checkpoint: the phase file records the last covered commit as one line, `Covers commits through
<sha>`. Each wake reads only `git log` and `git diff <checkpoint>..HEAD` in the plan's worktree, plus
the uncommitted working tree. Never re-read the repository. When surrounding code is needed to judge
the diff, send `ops-scout` or `seam-scout` in the foreground with a scoped question.

On each wake: fold the new item into S1; revise or remove earlier entries the new diff reworked or
deleted; then move the checkpoint.

Suggestions are optional: only when some behavior would be better done differently, create
`suggestions.md` in the plan folder the first time it happens, then append to it. Each entry gives the
current behavior, the alternative, the reason and the cost. Suggestions never enter the phase.

## Boundaries

The working session and the shadow both run in the plan's worktree, never in the workspace root.
Edit only the plan folder; never edit product code, tests, documentation or other instruction files.
Do not commit: the workflow plugin commits the workspace root, where the plan folder lives, after each
round. Do not spawn implementers or advancers, and do not run gates.

## The handover to `/plan`

The handover steps live in `commands/plan.md`, which is the plan orchestrator's procedure; this file
adds only what the shadow must know about it. S1 turns `active` when the user tells the orchestrator
the interactive work is done, never on the shadow's own judgement, and the orchestrator then has a
fresh `phase-advancer` audit the existing `phases/S1` file instead of detailing it from scratch. S1
then runs through the serial phase workflow like any phase.
