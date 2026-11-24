## 1. What this repo is

<One paragraph: the product, its users, its stack, and where each concern lives. Name the
workspace's experiment directory here when it has one, because REPO-RULES §0a refers to this
section for it.>

---

## 2. Hard invariants: never violate

These bind product code. Experiments follow only the binding list in `REPO-RULES.md` §0a.

One numbered invariant per rule. Keep the numbers stable: shared `REPO-RULES.md` refers to them,
and the roles that receive this file select §1, §2 and §3 by number, so those three headings must
stay even when a section is short. When a section would be empty, write one line saying the
workspace adds no rule there.

1. <The invariant, stated so a reviewer can tell a violation from a valid implementation.>
2. <The next invariant.>
3. <The next invariant.>

If a task seems to require violating an invariant, stop and ask.

---

## 3. Code style and documentation

<The workspace's structural rules: the package layout, where each concern lives, the files split by
feature, and the documentation areas. Delete a line that does not apply.>

---

## Test and review exceptions

- **What to test here.** <The user-visible or data-integrity behaviors this workspace must prove.>
- <An authorized exception: what it allows, why the user granted it, and what it does not change.>
