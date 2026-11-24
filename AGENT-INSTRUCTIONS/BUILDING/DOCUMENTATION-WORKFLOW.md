# DOCUMENTATION-WORKFLOW.md - Keeping docs current, writing reports, and the documentation tools

Two rules cover documentation. `DOCUMENTATION-STYLE-GUIDE.md` is binding for every writing task
and governs the text itself. This file covers who does what, when, and with which commands.

Paths this file names by role are named for the workspace in `AGENT-INSTRUCTIONS/LOCAL/`: the
documentation set, its private part and the user-owned file are in `documentation-pages.md`; the
interface wording file, the screenshots, and the experiment-report, chart and diagram directories
are in `documentation-pages.md`; the experiment directory is in `repo-rules-domain.md`; the
checker, chart generator and the workspace's own capture setup are in `docs-tools.md`.

## Where documentation lives

- **The shared set** is the workspace's published documentation. The release exports it to the public
  checkout named in `AGENT-INSTRUCTIONS/LOCAL/publish.md`. It documents the exported version, and it
  never names another version, deployment, cloud host, or worker topology.
- **The private set** is never exported. Its pages have the same kinds, scale and style as the shared
  pages, and they document only private-only features and patches and the private deployment. A
  private page may name real hosts, remote targets, local environments, paths and configured
  values, and never a secret or credential.
- **Agent material** (`AGENTS.md`, `AGENT-INSTRUCTIONS/`, plans, requirements, decision records,
  ledgers, scope) never appears in the documentation, and no page links to it. Instruction files may
  point into the documentation.
- A file the workspace marks user-owned is never read as task input, edited, moved or linked.
- Code documentation states its facts locally. Source does not name a document. When a fact spans
  modules, it belongs in a developer page, and the code carries no pointer to it.

## Rule 1 - docs change in the change that changes behavior

Every behavior-changing task keeps the documentation in shape as it goes. Drift is fixed where it is
made, not left for the release to replace.

- The style guide governs every written artifact in the change, not only the Markdown pages: file
  headers, doc comments, configuration, ignore-file and script comments, test names and
  comments, and the interface wording and its translations in the interface wording file. Apply
  `DOCUMENTATION-STYLE-GUIDE.md` to every one of them, and fix the prose the
  change makes stale there too. A new or changed interface string reads naturally in every language
  the workspace translates, never as a word-for-word copy.
- The implementer updates the affected pages in the same change as the code and the tests, to the
  style guide, in the shared set or in the private set by where the behavior lives. The same guide
  governs every other prose line the change writes, including file headers, doc comments,
  configuration and script comments and test names. A new behavior
  gets its page or section then. A new behavior that forms its own subject gets a new page rather
  than another section on an existing page, so pages stay focused instead of growing with every
  change. Splitting an existing page into smaller ones belongs to the release; a phase that finds a
  page it touched has grown past one subject records it on the plan's documentation-pass list.
- An item explicitly deferred to the release instead of fixed in the change (a screenshot, a
  diagram, a page that waits for a later move) is recorded on the plan's
  `AGENT-INSTRUCTIONS/PLANS/<plan>/docs-pass.md` list with its file and what is wrong. The phase
  document or the child report names it, and the plan orchestrator records it.
- A detailed phase spec names the exact documentation pages it touches (create, update, delete).
  "Update the docs" alone is not an acceptable line item.
- The advancer and the reviewers accept a phase only when its documentation is neither stale nor
  wrong.
- Impacted unchanged pages are in scope too. When a code change makes another page's statement
  false, that page changes in the same task.

## Rule 2 - the release

The documentation review before a public commit is one part of the release, which
`RELEASE-WORKFLOW.md` owns with its steps, roles, code rules and standing rules. The writers'
roles below apply there.

### Writers and scouts

- **`document-writer`.** Background writing agents, a few at a time on disjoint file scopes, one
  writer for a narrow task. A writer edits the workspace's documentation, the translated values in
  the interface wording file, and the screenshot capture material of an image it retakes as
  `docs-tools.md` names it, and no other file. One writer at a time owns the wording file. A writer captures each
  screenshot named in its brief with the workspace's capture setup into the screenshots directory,
  or into the private one on a private page, in the same state and framing when recapturing; the
  commands and the setup are the workspace's, as `docs-tools.md` describes. Resume an
  interrupted or unfinished writer in its exact session to continue its authorized task, without
  additional user approval. A `TERM REQUEST` continues in that same session with the chosen term.
  Resuming a fully finished writer requires explicit user approval; otherwise give a follow-up fix
  to a fresh writer carrying the scoped findings, named files and evidence. Preserve user stop
  instructions and unanswered decision gates. Do not reuse a writer's session for unrelated work
  without the user's approval.
- **`ops-scout`.** Read-only audits of disjoint page sets, for scoping and for a separate
  presentation pass.
- **`comment-writer`.** Background code documentation writer. It fixes the verified code-comment
  drift the orchestrator hands it, comment text only, and no other file content. The same session
  continuation rules as `document-writer` apply.

## Rule 3 - writing experiment reports

The experiment reports under the experiment-report directory and their charts under the charts
directory are written in their own sessions, from the project's recorded experiment evidence. The
style guide's "Experiment reports" and "Charts" sections govern the text and the charts.

1. **Map.** Before a brief that reworks existing pages, one read-only `ops-scout` maps the affected
   pages: each page's question and answer, duplicated methods, tables and numbers, and content the
   style guide's report rules leave out. The map shapes the briefs.
2. **Brief.** One `report-writer` writes one report: one page and its charts. A category overview,
   a method page and the section index count as one report each. The orchestrator briefs each
   writer with the page's path, what it must cover, the failed approaches and standing results it
   must state, and the exact source files to read, and gives every report a fresh writer. The
   sources are the plans' benchmark notes, `done/` contracts and experiment notes under
   `AGENT-INSTRUCTIONS/PLANS/` (archived plans included), and the experiment code and raw results
   under the experiment directory. Several writers run at once on the reports of one plan phase,
   each on its own files, and the next phase starts only after every report of the current one is
   accepted.
3. **Write.** The writer reads every named source in full and writes the pages and the chart data
   files. It may read any archived plan, result or experiment code it needs, and it never names,
   links or quotes any of them, or the experiment directory, on a page: every report is
   self-contained. A code snippet that shows a command, configuration, query, data structure or
   short algorithm as the experiment used it is allowed wherever it helps the reader, without
   naming the file it came from. It generates each chart with the chart generator and never edits a
   chart SVG by hand. A diagram is allowed on a report wherever it helps the reader, drawn and
   rendered to the style guide's diagram rules in the diagrams directory. It adds no index entry and
   edits only the scoped report pages, their charts and their diagrams.
4. **Check the numbers.** Before accepting a report, the orchestrator sends one read-only
   `ops-scout` that checks every number, cohort, setting, model name and outcome on the page
   against the named sources and reports each mismatch with the source line. The orchestrator
   sends the mismatches back to the writer, or fixes a single wrong value itself.
5. **Check the pages.** Run the documentation checker on every changed page and chart, render every
   chart and diagram and look at the image, and read every page for the style guide's report rules
   and for any reference to the sources.
6. **Register and commit.** The orchestrator adds the pages to the workspace's documentation index
   when it has one, runs the workspace's documentation checks, including its capture setup where it
   has one, and commits on the working branch.

The orchestrator spawns only `report-writer` and read-only `ops-scout` for this work, in the
background. Report pages reach the public repository through the export and the release of Rule 2,
like every other shared page.

## Tools

The workspace's documentation tools and their exact invocations live in
`AGENT-INSTRUCTIONS/LOCAL/docs-tools.md`: the Markdown and diagram checker, chart generation,
screenshot capture, any published-page checks and the workspace's own capture setup. Run the commands
from that file; do not invent an invocation, and do not substitute a weaker check.
