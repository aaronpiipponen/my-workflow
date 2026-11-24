## Tools

<Name the workspace's documentation tooling here, or empty this file when it has none.
The commands below are the shape the workflow expects; replace each with the workspace's own, and
add each to the writer's shell capability in `AGENT-INSTRUCTIONS/LOCAL/workflow.toml`.>

```bash
# Structure, links, anchors, diagrams and charts over the pages under review. Renders SVGs to PNG.
<checker command> <path> ...

# Generate a chart from its data file, writing the SVG beside it.
<chart command> <data file> ...

# Render one SVG, such as a logo candidate or a diagram, to a PNG at a pixel size.
AGENT-INSTRUCTIONS/TOOLS/render-svg <svg file> <png file> <width> <height>

# Retake one screenshot, or every screenshot, with its own capture script.
<capture command> <screenshot-name|--all>

# Checks over every published documentation page.
<published-page check command> <address>
```

### The example instance

<Delete this section when the workspace has no separate review instance. Otherwise name the
instance, the addresses a capture or check may use, how it is brought up to the code under review,
and what it must never touch. A capture source is never a live or production deployment.>

### The private server

<Delete this section when the workspace has no private deployment. Otherwise name how it is
refreshed after an export, and the command that the user checks the changes on.>

The browser and checker commands read the workspace's documentation index and accept the repository
root and base address the workspace defines. Each tool prints `--help`. A checker fails closed: a
browser that cannot launch and any measured text overflow are defects, not warnings. Rendered
previews go outside the repository.
