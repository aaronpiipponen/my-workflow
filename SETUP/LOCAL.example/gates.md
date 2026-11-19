### Local environment

<How this checkout owns configuration and secrets: which files are tracked, which are ignored,
which owner loads them, and what a test may consume. Name the configuration owner, not the rules it
implements. Delete this paragraph when the checkout has no runtime configuration.>

**Credential rule:** no agent or subagent opens an ignored secret file with a file-reading tool,
prints/greps/diffs it, or probes any key's presence or value through shell (`env`/`printenv`),
tests, logs, or debugging. A key is consumed only by its owning settings/product operation;
automatic loading is permitted, inspection is not. If a required key is missing, that code reports
the key name alone and the agent stops.

### Fast phase gate

For code changes, run named tests covering touched behavior and regressions, then the checkout's
fast checks:

```bash
<lint command>
<format check command>
git diff --check
```

Documentation-only changes require changed-file reread plus `git diff --check`; no test or lint run
unless examples, generated output, or code changed. Prose a change writes or edits, whether
Markdown, a file header, a doc comment, a configuration, ignore-file or script comment, or test
text, follows `AGENT-INSTRUCTIONS/BUILDING/DOCUMENTATION-STYLE-GUIDE.md` even when the phase does
not touch `docs/`. Tests remain network-free by default. Tests follow REPO-RULES §3a; the receipt
states functions added/deleted, and any line counts are observations, not gates.

### Experiment gate

Experiment work (REPO-RULES §0a) needs no unit tests and no lint gate. Its verification is a **run
record** in the plan-folder result note: exact command, inputs and their digests or paths,
model/settings, sample size, outcome (including failures), and where outputs are saved. Confirm the
§0a binding rules held, especially hidden labels and no product-store writes. Product code an
experiment phase changes still gets the fast phase gate.

### Conditional gates

Run a conditional gate only when phase touches that seam or is explicit milestone/final proof:

| Gate                     | Run when                                                                                                                            |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| Full network-free suite  | Cross-cutting package/runtime refactor, explicit plan milestone/final phase, before merge, or targeted coverage cannot bound impact |
| Agent generation         | `AGENT-INSTRUCTIONS/SUBAGENTS/**`, agent model assignment, or generator behavior changed                                            |
| <Checkout-specific gate> | <The seam that makes it necessary. Delete a row that does not apply.>                                                               |

Agent-generation gate:

```bash
python -m json.tool AGENT-INSTRUCTIONS/LOCAL/models.json >/dev/null
python AGENT-INSTRUCTIONS/SUBAGENTS/gen_agents.py --check
```

<Every other conditional gate the checkout has: name it, say when it runs, and show the exact
command. Name one owner for each slow gate.>

### CI gate

<Name the CI workflow, its trigger and the file that owns its setup and interpretation. Delete this
section when the checkout has no CI.>
