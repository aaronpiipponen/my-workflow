// Run the `/plan-new` and `/shadow-plan` dialogs and the `/plan` plan picker in the terminal UI.
import { Workflow } from "./rpc.js"

// The RPC lives in the project of the session's directory, which differs from the terminal's
// location when a session was opened with Ctrl+O from another folder. Send it there. The session
// store holds the current project's sessions, so another project's session is read from the API.
async function sessionDirectory(context) {
  const route = context.ui.router.current()
  const sessionID = route?.type === "session" ? route.sessionID : undefined
  const known = sessionID ? context.data.session.get(sessionID) : undefined
  if (known?.location?.directory) return known.location.directory
  if (!sessionID) return context.location.directory
  try {
    const session = await context.client.session.get({ sessionID }, { location: { directory: context.location.directory } })
    return session?.location?.directory ?? context.location.directory
  } catch {
    return context.location.directory
  }
}

// Ask for the new plan's name and create its branch, worktree and plan folder. A shadow plan starts
// from the filled one-phase templates and opens its working session.
async function planNew(context, kind) {
  const shadow = kind === "shadow"
  const name = await context.ui.dialog.prompt({
    title: shadow ? "Create a shadow plan" : "Create a plan",
    description: "The name becomes the plan's branch, its worktree folder and its folder under PLANS/.",
    placeholder: shadow ? `shadow-${new Date().toISOString().slice(0, 10)}` : "plan name",
  })
  if (!name?.trim()) {
    context.ui.toast.show({ message: "No name entered. The command was cancelled." })
    return
  }
  const directory = await sessionDirectory(context)
  try {
    const result = await context.client.rpc(Workflow).planNew({ directory, name: name.trim(), kind }, { location: { directory } })
    context.ui.toast.show({ message: result.message })
  } catch (error) {
    context.ui.toast.show({ message: `/${shadow ? "shadow-plan" : "plan-new"} failed: ${error?.message ?? error}` })
  }
}

export default {
  id: "workflow.tui",
  setup(context) {
    if (typeof context?.client?.rpc !== "function" || typeof context?.keymap?.layer !== "function") return
    if (typeof context.ui?.dialog?.prompt !== "function" || typeof context.ui.dialog.select !== "function") return
    context.keymap.layer(() => ({
      mode: "global",
      commands: [
        {
          id: "workflow.plan-new",
          title: "Create a plan: its branch, worktree and plan folder",
          slash: { name: "plan-new" },
          run: () => planNew(context, "plan"),
        },
        {
          id: "workflow.shadow-plan",
          title: "Create a shadow plan: one cleanup phase, its branch and worktree, and its working session",
          slash: { name: "shadow-plan" },
          run: () => planNew(context, "shadow"),
        },
      ],
    }))
    const picker = context.client.rpc(Workflow).events.on("pickPlan", async (event) => {
      const { sessionID, plans, action } = event?.data ?? {}
      // Only the terminal showing the session that ran the command offers the picker.
      const route = context.ui.router.current()
      if (!sessionID || route?.type !== "session" || route.sessionID !== sessionID) return
      if (!plans?.length) {
        context.ui.toast.show({ message: "This workspace has no plan yet; create one with /plan-new." })
        return
      }
      const command = action === "release" ? "release" : "plan"
      const plan = await context.ui.dialog.select({
        title: command === "release" ? "Choose the plan to release" : "Choose the plan to orchestrate",
        options: plans.map((name) => ({ value: name, title: name })),
      })
      if (!plan) return
      const directory = await sessionDirectory(context)
      try {
        await context.client.session.command({ sessionID, name: command, text: plan }, { location: { directory } })
      } catch (error) {
        context.ui.toast.show({ message: `/${command} ${plan} failed: ${error?.message ?? error}` })
      }
    })
    // The command starts its plan or release in a new session; open it here.
    const started = context.client.rpc(Workflow).events.on("started", (event) => {
      const sessionID = event?.data?.sessionID
      if (sessionID) context.ui.router.navigate({ type: "session", sessionID })
    })
    return () => {
      picker()
      started()
    }
  },
}
