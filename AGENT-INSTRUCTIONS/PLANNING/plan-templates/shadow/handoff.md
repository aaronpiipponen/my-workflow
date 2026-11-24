# Handoff of {plan}

## Next action

Shadow plan. The user works interactively in this worktree and commits each accepted item; the
shadow orchestrator keeps phase S1 implementation-ready. When the user hands the plan over, a fresh
`phase-advancer` checks S1's phase file against the current tree, and S1 then runs through the
serial phase workflow.

## Current state

- Created with `/shadow-plan`; S1 is `active` with no phase file until the shadow creates it.

## Learned rules
