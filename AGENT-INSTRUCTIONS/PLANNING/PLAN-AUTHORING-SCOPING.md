# PLAN-AUTHORING-SCOPING.md - How to turn requirements into a scoped phase list

This guide is for the first planning conversation. Its job is **not** to create a
fully implementable plan. Its job is to help the user and agent turn requirements
into small, ordered, reviewable phases that are intentionally still a little vague.

Use this when the user gives requirements and wants to discuss scope, feature areas,
or phase boundaries. Use `PLAN-PHASE-DETAILING.md` later, when one phase is selected
for implementation-grade detail.

## Hobby-project proportionality

Follow REPO-RULES §0 (simplicity, no legacy support) and §3a (test budget). They override any
'enumerate every' wording below: enumerate what the phase changes, not every conceivable case.

> **Output target:** a plan *folder* `AGENT-INSTRUCTIONS/PLANS/<slug>/` whose
> `full-plan.md` holds strong top matter, design rules, implementation rules,
> gates, and a phase status table, with phases written as scoped TODOs rather than
> exhaustive instructions. Per-phase implementation files are added later, one at a
> time, by `PLAN-PHASE-DETAILING.md`.

---

## 0. Plan folder layout

A plan is a folder `AGENT-INSTRUCTIONS/PLANS/<slug>/`, never a single monolith file; the layout and the load/compress
rules are owned by `../PLANS/README.md`. `full-plan.md` stays small and never grows into implementation detail: it is
the map and the single source of truth for phase status. Do not pre-write phase files; a phase is detailed only when
selected (see `PLAN-PHASE-DETAILING.md`).

---

## 1. Planning conversation mode

Do not jump from requirements to a full detailed plan. First make the scope legible:

1. Ask short questions only for unresolved user-owned product, scope, major architecture/tooling,
   irreversible data, security/privacy, or material cost/operations decisions. Research
   discoverable facts and resolve small mechanical choices from repository conventions.
2. Identify feature areas and natural seams in the current system.
3. Break the work into coherent phases that can each be discussed, rewritten, or deleted.
4. Keep each phase detailed enough to show intent, dependencies, and gates.
5. Leave exact signatures, call sites, schema columns, and test names for the later detailed-phase document.

The conversation should feel like shaping a TODO list with constraints, not handing
over a build script. Phases should be small enough to implement safely, but not
artificially tiny: a cohesive vertical slice may span multiple files when it has one
clear outcome and one verification story.

### 1a. Research pass for fuzzy ideas

Use a research pass before writing `full-plan.md` when the user gives an idea rather
than settled requirements. The output is a short requirements note, not a plan.

Use research when:

- the request names a goal but not actors, workflows, or success criteria;
- several product directions are possible and phase boundaries would be arbitrary;
- user-visible behavior, privacy boundaries, or operational constraints need decisions;
- the work might change how authoritative and derived data are kept apart, user data, external
  data ingestion, or an expensive offline model or compute policy.

Skip research and write the scoped plan directly when:

- the user already supplied clear requirements and non-goals;
- the task is a small bug fix or mechanical change;
- an existing plan or active phase already defines the scope.

Research protocol:

1. Ask short questions until purpose, actors, context, boundaries, needs, risks, and non-goals are clear.
2. Read the workspace's product and architecture documentation, its repository map (named in `AGENT-INSTRUCTIONS/LOCAL/project.md`) and the actual tree first.
3. Record decisions, open questions, constraints, and obvious non-goals.
4. Stop before exact implementation detail. Do not name signatures, migrations, or caller lists unless already central and verified.
5. Convert research note into `full-plan.md` once user-owned decisions are answered or
   explicitly deferred; do not require confirmation for agent-owned detailing choices.

Suggested research note shape:

```markdown
# <Feature / Problem> Research

## Goal
- <user-visible outcome>

## Actors / workflows
- <who does what>

## Boundaries / non-goals
- <what is intentionally excluded>

## Current system anchors
- `<doc or source path>` - <verified existing seam or constraint>

## Decisions
- <settled decision>

## Open questions before planning
- <question that affects scope or safety>

## Plan recommendation
- <recommended phase shape at a high level>
```

---

## 2. Read enough code, not every implementation detail

Read before writing, but calibrate depth to this document's purpose:

- Read the workspace's product and architecture documentation, its repository map (named in `AGENT-INSTRUCTIONS/LOCAL/project.md`) and the actual tree first.
- Read the architecture docs for touched subsystems.
- Open enough current files to know where the work belongs and whether named seams exist.
- Do not fabricate APIs, routes, tables, or config keys.
- Do not spend the scoping pass enumerating every caller or exact before/after signature.

If a requirement appears to require a missing subsystem or a new abstraction, mark that
as an open scoping question instead of inventing it.

---

## 3. Plan anatomy

**Preserve discussed intent.** Record the definitions, decisions and reasons discussed with the
user. Each scoped phase carries its discussed findings, not merely a title. For intended behavior,
a plan agreed with the user takes precedence over stale requirements or documentation; its first
phase brings affected documentation into line. Current source remains the authority for what the
implementation actually does.

Keep the non-phase parts operationally strict:

1. **Top matter** - status, date/branch if relevant, target bar, scope/non-scope, and how to use the plan.
2. **Phase status table** - the single source of truth for what is done/active/next. One row per phase (see 3a-bis).
3. **How to implement this plan** - general rules for later implementers: read map/files, never invent, commits whenever useful (no squashing, no per-phase limit), expand a phase right before coding, config-not-code, run verification, fail loudly.
4. **Binding design rules** - subsystem-specific invariants and repo invariants that must not be violated.
5. **Starting state** - the state before implementation starts, verified enough to anchor the scope, including limitations and known gaps. It stays unchanged for the life of the plan.
6. **Scoped phases** - small TODO-like phases using the template below.
7. **Carry-overs/deferred** - explicit list of things intentionally not included.

This first-pass plan should be useful for discussion and sequencing. It should not be
enough for a weak model to implement without expansion.

### 3a. Top matter template

Every scoped plan starts with a clear status block and use instructions. Copy this
shape and fill it with the current work:

```markdown
# <Project / Feature Area> Plan

> **Status:** scoped forward plan - revised <date> on branch <branch if relevant>.
> **Scope:** <what systems/features this plan covers>.
> **Out of scope:** <nearby systems/features intentionally excluded>.
> **Target:** <production-grade / prototype / internal-only / migration-only>.
>
> **Parts:**
> - **Part 0 - Groundwork.** Behavior-neutral setup, migrations, seams, or cleanup the rest depends on.
> - **Part A - Core behavior.** Backend/domain/runtime changes that create the capability.
> - **Part B - Product/UI.** User-facing screens, interactions, or browser-verifiable behavior.
> - **Part C - Hardening/deferred.** Follow-up reliability, observability, cleanup, or operator surfaces.
>
> **How to use this plan:** discuss and edit phase boundaries first. When implementing,
> first shape the selected vague phase (outcome, boundaries, tradeoffs, open questions),
> then expand exactly one settled phase into an implementation-grade phase from current code before coding.
```

Rules for top matter:

- Name scope and non-scope explicitly so nearby features do not get pulled in.
- State whether the bar is production-grade or exploratory, and mark each experiment phase
  individually with gate level `experiment` (REPO-RULES §0a): a plan may mix both kinds.
- Split into parts only when parts help discussion; otherwise use one phase list.
- Mention implementation only as a later expansion step, not as detailed instructions.

### 3a-bis. Phase status table (single source of truth)

Right after top matter, `full-plan.md` carries one table that records, for every
phase, its status and the gate that lets work move on. This is the first thing an
implementer reads to learn what is done and what is next. Keep it current — it, not
prose scattered through the file, is authoritative.

```markdown
## Phase status

| Phase | Title | Status | Gate level | Depends on | Phase file | Exit state | Move-on gate |
|---|---|---|---|---|---|---|---|
| P0 | Groundwork | done | standard | - | `done/P0-groundwork.md` | seams/migrations in place | tests green, committed |
| P1 | Read service | active | full | P0 | `phases/P1-read-service.md` | store reads/writes via existing seam | tests + acceptance pass |
| P2 | Read views | next | security | P1 | - (detail when selected) | - | - |
| P3 | UI surface | planned | full | P2 | - | - | - |
```

Statuses: `done`, `active`, `next`, `planned`, `blocked`, `deferred`, `not applicable`; user
milestone (`ready`) denotes an operator-owned milestone, not permission for another active
implementation phase. One active phase at a time while work is selected; zero active phases is
valid when waiting on a user milestone/decision or after completion.

Rules:

- A phase id never changes once assigned, and no phase is renumbered: a retitled phase keeps its
  id, a split phase's children take `<id>.<n>` (`PLAN-PHASE-DETAILING.md`), a resolution phase of
  a parallel-plan overlap takes `<held id>r`, and a dropped phase stays as a `not applicable` row.
  Holds between parallel plans and the implementer sessions name phases by these ids.
- At most one phase is `active`. Do not start another until the active one's move-on gate passes;
  zero active phases is valid while waiting on a user milestone/decision or after completion.
- `Phase file` points at `phases/<id>.md` once the active phase has been detailed,
  `done/<id>.md` once compressed, and `-` while still only scoped. In serial orchestration,
  initial `full-plan.md` marks first phase `active` with `-`; `phase-advancer` creates its
  detail and fills the path before implementation.
- `Gate level` is a first-pass expectation (`experiment`, `minimal`, `standard`, `full`, or
  `security`); the detailed phase must confirm or change it using `PLAN-PHASE-DETAILING.md`.
  `experiment` marks disposable experiment work; every other level is product work.
- The `Move-on gate` column is concrete "when to move to next phase" answer: it names
  automated/agent acceptance plus user-only verification when actually required.
- The table's row order is the working order. `Depends on` names only the real prerequisite phases
  whose landed contracts the phase consumes, or `-`; it never restates the working order by naming
  the previous row. When a decision blocks the next phase in the working order, the next phase whose
  prerequisites are done runs instead.
- When a phase completes, flip its row to `done` and repoint its file to `done/`.
- Every product phase identifies the public behaviors/data integrity its tests protect
  (REPO-RULES §3a). A plan sets no numeric code/test/document line limits or suite/package
  test-count gates.

### 3b. Phase boundaries

For multi-phase work, the plan states where `phase-advancer` judges finished behavior and updates
plan state, and where later phases are rewritten after earlier phases become real.

Handoff unit = one coherent phase per implementation task. Before implementation, the
selected phase is discussed/scoped, then expanded from current code into a detailed phase spec.
Later phases stay scoped until their dependencies are real.

Boundary rules:

- A boundary is not decoration. It is where `phase-advancer` judges finished behavior and updates
  plan state; orchestrator checks only big-picture intent and order.
- The `done/<id>.md` contract of a completed phase holds the real names and shapes it created. Detail
  later phases from those contracts.
- If a later phase needs an API/schema from an earlier phase, keep it vague until the earlier gate passes.
- Do not create child phases reflexively. Split when boundaries are genuinely separate;
  keep moderate multi-file slices together when they share one outcome and gate. Never split to
  evade the test cap (`REPO-RULES.md` §3a).
- **Closing survey phase (binding).** Every plan's last phase includes a full read-only survey of all
  areas the plan added or changed, using the previous plan surveys as the base for method and finding
  classes and following the survey method below. The result is a dated note in the plan's `findings/`. It looks for unnecessary complexity,
  duplication, dead code, redundant checks/records, test bloat, stale docs and drift from the user's
  decisions. Findings go to the user and are not fixed inside that phase. The plan is not closed or
  archived until the user accepts the survey results. A shadow plan, created with `/shadow-plan`, is
  the one exception: its single cleanup phase S1 is reviewed after every accepted item, those review
  rounds stand in for the survey, and the user's acceptance of S1 takes the place of the survey
  acceptance.
- **Survey method (binding).** This method covers every survey: full, closing
  and delta. Follow it exactly; do not add steps.
  1. The orchestrator dispatches one independent read-only `ops-scout` per area, and the areas run
     in parallel.
  2. Then it dispatches ONE independent read-only `ops-scout` that cross-checks ALL findings
     together, claim by claim with evidence. Areas get no per-area checker.
  3. Then the orchestrator itself writes the dated survey note from the saved returns. No
     implementer or other child writes it.

  Scout scope:
  - A scout's scope is its assigned area or diff, and it reads whatever context outside that
    scope it needs to judge it.
  - If it notices a problem, or a possible problem, outside its scope, it does not investigate
    further. It must still report it, as an out-of-scope observation with the evidence it already
    has.
  - Dispatch prompts must not tell scouts to report only on the diff.
- **Survey rounds.** The second round is a full survey from the branch start; later rounds survey
  the previous round's diff. Fix clear defects and drift from the user's decisions in remediation
  rounds. A change is "big" only when that single change would need a whole phase of its own,
  judged against completed phases; ten medium changes that together fill a phase are not big. A big
  change that fixes broken behavior toward the intended state is made; a big change of correct
  behavior only to be cleaner, a fix that drifts from a requirement, and every user-owned decision
  go to the survey note's user-review list instead.
- **Survey loop stop.** A remediation made only of small, checked one-line
  fixes needs no further delta survey. When a round leaves only a couple of small documentation
  changes, make them and end the loop.
- **No artificial run caps.** Phases and prompts set no browser-launch or
  rerun limits.
  - Implementers fix their own test or harness mistakes and rerun until the check is valid,
    disclosing each rerun.
  - They fix product bugs within their phase's scope, including ones they introduced.
  - They stop only when a fix exceeds their scope.
  - Never weaken an assertion just to pass.
- UI-bearing phases require working-state commit before any user-only verification.
  Available browser tooling runs objective checks directly; user verifies only behavior
  requiring unavailable access or subjective visual/interaction judgment.

### 3c. How-to-implement section content

Scoped plans still need implementation rules, but they should be general and repeated
inside the plan so implementers do not chase separate guidance. Include a section like:

```markdown
## How to implement this plan

1. Read the workspace's product and architecture documentation, its repository map (named in `AGENT-INSTRUCTIONS/LOCAL/project.md`) and the actual tree, then every file
   named by the selected phase.
2. Never invent a signature, column, table, route, config key, or import. If it does not exist, stop and report drift.
3. One phase at a time; implementers commit whenever useful, with no squashing and no per-phase commit limit. Only one phase is `active` in the status table.
4. Before coding, discuss/scope the selected vague phase, then expand it into its own `phases/<id>.md` file from current code: paths, signatures, callers, migrations, tests, user-test steps, docs. Load only `full-plan.md` (top matter + design rules + status table) and that one phase file while implementing.
5. Do exactly the phase scope. Do not pull later TODOs forward.
6. Product code: config, not code: model names, provider names, prices, thresholds, budgets, prompt pack ids, and policy knobs belong in config. Experiment phases (gate `experiment`) may hardcode them (REPO-RULES §0a).
7. Run targeted/fast checks and only conditional gates affected by phase. Full suite belongs at
   plan milestones or before merge, not every phase; each slow gate has one execution owner.
8. Fail loudly. No swallowed errors, fabricated fallback data, or fake provider answers.
```

This section is not a substitute for the detailed-phase document. It is a guardrail
that keeps scoped phases from being misread as permission to guess.

### 3d. Starting state section

Every scoped plan needs a grounded summary of the state before implementation starts. It can be
shorter than a detailed implementation plan, but it must be real. It is written once and stays
unchanged while phases complete: the starting point of the plan is a durable fact, and the
`done/<id>.md` contracts of completed phases hold what the plan has actually built.

Use this shape:

```markdown
## Starting state (before implementation starts)

- `<stable doc or source path>` - <responsibility / behavior at the start>.
- `<source path>` - <known seam likely to be extended>.
- `<source path>` - <limitation, bug, or missing capability that motivates work>.

What later phases inherit:
- <API/schema/config/seam that should be reused>.
- <known constraint or limitation to preserve>.
```

Rules:

- Include honest limitations, not just happy path.
- Name likely owning subsystems but avoid exact caller lists.
- If the starting state is uncertain, make that an open question.
- Do not mark something verified unless it was read in current docs/code.
- Do not update this section as phases complete.

### 3e. Design rules section

Use numbered, binding design rules. They should be concrete enough to reject bad
implementations later.

Example shape:

```markdown
## Design rules (binding)

1. Existing permission/session boundaries stay authoritative.
2. Extend existing service/store/tool seams before creating new ones.
3. User-visible state comes from backend-owned durable state, not frontend-only inference.
4. Config owns policy knobs; code owns mechanics.
5. Fail closed on ambiguous identity, ownership, or visibility.
6. UI phases require objective browser verification; stop for user only when acceptance
   needs unavailable access or subjective visual/interaction judgment.
```

Add subsystem-specific rules from stable architecture docs and current code.

### 3f. Implemented compression section

When a phase completes, its detailed `phases/<id>.md` file is compressed into a
`done/<id>.md` stub holding only the frozen contract later phases consume — the
detailed build instructions are retired so they cannot mislead future detailing. The
`full-plan.md` status table row flips to `done` and repoints at the stub, and the completed phase's
description in `full-plan.md` is replaced by a pointer to that stub. Keep future scope, binding
decisions and standing rules; remove only finished execution detail.

Use this shape for `done/<id>.md`:

```markdown
## Phase <id> - <area> [DONE]

Implemented and verified. Build instructions retired. Later phases consume these
frozen contracts:

- `<path>` now owns <capability>; callers use <real method/route/config key>.
- `<schema/config>` now contains <real field/key>; downstream phases must not invent a replacement.
- Known carry-over: <gap intentionally folded into later phase>.
```

Keep only the frozen contract. Do not keep obsolete build steps.

---

## 4. Scoped phase template

Use this lighter template for each phase:

```markdown
## Phase <id> - <short title>

**Status:** planned.
**Depends on:** <real prerequisite phase(s) whose contracts this phase consumes, or none>.
**Scope:** <one paragraph: what this phase makes possible>.
**Expected gate level:** <experiment | minimal | standard | full | security>.

**Starting state / reason:**
- <verified fact or user problem>
- <known limitation or risk>

**Likely areas to touch:**
- `<path or subsystem>` - <why it is likely involved>
- `<path or subsystem>` - <why it is likely involved>

**TODOs:**
1. <small outcome-level task, not exact code instructions>
2. <small outcome-level task>
3. <small outcome-level task>

**Must not:**
- <invariant or shortcut to avoid>
- <out-of-scope feature>

**Verification shape:**
- <targeted/fast checks plus affected conditional gates; flag likely slow gates and milestone owner>
- <separate acceptance category, or `none beyond automated tests`>

**Exit:** <observable state at phase boundary>.
**Move-on gate:** <what must pass - automated tests + acceptance test, and user-only test when required - before next phase starts>.
```

When this phase is selected for build, it is expanded into its own
`phases/<id>-<title>.md` per `PLAN-PHASE-DETAILING.md`. The scoped entry here stays as
the map; exact steps live in the phase file.

Good scoped TODO:

- "Expose the active item's scope through the existing search service without adding a second read path."

Too detailed for this document:

- "Change the existing `SearchService.search(...)` signature and enumerate its callers" — illustrative, not a promised change.

Too vague:

- "Fix search."

---

## 5. Detail level rules

Include:

- phase purpose and dependencies;
- likely files/subsystems, if verified;
- intended phase boundary and non-goals, especially when the phase could be sliced several ways;
- important invariants and forbidden shortcuts;
- broad TODOs in implementation order;
- whether migration, full suite, frontend build, live source, full catalogue, or separate
  acceptance is likely, and which phase milestone owns any slow gate;
- expected gate level and why that level fits the risk;
- open questions that must be answered before detailing.

Avoid in this document:

- exact function signatures unless already central to a known seam;
- path:line caller lists;
- exact migration filenames;
- exhaustive test names;
- full prompts or config schemas;
- checklist boxes detailed enough for implementation.

Those belong in the detailed-phase expansion.

Scoped is not thin: each phase section carries its intent and decisions in enough detail to be used
from a completely fresh context without reopening them. A one-sentence description of a big phase
is not adequate.

---

## 6. Design rules and invariants

Every scoped plan should restate the relevant hard rules in the plan itself, plus any
subsystem rules. Do not make implementers chase another document for the rules that
decide whether a phase is safe.

Name in each scoped product phase's `Must not` the REPO-RULES §0 and domain rules' §2 items it can plausibly
break; do not copy the lists. Experiment phases name only the REPO-RULES §0a binding rules.

---

## 7. Open questions are first-class

If user-owned requirement is not settled, write it as open question near relevant phase.
Do not silently choose major product/architecture/tooling/safety decisions. Resolve small
implementation/detailing choices from requirements, current code, and repository conventions.

Good open question:

- "Should the result list include items whose entry conditions are not enabled? Decide before detailing."

Bad open question:

- "Figure out backend."

When the user answers, update the scoped phase. Do not expand to implementation detail
until the user selects that phase for detailing.

---

## 8. Done for this scoping document

Before handing over a scoped plan, check:

- [ ] Plan is a folder `PLANS/<slug>/` with `full-plan.md`; no monolith.
- [ ] A phase status table exists and marks exactly one `active` phase (or all `planned` if not started).
- [ ] User goal, non-goals, and target bar are stated.
- [ ] The starting state is grounded in real docs/code, with no invented APIs.
- [ ] Work is split into coherent, manageable phases with dependencies, exit state, and a move-on gate each.
- [ ] Phase TODOs are specific enough to discuss but not enough to implement blindly.
- [ ] Non-phase sections carry enough operational discipline for a weaker implementer.
- [ ] Slow/full/live/manual gates are milestone-scoped with one owner, not duplicated per phase.
- [ ] Closure belongs to the release (`../BUILDING/RELEASE-WORKFLOW.md`) after the closing survey; the
      release's input includes the plan's `docs-pass.md` list.
- [ ] The last phase includes the closing survey of all new/changed areas; closure waits for the user's
      acceptance of its results. A shadow plan has no survey (§3b).
- [ ] Open questions are explicit.
- [ ] Later detailed expansion is delegated to `PLAN-PHASE-DETAILING.md`.
