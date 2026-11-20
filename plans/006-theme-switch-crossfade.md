# 006 — Cross-fade the light/dark theme switch

- **Status**: TODO
- **Commit**: none (repository has no commits yet; plan written 2026-11-20). Locate code by search strings.
- **Severity**: LOW
- **Category**: Missed opportunities (preventing a jarring change); Accessibility (brightness jumps)
- **Estimated scope**: 1 file, ~10 lines; ~4 lines of CSS

## Problem

The theme button flips the whole page from black to white (or back) in a single frame: a harsh full-screen brightness
jump, which Apple's accessibility guidance specifically recommends easing.

```ts
// src/components/theme-toggle.tsx — search: function apply(
function apply(choice: ThemeChoice) {
  if (choice === "system") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = choice;
}
```

## Target

- Wrap the attribute change in the View Transitions API when available: the browser cross-fades old and new page snapshots.
- Duration **180ms**, timing **ease-out** for the root cross-fade.
- Skip the transition (plain snap, as today) when `prefers-reduced-motion: reduce` is set or `document.startViewTransition` is unavailable.
- The boot script that applies a saved theme before first paint must NOT use a transition.

## Repo conventions to follow

- `theme-toggle.tsx` is a client component; keep `apply()` as the single place that changes the attribute.

## Steps

1. In `src/components/theme-toggle.tsx`, change `apply` to:
   ```ts
   function apply(choice: ThemeChoice) {
     const set = () => {
       if (choice === "system") delete document.documentElement.dataset.theme;
       else document.documentElement.dataset.theme = choice;
     };
     const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
     const start = (document as Document & { startViewTransition?: (callback: () => void) => unknown }).startViewTransition;
     if (reduced || typeof start !== "function") { set(); return; }
     start.call(document, set);
   }
   ```
2. Append to `src/app/globals.css`:
   ```css
   ::view-transition-old(root),::view-transition-new(root){animation-duration:180ms;animation-timing-function:ease-out}
   ```
3. Leave `themeBootScript` untouched.

## Boundaries

- Do NOT change the theme cycle order, storage key (`dw.theme`) or the boot script.
- Do NOT add dependencies.

## Verification

- **Mechanical**: `npx tsc --noEmit`, `npm run build` pass; hand test "Theme button cycles light → dark → device" passes.
- **Feel check** in Chrome/Edge: press the theme button: the page cross-fades in under a quarter second instead of flashing; with reduced motion it snaps; in a browser without View Transitions (older Safari/Firefox) it snaps and nothing errors.
- **Done when**: theme changes cross-fade where supported and never throw.
