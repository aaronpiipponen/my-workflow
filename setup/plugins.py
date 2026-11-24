"""Turn this repository's global OpenCode plugins off or on.

Usage:
    python setup/plugins.py off
    python setup/plugins.py on

`off` adds a `plugin.use` deny policy to the global ``~/.config/opencode/opencode.json`` for every
plugin entry that loads from this repository, and `on` removes exactly those policies. The plugin
entries themselves are never edited, and the file is backed up before each write. OpenCode applies
the change on its next configuration reload. Use it when a plugin change breaks OpenCode: turn the
plugins off, fix the plugin, turn them on.

`setup/setup-machine.py --plugins on|off` runs the same switch.
"""

import json
import os
import shutil
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GLOBAL_CONFIG = Path.home() / ".config" / "opencode" / "opencode.json"


def write_config(config, path, existed):
    """Back the file up when it existed, then write the configuration."""
    path.parent.mkdir(parents=True, exist_ok=True)
    if existed:
        backup = path.with_name(f"{path.name}.bak-{int(time.time())}")
        shutil.copyfile(path, backup)
        print(f"backup   {backup.name}")
    path.write_text(json.dumps(config, indent=2) + "\n", encoding="utf-8")
    print(f"wrote    {path}")


def switch(state, path=GLOBAL_CONFIG):
    """Deny or allow again every plugin entry that loads from this repository."""
    try:
        config = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as error:
        print(f"ABORT    {path} is not plain JSON ({error}); edit it by hand", file=sys.stderr)
        return 1
    root = str(ROOT.resolve())
    # Only an entry written as a path can load from this repository; a bare name is an npm package.
    named = [item.get("package") if isinstance(item, dict) else item for item in config.get("plugins", [])]
    paths = [str(Path(os.path.expanduser(value)).resolve()) for value in named if isinstance(value, str) and value.startswith(("/", "~"))]
    ours = sorted(package for package in paths if package == root or package.startswith(root + os.sep))
    policies = config.get("policies", [])
    # A deny is ours when it names one of our entries; any other policy is left exactly as it is.
    kept = [
        policy
        for policy in policies
        if not (policy.get("action") == "plugin.use" and policy.get("effect") == "deny" and policy.get("resource") in ours)
    ]
    wanted = kept + ([{"action": "plugin.use", "resource": package, "effect": "deny"} for package in ours] if state == "off" else [])
    if wanted == policies:
        print(f"ok       the {len(ours)} plugins from this repository are already {state}")
        return 0
    if wanted:
        config["policies"] = wanted
    else:
        config.pop("policies", None)
    write_config(config, path, existed=True)
    for package in ours:
        print(f"{state:<8} {package}")
    return 0


def main(argv):
    if len(argv) != 1 or argv[0] not in ("on", "off"):
        print("usage: plugins.py on|off", file=sys.stderr)
        return 2
    return switch(argv[0])


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
