"""Drive one test run of the toy project through every workflow session except the answers.

Usage:
    python toy/drive.py <n>
    python toy/drive.py <n> hotfix

`<n>` is the run number of an active run that `toy/run.py new` created. The driver talks to the
running OpenCode service and does everything a person would type except answering the
orchestrators' questions, which the person does in each session's chat:

1. starts one `/plan` session in each plan's worktree, with autonomous mode enabled in its brief;
2. links each of them with `/coordinator-link`, which starts the coordinator with the first link
   (the seed's plans start with their first phase detailed, so they are ready to link at once);
3. waits until a plan's status table is finished and its orchestrator is idle, then starts its
   `/release` session, one release at a time in the fixed order plan-c, plan-b, plan-a, each with
   its merge-order brief, and waits until that release has merged and is idle;
4. after the last release has closed every plan, starts the documentation hotfix with `/release`
   in the integration worktree, which writes the project's documentation and root README.

`hotfix` runs step 4 alone. The driver records its sessions in `.opencode/toy-drive.json` in the
run, so a stopped driver continues where it left off when it runs again. It prints the sessions
to open in OpenCode and stops after starting the hotfix; `toy/run.py end <n>` records the run.
"""

import json
import re
import subprocess
import sys
import time

from run import settings

# Seconds between two reads of the run's state while the driver waits.
POLL = 30
PLANS = ["plan-a", "plan-b", "plan-c"]
# The release order the briefs below are written for.
RELEASE_ORDER = ["plan-c", "plan-b", "plan-a"]
INTEGRATION = "main"
STATUS_ROW = re.compile(r"^\|\s*([A-Za-z0-9.]+)\s*\|[^|]*\|\s*([a-z ]+?)\s*\|")
FINISHED = {"done", "not applicable"}

PLAN_BRIEF = {
    "plan-a": "This is the materials plan on branch plan-a.",
    "plan-b": "This is the geometry plan on branch plan-b.",
    "plan-c": "This is the output plan on branch plan-c.",
}
PLAN_RULES = (
    "This is a test run of the toy project. Use autonomous mode for the routine loop: take the "
    "decisions inside the approved scope yourself and record each one in autonomous-decisions.md. "
    "Ask me only for product decisions, a user test or acceptance, and plan closure, each as one "
    "question with your recommendation so I can answer in a line. The first phase is detailed; I "
    "link you to the coordinator now."
)
RELEASE_COMMON = (
    "This is a test run of the toy project. No export, public checkout or deployment applies: "
    "publish.md is authoritative and the toy publishes nothing, so skip those steps. Merge in the "
    "integration worktree and resolve every conflict by the shared designs in "
    "AGENT-INSTRUCTIONS/PLANS/shared/ and the plans' done contracts, then run the fast gate and the "
    "rendered-image gate in main. The root README and the documentation pages belong to the "
    "documentation hotfix after the last release, so leave them out unless a merge breaks a "
    "statement in them. Ask me only for product decisions and anything the workflow cannot settle."
)
RELEASE_BRIEF = {
    "plan-c": (
        "Release coordination: plan-c merges first. Merge plan-c into main. Keep plan-c open until "
        "plan-a's release, which merges last: any docs-pass item on a file the other plans also "
        "change stays for that release, so record its owner in docs-pass.md. Report the merge and "
        "the open items, then stop."
    ),
    "plan-b": (
        "Release coordination: plan-b merges second, over plan-c. Merge plan-b into main. Keep "
        "plan-b open until plan-a's release, which merges last, and hand it every docs-pass item on "
        "a shared file, recorded with its owner in docs-pass.md. Clear an item that this branch "
        "already resolved and say why. Report the merge and the open items, then stop."
    ),
    "plan-a": (
        "Release coordination: plan-a merges last, over plan-c and plan-b. Merge plan-a into main, "
        "then resolve every docs-pass item held for this release in all three plans, including the "
        "repository map in AGENT-INSTRUCTIONS/LOCAL/project.md. When the gates pass, close and "
        "archive plan-c, plan-b and plan-a."
    ),
}
HOTFIX_BRIEF = (
    "This is a documentation hotfix of the toy project's test run, after all three plans were "
    "released and closed. No export, public checkout or deployment applies: publish.md is "
    "authoritative and the toy publishes nothing.\n\n"
    "Write the project's documentation for the program as it is on main:\n"
    "- the root README.md by the root README guide, with a logo: brief a document-writer for four "
    "candidates by the logo guide, then choose one yourself in autonomous mode and record the choice "
    "and its reason in your report;\n"
    "- documentation pages under docs/ that the program warrants beside docs/requirements.md, "
    "following the documentation style guide, with a diagram where one explains the program "
    "better than prose.\n\n"
    "You may update AGENT-INSTRUCTIONS/LOCAL/documentation-pages.md and "
    "AGENT-INSTRUCTIONS/LOCAL/project.md so they name the documentation set you write. Propose the "
    "page set and the README sections to me in one message with your recommendation, then write "
    "them. Commit on main once the documentation gate passes, inspect every image, and report."
)


def api(method, route, data=None, params=None):
    """Call the OpenCode service through `opencode api` and return the decoded response."""
    args = ["opencode", "api", method, route]
    for key, value in (params or {}).items():
        args += ["--param", f"{key}={value}"]
    if data is not None:
        args += ["--data", json.dumps(data)]
    result = subprocess.run(args, capture_output=True, text=True)
    if result.returncode != 0:
        raise SystemExit(f"opencode api {method} {route} failed: {result.stderr.strip() or result.stdout.strip()}")
    return json.loads(result.stdout) if result.stdout.strip() else None


def model_ref(model):
    """Turn `provider/model#variant` from `toy/toy.json` into the service's model reference."""
    name, _, variant = model.partition("#")
    provider, _, model_id = name.partition("/")
    if not provider or not model_id or not variant:
        raise SystemExit(f"model {model!r} in toy/toy.json is not provider/model#variant")
    return {"providerID": provider, "id": model_id, "variant": variant}


def start_session(directory, title):
    # A session the workflow plugin opens from this one, such as the hotfix, runs on the model the
    # run's `LOCAL/models.json` names for its role, which the seed sets to the same toy model.
    created = api("post", "/api/session", {
        "title": title,
        "location": {"directory": str(directory)},
        "model": model_ref(settings()["model"]),
    })
    session = (created or {}).get("data", created) or {}
    if not session.get("id"):
        raise SystemExit(f"no session was created in {directory}: {created}")
    return session["id"]


def command(session, name, text=""):
    api("post", f"/api/session/{session}/command", {"name": name, "text": text})


def busy(session):
    return session in (api("get", "/api/session/active") or {}).get("data", {})


def sessions_in(directory):
    return api("get", "/api/session", params={"directory": str(directory), "limit": 100}).get("data", [])


class Run:
    """One active run: its folder, the driver's record of its sessions and the plan state."""

    def __init__(self, number):
        self.root = settings()["runs"] / f"run{number:03d}"
        if not self.root.is_dir():
            raise SystemExit(f"{self.root} does not exist; create it with toy/run.py new")
        self.record = self.root / ".opencode" / "toy-drive.json"
        self.sessions = json.loads(self.record.read_text(encoding="utf-8")) if self.record.exists() else {}

    def remember(self, key, session):
        self.sessions[key] = session
        self.record.write_text(json.dumps(self.sessions, indent=2) + "\n", encoding="utf-8")
        print(f"{key}: session {session}")

    def plan_folder(self, plan):
        plans = self.root / "AGENT-INSTRUCTIONS" / "PLANS"
        return plans / plan if (plans / plan).is_dir() else plans / "archive" / plan

    def archived(self, plan):
        return (self.root / "AGENT-INSTRUCTIONS" / "PLANS" / "archive" / plan).is_dir()

    def plan_finished(self, plan):
        rows = [STATUS_ROW.match(line) for line in (self.plan_folder(plan) / "full-plan.md").read_text(encoding="utf-8").splitlines()]
        statuses = [row.group(2) for row in rows if row and row.group(1) != "Phase"]
        return bool(statuses) and all(status in FINISHED for status in statuses)

    def merged(self, plan):
        check = subprocess.run(["git", "merge-base", "--is-ancestor", plan, "HEAD"], cwd=self.root / INTEGRATION, capture_output=True)
        return check.returncode == 0

    def linked(self, plan):
        links = self.root / ".opencode" / "coordinator" / "links.json"
        return links.exists() and plan in links.read_text(encoding="utf-8")


def wait(description, ready):
    print(f"waiting: {description}")
    while not ready():
        time.sleep(POLL)


def start_plans(run):
    for plan in PLANS:
        key = f"plan {plan}"
        if key not in run.sessions:
            session = start_session(run.root / plan, f"Plan {plan}")
            command(session, "plan", f"{PLAN_BRIEF[plan]} {PLAN_RULES}")
            run.remember(key, session)
    for plan in PLANS:
        if not run.linked(plan):
            command(run.sessions[f"plan {plan}"], "coordinator-link")
            if not run.linked(plan):
                raise SystemExit(f"{plan} is not linked; read the note in its session")
            print(f"linked {plan}")


def release_plans(run):
    for plan in RELEASE_ORDER:
        key = f"release {plan}"
        if key not in run.sessions:
            orchestrator = run.sessions[f"plan {plan}"]
            wait(f"{plan} finishes its phases", lambda: run.plan_finished(plan) and not busy(orchestrator))
            session = start_session(run.root / plan, f"Release {plan}")
            command(session, "release", f"{RELEASE_BRIEF[plan]}\n\n{RELEASE_COMMON}")
            run.remember(key, session)
        session = run.sessions[key]
        wait(f"the {plan} release merges", lambda: run.merged(plan) and not busy(session))
    last = run.sessions[f"release {RELEASE_ORDER[-1]}"]
    wait("the last release closes every plan", lambda: all(run.archived(plan) for plan in PLANS) and not busy(last))


def start_hotfix(run):
    if "hotfix" in run.sessions:
        print(f"hotfix: session {run.sessions['hotfix']} is already started")
        return
    worktree = run.root / INTEGRATION
    before = {session["id"] for session in sessions_in(worktree)}
    # `/release` in the integration worktree opens its own "Release hotfix" session, so the session
    # it is sent from only carries the command and is deleted once the hotfix session exists.
    carrier = start_session(worktree, "Hotfix command")
    command(carrier, "release", HOTFIX_BRIEF)
    started = [session for session in sessions_in(worktree) if session["id"] not in before | {carrier} and session["title"] == "Release hotfix"]
    if len(started) != 1:
        raise SystemExit(f"expected one new Release hotfix session in {worktree}, found {len(started)}")
    api("delete", f"/api/session/{carrier}")
    if started[0].get("model") != model_ref(settings()["model"]):
        api("post", f"/api/session/{started[0]['id']}/interrupt", {})
        raise SystemExit(f"the hotfix session runs {started[0].get('model')}, not {settings()['model']}; it is interrupted")
    run.remember("hotfix", started[0]["id"])


def main(argv):
    if len(argv) not in (1, 2) or not argv[0].isdigit() or argv[1:] not in ([], ["hotfix"]):
        print(__doc__.split("\n\n")[1], file=sys.stderr)
        return 2
    run = Run(int(argv[0]))
    if argv[1:] != ["hotfix"]:
        start_plans(run)
        print("Open the sessions in OpenCode (Ctrl+O) and answer their questions there.")
        release_plans(run)
    start_hotfix(run)
    print(f"Answer the hotfix in its session, then record the run: python toy/run.py end {argv[0]}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
