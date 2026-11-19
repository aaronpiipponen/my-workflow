# AGENT-INSTRUCTIONS - how to edit this tree

A rule has one home. Put it where it belongs the first time: a misplaced rule misleads every
checkout. The files here are the source of truth for what agents receive, not a reading list: the
workflow plugin injects each role's sections into every request, delivers on-demand procedures as
skills whose content is the shared text, and owns the `/plan` and `/release` commands, which add
their orchestrator's files to the session. Every session also loads `AGENTS.md`. This file reaches
an agent as the `agent-instructions` skill, and the plugin holds edits to the instruction tree
outside `PLANS/`, `CURRENT-SCOPE.md` and `ORCHESTRATOR-HANDOFF.md` until that skill is loaded. Write
those files with the edit tool; the plugin refuses a shell command that writes them.

**After editing anything in this tree (shared or a `LOCAL/` slot), run `/workflow-reload` in the
session you are working in.** The plugin snapshots the injected text per session so a batch of
edits does not void the prompt cache on each save; the snapshot changes only when you run that
command. Until you do, the editing session keeps the old rules, and a fresh session is the only
other thing that reads the new ones. Make the reload the last step of the edit, after all the files
are saved.

This file is part of the workflow repository, linked into the checkout as
`AGENT-INSTRUCTIONS/README.md`. The tooling paths it names (`SETUP/`, `PLUGINS/`, `SKILLS/`,
`COMMANDS/`) live in that repository, at the directory the link resolves to, not in the checkout.

Two homes:

- **Shared** - a file in this workflow repository. It applies to any checkout that uses this workflow.
  It is a rule file, not a template; the workflow's own document templates are the separate
  exception. Never fill a rule file with one checkout's values.
- **The checkout's own** - a slot in that checkout's `AGENT-INSTRUCTIONS/LOCAL/`, or its
  `AGENT-INSTRUCTIONS/PUBLISHING/` for the export selection and public assets. It names that
  checkout's paths, commands, products, ports, models and prose. A `LOCAL/` slot's root template is
  under `SETUP/LOCAL.example/`; the publishing selection's example sits beside it in
  `AGENT-INSTRUCTIONS/PUBLISHING/selection.example.py`.

## Which file

| The rule | Goes to |
|---|---|
| applies to any checkout of this workflow | the shared file that owns that area |
| names a path, command, product, port, model, host or tool of one checkout | that checkout's `LOCAL/` slot |
| states a generic rule and cites the checkout's value | the generic sentence in the shared file, the value in `LOCAL/`, and the shared sentence names the `LOCAL/` file |
| is true of one checkout's process, documentation set or deployment | `LOCAL/` |
| exists in both places with different wording | stop and ask the user which one is authoritative |

Examples:
- "Run the fast gate before a commit" is shared; the commands are `LOCAL/gates.md`.
- "No hardcoded identifiers or thresholds" is shared; the product's invariants are
  `LOCAL/repo-rules-domain.md`.
- "Read the glossary before writing" is shared; the glossary path is
  `LOCAL/documentation-pages.md`.

## Where an edit goes

- **A workflow-owned file** (the shared payload under `AGENT-INSTRUCTIONS/`, plus `COMMANDS/`,
  `SKILLS/`, `PLUGINS/` and `SETUP/`, except the slot files in `SETUP/LOCAL.example/`; its README is
  a rule file, not a template) is edited here, through the checkout's symlink when the file is
  linked, so every checkout receives it. The change is generic and repo-agnostic: no checkout's
  product, paths, values or names. Generic is not neutral for other users: this user's policy,
  model choices and personal conventions belong in shared text, and a feature other users do not
  get is not a defect. Workflow-owned rule files are authoritative and are not
  templates; the workflow's own document templates, such as `PLANNING/phase-template.md`, are copied
  and filled by the process, not by a checkout.
- **A checkout-specific file's structure** (sections, fields, required keys or shape) is edited in
  the checkout. A checkout may adapt its copy to its own workflow, so mirror a structural change to
  its root template under `SETUP/LOCAL.example/` only when the change applies generally; a
  checkout-specific section or name stays in the checkout. The publishing selection is the
  exception: its example is `AGENT-INSTRUCTIONS/PUBLISHING/selection.example.py`.
- **A checkout-specific file's content** inside its existing structure (values, paths, commands,
  product facts) is edited only in the checkout's copy. The root template stays the unfilled form.

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
  `PLUGINS/workflow/bindings.default.json`: `agents` for an agent (`build` is the main chat agent),
  `roles` for a workflow command's session. That file is the only map. A rule that must apply is
  injected; one that relies on the model opening a file is not delivered.
- A procedure that only some work needs is a skill: `SKILLS/<id>/SKILL.md` holds its front matter,
  with `source` naming the shared file, and a short guidance paragraph. The plugin registers the
  skill with that file's text as its content, so the skill never copies the rule.
- A workflow command is `COMMANDS/<name>.md`; the plugin registers it and marks the session's role
  `<name>`. Its body holds the orchestration rules only, never a list of files to read.
- A tool earns its place only where it beats prose, and a script where a tool would only wrap one
  shell command.
- Keep the shared text free of paths the setup does not guarantee. The guaranteed set is
  `AGENT-INSTRUCTIONS/` with its payload directories, `PLANS/`, `CURRENT-SCOPE.md`,
  `ORCHESTRATOR-HANDOFF.md`, `AGENTS.md` and `.opencode/`. Anything else belongs either to the
  checkout or to the workflow tooling, and a shared sentence names the checkout's `LOCAL/` slot
  instead of a checkout path.
- Produced or consumed by the tooling? A new shared file that a checkout must receive is also added
  to `SETUP/setup-repo.py`, or it reaches no checkout.

## Adding a checkout-specific rule

- Put it in the right slot under `AGENT-INSTRUCTIONS/LOCAL/`. Edit the checkout's copy. A
  structural change that applies generally also changes the root template under
  `SETUP/LOCAL.example/` in the same change; a checkout-specific structure or a content change
  stays in the checkout.
- `workflow.toml` and `models.json` always stay. The generator requires both, so neither is deleted
  even though the delivery map does not name them.
- A new slot is added in three places: the file in `SETUP/LOCAL.example/`, the slot table in
  `SETUP/LOCAL.example/README.md`, and a binding if an agent must receive it.
- Never copy a shared rule into `LOCAL/`. Never leave a generic rule only in `LOCAL/`.

## Ask first

Stop and ask the user which file to edit when you cannot tell:

- whether a rule is generic or belongs to one checkout;
- whether it belongs in a role body, a shared document, or `LOCAL/`;
- whether an edit is a workflow-owned change, a checkout file's structural change, or only its
  content, when more than one case seems to fit;
- whether a rule that appears in both places should be removed from one of them;
- whether a new file is shared or checkout-specific.

Do not guess, and do not write the same rule in both places "to be safe". A duplicated rule is the
failure this tree exists to prevent.

## Before you finish

Edit prose by reading and rewriting it with the edit tool; a script or blind replacement mangles it. Verify nothing was
lost, then run `/workflow-reload` so this session uses the saved edits, and run both checks.

```sh
# from this workflow repository
python SETUP/setup-repo.py --check <checkout>
# from the checkout
cd <checkout> && python AGENT-INSTRUCTIONS/SUBAGENTS/gen_agents.py --check
```

Both must pass. When a new file or section changes what an agent receives, update
`PLUGINS/workflow/bindings.default.json` in the same change; the README's delivery section does not
repeat that map.
