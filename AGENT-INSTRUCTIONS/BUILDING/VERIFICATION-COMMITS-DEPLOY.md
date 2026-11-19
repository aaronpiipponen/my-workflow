# VERIFICATION-COMMITS-DEPLOY.md - Verification, Commits, Deploy, Handoff

---

## 1. Proportional verification

Verification has one execution owner per unchanged revision: normally phase implementer.
Independent review means inspecting code, contracts, and evidence; it does not mean rerunning
every passing command. Hobby-project phases use smallest gate that proves changed behavior.

**Manual UI acceptance.** A user-requested UI test means a manual user test. Do not replace it
with temporary UI-test scripts or extra tests. Existing automated checks remain separate evidence
and do not establish that the user has tested or accepted the interface.

**Browser checks.** Use the repository's browser tooling and observed DOM/accessibility information.
Set no artificial run caps. Fix in-scope product/test/harness errors and rerun affected checks,
disclosing corrections without weakening assertions. Reuse passing evidence on unchanged behavior.
A phase prohibition on browser work still applies.

**External claims.** Never claim that a site, page or service outside the shell works without
browser or screenshot evidence of it.

**Disposable resources.** Take a baseline listing before the first Docker or test run of any kind,
development runs included: containers, volumes, networks, databases, Docker images (tagged and
untagged) and the build cache whenever a build runs. Remove every temporary process, build,
container, volume, database, browser profile and scratch file the work creates, and prove the
removal against that baseline. A failed cleanup blocks completion.

**Focused reruns.** Diagnose from the code before changing it. Run individual failing tests by
node id first. Do not rerun passing tests on unchanged code, and run each required full suite only
once at the end.

### The checkout's gates

The gate commands, the conditional-gate table and the CI triggers belong to the checkout: they live
in `AGENT-INSTRUCTIONS/LOCAL/gates.md`. Run the fast gate for every code change, a conditional gate
only when the phase touches that seam or is explicit milestone proof, and reuse passing evidence on
an unchanged revision.

### Slow gates and evidence reuse

- Any command expected to exceed two minutes is a slow gate. Phase spec must state why it is
  necessary, one execution owner, and whether it blocks completion.
- Run slow/live/full-data/manual acceptance once per tested revision. Never rerun merely for
  independent confidence.
- Implementer returns compact `VERIFICATION RECEIPT` containing the phase's base revision and tested head commit SHA,
  command names/results, omitted conditional gates with reasons, and a `TEST BUDGET` line:
  test functions added/deleted (optional net lines are observations only). Phase cannot advance without
  its committed, tested head (see §4); obtain standing authorization before implementation loop.
- Advancer confirms receipt matches current revision and relevant worktree. Reuse passing evidence
  when unchanged. Rerun only missing/failed evidence, a focused reproducer for a finding, or tests
  affected by code advancer changed.
- Remediation runs regression plus affected fast/conditional gates. Previously passing unrelated
  integration/live/acceptance evidence remains valid on unchanged seams.
- Reviewer and auditor use (one phase-implementation reviewer by default, the `Symbol evidence` and
  receipt hand-off, delta-scoped re-audit, every real finding reported) is owned by
  `../SUBAGENTS/README.md`; the calling implementer/advancer judges which findings are real.
- Separate acceptance is optional. Omit it when targeted automated tests already prove outcome.
  User testing remains only for unavailable access/hardware or subjective UI/interaction judgment.
- Do not edit/delete tests merely to pass; deleting tests with the code they cover is required
  (REPO-RULES §3a). Never claim unrun or placeholder command. Add focused
  checks when observed risk requires them, not by default for every new function.

---
## 2. Deployment boundary

The checkout's deployment ritual, its services, addresses and redeploy commands live in
`AGENT-INSTRUCTIONS/LOCAL/deploy.md`. This workflow owns the boundary, not the ritual: a redeploy
requires a clean checkout at the tested commit, and deployment, implementation review, acceptance
and plan closure stay separate steps.

---


## 3. Stopping for user confirmation

A phase's `User test` is acceptance test, not automatic user interruption. Run it directly
when current tools/environment can execute and observe it through CLI, services, tests, or
available browser tooling. Do not defer agent-runnable testing to user.

Stop and ask user only when correctness depends on capability agent does not have, such as
subjective rendered UI/interaction judgment, physical handling, private-account creation,
gated-model authorization, inaccessible authenticated workflow, external data unavailable to the
environment, or local model execution unreachable through the available tools. Configured CLI, browser, and SSH access count as agent capability: use them rather than
delegating commands or evidence inspection to user merely because target is private hardware or a
personal machine. Never read or print a cached credential; user supplies only authorization or
secret entry when needed, then agent resumes all observable commands. Give exact numbered
screens/actions and expected results for any truly user-only step. Do not substitute unit tests for
observations they cannot prove.

State what changed, what could not be verified, and precisely what to inspect.

---

## 4. Commits and safety checkpoints

Commits are safety checkpoints, but commit only when the user requests it or the active
workflow explicitly authorizes it.

- Make a coherent working-state commit before handing a state to the user for manual
  testing when commit authorization exists.
- Keep commits focused: one logical change each. A phase may take as many commits as useful.
- **Commit only owned paths.** Name the exact files in orchestration commits. Never use
  `git commit -a` while another agent may have uncommitted work. Do not sweep unrelated or another
  agent's changes into your commit.
- **Commit whenever useful.** An implementer commits as often as it wants while implementing, with
  no squashing and no limit on commits per phase. The verification receipt names the phase's base
  revision and its final tested head, and review covers the whole `<base>..<head>` range. Never
  rewrite commits that are already pushed or that you did not make.
- Never commit secrets, keys, `.env` files, downloaded models, raw private data, or large
  generated datasets.
- Commit on the working branch, not default branch, unless instructed otherwise.
---

## 5. Completion summary format

End every task with:

```text
## Summary
- what changed and why

## Files Changed
- path - one line each

## Verification
- exact commands run and their result, or "not run" stated plainly

## Notes / Risks
- anything uncertain, deferred, or worth human attention
```
