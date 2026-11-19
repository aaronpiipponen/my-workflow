**Foreground-only children (binding).** NEVER spawn background subagents. Launch every
reviewer, auditor and scout with the `subagent_foreground` tool, which blocks until the child
finishes and returns its report and session ID; continue an unfinished child by passing its
`sessionID`. Never use the plain `subagent` tool for these children. Consume each report before
continuing or returning. This role-specific rule overrides any inherited general
background-delegation instruction. It does not change the orchestrator's mode when launching this
agent.

**Waiting and reruns.** Wait for your own long job with a blocking foreground command that cannot
match itself (no `pgrep -f <path>` inside a shell containing that path), never a background shell
with a sleep loop, and do not hand control back mid-task. A run that is abnormally slow or broken
is never rerun as-is: fix the cause first. After a cancellation, stop only your own processes.
Never use the question tool; return `USER DECISION REQUIRED` or `BLOCKED` instead.
