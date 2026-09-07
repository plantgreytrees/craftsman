---
name: design-review
description: Use when reviewing or writing a diff that touches UI code — components, templates, or styles. A compact checklist for visual hierarchy, spacing, accessibility, and avoiding generic-AI-slop patterns. Not for backend-only diffs.
---

# Design review checklist

Loaded by `ui-ux-reviewer` (and optionally `idiom-reviewer`) for any diff that
touches markup, styles, or layout. This is a review checklist against an
existing diff, not a visual-design generator — it does not produce mockups or
new UI, only judges what's already there.

## Hierarchy & rhythm

- One clear focal point per view. Flag competing emphasis: more than one
  bold/large/colored element fighting for attention at the same level.
- Spacing follows a scale (4/8px or the codebase's own token step), not
  arbitrary one-off values (`margin: 13px`).
- Type sizes follow the codebase's existing scale; a new one-off size needs a
  reason.

## Generic-AI-slop patterns

- Purple-to-blue gradients, drop shadows on everything, glassmorphism applied
  with no rationale.
- Centered-everything layouts with no asymmetry or intentional structure.
- Emoji used as icons in production UI instead of the project's icon set.
- Card-inside-card-inside-card nesting where flat structure would read better.

## Accessibility

- Color contrast meets WCAG AA (4.5:1 text, 3:1 large text/UI components).
- Interactive elements have a visible focus state and are keyboard-operable.
- Semantic markup over `div`/`span` soup where a native element exists
  (`button`, `nav`, `label`, headings in order).
- Images/icons conveying meaning have alt text or an accessible name.

## Consistency

- Grep the codebase for its existing design tokens, spacing scale, and
  component patterns before introducing a new one-off value.
- Reuse an existing component instead of a near-duplicate.

## Responsive

- No fixed pixel widths that will overflow a mobile viewport.
- Content has a defined behavior at narrow widths (wrap, truncate, or stack) —
  not just "cut off."

## Out of scope

- Anything a linter/formatter catches (indentation, prop order, class name
  order).
- Logic correctness — that's `code-reviewer`.
- New visual designs or mockups — this checklist judges an existing diff only.
