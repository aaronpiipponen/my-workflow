"""Fail on a repository link or heading anchor that does not resolve."""

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PAGES = [ROOT / "README.md", *sorted((ROOT / "docs").rglob("*.md"))]
LINK = re.compile(r"\]\((/[^)#\s]*)(#[^)\s]*)?\)|src=\"(/[^\"]+)\"")
HEADING = re.compile(r"^(#{1,6})\s+(.*)$", re.MULTILINE)
FENCE = re.compile(r"```.*?```", re.DOTALL)
INLINE = re.compile(r"`[^`\n]*`")


def slug(text):
    """Return the GitHub anchor a heading produces."""
    text = re.sub(r"<[^>]+>", "", text).strip().lower()
    text = re.sub(r"[^\w\- ]", "", text)
    return text.replace(" ", "-")


def anchors(page):
    """Return every heading anchor on one page."""
    return {slug(match.group(2)) for match in HEADING.finditer(page.read_text(encoding="utf-8"))}


def links(text):
    """Yield each repository link's path and optional anchor from one page's text."""
    for match in LINK.finditer(FENCE.sub("", text)):
        yield match.group(1) or match.group(3), match.group(2)


def main():
    heading_anchors = {page: anchors(page) for page in PAGES}
    problems = []
    for page in PAGES:
        for target, anchor in links(INLINE.sub("", page.read_text(encoding="utf-8"))):
            if not target.startswith("/"):
                continue
            file = ROOT / target.lstrip("/")
            if not file.exists():
                problems.append(f"{page.relative_to(ROOT)}: {target} does not exist")
                continue
            if anchor and file.suffix == ".md":
                if anchor[1:] not in heading_anchors.get(file, set()):
                    problems.append(f"{page.relative_to(ROOT)}: {target}{anchor} names no heading")
    if problems:
        print("\n".join(problems))
        print(f"{len(problems)} link problem(s)")
        return 1
    print(f"{len(PAGES)} pages: every link and anchor resolves")
    return 0


if __name__ == "__main__":
    sys.exit(main())
