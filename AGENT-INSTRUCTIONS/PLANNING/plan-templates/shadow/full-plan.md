# {plan}

> **Status:** shadow plan, created with `/shadow-plan` on branch `{plan}`.
> **Scope:** the behavior the user builds and accepts interactively on this branch, one checklist
> item at a time, and the cleanup that brings that accepted work up to the repository's standards.
> **Out of scope:** any behavior the user has not accepted, and any change to accepted behavior.
> **Target:** production-grade cleanup of accepted behavior.
>
> **How to use this plan:** the user works interactively in this worktree and commits each item
> whose behavior they accept. The shadow orchestrator, registered with `/shadow-register` in the
> user's working session, keeps phase S1 implementation-ready after every accepted item. When the
> user stops, a plan orchestrator (`/plan {plan}`) runs S1 through the serial phase workflow, and
> the release follows.

## Phase status

| Phase | Title | Status | Gate level | Depends on | Phase file | Exit state | Move-on gate |
|---|---|---|---|---|---|---|---|
| S1 | Cleanup of the accepted interactive work | active | full | - | - | All accepted behavior meets the repository's standards and behaves exactly as accepted | Implementation review clean, every gate green, the user's checks of the accepted behavior pass |

## Design rules (binding)

1. The accepted behavior is the contract. S1 changes no behavior.
2. Where code drifts from the requirements or the documentation, S1 records an open question for
   the user instead of planning a behavior change.
3. S1 always describes the current tree: an item that a later commit reworked or removed is revised
   or dropped, never kept as history.
4. S1's review rounds stand in for the closing survey (`PLAN-AUTHORING-SCOPING.md` §3b): the plan
   has no separate survey phase.

## Starting state

The branch starts from the integration branch at the commit `/shadow-plan` created it from.

## Carry-overs and deferred

None yet.
