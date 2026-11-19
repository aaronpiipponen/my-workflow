# Subagents (repo-specific)

Canonical source for repository subagents. Bodies are written once here;
`AGENT-INSTRUCTIONS/SUBAGENTS/gen_agents.py` stamps each source into `.opencode/agents/<name>.md`.

Do not hand-edit generated files. Edit canonical body here, `AGENT-INSTRUCTIONS/LOCAL/models.json` or `AGENT-INSTRUCTIONS/LOCAL/roles/`, then run:

```bash
python AGENT-INSTRUCTIONS/SUBAGENTS/gen_agents.py
python AGENT-INSTRUCTIONS/SUBAGENTS/gen_agents.py --check
```

If a future CI docs gate or pre-commit hook is introduced, it must run `--check`; update
this section with its exact path and command when created.

## The orchestrator authority block

Every process role except the three writers carries this protocol from
`partials/orchestrator-authority.md`, stamped into its body. The writers carry `## Brief authority`
in their own bodies instead. Do not restate either here; edit the partial.

## When you may spawn them - and when you must not

Subagents offload bounded research, implementation, detailing, and judgment work while
orchestrator retains product intent and workflow state.

- Outside serial plan orchestration, main model reads context and edits directly; do not
  invent writing-agent workflows beyond the two sanctioned ones below. The serial phase
  workflow is one. The release (`../BUILDING/RELEASE-WORKFLOW.md`) is the second: a release
  orchestrator uses `document-writer`, `comment-writer` and read-only `ops-scout`, all in the
  background, and a `phase-implementer` with `AUTHORIZED ELEVATED PERMISSIONS` only on the user's
  word for a named fix. Report writing (`../BUILDING/DOCUMENTATION-WORKFLOW.md`, Rule 3) uses
  `report-writer` and read-only `ops-scout`. Any other subagent requires the user's explicit
  permission. Document writers capture the screenshots.
- Within serial plan orchestration, `phase-implementer` is sole implementation writer and
  `phase-advancer` is sole completion/remediation/detailing writer, including initial
  active-phase detail. Orchestrator creates scoped `full-plan.md`, then invokes these roles
  serially and never delegates same phase to both concurrently.
- `phase-implementer` may delegate only to read-only `phase-implementation-reviewer` sessions.
  `phase-advancer` may delegate only to its declared read-only
  scouts/reviewers/auditors. New tasks start fresh; continuations follow the session rules below.
- `phase-advancer` and `phase-implementer` NEVER spawn background subagents. They start every
  scout, auditor and reviewer with the `subagent_foreground` tool the machine setup registers,
  which blocks until the child reports, and consume the result before continuing or returning.
  Never use the plain `subagent` tool for these children; it returns before the report. This
  role-specific rule overrides inherited general background-delegation instructions; the
  orchestrator's direct launches remain background tasks.
- During scoping, phase detailing, and review, spawn relevant read-only agents below. The
  orchestrator reads intent and high-level documents (the checkout's requirements and its product and
  architecture documentation, starting at the entry points named in
  `AGENT-INSTRUCTIONS/LOCAL/project.md`, plus the active plan and
  phase document) itself and never through a scout; for open-ended detail scouting it
  routes through read-only `ops-scout` rather than reading broad detail into its own context, keeping
  precise, already-known reads for itself. It may run several `ops-scout` sessions concurrently when
  the areas are distinct.
- New child tasks start fresh. Follow `AGENTS.md` on resumes; the rule applies at every delegation
  level and to every role, including scouts, reviewers and writers. Callers own decomposition and
  final judgment.
- The plan-local `autonomous-decisions.md` is orchestrator-only context. Children never read or edit
  it and consume only the concrete settled instructions their caller supplies.

## Agents

Every role distinguishes product phases from `experiment` phases (REPO-RULES §0a): experiment
briefs are short, skip `phase-spec-auditor`, and are reviewed only for the §0a binding rules and
whether the result answers the question.

The read-only agents comprise two scouts (`seam-scout`, `ops-scout`) and three bounded reviewers
(`invariant-reviewer`, `phase-spec-auditor`, `phase-implementation-reviewer`).

`seam-scout` is the discovery scout: its job is discovery, so it is free to explore. Give it an area,
symbol, or question and let it follow imports, callers, wiring, config, migrations, and tests
across modules (read-only git plus whole-file reads, no test/build commands). There is no
fixed read list and no read cap; it stops when the requested area is mapped and returns a
connected `file:line` map. Do not hand it a diff to judge — that is the reviewers' job.

The three reviewers (`invariant-reviewer`, `phase-spec-auditor`, `phase-implementation-reviewer`) are
quick bounded passes, not repo investigations: spawn each for one narrow question and expect a small result in a few
minutes, under `## Reviewer tool-call discipline` below.

The bounded reviewers and `seam-scout` have shell permissions only for the exact read-only
prefixes in the shared `shell` capabilities, rendered into OpenCode with a preceding catch-all
deny. Those capabilities are authoritative; do not maintain another command list here.
`ops-scout` has a full shell but is strictly read-only under its own instructions. No reviewer/scout may run tests or builds (for example `uv`, `pytest` or `ruff`) or edit.
Read the checkout's local tooling files with shell `cat` when permitted; otherwise report missing access or use
tracked evidence, never bypass the reader boundary.

- `seam-scout` - read-only scout. Explores the tree freely within one area and returns exact
  definitions, callers, tests, config, related wiring, and relevant invariants as a connected
  `file:line` map. No diff judgment, no read cap.
- `ops-scout` - general-purpose read-only scout (OpenCode only), the orchestrator's own
  context-saving investigator. Use it for any scouting the orchestrator needs - locating code,
  config, git history, migrations, docs or live administrative or remote state, or finding the root
  cause of a symptom - so the orchestrator never pulls detail it does not need into its own context.
  It has a full read-only shell, including read-only `status`/`coverage`/`summary` reports and
  read-only remote inspection; it never operates, repairs or writes anything.
- `invariant-reviewer` - quick read-only reviewer. Checks a diff/branch/file against
  `../BUILDING/REPO-RULES.md` sections 0, 2, and 3. Use while reviewing.
- `phase-spec-auditor` - quick read-only auditor. Checks that one `phases/<id>.md` is
  implementable without invented symbols or deferred choices. Use before implementation.
- `phase-implementation-reviewer` - quick read-only implementation auditor. Checks phase
  completeness, correctness, scope, docs, verification, and repo rules after implementer's
  pass. One reviewer is default; add another only for distinct high-risk seam. After relevant
  fixes, one fresh review pass checks changed code; do not repeat clean review unchanged.
- `phase-implementer` - OpenCode-only phase writer. Executes exactly one detailed active
  phase, owns proportional verification once, drives fresh read-only review, and returns
  commit-bound receipt plus relevant advancer comments or user-specific test needs.
- `document-writer` - OpenCode-only documentation writer, outside the serial phase workflow,
  used by the release (`../BUILDING/RELEASE-WORKFLOW.md`, roles in `../BUILDING/DOCUMENTATION-WORKFLOW.md`). It takes one scoped
  brief, runs as a background task on disjoint files, and edits only the documentation (the shared
  set and its private part) and the translated values in the interface wording file. A writer that meets a concept missing from the glossary ends unfinished
  with a `TERM REQUEST` and is resumed with the chosen term. Interrupted or unfinished writers resume
  their exact session. Resuming a fully finished writer requires explicit user approval; otherwise a
  follow-up fix starts a fresh writer. Its rules arrive as injected sections of the documentation
  style guide plus the checkout's slots under `AGENT-INSTRUCTIONS/LOCAL/`; the body carries no copy.
- `report-writer` - OpenCode-only experiment report writer used by the documentation workflow's
  report writing (`../BUILDING/DOCUMENTATION-WORKFLOW.md`, Rule 3). It takes one scoped brief, reads
  the recorded experiment evidence freely (archived plans, results and experiment code included),
  never names or links it, and edits only the experiment-report and charts directories. Its rules arrive as
  injected sections of the style guide plus the checkout's slots.
- `comment-writer` - OpenCode-only code documentation writer used by the release
  (`../BUILDING/RELEASE-WORKFLOW.md`). It takes one handoff of verified code-comment findings
  and changes only comment text, docstrings, file headers and named test names.
- `phase-advancer` - OpenCode-only independent phase auditor/detailer. Details initial or
  blocked active phase, or audits implemented phase while reusing passing evidence on
  unchanged revision, prepares remediation or completion, and details exactly one next
  phase. Review mode runs after required user-specific test.

### The release

The second sanctioned workflow beside the serial phase workflow, invoked by the user after a plan's
work or for a hotfix. `../BUILDING/RELEASE-WORKFLOW.md` and the `/release` command own it. Its agents are background `document-writer` and `comment-writer` sessions, read-only
`ops-scout` audits, and a `phase-implementer` with `AUTHORIZED ELEVATED PERMISSIONS` only on the
user's word. The user commits and pushes publicly unless the user explicitly says otherwise.

## Reviewer tool-call discipline

The bounded reviewers carry this discipline in their own bodies: the generator stamps
`partials/reviewer-discipline.md` into `invariant-reviewer`, `phase-spec-auditor` and
`phase-implementation-reviewer` at the marker in each source. One source, no read at review
time, and no second copy here to drift from it. Edit the partial, never a reviewer body.

## Source shape and model assignment

“The original implementer” means the original child session, not a replacement using the same
role or model. Apply the session rules above. Never change the model
unless the user names the change, and never substitute a paid per-token provider because the
subscription provider lacks the requested model. Ask instead.

Each canonical source has `description` frontmatter plus prompt body. OpenCode is the only harness.
Read-only sources declare `access: read-only`; a writing source declares `write: <capability>`; a source that runs commands
declares `shell: <capability>`; a source that writes outside the checkout declares
`external: <capability>`; roles that delegate declare bounded `delegates`; `mode` defaults to
`subagent`. The capability values live in the checkout's
`AGENT-INSTRUCTIONS/LOCAL/workflow.toml`; the generator expands each pattern, including its
checkout-absolute form, and writes the model, the mode and every permission rule into generated
frontmatter. A capability that does not exist in `workflow.toml` fails the stamp rather than
silently granting nothing. `AGENT-INSTRUCTIONS/LOCAL/models.json` is the single source for
assignment; this file does not restate it. Do not switch to an unavailable provider as a fallback.

OpenCode reloads agent files when they change. `--check` is the gate for a stale or orphaned stamp.
