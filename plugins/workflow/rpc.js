// The method the terminal UI calls for `/plan-new` and `/shadow-plan`, and the event that asks it to
// pick a plan.
//
// `pickPlan` fires when `/plan` runs in the workspace root without a plan name; the terminal UI
// showing that session offers the plans and runs `/plan <name>` with the choice.
export const Workflow = {
  id: "workflow",
  methods: {
    planNew: {
      input: {
        type: "object",
        properties: { directory: { type: "string" }, name: { type: "string" }, kind: { type: "string", enum: ["plan", "shadow"] } },
        required: ["directory", "name"],
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
        properties: { sessionID: { type: "string" } },
        required: ["sessionID"],
        additionalProperties: false,
      },
    },
    pickPlan: {
      schema: {
        type: "object",
        properties: {
          sessionID: { type: "string" },
          plans: { type: "array", items: { type: "string" } },
          action: { type: "string", enum: ["plan", "release"] },
        },
        required: ["sessionID", "plans", "action"],
        additionalProperties: false,
      },
    },
  },
}
