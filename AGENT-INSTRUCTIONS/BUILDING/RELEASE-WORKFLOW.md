# RELEASE-WORKFLOW.md - From finished work to the user's public commit and push

The release takes finished private work to the point where the user makes the public commit and the
public push. It runs after a plan's phases and its closing survey (none, for a shadow plan) are done, and for a hotfix the user
wants released. The `/release` command is the user prompt for it, and the release
orchestrator runs it.

The release is a polishing workflow, not only a documentation review. It covers the documentation,
the export's completeness and boundary, the public repository's security, the private push, the
merge into the integration branch and plan closure, and the manual public deployment. It runs in the
released plan's worktree. The user makes the public
commit and the public push, unless the user explicitly says otherwise. No agent commits or pushes in
the public repository without that word.

`DOCUMENTATION-WORKFLOW.md` owns the everyday documentation rules, the writers' roles in detail, the
tools, and the private deployment and the workspace's own capture setup where the workspace has
them. `DOCUMENTATION-STYLE-GUIDE.md` governs every text the release writes.

## Inputs

- **The uncommitted public changes** after a fresh export: every modified, added, untracked or deleted
  file that `git status` shows in the public checkout named in
  `AGENT-INSTRUCTIONS/LOCAL/publish.md`, staged or unstaged. Everything committed there has already passed a review or the user's own check.
- **The plan's documentation-pass list**, when a plan is open:
  `AGENT-INSTRUCTIONS/PLANS/<plan>/docs-pass.md`. Every item on it is in scope. The release deletes
  each item from the list once it is resolved, and reports every item still open with its reason.
- **The user's messages in the session.** Nothing else carries over between sessions.

## Steps

1. **Sync with the integration branch.** In the plan's worktree, merge the integration branch into the
   plan branch, with the branch named in `AGENT-INSTRUCTIONS/LOCAL/workspace.json`. Resolve each
   conflict by the `PLANS/shared/<pair>.md` designs whose pair names this plan and by the plans'
   done contracts, as step 7 does. Run the fast gate. The export and every audit then see the tree
   the merge will produce, not the tree the plan branched from. Releases run one at a time, so the
   integration branch does not move again before this release merges. A hotfix has no plan branch
   and runs in the integration worktree, so it skips this step.
2. **Export.** From the plan's worktree, run `python AGENT-INSTRUCTIONS/PUBLISHING/export.py` and list
   every uncommitted file in the public checkout: pages, diagrams, screenshots, the documentation
   index where the workspace has one, the interface wording, and every source, configuration and test
   file whose comments fall under the style guide. The exporter refuses a root that is not a project
   checkout, so a run from the workspace root fails instead of cleaning the target. Then diff the
   private and public CI workflows step by step: every step present in only one file is either a
   deployment or private-tooling difference the user accepts, or a missing step to add before the
   push.
3. **Scope read-only in the public checkout.** Read-only `ops-scout` audits work on disjoint file sets:
   claims against source, style drift, pages made stale by changed code, missing coverage for new
   behavior, links and anchors, diagrams, screenshots against the workspace's capture setup where it
   has one, interface wording and translations, product naming under the workspace's naming rule in
   `AGENT-INSTRUCTIONS/LOCAL/documentation-pages.md`, private material
   that reached the export, export completeness and the security checks below. When the interface
   wording file is in the uncommitted set, the wording audit covers the whole file, so every
   translated string reads naturally and uses one term per concept, and it also reports user-visible
   strings that the changed components write directly. The audits also report a new or changed behavior that
   needs a new diagram or screenshot, a diagram or screenshot that no longer matches the code or the
   workspace's capture setup, and an image that no page uses, the root README's screenshots and its
   architecture diagram included. Verify every finding against exported source before it counts.
4. **Report the findings.** Give the user the findings, grouped, with a recommendation for everything
   the user owns. Documentation, presentation, export and security findings are fixed in step 5.
   **Product bugs and other issues** found in code, configuration or behavior are reported, never
   fixed automatically.
5. **Fix at the root, in the private repository.** Nothing is fixed in the public checkout, except
   the public-only files of "Public fixes and deployment". Writers fix pages and diagrams in the
   workspace's documentation and the translated values in the interface wording file; code-comment
   drift goes to `comment-writer`; the orchestrator makes small edits itself and fixes the exporter's
   file selection. A product fix runs only when the user says so (see "Roles").
   Capture and retake screenshots and diagrams as `AGENT-INSTRUCTIONS/LOCAL/docs-tools.md`
   describes: that guide owns the capture setup, the scripts and the command, and a recapture that
   changes the state or the framing follows its rule. A defect in how the published documentation
   presents correct content is fixed at its root in the renderer's code (see "Renderer code in the
   review").
6. **Export again and verify in the public checkout.** Export, bring the workspace's capture setup up
   to the reviewed commit where the workspace has one, and refresh the private deployment where it
   has one.
   Run the checker over every changed page, the exporter's link
   and privacy check, the documentation build, the page and navigation checks where the workspace has them,
   and every image, and look at
   every changed diagram and screenshot. The visual pass below covers the root README's images along
   with every other visual. Run the public workflow's own whitespace check on the export
   itself, after the final export and before the user commits: `git add -N .` then
   `git diff --check HEAD` in the public checkout. A private fix made after the final export reaches
   the public checkout only through another export. After a renderer code change, also run the web checks and look at
   the affected pages in the rebuilt documentation at desktop and narrow widths. After a wording change, run
   the web checks and look at the changed strings in the workspace's capture setup in every language
   the workspace translates, where a string is long or its layout is tight. Repeat steps 3 to 6 until the range is clean and every
   `docs-pass.md` item is resolved or reported. See "Audit rounds" for which kind of round each
   repeat is.
7. **Private push, merge and closure.** Push the plan's branch. When a plan is open and the user
   approves each: merge the plan's branch into the integration branch, then close and archive the
   plan (`../PLANS/README.md`, "Archive"), then push the integration branch. The integration branch
   is named in `AGENT-INSTRUCTIONS/LOCAL/workspace.json` and checked out in its own worktree, the
   sibling folder of the same name; merge there with `git merge --no-ff <plan>`. Other plans may
   have merged since this plan began, so the merge can conflict: resolve each conflict by the
   `PLANS/shared/<pair>.md` designs whose pair names this plan and by the plans' done contracts.
   When the overlapping work of one plan is already done, that plan's done contract fixes the shape
   the other branch adapts to. Two done phases are reconciled here from their contracts, because no
   hold can settle them. Report to the user any conflict neither source covers instead of choosing
   a side. After the merge, run the fast
   gate and every conditional gate the merged files touch (`AGENT-INSTRUCTIONS/LOCAL/gates.md`) in
   the integration worktree, fix a failure there only on the user's word, and push only on green.
   Releases run one at a time. The push of the integration branch runs the private CI and its
   deploy job, where the workspace has them. Where the private deployment is deployed by hand
   instead, deploy it after the push as `AGENT-INSTRUCTIONS/LOCAL/deploy.md` describes, taking the
   resource lock it names first, so the private deployment serves the released state. The deploy
   guide is the only place that names where the private deployment runs.
8. **Public fixes and deployment.** Make the public-only changes the release needs, then deploy the
   public instance by hand from the public checkout's uncommitted state and prove it serves (see
   "Public fixes and deployment"). The user checks the deployed public copy.
9. **Report ready.** Report what changed, what is deployed, the verification, and every open
   `docs-pass.md` item with its reason. The user makes the public commit and the public push.

## Visual pass

A workspace with anything to see runs one visual pass over every visual the release changed or found
stale: the root README's screenshots and its architecture diagram, the documentation's screenshots
and diagrams, the rendered pages and the interface. Capture or render each at the size a reader sees
it, open it, inspect it, and fix it at its source, as `AGENT-INSTRUCTIONS/LOCAL/docs-tools.md`
describes: that guide owns the capture setup, the scripts and the command. The pass is part of step 6, and the
closing report names every preview and the checks. A workspace with nothing to see says so and skips
the pass.

## Audit rounds

A leaked secret or private detail costs more than a published bug, so the release audits in full
rounds first and narrows only when the findings show it is safe.

- **Full rounds.** The first round and every repeat of step 3 is a full round while the previous
  round found a major problem: it audits the whole uncommitted set after a fresh export, with every
  audit of the first round, and no earlier round's clean result carries over. The orchestrator
  judges what is major. A major problem need not break the repository: it is one big enough that a
  similar problem could hide elsewhere and warrants another full search, such as a leaked private
  detail, a test that fails in the public repository, a wrong claim repeated across pages or a
  stale area that earlier rounds missed.
- **Delta rounds.** Full rounds stop when a round finds only small problems, or when its findings
  start contradicting earlier rounds' findings or each other. Later rounds audit only what changed
  since the previous round, until the remaining changes are small enough for the orchestrator to
  make itself.
- **Security every round.** Every round, full or delta, runs the whole-checkout security checks
  below.

## Export completeness and boundary

Trust neither the export nor the public checkout. The exporter can miss files that belong in the
public repository, such as a module, template or page a plan added, and it can carry files that do
not belong there. Both kinds are fixed in the private repository's export selection, the export runs
again, and nothing is called ready while either remains.

- **Missing files.** Compare what the product needs in a fresh public checkout (every module an
  exported module imports, every template, script and page a published page or command names) with
  what the export holds.
- **Files that do not belong.** Account for every exported file by its actual owner, supported role
  and consumers: product runtime and build, automated tests and their dependencies, supported
  product commands and setup examples, or private agent, inspection, screenshot, profiling and
  session tooling. Check explicit ownership requirements as well as source and callers. An npm
  command, an allowlist entry, a generic implementation or a page calling a helper test tooling does
  not establish that it should ship. Private inspection helpers stay excluded, while the shared
  launchers that automated tests actually import stay included. Inspect image contents too, including
  committed images that the changed pages reuse.
- **Trust nothing.** An exporter allowlist, a protected copy, a file's tracked history, an earlier
  review, a passing check or a statement that a file is intended for the public repository is no
  evidence that it is clean. A clean keyword scan is not a completed boundary audit. Report the
  accounted-for file groups and every unresolved classification before claiming the export is ready.

## Security checks

These checks cover the whole public checkout, committed and uncommitted, every release:

- **No secret.** No password, token, key, credential or `.env` value in any file, image, history the
  release adds, or deployment file.
- **The ignore file is current.** The public checkout's independently authored ignore file covers
  every runtime, data, model, cache, secret, local configuration and deployment path the product now
  writes or reads, including paths the released work added. A path that the product creates and Git
  would track is a defect.
- **Nothing reveals the private repository.** No exported or public-only file names the private
  repository, its workspace, its deployment, its hosts, its paths or its values, and no exported name,
  path, comment, value or page distinguishes public from private or only makes sense beside a
  counterpart (such as a file named `private-*` or `public-*`, or a unit named `*-public-*`). Private
  files are never exported and name themselves as private. A file that has to hold a real path, user
  name, host detail, account handle or other deployment-specific value is ignored by Git and has a
  published counterpart under `examples/` with generic values. The words public and private as
  product terms (the public configuration files, a private issue tracker, a private
  publication state) are allowed: this check concerns the split between the private and the public
  repository, not the product's own vocabulary.
- **Committed public history is out of scope.** The release audits and fixes the uncommitted public
  changes and the whole public checkout as it stands. Commits that are already in the public
  repository's history are never rewritten, and an old commit that names a private path is not a
  release finding.

A security defect is fixed before anything is reported ready. A defect in an exported file is fixed
at its root in the private repository; a defect in a public-only file is a public fix.

## Public fixes and deployment

The release orchestrator owns the fixes in the public checkout that the export cannot make: the
public instance's ignored runtime configuration and local deployment files, the public-only files the
exporter protects, and the public instance's move to a new layout when a plan assigns it to the
release. It never commits or pushes there.

It deploys the public instance by hand from the public checkout before the user's push, so the user
can check the release working before it is committed. It runs the documented deployment for the
public instance, proves the entry points the workspace documents answer, and reports the result.
Where the public checkout has a CI deploy job, it is for small hotfix-type changes that need no
check by the user before the push; a release that the user checks first is deployed by hand.

## Roles

- **Orchestrator.** Briefs, reviews, verifies and owns the steps above. It reads the source before
  briefing a writer. It owns the glossary and, where the workspace publishes rendered documentation,
  its index and page placement. It may make
  small edits itself: a wrong word, a sentence, a caption, a label, a link. A batch of findings, a new
  section, a table or a rewrite goes to a writer. It reviews every diagram by rendering it and looking
  at the image, and reviews the final screenshots. It asks the user, as plain chat questions with a
  recommendation, about the documentation's sections and titles and about any change outside the
  documentation other than code-comment fixes, the renderer code edits of "Renderer code in the
  review", the export selection and the public fixes and deployment.
- **Page structure.** The release owns splitting pages: a page that has grown past one coherent
  subject or one reading flow is split into smaller pages, and new material that forms its own
  subject moves to a page of its own. The section and title of a new page are asked where the
  workspace publishes its documentation.
- **`document-writer`, `comment-writer` and `ops-scout`** work as `DOCUMENTATION-WORKFLOW.md`
  describes, in the background, on disjoint files.
- **`phase-implementer`, only on the user's word.** When the user tells the orchestrator to fix a
  reported product bug or issue, the orchestrator launches a fresh `phase-implementer` whose prompt
  declares `AUTHORIZED ELEVATED PERMISSIONS`, names the fix as the authorized action, and carries
  every requirement directly: the defect and its evidence, the files, the expected behavior, the
  boundaries, the test budget and the verification. No phase file is written for it.

The release orchestrator spawns only these agents, all in the background. Any other subagent requires
the user's explicit permission. There is no general-purpose writing agent. Nothing in `docs/`
mentions an agent, and no `docs/` page links to agent material.

## Renderer code in the review

Where the workspace publishes rendered documentation, its reader and compiler are product code and its
tuning belongs to the workspace: `AGENT-INSTRUCTIONS/LOCAL/publish.md` names the paths the release
may edit, the checks it runs and the report it requires. Subagents never edit renderer code; a writer
or scout that finds a renderer defect reports it. A workspace without a renderer drops this section.

## Standing rules

- Full coverage is the only hard requirement. There are no quotas of any kind: no page, word,
  heading, table, callout, image, screenshot, snippet or glossary-link minimum or maximum.
- Pages read well: tables, callouts, steps, verified examples, focused diagrams and real screenshots
  where they help. Never a bland wall.
- Shared pages never link into the private set.
- The private selection matches the public one. A page in the private set is read in the repository
  and is never published.
- Screenshots and the published-page checks use the workspace's capture setup where it has one,
  never the public copy and never the private deployment, which serves real data.
- Do not re-audit all committed docs. Scope each full round to the whole uncommitted set, the
  `docs-pass.md` list and the whole-checkout security checks.
- A release keeps no working ledger and no persistent review record. The plan's `docs-pass.md` list
  is the one carried input, and the release empties it.
