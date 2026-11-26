"""Fail on a repository link or heading anchor that does not resolve.

Every tracked Markdown page is checked, not only the README and `docs/`. Two kinds of page are
excluded on purpose:

- **Submodules.** `plugins/shadow-orchestrator` and `plugins/opencode-keepalive` are separate
  repositories with their own roots, so a link they write as `/assets/...` resolves inside the
  submodule, not here. Each submodule checks its own README.
- **A template whose destination differs.** `toy/public-readme.md` is copied to a run's `README.md`
  beside a generated `README-RUN.md`, so a relative link it makes is valid where it lands, not where
  it is stored.

A relative link is resolved from the page that makes it; a root-absolute link from the repository
root. An anchor is checked only when its page is Markdown reachable here.
"""

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SKIP_PARTS = {".git", "node_modules", "__pycache__"}
TEMPLATES = {ROOT / "toy" / "public-readme.md"}
LINK = re.compile(
    r"\]\((/[^)#\s]*)(#[^)\s]*)?\)"  # root-absolute markdown link
    r"|\]\(([^)#\s][^)\s]*)(#[^)\s]*)?\)"  # relative markdown link
    r'|src="(/[^"]+)"'  # root-absolute HTML image
)
HEADING = re.compile(r"^(#{1,6})\s+(.*)$", re.MULTILINE)
FENCE = re.compile(r"```.*?```", re.DOTALL)
INLINE = re.compile(r"`[^`\n]*`")


def is_submodule(path: Path) -> bool:
    """Return whether the page lives inside a submodule, which resolves its own links."""
    current = path.relative_to(ROOT).parent
    while current != Path("."):
        candidate = ROOT / current
        if (candidate / ".git").exists():
            return True
        current = current.parent
    return False


def pages():
    """Every tracked Markdown page this repository's own links can be checked in."""
    return [
        page
        for page in sorted(ROOT.rglob("*.md"))
        if not SKIP_PARTS.intersection(page.parts)
        and not is_submodule(page)
        and page not in TEMPLATES
    ]


def slug(text):
    """Return the GitHub anchor a heading produces."""
    text = re.sub(r"<[^>]+>", "", text).strip().lower()
    text = re.sub(r"[^\w\- ]", "", text)
    return text.replace(" ", "-")


def anchors(page: Path, cache: dict):
    """Return every heading anchor on one page."""
    if page not in cache:
        cache[page] = {
            slug(match.group(2)) for match in HEADING.finditer(page.read_text(encoding="utf-8"))
        }
    return cache[page]


def links(text):
    """Yield each link's target path and optional anchor from one page's text."""
    for match in LINK.finditer(FENCE.sub("", text)):
        absolute = match.group(1) or match.group(3)
        relative = match.group(4)
        target = absolute or relative
        if target:
            yield target, match.group(2) or match.group(5)


def main():
    pages_ = pages()
    cache = {}
    problems = []
    count = 0
    for page in pages_:
        for target, anchor in links(INLINE.sub("", page.read_text(encoding="utf-8"))):
            if "://" in target or target.startswith(("#", "mailto:")):
                continue
            file = ROOT / target.lstrip("/") if target.startswith("/") else (page.parent / target)
            count += 1
            if not file.exists():
                problems.append(f"{page.relative_to(ROOT)}: {target} does not exist")
                continue
            if anchor and file.suffix == ".md" and not is_submodule(file):
                if anchor[1:] not in anchors(file, cache):
                    problems.append(f"{page.relative_to(ROOT)}: {target}{anchor} names no heading")
    if problems:
        print("\n".join(problems))
        print(f"{len(problems)} link problem(s)")
        return 1
    print(f"{len(pages_)} pages, {count} links: every link and anchor resolves")
    return 0


if __name__ == "__main__":
    sys.exit(main())
