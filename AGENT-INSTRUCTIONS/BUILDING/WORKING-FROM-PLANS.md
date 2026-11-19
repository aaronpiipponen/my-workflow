# WORKING-FROM-PLANS.md - Working From Plans

Most non-trivial work here is driven by a plan. When the user points you at a plan,
these rules apply.

---

## 1. Plan execution rules

- **Load the right files, and only those.** A plan is a folder `AGENT-INSTRUCTIONS/PLANS/<slug>/`. For a work session read `full-plan.md` (top matter + design rules + the phase status table) plus the one `phases/<id>.md` file the status table marks `active`, and any `done/<id>.md` frozen contracts it depends on. Do not load the whole plan history or other phase files — that bounded context is what keeps a weak model from forgetting and hallucinating. Re-read these before each session and periodically during long ones; treat the phase file's file lists, signatures, and MUST NOT rules as binding.
- **The status table is the source of truth for progress.** Exactly one phase is `active`. Do not start a phase the table has not promoted.
- **Orchestrator big-picture pass:** on takeover, read the product requirements and relevant product/
  architecture documentation directly, not through a scout. Before each implementation, read the
  complete active detailed phase and check it against that intent. Reuse already-read unchanged
  requirements and docs in the same session; re-read when they change, context is lost or a specific
  question requires it. Do not ritualistically reload the whole requirements tree at every handoff.
  Record only directly relevant discrepancies; do not expand unrelated cleanup.
- **One phase at a time.** Do not start a phase until the previous phase's verification passes. Implementers commit whenever useful, as many commits as they want, with no squashing; the receipt names the base and tested head (`VERIFICATION-COMMITS-DEPLOY.md` §4).
- **Complete the phase's Completion checklist (gate) before the next phase.** If a phase carries a Completion checklist, every item must be checked and its verification must pass before the next phase starts. Never tick a box you have not actually verified.
- **Honor the phase's gate level.** Detailed product phases declare `minimal`, `standard`, `full`, or
  `security`; disposable experiments declare `experiment` and follow §0a and the brief-specific gate.
  Treat the declared level as the minimum verification/review bar from `PLAN-PHASE-DETAILING.md`; add
  stricter checks when the code or risk demands it.
- **Run separate acceptance only when required, then compress.** Every phase file has a
  `User test` section, which may state `Not required - automated phase gates prove acceptance`.
  Agent executes required acceptance when current tools/environment can run and observe it.
  Stop for user confirmation only when test requires user-only capability named in
  `VERIFICATION-COMMITS-DEPLOY.md` §3. After required evidence exists, compress phase into
  `done/<id>.md` (frozen contract only) and flip status table row to `done`. Keep
  `done/<id>.md` to **decisions, invariants, and contract guarantees** later phases depend on,
  not duplicated signatures/config values: current source owns
  those (one source of truth - REPO-RULES §2.7).
- **Know the phase kind.** A phase with gate level `experiment` is disposable experiment work
  (REPO-RULES §0a): it carries a short brief, not an implementation-grade spec. Follow the brief's
  question, fixed inputs, values to try, run steps and budget; choose mechanics and iterate on the
  listed values yourself, but never pick policy or change the question. §2 below applies to
  product phases only.
- **Shape and write the §2 spec before implementation.** The phase-advancer shapes and writes the
  §2 spec from current code before implementation; the implementer reads it and reports gaps, never
  writes downstream detail. If you cannot write it from current code, you are not ready; read more
  first.
- **Do exactly the phase's scope, no more.** Plans deliberately defer things. Do not pull future features forward, and do not improve unrelated code while you are there.
- **If the plan and code disagree, stop and surface it.** Do not silently reinterpret the plan or quietly diverge.
- **Match the phase's exit criteria literally.** "Behavior unchanged" means the app must look and act identically. Verify; do not assume.

---

## 2. Pre-implementation spec

Before coding a product phase, the phase-advancer writes a short spec from current code. Include:

- exact file paths to edit;
- exact existing signatures/classes/routes/tables/config keys read from code;
- exact before -> after signatures for changed functions;
- gate level and why that level fits the phase risk;
- targeted/fast checks, affected conditional gates, and each slow gate's reason plus sole owner;
- every caller/wiring point that must change;
- migration filename and schema/version convention if schema changes;
- new, changed and deleted test files and names, within REPO-RULES §3a;
- the exact `docs/` pages to create, update or delete;
- the governed prose the change writes outside the pages (file headers, doc comments,
  configuration, ignore-file and script comments, and test names), all to
  `AGENT-INSTRUCTIONS/BUILDING/DOCUMENTATION-STYLE-GUIDE.md`;
- explicit MUST NOT rules for this phase.

If you cannot write this from current code, keep reading. If a named symbol does not
exist, stop and surface the drift.

---

## 3. Phase scope and boundaries

- A phase is one coherent unit of work, in as many commits as useful; cohesive multi-file slices are fine, and the splitting
  rules are in `../PLANNING/PLAN-PHASE-DETAILING.md` §7.
- Later phases consume real frozen contracts, not guessed signatures. At a phase boundary the
  phase-advancer validates behavior, freezes real APIs/schema/config, and rewrites downstream phase
  details.

---

## 4. Common failure mode

Renaming or relocating a big file and calling it "modularized" is not enough.
Splitting means state and responsibility actually move into smaller units with clear
contracts, not the same blob under a new name.

---

## 5. Verification for planned work

The phase implementer owns verification per `VERIFICATION-COMMITS-DEPLOY.md` §1 and returns the tested commit SHA
plus a compact receipt; the advancer reuses valid evidence; reviewers and auditors follow `../SUBAGENTS/README.md`.
Tests must not need real provider keys or network unless a declared live conditional gate owns that source seam.

---

## 6. Planning priority

The priority order is the one in `AGENT-INSTRUCTIONS/BUILDING/REPO-RULES.md` §5, with one
plan-specific addition: **stay inside the active phase's scope** (slots in at priority 3,
after the user request and the invariants/no-hack rules, before "keep changes small"). Do
not restate the full list here; read `REPO-RULES.md` §5.
