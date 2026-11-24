# PLAN-PHASE-REMEDIATION.md - How to re-detail a phase that landed but failed verification

This guide is for the case where a phase was already detailed (`PLAN-PHASE-DETAILING.md`),
implemented, and then **failed its `User test` / owner retest** or shipped latent defects.
The phase is not done, but it is also not a blank scoped phase anymore: real code exists, some
of it correct. The job is to **keep what works, find everything broken, and re-detail the fix
to the same implementation grade as the original phase** so a weak model can finish it.

## Hobby-project proportionality

Follow REPO-RULES §0 (simplicity, no legacy support) and §3a (test budget). They override any
'enumerate every' wording below: enumerate what the phase changes, not every conceivable case.

**Fold small findings forward (user rule).** A separate remediation unit runs the whole workflow again
(advancer, scouts, reviews, orchestrator check, implementer, reviews, advancer) and costs a lot of usage.
When the findings are small and do not break data integrity, security, or a behavior the next phase
builds on (for example a CSS/style defect, a missing doc ripple, a small wording or wiring fix), do not
create a remediation unit: complete the phase, record each finding as an explicit carry-over in its
`done/<id>.md`, and detail the next phase so it fixes them alongside its own work, without extra tests for
them. Use in-place remediation only when a finding is substantial or the next phase cannot safely
build on the current state.

For an `experiment` phase, remediation only fixes a wrong or unanswered result or a broken
REPO-RULES §0a binding rule, by rewriting the brief. Hardcoding, duplication, missing tests or
docs in experiment code are not findings.

It applies after detailing/implementation, before `../BUILDING/WORKING-FROM-PLANS.md`
resumes on the rewritten phase. The phase stays `active` throughout; remediation is not a
new phase id.

> **Output target:** the SAME `phases/<id>-<title>.md` file, rewritten in place to the
> `PLAN-PHASE-DETAILING.md` §3 output shape, where the build steps are now fix steps. The file
> still reads as one implementation-grade phase, not as a bug list.

---

## 1. Inputs

- the failing phase file `phases/<id>-<title>.md` and the `full-plan.md` row (still `active`);
- the retest evidence: the user's observed-vs-expected results, error text, screenshots;
- the prior revision-bound verification receipt and tested commit SHA;
- traces/logs the system already records for the affected path (do not add new instrumentation
  before reading what exists);
- the frozen contracts in `done/` that this phase must still honor;
- current code, read directly — the implementation changed the tree since the phase was written.

---

## 2. Diagnose before rewriting (no-guess protocol)

Same no-invention bar as detailing. You must read the actual code paths, not theorize.

1. Reproduce each reported symptom against the code: trace the exact call path from the user
   action to the failing line, file:line.
2. For each symptom, name the **single root cause** at a file:line, not the surface behavior.
   "Two notes appear" is a symptom; "`X` links every id including deduped ones" is the cause.
3. Separate symptom clusters that share one root cause (fix once, not N times).
4. **Hunt latent defects** the retest did not surface, in the code the phase changed:
   - inconsistent row/return shapes between sibling methods;
   - guards that are unreachable because an earlier filter already excluded the case;
   - swallowed exceptions (`except Exception`, `catch {}`) hiding the real failure;
   - second source of truth created for a fact the phase was supposed to centralize;
   - fallback paths that re-introduce the exact dependency the phase was meant to remove.
5. **Catalog tech debt the implementation created** in the code the phase changed, against the
   REPO-RULES §0 no-hack and simplicity rules: duplicate pipelines/stores, copy-paste blocks,
   hardcoded values, fake fallbacks, permission bypasses, parallel state stores, legacy-format
   support, speculative recovery, defensive re-checks and validator matrices. Defects outside
   the phase's changed code are reported to the orchestrator as a one-line note, not fixed here.
6. If a root cause requires a design decision the original phase did not settle (e.g. which
   authority backs an action), refer it to the orchestrator; do not pick silently.

If code and the phase's claimed behavior disagree, that disagreement IS a finding — record it.

---

## 3. Compact the working parts

Do not delete the record of what was built. Compress it so the implementer does not rebuild it
and does not re-question it.

- Replace the original `Current state (verified)` / long build plan for the working areas with a
  short **"Implemented and sound (do not rebuild)"** list: one line per kept seam, naming the
  real symbol/file and one phrase on what it correctly does.
- Where a kept part has a limitation that becomes one of the bugs, say so inline and point to the
  fix step id ("EXACT topic match only — becomes bug F1").
- This list is reference, not work. The implementer reads it to know the boundaries of the fix.

---

## 4. Re-detail the fixes to full implementation grade

Each fix is written to the **same detail bar as the original detailed phase**
(`PLAN-PHASE-DETAILING.md` §4 and §6). A small model must be able to implement it from the text
alone. For every fix:

- give it a stable id (`F1`, `F2`, … or reuse the phase's sub-id scheme);
- state the **root cause** at file:line;
- write **file-by-file steps in implementation order**, each naming the real path + symbol,
  before→after signature when it changes, and the exact semantic;
- list every **caller / wiring / import** ripple, found by grep, explicitly;
- name every **schema/function/migration/config key** touched with the repo's apply convention;
- never say "resolve the item", "update callers", "store it", "use the existing service"
  without naming the concrete function/method/table/store (the §6 no-invention rules apply in
  full).

A fix step that only says what is wrong is not done. It must say exactly what to change.

Apply the no-invention protocol of `PLAN-PHASE-DETAILING.md` §6 in full, with these additions for fixes:

- Prove the root cause before writing the fix: read the exact code and, when reading is inconclusive, run it
  (repro script, live query, measured value). "Likely" or "probably" means the research is unfinished.
- Already-correct code is a valid finding: make the chunk VERIFY-ONLY with a re-test instead of inventing a change.
- If the root cause depends on an unresolved product/authority/UX choice, refer it to the
  orchestrator (per §2.6); never push that decision down to the implementer.

---

## 5. Tests and gate

- Adapt the fix's existing relevant test first. Add a regression test only when data loss/corruption or wasted
  long work justifies it and existing coverage cannot prove it, within REPO-RULES §3a. Name file and test.
- Re-run the focused regression plus fast gate and only conditional gates affected by remediation.
  Reuse unrelated passing full-suite, database, live-source, full-data, and acceptance evidence
  when relevant seam did not change.
- When failure came from separate acceptance, extend original `User test` into a **retest** section:
  re-run exact failing steps from evidence and state precise pass result. Otherwise acceptance may
  remain `Not required - automated phase gates prove acceptance`.
- Keep the original phase's `Completion checklist (gate)` shape; its boxes now cover the fixes,
  the latent defects, and the tech-debt cleanup, plus the affected `docs/` pages, the affected gates, the commit, and the compress-to-`done/` step
  (`../BUILDING/DOCUMENTATION-WORKFLOW.md`).

---

## 6. Output shape

Rewrite the file in the `PLAN-PHASE-DETAILING.md` §3 shape, with these adaptations:

- `**Status:**` stays `active`, annotated `(remediation — landed, failed retest)`.
- Keep `Current state (verified)` but split it: **"Implemented and sound (do not rebuild)"**
  (the §3 compaction) and **"Broken / latent (root causes)"**.
- `Build plan:` becomes the numbered **fix steps** from §4, full grade.
- `Callers / wiring`, `Config / schema / migrations`, `Touched files` (rewritten to list the
  fix steps' files), `Rules / MUST NOT`, `Tests`, `User test` (as retest), and
  `Completion checklist (gate)` are all still required and still filled to the detailing bar.

The reader must still be able to implement the whole remaining phase from this one file plus
`full-plan.md`.

---

## 7. Done for remediation authoring

- [ ] Every reported symptom mapped to a root cause at file:line.
- [ ] Latent defects and tech debt in the code the phase changed enumerated, not just the
      reported bugs.
- [ ] Working parts compacted to a do-not-rebuild list, not deleted.
- [ ] Each fix written to full implementation grade (real symbols, ripples, schema, tests).
- [ ] Every root cause was PROVEN (read + run/repro/measure), not hypothesized — no "likely/probably".
- [ ] No fix leaves a required product or architecture contract decision unresolved.
- [ ] Every named fix location confirmed to be on the LIVE executing path (not dead/duplicate code).
- [ ] Any threshold/value/scope is an exact value backed by a shown measurement or code citation.
- [ ] Chunks for already-correct code are VERIFY-ONLY re-tests, not invented changes.
- [ ] Regression tests only for data-loss/corruption/long-work root causes, within the §3a cap,
      which the remediation shares with the original phase: no new test function once that phase
      used its three, unless the user (or the orchestrator in autonomous mode) approved it;
      retest mirrors original failing steps when separate acceptance failed.
- [ ] Gate includes fix, latent-defect and tech-debt boxes, focused/affected gates, docs/commit, and compress-to-`done/` without repeating unrelated slow gates.
- [ ] Still one `phases/<id>-<title>.md` file; `full-plan.md` row still `active`.
