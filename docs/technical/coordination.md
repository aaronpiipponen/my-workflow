# Coordination

The coordinator watches the linked plan orchestrators behind the scenes, holds two plans before their work collides, and lets them settle the overlap through a channel.

## What the coordinator is

The coordinator is one long-lived session in the workspace root, on its own `coordinator` agent and model; the plugin passes that model explicitly from `LOCAL/models.json` when it creates the session. It makes no product or implementation decision, never edits a plan or code, and never talks to an orchestrator except through its tools. Its job is to notice that two plans are about to change the same code and to stop both at a known point, before either branch commits work the other would have to undo at the merge.

The user works with the plan orchestrators. The coordinator runs beside them, and the user can open its session to read what it noticed or to ask it something, but nothing in the daily loop requires that.

Linking is optional. An orchestrator that is not linked works exactly as a serial plan.

## Linking a plan

The user types `/coordinator-link` in a plan orchestrator's chat once the plan's scope and its first detailed phase are ready to read. The orchestrator never links itself. The first link in a workspace creates the coordinator session in the root, and later links reuse it.

The command refuses a session whose worktree has no plan folder, the coordinator itself, a release session, and a plan already linked to another live orchestrator. A failed link is reported as a note in the chat it was typed in.

## The feed

Everything reaches the coordinator as messages appended to its conversation, never through its system prompt. Its read cache therefore holds no matter how the plans change.

When a plan links, the coordinator receives a `LINKED` message with the whole `full-plan.md`, the touched-files block of every detailed phase and the armed holds. After that it receives one `FEED` message per finished orchestrator round, which carries:

- the orchestrator's messages to the user.
- each child's report, shortened by its fixed titles: an implementer keeps its revision range, its notes for the advancer and whether a user test is required, an advancer keeps its verdict fields, a scout is only named, and a report without its titles is kept whole.
- the diff of `full-plan.md` since the last feed.
- every added or changed touched-files block, and the phase documents that stopped being active.

![A plan orchestrator's messages, its children's shortened reports and its plan changes wait in the plan's inbox file. At the end of the orchestrator's round the inbox becomes one FEED message in the coordinator's conversation. Each linked plan has its own inbox and feed message.](/docs/assets/diagrams/coordinator-feed.svg)

The feed also flags three events. `UNLISTED FILES` names a file an implementer changed that no touched-files block of its plan lists, which the coordinator treats as a possible overlap. `IMPLEMENTER STARTED` names a phase whose implementer is running, which a hold cannot stop. `HOLD REACHED` reports that an orchestrator stopped at its hold.

Every phase document carries a marked touched-files block: each file the phase changes with one line on what changes there, and every migration, generated file and configuration key it adds. `phase-spec-auditor` checks the block against the phase's build plan, so the coordinator can rely on it without reading whole phase documents.

## Finding an overlap

The coordinator judges overlaps by written rules, not by an automatic score. It suspects one when two active phases' touched-files blocks name the same file or key, when one plan's coming phases change a function, type or contract the other plan changes or builds on, or when `UNLISTED FILES` names a file another plan touches.

It does not read the details itself. It starts a `conflict-investigator` in the background, which reads both plans and the code, may run a test merge with `git merge-tree --write-tree` and compare the branches' changed files, and returns one verdict:

| Verdict | Content |
|---|---|
| `HOOK SET` | The two trigger phases, the leading plan and the reason |
| `NOT SET` | Why no hold is needed |

A plan takes part in one armed pair at a time. An overlap that involves a plan already in a pair is noted and investigated again after that pair resolves.

## Holds

A hold is armed ahead of time at a fixed phase in each plan, so an orchestrator stops at a known point and never in the middle of a phase. The coordinator arms a pair with `hold_arm`, which refuses an unlinked plan, a phase its status table does not list, a phase that is `done`, `not applicable` or already started, and a plan already in an armed pair. A done phase counts as implemented: the plan that owns it leads, and its done contract fixes the shared shape so the other plan adapts to it. The side whose implementer has started leads for the same reason. Two phases that are both done cannot be held, because neither plan has a held phase left to stop, so their conflict is merge work for the release.

Both orchestrators receive `HOLD ARMED`, naming the partner phase, the reason and the leader. Each continues its normal loop up to the held phase and then makes its `phase_subagent` call anyway. The call is refused with `COORDINATOR HOLD`, and the refusal is what records that the plan reached its hold. A hold stops only the held phase's implementer, but the partner starts no phase at all while its hold is active.

Hold state lives in `.opencode/coordinator/holds.json` and is read on every `phase_subagent` call, so arming or releasing a hold needs no reload.

## The channel and the resolution

When both sides have reached their holds, the coordinator opens the pair's channel with `channel_open` and the leader receives `CHANNEL OPEN`. The leader sends messages into the partner's chat with `channel_send` and receives the partner's reply in the same call. The partner can send the leader a note without waiting, with `channel_notify`, for example when the user answered a question.

The two orchestrators settle the implementation details together. Anything that changes product behaviour goes to the user, under the plan orchestrator's normal authority rules. The result is one short shared design in `PLANS/shared/<pair>.md`: the target shape of the shared code, which plan changes what, and what each plan may rely on. Both plans and their releases read it.

![The coordinator arms a hold on one phase of each plan and opens the channel once both orchestrators have stopped. The leader settles the overlap with the partner and writes one shared design, from which the leader has a resolution phase written into each plan. When both pass the leader's check, the leader closes the channel and both holds are released.](/docs/assets/diagrams/hold-pair.svg)

Each plan reaches the design with its own code on its own branch. The leader has one `phase-advancer` write a resolution phase `<held-id>r` in each plan, because two implementers would not write identical code from the same text and each branch lacks the other plan's earlier phases; the partner writes no phase file. If the advancer returns only one, the leader sends it again rather than waiting for the partner. When both phase files pass the leader's acceptance check, the leader calls `channel_close`, which refuses while either plan's status table lacks its `<held-id>r` row, then releases both holds, sends the partner `RESOLVED` and tells the coordinator `PAIR RESOLVED`. The partner runs its own acceptance check on its resolution phase, and both plans continue independently.

A held plan can change. When a held phase leaves the status table or turns `not applicable`, the feed reports `HELD PHASE REMOVED`, and the coordinator has the hold checked again and keeps, moves or releases it. A pair whose channel is open is closed only by its leader.

## Shared resources

A workspace names its shared resources, such as a deployed instance, a worker machine or a heavy-job memory slot, in `AGENT-INSTRUCTIONS/LOCAL/workspace.json`, and declares which shell commands each lock guards:

```json
{
  "integration": "main",
  "resources": ["shared deployment"],
  "locked_commands": {
    "shared deployment": {
      "comment_free": "This lock governs the shared deployment. It is free but not held by you. Take it with lock_take \"shared deployment\" \"<reason>\", then run the command again.",
      "comment_held": "This lock governs the shared deployment. Another session holds it. Queue with lock_request \"shared deployment\" \"<reason>\".",
      "shell": ["docker\\s+compose\\b.*\\b(up|build|restart)\\b"]
    }
  }
}
```

A matching shell command is refused before it runs unless the session, or an ancestor of the session, holds the lock. The refusal is the entry's comment: `comment_free` when the lock is free, and `comment_held` plus the holder, plan, time and reason when another session holds it. An unknown resource, an empty comment or an invalid pattern fails the workspace settings loudly.

A session takes a free lock with `lock_take` and a reason, and releases it with `lock_release` as soon as the work is done. `lock_request` takes a free lock or queues behind its holder, first in, first out. When the lock is released, the first waiting session receives it and is woken with `LOCK GRANTED`; a waiter whose session ended or was archived is dropped. `lock_list` shows the holder and the queue.

A child session works under a lock its parent or an earlier ancestor holds, so an orchestrator can take a machine for its implementer. Only the holder or its parent releases a lock, and while a lock is held a `LOCK REMINDER` reaches the holder's parent, or the holder itself, at the end of each round. The reminder names the queue size when sessions wait. A holder session that was deleted or archived can release nothing, so before any lock tool or locked command reads the locks, each lock whose holder is gone is released and handed to the first live waiter, who is woken with `LOCK GRANTED`.

The hook guards only the commands declared in `locked_commands`. A command no entry matches, a direct edit, or a command a person runs outside OpenCode is not blocked.

| Outcome | Result |
|---|---|
| A resource the workspace does not name | Refused, with the workspace's resource list |
| An empty reason | Refused |
| A resource another session holds | Refused, naming the holder, its plan, the time and the reason |
| A release by a session that is neither holder nor its parent | Refused, naming the holder |
| A matching shell command while the session does not hold the lock | Refused with the entry's comment, and the holder when another session holds it |

## Reliability

The feed, the links, the holds and the locks live in files under `.opencode/coordinator/`, written whole on every change, so a plugin reload in the middle of a round loses nothing and the pending feed is sent at the next round end. After the coordinator's conversation is compacted, every linked plan sends a `REFRESH` with its whole full plan, its touched-files blocks, its orchestrator's last messages and the armed holds.

A plan whose folder moves to `PLANS/archive/` is unlinked at its worktree's next round end, or when the plugin loads in that worktree, and the coordinator receives `PLAN CLOSED`. `/orchestrators` in the workspace root lists the linked orchestrators with their running state and hold, and unlinks, interrupts or archives one. A plan in an armed pair keeps its link until the pair resolves.
