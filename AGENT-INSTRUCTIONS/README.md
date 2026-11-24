# AGENT-INSTRUCTIONS - how to edit this tree

A rule has one home. Put it where it belongs the first time: a misplaced rule misleads every
workspace. The files here are the source of truth for what agents receive, not a reading list: the
workflow plugin injects each role's sections into every request, delivers on-demand procedures as
skills whose content is the shared text, and owns the `/plan` and `/release` commands, which add
their orchestrator's files to the session. Every session also loads `AGENTS.md`. This file reaches
an agent as the `agent-instructions` skill, and the plugin holds edits to the instruction tree
outside `PLANS/` until that skill is loaded. Write those files with the edit tool; the plugin
refuses a shell command that writes them.

**After editing anything in this tree (shared or a `LOCAL/` slot), ask the user whether to run
`/workflow-reload` in the session you are working in, and never run it unasked.** The plugin
snapshots the injected text per session so the read cache holds; a reload rebuilds that session's
snapshot, which costs one full uncached request. Until it runs, the editing session keeps the old
rules, and a fresh session is the only other thing that reads the new ones. Ask once, after all the
files are saved.

This file is part of the workflow repository, linked into the workspace as
`AGENT-INSTRUCTIONS/README.md`. The tooling paths it names (`setup/`, `plugins/`, `skills/`,
`commands/`) live in that repository, at the directory the link resolves to, not in the workspace.

Two homes:

- **Shared** - a file in this workflow repository. It applies to any workspace that uses this workflow.
  It is a rule file, not a template; the workflow's own document templates are the separate
  exception. Never fill a rule file with one workspace's values.
- **The workspace's own** - a slot in that workspace's `AGENT-INSTRUCTIONS/LOCAL/`, or its
  `AGENT-INSTRUCTIONS/PUBLISHING/` for the export selection and public assets. It names that
  workspace's paths, commands, products, ports, models and prose. A `LOCAL/` slot's root template is
  under `setup/local.example/`; the publishing selection's example sits beside it in
  `AGENT-INSTRUCTIONS/PUBLISHING/selection.example.py`.

## Which file

| The rule | Goes to |
|---|---|
| applies to any workspace of this workflow | the shared file that owns that area |
| names a path, command, product, port, model, host or tool of one workspace | that workspace's `LOCAL/` slot |
| states a generic rule and cites the workspace's value | the generic sentence in the shared file, the value in `LOCAL/`, and the shared sentence names the `LOCAL/` file |
| is true of one workspace's process, documentation set or deployment | `LOCAL/` |
| exists in both places with different wording | stop and ask the user which one is authoritative |

Examples:
- "Run the fast gate before a commit" is shared; the commands are `LOCAL/gates.md`.
- "No hardcoded identifiers or thresholds" is shared; the product's invariants are
  `LOCAL/repo-rules-domain.md`.
- "Read the glossary before writing" is shared; the glossary path is
  `LOCAL/documentation-pages.md`.

## Where an edit goes

- **A workflow-owned file** (the shared payload under `AGENT-INSTRUCTIONS/`, plus `commands/`,
  `skills/`, `plugins/` and `setup/`, except the slot files in `setup/local.example/`; its README is
  a rule file, not a template) is edited here, through the workspace's symlink when the file is
  linked, so every workspace receives it. The change is generic and repo-agnostic: no workspace's
  product, paths, values or names. Generic is not neutral for other users: this user's policy,
  model choices and personal conventions belong in shared text, and a feature other users do not
  get is not a defect. Workflow-owned rule files are authoritative and are not
  templates; the workflow's own document templates, such as `PLANNING/phase-template.md`, are copied
  and filled by the process, not by a workspace.
- **A workspace-specific file's structure** (sections, fields, required keys or shape) is edited in
  the workspace. A workspace may adapt its copy to its own workflow, so mirror a structural change to
  its root template under `setup/local.example/` only when the change applies generally; a
  workspace-specific section or name stays in the workspace. The publishing selection is the
  exception: its example is `AGENT-INSTRUCTIONS/PUBLISHING/selection.example.py`.
- **A workspace-specific file's content** inside its existing structure (values, paths, commands,
  product facts) is edited only in the workspace's copy. The root template stays the unfilled form.

When a change could belong to more than one case, stop and ask the user instead of choosing.

Show the user the exact text of an instruction or workflow change and get approval before editing,
unless the user has already said to write the changes.

## Adding a generic rule

- Put it in the shared file that owns the area. Keep the existing heading and section numbering; do
  not renumber a section another document cites.
- Do not paste it into a role body. Role bodies are stamped and injected; a second copy drifts.
- If several roles need the identical block verbatim, make it a `SUBAGENTS/partials/` partial and
  leave a `<!-- partial: id -->` marker where it belongs in each source.
- If a role must receive a file or a section it does not receive yet, change
  `plugins/workflow/bindings.default.json`: `agents` for an agent (`build` is the main chat agent),
  `roles` for a workflow command's session. That file is the only map. A rule that must apply is
  injected; one that relies on the model opening a file is not delivered.
- A procedure that only some work needs is a skill: `skills/<id>/SKILL.md` holds its front matter,
  with `source` naming the shared file, and a short guidance paragraph. The plugin registers the
  skill with that file's text as its content, so the skill never copies the rule.
- A workflow command is `commands/<name>.md`; the plugin registers it and marks the session's role
  `<name>`. Its body holds the orchestration rules only, never a list of files to read.
- A tool earns its place only where it beats prose, and a script where a tool would only wrap one
  shell command.
- Keep the shared text free of paths the setup does not guarantee. The guaranteed set is
  `AGENT-INSTRUCTIONS/` with its payload directories, `PLANS/` with each plan's `scope.md` and
  `handoff.md`, `AGENTS.md` and `.opencode/`. Anything else belongs either to the workspace or to
  the workflow tooling, and a shared sentence names the workspace's `LOCAL/` slot instead of a
  project path.
- Produced or consumed by the tooling? A new shared file that a workspace must receive is also added
  to `setup/setup-workspace.py`, or it reaches no workspace.

## Adding a workspace-specific rule

- Put it in the right slot under `AGENT-INSTRUCTIONS/LOCAL/`. Edit the workspace's copy. A
  structural change that applies generally also changes the root template under
  `setup/local.example/` in the same change; a workspace-specific structure or a content change
  stays in the workspace.
- `workflow.toml` and `models.json` always stay. The generator requires both, so neither is deleted
  even though the delivery map does not name them.
- A new slot is added in three places: the file in `setup/local.example/`, the slot table in
  `setup/local.example/README.md`, and a binding if an agent must receive it.
- Never copy a shared rule into `LOCAL/`. Never leave a generic rule only in `LOCAL/`.

## Ask first

Stop and ask the user which file to edit when you cannot tell:

- whether a rule is generic or belongs to one workspace;
- whether it belongs in a role body, a shared document, or `LOCAL/`;
- whether an edit is a workflow-owned change, a workspace file's structural change, or only its
  content, when more than one case seems to fit;
- whether a rule that appears in both places should be removed from one of them;
- whether a new file is shared or workspace-specific.

Do not guess, and do not write the same rule in both places "to be safe". A duplicated rule is the
failure this tree exists to prevent.

## Keep the workflow repository in step

A change to a workflow-owned file also updates, in the same change, everything in the workflow
repository it makes stale:

- the root `README.md`, by `BUILDING/README-GUIDE.md`;
- the pages under `docs/`, by the documentation style guide;
- the diagrams and screenshots under `docs/assets/`, re-rendered and inspected, each screenshot
  retaken by its capture script;
- the plugin tests, so each plugin's suite covers the changed behavior and passes;
- the slot templates in `setup/local.example/` and the slot table in its `README.md`;
- the CI in `.github/workflows/ci.yml` when a suite, script or check is added or moved;
- the version in each changed plugin's `package.json` and the README's version badge, when the change
  is a release of the workflow.

The user makes every commit and push of the workflow repository.

## Before you finish

Edit prose by reading and rewriting it with the edit tool; a script or blind replacement mangles it. Verify nothing was
lost, run both checks, then ask the user whether to run `/workflow-reload`.

```sh
# from this workflow repository
python setup/setup-workspace.py --check <workspace>
# from the workspace root or any of its worktrees
cd <workspace> && python AGENT-INSTRUCTIONS/SUBAGENTS/gen_agents.py --check
```

Both must pass. A change to the workflow repository also passes the checks its CI runs: each changed
plugin's `npm test` and `python .github/scripts/check-links.py`. When a new file or section changes what an agent receives, update
`plugins/workflow/bindings.default.json` in the same change; the README's delivery section does not
repeat that map.
