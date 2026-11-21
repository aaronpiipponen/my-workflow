## Reviewer tool-call discipline

This is a quick focused-review pass, not a full repository investigation. Budget a few minutes and a
bounded read set; never bound the findings.

HARD MAXIMUM THREE FILE-READ BATCHES TOTAL, NEVER MORE: batch 1 contains the diff/phase and
all known named files together; up to two targeted later batches are allowed. The third is
allowed; the fourth is forbidden. Report missing evidence at this bound; a time budget is
not a substitute.

- Review only the supplied diff, the listed files, and the rules they could violate. Do not survey
  the repository or read unrelated modules.
- Zero findings is a valid result; never hunt to fill a quota.

The caller supplies a reviewer's whole working set: an exact diff (a commit range the reviewer runs through read-only
`git diff`, an inline patch, or a file path) and a named read list of changed plus context files, each with a
one-line reason. These rules are strict; breaking one is a failed pass, not a style nit.

- **Batches, not files, are capped.** A batch is every tool call issued in one turn. Batch 1 carries the diff (or the
  phase document) and every named file, each read whole, plus this file. Two more batches are allowed, and no more.
  Never spend a turn on a single read when the other files needed are already known, and never loop reason → read →
  reason → read.
- **Whole files, exactly once.** Never pass `offset` or `limit`, never slice a file, never reopen a file; a second
  read of a file is a defect even in a later batch.
- **One `git diff`, then trust it.** The diff is complete: never reconstruct it by opening files. Read-only
  history (`git log`, `git show <rev>`, `git blame`, diffs between earlier revisions) is allowed whenever it settles
  what changed, when or why. Shell calls follow "Shell calls" below. Never redirect git output to a file (`>`, `>>`,
  `--output`, `tee`); read it directly. For a delta re-audit of a phase,
  `git diff` the changed line ranges and read only the rewritten sections.
- **One batched `grep`/`glob`**, in either later batch, over the named symbols, rules and config keys; never one
  call per symbol and never a term that is not named.
- **The later batches are targeted and reported.** They may carry that batched search and any file outside the named
  set that a specific finding cannot be judged without; the output states each as `read <path>: <finding it
  settles>`. Never browse a directory, package or subsystem, and never follow a symbol into an unrelated module.
- **Then reason once and answer.** A fourth read batch, or a batch spent on one already-known file, is a failed pass;
  name what is missing instead of expanding scope.
- **Verify only what is new.** Reviewers independently verify what the phase creates or changes the signature of; for
  existing, unchanged symbols they consume the caller's `Symbol evidence` table or verification receipt instead of
  re-locating symbols or rerunning gates. A re-audit after a rewrite is delta-scoped: pass the prior gap list plus
  changed line ranges, never a fresh full audit of unchanged sections.
- **Report every real finding**, ranked most severe first, and never withhold one to keep a short list; zero findings
  is a valid result. The calling implementer/advancer judges which findings are real and fixes only those: reviewers
  surface, callers decide.
