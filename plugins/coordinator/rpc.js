// The methods the terminal UI calls and the event the server part emits.
//
// `started` fires when `/coordinator-link` starts a coordinator session. `orchestrators` lists a
// workspace's linked orchestrators for `/orchestrators`, and `orchestratorAction` unlinks,
// interrupts or archives one of them.
const directoryInput = {
  type: "object",
  properties: { directory: { type: "string" } },
  required: ["directory"],
  additionalProperties: false,
}

const orchestrator = {
  type: "object",
  properties: {
    sessionID: { type: "string" },
    plan: { type: "string" },
    title: { type: "string" },
    running: { type: "boolean" },
    hold: { type: "string" },
  },
  required: ["sessionID", "plan", "title", "running", "hold"],
  additionalProperties: false,
}

// What `/orchestrators` can do to one linked orchestrator, as the dialog offers it.
export const ORCHESTRATOR_ACTIONS = [
  { value: "unlink", title: "Unlink", description: "Stop feeding the coordinator; the session keeps working on its own" },
  { value: "interrupt", title: "Interrupt", description: "Stop its current turn" },
  { value: "archive", title: "Archive", description: "Unlink it and hide it from session lists, keeping its transcript" },
]

export const Coordinator = {
  id: "coordinator",
  methods: {
    orchestrators: {
      input: directoryInput,
      output: {
        type: "object",
        properties: {
          message: { type: "string" },
          orchestrators: { type: "array", items: orchestrator },
        },
        required: ["message", "orchestrators"],
        additionalProperties: false,
      },
    },
    orchestratorAction: {
      input: {
        type: "object",
        properties: {
          directory: { type: "string" },
          sessionID: { type: "string" },
          action: { type: "string", enum: ORCHESTRATOR_ACTIONS.map((action) => action.value) },
        },
        required: ["directory", "sessionID", "action"],
        additionalProperties: false,
      },
      output: {
        type: "object",
        properties: { message: { type: "string" } },
        required: ["message"],
        additionalProperties: false,
      },
    },
  },
  events: {
    started: {
      schema: {
        type: "object",
        properties: {
          sessionID: { type: "string" },
        },
        required: ["sessionID"],
        additionalProperties: false,
      },
    },
  },
}
