# Scope of {plan}

## Authorized unit

Phase S1 of `full-plan.md`, the cleanup of the behavior the user accepts interactively on this
branch. The shadow orchestrator edits only this plan's folder. Implementation of S1 starts only when
the user hands the plan to a plan orchestrator.

## Branch and commit rules

Work happens on the branch `{plan}`, in its worktree. The user commits each accepted item; the
shadow orchestrator does not commit. Nothing is pushed to the integration branch.

## Protected material

No change to behavior the user accepted.

## Publication boundary

No export, public commit, tag or release. Those belong to the release workflow after S1.
