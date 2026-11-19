"""One-way update helper that mirrors a private checkout's selection into a public checkout.

Usage, from the checkout being published:

    python AGENT-INSTRUCTIONS/PUBLISHING/export.py

This is a private owner tool, never part of the published product. It replaces every
non-protected file in the target root with the currently selected source files, removes every
non-protected target file that the selection does not reproduce, and copies the explicit entries
in the checkout's publishing data plus every shared documentation file it discovers under the
shared docs root. It performs one quick secret check of the selected files and the protected
copies and one docs link check of the selected files before touching the target.

The selection, the target root and the private-tree policy are data, not code: they live in
``selection.py`` beside this file. This module ships from the workflow repository, is linked into
the checkout, and carries no paths of its own.

The authoritative source selection is built once in :func:`_source_selection`: the explicit
``FILE_MAP`` code/example entries followed by the publishable shared docs. The secret check, the
docs link check and the copy all consume that one selection. The target's shared docs tree is an
ordinary exported target, so its stale files are removed by the normal non-protected cleanup.
The ``PROTECTED_COPIES`` entries are the explicit writes into a protected tree: each replaces one
public destination with its tracked source file, after the same secret check. A source is a
tracked repository file, such as a committed example or a deployment file.

It deliberately does nothing else: no package/settings/product import, no dependency, no state or
ownership journal, no seeding or first-run mode, no log/receipt/history, no install/build/test or
configuration validation, no service/database/runtime operation and no Git write. The target root
and every protected tree are never recursively removed. A missing listed source is ordinary
absence and is skipped; any other I/O failure stops the run.
"""

from __future__ import annotations

import os
import re
import shutil
import sys
from collections.abc import Callable
from pathlib import Path, PurePosixPath
from urllib.parse import unquote

import importlib.util

# Keep the linked workflow tree free of bytecode caches when this file runs from a checkout.
sys.dont_write_bytecode = True

_DATA_NAME = "workflow_export_data"


def _load_data():
    """Load one checkout's publishing data and locate the checkout it describes.

    The selection lives beside this file, in the checkout's ``PUBLISHING/`` directory, so the
    exporter ships here while each checkout owns its own selection.
    """
    candidate = Path(os.path.abspath(__file__)).parent / "selection.py"
    if not candidate.is_file():
        raise SystemExit(
            f"{candidate} is missing; run AGENT-INSTRUCTIONS/PUBLISHING/export.py from the checkout "
            "whose selection.py sits beside it"
        )
    spec = importlib.util.spec_from_file_location(_DATA_NAME, candidate)
    if spec is None or spec.loader is None:
        raise SystemExit(f"{candidate}: cannot load the publishing data")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    # .../CHECKOUT/AGENT-INSTRUCTIONS/PUBLISHING/selection.py
    return module, candidate.parents[2]


_DATA, _PRIVATE_ROOT = _load_data()

FILE_MAP = _DATA.FILE_MAP
PROTECTED_COPIES = _DATA.PROTECTED_COPIES
PRUNE_DIR_NAMES = _DATA.PRUNE_DIR_NAMES
PUBLIC_ONLY = _DATA.PUBLIC_ONLY
SHARED_DOCS_EXCLUDED = _DATA.SHARED_DOCS_EXCLUDED
SHARED_DOCS_ROOT = _DATA.SHARED_DOCS_ROOT
TARGET_ROOT = _DATA.TARGET_ROOT
PRIVATE_MARKER_PATTERN = _DATA.PRIVATE_MARKER_PATTERN

# Publication-split policy describes which of this checkout's own trees are private.
_SHARED_DOC_LINK_FORBIDDEN = _DATA.SHARED_DOC_LINK_FORBIDDEN
_PRIVATE_DOC_LINK_FORBIDDEN = _DATA.PRIVATE_DOC_LINK_FORBIDDEN
_TARGET_GUARDED = _DATA.TARGET_GUARDED

# High-confidence credential and publication-split forms: a short local check, not a scanning
# framework. A rule pairs a name, a pattern and an exemption over the match, so a documentation
# example or a placeholder of the same shape does not stop a publication; the last flag reads
# UTF-8 sources only, so a compressed image cannot trip a text rule by accident.
_EXEMPT_PLACEHOLDER_SHAPE = re.compile(
    rb"example|sample|placeholder|replace-with|change-me|synthetic|fixture|dummy|fake|stub|"
    rb"review-|password|passwd|wrong-|incorrect-|invalid-"
)
_EXEMPT_PLACEHOLDER_SEGMENT = re.compile(rb"(?:^|[-_.])test(?:$|[-_.])")
_EXEMPT_PLACEHOLDER_VALUES = frozenset(
    {b"password", b"passwd", b"secret", b"token", b"none", b"null", b"empty", b"unset"}
)
_DOCUMENTATION_HOSTS: tuple[bytes, ...] = (
    b"example.",
    b".invalid",
    b".test",
    b".example",
    b"localhost",
    b"127.0.0.1",
)


def _exempt_never(_match: re.Match[bytes]) -> bool:
    """Return whether a matched value always counts as a finding."""
    return False


def _is_placeholder(value: bytes) -> bool:
    """Return whether a value is a documentation example or a placeholder of the same shape."""
    lowered = value.lower()
    if _EXEMPT_PLACEHOLDER_SHAPE.search(lowered) or _EXEMPT_PLACEHOLDER_SEGMENT.search(lowered):
        return True
    if lowered in _EXEMPT_PLACEHOLDER_VALUES:
        return True
    return b"<" in lowered or b"${" in lowered


def _is_documentation_host(value: bytes) -> bool:
    """Return whether the host of a URL or address is a documentation-only host."""
    host = value.rsplit(b"@", 1)[-1].split(b"/", 1)[0].split(b":", 1)[0].split(b"?", 1)[0]
    return any(marker in host.lower() for marker in _DOCUMENTATION_HOSTS)


def _exempt_email(match: re.Match[bytes]) -> bool:
    """Return whether an address names a documentation host, a placeholder or a Git SSH remote.

    A ``git@host:owner/repository`` remote has the address shape with the fixed ``git`` user, so
    the ``git`` local part names no person.
    """
    value = match.group(0)
    local_part = value.rsplit(b"@", 1)[0]
    return _is_documentation_host(value) or local_part == b"git" or _is_placeholder(local_part)


# The server images' own fixed account home, a path inside the containers, not on a host. The
# checkout's selection names the accounts; an empty default exempts none.
_CONTAINER_HOME_ACCOUNTS: frozenset[bytes] = frozenset(
    getattr(_DATA, "CONTAINER_HOME_ACCOUNTS", ())
)


def _exempt_home_path(match: re.Match[bytes]) -> bool:
    """Return whether a home path names a placeholder account or the server images' own home."""
    account = match.group(0).rsplit(b"/home/", 1)[-1]
    return account in _CONTAINER_HOME_ACCOUNTS or _is_placeholder(account)


# Loopback, unspecified, broadcast and the documentation ranges of RFC 5737. Every other literal
# IPv4 address names a real network and stops the publication.
_EXEMPT_IPV4_PREFIXES: tuple[bytes, ...] = (
    b"127.",
    b"0.0.0.0",
    b"255.255.255.255",
    b"192.0.2.",
    b"198.51.100.",
    b"203.0.113.",
)


def _exempt_ipv4(match: re.Match[bytes]) -> bool:
    """Return whether a literal IPv4 address is loopback, unspecified or a documentation address."""
    return match.group(0).startswith(_EXEMPT_IPV4_PREFIXES)


def _exempt_credential_url(match: re.Match[bytes]) -> bool:
    """Return whether a URL's inline credential is a placeholder or reaches a documentation host."""
    value = match.group(0)
    if _is_documentation_host(value):
        return True
    userinfo = value.split(b"://", 1)[-1].rsplit(b"@", 1)[0]
    return _is_placeholder(userinfo.rsplit(b":", 1)[-1])


def _exempt_assigned_secret(match: re.Match[bytes]) -> bool:
    """Return whether a quoted credential value is a placeholder."""
    return _is_placeholder(match.group(1) or match.group(2))


_SECRET_RULES: tuple[
    tuple[str, re.Pattern[bytes], Callable[[re.Match[bytes]], bool], bool], ...
] = (
    (
        "private-key-pem",
        re.compile(rb"-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----"),
        _exempt_never,
        False,
    ),
    ("github-token", re.compile(rb"\bgh[pousr]_[A-Za-z0-9]{20,}\b"), _exempt_never, False),
    ("github-pat", re.compile(rb"\bgithub_pat_[A-Za-z0-9_]{20,}\b"), _exempt_never, False),
    ("api-key", re.compile(rb"\bsk-[A-Za-z0-9_-]{20,}\b"), _exempt_never, False),
    ("aws-access-key", re.compile(rb"\bAKIA[0-9A-Z]{16}\b"), _exempt_never, False),
    ("slack-token", re.compile(rb"\bxox[baprs]-[A-Za-z0-9-]{10,}\b"), _exempt_never, False),
    ("gitlab-token", re.compile(rb"\bglpat-[A-Za-z0-9_-]{20,}\b"), _exempt_never, False),
    ("google-api-key", re.compile(rb"\bAIza[0-9A-Za-z_-]{35}\b"), _exempt_never, False),
    (
        "stripe-key",
        re.compile(rb"\b[rs]k_(?:live|test)_[A-Za-z0-9]{10,}\b"),
        _exempt_never,
        False,
    ),
    (
        "jwt",
        re.compile(rb"\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\."),
        _exempt_never,
        False,
    ),
    (
        "password-hash",
        re.compile(rb"\$(?:argon2(?:id|i|d)?|2[aby]|scrypt|pbkdf2_sha256)\$[^\s\"']{10,}"),
        _exempt_never,
        False,
    ),
    (
        "credential-url",
        re.compile(rb"\b[a-z][a-z0-9+.-]*://[^\s/:@]+:[^\s/@]+@[^\s/?#:]+"),
        _exempt_credential_url,
        False,
    ),
    (
        "assigned-secret",
        re.compile(
            rb"(?i)\b(?:password|passwd|secret|api[_-]?key|apikey|access[_-]?key|"
            rb"auth[_-]?token|sender[_-]?token|session[_-]?secret|client[_-]?secret|"
            rb"private[_-]?key)\b\s*[:=]\s*(?:\"([^\"\n]{8,})\"|'([^'\n]{8,})')"
        ),
        _exempt_assigned_secret,
        True,
    ),
    (
        "email-address",
        re.compile(rb"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b"),
        _exempt_email,
        True,
    ),
    ("home-path", re.compile(rb"/home/[A-Za-z0-9._<$-]+"), _exempt_home_path, True),
    (
        "ipv4-address",
        re.compile(rb"(?<![\w.-])(?:\d{1,3}\.){3}\d{1,3}(?![\w.-])"),
        _exempt_ipv4,
        True,
    ),
    (
        "private-tree-marker",
        re.compile(PRIVATE_MARKER_PATTERN),
        _exempt_never,
        True,
    ),
)

# Markdown link markers only; prose substrings and fenced/inline code are never treated as links.
_FENCE_RE = re.compile(r"^\s{0,3}(?:```|~~~)")
_INLINE_CODE_RE = re.compile(r"`[^`]*`")
_INLINE_LINK_RE = re.compile(
    r"!?\[[^\]]*\]\(\s*(?:<([^<>\n]*)>|([^\s()]*))"
    r"(?:\s+(?:\"[^\"]*\"|'[^']*'|\([^)]*\)))?\s*\)"
)
_REFERENCE_DEF_RE = re.compile(r"^ {0,3}\[([^\]]+)\]:\s*(?:<([^<>\n]+)>|(\S+))", re.MULTILINE)
_ABSOLUTE_URL_RE = re.compile(r"^(?:[A-Za-z][A-Za-z0-9+.-]*:|//)")


def _relative(target: Path, path: Path) -> PurePosixPath:
    """Return one target path as a POSIX-relative path from the target root."""
    return PurePosixPath(path.relative_to(target))


def _preserved(relative: PurePosixPath) -> bool:
    """Return whether a target-relative path is protected or a pruned dependency/cache entry."""
    if any(part in PRUNE_DIR_NAMES for part in relative.parts):
        return True
    for entry in PUBLIC_ONLY:
        entry_path = PurePosixPath(entry)
        if relative == entry_path or entry_path in relative.parents:
            return True
    return False


def _shared_doc_excluded(relative: PurePosixPath) -> bool:
    """Return whether a private-root-relative path is a shared-docs exclusion."""
    if any(part in PRUNE_DIR_NAMES for part in relative.parts):
        return True
    for entry in SHARED_DOCS_EXCLUDED:
        entry_path = PurePosixPath(entry)
        if relative == entry_path or entry_path in relative.parents:
            return True
    return False


def _shared_doc_sources(private_root: Path) -> tuple[tuple[str, str], ...]:
    """Discover every publishable shared doc, mirroring each source path to the same destination.

    Excluded subtrees and dependency/cache names are skipped. A symlink at the docs root or
    anywhere inside the shared tree is refused so a shared image cannot point at private data.
    An absent docs root is ordinary absence.
    """
    root = private_root / SHARED_DOCS_ROOT
    if root.is_symlink():
        raise SystemExit(f"refusing symlinked shared docs root: {SHARED_DOCS_ROOT}")
    if not root.is_dir():
        return ()
    sources: list[tuple[str, str]] = []
    for current_dir, dirnames, filenames in os.walk(root, topdown=True, followlinks=False):
        current = Path(current_dir)
        kept: list[str] = []
        for name in dirnames:
            path = current / name
            relative = _relative(private_root, path)
            if _shared_doc_excluded(relative):
                continue
            if path.is_symlink():
                raise SystemExit(f"refusing symlinked shared docs directory: {relative}")
            kept.append(name)
        dirnames[:] = sorted(kept)
        for name in sorted(filenames):
            path = current / name
            relative = _relative(private_root, path)
            if _shared_doc_excluded(relative):
                continue
            if path.is_symlink():
                raise SystemExit(f"refusing symlinked shared docs file: {relative}")
            sources.append((str(relative), str(relative)))
    return tuple(sources)


def _source_selection(private_root: Path) -> tuple[tuple[str, str], ...]:
    """Return the one authoritative selection: explicit map entries plus discovered shared docs."""
    return FILE_MAP + _shared_doc_sources(private_root)


def _validate_target(private_root: Path, target: Path) -> None:
    """Refuse a symlinked target, the private source itself or a directory inside it."""
    if target.is_symlink():
        raise SystemExit(f"refusing to update a symlinked target: {target}")
    resolved = target.resolve()
    private_resolved = private_root.resolve()
    if resolved == private_resolved or private_resolved in resolved.parents:
        raise SystemExit(f"refusing to update the private source checkout: {target}")


def _reject_leaked_target(target: Path) -> None:
    """Fail before mutation if the target holds a path the public tree must never contain.

    A dangling symlink still counts as present so it is surfaced rather than discarded.
    """
    leaked = [path for path in _TARGET_GUARDED if os.path.lexists(target / path)]
    if leaked:
        raise SystemExit(
            "refusing to update: the target holds private or agent-only paths:\n"
            + "\n".join(leaked)
        )


def _secret_check(private_root: Path, selection: tuple[tuple[str, str], ...]) -> None:
    """Fail before any target mutation if a selected source carries a credential or split form."""
    findings: list[str] = []
    for source_relative, _ in selection:
        source = private_root / source_relative
        if source.is_symlink() or not source.is_file():
            continue
        payload = source.read_bytes()
        try:
            payload.decode("utf-8")
            text = payload
        except UnicodeDecodeError:
            text = None
        for name, pattern, exempt, text_only in _SECRET_RULES:
            if text_only:
                if text is None:
                    continue
                body = text
            else:
                body = payload
            if any(not exempt(match) for match in pattern.finditer(body)):
                findings.append(f"{source_relative}: {name}")
    if findings:
        raise SystemExit("secret check failed; no target change was made:\n" + "\n".join(findings))


def _without_code(text: str) -> str:
    """Return *text* with fenced code blocks and inline code spans blanked out."""
    kept: list[str] = []
    in_fence = False
    for line in text.splitlines():
        if _FENCE_RE.match(line):
            in_fence = not in_fence
            kept.append("")
            continue
        kept.append("" if in_fence else line)
    return _INLINE_CODE_RE.sub(" ", "\n".join(kept))


def _link_destinations(text: str) -> list[str]:
    """Return destinations of real Markdown links, images and reference definitions in *text*.

    Fenced code blocks and inline code spans are ignored so examples are not read as links. A
    destination may sit on the line after its marker, so the code-free text is scanned as one
    buffer rather than per line.
    """
    body = _without_code(text)
    destinations = [match.group(1) or match.group(2) for match in _INLINE_LINK_RE.finditer(body)]
    destinations.extend(
        match.group(2) or match.group(3) for match in _REFERENCE_DEF_RE.finditer(body)
    )
    return destinations


def _resolve_link(page_relative: PurePosixPath, destination: str) -> PurePosixPath | None:
    """Resolve one link destination to a normalized repository-relative path, or None.

    External links, bare fragments and repository-escaping paths return None; encoded segments
    and ``.``/``..`` steps are normalized before the guard lists are applied.
    """
    target = destination.strip()
    if not target or _ABSOLUTE_URL_RE.match(target):
        return None
    target = target.split("#", 1)[0].split("?", 1)[0]
    if not target:
        return None
    target = unquote(target).replace("\\", "/")
    if target.startswith("/"):
        resolved = PurePosixPath(target.lstrip("/"))
    else:
        resolved = page_relative.parent / target
    normalized = PurePosixPath(os.path.normpath(str(resolved)))
    if normalized.parts and normalized.parts[0] == "..":
        return None
    return normalized


def _under(relative: PurePosixPath, root: str) -> bool:
    """Return whether a repository-relative path is *root* itself or inside it."""
    root_path = PurePosixPath(root)
    return relative == root_path or root_path in relative.parents


def _collect_forbidden_links(
    page: Path,
    page_relative: PurePosixPath,
    forbidden: tuple[str, ...],
    findings: list[str],
) -> None:
    """Append one content-free finding per link/image that resolves into a forbidden path."""
    if page.is_symlink() or not page.is_file():
        return
    text = page.read_text(encoding="utf-8", errors="replace")
    for destination in _link_destinations(text):
        resolved = _resolve_link(page_relative, destination)
        if resolved is not None and any(_under(resolved, root) for root in forbidden):
            findings.append(f"{page_relative}: {destination}")


def _check_doc_links(private_root: Path, selection: tuple[tuple[str, str], ...]) -> None:
    """Fail before any target mutation when a doc link crosses the publication split.

    Findings name only the page and destination, never document text. The user-owned TODO is
    never read.
    """
    findings: list[str] = []
    for source_relative, _ in selection:
        if not source_relative.endswith(".md"):
            continue
        source = private_root / source_relative
        _collect_forbidden_links(
            source, PurePosixPath(source_relative), _SHARED_DOC_LINK_FORBIDDEN, findings
        )
    private_dir = private_root / Path(*PurePosixPath(SHARED_DOCS_ROOT, "private").parts)
    if private_dir.is_dir():
        for current_dir, _dirnames, filenames in os.walk(private_dir, followlinks=False):
            current = Path(current_dir)
            for name in filenames:
                if not name.endswith(".md"):
                    continue
                page = current / name
                _collect_forbidden_links(
                    page, _relative(private_root, page), _PRIVATE_DOC_LINK_FORBIDDEN, findings
                )
    if findings:
        raise SystemExit(
            "docs link check failed; no target change was made:\n" + "\n".join(findings)
        )


def _clean_target(target: Path) -> None:
    """Unlink every non-preserved target file/symlink, pruning protected and cache directories."""
    for current_dir, dirnames, filenames in os.walk(target, topdown=True, followlinks=False):
        current = Path(current_dir)
        kept: list[str] = []
        for name in dirnames:
            path = current / name
            if _preserved(_relative(target, path)):
                continue
            if path.is_symlink():
                os.unlink(path)
                continue
            kept.append(name)
        dirnames[:] = kept
        for name in filenames:
            path = current / name
            if _preserved(_relative(target, path)):
                continue
            os.unlink(path)


def _prepare_parents(target: Path, destination_relative: PurePosixPath) -> None:
    """Create destination parents, refusing a symlinked ancestor or a non-directory component."""
    current = target
    for part in destination_relative.parts[:-1]:
        current = current / part
        if current.is_symlink():
            raise SystemExit(f"refusing to copy through a symlinked path: {destination_relative}")
        if not current.exists():
            current.mkdir()
        elif not current.is_dir():
            raise SystemExit(f"destination parent is not a directory: {current}")


def _copy_sources(
    private_root: Path,
    target: Path,
    selection: tuple[tuple[str, str], ...],
    *,
    protected: bool = False,
) -> int:
    """Copy every existing selected source to its destination, preserving file modes.

    An ordinary selection refuses a protected destination. A ``protected`` selection requires one,
    so an explicit protected copy cannot land in the ordinary exported tree.
    """
    copied = 0
    for source_relative, destination_text in selection:
        source = private_root / source_relative
        if source.is_symlink() or not source.is_file():
            continue
        destination_relative = PurePosixPath(destination_text)
        if not destination_relative.parts or ".." in destination_relative.parts:
            raise SystemExit(f"destination escapes the target root: {destination_text}")
        if _preserved(destination_relative) != protected:
            kind = "a protected" if not protected else "not a protected"
            raise SystemExit(f"destination is {kind} path: {destination_text}")
        _prepare_parents(target, destination_relative)
        destination = target / Path(*destination_relative.parts)
        if destination.is_symlink():
            raise SystemExit(f"refusing to overwrite a symlink: {destination_text}")
        shutil.copy2(source, destination)
        copied += 1
    return copied


def main() -> int:
    """Replace the fixed public target from the selected private sources and report the count."""
    private_root = _PRIVATE_ROOT
    # A rehearsal runs against a scratch target without editing the selection.
    target = Path(os.environ.get("EXPORT_TARGET", TARGET_ROOT))
    _validate_target(private_root, target)
    selection = _source_selection(private_root)
    _secret_check(private_root, selection + PROTECTED_COPIES)
    _check_doc_links(private_root, selection)
    _reject_leaked_target(target)
    target.mkdir(parents=True, exist_ok=True)
    _clean_target(target)
    copied = _copy_sources(private_root, target, selection)
    copied += _copy_sources(private_root, target, PROTECTED_COPIES, protected=True)
    print(f"export: copied {copied} publishable file(s) into {target}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
