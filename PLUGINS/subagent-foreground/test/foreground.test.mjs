// Verify the foreground subagent tool against a mock OpenCode context.
import plugin from "../index.js"

let passed = 0
let failed = 0
function check(name, condition, extra = "") {
  if (condition) {
    passed++
    console.log("ok   " + name)
  } else {
    failed++
    console.log("FAIL " + name + (extra ? "  -> " + extra : ""))
  }
}

const SUCCESS = [
  { type: "assistant", content: [{ type: "text", text: "the report" }] },
  { type: "idle", outcome: "succeeded" },
]

const CONTEXT = {
  sessionID: "ses_parent",
  agent: "builder",
  messageID: "msg_1",
  id: "tool_1",
}

const INPUT = {
  agent: "reviewer",
  description: "Review the change",
  prompt: "Audit the change and report findings.",
}

function mock({ messages = SUCCESS, allow = true, agents = [{ id: "reviewer", name: "Reviewer" }] } = {}) {
  let tool = null
  const calls = { assert: [], create: [], get: [], switchAgent: [], prompt: [], wait: [] }
  const ctx = {
    tool: {
      transform: async (edit) =>
        edit({
          add: (definition) => {
            tool = definition
          },
        }),
    },
    agent: { list: async () => ({ data: agents }) },
    permission: {
      assert: async (request) => {
        calls.assert.push(request)
        if (!allow) throw new Error("denied")
      },
    },
    session: {
      create: async (input) => {
        calls.create.push(input)
        return { id: "ses_child" }
      },
      get: async ({ sessionID }) => {
        calls.get.push(sessionID)
        return { id: sessionID, agent: "reviewer", time: {} }
      },
      switchAgent: async (input) => {
        calls.switchAgent.push(input)
      },
      prompt: async (input) => {
        calls.prompt.push(input)
      },
      wait: async (input) => {
        calls.wait.push(input)
      },
      context: async () => messages,
    },
  }
  return { ctx, calls, tool: () => tool }
}

async function run(h, input = INPUT) {
  return h.tool().execute(input, CONTEXT)
}

// The setup registers the tool and returns the child's report with its session id.
{
  const h = mock()
  await plugin.setup(h.ctx)
  check("registers subagent_foreground", h.tool()?.name === "subagent_foreground")

  const result = await run(h)
  check("returns the child's text", result.content.startsWith("the report"))
  check("reports the child session id", result.content.endsWith("sessionID: ses_child"))
  check("reports the child agent", result.metadata.agent === "reviewer")
  check("creates the child under the calling session", h.calls.create[0]?.parentID === "ses_parent")
  check("waits for the child", h.calls.wait[0]?.sessionID === "ses_child")
}

// The permission resource is the resolved child agent id.
{
  const h = mock()
  await plugin.setup(h.ctx)
  await run(h, { ...INPUT, agent: "Reviewer" })
  const request = h.calls.assert[0]
  check("authorizes the child agent", request?.action === "subagent")
  check("uses the child id as the resource", request?.resources?.[0] === "reviewer")
}

// A denied child never creates a session.
{
  const h = mock({ allow: false })
  await plugin.setup(h.ctx)
  let error = null
  await run(h).catch((caught) => {
    error = caught
  })
  check("rejects a denied child", /may not start agent reviewer/.test(error?.message ?? ""))
  check("creates no session when denied", h.calls.create.length === 0 && h.calls.get.length === 0)
}

// An unknown agent fails before the session starts.
{
  const h = mock({ agents: [] })
  await plugin.setup(h.ctx)
  let error = null
  await run(h).catch((caught) => {
    error = caught
  })
  check("rejects an unknown agent", /unknown agent reviewer/.test(error?.message ?? ""))
  check("creates no session for an unknown agent", h.calls.create.length === 0)
}

// A failed child returns its own error, never text.
{
  const h = mock({
    messages: [{ type: "idle", outcome: "failed", error: { type: "provider", message: "boom" } }],
  })
  await plugin.setup(h.ctx)
  let error = null
  await run(h).catch((caught) => {
    error = caught
  })
  check("throws the child's failure", /outcome failed: provider: boom/.test(error?.message ?? ""))
}

// Continuing a session switches it to the named agent.
{
  const h = mock()
  h.ctx.session.get = async ({ sessionID }) => ({ id: sessionID, agent: "other", time: {} })
  await plugin.setup(h.ctx)
  await run(h, { ...INPUT, sessionID: "ses_existing" })
  check(
    "switches a continued session to the named agent",
    h.calls.switchAgent[0]?.sessionID === "ses_existing" &&
      h.calls.switchAgent[0]?.agent === "reviewer",
  )
  check("creates no session when continuing", h.calls.create.length === 0)
}

console.log(`\n${passed} passed, ${failed} failed`)
process.exitCode = failed ? 1 : 0
