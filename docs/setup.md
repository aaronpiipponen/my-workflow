# Setup

This page installs the workflow on a machine, sets up a workspace, and creates and records a test run of the toy project.

## Prerequisites

- Git with submodule support.
- Node.js 22 or later.
- Python 3 with its standard library.
- OpenCode 2.4.1 or later, able to start its background service.

## Set up the machine

1. Clone the repository with its submodules.

   ```bash
   git clone --recurse-submodules https://github.com/aaronpiipponen/my-workflow.git my-workflow
   cd my-workflow
   ```

   The clone holds `plugins/opencode-keepalive/` and `plugins/shadow-orchestrator/` checked out at their pinned commits.

2. Run the machine setup.

   ```bash
   python setup/setup-machine.py
   ```

   The script copies the example configuration of each plugin that ships one to its `config.json` where that file is missing, creates `plugins/workflow/bindings.json` from its example, and adds the six local plugin entries to `~/.config/opencode/opencode.json` after backing the file up. It never rewrites an existing entry or a local configuration file, so it is safe to run again after `git pull`, and it stops without writing when the global configuration is not plain JSON. The output lists every created file and added entry.

   `python setup/setup-machine.py --check` reports what is missing and writes nothing.

   When a plugin change breaks OpenCode, `python setup/plugins.py off` turns off every global plugin that loads from this repository by adding a `plugin.use` deny policy for each, and `python setup/plugins.py on` removes exactly those policies again. The plugin entries stay as they are, and the file is backed up before each write. `setup-machine.py --plugins off|on` runs the same switch.

3. Restart the service once so it loads the plugin list.

   ```bash
   opencode service restart
   ```

   `opencode api get /api/plugin` lists the loaded plugins, and a plugin that failed to load logs its error in the service log.

| Plugin | Configuration |
|---|---|
| Workflow | `plugins/workflow/bindings.json`: the governed workspaces and any extension of the default map |
| Keepalive | `plugins/opencode-keepalive/config.json`: the models to warm, the interval and the prompt limit |
| Shadow orchestrator | `plugins/shadow-orchestrator/config.json` |
| Foreground subagent, config reload | None |

The configuration files are machine state and are ignored by Git. `git submodule update --remote --merge` moves the two submodules to their origin's tip.

## Set up a workspace

1. Create the workspace root with a bare clone of the project and a worktree on its integration branch.

   ```bash
   mkdir -p /srv/example
   cd /srv/example
   git clone --bare https://example.org/project.git project.git
   git -C project.git worktree add ../main main
   ```

   The setup finds every worktree through `project.git`, so the integration branch must be a worktree of it, not a separate clone.

2. Run the workspace setup on the root.

   ```bash
   python /path/to/my-workflow/setup/setup-workspace.py /srv/example
   ```

   The script links the shared instruction tree and `AGENTS.md` into the root, creates every `LOCAL/` slot from `setup/local.example/` and the root's `.opencode/opencode.json` where they are missing, makes the root its own Git repository, links `AGENTS.md` and `AGENT-INSTRUCTIONS` into every worktree, registers the workspace with the workflow plugin and stamps the agents into `.opencode/agents/`. It prints one line per path with its action.

3. Fill the workspace's `LOCAL/` slots. `workspace.json` names the integration branch, the protected worktrees (whose files no writing role may edit, such as a deployed site checkout), the lockable resources and the shell commands each lock guards, and the other slots the project's sources, gates, documentation set and publication boundary. Each slot's template describes what it holds. Empty a slot the workspace does not use instead of deleting it: the setup recreates a missing slot, while an empty one injects nothing and passes `--check`.

4. Assign a model to every role in `AGENT-INSTRUCTIONS/LOCAL/models.json`, from a provider configured in OpenCode, then stamp the agents again from the workspace root so the roles take it. Its `sessions` table names the model of each session the tooling opens: the `/plan` and `/release` orchestrators it starts in a new session, the `/shadow-plan` working session, and the coordinator. Its `agents` table names every stamped subagent. A role that has no model in the table it belongs to fails with the missing entry.

   ```bash
   python AGENT-INSTRUCTIONS/SUBAGENTS/gen_agents.py
   ```

5. Open OpenCode in the workspace root and create the first plan with `/plan-new`. The command asks for a name, creates the plan's branch, worktree and starting plan files, and links the new worktree.

6. Start the plan with `/plan <name>`, and link it with `/coordinator-link` in its chat once its first phase is detailed.

Run the workspace setup again after adding a worktree by hand or updating the workflow. Existing links and slots are left alone. `--check` writes nothing and fails on a link a regular file replaced, a link whose source is gone, a missing required slot, an unregistered workspace, a slot identical to its template, a section of a `LOCAL/` slot that no role receives, a relative link in a slot that resolves to nothing, and generated agents older than their sources.

## Run a toy test

The toy project is a small Rust raytracer in a separate seed repository, and a test run plays the whole parallel workflow on it. [Toy runs](/docs/experiments/toy-runs.md) describes the runs and their results.

1. Copy the settings and fill every value.

   ```bash
   cp toy/toy.example.json toy/toy.json
   ```

   `toy/toy.json` names the seed repository, the runs directory, the public repository address used in the seed's run links, the plugin directories a run must deny when the global configuration loads the workflow from another checkout (an empty list when it loads this one), the project branches, the scratch directory a run may use and the model every driven session starts on, as `provider/model#variant`. Git ignores it.

2. Create the next run.

   ```bash
   python toy/run.py new
   ```

   The result is a run folder with the workspace root cloned from the seed's `seed/workflow`, a bare project repository with one worktree per project branch, and a configuration that denies file access outside the run and loads this repository's plugins unless the global configuration already loads them.

3. Start the driver with the run number it printed, and leave it running.

   ```bash
   python toy/drive.py 4
   ```

   The driver starts one `/plan` session per plan with autonomous mode enabled, links each to the coordinator, waits for each plan to finish, starts the three releases one at a time in the order plan-c, plan-b, plan-a, and finally starts the documentation hotfix in the integration worktree. It prints each session it starts.

4. Open the sessions in OpenCode with the session list (Ctrl+O) and answer the orchestrators' questions in their chats. The driver does everything else.

5. When the hotfix has reported, record the run.

   ```bash
   python toy/run.py end 4
   ```

   The seed then records the run as `run004/*`, rebuilds its `main` from the run's `main`, and the run folder is deleted. Nothing is pushed. `python toy/run.py discard 4` deletes a run that was only a test without recording it.

`python toy/drive.py 4 hotfix` starts only the hotfix. A stopped driver continues where it left off when it runs again, because it records its sessions in the run's `.opencode/toy-drive.json`.
