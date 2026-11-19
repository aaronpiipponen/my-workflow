## Tools

<Name the checkout's documentation tooling here, or state that it has none and delete this file.
The commands below are the shape the workflow expects; replace each with the checkout's own, and
add each to the writer's shell capability in `AGENT-INSTRUCTIONS/LOCAL/workflow.toml`.>

```bash
# Structure, links, anchors, diagrams and charts over the pages under review. Renders SVGs to PNG.
<checker command> <path> ...

# Generate a chart from its data file, writing the SVG beside it.
<chart command> <data file> ...

# Retake one screenshot, or every screenshot, with its own capture script.
<capture command> <screenshot-name|--all>

# Checks over every published documentation page.
<published-page check command> <address>
```

### The example instance

<Delete this section when the checkout has no separate review instance. Otherwise name the
instance, the addresses a capture or check may use, how it is brought up to the code under review,
and what it must never touch. A capture source is never a live or production deployment.>

### The private server

<Delete this section when the checkout has no private deployment. Otherwise name how it is
refreshed after an export, and the command that the user checks the changes on.>

The browser and checker commands read the checkout's documentation index and accept the repository
root and base address the checkout defines. Each tool prints `--help`. A checker fails closed: a
browser that cannot launch and any measured text overflow are defects, not warnings. Rendered
previews go outside the repository.
