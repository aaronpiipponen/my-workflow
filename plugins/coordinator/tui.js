// Open a newly started coordinator session in the terminal UI, and run the `/orchestrators` dialog.
import { Coordinator, ORCHESTRATOR_ACTIONS } from "./rpc.js"

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

// List the workspace's linked orchestrators, then act on the one the user picks.
async function manageOrchestrators(context) {
  const rpc = context.client.rpc(Coordinator)
  const directory = await sessionDirectory(context)
  const options = { location: { directory } }
  try {
    const { message, orchestrators } = await rpc.orchestrators({ directory }, options)
    if (!orchestrators.length) {
      context.ui.toast.show({ message })
      return
    }
    const sessionID = await context.ui.dialog.select({
      title: "Linked orchestrators",
      options: orchestrators.map((row) => ({
        value: row.sessionID,
        title: `${row.plan}: ${row.running ? "running" : "idle"}, ${row.hold}`,
        description: `${row.title} (${row.sessionID})`,
      })),
    })
    if (!sessionID) return
    const action = await context.ui.dialog.select({ title: "Orchestrator action", options: ORCHESTRATOR_ACTIONS })
    if (!action) return
    const result = await rpc.orchestratorAction({ directory, sessionID, action }, options)
    context.ui.toast.show({ message: result.message })
  } catch (error) {
    context.ui.toast.show({ message: `The orchestrators dialog failed: ${error?.message ?? error}` })
  }
}

export default {
  id: "coordinator.tui",
  setup(context) {
    if (typeof context?.client?.rpc !== "function" || typeof context?.ui?.router?.navigate !== "function") return
    if (typeof context.keymap?.layer === "function" && typeof context.ui.dialog?.select === "function") {
      context.keymap.layer(() => ({
        mode: "global",
        commands: [
          {
            id: "coordinator.orchestrators",
            title: "Manage the linked plan orchestrators",
            slash: { name: "orchestrators" },
            run: () => manageOrchestrators(context),
          },
        ],
      }))
    }
    const stop = context.client.rpc(Coordinator).events.on("started", (event) => {
      const sessionID = event?.data?.sessionID
      if (!sessionID) return
      // Only the terminal showing the linking session's workspace follows the event.
      const route = context.ui.router.current()
      const current = route?.type === "session" ? context.data.session.get(route.sessionID) : undefined
      const directory = current?.location?.directory ?? context.location.directory
      if (event.location?.directory && event.location.directory !== directory) return
      context.ui.router.navigate({ type: "session", sessionID })
    })
    return () => stop()
  },
}
