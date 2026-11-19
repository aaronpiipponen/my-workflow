**Foreground-only children (binding).** NEVER spawn background subagents. Launch every
reviewer, auditor and scout with the `subagent_foreground` tool, which blocks until the child
finishes and returns its report and session ID; continue an unfinished child by passing its
`sessionID`. Never use the plain `subagent` tool for these children. Consume each report before
continuing or returning. This role-specific rule overrides any inherited general
background-delegation instruction. It does not change the orchestrator's mode when launching this
agent.
