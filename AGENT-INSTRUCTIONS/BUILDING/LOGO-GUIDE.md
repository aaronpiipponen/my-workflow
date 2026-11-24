# Logo guide

This guide governs the product's logo in `docs/brand/`: how candidates are explored, what a logo
file contains, and how the chosen one becomes the brand asset the root README shows. The user
chooses the logo and iterates on it. A writer proposes candidates and never picks one.

## Files

- `docs/brand/candidates/<theme>.svg`: one file per candidate while the user chooses, named for its
  theme in kebab-case.
- `docs/brand/logo.svg`: the chosen logo. It exists only once the user has chosen.
- Rendered previews go outside the repository.

When the user approves a logo, it becomes `docs/brand/logo.svg` and the candidates folder is
deleted. The root README's header links the logo as `README-GUIDE.md` describes.

## What a logo file is

- Hand-written, self-contained SVG: no scripts, no external files or fonts, no embedded raster
  images. The diagram layout rules do not apply. Gradients, clip paths, masks, patterns, filters,
  transparency and the project's colour scheme make the mark visually rich.
- A wide lockup: the mark on the left and the product's name as the wordmark on the right, in a
  `viewBox` near 640 by 160, with `role="img"` and a `<title>` holding the product's name.
- Its own opaque background with rounded corners, so it reads the same on light and dark pages.
- The wordmark uses `font-family="system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"`. A
  renderer without those fonts substitutes a wider one, so the wordmark keeps at least 15 percent
  of its width free before the right edge.
- The mark alone stays recognisable at 32 pixels: few shapes, strong contrast, no detail that
  vanishes when small.

## Colour

The logo belongs to the project's visual family: its colours come from the palette the diagrams use
and from the colours the product's charts and interface already show. Treat those hues as the source
of the scheme, not as a fixed list of values. A candidate may deepen, lighten, blend or shift them,
and it may add one accent the project does not use yet. A logo that copies the diagram palette value
for value looks flat, and a logo whose colours come from nowhere looks like it belongs to another
product. Aim for two or three related project hues, one accent, and a background that sits beside
the diagrams instead of fighting them.

## Exploring candidates

Each round of exploration writes exactly four candidates, each from a different theme:

1. What the product does, its core function seen by its user.
2. What it works on: its data, its material or its domain.
3. How it works inside: a mechanism, a structure or an algorithm it is built on.
4. A daring theme from outside the product's strict feature set: a metaphor, a mood, a place or an
   idea the product suggests without doing it.

Read the root README, the product overview and the requirements the workspace names in
`AGENT-INSTRUCTIONS/LOCAL/project.md` before choosing the themes. The four candidates differ in
shape, colour and composition, not only in their subject.

## Checking a candidate

Render every candidate to PNG with the SVG render command in
`AGENT-INSTRUCTIONS/LOCAL/docs-tools.md`, at the full lockup size and with the mark alone near 32
pixels high, and open each image with the image reader. Fix overflow, clipped shapes, unreadable
text and a mark that turns to mush when small, and render again until every image passes. Confirm
each file is well-formed XML with `xmllint --noout`.

## Presenting the candidates

The closing report lists the four candidates in order: the file path, the theme in a few words,
one sentence on what the mark shows and why it fits, and the preview paths. It asks the user to
choose one, to combine parts of several, or to name what the next round changes. A next round
keeps the chosen direction and varies it, again as four candidates unless the user asks for a
different number.
