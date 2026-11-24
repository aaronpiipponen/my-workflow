# Release and hotfix

A release takes one finished plan through the public review, merges its branch into the integration branch and closes the plan, and a hotfix does the same without a plan.

## Starting a release

`/release <name>` started in the workspace root opens a release orchestrator in the plan's worktree as a new session. `/release` in the integration worktree is always a hotfix, whatever the argument: a release in that worktree, with no plan, no `docs-pass.md` list and no plan to close, used for work that belongs to no plan, such as a documentation pass over the whole product.

Releases run one at a time. Each plan is closed only by its own release, and no plan branch is ever merged into another plan branch.

Before it exports, a release merges the integration branch into the plan's branch in the plan's worktree. It resolves those conflicts by the shared designs whose pair names this plan and by the plans' done contracts, the same rules the final merge uses, and runs the fast gate. A hotfix skips the sync because it already runs in the integration worktree. The export and every audit then describe the tree the release will produce, not the tree the plan branched from. Because releases run one at a time, the integration branch does not move again before this release merges.

The release reads three inputs: the uncommitted public changes after a fresh export, the plan's `docs-pass.md` list of documentation items the plan deferred, and the user's messages in the session. It deletes each `docs-pass.md` item once it is resolved and reports every item left open with its reason.

## Review and fixes

The release exports the private work into the public checkout and has read-only scouts audit every changed file: claims against the source, pages that changed code made stale, links and anchors, diagrams and screenshots, interface wording, private material that reached the export, and the export's completeness.

Documentation, presentation, export and security findings are fixed at their source in the private repository, through the `document-writer` and `comment-writer` roles, and the export runs again. A product defect is reported to the user and fixed only on the user's word, through a fresh `phase-implementer`.

Before it reports, the release runs one visual pass over every visual it changed or found stale: the root README's screenshots and architecture diagram, the documentation's screenshots and diagrams, the rendered pages and the interface. It opens each one and fixes it at its source. A release that changes the root README writes it by the README guide, with its logo, badges, contents list and sections in the guide's order.

## The merge

When the user approves, the release merges the plan branch into the integration branch in the integration worktree, with `git merge --no-ff <plan>`. The integration branch is named in `AGENT-INSTRUCTIONS/LOCAL/workspace.json`, for example `main` or `dev`.

The plan branch already contains the integration branch from the sync, so this merge brings in nothing that the review did not see. The release still runs the fast gate and every conditional gate the merged files touch, and fixes a failure there only on the user's word. If the integration branch moved after the sync, such as through a hotfix, the release syncs again and repeats the affected part of the review before it merges.

The sync and the final merge resolve conflicts by the shared designs whose pair names this plan and by the plans' done contracts. A done contract settles the shape of work its phase has already implemented. When a conflict touches work one plan has done, that plan leads the settlement and its done contract fixes the shared shape, so the other branch adapts to it. Two phases that are both done cannot be held, so their conflict is reconciled from the done contracts and the shared designs, and a result those do not determine goes to the user instead of the release choosing a side.

![A release starts in the plan's worktree, exports the private work to the public checkout and audits it, then merges the plan branch into the integration branch in the integration worktree. The gates run after the merge, and the plan closes into the archive. A hotfix starts in the integration worktree and has no plan to close. The user makes the public commit after review.](/docs/assets/diagrams/release-merge.svg)

## Closing the plan

After the merge passes its gates, the release closes the plan and moves its folder to `PLANS/archive/<plan>/`. Where the workspace deploys its private instance by hand rather than from a CI job, the release deploys it from the integration worktree after the push, as `LOCAL/deploy.md` describes, taking the lock it names first. The archived plan records stay as they were written. The coordinator drops the plan at its worktree's next round end, or when the plugin loads there and finds the plan gone.

## The public boundary

The user makes every public commit and push unless the user explicitly says otherwise, and the release stops before them with a report of what changed, what is deployed, the verification and the open items. The release audits the whole public checkout on every round: no secret, a current ignore file, and no reference to the private repository, its workspace, its deployment, its hosts or its paths. A workspace whose `LOCAL/publish.md` names no public checkout skips the export and the public review, and its release only merges and closes.
