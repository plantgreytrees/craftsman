# React Native design checklist

Supplements `javascript.md`/`typescript.md` — load whichever of those matches
the file's language, plus this one, for any React Native diff. React Native
has no DOM, so `javascript.md`'s environment-boundary bullet becomes
platform boundary (iOS/Android/web) instead of Node/browser.

- Platform split: platform-specific behavior lives in `.ios.tsx`/`.android.tsx`
  files or a `Platform.select`/`Platform.OS` branch — not scattered inline
  `if (Platform.OS === ...)` checks duplicated across components.
- Re-render cost: avoid creating a new function/object literal inline in a
  hot list item's `renderItem`/`style` prop every render — memoize with
  `useCallback`/`useMemo` or hoist to module scope (`StyleSheet.create`
  already does this for styles; don't recreate style objects inline).
- List performance: `FlatList`/`SectionList` (virtualized) over `ScrollView`
  + `.map()` for any collection that can grow — check `keyExtractor` is
  stable and unique, and that `renderItem` doesn't depend on unstable inline
  closures that defeat memoization.
- Native module/bridge safety: a new native module call is wrapped so a
  missing/misconfigured native binary fails with a clear error, not a silent
  no-op; async bridge calls are awaited/handled like any other promise
  (see `javascript.md`'s async bullet).
- Styling: `StyleSheet.create` (not inline style objects) for anything
  reused or in a render-heavy component — inline styles recreate a new
  object every render and defeat `PureComponent`/`React.memo`.
- Accessibility: `accessible`/`accessibilityLabel`/`accessibilityRole` on
  interactive elements — RN has no semantic HTML, so this is the equivalent
  of `design-review`'s semantic-markup bullet. Touch targets meet the
  platform minimum (44x44pt iOS / 48x48dp Android).
- Bundle/startup cost: a new dependency that pulls in a large native SDK or
  polyfill is a deliberate choice, not an accident — check it's actually
  needed before adding it (same spirit as `dependency-auditor`'s necessity
  check, sharper here since RN app size/startup time is user-visible).
- Test seams: components depend on injected props/hooks, not directly on
  native modules, so unit tests can render with mocked native behavior
  (`@testing-library/react-native` + jest mocks for native modules).
