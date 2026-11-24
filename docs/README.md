# Documentation

This documentation covers my-workflow: how to use it, how it behaves, how it is built, how to set it up, and the test runs that exercised it.

| Page | What it covers |
|---|---|
| [User guide](/docs/user-guide.md) | Working with plan orchestrators, running plans in parallel under the coordinator, and releasing plans |
| [Workspace and sessions](/docs/technical/workspace.md) | How the instructions reach a session, the workspace layout, the roles, plans, phases and phase ids |
| [Coordination](/docs/technical/coordination.md) | The coordinator, its feed, holds, the channel, resolution phases and shared-resource locks |
| [Release and hotfix](/docs/technical/release.md) | The release's review, the merge into the integration branch, plan closure and the hotfix |
| [Developer guide](/docs/developer.md) | The plugins, the bindings map, the state files and the tests |
| [Setup](/docs/setup.md) | Installing the workflow, setting up a workspace and running a toy test |
| [Toy runs](/docs/experiments/toy-runs.md) | What each test run of the toy project tried, what it showed and where it fell short |

The diagrams are under `docs/assets/diagrams/`, the screenshot and its capture script under `docs/assets/screenshots/` and `docs/assets/capture/`, and the logo under `docs/brand/`.
