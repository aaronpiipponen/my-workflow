// subagent-foreground, an OpenCode v2 plugin
//
// Adds the subagent_foreground tool, which runs one subagent child session and waits for it.
// The built-in subagent tool returns as soon as the child starts, and the child reports back
// later as a <subagent> message, so a caller that needs the report in the same turn cannot get
// it.
//
// One call creates a child session with the calling session as its parent and the named agent,
// admits the prompt with ctx.session.prompt, and blocks on ctx.session.wait until the child's
// agent loop goes idle. The child's messages then hold the outcome in the last idle message and
// the answer in the last assistant message before it. A failed or interrupted child throws the
// child's own error, so the caller never receives text the child did not produce.
//
// The call is authorized like the built-in subagent tool: before any session is created or
// continued, ctx.permission.assert evaluates the calling agent's `subagent` rules against the
// child agent id. A deny throws before the child exists; an ask shows the usual permission
// prompt and waits for the reply. The tool is registered only where that permission service is
// available, so no caller can reach a child without the check.
//
// The tool passes no model, so the agent's configured model and variant apply. The child runs
// in the server, and the caller continues only after the child goes idle.
//
// Placement: this directory is registered as a plugin by setup/setup-machine.py, which adds it to
// the global configuration by absolute path. The terminal UI loads the same entry and calls setup
// with a context that has no session, tool, agent or permission services, so setup returns early
// there instead of registering an unguarded tool.

const TOOL_NAME = "subagent_foreground"

// Scan backwards for the last message of one type, so the newest round wins when a continued
// session holds several.
function lastIndex(messages, type, before = messages.length) {
  for (let index = before - 1; index >= 0; index -= 1) {
    if (messages[index]?.type === type) return index
  }
  return -1
}

// The idle message closes the child's last round and carries its outcome. The last assistant
// message before it carries the text of that round. The coordinator's channel reads a partner
// orchestrator's reply the same way.
export function lastRound(messages) {
  const idleIndex = lastIndex(messages, "idle")
  if (idleIndex === -1) return {}
  return {
    idle: messages[idleIndex],
    assistant: messages[lastIndex(messages, "assistant", idleIndex)],
  }
}

export function assistantText(message) {
  const content = Array.isArray(message?.content) ? message.content : []
  return content
    .filter((part) => part?.type === "text" && typeof part.text === "string")
    .map((part) => part.text)
    .join("\n")
    .trim()
}

// Render a structured error as one line, so the caller sees the provider's own message.
export function errorText(error) {
  if (!error) return "no error detail"
  const message = typeof error.message === "string" && error.message ? error.message : "no error message"
  return typeof error.type === "string" && error.type ? `${error.type}: ${message}` : message
}

// The permission resource is the child agent id, so the configured agent is resolved from the
// agent catalog first. A display name resolves too, the way the built-in subagent tool resolves
// the agent it starts.
export async function resolveAgent(ctx, requested) {
  const { data: agents } = await ctx.agent.list()
  const catalog = Array.isArray(agents) ? agents : []
  const child =
    catalog.find((candidate) => candidate?.id === requested) ??
    catalog.find((candidate) => candidate?.name === requested)
  if (!child) throw new Error(`subagent_foreground: unknown agent ${requested}`)
  return child
}

// Apply the calling agent's `subagent` permission for the child, with the built-in tool's action,
// resource and tool source. ctx.permission.assert prompts the user on an ask and rejects on a
// deny or a rejection; either way the caller gets a message naming itself and the requested agent.
export async function assertSubagentAllowed(ctx, child, context) {
  try {
    await ctx.permission.assert({
      sessionID: context.sessionID,
      agent: context.agent,
      source: { type: "tool", messageID: context.messageID, id: context.id },
      action: "subagent",
      resources: [child.id],
      save: [child.id],
    })
  } catch (error) {
    throw new Error(
      `subagent_foreground: agent ${context.agent} may not start agent ${child.id}: ${errorText(error)}`,
      { cause: error },
    )
  }
}

const run = (ctx) => async (input, context) => {
  const agent = input.agent.trim()
  const prompt = input.prompt.trim()
  if (!agent) throw new Error("subagent_foreground needs an agent name")
  if (!prompt) throw new Error("subagent_foreground needs a prompt")

  let sessionID = typeof input.sessionID === "string" ? input.sessionID.trim() : ""

  // Authorize before touching a session, so a denied or rejected child never exists and a
  // continued session is authorized on the same rule as a new one.
  const child = await resolveAgent(ctx, agent)
  await assertSubagentAllowed(ctx, child, context)
  const agentID = child.id

  if (sessionID) {
    // A missing or archived session fails here rather than inside the prompt admission.
    const existing = await ctx.session.get({ sessionID })
    if (existing?.time?.archived) throw new Error(`session ${sessionID} is archived`)
    // The run must use the agent this call names, so a continued session is switched to it
    // when the session holds another agent. The agent's own configuration still applies.
    if (existing?.agent !== agentID) await ctx.session.switchAgent({ sessionID, agent: agentID })
  } else {
    const created = await ctx.session.create({
      parentID: context.sessionID,
      agent: agentID,
      title: input.description,
    })
    sessionID = created?.id
    if (!sessionID) throw new Error(`the child session for agent ${agentID} was not created`)
  }

  await ctx.session.prompt({ sessionID, text: prompt })
  await ctx.session.wait({ sessionID })

  const { idle, assistant } = lastRound(await ctx.session.context({ sessionID }))
  if (!idle) throw new Error(`the child session ${sessionID} is not idle`)
  if (idle.outcome !== "succeeded") {
    const detail = errorText(idle.error ?? assistant?.error)
    throw new Error(`the child session ${sessionID} ended with outcome ${idle.outcome}: ${detail}`)
  }

  const text = assistantText(assistant)
  if (!text) throw new Error(`the child session ${sessionID} finished with no assistant text`)

  return {
    content: `${text}\n\nsessionID: ${sessionID}`,
    metadata: { sessionID, agent: agentID, model: assistant?.model },
  }
}

export default {
  id: "subagent-foreground",
  async setup(ctx) {
    // The tool is registered only where the parent session can be checked and the child started,
    // and never without the permission service that authorizes the child agent.
    if (
      typeof ctx?.tool?.transform !== "function" ||
      typeof ctx?.session?.wait !== "function" ||
      typeof ctx?.agent?.list !== "function" ||
      typeof ctx?.permission?.assert !== "function"
    )
      return

    await ctx.tool.transform((editor) => {
      editor.add({
        name: TOOL_NAME,
        description:
          "Run a subagent in a child session and wait for its report. The call blocks until the child session goes idle, then returns the child's final text and its session ID. Use it when the report is needed in this turn, for example a review or audit. A failed or interrupted child returns an error instead of text.",
        input: {
          type: "object",
          properties: {
            agent: {
              type: "string",
              description: "Subagent ID from the configured agents, for example phase-implementation-reviewer.",
            },
            description: {
              type: "string",
              description: "Short label for the child session.",
            },
            prompt: {
              type: "string",
              description: "Complete task for the subagent, including every file, question, and expected output.",
            },
            sessionID: {
              type: "string",
              description: "Child session to continue. Omit to create a child session of this session.",
            },
          },
          required: ["agent", "description", "prompt"],
          additionalProperties: false,
        },
        options: { codemode: false },
        execute: run(ctx),
      })
    })
  },
}
