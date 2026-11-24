# PLANS

Working plans live here. A plan is a **folder**, not a single file.

## Folder convention

```
PLANS/shared/<pair>.md  # an overlap design two parallel plans agreed on, one copy for both
PLANS/<slug>/         # <slug> is the plan's branch and worktree name; never `shared` or `archive`
  full-plan.md        # scope, design rules, and the phase status table (single source of truth)
  scope.md            # the plan's work fence, injected into every agent working on the plan
  handoff.md          # the plan orchestrator's living handoff; children never read it
  autonomous-decisions.md  # orchestrator-only working record, created when a decision needs recording
  docs-pass.md        # items explicitly deferred to the release, kept until the release clears them
  phases/<id>.md      # one detailed, implementation-grade phase — created only when that phase is active
  done/<id>.md        # a completed phase compressed to its frozen contract
  benchmarks/<name>-<YYYY-MM-DD>.md  # dated experiment/result/run notes (immutable records)
```

- `/plan-new` creates the plan folder with its starting `full-plan.md`, `scope.md` and
  `handoff.md`, together with the plan's branch and worktree. `/shadow-plan` does the same from the
  filled shadow templates in `../PLANNING/plan-templates/shadow/`.
- Author `full-plan.md` first (see `../PLANNING/PLAN-AUTHORING-SCOPING.md`). Phases stay
  scoped/vague there; the status table marks one phase `active` at a time.
- Plan and phase files hold current state only; superseded text is replaced, not annotated with history.
- Expand the active phase into one `phases/<id>.md` file just before building it (see
  `../PLANNING/PLAN-PHASE-DETAILING.md`). In serial orchestration, `phase-advancer` owns
  this work, including initial phase detail. The file carries exact steps, tests, and a
  `User test` acceptance section the agent runs unless it names capability only user has.
- An implementer loads `full-plan.md` (top matter + design rules + status table) plus the
  one active phase file — never a monolith. That bound is what stops a weak model from
  forgetting and hallucinating.
- On completion, compress `phases/<id>.md` into `done/<id>.md` (frozen contract only) and
  flip the status table row to `done`.
- If a phase lands but fails its retest, re-detail the same `phases/<id>.md` in place per
  `../PLANNING/PLAN-PHASE-REMEDIATION.md` (keep working parts, fix steps at full grade); the row
  stays `active` until the retest passes.

- Dated experiment results, benchmark/run records and acceptance-run notes go in
  `benchmarks/`, never the plan root or `phases/`. They are frozen evidence: cite them from
  `full-plan.md` as `benchmarks/<note>.md` and from `done/` as `../benchmarks/<note>.md`.
  Plan-scope working documents that are not run records (for example a scope/review note
  for a split phase) stay at the plan root.

- Every plan runs the same lifecycle: detail and implement phases until every phase, the closing
  survey included, is done; then the release (`../BUILDING/RELEASE-WORKFLOW.md`, the `/release` command), which ends with
  closure. A shadow plan, which `/shadow-plan` creates with its one cleanup phase S1 already filled
  in, has no survey phase: S1's review rounds stand in for it (`../PLANNING/PLAN-AUTHORING-SCOPING.md` §3b).
- Phases update every page their change touches and may create new pages; splitting existing pages
  belongs to the release. `docs-pass.md` lists only the items explicitly deferred to the release
  instead, each with its file or page and what is wrong. The
  orchestrator creates it at the first deferral and adds each one as soon as a phase document, a
  child report or the user makes it. Items are never parked only
  in a `done/` contract, a phase file or the chat. The release reads it as input and
  deletes each item it resolves; the plan closes only with the list empty or every remaining item
  accepted by the user.
- `autonomous-decisions.md` is created in the active plan's root only when the orchestrator needs
  to record a decision. It holds each autonomous decision, its reason and how to undo it. It is
  orchestrator-only context, never read or edited by children or copied into their briefs.

Execution rules: `../BUILDING/WORKING-FROM-PLANS.md`.

## Archive

A plan whose every phase is `done` or `not applicable`, with no open milestone, the user's acceptance
of its closing survey results, or of S1 for a shadow plan (`../PLANNING/PLAN-AUTHORING-SCOPING.md` §3b), a finished release
(`../BUILDING/RELEASE-WORKFLOW.md`) with its `docs-pass.md` list cleared or accepted, and explicit user
authorization to close it, is complete. Its folder is moved unchanged with a plain `mv` to
`PLANS/archive/<slug>/` (the advancer that flips its last row does this; the workflow plugin commits
the workspace root). The move changes no file content, so a moved record keeps any path that names the
plan's working location. The coordinator links and the session references are what close, not the
archived text. Archived plans are frozen: they are never edited and never loaded in a work session;
read one only when the current phase explicitly names an old contract in it
(`PLANS/archive/<slug>/done/<id>.md`). Plans that are active or have an open milestone stay at
`PLANS/<slug>/`.

Archived text records the contract at completion, not the current implementation; consult current
source and permanent docs for current truth. Archived files carry their actual archive date. Archive
metadata is not permission to correct or modernize historical contents.
