# BUILDING — build & implementation guidance

The rules for code changes. Each file below owns one area and is the source of truth the workflow
plugin delivers; this README maps the area to its file and says how the file reaches an agent.
`PLUGINS/workflow/bindings.default.json` is the exact map of who receives what.

## The files

- **`REPO-RULES.md`** — operative rules for all work: no-hack and read-before-write discipline; one
  source of truth; the checkout's domain invariants in `AGENT-INSTRUCTIONS/LOCAL/repo-rules-domain.md`;
  style; review checklist; priority order. Its §0a separates **product** work (full rules) from
  disposable **experiment** work in the experiment directory named in that local file. Injected
  into the main chat agent, the phase roles, the reviewers and the `/plan` session.
- **`VERIFICATION-COMMITS-DEPLOY.md`** — how to prove a change works and ship it: the verification
  protocol and the checkout's gate commands, the frontend human-verification ritual,
  commit/safety-checkpoint rules, the deployment boundary and the completion-summary format.
  Injected into the phase implementer and advancer and the `/plan` session.
- **`WORKING-FROM-PLANS.md`** — how to implement safely from a plan: load only `full-plan.md`
  (top matter + design rules + status table) plus the one active `phases/<id>.md`; do exactly that
  scope; run the gate; compress to `done/`. Injected into the phase implementer and advancer and
  the `/plan` session. Authoring and detailing phases is a separate activity in `../PLANNING/`.
- **`DEBUGGING.md`** — scientific debugging loop for bugs, flakes and unexplained behavior:
  predict, observe, resolve, narrow, fix, verify without guessing. The `debugging` skill.
- **`DOCUMENTATION-STYLE-GUIDE.md`** — the text rules, binding for any governed prose a change
  writes or edits: a documentation page, README prose, a file header, a doc comment, a
  configuration or script comment, or a test name, whether or not the change touches the
  documentation. Injected into the writers, the phase implementer, the two diff reviewers and the
  `/release` session; the `documentation-style` skill elsewhere.
- **`DOCUMENTATION-WORKFLOW.md`** — who writes what, the rule that docs change in the change that
  changes behavior, report writing and the checker commands. Injected into the document and
  report writers and the `/release` session; the `documentation-workflow` skill elsewhere.
- **`RELEASE-WORKFLOW.md`** — the release after a plan's work or for a hotfix: polish, export
  completeness, public security checks, private push, plan closure and the manual public
  deployment, up to the user's public commit and push. Injected into the `/release` session.

## Orientation while building

The checkout's own sources — configuration ownership, the documentation set and its areas, the
requirements and the repository map — are named in `AGENT-INSTRUCTIONS/LOCAL/project.md`. Read the
part a change touches before changing behavior.

Source, signatures and configuration are authoritative; the actual tree overrides a stale map. A
change that alters documented behavior updates the affected pages in the same change.
