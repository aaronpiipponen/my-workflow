# PLANNING — turning requirements into implementable phases

Authoring and detailing plans. Executing a detailed phase is a build activity, not a
planning one: `../BUILDING/WORKING-FROM-PLANS.md`.

**Before authoring anything, read `../BUILDING/REPO-RULES.md`.** Its no-hack /
read-before-write discipline IS the authoring mentality: do not invent files, signatures,
routes, tables, or scope; read the real code first and stop-and-ask when a named thing
does not exist. A plan that defers cleanly beats one that papers over unknowns.

## Pick your task — then read the matching guide before you act

You are not ready to write until you have read the guide for what you are doing:

- **Turning requirements into a plan?** → read **`PLAN-AUTHORING-SCOPING.md`** first.
  If the idea is still fuzzy, start with that guide's research pass before writing the
  plan. Output: small, ordered, intentionally-vague TODO phases + a status table in
  `PLANS/<slug>/full-plan.md`. No implementation detail yet.
- **Making one phase implementable?** → read **`PLAN-PHASE-DETAILING.md`** and copy
  **`phase-template.md`**. The phase must name real files, signatures, callers,
  migrations, and tests so a weak model invents nothing. If you cannot write that from the
  code, you are not done reading the code.
- **A phase failed its retest?** → read **`PLAN-PHASE-REMEDIATION.md`**. Keep the working
  parts, re-detail the fix in place to full grade. Do not restart; do not just append a
  bug list.

## Cross-references

- Plan-folder convention (what to load, never a monolith): `../PLANS/README.md`.
- Executing a detailed phase: `../BUILDING/WORKING-FROM-PLANS.md`.
- Documentation: `../BUILDING/DOCUMENTATION-WORKFLOW.md` owns how docs change with
  behavior, `../BUILDING/RELEASE-WORKFLOW.md` owns the release that follows a plan; `../BUILDING/DOCUMENTATION-STYLE-GUIDE.md`
  owns the text. A detailed phase names the pages to create, update or delete.
- Read-only and serial phase-workflow subagents: `../SUBAGENTS/README.md`.
- User-only chat prompts: the `/plan` and `/release` commands, run in the user's own session. Agents
  use the role instructions above rather than treating those prompts as workflow dependencies.
