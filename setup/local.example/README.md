# Local slots

`setup/setup-workspace.py` copies every file here into `AGENT-INSTRUCTIONS/LOCAL/` in a workspace
root, where it becomes the workspace's own, and never overwrites one afterwards. Every slot except this file,
`workflow.toml`, `models.json`, `workspace.json`, `ui-reference.md` and `shadow-scope.md` reaches agents by injection, `publish.md` into the
`/release` session; agents read `ui-reference.md` through the `ui-building` skill, and `/shadow-plan` copies
`shadow-scope.md` into a new shadow plan's `scope.md`. `project.md` is injected to every agent and is silent while
empty; `workflow.toml`, `models.json` and `workspace.json` are read by the tooling.

The files are the root templates for the workspace's own files. A workspace fills its copies; this
directory holds the unfilled structural form. `<...>` marks a fact only the workspace can supply.
Fill every marker and replace each example with the workspace's own. Empty a slot that does not
apply instead of deleting it: setup recreates a missing slot, because a new slot of the workflow
reaches a workspace the same way, while an empty one is left alone, injects nothing and passes
`--check`. `workflow.toml`, `models.json` and `workspace.json` stay filled, because the tooling reads
them, and so does any slot the delivery map binds without `optional`
(`plugins/workflow/bindings.default.json`), whose role's injection needs it.

The three edit cases, and the rule to ask when a change could belong to more than one, are owned by
`AGENT-INSTRUCTIONS/README.md` under "Where an edit goes". Only a generally applicable structural
change is also made in this directory. The files here are slot templates; this README is a rule
file, not a template.

| File | Holds |
|---|---|
| `workflow.toml` | the named permission capabilities a role declares |
| `models.json` | the model and variant each agent runs on, and each session the workflow opens for `/plan`, `/release` and `/shadow-plan` |
| `workspace.json` | the integration branch, the shared resources plans lock one at a time, and the shell commands each lock guards |
| `project.md` | the workspace's own sources of truth, named for every agent |
| `repo-rules-domain.md` | the workspace's product, hard invariants, code style and named exceptions |
| `gates.md` | the verification gate commands and the conditional-gate table |
| `deploy.md` | the deployment ritual and the services it touches |
| `docs-tools.md` | the documentation checker, chart, capture and published-page commands |
| `documentation-pages.md` | the workspace's page set, wording, index, screenshots and reports |
| `style-guide-examples.md` | the workspace's exact phrases the shared style guide forbids or allows |
| `document-writer.md` | the workspace's documentation set, tree, map and review examples |
| `comment-writer.md` | where the comment writer works |
| `report-writer.md` | where the report writer works, and its chart rules |
| `publish.md` | the public checkout, the public repository's address and badges, and the publication boundary |
| `ui-reference.md` | the interface reference elements, styling and motion values, widths and known defects, read through the `ui-building` skill |
| `ops-scout.md` | the workspace's remote hosts, worker roots and the hardware a scout must never touch |
| `shadow-scope.md` | the workspace's own fence that `/shadow-plan` adds to a new shadow plan's `scope.md` |
