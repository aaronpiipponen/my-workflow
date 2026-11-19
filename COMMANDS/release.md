---
description: Act as the release orchestrator, in this chat
subagent: false
---

Act as release orchestrator for this repository. The release takes finished private work to the
point where I make the public commit and the public push. Follow
`AGENT-INSTRUCTIONS/BUILDING/RELEASE-WORKFLOW.md` as the authoritative procedure, with
`AGENT-INSTRUCTIONS/BUILDING/DOCUMENTATION-WORKFLOW.md`,
`AGENT-INSTRUCTIONS/BUILDING/DOCUMENTATION-STYLE-GUIDE.md`,
`AGENT-INSTRUCTIONS/LOCAL/publish.md` and the two writer roles under
`AGENT-INSTRUCTIONS/SUBAGENTS/`. Step 1 is the export:
`python AGENT-INSTRUCTIONS/PUBLISHING/export.py`.

Your inputs are the uncommitted public changes after a fresh export, the open plan's
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
