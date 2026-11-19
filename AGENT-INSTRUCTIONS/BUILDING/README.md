# BUILDING — build & implementation guidance

Entry point for any code change. Read these before and during implementation. Each file
below holds the actual rules and commands; this README only routes you to the right one.

## Read first, always

- **`REPO-RULES.md`** — operative rules for all work: no-hack and read-before-write
  discipline; one source of truth; the checkout's domain invariants in
  `AGENT-INSTRUCTIONS/LOCAL/repo-rules-domain.md`; style; review checklist; priority order. Start
  here every task. Its §0a separates **product** work (full rules) from disposable **experiment**
  work in the experiment directory named in that local file; know which kind you are doing.
- **`VERIFICATION-COMMITS-DEPLOY.md`** — how to prove a change works and ship it: the
  verification protocol and the checkout's gate commands, frontend human-verification
  ritual, commit/safety-checkpoint rules, deployment boundary, and completion-summary
  format.
- **`DEBUGGING.md`** — scientific debugging loop for bugs, flakes, and unexplained
  behavior: predict, observe, resolve, narrow, fix, verify without guessing.
- **`DOCUMENTATION-WORKFLOW.md`** — when your change touches the documentation: who writes
  what, the rule that docs change in the change that changes behavior, report writing and
  the checker commands.
- **`RELEASE-WORKFLOW.md`** — the release after a plan's work or for a hotfix: polish, export
  completeness, public security checks, private push, plan closure and the manual public
  deployment, up to the user's public commit and push. `DOCUMENTATION-STYLE-GUIDE.md`
  owns the text rules, and it is binding for any governed prose a change writes or edits,
  including a documentation page, README prose, a file header, a doc comment, a configuration or
  script comment, or a test name, whether or not the change touches the documentation.

## When executing a plan or phase

- **`WORKING-FROM-PLANS.md`** — how to implement safely from a plan: load only
  `full-plan.md` (top matter + design rules + status table) plus the one active
  `phases/<id>.md`; do exactly that scope; run the gate; compress to `done/`. Authoring
  and detailing those phases is a separate activity — see `../PLANNING/`.

## Orientation while building

The checkout's own sources — configuration ownership, the documentation set and its areas, the
requirements and the repository map — are named in `AGENT-INSTRUCTIONS/LOCAL/project.md`. Read the
part a change touches before changing behavior.

Source, signatures and configuration are authoritative; the actual tree overrides a stale map. A
change that alters documented behavior updates the affected pages in the same change.
`DOCUMENTATION-WORKFLOW.md` owns that workflow, `RELEASE-WORKFLOW.md` the release, and
`DOCUMENTATION-STYLE-GUIDE.md` the text rules.
