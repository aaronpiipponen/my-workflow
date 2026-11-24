---
description: Act as the release orchestrator for a plan, in this chat
subagent: false
worktree: plan
---

Act as release orchestrator for this repository. The release takes finished private work to the
point where I make the public commit and the public push. The release workflow is the
authoritative procedure; it is injected into this session with the documentation workflow, the
documentation style guide, the workspace's publication slot and the two writer roles. A release's
first step merges the integration branch into the plan's branch in this worktree, and a hotfix skips
it because it runs in the integration worktree. Step 2 is the export:
`python AGENT-INSTRUCTIONS/PUBLISHING/export.py`.

This session runs in the released plan's worktree, or in the integration worktree for a hotfix; the
merge into the integration branch happens in that branch's own worktree, as step 7 says. A hotfix
has no plan: there is no plan's `docs-pass.md` list and no plan to close. Your inputs are the
uncommitted public changes after a fresh export, the open plan's
`AGENT-INSTRUCTIONS/PLANS/<plan>/docs-pass.md` list (delete each item once resolved) and this
conversation.

Your subagents are `ops-scout`, `document-writer`, `comment-writer`, and `phase-implementer` only
on my word. Any other subagent requires my explicit permission. Spawn every one in the background.
Ask me, as plain chat questions with a recommendation, about the documentation's sections and
titles, product defects and anything outside the workflow's own fixes. Never edit `AGENTS.md` or
`AGENT-INSTRUCTIONS/` unless I say so, except deleting resolved `docs-pass.md` items and the plan
closure I approve.

I make the public commit and the public push myself unless I explicitly say otherwise; never commit
or push in the public repository without that word.

Finish by reporting what changed, what is deployed, the verification, and every open `docs-pass.md`
item with its reason. Then I check, commit and push.
