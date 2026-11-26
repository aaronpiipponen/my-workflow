# Root README guide

This guide governs the repository-root `README.md`: its header, its sections and their order, and
the elements it uses. The root README is the first page a visitor reads, so it states what the
product is, why it exists, what it does and how to run a copy, and links to the documentation for
everything deeper.

## Scope and enforcement

- `DOCUMENTATION-STYLE-GUIDE.md` governs the wording: plain present-tense English, no history, no
  filler, no dashes as punctuation, no semicolons, glossary terms and verified claims. Its page
  structure rules give way to this guide where the two differ: the root README uses HTML for its
  centred header and images, and its first paragraph is the header's summary sentence.
- The documentation checker does not check the root README, and no automated gate blocks on it.
  The user reviews the whole README before it is approved. The writer lists in the closing report
  every place the README departs from `DOCUMENTATION-STYLE-GUIDE.md`, with the reason.
- The release that changes the root README checks its images visually, as it does every other
  documentation image. The README is outside the checker, not outside the visual check.

## Sources

- `DOCUMENTATION-STYLE-GUIDE.md` for the wording.
- `AGENT-INSTRUCTIONS/LOCAL/documentation-pages.md` for the product's name, its glossary and the
  addresses of its published pages.
- `AGENT-INSTRUCTIONS/LOCAL/publish.md` for the public repository's address and its badges.
- The brand assets the workspace names for the logo.
- The workspace's screenshot capture material for every screenshot, and its diagrams directory for
  every diagram. The README uses only captured screenshots and hand-written diagrams, as every
  other documentation page does.

## Header

The header is centred and comes before everything else, in this order:

1. The logo from the brand assets, when the repository has one, in a `<p align="center">` block,
   with the product's name as its alt text.
2. One sentence that states what the product is.
3. Optional deployment links: the running site and its documentation, in one sentence.
4. The badges, in one `<p align="center">` block: continuous integration, license and version,
   each a link to what it reports.
5. A horizontal rule (`---`).

## Contents

A bold **Contents** label and a list that links each top-level section by its heading slug
follows the header.

## Sections

The sections come in this order, with headings close to these titles. A section that does not
apply to the repository is left out, never left empty.

1. **Why it exists.** The problem the product answers, from its user's side, and the principles
   that shape it.
2. **What exists in the project.** The parts the repository holds, one line each.
3. **Features.** One H3 subsection per feature, each with a short paragraph that states why the
   feature exists and what it does, and a screenshot of it in use when the feature has something to
   see. Link the documentation once for the section, not after every subsection: a repeated
   "user guide, technical page" line under each feature is noise. Put a link only where a feature
   needs a pointer the documentation index does not already give.
4. **Tech stack.** A table of the layers, their technologies with versions, and the role of each.
5. **Architecture.** A short paragraph on who owns behaviour, state and change, and a
   `Repository layout` subsection that lists the top-level source folders, each linked, with one
   line on what it holds. When the repository is large enough to warrant one, one sentence
   introduces the architecture diagram and the diagram follows it.
6. **Data and limits.** What the product depends on, where its facts come from, and where it
   stops.
7. **Run your own copy.** The requirements as a list, then numbered steps, each step with its
   command and its visible result, and links to the setup pages for the full procedure.
8. **License.** One sentence naming the license and linking the license file.
9. **A closing section on the project's standing**, such as `Independent project`, when the
   product presents third-party data or names organizations it is not affiliated with.

## Elements

- **Alert blocks.** GitHub alerts (`> [!NOTE]`, `> [!TIP]`, `> [!IMPORTANT]`, `> [!WARNING]`) mark
  the statements a reader must not miss, each for its intended meaning as
  `DOCUMENTATION-STYLE-GUIDE.md` defines them. A section holds at most one or two of them.
- **Images.** A screenshot or diagram is a Markdown image, or a centred `<p align="center">` block
  with an `<img>` and a `width` when the image is narrow. Every image has descriptive alt text of
  one to three sentences that states what it shows.
- **Images when they help.** A feature gets a screenshot when the screen explains it faster than
  prose. A repository large enough that its parts and their relationships need a picture gets one
  architecture diagram in its Architecture section. A small repository needs no diagram, and a
  product with no visible surface may have no screenshot. Images are never forced.
- **Links.** A link to a repository file starts with `/` and gives the path from the repository
  root. A link to a published page uses its full address from
  `AGENT-INSTRUCTIONS/LOCAL/documentation-pages.md`.

## Visual checks

The README's images are part of the release's overall visual pass (`RELEASE-WORKFLOW.md`, "Visual
pass"). That pass covers every visual the release changed or found stale: the root README's
screenshots and architecture diagram, the documentation's screenshots and diagrams, the rendered
pages and the interface. The release captures or renders each one, opens it, inspects it and fixes
it at its source. The README is not checked apart from the rest, and an image whose preview was not
inspected is an open item in the closing report.

## Closing report

The writer's closing report lists the sections written or changed, the screenshots and diagrams
the README uses with their previews when it has any, every departure from
`DOCUMENTATION-STYLE-GUIDE.md` with its reason, and the questions that remain open.
