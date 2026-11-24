# Documentation style guide

This guide governs all written text in the repository that explains the code or the system:

- Markdown documents in `docs/` and the writing in `README.md`
- File headers, doc comments (docstrings), and inline and block comments in source files
- Comments in configuration files and scripts
- Test names and test comments
- The app's interface wording and its translations, under "Interface wording and translations" only

The structure of the repository-root `README.md` is outside this guide. Folder overview pages under `docs/` follow this guide. Commit messages, log text, and command-line output are also outside this guide.

Read the whole guide before writing or editing any document or comment. The rules are binding. If the user's instruction in the current task conflicts with a rule, follow the instruction and state the conflict in the closing report. Paths and names in examples are illustrative and do not list existing files.

## Content rules

These rules apply to every kind of documentation. Experiment reports in the experiment-report directory take the exceptions that "Experiment reports" states.

1. **Current behavior only.** Every statement describes what the code does now and can be checked against source, tests, or configuration. Do not describe history, plans, future work, or alternatives that were considered. Do not use words that state or imply a before or an after: currently, now, new, newly, recently, previously, no longer, legacy, deprecated, removed, shipped, latest, original, originally, former, formerly, prior, replaced, existing, unchanged, still, stays, remain, remains, keeps, survives, later, yet, soon, upcoming, planned, will, eventually, workaround. Some of these words are correct in a statement about the present ("The cache keeps the last 100 entries"). Review each occurrence and rewrite it when it implies history or a future. Do not state that something was accepted, settled, or approved, and do not use labels such as "Settled behavior:".
2. **Only what exists in this repository.** Document what is here. Do not mention absent features or anything outside this repository, and do not list what the system lacks. Do not describe code by what it deliberately omits, and do not call it simple, minimal, or limited by design (for example "intentionally simple", "deliberately minimal", "does not implement X", "only does X"). State the limits and failure outcomes of documented behavior plainly and exactly, as the code produces them.
3. **Rationale as a fact about the present design.** A reason is a statement about the system as it is: "Inference runs on the local machine, so the web server holds no model credentials." It is never a story of how the design was reached. Comments and doc comments in code follow the same rule: a reason is allowed when it points to a fact that holds today, and a reason that is a decision made in the past is not allowed (see "No backstory").
4. **Verified claims only.** State a guarantee only when code or tests enforce it. Write nothing from memory, from another document, or from inference. When a document or comment and the code disagree, the code is correct.
5. **No stubs and no deferred work.** Do not write "coming soon", "not available yet", empty sections, placeholder text, or `TODO`, `FIXME`, `HACK`, or `XXX` comments. A page that cannot be written yet is not created and not added to the workspace's documentation index. Unfinished work is reported to the user and never left in the files.
6. **No traces of authorship.** Documents and comments never refer to this guide, to agents, to authoring conventions, or to how they were produced. They carry no author names, initials, dates, ticket numbers, or version stamps.
7. **No sensitive details.** No document or comment contains secrets, credentials, hostnames, network addresses, deployment paths, or worker topology, and none describes a hosted or cloud deployment. Examples use generic values such as `localhost` and `example.org`. Exception: a page in the private set may name the real hosts, remote targets, local environments, deployment paths and configured values, and may describe the private deployment and its hosted parts. It never contains a secret or credential.
8. **No confidentiality commentary.** Documents and comments never classify data, files, or behavior as private, confidential, internal, or non-confidential, and never refer to private resources. They state what the code reads, writes, and does with its inputs, by name and function. Avoid phrases such as "Non-confidential only", "private configuration bridge", and "never resolves a selected pointer". Write what the code accepts and does, for example "Reads the values listed in `ALLOWED_KEYS` from the environment." A page in the private set names private-only code and the private deployment by name, and the same rule applies to everything else on it. The words public and private that name a product concept, such as the public configuration files or a private issue tracker, are product terms and are allowed.

## Writing rules

These rules apply to every kind of documentation.

- Plain, factual English. Short sentences. Active voice. Present tense.
- Readability comes first. A paragraph that runs on is hard to read even when every sentence is correct. Give one idea to one paragraph, and start a new paragraph when the subject changes.
- Watch paragraph length on the rendered page, not only in the diff. A block over about 1000 characters or over four or five sentences usually needs a break. The documentation checker prints a `paragraph length` hint for a block over 1000 characters, and the hint is a prompt to look, not a quota or a failure.
- A long block often hides structure. When several sentences share one subject or repeat one pattern, use a list, a table, or a short sequence of paragraphs.
- The words "we", "our", and "us" are never used. First person is never used.
- Technical and developer pages, comments, and doc comments are impersonal and never address the reader. Developer procedures may use the imperative ("Run the migration").
- User pages use the imperative for steps ("Select an item, then open the **Details** tab") and impersonal prose for description ("The list shows every matching item"). Use "you" only when the reader's own situation is the point ("If you have not completed the requirement, the item is marked unavailable"). Use it rarely.
- No dashes used as punctuation: no em dash, no en dash, no spaced hyphen (` - `), and no double hyphen (`--`) in prose. Use a comma, period, or parentheses. Write ranges with "to". A hyphen appears only inside a compound word. Literal code, such as a command-line flag, is exempt.
- No semicolons. Write two sentences, or join with a comma and a conjunction. Use a colon only to introduce a list or a following explanation, never to join two independent clauses. Literal code is exempt.
- No taglines, slogans, or marketing language. No words that praise or judge the code or the system: honest, clean, elegant, clever, redundant, trivial. No rhetorical questions, exclamation marks, or emoji.
- Do not frame a statement by negating a misreading. Write "The operation returns one result per item", not "The operation is not about fewer items, it is about better ones." Never write "it is not X, it is Y".
- Avoid filler and intensifiers: simply, simple, just, merely, deliberately, intentionally, easily, obviously, of course, powerful, seamless, robust, leverage, "in order to", "note that". Do not write "etc." or "and so on". List every item or name the category.
- Numbers: spell out one to nine in running prose. Use digits for 10 and above, for every value with a unit, and in tables. Write units with a space ("512 tokens").
- Humor is not used. If a place seems to suit a lighter touch, propose the exact sentence in the closing report and leave it out of the file until the user approves it.

Examples:

| Avoid | Write |
|---|---|
| We then merge the results. | The merge combines the results by canonical item. |
| The app currently supports English only. | The app matches English text. |
| It's super easy to reset an item! | Select **Reset** to restore the item's original value. |
| This was added to avoid duplicates. | The merge returns one result per canonical item. |

## Terminology and values

- The glossary named in `AGENT-INSTRUCTIONS/LOCAL/documentation-pages.md` is the source of truth for terms. Read it before writing. Use each term exactly as defined, in documents and in comments, and use one term for one concept. Never introduce a synonym or an undefined shorthand.
- The documentation names the product, because it describes the product rather than one deployment. It never uses a deployment instance's name, an organization's product name or an organization's brand colour; the workspace's own naming belongs in `AGENT-INSTRUCTIONS/LOCAL/documentation-pages.md`. A statement about an organization's data names the organization by its own name.
- When a document or comment needs a term the glossary lacks, do not invent one. Report it through the term request the role instructions define, or as a proposed glossary entry in the closing report.
- State a value when the reader needs it to understand or operate the system. Examples: a model context size, a threshold, a limit, a timeout. Give the value with its unit and name the configuration key that sets it. Do not state a value the reader does not need, such as a default file path that is obvious from context.
- Inline code formatting is for identifiers, configuration keys, environment variable names, commands, file and folder paths, and literal values. In user pages, interface labels are bold. Do not use bold or italics for emphasis in running prose.

## Interface wording and translations

The workspace's interface strings, their translations and the file that owns them live in
`AGENT-INSTRUCTIONS/LOCAL/documentation-pages.md`. A workspace with no translated interface strings
drops this section.

## Markdown documents

### The documentation set

The workspace's documentation set, its parts, and which of them are published live in
`AGENT-INSTRUCTIONS/LOCAL/documentation-pages.md`.

### Page kinds

Every page is one of five kinds. The kind decides depth, placement, and what the page may contain. A page never states its kind, and no page contains a phrase such as "for users" or "for developers". The separation is structural only.

| Kind | Subject | Where it lives | Diagrams | Images |
|---|---|---|---|---|
| User | How to use the app: what each part does and how to use it | Published documentation | None | Screenshots |
| Technical | How the system behaves: guarantees, states, outcomes, boundaries, configurable settings, and the reasons behind the architecture | Published documentation | Yes | None |
| Developer | How the system is built and changed: structure, data structures, algorithms, exact formulas, tables and columns, where to change what, and how it is tested | Repository only | None | None |
| Setup | How to install and run a copy: ordered procedures | Repository only | None | None |
| Experiment report | What an experiment asked, how it ran, what it measured and where it ended, in the experiment-report directory only | Published documentation | Yes | Charts |

- **User pages** are a separate subject from the technical material, not a shallow version of it. They contain no code identifiers, file paths, or internals. They use interface labels exactly as the app shows them, read from the default-language wording source rather than retyped.
- **Technical pages** serve the operator, owner, project manager, architect, and reviewer. They have wide coverage and high resolution: every state, outcome, and boundary is stated exactly. They name systems and components. They name a file only when that is the clearest way to point at something. They may name configuration keys.
- **Developer pages** cover the same subject as the matching technical page at greater depth. They name files, modules, and symbols, and they say where to change a behavior and which tests cover it.
- **Setup pages** state prerequisites first, then numbered steps. Each step with a visible result states that result.
- Report pages are the section index, the category overviews, the method pages and the reports in the experiment-report directory. "Experiment reports" below states their rules.

### Behaviour and mechanism

A published page keeps the behaviour, the guarantees, the states, the outcomes and the configurable
settings a reader can rely on. Mechanism moves to a developer page.
`AGENT-INSTRUCTIONS/LOCAL/documentation-pages.md` owns how its pages are described and where the
mechanism belongs.

### Page structure

- Pages have no front matter. A published page takes its title from the first H1 and its summary from the first paragraph.
- Exactly one H1, at the top, in sentence case. It names the subject and is unique across the documentation set.
- The first paragraph is one self-contained sentence of at most 30 words that states what the page covers. It contains no links and no formatting.
- Use H2 for the main sections and H3 for subsections within an H2. Do not skip levels. Do not use H4 or deeper.
- Headings are sentence case, short, and specific. Do not number headings. Do not use generic headings such as Introduction, Overview, Summary, or Conclusion.
- Each page covers a coherent subject. Split it when separate subjects or the reading flow justify separate pages, not when a heading or word count reaches a quota. Discuss a scope change with the orchestrator instead of silently omitting coverage.
- Open with what the thing is and what it does. Order the rest by what the reader needs next. No fixed page template applies.
- Use prose for explanation. Use a list for parallel items or sequences, numbered when order matters. Use a table only for tabular data such as states, outcomes, and configuration keys, with a header row and short cells.
- Every code fence has a language tag: `bash`, `toml`, `python`, `json`, `sql`, `svg`, or `text` for output and anything that is not code. An untagged fence is not highlighted. Show one command per line without a prompt symbol.
- Callouts use the GitHub alert syntax (`> [!NOTE]`, `> [!TIP]`, `> [!IMPORTANT]`, `> [!WARNING]`, `> [!CAUTION]`), followed by blockquoted text. Use them where they help the reader, including in guides. `NOTE` gives useful context, `TIP` gives a practical shortcut or technique, `IMPORTANT` identifies a prerequisite or decisive constraint, `WARNING` flags an action with a significant consequence, and `CAUTION` flags a risk requiring particular care. Match the type to the message. Use callouts sparingly, without decorative filler or repeating adjacent prose. There is no fixed per-page count.
- Write plain Markdown only. No HTML.
- Never write a modified date, a reading time, a breadcrumb, previous or next links, or a page outline into a page. The published documentation generates them where the workspace publishes one.
- Subject file names are lowercase ASCII kebab-case, end in `.md`, and name the subject. They carry no numbers for ordering, no dates, and no words such as new, old, final, or v2. Folder overview pages use the exact filename `README.md`. A developer page is named for the mechanism it describes, such as `minimum-route-solver.md` beside `minimum-route.md`.

### Page composition

- There are no quotas for tables, lists, callouts, examples, code snippets, images, or sections. There is no target page or word count. Choose the amount and mix that make the subject complete, readable, and easy to scan. Do not omit necessary coverage or add filler to meet a count.
- Choose the presentation that explains each part: prose for relationships and reasons, numbered steps for procedures, tables for comparable states or settings, and short code fences for verified commands, configuration, or implementation examples appropriate to the page kind.
- A page may contain several diagrams or screenshots. There is no per-page image quota or one-image limit. Each image explains a distinct point, appears beside the prose it supports, and follows the page-kind rules.
- Split dense visual explanations into focused diagrams. Show different interface states in separate screenshots when they clarify different actions or outcomes. Avoid images that repeat the same information without helping the reader.
- Code snippets are complete enough for their stated purpose, match the source, and have a language tag. Technical pages may show a short command or configuration example that explains a supported action or setting. Internal algorithms and detailed implementation examples belong on developer pages. User pages contain interface instructions rather than code.
- Use the permitted Markdown elements to make a page readable, not to decorate it. Tables, code fences, callouts, and images serve the explanation and do not replace complete prose.
- A brief's diagram list names required ideas, not a maximum image count. Add a focused diagram or a screenshot the scoped subject needs, and report every added asset.

### Links and source references

- Every link to a file in this repository starts with `/` and gives the path from the repository root: `/docs/area/page.md`. Never use `../` or `./`. This form resolves the same way on a published page and in a repository viewer, at any folder depth.
- A link to a heading on another page appends the heading's slug: `/docs/backend/search.md#tiers`. A link within the same page is `#slug` alone. A slug is the heading in lowercase with spaces replaced by hyphens and punctuation removed.
- Links to external sites are rare, use `https://`, and point to stable sources the reader needs. Do not link to the live app by path.
- Link text names the target. It is never "here", "this page", or the bare path.
- Verify every link: the target file exists, and a linked heading exists on that page. A wrong link to a Markdown file or folder builds without any error and fails only for the reader. A link to a page another brief is writing in the same round is allowed only when the brief names that path, and every such link is listed in the closing report.
- Developer pages cite source by repository path and symbol name in inline code: the file that defines a symbol, and the symbol itself. They never cite line numbers. Technical pages describe systems and mostly avoid file paths. User pages cite neither.
- A link from a published page to a Markdown file the workspace does not index opens that file in the repository. Technical pages use this to reach developer pages.
- Link the first use of a glossary term on a page only when the reader benefits. Do not link repeated uses. There is no fixed glossary-link count. Prefer the page that explains the subject when it provides more useful context.

### Diagrams

Diagrams appear only on technical pages and experiment reports. They are SVG files in the diagrams directory, or in the private one on a private page, drawn by hand as plain SVG, one idea per diagram.

**Rules**

- Name the file for its subject in kebab-case, such as `search-pipeline.svg` inside the diagrams directory. Names are unique across the folder. Update a diagram in place. Delete a diagram that no page uses.
- Allowed kinds: component, deployment, sequence, state, entity-relationship, and flowchart. Use standard UML notation for the kind. Deployment diagrams show logical parts and never hostnames or addresses.
- A diagram shows the current system, verified against source. Node text uses glossary terms exactly.
- Keep each diagram focused and readable at its displayed size. Split it when its relationships become difficult to follow, not at a fixed node count.
- The page prose states every fact the diagram shows. The diagram supports the prose and never replaces it. Introduce the diagram with a sentence.
- In the page, embed it as `![Alt text](<diagram path>)`. The alt text is one to three sentences stating what the diagram shows and its key relationships. It never starts with "Image of" or "Diagram of".

**Format**

- `viewBox` width 960. Height as needed, at most 720. No fixed `width` or `height` attributes.
- Plain SVG only: no scripts, no external files, no web fonts, no embedded raster images, no gradients, shadows, or filters. Set `font-family="system-ui, sans-serif"` on the root element.
- Include `<title>` and `<desc>` elements and `role="img"`.
- Every SVG draws its own opaque background rectangle with rounded corners, so it reads the same on a published page and in a repository viewer, in any display mode.
- Labels use a font size of 14 to 18. Estimate text width as 0.6 times the font size per character, and make each box at least that wide plus 32 units of padding. Text must never overflow its box. Compute the widths; do not eyeball them.
- Flow runs left to right or top to bottom. Label an arrow whenever its meaning is not obvious. Use a dashed line for optional, asynchronous, or derived relationships and explain dashes in a small legend when used.
- Do not rely on color alone. Distinguish elements by label, shape, or line style as well.
- Confirm the file is well-formed XML with `xmllint --noout <file>`.

**Layout procedure.** Compute the layout, then render and inspect it. Follow every step.

1. Decide the content first: the nodes, and one sentence per arrow saying what it means and which way it points. Every arrow must be a true statement about the code. Drop any node or arrow that the page prose does not state.
2. Lay the nodes on a grid. Pick column x positions and row y positions with at least 48 units of empty space between boxes horizontally and 32 vertically. Give all boxes in one column the same x and width.
3. Size every box from its longest text line: width at least `characters × 0.6 × font size + 32`. Write a node subtitle at font size 14 and keep it to one short line, at most about 28 characters. Box height is 40 for one line, 64 for a title plus a subtitle. Put the title baseline 26 units below the box top and the subtitle 22 units below that.
4. Check every pair of boxes for overlap, and check that every box lies at least 24 units inside the background rectangle.
5. Arrow style, binding for every diagram:
   - Orthogonal lines only, drawn as `<path>` or `<polyline>` from horizontal and vertical segments. Never a diagonal line.
   - An arrow leaves its source through the middle of the right edge (or the bottom edge in a top-to-bottom flow) and enters its target through the middle of the left edge (or the top edge). A side entry into a box from below or above in a left-to-right flow is not allowed.
   - Route with at most two bends. Put the vertical segment of each routed arrow in its own lane, at an x position halfway into the gap between the columns, and give two arrows in the same gap lanes at least 20 units apart.
   - Fan-out and fan-in: when one box connects to several boxes in the next column, the arrows leave or enter at distinct points on the shared edge, spaced at least 32 units apart, with a taller box where needed, and each runs in its own lane. Never start several arrows from one point.
   - No arrow crosses a box, a label, or another arrow, and no two arrows share a segment.
   - Arrowheads use the skeleton marker and touch the target edge exactly.
6. Place an arrow label in empty space beside its line, at font size 14, never on top of a box or another line. Leave a gap of at least 8 units between the label and anything else. Cardinality labels (`1`, `N`) on entity-relationship diagrams sit 6 to 10 units from the line, next to the end they describe, one label per end, and never touch another label.
7. Put the legend, when one is needed, in its own reserved area at the bottom or in an empty corner, sized from its text like a box, and check it overlaps nothing.
8. Set the `viewBox` height to the lowest drawn element plus 32 units.
9. Run the documentation checker on every diagram created or changed. It renders each one and prints a PNG path; the command is in `AGENT-INSTRUCTIONS/LOCAL/docs-tools.md`.
10. Open every printed PNG with the image reader. Inspect the rendered text, boxes, arrowheads, arrow routes, labels, legend, margins, and flow. Fix overlaps, overflow, crossings, unclear relationships, and wasted space. Rerender and reopen each changed diagram until the preview passes visual inspection. Passing XML or automated geometry checks is not a substitute.

The writer renders every created or changed diagram, opens the rendered image, and inspects it before returning it for review, and inspects a fresh render after each correction. The documentation orchestrator reviews every created or changed diagram by looking at its rendered image. If rendering is blocked, report the exact blocker and mark visual verification blocked instead of claiming the diagram passed.

**House style**

Every diagram looks like one set drawn by one hand. A diagram created or changed matches the existing diagrams in every visual aspect, not only the palette. Before drawing, open two or three existing diagrams of the same kind, read their SVG source, and copy their conventions. A convention that no existing diagram covers follows the nearest one and is reported in the closing report. The set uses these conventions:

- Canvas: `viewBox` width 960, a background rectangle with `rx="12"`, and content kept 24 to 64 units inside the background edge, with the same margin on the left and right of one diagram.
- Boxes: `rx="8"`, node fill and outline from the palette, `stroke-width="1.5"`. A box with a title and a subtitle is 64 units high, and a one-line box is 40. Boxes in one row share a height, and boxes in one column share an x position and a width.
- Text: a title at font size 16 in primary text and a subtitle at font size 14 in secondary text below it, both centred in the box (`text-anchor="middle"`). Entity-relationship diagrams use 15 for their field rows. No bold, no italics, no other sizes.
- Arrows: the skeleton marker (`id="arrow"`), and `arrow-accent` with the accent fill for an accent arrow. Lines are `stroke-width="1.5"` and orthogonal. Arrow labels are font size 14 in secondary text, beside the line.
- Dashed lines: `stroke-dasharray="5 4"`, with one meaning per diagram, stated in the legend.
- Legend: present only when a line style or the accent needs one. It is an unfilled box with the node outline (`fill="none"`, `rx="8"`) in the bottom-left corner, with one row per entry: a 40-unit sample line drawn in the same style as the diagram's line, then its label at font size 14 in secondary text.
- Group or section captions inside a diagram: font size 16 in secondary text, left-aligned above the group.
- Accent: the accent color marks only the key path or boundary, and the strong accent fill marks one element at most.
- Wording: node and label text in sentence case, with glossary terms and no closing punctuation.

**Palette.** Use only these colors.

| Role | Value |
|---|---|
| Diagram background | `#232434` |
| Node fill | `#2e3045` |
| Node outline | `#4a4c6b` |
| Arrows and connecting lines | `#a3a4b8` |
| Primary text | `#ececf2` |
| Secondary text | `#a3a4b8` |
| Accent for the key path or boundary | `#a98ae0` |
| Strong accent fill, one element at most | `#5a1e9c` |

**Skeleton**

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 240" role="img"
     aria-labelledby="t d" font-family="system-ui, sans-serif">
  <title id="t">Search pipeline</title>
  <desc id="d">A query enters the search stage.</desc>
  <defs>
    <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5"
            markerWidth="8" markerHeight="8" orient="auto-start-reverse">
      <path d="M0 0 L10 5 L0 10 z" fill="#a3a4b8"/>
    </marker>
  </defs>
  <rect width="960" height="240" rx="12" fill="#232434"/>
  <rect x="48" y="80" width="200" height="80" rx="8"
        fill="#2e3045" stroke="#4a4c6b" stroke-width="1.5"/>
  <text x="148" y="126" text-anchor="middle" font-size="16" fill="#ececf2">Query</text>
  <line x1="248" y1="120" x2="328" y2="120" stroke="#a3a4b8"
        stroke-width="1.5" marker-end="url(#arrow)"/>
</svg>
```

### Experiment reports, charts and screenshots

The workspace's experiment report, chart and screenshot rules, and the commands that produce and check
them, live in `AGENT-INSTRUCTIONS/LOCAL/documentation-pages.md`.

## Code documentation

Code documentation is the text inside source, configuration, ignore, script, and test files. It uses the content rules, writing rules, and terminology above. The rules below add what is specific to code. Identifier naming is outside this guide.

### Placement

- Documentation lives next to the code it describes and is complete without leaving the file.
- A comment explains what is local to the code beside it. Explanation that spans modules, or that needs more than a short comment, belongs in a developer page. Source never names a document: state the fact where the code is, and keep the wider explanation on the developer page.
- A comment never duplicates a document and never points at one by path.
- Read the code a comment describes, and its callers when the comment makes a claim about them, before writing it. Write nothing from memory or from another document.

### No backstory

Documentation in code never records how or why the code came to be. This applies to inline comments, block comments, doc comments, file headers, configuration comments, and test comments.

Backstory includes: what the code replaced, which versions or approaches came before, why something was added, what problem or incident prompted it, which version is "current", "latest", or "shipped", and any account of a decision.

A comment states what the code is and does today. Use this test: a sentence is allowed only if it would be equally true had the code always been written this way. A sentence that needs a past to make sense is backstory and is deleted.

Version numbers follow the same rule. A comment states which values are valid and what each selects. It never calls a value current, latest, or shipped.

Plan identifiers, ticket numbers and survey ids, such as `u12_2`, are backstory too: a comment names none.

Avoid:

```toml
# Shipped complete-target prompt and result-schema version. v9 is the current complete-target
# prompt and v2 is the matching strict schema that carries zero-or-more per-finding `finding_flags`
# on every option and equivalence group. Only the current v9/v2 contract is loadable.
```

This comment narrates versions ("shipped", "current", "matching") instead of describing the setting, and it repeats "current" to justify the value.

Write (the facts shown here are illustrative; confirm them in source before writing):

```toml
# Prompt version for complete-target analysis, paired with result schema version 2.
# The only loadable pair is prompt 9 with schema 2. Every option and equivalence
# group in a result carries zero or more `finding_flags`.
```

This version states the meaning, the valid values, and the effect, and every sentence would be equally true had the pair never changed.

### File headers

- Every source file, script, and test file begins with one sentence stating the file's responsibility, in the language's block-comment or module-docstring form. Configuration formats that allow comments begin the same way. Two sentences on the header line are one sentence too many: fold them into one, or move the second into the following paragraph.
- The header is one sentence ending in a period and names the subject, such as "Build the explicit documentation allowlist into a typed registry." One further paragraph of present-tense description may follow the header. The header itself contains no author, date, or version line. A license notice appears only when the license requires one.

### Doc comments

- Every exported or public function, method, hook, class, component, type, and constant has a doc comment in the form native to the language and consistent with the file, such as `"""..."""` in Python and `/** ... */` in TypeScript. A private item has one when its purpose is not obvious from its name and body.
- Functions and methods open with one imperative sentence ("Build", "Return", "Resolve"). Classes, types, modules, and constants open with a noun phrase or a present-tense sentence stating what the thing is.
- After the first sentence, state only what the code and its signature do not show: units, valid ranges, preconditions, guarantees, error conditions and what raises them, side effects, ownership and mutability, and ordering requirements.
- Document a parameter or return value only when its name and type leave something unsaid. Do not restate type annotations. Where the repository already uses tag syntax such as `@param` or a docstring section format, follow it everywhere. Where it does not, use prose.
- Examples in a doc comment are minimal, correct, and run as written.

### Inline and block comments

- A comment explains what the code cannot express: the constraint that makes a non-obvious choice necessary, an invariant, a constraint from an external system, a unit, an ordering dependency, the meaning of a literal value, or a subtle edge case.
- Do not restate what the code does. Delete a comment that a clearer name or a small function would make unnecessary.
- State a constraint as a present fact: "The upstream service returns local time, so the value is converted to UTC here." Do not describe a fix, a change, a workaround, or the reason a choice was made over another. If the only available reason is a decision made in the past, the code carries no comment.
- Place a comment on the line above the code it explains. A trailing comment is allowed only for a unit or a short label.
- Write complete sentences in sentence case ending with a period. One comment explains one thing. Wrap at the line length the repository's formatter uses, such as 100 columns in Python and the Prettier width in web files.
- Do not leave commented-out code, decorative banners, or divider lines. Source code has no section-heading comments: structure it with functions and modules. Plain group labels are allowed only in configuration, ignore, and script files (see the next section).

### Configuration, ignore-file, and script comments

- Comment each setting whose meaning, unit, valid range, or effect is not obvious from its key. State the meaning and unit first, then the valid range, then the effect of changing it. State the default when the line does not show it. Do not state a computed total that drifts when another value changes: state the relation instead.
- Place the comment on the lines directly above the setting. Group related settings under one comment when they share a meaning.
- A group label is one line of plain text that names the group, with no decoration, such as `# Frontend dependencies and build output`. Labels are allowed in configuration, ignore, and script files. A label names what the group contains and carries no history or decision.
- A script's header sentence is followed by a usage line and a one-line description of each option or argument.

### Tests

- A test name states the verified behavior as a present-tense verb phrase: "publishes only config-listed documents in navigation order", "fails on a missing root-relative image". It does not start with "should" or "test" beyond the framework's required prefix, such as `test_` in Python.
- A test name states behavior, not implementation.
- A comment or docstring in a test explains the scenario or fixture only when it is not clear from the code, and it claims only what the test asserts.
- Renaming a test function is allowed only when the brief or handoff names it. Check that nothing else refers to the old name.

## Process

1. Read this guide and the glossary.
2. Read the source and tests for the subject before writing anything. Read the actual files. Never write from memory or from another document.
3. Confirm each guarantee in code or tests. Where behavior cannot be determined from source and tests, ask the user instead of guessing. Ask when two documents disagree, when a page's kind or location is unclear, or when a decision-critical fact is missing. Batch the questions.
4. Write the documents and comments. Add the workspace's index entries when it has an index. Link the images.
5. Update documents and comments in the same change as the code they describe. Remove any statement that stops being true.
   For a documentation restructure, preserve the leaf content unless a scoped correction requires a change, and update incoming links and index entries for every move.
6. Run the self-check below.
7. Return the closing report.

## Self-check

Before returning, check every changed file.

- [ ] Search documents and comments for the characters `—` and `–`, for ` - ` and ` -- ` used as dashes, for `;` and for a `:` that joins two clauses, and for the words we, our, us. Fix every hit.
- [ ] Search documents and comments for the words in content rule 1, the filler and intensifier words, the praise and judgment words, and accepted, settled, approved. Review each hit. Rewrite it when it implies history, a future, or a past decision, or when it is filler. Keep it only when it states a present fact or is a literal product label or value.
- [ ] No document or comment calls anything private, confidential, internal, or non-confidential, and none refers to a private resource.
- [ ] No `TODO`, `FIXME`, `HACK`, or `XXX`, no commented-out code, and no banner or divider comments.
- [ ] No author, date, ticket, or version stamp in any comment or header.
- [ ] No comment contains backstory: each sentence would be equally true had the code always been written this way, and no value is called current, latest, or shipped.
- [ ] Every source file has a one-sentence header (one further description paragraph is allowed). Every public item has a doc comment. Every comment explains something the code does not show.
- [ ] Every page has one H1. The first paragraph is one sentence of at most 30 words with no links and no formatting. No heading levels are skipped.
- [ ] No sentence names a reader group, refers to anything outside this repository, or mentions what the system lacks.
- [ ] Every claim was confirmed in source, tests, or configuration.
- [ ] Every term matches the glossary.
- [ ] Every code fence has a language tag.
- [ ] Every link starts with `/docs/` (or another repository root path), and every target file and heading exists.
- [ ] Every image link points into the diagrams directory or the screenshots directory, the charts directory on an experiment report, or into the private set on a private page, and has alt text.
- [ ] Every chart was generated from its data file, every value it plots stands in a table on its page, and its render was opened and inspected.
- [ ] An experiment report names, links and quotes none of the sources it was written from, and every number in it comes from the recorded evidence.
- [ ] Presentation fits the material and page kind. Each image or code snippet serves a distinct explanation, and every referenced screenshot is an actual capture.
- [ ] Each new SVG uses only the palette, has `<title>` and `<desc>`, is well-formed, and has no text overflow.
- [ ] Every created or changed diagram has a rendered image that the writer opened and visually inspected and that the orchestrator reviewed, or an explicit rendering blocker. The closing report identifies the final previews and the checks performed.
- [ ] When the workspace publishes a documentation index, each published page has a valid entry in it. No developer or setup page has one.
- [ ] Area READMEs contain complete explanations, and the documentation index nests subject pages under their proper parents, within three levels. Inspect the rendered navigation where the workspace publishes it, including expansion and the selected page's ancestors.
- [ ] Every moved page has its destination, incoming links, and index path checked.
- [ ] No file contains secrets, hostnames, addresses, or deployment paths, except a page in the private set, which may name the private host, paths and configured values but never a secret.
- [ ] No shared page links into the private set, and no page links to `AGENTS.md` or `AGENT-INSTRUCTIONS/`.
- [ ] Every changed interface string reads naturally in every language the workspace translates, uses the same term for the same concept, fits every value of its placeholders, and keeps its key. Every user page and screenshot that shows a changed default-language value is updated.

## Closing report

End every task with a short report containing:

- The documents created, changed, or deleted, the source files whose comments changed, and the interface strings whose wording changed.
- The documentation index entries added or changed, where the workspace has an index.
- The capture requests: for each screenshot, the file path, the screen or tab, the app state to set up, and what must be visible.
- The proposed glossary entries.
- The discrepancies found between existing documents or comments and the code.
- The questions that remain open.
- Any proposed humor exceptions.
