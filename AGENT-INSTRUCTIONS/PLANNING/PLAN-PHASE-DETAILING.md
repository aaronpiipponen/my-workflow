# PLAN-PHASE-DETAILING.md - How to expand one scoped phase into implementation detail

This guide is for turning **one vague/scoped phase** from a first-pass plan into a
phase a weaker model can implement safely. It deliberately applies after
`PLAN-AUTHORING-SCOPING.md`, not during the initial requirements conversation.

## Hobby-project proportionality

Follow REPO-RULES §0 (simplicity, no legacy support) and §3a (test budget). They override any
'enumerate every' wording below: enumerate what the phase changes, not every conceivable case.

> **Output target:** one implementation-grade phase file
> `AGENT-INSTRUCTIONS/PLANS/<slug>/phases/<id>-<title>.md`, detailed enough that the
> implementer can do exactly the written steps without inventing files, signatures,
> routes, tables, or tests, and a `User test` acceptance section with explicit executor.
> Write only this one file; do not pre-write other phases.

---

## 1. Inputs

Start with:

- the one phase the status table in `full-plan.md` marks `active` (or the one being promoted to `active`);
- that phase's scoped entry and its neighbors from `full-plan.md`;
- the frozen contracts in `done/` that earlier phases left;
- any user answers to open questions;
- current application tree and product docs, with the repository map and the area READMEs under
  `docs/` as the index;
- relevant architecture/security docs;
- current code, read directly before writing the detailed phase.

When a phase is still vague, do not jump straight to a mechanical build script. First
do a **phase-shaping pass**: discuss or briefly write the intended outcome, boundaries,
tradeoffs, open questions, and likely seams. Brainstorm enough to decide what belongs
in this phase and what is intentionally deferred, then turn the settled scope into the
implementation-grade file below. If the user has already supplied explicit decisions,
record those decisions instead of reopening them.

Do not detail multiple vague phases at once unless the user explicitly asks. The goal
is a coherent implementation session, not the smallest possible diff. Set the selected
phase to `active` in the status table and create exactly one `phases/<id>-<title>.md`
file for that active phase.

---

## 2. Research protocol

Before writing the detailed phase:

1. Read the workspace's product and architecture documentation, its repository map and the current tree.
2. Read the source vague phase and its neighboring phases for dependencies.
3. Shape the phase before detailing: name the user-visible / operator-visible outcome,
   the non-goals, and any decisions or tradeoffs that need user input.
4. Open every likely file named by the scoped phase.
5. Grep/read every function, class, route, table, config key, and test surface you expect to mention.
6. Confirm whether earlier phases have changed contracts since the scoped plan was written.
7. If code and the vague phase disagree, stop and report the drift instead of adapting silently.

The detailed phase must be based on current code, not on memory or the vague phase's
guesses. The phase-shaping pass is for scope and tradeoffs; the final build steps still
must be concrete enough that the implementer invents nothing.

You may delegate the mechanical location/signature gathering (steps 4–5) to the `seam-scout` subagent, which
returns exact `file:line` defs, callers, covering tests and config; once the phase is written,
`phase-spec-auditor` checks it is implementable. You still compose and verify the detailed phase yourself. How to
prompt them (fresh sessions, the `Symbol evidence` table, delta-scoped re-audit) is owned by
`../SUBAGENTS/README.md`.

---

## 3. Required output shape

Write a single phase using the skeleton in **`AGENT-INSTRUCTIONS/PLANNING/phase-template.md`**. Copy that
template into `AGENT-INSTRUCTIONS/PLANS/<slug>/phases/<id>-<title>.md` and fill every
placeholder from current code. The sections are, in order: heading + `Status` /
`Depends on` / `Scope` / `Gate level` / `Simplicity statement`; `Current state (verified)`; `Read first (do not invent)`;
`Build plan`; `Callers / wiring to update`; `Config / schema / migrations`; `Touched files`;
`Rules / MUST NOT`; `Tests`; `User test`; `Completion checklist (gate)`; `Exit`.

This is the place for exact detail. If the implementation model follows only those
bullets, the phase should complete.

`Touched files` sits between its two marker comments, which tooling reads without loading the rest
of the phase. It lists every file the build plan, the wiring, the tests and the docs steps change,
create or delete, one path per line with one short line on what changes there, followed by every
migration, generated file and configuration key the phase adds. It is a summary of the sections
above it, never a new decision: when those sections change, as in remediation or re-detailing,
rewrite the block in the same edit. An experiment brief carries the same block for the files it
writes.

---

## 3a. Gate levels

Every detailed phase must choose exactly one gate level. The level controls the minimum
review/verification required before the phase can be compressed to `done/` and the next
phase can start. For product phases, higher risk always wins; when unsure, choose the stricter
level.

### `experiment`

Use for disposable experiment work (REPO-RULES §0a): measurement, tuning, comparison,
benchmarking, oracle generation, judging, or one-off analysis that answers a question for a user
decision. Choose it by the kind of work, not its risk: label leakage and secret handling in an
experiment are covered by the §0a binding rules, not by `security`.

The phase is a short **experiment brief** (template variant in `phase-template.md`), not an
implementation-grade spec. §4, §5 and §6 below do not apply: the brief need not name signatures,
callers or test names, and the implementer may choose mechanics and iterate over the listed
values. The brief must still fix the question, the decision it informs and its owner, the exact
inputs, the values to try, how to run it, where results go, the §0a binding rules, and a time
budget. Policy choices stay with the user.

Required gate:

- the experiment gate in `VERIFICATION-COMMITS-DEPLOY.md` §1 (run record, binding rules held);
- a dated result note in the plan folder's `findings/` that answers the question;
- the fast phase gate for any product code the phase changes;
- committed, tested head before handoff.

No `phase-spec-auditor` pass for an experiment brief; review of the experiment checks only
the §0a binding rules and whether the result answers the question. If one coherent phase
explicitly includes a product-code freeze, that product change still needs its separately
stated product tests, docs and invariant/trust-boundary review. The experiment exemption
does not extend to product code or product configuration.

### `minimal`

Use for documentation-only changes, comments/docstrings, typo fixes, or behavior-neutral
mechanical edits that cannot affect runtime behavior.

Required gate:

- changed files re-read for accuracy;
- relevant docs links/paths checked;
- no tests required unless the edit changes generated docs, commands, or examples.

Do not use when code behavior, config, schema, permissions, UI behavior, deploy scripts,
or tests change.

### `standard`

Use for normal implementation phases with bounded runtime behavior and no security- or
data-access-sensitive changes.

Required gate:

- targeted tests for touched modules;
- fast phase gate from `VERIFICATION-COMMITS-DEPLOY.md` §1;
- only conditional gates whose seam this phase changes;
- real frontend build when frontend exists and changes;
- permanent docs updated when behavior changed;
- committed, tested head before handoff.

### `full`

Use when the phase changes cross-package contracts, migrations, durable state, AI routing
or tool behavior, frontend/backend API shape, plan-critical seams, or anything where a
fresh review can catch integration mistakes.

Required gate:

- everything in `standard`;
- explicit caller/wiring audit against current code;
- phase document re-read after implementation to catch missed requirements;
- invariant review before completion when hard invariants or permanent docs may be stale;
- full network-free suite only for cross-cutting changes, explicit milestones/final phases,
  or when targeted coverage cannot bound impact;
- separate runtime acceptance only when it proves behavior named tests cannot, with user
  confirmation only for user-only capability from `VERIFICATION-COMMITS-DEPLOY.md` §3.

### `security`

Use when a product phase affects authoritative/derived provenance, destructive data operations,
credentials/auth, user-owned data, public exposure of local services,
evaluation label leakage, or trust boundaries around external/LLM data.

Required gate:

- everything in `full`;
- explicit check against every relevant `REPO-RULES.md` hard invariant;
- deny-by-default / least-privilege negative test where applicable;
- no raw secret, token, unrestricted user payload, or unnecessary raw source-data logging;
- invariant-reviewer or equivalent fresh review before handoff.

`security` does not automatically require Docker, live providers, full data runs, or
unrelated test suites. Run those only when phase changes that seam or explicitly owns milestone.

Gate level affects minimum verification only. A phase may add stricter checks in its
Completion checklist.

---

## 4. Detail bar

Every detailed product phase must enumerate (experiment briefs follow §3a `experiment`):

- one gate level (`minimal`, `standard`, `full`, or `security`) and the reason for it;
- every file touched;
- every exact function/method/class changed;
- every before -> after signature change;
- every caller that must change, found by grep/read and listed explicitly;
- every construction/wiring point;
- every import/export change;
- every route shape or frontend API change;
- every config key and loader/validator change;
- every migration filename, table/function/view touched, and schema apply/version convention;
- for each retained field/log/receipt introduced or changed, the required product consumer and
  sole owner under REPO-RULES' minimal-record rule; no record is the default;
- new, changed and deleted tests by file and name, within REPO-RULES §3a (adapt existing relevant tests first;
  zero new tests when none is justified);
- a one-paragraph **Simplicity statement**: what the phase deliberately does not handle
  (unlikely cases that just raise a clear error), and which legacy or defensive code it deletes.
- every `docs/` page to create, update or delete.
- each verification command as fast or conditional; every slow command (expected over two
  minutes) with reason, sole execution owner, and whether it blocks completion.

Do not rely on "obvious" follow-up work. If it is needed, write it as a step.

---

## 5. Converting scoped TODOs into exact steps

For each TODO in the vague phase:

1. Locate the existing seam that owns it.
2. Decide whether the TODO is in scope for this phase or should remain deferred.
3. If in scope, write file-by-file steps in implementation order.
4. If deferred, name the honest seam or gate that defers it. Do not fake data.
5. Add only the tests REPO-RULES §3a allows. If the phase genuinely needs more than the cap,
   return `USER DECISION REQUIRED` naming each extra test and why; never write a spec over the
   cap.

Example conversion:

Scoped TODO:

- "Expose lifecycle state through the existing decisions poll."

Detailed step:

- "`<path>`, `<symbol>(...)` - include explicit activity
  status and the canonical URL in each result from the existing repository; do not add
  a second store. Update the CLI formatter and API consumer if the result shape changes."

Then continue until callers, tests, docs, and gates are explicit.

---

## 6. No-invention protocol

Detailed phases exist because weak implementers invent APIs when plans are vague.
Prevent that directly:

- Never say "resolve the item" without naming the real repository/service function.
- Never say "update callers" without listing the callers.
- Never say "add a route" without naming the dispatch file and route module shape.
- Never say "store it" without naming the table/store method or creating it in an explicit schema step.
- Never say "add config" without naming the config path and loader validation.
- Never say "use the existing service" without naming the service class/method.

If the needed symbol does not exist, either create it as an explicit step or stop and
ask. Do not assume the implementer will invent the right thing.

Name required files, contracts, signatures, callers and data changes from current source. Leave
local implementation mechanics to the implementer.

- Prove the approach against the real code; run code only when reading cannot settle which path is
  live or what a value is. Do not ship a hypothesis.
- Resolve product, scope and architecture choices before handoff. Do not leave required contract
  decisions to the implementer.
- Confirm the file/symbol you name is on the LIVE executing path (grep the caller; reject dead or
  duplicate copies). A step aimed at dead code is a silent failure.
- Give exact values, not ranges (a starting value the user explicitly deferred is the only exception,
  and you still pick it).
- Refer unresolved product/authority/UX decisions to the orchestrator before implementation.

---

## 7. Keep phase scope small

The detailed phase maps to one coherent outcome, in as many working-state commits as useful.
A good phase may touch several files when those files are part of one natural
vertical slice (for example: config schema + loader + one composition point + tests, or
one backend contract + its frontend consumer + docs). Do not split only because more
than one file changes.

Default to keeping the originally selected phase intact when it remains easy to explain
as one outcome and the build steps fit in one bounded session. Do not repeat the history
of many near-one-line phases. Split only when a genuinely separate user gate or a
product/experiment boundary cannot be handled with distinct gates inside one coherent
phase, or when unrelated decisions or seams cannot fit one bounded session. A moderate,
cohesive multi-file edit remains one phase.

If detailing reveals that the vague phase is genuinely too large, split it before
writing build steps.

Split when:

- backend and frontend need independent acceptance behind a stable contract;
- migration and behavior change need separately gated rollouts;
- implementation would touch unrelated seams that cannot form one coherent outcome;
- verification requires a deploy or human UI check before safe continuation;
- exact steps exceed what one weak model can hold;
- the phase contains multiple product/authority/UX decisions needing distinct user gates.

When split, update the scoped plan or write child phases with clear gates. Each child gets
the parent's id plus `.<n>`, numbered from 1, at any depth: `A2` splits into `A2.1`, `A2.2`
and `A2.3`, and `A2.2` splits into `A2.2.1` and `A2.2.2`. The split rows replace the
parent's row in the status table. Include one sentence explaining why the split is needed; do not split as a
habit or to create one-file phases.

---

## 8. Verification and gates

Every detailed phase ends with a hard gate. Include:

- exact targeted test commands for touched modules;
- fast phase gate and only affected conditional gates from
  `AGENT-INSTRUCTIONS/BUILDING/VERIFICATION-COMMITS-DEPLOY.md` §1;
- full suite, integration directory, live source, full data run, or custom acceptance only
  when phase-specific risk/milestone justifies it;
- real frontend build if frontend code changed after frontend exists;
- `User test` section, which may state `Not required - automated phase gates prove acceptance`;
  when separate acceptance is needed, use `agent` unless capability is unavailable and use
  `user` only for cases in `VERIFICATION-COMMITS-DEPLOY.md` §3;
- committed, tested head before any human verification handoff.

Name one execution owner for each slow gate. Do not require implementer and advancer to run
same command on unchanged revision. Phase implementer must return revision-bound verification
receipt; advancer reuses it under verification guide evidence rules.

Checklist items must be objectively verifiable. Avoid vague boxes like "works well".

Tests must not require real provider keys or network. Do not edit or delete tests just
to make them pass. If a test's intent changed, reconcile that deliberately in the
phase and explain why.

For UI-bearing phases that require subjective visual/interaction judgment unavailable to
agent, require working-state commit before handing browser steps to user. If available
browser tooling can prove objective behavior, agent runs that portion directly; do not
claim tooling proves subjective appearance or interaction feel.

## 8a. Rules to include in detailed phases

Copy into `Rules / MUST NOT` only the REPO-RULES §0 and domain rules' §2 items this phase can plausibly break,
made specific to its files. Do not restate the lists.

---

## 9. Documentation rule

Experiment phases update no `docs/` pages; their results live in a dated plan-folder note, and
only an accepted decision reaches `docs/`.

If product behavior changes, the detailed phase names the exact `docs/` pages to create, update
or delete, per
`../BUILDING/DOCUMENTATION-WORKFLOW.md`. "Update the docs" is not a line item. The implementer
updates those pages in the same change as the behavior and the tests, to
`../BUILDING/DOCUMENTATION-STYLE-GUIDE.md`. The same guide governs the prose the change writes outside the pages, including file headers, doc
comments, configuration and script comments, and test names. Path or ownership changes update
The repository map.

Plans can mention phases. Code comments and `docs/` pages should not.

---

## 10. Done for detailed phase authoring

Before handing a detailed product phase to an implementer, verify the list below. An
experiment brief instead needs only the fields in §3a `experiment`.

- [ ] It is a single `phases/<id>-<title>.md` file, and the status table marks that phase `active`.
- [ ] It expands exactly one selected scoped phase, or explicitly splits it.
- [ ] Current state is verified against the tree.
- [ ] Every symbol/table/route/config key named is real or created by an earlier explicit step.
- [ ] Every caller, wiring point, migration and doc update is listed; tests are
      within the REPO-RULES §3a cap.
- [ ] Simplicity statement present; no legacy-format support, speculative recovery or
      defensive re-check is specified.
- [ ] The phase file holds no history or review narration.
- [ ] No duplicate pipeline/store/path is introduced unless the requirement explicitly demands one.
- [ ] Relevant data, inference, validation, evaluation, migration, and secret
      invariants are written into `MUST NOT` and checklist items.
- [ ] Verification commands and phase gate are explicit.
- [ ] Verification is proportional: targeted/fast gates are explicit, affected conditional
      gates are justified, and every slow gate has one owner and no duplicate rerun.
- [ ] A `User test` section either says separate acceptance is not required or gives concrete
      steps, expected results, and correct `agent`/`user` executor.
- [ ] The gate includes compressing to `done/<id>.md` and flipping status row once
      declared acceptance executor supplies passing evidence.

---

## 11. After planning

Explain to the user what the implementation of the plan actually accomplishes.
Do not use too technical terms, focus more on the core IDEA and the actual user
experience of the changes.

---

## 12. When a detailed phase lands but fails verification

Use `PLAN-PHASE-REMEDIATION.md`: keep and compact the working parts, diagnose every symptom to a root cause at
file:line, hunt latent defects and tech debt in the changed code, and re-detail the fixes in place to the same bar as
§4 and §6 (a fix step that only describes what is wrong is incomplete). The phase stays `active` and stays one
`phases/<id>-<title>.md` file.
