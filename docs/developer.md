# Developer guide

This page describes how the plugins, the bindings map and the state files are built, where to change a behaviour, and how the tests cover it.

## The plugins

The repository ships four plugins under `plugins/`, and two more are submodules.

| Plugin | Entry | Responsibility |
|---|---|---|
| `workflow` | `plugins/workflow/index.js` | Injects role context, registers commands, skills and `phase_new`, guards instruction edits, commits the workspace root |
| `coordinator` | `plugins/coordinator/index.js` | Links orchestrators, builds the feed, holds pairs, runs the channel and the locks, registers `phase_subagent` |
| `subagent-foreground` | `plugins/subagent-foreground/index.js` | Adds `subagent_foreground`, which waits for a child's report |
| `config-reload` | `plugins/config-reload/index.js` | Applies configuration, agent and mode file changes in a running service |
| `opencode-keepalive` | submodule | Warms the prompt cache of selected models |
| `shadow-orchestrator` | submodule | The shadow session workflow |

### workflow

`setup` in `plugins/workflow/index.js` registers a `context` session hook that resolves the session's directory, reads the bindings and appends each role's text to the system prompt, and a `permission` evaluate hook that holds an instruction edit until the `agent-instructions` skill is loaded. A command transform registers `/plan` and `/release` from `commands/` and adds `/workflow-reload` itself, and a skill transform registers every `skills/<id>/SKILL.md` with the text of the shared file its `source` names. An event subscription commits the workspace root after every finished session round.

The command routing lives in `commandTarget` and `startSession`: a command in a plan's worktree runs in its session, and one in the root or the integration worktree creates a new session in the target worktree with the source session's agent and model, then records the role with `setRole`. `renderCommand` places a command's arguments at `$ARGUMENTS`, or appends them when the body names no place.

`plugins/workflow/workspace.js` reads `workspace.json` and the `sessions` models of `models.json`, lists the plans and creates a plan's branch, worktree and starting files for `/plan-new` and `/shadow-plan`. `plugins/workflow/rpc.js` and `plugins/workflow/tui.js` hold the terminal side: the `/plan-new` and `/shadow-plan` dialogs, the plan picker and the move to a new session. The exported helpers, among them `splitSections`, `selectSections`, `entriesFor`, `planOf`, `branchOf`, `rootOf` and `commitRoot`, are what the test suite calls directly.

### coordinator

| File | Responsibility |
|---|---|
| `index.js` | The link command, the tools, the event feed and the RPC methods |
| `feed.js` | The link snapshot, the plan diff, the touched-files blocks and the report summaries |
| `holds.js` | Reading, validating and writing the hold pairs and their channel state |
| `locks.js` | Reading and writing the resource locks and their queues |
| `plans.js` | Reading a plan folder and its status table |
| `state.js` | Reading and writing the coordinator's JSON state files |
| `inbox.js` | Reading and writing one plan's pending feed |
| `rpc.js`, `tui.js` | The `/orchestrators` dialog and opening a new coordinator |

The server plugin registers `coordinator-link`, the tools `hold_arm`, `hold_release`, `channel_open`, `channel_send`, `channel_notify`, `channel_close`, `lock_take`, `lock_request`, `lock_release` and `lock_list`, and subscribes to `session.created`, `session.text.ended`, `session.compaction.ended` and the three round-end events. Its `execute.before` hook refuses a plain subagent start of a new implementer in a plan, and refuses a shell command whose pattern a workspace lock guards until the session or an ancestor holds that lock. `phase_subagent` is registered only in a plan's worktree.

### subagent-foreground and config-reload

`subagent_foreground` resolves the child agent, asks the permission service for the subagent action, creates or continues the child session, sends the prompt and waits for the child to go idle. It returns the child's final text and session id, or throws the child's own error. Its exports `lastRound`, `assistantText`, `errorText`, `resolveAgent` and `assertSubagentAllowed` are shared with the coordinator's channel.

`config-reload` watches the global configuration and the agent and mode directories, debounces a change for 500 ms, and reloads the provider, model and agent services of every live location. It closes a previous build's watchers before creating its own.

## The bindings map

`plugins/workflow/bindings.default.json` decides which shared text reaches each agent and each workflow role. `plugins/workflow/bindings.json` is the machine's own file: it lists the governed workspaces and may extend the default map. The plugin reads both on each request, so a workspace registered while the service runs takes effect on its next request.

An entry names a file and optionally its sections:

```json
{
  "file": "AGENT-INSTRUCTIONS/BUILDING/REPO-RULES.md",
  "sections": ["0", "0a", "3a", "4"]
}
```

A section is selected by its number, such as `"3a"`, or by its heading title, such as `"Code documentation"`. `selectSections` returns the preamble plus the requested sections in the order asked for, and an unknown section fails loudly. A missing file fails the request unless the entry is `optional`. A path containing `{plan}` resolves to the session's plan, which `planOf` reads from the worktree's branch, and a session whose branch has no plan folder, such as a release in the integration worktree, skips those entries.

`entriesFor` returns the `*` entries first, then the agent's entries, then the role's entries when the session runs `/plan` or `/release`. Each injected part is marked with `<!-- role-context: <path> -->`.

The injected parts of a session are built once and reused byte for byte, so the model's read cache holds. `/workflow-reload` drops one session's snapshot and reloads the skill registry. The snapshots live in process state and survive a plugin reload when their shape validates.

The edit guard holds an edit under `AGENT-INSTRUCTIONS/` outside `PLANS/`, or to `AGENTS.md`, until the session has loaded the `agent-instructions` skill, and refuses a shell command that names an instruction file and writes it. `setup/setup-workspace.py --check` catches what the guard cannot see, such as a link a regular file replaced.

To add a rule, put a generic rule in the shared file that owns its area and a workspace value in that workspace's `LOCAL/` slot. A procedure only some work needs becomes a skill whose `source` names the shared file. A rule that must reach a role it does not reach needs a change in `bindings.default.json`, and a file every workspace must receive also goes into `setup/setup-workspace.py`.

### Reloads

Anything that rebuilds the injection snapshots changes the system prompt of every affected session at once, and each of those sessions then pays a full uncached request. One rebuild across many running sessions can use most of a usage window. These actions therefore need the user's explicit go-ahead every time:

- editing a plugin that running sessions load, where it builds, keys or caches injected text, because OpenCode watches a loaded local plugin's files and reloads the plugin when one changes.
- reloading a location or the plugins through the API.
- running `/workflow-reload`.

A reload must not misread state either. The workflow and config-reload plugins validate every field of the process state they find and replace a state of a different shape, and config-reload closes a previous build's watchers before creating its own.

## State files

The workspace root is a Git repository that tracks `AGENT-INSTRUCTIONS/` minus its links, plus its own `.gitignore`. `commitRoot` commits it after every finished session round with the message `Record a round of <session title>`, and a round that changed nothing makes no commit.

The coordinator's state lives under `<workspace root>/.opencode/coordinator/`, which the root repository does not track. `plugins/coordinator/state.js` writes every file whole through a `<file>.tmp` sibling and a rename, and the readers validate the shape and throw on a malformed file. A missing file yields the empty default.

| File | Shape |
|---|---|
| `links.json` | `{ coordinator, linked: { sessionID: plan } }`, one orchestrator session per plan |
| `holds.json` | `{ pairs: [{ pair, leading, reason, channel, sides: [{ plan, phase, reached }] }] }` |
| `locks.json` | `{ locks: [{ resource, holder, plan, reason, since, waiters }] }`, one record per resource; `waiters` holds `{ holder, plan, reason, since }` in queue order |
| `feed/<plan>.json` | `{ pending, children, lastText }`, the pending feed of one plan |
| `sent/<plan>/full-plan.md` | The last full plan sent to the coordinator, the base of the next diff |
| `sent/<plan>/blocks.json` | The touched-files blocks sent with it |

`AGENT-INSTRUCTIONS/LOCAL/workspace.json` holds the integration branch, the lockable resource names and the locked shell commands with their two comments. A missing file, an unknown locked resource, an empty comment or an invalid pattern fails the operation instead of guessing a default.

## OpenCode behaviour the plugins rely on

The plugins depend on these properties of OpenCode 2.4.1, each confirmed with test plugins and the toy runs:

| Property | What depends on it |
|---|---|
| A server plugin's `ctx.event.subscribe` receives events from every session on the shared service, in every directory | One coordinator plugin feeds the coordinator from every worktree |
| `session.created` carries `parentID`, `title`, `agent` and the session's `metadata`, and `session.create` accepts `metadata` | The feed maps each child to its orchestrator and reads the phase id `phase_subagent` recorded |
| `session.text.ended` carries the text of each finished assistant text block | The feed collects the orchestrators' messages and the children's reports |
| `session.execution.succeeded`, `failed` and `interrupted` mark the end of a round, and `session.idle` does not appear in the stream | The feed and the root commit run on the three execution events |
| `session.compaction.ended` names the compacted session | The compaction refresh |
| A child's finished round reaches its parent's inbox and wakes the parent, also for a child a plugin created with `session.create` | `phase_subagent` children report like built-in subagents |
| `ctx.tool.hook("execute.before")` sees every tool call with its whole input, and throwing from it refuses the call before the permission check | The refusal of a plain implementer start |
| `session.create` accepts `location.directory` | A command opens its own session in the target worktree while the chat it was typed in keeps its directory |
| The terminal plugin API offers `ui.dialog.select`, `ui.dialog.prompt` and `ui.dialog.confirm`, and RPC calls take a `location` that routes them to a session's project | `/plan-new`, the plan picker and `/orchestrators` work from a terminal opened in any folder |
| `opencode session list --format json` and `opencode session export <id>` read a project's sessions from the command line | The toy run's transcript export |
| A session created with a model reference keeps its `variant`, while the configuration's root `model` drops it | The toy driver passes the model with its variant on every session it creates |

## Tests

Three Node suites test the plugins against mock OpenCode contexts. Each needs Node.js 22 or later and Git, prints one line per check and exits non-zero on a failure.

```bash
npm test --prefix plugins/workflow
npm test --prefix plugins/coordinator
npm test --prefix plugins/subagent-foreground
```

`plugins/workflow/test/workflow.test.mjs` builds temporary workspaces and a workflow repository. It covers section selection, the `optional` and `{plan}` rules, the injection snapshot and `/workflow-reload`, the edit guard, the role files, `phase_new`, `/plan-new` and `/shadow-plan`, the session models, an emptied slot, the command routing with its picker, role refusals and hotfix target, and the root commit.

`plugins/coordinator/test/coordinator.test.mjs` builds a real workspace with three plans and their worktrees. It covers linking and the coordinator model, the feed and its flags, the implementer refusal and `phase_subagent`, the hold tools, the channel with its resolution-file guard, the locks with their parent rule, locked shell commands and queue transfer, the release of a lock whose holder is gone, the `/orchestrators` actions, a reload in the middle of a round, the compaction refresh, a malformed hold file and a closed plan.

`plugins/subagent-foreground/test/foreground.test.mjs` covers the registration, the child creation and wait, the permission check, a denied child, a failed child and continuing an open session.

`.github/workflows/ci.yml` runs the three suites on Node 22 and 24 for every push and pull request, without the submodules, which the suites do not need, and compiles `setup/setup-machine.py`, `setup/plugins.py`, `setup/setup-workspace.py`, `toy/run.py` and `toy/drive.py` with `python -m py_compile`.
