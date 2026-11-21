# my-workflow

Agent instructions drift when each checkout carries its own copy, and a change in one checkout
leaves the others out of step. This kit holds one instruction set and delivers it into every
checkout by links and injection, so every project follows the same rules and a fix reaches all of
them at once. Each checkout's own values live in its `AGENT-INSTRUCTIONS/LOCAL/` slots.

## How it operates

The payload is a reusable agent workflow for OpenCode: shared instructions, subagents, plans, skills
and plugins. A session runs in a checkout that links this repository. `AGENTS.md` at the checkout
root holds the bootstrap, and `PLUGINS/workflow/bindings.default.json` maps every text to the roles
that receive it, with no second copy. A binding may select `sections` by number (`"3a"`) or by
title (`"Code documentation"`), so a comment writer receives the code-documentation sections and
not the page or capture rules. The workflow plugin reads that map on each request, injects only
what the active role needs, and pairs it with the checkout's own `AGENT-INSTRUCTIONS/LOCAL/` slots.

### The three orchestrators

Each orchestrator runs as a long-lived session in the chat and owns decisions the subagents never
make.

- Plan orchestrator, started with `/plan`: owns product intent, `full-plan.md` scoping, phase
  sequencing and serial handoffs. It reads the requirements and the product documentation itself,
  routes open-ended scouting to `ops-scout`, and delegates detailing, implementation and review.
- Release orchestrator, started with `/release`: takes finished private work through export,
  documentation audit and fixes, deployment, and the report for the public commit and push. It
  uses read-only scouts and writers, and calls `phase-implementer` only on the user's word.
- Shadow orchestrator, started with `/shadow-register`: binds a second session above an
  interactive working session, so the plan holds through a stream of small interface decisions.
  `/shadow-register-manual` starts it with a typed message, `/shadow-wake` sends it a message, and
  `/shadow-wake-manual` wakes it with a typed message.

### The subagents they run

Every child receives only its own injected rules, and every caller owns the final judgment.

- Phase roles: `phase-advancer` details the active phase, audits completed work and advances the
  status table. `phase-implementer` implements exactly one detailed phase and returns a
  verification receipt.
- Read-only reviewers: `phase-spec-auditor` checks a phase document before work,
  `invariant-reviewer` checks a diff against the repository rules, and
  `phase-implementation-reviewer` audits one phase's implementation. None edits.
- Scouts: `seam-scout` maps a code area to files, callers and tests. `ops-scout` investigates live
  state over a read-only shell.
- Writers: `document-writer` writes documentation pages and diagrams and recaptures screenshots.
  `comment-writer` edits code comments and test names. `report-writer` writes experiment reports
  and charts.

### Skills

`SKILLS/` holds seven procedure skills: `agent-instructions`, `debugging`, `documentation-style`,
`documentation-workflow`, `plan-authoring`, `plan-detailing` and `plan-remediation`. Each
`SKILL.md` holds the trigger, a short guidance paragraph and a `source` naming the governing shared
file. The workflow plugin registers the skill with that file's text as its content, so loading the
skill delivers the procedure itself and the procedure keeps one authoritative home.

### Plugins

`PLUGINS/` supplies the runtime around the orchestrators. `PLUGINS/workflow/` is the role-context
hook: it reads the bindings map on each request and injects each agent's sections, plus the role's
files in a session started with `/plan` or `/release`, which it registers from `COMMANDS/`. It
registers the skills with their shared text and the `phase_new` tool, holds edits to the
instruction tree until the `agent-instructions` skill is loaded, and refuses shell writes to it.
After editing instruction files, run `/workflow-reload` in the working session to apply them. `PLUGINS/subagent-foreground/` adds `subagent_foreground`, which blocks until a
child reports so the caller can use the answer in the same turn. `PLUGINS/opencode-keepalive/`
warms the prompt cache of the orchestration models the checkout selects. `PLUGINS/config-reload/`
makes config, agent and mode file changes take effect in a running service without a restart. The
shadow orchestrator plugin belongs to the orchestrators above.

### Plans

A plan is a folder under `AGENT-INSTRUCTIONS/PLANS/<slug>/`, not one file. `full-plan.md` holds the
scope, the design rules and the phase status table, and marks exactly one phase `active`. When a
phase opens, `phases/<id>.md` carries its implementation-grade detail. When it completes,
`done/<id>.md` holds its frozen contract and the status table flips to `done`. `benchmarks/` holds
dated experiment records, and `docs-pass.md` carries the items deferred to the release. A failed
retest re-details the same phase in place instead of starting another.

## What is here

```text
AGENT-INSTRUCTIONS/            everything a checkout receives
  AGENTS.md                    the bootstrap, linked to the checkout root
  BUILDING/ PLANNING/ PLANS/   shared text, linked into the checkout
  SUBAGENTS/                   canonical roles, generator, partials
  PUBLISHING/                  the exporter, the checkout's selection and its public assets
COMMANDS/                      plan and release prompts, registered by the workflow plugin, run in
                               the chat as commands, not agents
SETUP/
  setup-repo.py                link a checkout, create its local slots
  LOCAL.example/               every slot a checkout owns, including its models
PLUGINS/workflow/              role-context hook, commands, skills, edit guards, phase_new tool,
                               bindings matrix
PLUGINS/subagent-foreground/   the subagent tool that waits for the child's report
PLUGINS/config-reload/         live reload of config, agent and mode files
PLUGINS/shadow-orchestrator/   submodule
PLUGINS/opencode-keepalive/    submodule
SKILLS/                        procedure skills (front matter naming the shared text, never copies)
```

`AGENT-INSTRUCTIONS/` is the payload, and `AGENTS.md` lands at the checkout root. `LOCAL/` is the
checkout's own and is created from `SETUP/LOCAL.example/`.

## On another machine

```sh
git clone --recurse-submodules <url> my-workflow
cd my-workflow
python SETUP/setup-machine.py
```

That checks the two imported plugins out, copies each plugin's example configuration to its real
`config.json` where one is missing, creates `PLUGINS/workflow/bindings.json` (the machine's list of
governed checkouts), and adds the five local plugin entries to
`~/.config/opencode/opencode.json`, backing that file up first. It leaves a configured entry and a
local configuration untouched, so it is safe to run again after a `git pull`. It aborts rather
than edit a config file that is not plain JSON.

`--check` reports what is missing without writing anything.

Then restart the service once (`opencode service restart`) and set up each checkout that should use
the workflow.

## Setting up a checkout

```sh
python SETUP/setup-repo.py /path/to/checkout
python SETUP/setup-repo.py --check /path/to/checkout
```

It symlinks `BUILDING/`, `PLANNING/`, `SUBAGENTS/`, `PUBLISHING/export.py`, `PLANS/README.md`, `AGENT-INSTRUCTIONS/README.md` and `AGENTS.md`. It creates `CURRENT-SCOPE.md`,
`ORCHESTRATOR-HANDOFF.md`, every slot in `SETUP/LOCAL.example/`, and `.opencode/opencode.json` when
the checkout has none. It registers the checkout with the plugin, then stamps the agents. An item
that is already present is reported and left alone, and only a wrong or missing link fails the run.
The plugin re-reads its bindings on every request, so a checkout registered while the service runs
needs no restart.

Writing through a symlink edits the workflow repository itself, so a workflow fix lands in every
checkout at once. In a governed checkout the plugin refuses a shell command that names an
instruction file and writes it: a redirection or `tee` into it, `sed -i`, `perl -i`, `mv`, `cp`,
`rm` and similar, or a script that opens it for writing. A shell writer can rename over the link,
leaving a regular file behind and detaching the checkout while the text looks right, and it skips
the edit tool's check for the `agent-instructions` skill.

The restriction covers the instruction tree outside `PLANS/`, `CURRENT-SCOPE.md` and
`ORCHESTRATOR-HANDOFF.md`, plus `AGENTS.md`. The agents use in-place editors in product code. Use
the edit tool for instruction files, and it writes through the link.

Two things slip past a command-text rule: the tool's own `workdir` reaching shared text without
naming it, and any writer you run yourself. `--check` is the backstop for both. It fails on a link
that a regular file stands in for, a link whose workflow source is gone, an ignore entry the clone
needs, and a LOCAL slot identical to its template. It does not fail on normal local customisation: a
check that fires there gets ignored, and then it protects nothing.

`AGENT-INSTRUCTIONS/LOCAL/` is the checkout's own: permission capabilities, gate and tool commands,
the documentation specifics, per-role prose extensions, and any role it adds under `roles/`.
`AGENT-INSTRUCTIONS/PUBLISHING/` is the checkout's too, except `export.py`, which is a link: the
selection and the public assets live beside it.

## Checks

```sh
python SETUP/setup-repo.py --check <checkout>
cd <checkout> && python AGENT-INSTRUCTIONS/SUBAGENTS/gen_agents.py --check
node PLUGINS/workflow/test/workflow.test.mjs
node PLUGINS/subagent-foreground/test/foreground.test.mjs
```

The first two checks run against a checkout that links this repository. The payload's `AGENTS.md`
lives under `AGENT-INSTRUCTIONS/`, not at this repository's root: it describes a consuming
checkout, so it is not loaded while working here.

## Cloning and updating the plugins

```sh
git clone --recurse-submodules <url>     # fresh clone
git submodule update --init              # a clone that is already checked out

git submodule update --remote --merge    # move both pins to their origin's tip
```

Each submodule pins one commit, so a clone is reproducible and `--remote` is the explicit update.
The plugin checkouts carry no `config.json`, `state.json` or logs. Those are gitignored in each
origin, and the machine that runs them holds them. The global `opencode.json` holds its absolute
`options.config` paths, so the live configs are not part of this repository.

## License

MIT
