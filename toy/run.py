"""Create and finish test runs of the toy project.

Usage:
    python toy/run.py new
    python toy/run.py end <n>
    python toy/run.py discard <n>

A run is a workspace laid out as `setup/setup-workspace.py` describes, created from the seed
repository named in `toy/toy.json`. `toy/toy.example.json` shows the settings file with placeholder
values. The seed holds the starting state on `seed/` branches
(`seed/main`, `seed/plan-a`, `seed/plan-b`, `seed/plan-c` and `seed/workflow`), a `run<n>/...`
record of every finished run, and `main` as the published view of the latest finished run.

`new` creates the next numbered run beside the seed, never from another run. The root is a clone
of only `seed/workflow`, named `workflow` in the run, and `project.git` receives only the project
branches from `seed/`, so no earlier run is reachable from inside the run; both lose their link to
the seed. The run's `opencode.json` denies file access outside the run folder. When the global
OpenCode configuration already loads this repository's plugins, the run uses them as loaded;
otherwise its `opencode.json` loads them and denies the globally loaded copies named in
`denied_plugins`.

`end <n>` first commits the transcript of every top-level session as
`transcripts/<title>-<session id>.json`: the sessions of each plan worktree on that plan's branch,
and the sessions of the root (the coordinator) and of the integration worktree (the releases) on
the integration branch. It then makes the seed fetch the run's project branches and its root as
`run<n>/<branch>` and `run<n>/workflow`, rebuilds `main` from the run's `main` with
`toy/public-readme.md` as `README.md`, its runs table listing every recorded run, and the run's own
README as `README-RUN.md`, unregisters the run, and deletes the run folder. The run never writes to
the seed.

`discard <n>` deletes a run that was only a test: it unregisters the workspace and removes the run
folder without recording its branches, so the next `new` reuses the run number.
"""

import json
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

WORKFLOW = Path(__file__).resolve().parents[1]
SETTINGS = Path(__file__).resolve().parent / "toy.json"
SETUP = WORKFLOW / "setup" / "setup-workspace.py"
BINDINGS = WORKFLOW / "plugins" / "workflow" / "bindings.json"
PUBLIC_README = WORKFLOW / "toy" / "public-readme.md"
GLOBAL_CONFIG = Path.home() / ".config" / "opencode" / "opencode.json"
# The plugins a run needs from this repository.
RUN_PLUGINS = ("workflow", "subagent-foreground", "coordinator")
RUN_NAME = re.compile(r"^run(\d+)$")
# The seed's start state sits on branches under this prefix, so no run writes it.
SEED_PREFIX = "seed/"
# Most top-level sessions one directory of a run may hold; reaching it fails the export.
SESSION_LIMIT = 1000


def settings():
    raw = json.loads(SETTINGS.read_text(encoding="utf-8"))
    return {
        "seed": Path(raw["seed"]).expanduser(),
        "runs": Path(raw["runs"]).expanduser(),
        "public_repo": raw["public_repo"].rstrip("/"),
        "denied": [str(Path(path).expanduser()) for path in raw["denied_plugins"]],
        "branches": raw["branches"],
        "scratch": Path(raw["scratch"]).expanduser(),
        "model": raw["model"],
    }


def git(*args, cwd=None):
    return subprocess.run(["git", *args], cwd=cwd, check=True, capture_output=True, text=True).stdout


def recorded_runs(seed):
    names = git("for-each-ref", "--format=%(refname:short)", "refs/heads/", cwd=seed).split()
    return {int(match.group(1)) for name in names if (match := RUN_NAME.match(name.split("/")[0]))}


def globally_loaded():
    """The run's plugins that the global OpenCode configuration already loads from this repository.

    Every entry must name this repository's own bindings file for the workflow plugin, because the
    run registers itself there.
    """
    if not GLOBAL_CONFIG.exists():
        return set()
    loaded = set()
    for item in json.loads(GLOBAL_CONFIG.read_text(encoding="utf-8")).get("plugins", []):
        package = item.get("package") if isinstance(item, dict) else item
        if not isinstance(package, str) or not package.startswith(("/", "~")):
            continue
        path = Path(package).expanduser().resolve()
        name = next((name for name in RUN_PLUGINS if path == (WORKFLOW / "plugins" / name).resolve()), None)
        if not name:
            continue
        bindings = (item.get("options") or {}).get("bindings") if isinstance(item, dict) else None
        if name == "workflow" and (not bindings or Path(bindings).expanduser().resolve() != BINDINGS.resolve()):
            raise SystemExit(f"{GLOBAL_CONFIG} loads the workflow plugin without the bindings option {BINDINGS}")
        loaded.add(name)
    return loaded


def run_config(run, denied, scratch):
    # A repository whose plugins the global configuration loads is tested as loaded: the run adds
    # and denies nothing. Otherwise the run loads this repository's plugins and denies the copies
    # the global configuration loads from elsewhere. Only some of them loaded globally is a
    # configuration this harness cannot test.
    loaded = globally_loaded()
    if loaded and loaded != set(RUN_PLUGINS):
        missing = ", ".join(sorted(set(RUN_PLUGINS) - loaded))
        raise SystemExit(f"{GLOBAL_CONFIG} loads only some of this repository's plugins; it lacks {missing}")
    plugins = WORKFLOW / "plugins"
    return {
        "$schema": "https://opencode.ai/config.json",
        "plugins": []
        if loaded
        else [
            {"package": str(plugins / "workflow"), "options": {"bindings": str(BINDINGS)}},
            {"package": str(plugins / "subagent-foreground")},
            {"package": str(plugins / "coordinator")},
        ],
        "policies": [] if loaded else [{"action": "plugin.use", "resource": path, "effect": "deny"} for path in denied],
        # The last matching rule wins: deny everything outside the run, then allow the run itself,
        # the shared instruction text its links resolve to, and the shared scratch directory.
        "permissions": [
            {"action": "external_directory", "resource": "*", "effect": "deny"},
            {"action": "external_directory", "resource": f"{run}/*", "effect": "allow"},
            {"action": "external_directory", "resource": f"{WORKFLOW / 'AGENT-INSTRUCTIONS'}/*", "effect": "allow"},
            {"action": "external_directory", "resource": f"{scratch}/*", "effect": "allow"},
        ],
    }


def new():
    config = settings()
    seed, runs = config["seed"], config["runs"]
    runs.mkdir(parents=True, exist_ok=True)
    active = [entry.name for entry in runs.iterdir() if RUN_NAME.match(entry.name)]
    if active:
        raise SystemExit(f"{runs} still holds {', '.join(sorted(active))}; end it first with `run.py end <n>`")
    number = max(recorded_runs(seed), default=0) + 1
    run = runs / f"run{number:03d}"

    git("clone", "-q", "--single-branch", "--branch", f"{SEED_PREFIX}workflow", "--no-tags", str(seed), str(run))
    git("branch", "-m", "workflow", cwd=run)
    git("remote", "remove", "origin", cwd=run)
    project = run / "project.git"
    git("init", "-q", "--bare", "-b", config["branches"][0], str(project))
    git(
        "fetch",
        "-q",
        "--no-tags",
        str(seed),
        *(f"refs/heads/{SEED_PREFIX}{branch}:refs/heads/{branch}" for branch in config["branches"]),
        cwd=project,
    )
    for branch in config["branches"]:
        git("worktree", "add", "-q", f"../{branch}", branch, cwd=project)
    (run / "opencode.json").write_text(json.dumps(run_config(run, config["denied"], config["scratch"]), indent=2) + "\n", encoding="utf-8")

    setup = subprocess.run([sys.executable, str(SETUP), str(run)], capture_output=True, text=True)
    if setup.returncode != 0:
        raise SystemExit(f"workspace setup failed:\n{setup.stdout}{setup.stderr}")
    print(f"Created {run} (run {number}).")
    print("Start one orchestrator per plan, each in its own worktree:")
    for branch in config["branches"][1:]:
        print(f"  cd {run / branch} && opencode   then: /plan {branch}")
    print("Link each orchestrator with /coordinator-link once its first phase is detailed.")
    print(f"Finish with: python {Path(__file__).relative_to(WORKFLOW.parent)} end {number}")


def unregister(run):
    if not BINDINGS.exists():
        return
    config = json.loads(BINDINGS.read_text(encoding="utf-8"))
    config["workspaces"] = [entry for entry in config.get("workspaces", []) if entry != str(run)]
    BINDINGS.write_text(json.dumps(config, indent=2) + "\n", encoding="utf-8")


def opencode(*args, cwd):
    return subprocess.run(["opencode", *args], cwd=cwd, check=True, capture_output=True, text=True).stdout


def export_transcripts(run, branches):
    """Commit each top-level session's transcript on the branch its directory belongs to."""
    integration = json.loads((run / "AGENT-INSTRUCTIONS" / "LOCAL" / "workspace.json").read_text(encoding="utf-8"))["integration"]
    sources = [(run, integration), *((run / branch, branch) for branch in branches)]
    for directory, branch in sources:
        listed = json.loads(opencode("session", "list", "--format", "json", "-n", str(SESSION_LIMIT), cwd=directory))
        if len(listed) >= SESSION_LIMIT:
            raise SystemExit(f"{directory} holds {SESSION_LIMIT} or more sessions; raise SESSION_LIMIT")
        target = run / branch / "transcripts"
        for session in listed:
            if Path(session["directory"]).resolve() != directory.resolve():
                continue
            slug = re.sub(r"[^a-z0-9]+", "-", session["title"].lower()).strip("-") or "session"
            target.mkdir(exist_ok=True)
            (target / f"{slug}-{session['id']}.json").write_text(opencode("session", "export", session["id"], cwd=directory), encoding="utf-8")
    for branch in branches:
        worktree = run / branch
        if (worktree / "transcripts").is_dir():
            git("add", "transcripts", cwd=worktree)
            if git("status", "--porcelain", "--", "transcripts", cwd=worktree).strip():
                git("commit", "-q", "-m", "Record the run's session transcripts", "--", "transcripts", cwd=worktree)


def checked_out(seed, branch):
    """Report whether an existing worktree of the seed has this branch checked out."""
    return f"branch refs/heads/{branch}" in git("worktree", "list", "--porcelain", cwd=seed).splitlines()


def runs_table(seed, repo):
    """The markdown table of every recorded run, linked to its code and its README."""
    rows = ["| Run | Code | The run's README |", "|---|---|---|"]
    for number in sorted(recorded_runs(seed)):
        name = f"run{number:03d}"
        rows.append(f"| {name} | [{name}/main]({repo}/tree/{name}/main) | [README]({repo}/blob/{name}/main/README.md) |")
    return "\n".join(rows)


def publish_main(seed, run_branch):
    """Rebuild the seed's `main` from a finished run: its code, the public README and README-RUN.md."""
    if not PUBLIC_README.is_file():
        raise SystemExit(f"{PUBLIC_README} is missing")
    public = PUBLIC_README.read_text(encoding="utf-8").replace("<!-- runs -->", runs_table(seed, settings()["public_repo"]))
    if checked_out(seed, "main"):
        raise SystemExit(f"the seed has `main` checked out; check out `{SEED_PREFIX}main` before ending a run")
    worktree = Path(tempfile.mkdtemp(prefix="toy-main-"))
    added = False
    try:
        try:
            git("worktree", "add", "-q", "--detach", str(worktree), run_branch, cwd=seed)
        except subprocess.CalledProcessError as error:
            raise SystemExit(f"could not read {run_branch} in the seed: {error.stderr.strip()}")
        added = True
        readme = worktree / "README.md"
        if not readme.is_file():
            raise SystemExit(f"{run_branch} has no README.md to rename")
        readme.rename(worktree / "README-RUN.md")
        (worktree / "README.md").write_text(public, encoding="utf-8")
        git("add", "-A", cwd=worktree)
        git("commit", "-q", "-m", "Present the repository and the latest run", cwd=worktree)
        published = git("rev-parse", "HEAD", cwd=worktree).strip()
    finally:
        if added:
            subprocess.run(["git", "worktree", "remove", "--force", str(worktree)], cwd=seed, capture_output=True, text=True)
        shutil.rmtree(worktree, ignore_errors=True)
    git("update-ref", "refs/heads/main", published, cwd=seed)


def end(number):
    config = settings()
    seed = config["seed"]
    run = config["runs"] / f"run{number:03d}"
    if not run.is_dir():
        raise SystemExit(f"{run} does not exist")
    if number in recorded_runs(seed):
        raise SystemExit(f"the seed already records run {number}")
    export_transcripts(run, config["branches"])
    # Plan files written after the last finished round are recorded too.
    git("add", "-A", cwd=run)
    if git("status", "--porcelain", cwd=run).strip():
        git("commit", "-q", "-m", "Record the end of the run", cwd=run)
    prefix = run.name
    git(
        "fetch",
        "-q",
        "--no-tags",
        str(run / "project.git"),
        *(f"refs/heads/{branch}:refs/heads/{prefix}/{branch}" for branch in config["branches"]),
        cwd=seed,
    )
    root_branch = git("symbolic-ref", "--short", "HEAD", cwd=run).strip()
    git("fetch", "-q", "--no-tags", str(run), f"refs/heads/{root_branch}:refs/heads/{prefix}/workflow", cwd=seed)
    publish_main(seed, f"{prefix}/main")
    unregister(run)
    shutil.rmtree(run)
    print(f"The seed records run {number} as {prefix}/*, and `main` is rebuilt from {prefix}/main; {run} is deleted.")


def discard(number):
    config = settings()
    seed = config["seed"]
    run = config["runs"] / f"run{number:03d}"
    if not run.is_dir():
        raise SystemExit(f"{run} does not exist")
    if number in recorded_runs(seed):
        raise SystemExit(f"the seed records run {number}; it is not a test run")
    unregister(run)
    shutil.rmtree(run)
    print(f"Discarded {run}; nothing was recorded, so the next `new` is run {number}.")


def main(argv):
    if argv[:1] == ["new"] and len(argv) == 1:
        new()
    elif argv[:1] == ["end"] and len(argv) == 2 and argv[1].isdigit():
        end(int(argv[1]))
    elif argv[:1] == ["discard"] and len(argv) == 2 and argv[1].isdigit():
        discard(int(argv[1]))
    else:
        print(__doc__.split("\n\n")[1], file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
