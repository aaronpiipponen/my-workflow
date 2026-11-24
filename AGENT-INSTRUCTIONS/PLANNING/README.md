# PLANNING — turning requirements into implementable phases

Authoring and detailing plans. Each file below owns one activity and is the source of truth the
workflow plugin delivers. Executing a detailed phase is a build activity, not a planning one:
`../BUILDING/WORKING-FROM-PLANS.md`.

The repository rules' no-hack / read-before-write discipline is the authoring mentality: do not
invent files, signatures, routes, tables or scope; read the real code first and stop and ask when a
named thing does not exist. A plan that defers cleanly beats one that papers over unknowns.

## The files

- **`PLAN-AUTHORING-SCOPING.md`** — turning requirements into a plan, with a research pass first
  when the idea is still fuzzy. Output: small, ordered, intentionally vague TODO phases and a status
  table in `PLANS/<slug>/full-plan.md`, with no implementation detail yet. Injected into the
  `/plan` session; the `plan-authoring` skill elsewhere.
- **`PLAN-PHASE-DETAILING.md`** and **`phase-template.md`** — making one phase implementable: the
  phase names real files, signatures, callers, migrations and tests so a weak model invents
  nothing. The `plan-detailing` skill, loaded by the phase advancer before it details; create the
  phase file with the `phase_new` tool. The phase spec auditor receives the detail bar, the
  no-invention protocol and the template by injection.
- **`plan-templates/`** — the starting `full-plan.md`, `scope.md` and `handoff.md` of a new plan,
  with `{plan}` standing for its name. `/plan-new` writes them into the new plan folder.
- **`PLAN-PHASE-REMEDIATION.md`** — a phase that failed its retest: keep the working parts and
  re-detail the fix in place to full grade. The `plan-remediation` skill.

## Cross-references

- Plan-folder convention (what to load, never a monolith): `../PLANS/README.md`.
- Documentation: `../BUILDING/DOCUMENTATION-WORKFLOW.md` owns how docs change with behavior,
  `../BUILDING/RELEASE-WORKFLOW.md` owns the release that follows a plan, and
  `../BUILDING/DOCUMENTATION-STYLE-GUIDE.md` owns the text. A detailed phase names the pages to
  create, update or delete.
- Read-only and serial phase-workflow subagents: `../SUBAGENTS/README.md`.
- The `/plan` and `/release` commands are run by the user in their own session; the plugin marks
  that session's role and injects its files. Agents use their injected rules rather than treating
  those prompts as workflow dependencies.
