"""Link one workspace to the workflow repository and create its local state files.

Usage:
    python setup/setup-workspace.py [workspace]
    python setup/setup-workspace.py --check [workspace]

A workspace root holds the shared instructions, every plan's working state and one Git worktree per
plan:

    <workspace>/
      AGENT-INSTRUCTIONS/   shared text (links), LOCAL/ and PLANS/
      AGENTS.md             link to the shared bootstrap
      .opencode/            the workspace's OpenCode config and stamped agents
      project.git/          bare project repository
      <worktree>/           one per branch: main for the release, one per plan

The shared instruction set stays in one place: ``BUILDING/``, ``PLANNING/``, ``SUBAGENTS/``,
``PUBLISHING/export.py``, ``PLANS/README.md`` and ``AGENTS.md`` become symlinks, so editing one of
them edits the workflow repository itself. Everything the workspace owns (the plan folders, the
permission capabilities and the publishing selection) is created here as a real, editable file.

The root is its own Git repository. Its ``.gitignore`` tracks only ``AGENT-INSTRUCTIONS/`` minus the
links, so the workflow plugin's automatic commits keep the plans' history and never touch the
project repository or the worktrees. Every worktree of ``project.git`` below the root receives
``AGENTS.md`` and ``AGENT-INSTRUCTIONS`` as links to the root, listed in the project repository's
``info/exclude`` so they are never committed. ``/plan-new`` creates a plan's branch and worktree and
runs this script again to link it; a worktree made by hand with
``git -C project.git worktree add ../<plan> -b <plan> <integration branch>`` needs the same rerun.

Nothing is overwritten. An item that already exists is reported and left alone, and the run exits
non-zero so a half-configured workspace is visible.

``--check`` verifies the links instead of creating them. It exists because a tool that writes by
renaming (``sed -i``, an editor's atomic save) replaces a symlink with a regular file, which
silently detaches the workspace from the workflow while the text looks correct. It also fails on a
link whose workflow source is gone, on a path the root repository does not ignore, on a LOCAL slot
still identical to its template, on a section of a LOCAL slot that no role receives, on a relative
link in a LOCAL slot that resolves to nothing, and on generated agents older than their sources.
"""

import json
import os
import re
import subprocess
import sys
from pathlib import Path

WORKFLOW = Path(__file__).resolve().parents[1]
SHARED = WORKFLOW / "AGENT-INSTRUCTIONS"
TEMPLATES = Path(__file__).resolve().parent / "local.example"
BINDINGS = WORKFLOW / "plugins" / "workflow" / "bindings.default.json"
PROJECT = "project.git"

LINK_PATHS = (
    "AGENTS.md",
    "AGENT-INSTRUCTIONS/BUILDING",
    "AGENT-INSTRUCTIONS/PLANNING",
    "AGENT-INSTRUCTIONS/SUBAGENTS",
    "AGENT-INSTRUCTIONS/TOOLS",
    "AGENT-INSTRUCTIONS/README.md",
    "AGENT-INSTRUCTIONS/PLANS/README.md",
    "AGENT-INSTRUCTIONS/PUBLISHING/export.py",
)

# Track the instruction tree only; the links, the project repository and the worktrees stay out.
ROOT_IGNORE = "\n".join(
    [
        "/*",
        "!/.gitignore",
        "!/AGENT-INSTRUCTIONS/",
        *(f"/{path}" for path in LINK_PATHS if path.startswith("AGENT-INSTRUCTIONS/")),
        "__pycache__/",
        "",
    ]
)

# The two paths each worktree links to the root.
WORKTREE_LINKS = ("AGENTS.md", "AGENT-INSTRUCTIONS")

# A level-two heading and its optional number, read the way the workflow plugin's splitSections
# addresses a bound section: by number when it has one, and by title.
SECTION_HEADING = re.compile(r"^##\s+(.+)$")
NUMBERED_HEADING = re.compile(r"^(\d+[a-z]?)\.\s+(.*)$")
# A Markdown link target without its anchor.
LINK_TARGET = re.compile(r"\]\(([^)#\s]+)(?:#[^)]*)?\)")


def git(*args, cwd: Path):
    return subprocess.run(["git", *args], cwd=cwd, check=True, capture_output=True, text=True).stdout


def plan(root: Path):
    """Every path this script owns in the root, as (destination, source or text)."""
    instructions = root / "AGENT-INSTRUCTIONS"
    links = [(root / relative, SHARED / relative.removeprefix("AGENT-INSTRUCTIONS/")) for relative in LINK_PATHS]
    files = [
        (
            instructions / "PUBLISHING" / "selection.py",
            (SHARED / "PUBLISHING" / "selection.example.py").read_text(encoding="utf-8"),
        ),
        (
            root / ".opencode" / "opencode.json",
            json.dumps(
                {
                    "$schema": "https://opencode.ai/config.json",
                    # The plan loop is command session -> implementer -> reviewer, two levels deep.
                    "experimental": {"subagent_depth": 2},
                },
                indent=2,
            )
            + "\n",
        ),
        (root / ".gitignore", ROOT_IGNORE),
    ]
    # Every local.example file is a slot the workspace owns: capabilities, publishing data, and the
    # documentation and gate blocks the shared text points at.
    for source in sorted(TEMPLATES.rglob("*")):
        # README.md explains the slots to the installer; it is not a slot.
        if source.is_file() and source.name != "README.md" and "__pycache__" not in source.parts:
            relative = source.relative_to(TEMPLATES)
            files.append((instructions / "LOCAL" / relative, source.read_text(encoding="utf-8")))
    return links, files


def worktrees(root: Path):
    """Every worktree of the root's project repository that lies below the root."""
    project = root / PROJECT
    if not project.is_dir():
        return []
    found = []
    for line in git("worktree", "list", "--porcelain", cwd=project).splitlines():
        if line.startswith("worktree "):
            path = Path(line[len("worktree "):])
            if path != project and path.parent == root:
                found.append(path)
    return found


def worktree_links(root: Path, worktree: Path):
    return [(worktree / "AGENTS.md", SHARED / "AGENTS.md"), (worktree / "AGENT-INSTRUCTIONS", root / "AGENT-INSTRUCTIONS")]


def create_link(target: Path, source: Path):
    """Ensure the link exists without disturbing a correct one; this runs again on every update."""
    if not source.exists():
        return f"WRONG SOURCE ({source} does not exist)"
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


def check_link(target: Path, source: Path):
    if not source.exists():
        return f"WRONG SOURCE ({source} does not exist)"
    if not target.exists() and not target.is_symlink():
        return "missing"
    if not target.is_symlink():
        return "NOT A LINK (replaced by a regular file)"
    if Path(os.readlink(target)) != source:
        return f"points at {os.readlink(target)}"
    return "ok"


def write_file(target: Path, text: str):
    """Create a missing local slot. An existing one is the workspace's own and is never touched."""
    if target.exists() or target.is_symlink():
        return "kept (already present)"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(text, encoding="utf-8")
    return "created"


def obsolete_links(root: Path, planned):
    """Links this script used to create and no longer plans, found by where they point.

    A file that was renamed or removed in the workflow leaves a dangling link in an existing
    workspace, and nothing else notices it. Only links that resolve inside the workflow repository
    are candidates: a link the workspace made itself is not ours to touch.
    """
    planned = {path for path, _ in planned}
    found = []
    for folder in (root, root / "AGENT-INSTRUCTIONS", root / "AGENT-INSTRUCTIONS" / "PLANS", root / ".opencode"):
        if not folder.is_dir():
            continue
        for entry in folder.iterdir():
            if not entry.is_symlink() or entry in planned:
                continue
            resolved = Path(os.path.abspath(os.path.join(folder, os.readlink(entry))))
            # Compare whole path segments so a sibling directory sharing the prefix is not ours.
            if resolved.parts[: len(WORKFLOW.parts)] == WORKFLOW.parts:
                found.append(entry)
    return found


def exclude_file(worktree: Path):
    """The project repository's exclude file, which every worktree shares."""
    common = Path(git("rev-parse", "--git-common-dir", cwd=worktree).strip())
    return (common if common.is_absolute() else worktree / common) / "info" / "exclude"


def ensure_excluded(worktree: Path):
    """Keep the worktree links out of the project's history; append only, never rewrite."""
    exclude = exclude_file(worktree)
    lines = exclude.read_text(encoding="utf-8").splitlines() if exclude.exists() else []
    missing = [f"/{name}" for name in WORKTREE_LINKS if f"/{name}" not in lines]
    if not missing:
        return "ok"
    exclude.parent.mkdir(parents=True, exist_ok=True)
    with open(exclude, "a", encoding="utf-8") as target:
        target.write("".join(f"{line}\n" for line in missing))
    return f"excluded {', '.join(missing)}"


def unignored(root: Path, paths):
    """The paths the root repository would track although they must stay out of it."""
    result = subprocess.run(
        ["git", "check-ignore", "--no-index", "--stdin"],
        cwd=root,
        input="".join(f"{path.relative_to(root)}\n" for path in paths),
        capture_output=True,
        text=True,
    )
    # Exit 1 means nothing matched, which is a result, not a failure.
    if result.returncode not in (0, 1):
        raise SystemExit(f"git check-ignore failed in {root}: {result.stderr.strip()}")
    ignored = {root / line for line in result.stdout.splitlines()}
    return [path for path in paths if path not in ignored]


def bound_files():
    """Every file the delivery map names, as {relative path: optional in every binding}.

    The map is already the single home for what each role receives, so a file it names but the
    workspace lacks is a real breakage, and a LOCAL slot it names but the template lacks would
    silently reach new workspaces without that file. A path naming `{plan}` is per plan and is
    checked by the plan, not here.
    """
    found = {}
    for entries in json.loads(BINDINGS.read_text(encoding="utf-8")).get("agents", {}).values():
        for item in entries:
            path = item.get("file")
            if path and "{plan}" not in path:
                found[path] = found.get(path, True) and bool(item.get("optional", False))
    return found


def bound_sections():
    """Every LOCAL slot the delivery map names, as {relative path: the section ids it delivers}.

    A slot that any binding delivers whole maps to None, because every section reaches someone.
    """
    found = {}
    config = json.loads(BINDINGS.read_text(encoding="utf-8"))
    for group in ("agents", "roles"):
        for entries in config.get(group, {}).values():
            for item in entries:
                path = item.get("file", "")
                if not path.startswith("AGENT-INSTRUCTIONS/LOCAL/"):
                    continue
                ids = item.get("sections")
                if ids is None or (path in found and found[path] is None):
                    found[path] = None
                else:
                    found[path] = found.get(path, set()) | {value.lower() for value in ids}
    return found


def section_headings(text: str):
    """Each level-two heading with the ids it answers to: its title, and its number when it has one."""
    headings = []
    for line in text.splitlines():
        match = SECTION_HEADING.match(line)
        if not match:
            continue
        numbered = NUMBERED_HEADING.match(match.group(1))
        title = (numbered.group(2) if numbered else match.group(1)).strip().lower()
        headings.append((match.group(1), {title, *([numbered.group(1)] if numbered else [])}))
    return headings


def registered(root: Path):
    bindings = WORKFLOW / "plugins" / "workflow" / "bindings.json"
    return bindings, bindings.exists() and str(root) in json.loads(bindings.read_text(encoding="utf-8")).get("workspaces", [])


def check(root: Path, links, files, stale, trees):
    rows = []
    for target, source in links:
        rows.append((check_link(target, source), target))
    for target in stale:
        rows.append(("obsolete link (points into the workflow repo)", target))
    for target, text in files:
        if not target.exists():
            rows.append(("missing", target))
        elif not target.read_text(encoding="utf-8").strip():
            rows.append(("unused (emptied by the workspace)", target))
        elif target.read_text(encoding="utf-8") != text:
            rows.append(("local (owns its own values)", target))
        elif root / "AGENT-INSTRUCTIONS" / "LOCAL" in target.parents:
            rows.append(("NEEDS (unfilled template)", target))
        else:
            rows.append(("ok", target))
    for tree in trees:
        for target, source in worktree_links(root, tree):
            rows.append((check_link(target, source), target))
        lines = exclude_file(tree).read_text(encoding="utf-8").splitlines() if exclude_file(tree).exists() else []
        for name in WORKTREE_LINKS:
            if f"/{name}" not in lines:
                rows.append((f"NEEDS (not in the project's info/exclude: /{name})", tree))
    if not (root / ".git").exists():
        rows.append(("NEEDS (the root is not a Git repository)", root))
    else:
        kept_out = [root / PROJECT, *trees, *(target for target, _ in links if target.parent != root)]
        for path in unignored(root, [path for path in kept_out if path.exists() or path.is_symlink()]):
            rows.append(("NEEDS (the root repository does not ignore it)", path))
    for relative, optional in bound_files().items():
        target = root / relative
        if not optional and not target.exists():
            rows.append(("NEEDS (file the delivery map names is missing)", target))
        elif not optional and target.is_file() and not target.read_text(encoding="utf-8").strip():
            rows.append(("NEEDS (file the delivery map requires is empty)", target))
        if relative.startswith("AGENT-INSTRUCTIONS/LOCAL/"):
            if not (TEMPLATES / relative[len("AGENT-INSTRUCTIONS/LOCAL/"):]).is_file():
                rows.append(("NEEDS (no template for a bound slot)", target))
    for relative, ids in bound_sections().items():
        target = root / relative
        if ids is None or not target.is_file():
            continue
        for heading, keys in section_headings(target.read_text(encoding="utf-8")):
            if not keys & ids:
                rows.append((f"NEEDS (no role receives the section '{heading}')", target))
    local = root / "AGENT-INSTRUCTIONS" / "LOCAL"
    for slot in sorted(local.glob("*.md")) if local.is_dir() else []:
        # A site-absolute link ("/docs/...") describes the documentation set, not a path from the slot.
        for link in LINK_TARGET.findall(slot.read_text(encoding="utf-8")):
            relative = "://" not in link and not link.startswith(("/", "mailto:"))
            if relative and not (slot.parent / link).exists():
                rows.append((f"NEEDS (link to a missing path: {link})", slot))
    generator = root / "AGENT-INSTRUCTIONS" / "SUBAGENTS" / "gen_agents.py"
    if generator.exists():
        stale = subprocess.run([sys.executable, str(generator), "--check"], cwd=root, capture_output=True, text=True)
        if stale.returncode != 0:
            rows.append(("NEEDS (generated agents differ from their sources; run gen_agents.py)", root / ".opencode"))
    assets = root / "AGENT-INSTRUCTIONS" / "PUBLISHING" / "public-assets"
    if not assets.is_dir():
        rows.append(("NEEDS (publishing assets directory missing)", assets))
    bindings, done = registered(root)
    if not done:
        rows.append((f"NEEDS (not registered in {bindings.relative_to(WORKFLOW)}; the plugin injects nothing)", root))
    return rows


def apply(root: Path, links, files, stale, trees):
    rows = []
    for target, source in links:
        rows.append((create_link(target, source), target))
    for target, text in files:
        rows.append((write_file(target, text), target))
    for target in stale:
        target.unlink()
        rows.append(("removed (obsolete link)", target))
    (root / "AGENT-INSTRUCTIONS" / "PLANS").mkdir(parents=True, exist_ok=True)
    (root / "AGENT-INSTRUCTIONS" / "PUBLISHING" / "public-assets").mkdir(parents=True, exist_ok=True)
    for tree in trees:
        for target, source in worktree_links(root, tree):
            rows.append((create_link(target, source), target))
        rows.append((ensure_excluded(tree), tree))
    if not (root / ".git").exists():
        git("init", "-q", cwd=root)
        rows.append(("created (root Git repository)", root))
    bindings, done = registered(root)
    if not done:
        config = json.loads(bindings.read_text(encoding="utf-8")) if bindings.exists() else {"workspaces": []}
        config.setdefault("workspaces", []).append(str(root))
        bindings.write_text(json.dumps(config, indent=2) + "\n", encoding="utf-8")
        rows.append((f"registered in {bindings.relative_to(WORKFLOW)}", root))
    return rows


def main(argv):
    checking = "--check" in argv
    rest = [value for value in argv if value != "--check"]
    if len(rest) > 1:
        print("usage: setup-workspace.py [--check] [workspace]", file=sys.stderr)
        return 2
    root = Path(rest[0]).resolve() if rest else Path.cwd()
    if not root.is_dir():
        print(f"{root}: not a directory", file=sys.stderr)
        return 2

    links, files = plan(root)
    stale = obsolete_links(root, links)
    trees = worktrees(root)
    rows = (check if checking else apply)(root, links, files, stale, trees)

    width = max(len(str(path.relative_to(root)) or ".") for _, path in rows)
    failures = 0
    for action, path in rows:
        print(f"{action:<52} {str(path.relative_to(root)) or '.':<{width}}")
        if action.startswith(("WRONG", "NOT A LINK", "missing", "obsolete", "NEEDS")):
            failures += 1
    if checking:
        return 1 if failures else 0

    print()
    sys.stdout.flush()
    stamped = subprocess.run(
        [sys.executable, str(root / "AGENT-INSTRUCTIONS" / "SUBAGENTS" / "gen_agents.py")],
        cwd=root,
        check=False,
    )
    if stamped.returncode != 0:
        print("agent generation failed; the generator's error above names the file to fix", file=sys.stderr)
        return 1
    print()
    print("Re-run this script after adding a worktree or updating the workflow: existing links and")
    print("LOCAL slots are left alone. Run --check after any editor or script touched shared text.")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
