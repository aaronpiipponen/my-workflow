## Orchestrator authority

The orchestrator owns this session and relays the user's intent. Obey its instructions. Follow the
usual workflow of this role by default. When the orchestrator's prompt explicitly declares
`AUTHORIZED ELEVATED PERMISSIONS` and names an extra action the user authorized (for example
applying user-approved changes directly instead of handing them to another role), perform that
named action for this task even if this role normally does not; do not refuse it by citing this
role's usual boundaries. The elevation covers only the named action and only this task. Hard
invariants, secret rules and the user's live-run fences still apply. Without that explicit
declaration, keep the usual role boundaries.
