# Workspace and sessions

A workspace holds the shared instructions, one Git worktree per plan and the plan folders, and a session runs at most one workflow role.

## How the instructions reach a session

The workflow repository owns every rule an agent follows. A workspace does not copy those rules. `setup/setup-workspace.py` links the instruction tree into the workspace root, stamps one agent file per role into the root's `.opencode/agents/`, and registers the workspace with the workflow plugin. The machine setup registers the plugins themselves in the global OpenCode configuration, once per machine.

On every request, the workflow plugin reads the bindings map, picks the files and sections the session's agent and role receive, and adds them to the session's system prompt together with the workspace's own `LOCAL/` slots. A fix to a shared rule therefore reaches every workspace at once, and each workspace keeps its own values, such as its gate commands, its models and its documentation set, in its `LOCAL/` slots.

![The workflow repository links its instruction tree into the workspace, stamps the agent role files and registers its plugins in the global configuration. The workflow plugin reads the linked text and the workspace's local slots, and the OpenCode service runs the role sessions with that context.](/docs/assets/diagrams/workflow-architecture.svg)

The plugin builds a session's injected text once and reuses it byte for byte, so the model's read cache holds for the whole session. An instruction edit reaches a running session only through `/workflow-reload`, which rebuilds that one session's text at the cost of one uncached request.

## The workspace layout

```text
<workspace>/
  AGENT-INSTRUCTIONS/        shared text (links), LOCAL/ and PLANS/
  AGENTS.md                  link to the shared bootstrap
  .opencode/                 OpenCode config, stamped agents and coordinator state
  project.git/               bare project repository
  main/                      worktree on the integration branch, used by the release
  <plan>/                    one worktree per plan, on a branch named after the plan
```

`project.git` is a bare repository, and each worktree checks out one branch. A plan's name is also its branch and its worktree folder. The integration branch is named in `AGENT-INSTRUCTIONS/LOCAL/workspace.json` and has its own worktree, where every release merges.

Every worktree links `AGENTS.md` and `AGENT-INSTRUCTIONS` back to the root. The links are listed in the project repository's `info/exclude`, so they never enter the project history, and every instruction path resolves the same way from every worktree.

The root is a Git repository of its own that tracks the instruction tree minus its links. The workflow plugin commits it after every finished session round, so the plans keep their full history without anyone committing them, and a plan file never conflicts between branches because it never lives on one.

## Roles and sessions

The user works with orchestrators: long-lived sessions that own one job each and delegate the detail work to subagents.

| Role | Started with | Owns |
|---|---|---|
| Plan orchestrator | `/plan <name>` | One plan: its scope, its phase sequence and its handoff |
| Release orchestrator | `/release <name>` | One plan's release: the review, the merge into the integration branch and the plan's closure |
| Hotfix release | `/release` in the integration worktree | A release with no plan, such as a documentation pass |
| Coordinator | the first `/coordinator-link` | The overlaps between linked plans, in the workspace root |
| Shadow orchestrator | `/shadow-register` | A second session above an interactive working session |

`/shadow-plan` creates a shadow plan for interactive work: a plan whose starting files come filled from `PLANNING/plan-templates/shadow/`, with one cleanup phase S1 `active` and the workspace's own `LOCAL/shadow-scope.md` added to its `scope.md`. It opens a working session in the new worktree, where the user types `/shadow-register`. The shadow keeps S1 ready; the plan then runs S1 through `/plan`, and S1's review rounds stand in for the closing survey.

A session the workflow opens for a role runs on the model the `sessions` table of `LOCAL/models.json` names for it: `plan`, `release` (a hotfix included), `shadow`, or `coordinator`, which is the one session that also needs an agent persona. `agents` holds the stamped subagents. A command typed in a plan's worktree runs in that chat on its own model.

A session runs one role. `/plan` and `/release` refuse the coordinator, a shadow orchestrator's session (marked `shadowOrchestrator` by its plugin), a session that already runs a role, and any directory that is neither the workspace root, the integration worktree nor a plan's worktree. Typed in a plan's worktree, the command runs in that session. Typed in the workspace root, it opens a new session in the plan's worktree, and the chat it was typed in keeps its own role and directory. Without a plan name, it offers the workspace's plans to pick from. The integration worktree behaves the same for `/plan`, but `/release` there always starts a hotfix in that worktree, whatever the argument. `/plan-new` asks for a name and creates the plan's branch, worktree and starting plan files.

The role is stored on the session's metadata as `workflowRole`, so the coordinator plugin can tell a plan orchestrator from a release.

## Plans and phases

A plan's working state lives in `AGENT-INSTRUCTIONS/PLANS/<plan>/` in the root:

- `full-plan.md` holds the scope, the design rules and the phase status table, with exactly one phase `active`.
- `phases/<id>-<title>.md` holds the implementation-grade document of an open phase, and `done/<id>-<title>.md` its frozen contract once it completes.
- `scope.md` holds the authorized unit and the plan's boundaries, and `handoff.md` the orchestrator's next action, current state and learned rules.
- `docs-pass.md` holds the documentation items deferred to the release, `findings/` dated experiment, run, survey and scout records, and `autonomous-decisions.md` each decision the orchestrator took in autonomous mode.

`PLANS/archive/` holds closed plans, and `PLANS/shared/` the designs that hold pairs agreed on.

### The phase cycle

One phase moves through three roles. The orchestrator owns the plan and decides what comes next. The phase detailer, the `phase-advancer` agent, details the active phase into its document and later audits the finished work. A `phase-implementer` builds and verifies exactly that one phase and returns a receipt. Read-only scouts and reviewers support the cycle, and the writers serve the release.

![The orchestrator opens or audits a phase with the phase detailer, the detailer hands the phase document to the implementer, and the implementer returns a receipt to the orchestrator. The detailer delegates to read-only scouts and the spec audit, the implementer drives one reviewer pass, and work that needs writing leaves the cycle for the release, whose orchestrator briefs the writers.](/docs/assets/diagrams/workflow-phase-cycle.svg)

### Phase ids

The status table is the single source of truth for a plan's phases, and a phase id never changes once assigned. A split phase takes `<id>.<n>` at any depth, a resolution phase takes `<id>r`, a dropped phase keeps its id with the status `not applicable`, and a retitled phase keeps its id. Holds and the coordinator name phases by these ids.

In a plan orchestrator's session, every implementer starts through `phase_subagent`, which takes only the phase id. The tool checks the workspace's holds and refuses a held phase, refuses a phase that is not `active`, then creates the implementer session with the phase id on its metadata and writes the prompt itself. A plain subagent start of a new implementer in a plan is refused, so the recorded phase is always the phase being implemented. A release session may start a plain implementer for its closed plan on the user's word.

## Documentation guides

Four shared guides govern every piece of documentation a workspace writes. The documentation style guide sets the wording and the page, diagram and comment rules, and the documentation workflow sets how pages, diagrams and screenshots are planned, written and checked. The README guide fixes the root README's centred header with its logo, one-sentence summary and badges, its contents list and its sections in order. The release workflow runs one visual pass over every visual a release changed or found stale.

A product's logo is explored by the logo guide: four hand-written SVG candidates from four different themes, one of them daring, from which the user chooses. The chosen one becomes `docs/brand/logo.svg` and the README's header shows it.

`AGENT-INSTRUCTIONS/TOOLS/render-svg` renders an SVG to a PNG with a headless Chromium, so a writer opens and inspects every diagram and logo candidate before it passes. Each workspace names it in its `LOCAL/docs-tools.md`.

## The parallel workspace

Several plan orchestrators run side by side, one per worktree, and the user works with each of them as with a single plan. Each orchestrator can be linked with `/coordinator-link`, which starts the coordinator in the workspace root. The coordinator runs behind the linked orchestrators: it reads a feed of their rounds, and when two plans would collide it holds both before the overlapping phases and lets their orchestrators settle the overlap. The user can talk to the coordinator, but the daily work happens in the orchestrators' chats. [Coordination](/docs/technical/coordination.md) describes it.

![The user works with the plan orchestrators, one per plan, each in its own worktree. The coordinator runs behind them, receives a feed from every orchestrator and sends holds back, and the user can also talk to it. The orchestrators write the plan folders and commit to their own branches, and a release merges a plan branch in the main worktree.](/docs/assets/diagrams/parallel-workspace.svg)

No plan branch is ever merged, rebased or cherry-picked onto another. Each plan reaches the integration branch through its own release, as [Release and hotfix](/docs/technical/release.md) describes.
