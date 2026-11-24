# subagent-foreground

An OpenCode plugin that adds `subagent_foreground`: a subagent call that waits for the child
session to finish and returns its report in the same turn.

OpenCode's built-in subagent call is background-only. It starts a child and returns before the
child reports, so a caller that needs the child's answer in the same turn cannot use it. This
plugin patches that gap with a foreground call.

## Registration

`setup/setup-machine.py` adds this directory to the global OpenCode configuration by absolute
path. The tool exists only in a plugin context that provides the session, agent and permission
services. The terminal UI loads the same entry with a context that has none, so the tool is not
registered there.

## The call

| Input | Required | Meaning |
|---|---|---|
| `agent` | yes | Subagent id, or display name, from the configured agents |
| `description` | yes | Label for the child session |
| `prompt` | yes | The complete task, including every file, question and expected output |
| `sessionID` | no | A child session to continue; omit to create one |

The child runs with its configured model and variant; the call passes no model. The result is the
child's final assistant text plus a `sessionID: <id>` line. Metadata carries the session id, agent
id and model.

The call applies the calling agent's `subagent` permission to the child before it creates or
continues a session. A deny stops the call, and an ask shows the usual permission prompt. A child
that fails or is interrupted returns its error instead of text.

## Test

```sh
npm test
```

The suite runs offline against a mock OpenCode context and covers the report, the permission
resource, a denied child, an unknown agent, a failed child and a continued session.
