# Toy runs

This report asks whether parallel plan orchestrators under a coordinator can build one project together without merge conflicts, across every recorded test run.

**Evidence status:** Observational, one run per configuration. **Run dates:** run001 23 November 2026, run002 23 to 24 November 2026, run003 24 November 2026.

## The question

The parallel workflow claims that several plan orchestrators can work on one codebase at the same time, each on its own branch, and that a coordinator can see their overlaps coming, stop both plans before the overlapping work, and let them agree on one design that both branches then reach separately. If that holds, each plan's release merges into the integration branch with only textual conflicts that the shared designs already settle.

A claim like that cannot be checked on a production project without risking it, so the workflow runs on a toy project first. Each run asks the same question: does the whole flow work end to end with real agents, and where does it break?

## Setup

### The toy project

The toy project is a small Rust raytracer with no dependencies, described by fourteen requirements. It starts as a program that renders two spheres with flat shading to a PPM on standard output, with five tests. Three plans then extend it, each scoped so that they meet in the same files:

| Plan | Owns | Where it meets the others |
|---|---|---|
| plan-a, materials | Diffuse, metal and glass materials, a bounce loop, jittered samples per pixel | The hit record, the render loop and the scene |
| plan-b, geometry | Face side and texture coordinates on every hit, planes, triangles, bounding boxes | The hit record and the scene |
| plan-c, output | A PNG writer, the command line and a progress line | The render loop |

The plans collide on purpose: plan-a and plan-b both rewrite the hit record, plan-a and plan-c both rewrite the render loop, and plan-a and plan-b both rewrite the scene.

### The seed and the runs

The seed repository holds the start state on `seed/` branches, which no run writes: the project before any plan ran, and the workspace root with the three plans scoped. The first three runs began from that state. The seed now also holds each plan's first phase detailed and audited, so a run can link the orchestrators at once. A finished run is recorded as `run<n>/main`, `run<n>/plan-a`, `run<n>/plan-b`, `run<n>/plan-c` and `run<n>/workflow`. From run002 on, the top-level sessions' transcripts are committed on the branch of the directory each ran in. run001 predates that convention and has none. The seed's `main` shows the latest run.

A run never sees an earlier run, so its agents cannot copy an earlier solution. `toy/run.py new` builds the run's workspace from the `seed/` branches only, removes the remotes after the fetch, and writes a configuration that denies file access outside the run folder. When the global OpenCode configuration already loads this repository's plugins, the run uses them as loaded; otherwise the configuration loads them and denies the globally loaded copies of the same plugins. A shell command that deliberately searches the home directory could still find the seed.

### Models and roles

Every role in every run, the orchestrators and the coordinator included, ran DeepSeek V4.1 Flash on the `low` variant. No person typed an answer in any run. A driving agent started the sessions through the service API and answered the orchestrators in run001 to run003, and run003's documentation hotfix was answered the same way. `toy/drive.py` exists to take the driving work off a person, leaving only the answers.

## Results

| Measure | run001 | run002 | run003 |
|---|---|---|---|
| Orchestrators | 2 plain chat sessions | 3 `/plan` | 3 `/plan`, autonomous mode |
| Hold pairs settled | 1, and a second armed | 1 | 3 |
| Releases merged into `main` | 0 | 3 | 3, then 1 documentation hotfix |
| Root rounds recorded | 16 | 96 | 134, then 1 |
| Tests on `main` at the end | 5 | 23 | 23 |
| Phases closed as `done` | 2 | 13 | 17 |
| Root README written by the README guide | No | Yes, without a logo | Yes, with a logo |

### run001: plumbing

Two plain chat sessions, not `/plan` orchestrators, ran in the plan-a and plan-b worktrees, linked through `/coordinator-link` and prompted once each to start their first implementer.

The coordinator saw on the second link that both active phases change the hit record, started a conflict investigator on its own, received `HOOK SET` with a precise reason and armed the pair. Both implementer starts were refused, both holds were marked reached, and the coordinator opened the channel. The leader settled the overlap, wrote the shared design, had resolution phases written for both plans and closed the channel. plan-b implemented its resolution phase and finished its first phase, and the coordinator then investigated the next overlap and armed a second pair.

The run found two defects. An idle orchestrator never noticed a hold armed while it waited, so its partner would have waited forever, and `hold_arm` now messages both orchestrators. A second overlap between the same two plans reused the pair id and would have overwritten the first shared design, and pair ids now include the held phases.

Because the sessions were plain chats, they improvised from the bootstrap and the tool messages, and the run proved nothing about the `/plan` procedure, the releases or the locks.

### run002: three orchestrators and three releases

Three `/plan` orchestrators, the coordinator and three `/release` sessions ran, one release per plan in its worktree. The coordinator armed one pair, plan-a's A1 against plan-b's B2, with plan-b leading because its B1 was already committed. The pair wrote one shared design, plan-b ran its resolution phase B2r and plan-a its A1r, and A1 became `not applicable`. The coordinator parked further overlaps while a plan was paired, and judged the plan-a and plan-c render-loop overlap to be merge work once both sides were committed.

The releases ran one at a time, plan-c, then plan-b, then plan-a, each resolving its conflicts by the shared design and the done contracts. `main` ended with 23 tests, clean lints and a render that shows all three plans' work. The last release's document writer rewrote the root README by the README guide, without a logo because its brief named none. That release merged plan-a first and rewrote the README on `main` afterwards, so the README described the merged product. The release workflow brings the integration branch into the plan's branch before the audit instead, and reaches the same result from the other side. Afterwards a separate logo session drew four candidates, the driving session picked one, and the README header received it. The coordinator was told `PLAN CLOSED` for the archived plan-c. A hand test in the same workspace proved the resource locks: a refused contender, the lock list, the reminder to the holder's parent and the hand-over.

The run found and fixed seven defects in the workflow:

- `HOLD ARMED` named neither the partner nor the reason, and one orchestrator guessed wrong. It now names the partner phase, the reason and the leader.
- An orchestrator that knew its phase was held skipped the start call, so the hold never counted as reached. `HOLD ARMED` and `/plan` now say to make the call.
- Both orchestrators asked to move a commit from one plan branch into the other. `/plan` now forbids moving commits between plan branches.
- The partner had no way to tell the waiting leader that its resolution phase was ready, which `channel_notify` now covers.
- A pair was armed on a phase whose implementer was already running. The feed now reports `IMPLEMENTER STARTED`, `hold_arm` refuses such a phase, and that side leads.
- `hold_release` woke neither orchestrator, and now tells both.
- An archived plan stayed linked, and is now unlinked at its worktree's next round or plugin load.

The lock test also found that a child was refused the lock its parent held, which would block an implementer deploying under its orchestrator's lock. A child now works under an ancestor's lock.

### run003: the full test

run003 is the full test: three plan orchestrators, three releases and one hotfix release that writes the program's documentation and README, all in autonomous mode. The orchestrators took the decisions inside their plans' scope themselves, the driving agent answered only where a decision had to be the user's, and every result was accepted as reported. The orchestrators started through `/plan` from the workspace root, each in a new session in its plan's worktree.

The coordinator armed and settled three pairs, all around plan-a's first phase, which touched every shared file:

| Pair | Overlap | Leader | Resolution phases |
|---|---|---|---|
| A1 and B1 | Both rewrite the hit record and its single construction site | plan-b | A1r, B1r |
| A1 and C3 | The render loop that C1 already rewrote, and the progress line in it | plan-c | A1r2, C3r |
| A1 and B2 | Both rewrite the scene, and B3's box test builds on A1's hit record | plan-a | A1r3, B2r |

Every pair followed the protocol: both sides reached their holds through the refused start call, the channel opened only then, the leader wrote the shared design, and the leader closed the channel after both resolution phases passed its check. The B1 resolution phase carried B1's whole scope, so B1 became `not applicable`. A hand test of the resource locks ran in the root again.

The three releases merged in the order plan-c, plan-b, plan-a. The first two kept their plans open and handed the shared documentation items to plan-a's release, which merged last, resolved those items, and closed and archived all three plans. `main` ended with 20 unit tests and three command-line tests, and the final render shows the composed scene: a matte centre sphere, a glass sphere refracting a dull green triangle, a metal sphere and a grey ground plane.

The three plan releases did not write the root README, because no release brief asked for it and nothing in the release workflow requires a release to change the README. A documentation hotfix then ran on the run's recorded end state, started by `toy/drive.py` in the integration worktree. It wrote the root README by the README guide, six documentation pages and a render pipeline diagram, and named the new set in the workspace's documentation slots. It had four logo candidates drawn and chose one itself, recording the reason. It went straight to writing instead of proposing the page set first as its brief asked, and it put byte-level format detail on a technical page. Both were accepted as reported.

The driving session intervened twice in the plan rounds. An implementer of a documentation-only resolution phase ran a shell-check loop for over 20 minutes without a receipt, and its orchestrator was told to stop it with one narrow follow-up.

The second intervention exposed a gap in the `/plan` text. In the first pair, the leader assumed it wrote only its own resolution phase, and the partner's advancer started the other. The driving session then stated what the workflow means and `/plan` leaves implicit: the leader's `DETAIL RESOLUTION` advancer writes one file in each plan. The advancer's own instructions say so, and the leader's do not, so a leader can start with the wrong picture.

## Interpretation

The coordination protocol works with real orchestrators on a small model. Across run002 and run003, four hold pairs were armed at the right phases, both sides stopped where the protocol says, the channels opened only after both stops, and every pair ended in one shared design and a resolution phase per plan. Every release merged with its conflicts settled by the shared designs, and no plan branch ever received another plan's commits.

The defects the runs found were in the workflow's messages and edge rules, not in the protocol's shape. Each one, from a hold that never woke an idle orchestrator to a child refused its parent's lock, was fixed and did not recur in a later run.

The releases do only what their briefs and the release workflow ask. run003's three releases left the README untouched until a separate hotfix was briefed to write it, so a test run needs a step that owns the documentation, and the driver now ends every run with that hotfix.

## Limits

- One run per configuration. Each result is one observation with one model, and a different model or a different seed may behave differently.
- The user's role was played. In every run an agent answered the orchestrators, run003's hotfix included, and accepted their results, so no human judged the product decisions or the acceptances.
- The driving session intervened twice in run003's plan rounds, so run003 does not show a long phase run or the resolution step without help.
- run001 has no transcripts, so its account rests on the run record rather than on session evidence.
- The toy project is small. Three plans in about 1,000 lines of Rust meet in a few files, and a larger project may produce overlaps that touched-files blocks and investigators judge less reliably.
- The documentation hotfix ran later, on run003's recorded end state, not in the same sitting as the plan rounds.
- Costs are recorded per session in the transcripts from run002 on, and this report totals none of them.

## Open questions

- A run driven end to end by `toy/drive.py`, with every answer given in the chats by a person, which would show the flow with no agent playing the user and no intervention.
- A run on a different model for the orchestrators, which would separate the workflow's robustness from DeepSeek V4.1 Flash's.
- A larger project, where overlaps hide in callers and contracts rather than in shared files.
- A `/plan` sentence stating that the leader's `DETAIL RESOLUTION` advancer writes both resolution phase files, which would keep a leader and a partner from each starting one.
- The cost and time of a full run, per role.
