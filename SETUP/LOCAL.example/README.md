# Local slots

`SETUP/setup-repo.py` copies every file here into `AGENT-INSTRUCTIONS/LOCAL/` in a checkout, where it
becomes the checkout's own, and never overwrites one afterwards. Every slot except this file,
`workflow.toml` and `models.json` is read by agents: most by injection, and `publish.md` when the
release's instructions send it there. `project.md` is injected to every agent and is silent while
empty; `workflow.toml` and `models.json` are read by the tooling.

The files are the root templates for the checkout's own files. A checkout fills its copies; this
directory holds the unfilled structural form. `<...>` marks a fact only the checkout can supply.
Fill every marker and replace each example with the checkout's own. Delete a slot that does not
apply, except `workflow.toml` and `models.json`, which the generator requires, and any slot the
delivery map binds without `optional` (`PLUGINS/workflow/bindings.default.json`): deleting one of
those removes a file a role's injection needs.

The three edit cases, and the rule to ask when a change could belong to more than one, are owned by
`AGENT-INSTRUCTIONS/README.md` under "Where an edit goes". Only a generally applicable structural
change is also made in this directory. The files here are slot templates; this README is a rule
file, not a template.

| File | Holds |
|---|---|
| `workflow.toml` | the named permission capabilities a role declares |
| `models.json` | the model and variant each role runs on |
| `project.md` | the checkout's own sources of truth, named for every agent |
| `repo-rules-domain.md` | the checkout's product, hard invariants, code style and named exceptions |
| `gates.md` | the verification gate commands and the conditional-gate table |
| `deploy.md` | the deployment ritual and the services it touches |
| `docs-tools.md` | the documentation checker, chart, capture and published-page commands |
| `documentation-pages.md` | the checkout's page set, wording, index, screenshots and reports |
| `style-guide-examples.md` | the checkout's exact phrases the shared style guide forbids or allows |
| `document-writer.md` | the checkout's documentation set, tree, map and review examples |
| `comment-writer.md` | where the comment writer works |
| `report-writer.md` | where the report writer works, and its chart rules |
| `publish.md` | the public checkout and the publication boundary |
| `ops-scout.md` | the checkout's remote hosts, worker roots and the hardware a scout must never touch |
