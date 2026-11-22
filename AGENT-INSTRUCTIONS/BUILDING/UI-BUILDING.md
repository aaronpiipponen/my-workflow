# UI-BUILDING.md - Building user interface

Use this when a change adds or changes anything a user sees or touches: a control, a list, a row, an
overlay, a menu item, a notice, a help text or a layout. It applies to detailing such a phase,
implementing it and reviewing it. The checkout names its reference components, its motion and
styling values and its list of known interface defects in `AGENT-INSTRUCTIONS/LOCAL/ui-reference.md`.

An interface change is finished when it looks, moves and responds like the parts of the app beside it,
at every supported width, the first time and every time. Rendering without errors is not enough.

---

## 1. Reuse before building

- Before adding a control, list, row, overlay, picker, menu item or notice, find the closest existing
  one in the app and name it as the reference element. Reuse its component. When the component cannot
  take the new case, extend it once rather than writing a second one.
- When no component fits, copy the reference element's structure, styling values (spacing, sizes,
  radius, colours, typography) and motion. A new look needs an explicit reason in the phase
  document; "it was quicker" is not one.
- A known interface defect listed by the checkout is never a reference element. Do not copy a
  defective element's behaviour, and do not cite it as precedent.

## 2. Motion parity

- Every new open, close, tab change, list change, reorder and appearing or disappearing element uses
  the app's existing transitions and durations.
- The first opening animates exactly like later ones. An element that snaps into place, jumps at the
  end of its animation or appears without motion where its siblings animate is a defect.
- Reduced-motion settings draw the end state at once, as the rest of the app does.

## 3. Layout stability

- A state change (loading, a filter, a tab, a basis, a selection, an error) does not move unrelated
  elements. Reserve the space the changing part needs.
- Alignment and centring match the reference element. Text, icons and controls in one row share a
  baseline or a centre line.
- Nothing overflows, overlaps or wraps unexpectedly at the narrowest supported phone width or at the
  widest desktop width.

## 4. Feedback parity

- A new action gives the same feedback as its sibling actions: the same notice shape and wording
  pattern, the same error surface, and the same undo or confirmation where the siblings have one.
- An action without feedback where its siblings give it is a defect.

## 5. Context sense

- Help text describes the screen it opens from and the controls on it, not features elsewhere.
- A menu or switch does not offer to go where the user already is, and does not repeat an action the
  current view already performs.
- Every visible element earns its place: no empty boxes, placeholders or controls that do nothing in
  the current state.

## 6. Objective proof

An agent cannot judge taste, but it can measure. For every new or changed visible element, the
browser check:

1. Places it beside its reference element and compares the computed values that define the look:
   font family, size and weight, padding, gap, border, radius, colours and the transition properties.
   A mismatch is a defect unless the phase document names it as intended.
2. Measures centring and alignment offsets within its row or container.
3. Opens, closes and changes it twice, recording position and size during and after the change, so a
   first-open snap or a layout jump shows up as a moving bounding box.
4. Repeats this at a desktop width and at the narrowest supported phone width, and checks for
   overflow, overlap and wrapping.
5. Saves the screenshots and states what each one shows.

Report each measured mismatch with its values. The user still judges the final look; this proof
removes the defects an agent can find itself.
