"""Create a filled sample workspace and check it, as the CI job and a developer would.

Usage::

    python setup/sample-workspace.py

The workspace check treats a slot that still equals its template as unfilled, which every freshly
created workspace is. This script creates one in a temporary directory, fills each slot with
placeholder values and the bound section headings, stamps the agents from those slots and then runs
``setup-workspace.py --check`` on it. A failure there is a real defect in the links, the slot
templates, the section bindings or the agent generation, and it is reported as this script's exit
code. The temporary workspace is removed afterwards.
"""

from __future__ import annotations

import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

SETUP = Path(__file__).resolve().parent
WORKFLOW = SETUP.parent
TEMPLATES = SETUP / "local.example"

# The rules slot is bound by section number, so a filled copy keeps those headings and adds the
# unnumbered remainder as one title-addressed section.
RULES_SLOT = "repo-rules-domain.md"
RULES_TEXT = (
    "## 1. What this repo is\n\nSample text.\n\n"
    "## 2. Hard invariants: never violate\n\nSample text.\n\n"
    "## 3. Code style and documentation\n\nSample text.\n\n"
    "## 3b. Test and review exceptions\n\nSample text.\n"
)
# Every skill or tool template placeholder, replaced with a harmless sample value.
PLACEHOLDERS = (
    ("<capture script directory>", "tools"),
    ("<interface wording file>", "web/src/wording.ts"),
    ("<documentation checker>", "node tools/docs/check.mjs"),
    ("<capture command>", "node tools/docs/captures/retake.mjs"),
    ("<browser check command>", "npm --prefix web run browser:check"),
)


def run(*args: str, cwd: Path) -> subprocess.CompletedProcess:
    return subprocess.run([sys.executable, *args], cwd=cwd, text=True, capture_output=True)


def fill(workspace: Path) -> None:
    """Replace the sample workspace's template slots with filled, valid values."""
    local = workspace / "AGENT-INSTRUCTIONS" / "LOCAL"
    for slot in sorted(local.glob("*.md")):
        slot.write_text(RULES_TEXT if slot.name == RULES_SLOT else "## Filled\n\nSample text.\n", encoding="utf-8")
    models = json.loads((TEMPLATES / "models.json").read_text(encoding="utf-8"))
    for group in ("sessions", "agents"):
        for entry in models[group].values():
            entry["model"] = "sample/model"
            entry.pop("variant", None)
    (local / "models.json").write_text(json.dumps(models, indent=2) + "\n", encoding="utf-8")
    workflow = (TEMPLATES / "workflow.toml").read_text(encoding="utf-8")
    for placeholder, value in PLACEHOLDERS:
        workflow = workflow.replace(placeholder, value)
    (local / "workflow.toml").write_text(workflow, encoding="utf-8")
    (local / "workspace.json").write_text("{}\n", encoding="utf-8")


def main() -> int:
    # The setup registers the workspace it creates in the plugin's workspace list, so a sample run
    # would leave a dead temporary path behind. The original file is restored whatever happens.
    registry = WORKFLOW / "plugins" / "workflow" / "bindings.json"
    original = registry.read_text(encoding="utf-8") if registry.exists() else None
    try:
        return sample()
    finally:
        if original is None:
            registry.unlink(missing_ok=True)
        else:
            registry.write_text(original, encoding="utf-8")


def sample() -> int:
    with tempfile.TemporaryDirectory(prefix="sample-workspace-") as temporary:
        workspace = Path(temporary) / "ws"
        workspace.mkdir()
        created = run(str(SETUP / "setup-workspace.py"), str(workspace), cwd=WORKFLOW)
        if created.returncode != 0:
            sys.stderr.write(created.stdout + created.stderr)
            print("sample-workspace: the setup itself failed", file=sys.stderr)
            return created.returncode
        fill(workspace)
        stamped = run("AGENT-INSTRUCTIONS/SUBAGENTS/gen_agents.py", cwd=workspace)
        if stamped.returncode != 0:
            sys.stderr.write(stamped.stdout + stamped.stderr)
            print("sample-workspace: stamping the agents failed", file=sys.stderr)
            return stamped.returncode
        checked = run(str(SETUP / "setup-workspace.py"), "--check", str(workspace), cwd=WORKFLOW)
        failures = [line for line in checked.stdout.splitlines() if not line.startswith(("ok", "local", "unused"))]
        for line in failures:
            print(line)
        print(f"sample-workspace: {len(failures)} finding(s)")
        return checked.returncode


if __name__ == "__main__":
    sys.exit(main())
