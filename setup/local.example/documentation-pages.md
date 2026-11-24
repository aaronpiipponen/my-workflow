## Interface wording and translations

<The file that owns every app-authored interface string (labels, buttons, menus, dialogs, notices,
help text, accessible names and error messages), the languages it carries, and the conventions each
language uses. This section is the only part of the guide that governs those strings. Delete this
section when the workspace has no translated interface strings.>

- **Natural in each language.** Each language reads as if a native speaker wrote it for the app's
  reader. Translate the meaning, not the words: change the word order, split or join sentences, and
  use the idiom the language uses. A word-for-word copy of the default language is a defect even
  when it is grammatical.
- **One concept, one term, per language.** Each language's terms match the glossary and the term
  that language uses for the same concept elsewhere in the file. Search the file for the concept
  before choosing a word.
- **Interface conventions of the language.** Labels and buttons use the form apps in that language
  use. Messages are short, plain and present tense, without marketing language, exclamation marks
  or emoji.
- **Length that fits the layout.** A longer form in one language must not overlap, clip or crowd
  other content where it renders. Look at a lengthened string on the review instance at desktop and
  narrow widths.
- **Grammar that fits every value.** A translated string agrees in case and number with every value
  its `{placeholder}` receives. Read the call sites to see what fills each placeholder. When one
  form cannot fit every value, rephrase the string so it does instead of producing a wrong form for
  some values.
- **A key follows its default-language value.** The key is the default-language literal, or that
  literal with a context suffix. A change to a translated value leaves the key as it is. A change to
  the default-language value renames the key to the same text and updates every call site in the
  same change. Every `{placeholder}` name stays the same.
- **Labels and their documents change together.** User pages quote the default-language values in
  bold, and screenshots show them. A change to such a value updates the user pages that quote it and
  recaptures the screenshots that show it in the same change.
- **Text in the interface comes from the wording file.** A user-visible string written directly in a
  component is a defect, reported to the code owner.
- **Keep the file's formatting.** Double quotes, the existing indentation and line breaks. Do not
  reflow unchanged entries.

### Authorized exceptions

<The user-authorized exceptions to the rules above. Each states what it allows and why it is not a
defect. Delete the list when the workspace has none.>

### The documentation set

- `docs/` is one folder organized by area of the system, not by reader. Follow the tree that exists.
  Ask before creating a new top-level folder.
- <The shared set is the part exported to the public checkout. The private set is the part that is
  never exported. Name both paths here.> A shared page never links into the private set, and no page
  links to `AGENTS.md` or `AGENT-INSTRUCTIONS/`.
- <The user-owned file, if any, is never read as task input, edited, moved, listed or linked.>
- Group related subjects into broad areas. A package or leaf subject does not require its own
  folder. Technical and developer pages about the same subject belong together.
- Give each substantive area one `README.md` overview. It explains the area, relates its subjects,
  and introduces its child pages through useful links. It follows the content and page-structure
  rules, with a subject-specific H1. It is not a stub or a link list alone.
- <The directories for diagrams, screenshots, charts and experiment reports. No diagram,
  screenshot or chart lives anywhere else, except a private-only one under the private set.>
- <The glossary page. It is the source of truth for terms.>
- `docs/` holds documents that describe the current system. It never holds plans, decision records,
  status files, notes, to-do lists, changelogs, or history pages. <Name the exceptions this
  workspace has, such as requirements or experiment reports.>
- <The index file that selects which pages are published, when the workspace publishes them. A
  Markdown file that is not listed there is read on the repository host only. A new page is added
  to the index in the same change that creates it, and the index never lists developer pages, setup
  pages, the user-owned file, or a page without full content.>
- <Which pages are published and which are repository-host only, and the language of the published
  set.>

### Behavior in a page, mechanism in a developer page

A technical page keeps the behavior, the guarantees, the states, the outcomes, and the configurable
settings that a reader can rely on. Mechanism moves to a developer page: internal algorithms, data
structures, tables, exact formulas, and anything that needs a long block of code or internals to
explain. The technical page links to that developer page.

<Give one reference case from this workspace: the technical page that keeps behavior, the developer
page that owns mechanism, and the sentence that links them. The link text names the subject, never a
reader group.>

### Experiment reports

The pages under the experiment-report directory document the project's experiments: the question
each line of experiments asked, the method, the results, the approaches that failed and the
questions left open. They serve two readers:

- The product's users and its operator, as evidence about behavior that tests cannot settle.
- A reader who continues the work from a report as background and a baseline.

Keep what one of these readers needs, and remove what neither needs. Every other rule in this guide
applies to these pages, except where this section says otherwise.

**Exceptions on these pages only**

- Past experiments are the subject. Past tense, before and after comparisons, earlier variants,
  dated runs and the words content rule 1 lists are allowed where they describe what was done.
  Content rules 1 to 3 do not apply to the account of past experiments. A statement about the
  product as it is today follows them.
- A design that was measured and then dropped, a removed component or an alternative that lost is
  described as such, by name.
- A diagram on a report follows the diagram rules and may show an experimental setup or pipeline as
  it ran, instead of the current system.
- Code snippets are allowed on a report wherever they help the reader. Each snippet has a language
  tag, is complete enough for its purpose and matches the recorded evidence. A snippet of experiment
  code never names the script, file or directory it came from.
- Methods can be detailed: equations, ranking formulas, sampling logic, data structures, thresholds
  and parameters, where the reader needs them to interpret a result or continue the work.
- A run date, a cohort size and the evidence-status label may stand near the top of a report. There
  is no author line, no diary chronology and no change-log narration.
- Hypotheses and uncertainty are welcome when labelled. Keep apart what was observed, what is
  interpreted, which hypothesis failed and which follow-up is untested.

**Evidence and sources**

- Every number, cohort, setting, model name, date and outcome comes from the recorded evidence the
  brief names. Content rule 4 reads "confirmed in the recorded evidence" here, instead of "enforced
  by code or tests". Never write from memory or round a number to tidy it.
- Each report is self-contained. It states the setup, values and methods it needs and never names,
  links or quotes the sources it was written from: no plan, phase, benchmark note, experiment script
  or directory, raw result file, commit hash or internal artifact name. Only public files of this
  repository may be linked.
- Failed approaches are findings. Each one states what was tried, how it was measured, what it
  produced and why it failed, at a size comparable to a successful approach.
- A report states the result that stands. It does not narrate corrections, superseded values or "an
  earlier version said".
- <The units the workspace uses for memory and data sizes, and whether hardware is described by
  specification or host identity.>

**Evidence-status labels**

<The labels a report may carry, and what each one describes.>

**Shape**

- A report consolidates one line of related experiments into an account complete enough to continue
  from. It is not an exhaustive record of every run and never a short summary of one run.
- A default order, which a report adapts: the question and why it matters, method and setup,
  results, failed approaches, interpretation, limitations, baselines, and open questions.
- Tables carry the key results. A per-cell or per-run table appears only where its detail is the
  finding; otherwise a summary carries it.
- Leave out process detail: run identifiers, rehearsals, harness and tooling bugs, attempt counts,
  approvals and who did what.
- A report never promises a rerun, names a script or claims that the run can be reproduced.
- A method shared by every report goes on the section index, a method shared by one category goes
  on its overview, and a method used by one report stays in that report. A table or number has one
  owning page, and other pages link to it.

### Charts

Charts appear only on experiment reports. A chart is an SVG file in the chart directory, generated
by the workspace's chart command from the JSON data file of the same name beside it. Never draw or
edit a chart SVG by hand: change the data file and run the generator again.

- A chart plots only numbers that appear in a table on the same page. The checker fails a chart
  value that no table cell of the page holds.
- Bars start at zero. Axes carry labels with units. A log scale is stated in the axis label, the
  alt text and the prose.
- A chart supports a sentence in the prose and never replaces the table.
- <The chart palette, the height limit and the naming rule.>

### Screenshots

Screenshots appear only on user pages. The user or an explicitly authorized agent captures them
from the served application, and the documentation orchestrator has a writer capture each one.
Never draw, fabricate, or substitute an image of the interface, and never create a stand-in file.

- **House style.** <The viewport sizes, device scale factors, language, theme, crop and state every
  capture matches.>
- Write a normal image link to the path where the screenshot will live. File names are kebab-case
  names that describe the subject.
- The alt text is final quality: one or two sentences stating what the screenshot shows. It never
  starts with "Screenshot of".
- Each screenshot shows one thing and supports a sentence in the prose. The prose is complete
  without it.
- A screenshot contains no personal data.
- Capture every linked screenshot before the page is complete. A missing screenshot is unfinished
  work, and a missing file leaves a broken image.
- Every screenshot has one capture script named after it. A screenshot without its script and a
  script without its screenshot are both defects.
- Every image link added or changed is listed in the closing report as a capture request.

### Published documentation index

A workspace that publishes its documentation adds each new page to its index in the same change that
creates the page. A workspace that publishes nothing deletes this section.

- <The fields an index entry carries (for example an id, a repository path, a navigation label and
  a nesting list), with the rule for each.>
- <The nesting depth limit, the ordering rule and the parent-page rule.>
- <Who owns a new section, a section title, and the list of popular pages.>
- Never list developer pages, setup pages, the user-owned file, or a page without full content.

## Authorized document exceptions

<The user-authorized exceptions to this guide's document rules. Each states what it allows and why
it is not a defect. Delete the list when the workspace has none.>
