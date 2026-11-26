# REPO-RULES.md - Build Rules

These instructions apply to every AI agent working in this repository. They are repo-wide rules,
not temporary plan guidance.

Sections 1, 2 and 3 and the workspace's own records and exceptions are specific to the workspace: they
live in `AGENT-INSTRUCTIONS/LOCAL/repo-rules-domain.md`, with the same numbering. Everything a role
injects is resolved against that file when the workspace provides it.

---

## 0. The one rule that matters most

The universal rules are in `AGENTS.md`, which every session loads: never trust built infrastructure
or documents, do not tape things together, the forbidden list, read before you write, and the
hobby-project simplicity rule. They govern **product code**; disposable experiment code follows §0a
instead. What follows is what the build rules add.

## 0a. Two kinds of work: product and experiment

Every phase and every piece of code is either **product** or **experiment**. Plans mark
experiment phases with the `experiment` gate level. When the kind is unclear, ask.

- **Product code** stays in the operating product or does real recurring work: everything in
  the product packages, command adapters, migrations, configuration and clients.
  Every rule in this file applies, proportionally to a hobby project.
- **Experiment code** answers one question for one user decision: measurement, tuning,
  prompt/model/ranking comparison, benchmarks, oracle generation, judging, sampling, one-off
  analysis. It is disposable and lives in the workspace's experiment directory, named in
  `AGENT-INSTRUCTIONS/LOCAL/repo-rules-domain.md`. It may import product code;
  product code never imports it. Hardcoded values, copy-paste, inline logic in the script,
  foreground or `nohup` runs, crashing on unexpected input, and no tests are all acceptable.
  Do not build validated config keys, strict DTO or replay frameworks, lifecycle commands,
  seam/config-index entries, permanent runbooks, or unit-test suites for it. Aim for working
  within about a day; if it needs several days of engineering, stop and ask whether the
  question can be answered more cheaply.
- **Rules that still bind experiments**, because breaking them makes the answer wrong or does
  real harm:
  1. Hidden labels: a target's official labels, and anything derived from them, never enter the
     model, prompt, or selection input of an experiment that measures inference quality.
  2. Honest results: record exactly what ran (inputs, model, settings, sample); never fabricate,
     tidy, or cherry-pick results; report failures as failures.
  3. No writes to product/final stores, and no overwriting authoritative data or evidence a
     decision relies on.
  4. No secrets printed, committed, logged, or transferred.
  5. Outputs a later decision depends on stay saved and unchanged.
- Results and decisions go into a dated note in the plan folder's `findings/` directory (for
  example `findings/<name>-<date>.md`). Permanent docs record only the accepted decision.
- An accepted result reaches the product through a product phase that rebuilds only the needed
  mechanic cleanly on existing seams. Never promote experiment code as-is, and never gold-plate
  an experiment in anticipation of promotion. When its scoped cleanup gate arrives, finished or
  no-longer-useful experiment code, with its temporary tests, moves, under the same file names, to
  the experiment archive named in `AGENT-INSTRUCTIONS/LOCAL/repo-rules-domain.md`; do not preempt a
  plan's scheduled transition. Files are archived
  exactly as they are at that moment: never edited, fixed, documented further or run afterwards.
  The archive's only documentation is its root `README.md`. Product and active experiment code
  never import or run anything inside the archive.


---

## 0b. Minimal records

Keep no telemetry, logs or receipts by default. Retain only content-safe failure records and facts a
named product operation actually consumes; store each fact once in its authoritative owner.
Removing existing stored data or changing identities requires a separately user-approved
conversion/migration.

Before retaining a field, payload, log or receipt, name its product consumer and the operation that
needs it. If it has no consumer except its own validation, hash or audit reconstruction, do not retain
it. Keep only the smallest fact that operation needs, once in the owning store; callers
reference the owner rather than copying the fact. Derive status/coverage from authoritative state.
Failure records contain only canonical identity, stage, attempt count and safe class/reason; never
secrets, prompts, domain text or model responses. A user-required failure log is an emission of the
owning failure record, not a second durable history.

**No receipt or hashing machinery by habit.** An action, function, stage or command does not need to
hash its output or save a receipt just because it ran. Every retained receipt must have a concrete
production reader whose operation needs the recorded fact. Name that reader and the actual decision
it makes. Tests, receipt self-validation, audit reconstruction and readers invented only to satisfy
this rule do not count. If authoritative data or existing completion state already answers that
decision, use it instead of adding a receipt, manifest, proof chain or another copy of the state.

Hashes belong where a real operation needs to check bytes, such as verifying data transferred across
a network or checking the expected LLM model artifact/version. They are not a default correctness or
preservation layer around locally produced output. For any other use, identify the concrete product
consumer and why the existing data, explicit version or direct comparison is insufficient. Do not
rehash unchanged data at every function boundary, checkpoint or status read. Do not store both a
payload and its identifying fields and hashes unless a real reader needs each representation.

Do not freeze Git-tracked static files, comments, docstrings or schema descriptions with golden
digests merely to prevent edits. Do not add clean-checkout, revision, hash or receipt gates that
block development without establishing a fact the operation actually requires. A changed computed
hash is not itself a defect or a reason for a version bump. This is a single-operator project;
hypothetical consumers, generic reproducibility and extra test assertions do not justify machinery.
Apply this rule when adding or changing product code. Do not add a registry, checker, receipt or test
suite to enforce it.

The minimal-record rule does not weaken experiment honesty or decision-output preservation, Git
history, frozen benchmark evidence, or the revision-bound verification handoff agents need to avoid
rerunning gates. Keep these once in their existing workflow owner, never in permanent rule/docs files.
Do not add a telemetry framework, registry, audit command or new test suite to enforce the absence of
unnecessary records.


---

## 3a. Test budget (binding)

Tests protect what users and data depend on; they are not a second implementation. Judge their
necessity from the actual changed tests and support code, not passing results or function counts.

- **Helper/mock exception:** no dedicated tests for the workflow's export helper or temporary mock
  fixture/loader. Do not add suites for them; remove existing dedicated mock-data tests when that
  scoped cleanup is authorized. This does not remove coverage of reusable product services or their
  existing synthetic external-boundary fixtures.

- **Phase maximum, not a quota.** A phase adds at most **3 new test functions**. Add zero
  when no new test is justified. For modifications, first adapt an existing relevant test
  rather than creating another. If more are genuinely needed, stop and ask the user,
  naming each extra test and why; only the user can authorize more. **Never split a phase to
  get around this cap.**
- **Remediation shares the phase's cap.** A remediation of a phase is the same phase, not a new
  one: its new test functions count against the original phase's three. When the original
  implementation already used the cap, a remediation adds no test function; it adapts existing
  ones. No advancer, auditor or implementer may grant more. Every extra test function, in a
  remediation or otherwise, needs explicit approval from the user, or from the orchestrator while
  the user has enabled autonomous mode.
- **No size quotas.** There are no numeric code, test, file or document line limits, suite
  ratios, or suite/package test-count limits. Estimates and reported counts are observations,
  never limits or acceptance gates. Do not compress formatting or cram scenarios to meet numbers.
- **What to test.** Focused proof of user-visible or data-integrity behavior of a public
  service, command or CLI/JSON report. The behaviors this workspace must prove are listed in
  `AGENT-INSTRUCTIONS/LOCAL/repo-rules-domain.md`. One regression test only for an observed bug
  that lost or corrupted data or wasted long work.
- **What never to test.** Private helpers; wording or exact error text; exact request bodies
  or command sequences beyond the public contract; config key counts; DTO field validation;
  validator permutations; timing/race arithmetic; legacy formats; a case already proven at
  another layer.
- **Shape.** Keep tests lean, readable and focused on real public behavior or data integrity.
  Prefer real local
  boundaries (temporary files, a local subprocess, a disposable test database) over fakes. At most
  one small fake per external boundary, shared, and it never re-implements product behavior.
- **Delete with code.** Tests are deleted or rewritten in the same change that deletes or
  rewrites the code they cover. Deleting a test because its code or behavior is gone is
  required, not "deleting tests to pass".
- **Layout.** Tests live in sub-directories mirroring the product packages, grouped by
  feature; database tests carry the `integration` marker.

---

## 4. Review checklist before finishing

1. Correct for the required behavior and realistic inputs (no speculative edge-case handling; §0 Simplicity).
2. No regressions; behavior preserved unless task changed it.
3. Data integrity: authoritative data stays separate from derived data, status, validation, no secrets.
4. The exposure boundaries the domain rules state hold.
5. Long-running administrative CLIs share the lifecycle, preserve honest partial coverage, and reuse
   compatible completed work after stop/restart (§2 of the domain rules).
6. No unrelated changes.
7. Product code: no taped-together hacks, hardcoded policy, or duplicate paths. Experiment
   code: only the §0a binding rules, in the experiment directory, never imported by product code.
8. The injected domain invariants (`AGENT-INSTRUCTIONS/LOCAL/repo-rules-domain.md`) are preserved.
9. Docstrings/headers and permanent docs accurate.
10. Verification actually run and honestly reported.
11. Test necessity and budget (§3a): read changed tests and support for necessary, meaningful
    coverage and proportional setup. Respect the cap, avoid quota-driven packing, and remove
    tests with removed code.
12. Simplicity (§0): no speculative recovery, defensive re-checks, validator matrices or
    legacy-format support.
13. No history or plan ids in permanent files.
14. The workspace's publication invariant holds (§2 of the domain rules): no shared file, name or
    value distinguishes public from private, private-only material names itself private and stays
    unexported, and every deployment-specific value lives in an ignored file with an `examples/`
    counterpart.

---

## 5. Priority order

1. Follow user's current request.
2. Obey hard invariants and no-hacks rule, even if work must stop.
3. Stay inside active phase scope when working from a plan.
4. Keep changes small, clean, and reversible.
5. Verify and report honestly.
