"""Link one checkout to the workflow repository and create its local state files.

Usage:
    python SETUP/setup-repo.py [checkout]
    python SETUP/setup-repo.py --check [checkout]

The shared instruction set stays in one place: ``BUILDING/``, ``PLANNING/``, ``SUBAGENTS/``, ``PUBLISHING/export.py``, ``PLANS/README.md`` and
``AGENTS.md`` become symlinks, and ``COMMANDS/`` becomes the
checkout's ``.opencode/commands``,
so editing one of them through the checkout edits the workflow repository itself. Everything that
belongs to the checkout — the plan tree, the scope fence, the orchestrator handoff, the permission
capabilities and the publishing selection — is created here as a real, editable file.

Nothing is overwritten. An item that already exists is reported and left alone, and the run exits
non-zero so a half-configured checkout is visible.

``--check`` verifies the links instead of creating them. It exists because a tool that writes by
renaming — ``sed -i``, an editor's atomic save — replaces a symlink with a regular file, which
silently detaches the checkout from the workflow while the text looks correct. It also fails on a
link whose workflow source is gone, on a missing ignore entry, and on a LOCAL slot still identical
to its template.
"""

import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

WORKFLOW = Path(__file__).resolve().parents[1]
SHARED = WORKFLOW / "AGENT-INSTRUCTIONS"
TEMPLATES = Path(__file__).resolve().parent / "LOCAL.example"
BINDINGS = WORKFLOW / "PLUGINS" / "workflow" / "bindings.default.json"

CURRENT_SCOPE = """# Current Scope

This file names the active work fence only. Git keeps history.

No active work fence. When a plan becomes active, replace this paragraph with the authorized
unit, the branch and commit rules, the protected material and the publication boundary.
"""

HANDOFF = """# Orchestrator handoff

This file is the plan orchestrator's living handoff. It is repository state: keep it out of
version control.

## Next action

## Current state

## Learned rules
"""


def plan(checkout: Path):
    """Every path this script owns, as (relative destination, source or text)."""
    instructions = checkout / "AGENT-INSTRUCTIONS"
    links = [
        (checkout / "AGENTS.md", SHARED / "AGENTS.md"),
        (instructions / "BUILDING", SHARED / "BUILDING"),
        (instructions / "PLANNING", SHARED / "PLANNING"),
        (instructions / "SUBAGENTS", SHARED / "SUBAGENTS"),
        (instructions / "PUBLISHING" / "export.py", SHARED / "PUBLISHING" / "export.py"),
        (checkout / ".opencode" / "commands", WORKFLOW / "COMMANDS"),
        (instructions / "README.md", SHARED / "README.md"),
        (instructions / "PLANS" / "README.md", SHARED / "PLANS" / "README.md"),
    ]
    files = [
        (instructions / "CURRENT-SCOPE.md", CURRENT_SCOPE),
        (instructions / "ORCHESTRATOR-HANDOFF.md", HANDOFF),
        (
            instructions / "PUBLISHING" / "selection.py",
            (SHARED / "PUBLISHING" / "selection.example.py").read_text(encoding="utf-8"),
        ),
        (
            checkout / ".opencode" / "opencode.json",
            json.dumps(
                {
                    "$schema": "https://opencode.ai/config.json",
                    # The plan loop is command session -> implementer -> reviewer, two levels deep.
                    "experimental": {"subagent_depth": 2},
                    "skills": [str(WORKFLOW / "SKILLS")],
                },
                indent=2,
            )
            + "\n",
        ),
    ]
    # Every LOCAL.example file is a slot the checkout owns: capabilities, publishing data, and the
    # documentation and gate blocks the shared text points at.
    example = TEMPLATES
    for source in sorted(example.rglob("*")):
        # README.md explains the slots to the installer; it is not a slot.
        if source.is_file() and source.name != "README.md" and "__pycache__" not in source.parts:
            relative = source.relative_to(example)
            files.append((instructions / "LOCAL" / relative, source.read_text(encoding="utf-8")))
    return links, files


def create_link(target: Path, source: Path):
    """Ensure the link exists without disturbing a correct one; this runs again on every update."""
    if not source.exists():
        return f"WRONG SOURCE (the workflow file {source} does not exist)"
    if target.is_symlink():
        current = Path(os.readlink(target))
        if current == source:
            return "ok"
        # A clone carries the previous machine's absolute link. It is this script's own link, not
        # local work, so it is repointed rather than reported.
        target.unlink()
        target.symlink_to(source)
        return f"relinked (was {current})"
    if target.exists():
        return "WRONG TYPE (a regular file, not a link)"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.symlink_to(source)
    return "linked"


def write_file(target: Path, text: str):
    """Create a missing local slot. An existing one is the checkout's own and is never touched."""
    if target.exists() or target.is_symlink():
        return "kept (already present)"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(text, encoding="utf-8")
    return "created"


def obsolete_links(checkout: Path, planned):
    """Links this script used to create and no longer plans, found by where they point.

    A file that was renamed or removed in the workflow leaves a dangling link in an existing
    checkout, and nothing else notices it. Only links that resolve inside the workflow repository
    are candidates: a link the checkout made itself is not ours to touch.
    """
    planned = {path for path, _ in planned}
    found = []
    roots = {checkout, checkout / "AGENT-INSTRUCTIONS", checkout / "AGENT-INSTRUCTIONS" / "PLANS", checkout / ".opencode"}
    for root in roots:
        if not root.is_dir():
            continue
        for entry in root.iterdir():
            if not entry.is_symlink() or entry in planned:
                continue
            target = Path(os.readlink(entry))
            resolved = Path(os.path.abspath(os.path.join(root, target)))
            # Compare whole path segments so a sibling directory sharing the prefix is not ours.
            if resolved.parts[: len(WORKFLOW.parts)] == WORKFLOW.parts:
                found.append(entry)
    return found


LINK_PATHS = (
    "AGENTS.md",
    "AGENT-INSTRUCTIONS/BUILDING",
    "AGENT-INSTRUCTIONS/PLANNING",
    "AGENT-INSTRUCTIONS/SUBAGENTS",
    "AGENT-INSTRUCTIONS/README.md",
    "AGENT-INSTRUCTIONS/PLANS/README.md",
    "AGENT-INSTRUCTIONS/PUBLISHING/export.py",
    ".opencode/commands",
)


def ensure_ignored(checkout: Path, pattern: str):
    """Keep generated output out of the checkout's history; append only, never rewrite."""
    if ignored(checkout, pattern):
        return "ok"
    ignore = checkout / ".gitignore"
    if ignore.exists():
        lines = ignore.read_text(encoding="utf-8").splitlines()
        if pattern in {line.strip() for line in lines}:
            return "ok"
        with open(ignore, "a", encoding="utf-8") as target:
            target.write(f"\n{pattern}\n")
        return f"added {pattern} to .gitignore"
    ignore.write_text(f"{pattern}\n", encoding="utf-8")
    return f"created .gitignore with {pattern}"


def ignored(checkout: Path, pattern: str):
    """Whether the checkout's .gitignore already covers a path, either spelling of the root anchor.

    A directory entry covers everything under it, so `.opencode/` covers `.opencode/commands`.
    """
    ignore = checkout / ".gitignore"
    if not ignore.exists():
        return False
    wanted = pattern.strip("/")
    entries = [
        line.strip().strip("/")
        for line in ignore.read_text(encoding="utf-8").splitlines()
        if line.strip() and not line.strip().startswith("#")
    ]
    return any(entry == wanted or wanted.startswith(f"{entry}/") for entry in entries)


def check_link(target: Path, source: Path):
    if not source.exists():
        return f"WRONG SOURCE (the workflow file {source} does not exist)"
    if not target.exists() and not target.is_symlink():
        return "missing"
    if not target.is_symlink():
        return "NOT A LINK (replaced by a regular file)"
    if Path(os.readlink(target)) != source:
        return f"points at {os.readlink(target)}"
    return "ok"


def bound_files():
    """Every file the delivery map names, as {relative path: optional in every binding}.

    The map is already the single home for what each role receives, so a file it names but the
    checkout lacks is a real breakage, and a LOCAL slot it names but the template lacks would
    silently reach new checkouts without that file.
    """
    if not BINDINGS.exists():
        return {}
    found = {}
    for entries in json.loads(BINDINGS.read_text(encoding="utf-8")).get("agents", {}).values():
        for item in entries:
            path = item.get("file")
            if path:
                found[path] = found.get(path, True) and bool(item.get("optional", False))
    return found


def main(argv):
    checking = "--check" in argv
    rest = [value for value in argv if value != "--check"]
    if len(rest) > 1:
        print("usage: setup-repo.py [--check] [checkout]", file=sys.stderr)
        return 2
    checkout = Path(rest[0]).resolve() if rest else Path.cwd()
    if not checkout.is_dir():
        print(f"{checkout}: not a directory", file=sys.stderr)
        return 2

    instructions = checkout / "AGENT-INSTRUCTIONS"
    links, files = plan(checkout)
    rows = []
    stale = obsolete_links(checkout, links)
    if checking:
        for target, source in links:
            rows.append((check_link(target, source), target))
        for target in stale:
            rows.append(("obsolete link (points into the workflow repo)", target))
        for target, text in files:
            if not target.exists():
                rows.append(("missing", target))
            elif target.read_text(encoding="utf-8") != text:
                rows.append(("local (owns its own values)", target))
            elif instructions / "LOCAL" in target.parents:
                rows.append(("NEEDS (unfilled template)", target))
            else:
                rows.append(("ok", target))
        for pattern in (*LINK_PATHS, ".opencode/"):
            if not ignored(checkout, pattern):
                rows.append((f"NEEDS (not in .gitignore: {pattern})", checkout / ".gitignore"))
        if not BINDINGS.exists():
            rows.append(("NEEDS (the delivery map is missing)", checkout / "AGENT-INSTRUCTIONS"))
        for relative, optional in bound_files().items():
            target = checkout / relative
            if not optional and not target.exists():
                rows.append(("NEEDS (file the delivery map names is missing)", target))
            if relative.startswith("AGENT-INSTRUCTIONS/LOCAL/"):
                slot = relative[len("AGENT-INSTRUCTIONS/LOCAL/"):]
                if not (TEMPLATES / slot).is_file():
                    rows.append(("NEEDS (no template for a bound slot)", target))
        assets = instructions / "PUBLISHING" / "public-assets"
        if not assets.is_dir():
            rows.append(("NEEDS (publishing assets directory missing)", assets))
    else:
        for target, source in links:
            rows.append((create_link(target, source), target))
        for target, text in files:
            rows.append((write_file(target, text), target))
        for target in stale:
            target.unlink()
            rows.append(("removed (obsolete link)", target))
        (checkout / "AGENT-INSTRUCTIONS" / "PUBLISHING" / "public-assets").mkdir(parents=True, exist_ok=True)
        for pattern in LINK_PATHS:
            rows.append((ensure_ignored(checkout, f"/{pattern}"), checkout / ".gitignore"))
        rows.append((ensure_ignored(checkout, ".opencode/"), checkout / ".gitignore"))

    width = max(len(str(path.relative_to(checkout))) for _, path in rows)
    failures = 0
    for action, path in rows:
        print(f"{action:<44} {str(path.relative_to(checkout)):<{width}}")
        if action.startswith(("WRONG", "NOT A LINK", "missing", "obsolete", "NEEDS")):
            failures += 1

    if checking:
        bindings = WORKFLOW / "PLUGINS" / "workflow" / "bindings.json"
        registered = bindings.exists() and str(checkout) in json.loads(
            bindings.read_text(encoding="utf-8")
        ).get("workspaces", [])
        if not registered:
            print(f"NEEDS    {checkout} is not registered in {bindings.relative_to(WORKFLOW)}; the plugin injects nothing")
            failures += 1
        local_config = checkout / ".opencode" / "opencode.json"
        if local_config.exists() and str(WORKFLOW / "SKILLS") not in local_config.read_text(encoding="utf-8"):
            print(f"NEEDS    {local_config.relative_to(checkout)} has no skills source")
            failures += 1
        return 1 if failures else 0

    bindings = WORKFLOW / "PLUGINS" / "workflow" / "bindings.json"
    entry = str(checkout)
    if bindings.exists():
        config = json.loads(bindings.read_text(encoding="utf-8"))
    else:
        config = {"workspaces": []}
    workspaces = config.setdefault("workspaces", [])
    if entry not in workspaces:
        workspaces.append(entry)
        bindings.parent.mkdir(parents=True, exist_ok=True)
        bindings.write_text(json.dumps(config, indent=2) + "\n", encoding="utf-8")
        print(f"registered {entry} in {bindings.relative_to(WORKFLOW)}")
    else:
        print(f"already registered {entry}")

    print()
    sys.stdout.flush()
    stamped = subprocess.run(
        [sys.executable, str(checkout / "AGENT-INSTRUCTIONS" / "SUBAGENTS" / "gen_agents.py")],
        cwd=checkout,
        check=False,
    )
    if stamped.returncode != 0:
        print("agent generation failed; the generator's error above names the file to fix", file=sys.stderr)
        return 1

    local_config = checkout / ".opencode" / "opencode.json"
    if local_config.exists() and str(WORKFLOW / "SKILLS") not in local_config.read_text(encoding="utf-8"):
        print()
        print(f"note: add the skills source to {local_config.relative_to(checkout)}:")
        print(f'  {{ "skills": ["{WORKFLOW / "SKILLS"}"] }}')
    print()
    print("Re-run this script to update the checkout: existing links and LOCAL slots are left alone.")
    print("Agents are denied sed -i and perl -i here; run --check after any editor or script touched shared text.")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
