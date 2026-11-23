"""Wire this checkout of the workflow into OpenCode on this machine.

Usage:
    python SETUP/setup-machine.py
    python SETUP/setup-machine.py --check
    python SETUP/setup-machine.py --plugins off
    python SETUP/setup-machine.py --plugins on

``--plugins off|on`` runs ``SETUP/plugins.py``, the standalone switch that turns this repository's
global plugins off and on again.

It does these things and nothing else:

- checks that the two imported plugins are checked out (the submodules), and copies each plugin's
  ``config.example.json`` to ``config.json`` when that file is absent;
- creates the workflow plugin's ``bindings.json`` from its example when absent, because the list of
  governed checkouts is machine state;
- adds the five local plugin entries to the global ``~/.config/opencode/opencode.json`` if they are
  missing, and removes a skills entry for this repository's ``SKILLS/``, which the workflow plugin
  registers itself, after backing the file up.

An existing plugin entry is never rewritten and a local configuration file is never touched, so the script
is safe to run again after an update. Per-checkout work is separate: run ``SETUP/setup-repo.py``
inside the checkout.
"""

import json
import os
import shutil
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from plugins import GLOBAL_CONFIG, ROOT, switch, write_config  # noqa: E402

PLUGINS = {
    "workflow": {
        "path": ROOT / "PLUGINS" / "workflow",
        "option": "bindings",
        "config": ROOT / "PLUGINS" / "workflow" / "bindings.json",
        "example": ROOT / "PLUGINS" / "workflow" / "bindings.example.json",
    },
    "shadow-orchestrator": {
        "path": ROOT / "PLUGINS" / "shadow-orchestrator",
        "option": "config",
        "config": ROOT / "PLUGINS" / "shadow-orchestrator" / "config.json",
        "example": ROOT / "PLUGINS" / "shadow-orchestrator" / "config.example.json",
    },
    "opencode-keepalive": {
        "path": ROOT / "PLUGINS" / "opencode-keepalive",
        "option": "config",
        "config": ROOT / "PLUGINS" / "opencode-keepalive" / "config.json",
        "example": ROOT / "PLUGINS" / "opencode-keepalive" / "config.example.json",
    },
    "subagent-foreground": {
        "path": ROOT / "PLUGINS" / "subagent-foreground",
    },
    "config-reload": {
        "path": ROOT / "PLUGINS" / "config-reload",
    },
}


def entry(plugin):
    if "option" not in plugin:
        return {"package": str(plugin["path"])}
    return {"package": str(plugin["path"]), "options": {plugin["option"]: str(plugin["config"])}}


def package_of(item):
    """Return the local path a plugin entry names, for both the string and the object form."""
    value = item.get("package") if isinstance(item, dict) else item
    if not isinstance(value, str):
        return None
    return str(Path(os.path.expanduser(value)).resolve())


def main(argv):
    if argv[:1] == ["--plugins"]:
        if len(argv) != 2 or argv[1] not in ("on", "off"):
            print("usage: setup-machine.py --plugins on|off", file=sys.stderr)
            return 2
        return switch(argv[1])
    checking = "--check" in argv
    problems = []

    for name, plugin in PLUGINS.items():
        if not (plugin["path"] / "index.js").exists():
            problems.append(f"{name}: not checked out; run git submodule update --init --recursive")
        elif "config" not in plugin:
            continue
        elif not plugin["config"].exists():
            if checking:
                problems.append(f"{name}: {plugin['config'].relative_to(ROOT)} is missing")
            elif plugin["example"].exists():
                shutil.copyfile(plugin["example"], plugin["config"])
                print(f"created  {plugin['config']}")
            else:
                problems.append(f"{name}: no {plugin['example'].name} to copy from")

    if checking and not GLOBAL_CONFIG.exists():
        problems.append(f"{GLOBAL_CONFIG} is missing")
    if problems:
        for problem in problems:
            print(f"NEEDS    {problem}")
        return 1

    # The global configuration is the one file outside the repository. Never rewrite an existing
    # entry, and back the file up before adding anything.
    existed = GLOBAL_CONFIG.exists()
    if existed:
        try:
            config = json.loads(GLOBAL_CONFIG.read_text(encoding="utf-8"))
        except json.JSONDecodeError as error:
            print(f"ABORT    {GLOBAL_CONFIG} is not plain JSON ({error}); edit it by hand", file=sys.stderr)
            return 1
    else:
        if checking:
            return 0
        config = {"$schema": "https://opencode.ai/config.json"}

    # The workflow plugin registers the procedure skills with the shared text they carry. A skills
    # source for the same directory would load them again as bare pointers, so it is removed.
    skills = config.get("skills", [])
    skills_path = str(ROOT / "SKILLS")
    stale_skills = skills_path in skills
    if stale_skills:
        if checking:
            print(f"NEEDS    skills[] lists {skills_path}; the workflow plugin registers those skills")
        else:
            skills.remove(skills_path)
            if not skills:
                del config["skills"]
            print(f"removed  skills[] entry for {skills_path}")

    plugins = config.setdefault("plugins", [])
    present = {package_of(item) for item in plugins if package_of(item)}
    # A plugin loaded from another path can be a package directory or a single .js file, so the
    # name is compared by both its directory name and its stem.
    paths_by_name = {}
    for package in present:
        paths_by_name.setdefault(Path(package).name, set()).add(package)
        paths_by_name.setdefault(Path(package).stem, set()).add(package)
    missing, elsewhere, dead = [], [], []
    for name, plugin in PLUGINS.items():
        if str(plugin["path"].resolve()) in present:
            continue
        # A plugin already loaded from another path would load twice if this one were also added;
        # keep the existing entry and let the operator retire it deliberately. An entry whose path
        # is gone does not work, so it is reported instead of silently counted as healthy.
        candidates = paths_by_name.get(name)
        existing = sorted(path for path in candidates or () if Path(path).exists())
        if existing:
            elsewhere.append(name)
        elif candidates:
            dead.append((name, sorted(candidates)[0]))
        else:
            missing.append(name)

    for name in elsewhere:
        print(f"kept     plugins[] entry for {name} from another path; retire it when you move to this one")
    for name, path in dead:
        print(f"NEEDS    plugins[] entry for {name} points at {path}, which does not exist; fix it by hand")
    note = f" ({len(elsewhere)} loading from another path)" if elsewhere else ""
    print(f"ok       plugins and their local configuration are in place{note}")

    for name in missing:
        if checking:
            print(f"NEEDS    plugins[] has no entry for {name}")
        else:
            plugins.append(entry(PLUGINS[name]))
            print(f"added    plugins[] entry for {name}")

    if checking:
        return 0 if not missing and not stale_skills and not dead else 1

    if dead:
        return 1

    if missing or stale_skills:
        write_config(config, GLOBAL_CONFIG, existed)

    print()
    print("Restart the OpenCode service to load a changed plugin list:")
    print("  opencode service restart")
    print()
    print("Then, in each checkout that should use this workflow:")
    print(f"  python {ROOT / 'SETUP' / 'setup-repo.py'} /path/to/checkout")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
