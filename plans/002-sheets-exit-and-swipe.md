# 002 — Phone sheets leave the way they came, and can be swiped down

- **Status**: TODO
- **Commit**: none (repository has no commits yet; plan written 2026-11-20). Locate code by search strings.
- **Severity**: MEDIUM
- **Category**: Physicality & origin; Interruptibility (gesture)
- **Estimated scope**: 1 new component, 2 call-site edits in dashboard.tsx, ~15 lines of CSS

## Problem

The phone menu sheet and the Switch match sheet slide up on open (260ms) but are unmounted instantly on close, so they
vanish instead of leaving the way they arrived. There is also no swipe-to-dismiss, which every phone bottom sheet offers.

```tsx
// src/components/dashboard.tsx — search: {sheetOpen && <PhoneSheet
{sheetOpen && <PhoneSheet data={data} ... close={() => setSheetOpen(false)} ... />}
// src/components/dashboard.tsx — search: {switchOpen && <div className="phone-sheet-layer"
{switchOpen && <div className="phone-sheet-layer" onClick={() => setSwitchOpen(false)}><div className="phone-sheet" ...>
```

```css
/* src/app/globals.css — current */
.phone-sheet-layer{...;animation:dw-toast-in 180ms var(--ease-out) both}
.phone-sheet{...;animation:dw-sheet-up 260ms var(--ease-out) both}
@keyframes dw-sheet-up{from{transform:translateY(100%)}to{transform:none}}
```

## Target

- Open: unchanged (slide up from `translateY(100%)`, 260ms), but use the drawer curve **`--ease-drawer: cubic-bezier(0.32, 0.72, 0, 1)`**.
- Close (button, backdrop tap, Escape, or a choice in the sheet): sheet animates to `translateY(100%)` over **200ms `var(--ease-drawer)`**, backdrop fades to 0 over **150ms ease-out**, THEN unmount.
- Swipe down on the sheet (pointer events, starting on the grab handle or anywhere when the sheet is scrolled to the top):
  - sheet follows the finger 1:1 (`translateY(dy)`, dy ≥ 0; upward drag gets rising friction: `dy * 0.2`),
  - on release: close if `dy > 25% of sheet height` OR release velocity `> 0.11 px/ms` (`Math.abs(distance) / elapsedMs` over the last ~100ms); otherwise spring back to 0 with **300ms `cubic-bezier(0.34, 1.56, 0.64, 1)`** (gentle overshoot ≈ bounce 0.2),
  - when closing from a drag, continue from the current position to 100% over `max(120, 200 * remaining/height)` ms with `var(--ease-drawer)`.
- Reduced motion: no slides; sheet and backdrop fade in/out over 150ms; swipe still works but snaps without animation.

## Repo conventions to follow

- Tokens live at the top-level motion block in `src/app/globals.css` (search `--ease-out:cubic-bezier(.23,1,.32,1)`); add `--ease-drawer:cubic-bezier(.32,.72,0,1)` there.
- Exemplar of a "leaving" state before unmount: the toast in `src/components/dashboard.tsx` (search `setNoticeLeaving(true)`) and `.toast.leaving` in globals.css.
- New CSS must use semantic tokens (`--ink-2`, `--line`, …), never literal hexes for surfaces.

## Steps

1. Add `--ease-drawer:cubic-bezier(.32,.72,0,1)` to the motion `:root` block in `globals.css`. Change `.phone-sheet` animation curve to `var(--ease-drawer)`.
2. Create `src/components/bottom-sheet.tsx` exporting `BottomSheet({ open, onClosed, label, children })`:
   - keeps itself mounted while `open` or while its exit runs; internal state `phase: "open" | "closing"`;
   - exposes a `requestClose()` to children via a render prop or context so rows can close it;
   - renders `<div className="phone-sheet-layer" data-phase={phase} onClick={requestClose}><div className="phone-sheet" role="dialog" aria-modal="true" aria-label={label} onClick={stop} onPointerDown/Move/Up=...>{children}</div></div>`;
   - drag handling per Target (use `setPointerCapture`, keep a short history of `{y, t}` for velocity, write `style.transform` directly during the drag, no React state per frame);
   - closing: set `phase="closing"`, apply the exit transforms via inline style + CSS transition, on `transitionend` (or a 260ms timeout fallback) call `onClosed()`;
   - Escape closes; focus moves into the sheet on open and back to the trigger on close.
3. Replace both sheets in `dashboard.tsx` with `<BottomSheet>`; the parents keep `sheetOpen`/`switchOpen` but set them false only in `onClosed`. Buttons inside that navigate (`go(...)`, picking a match) call the sheet's `requestClose()` after doing their action.
4. CSS: `.phone-sheet-layer[data-phase="closing"]{opacity:0;transition:opacity 150ms ease-out}` and `.phone-sheet[data-closing]{transform:translateY(100%);transition:transform 200ms var(--ease-drawer)}` (or equivalent inline styles); reduced-motion overrides per Target.

## Boundaries

- Do NOT change what the sheets contain or their order.
- Do NOT add dependencies (no Vaul, no Framer Motion).
- Desktop (>850px) does not show these sheets; don't add desktop behaviour.
- If search strings don't match, STOP and report.

## Verification

- **Mechanical**: `npx tsc --noEmit`, `npm test`, `npm run build` pass.
- **Feel check** on a real phone (or DevTools device mode with touch):
  - tapping More slides the sheet up; tapping Close/backdrop slides it back down, it doesn't vanish;
  - dragging the handle down follows the finger exactly; a quick flick closes even from a short drag; a slow short drag springs back with a slight overshoot;
  - grabbing the sheet while it is closing has no effect (or reverses smoothly) and never jumps;
  - with prefers-reduced-motion: open/close are fades.
- **Done when**: both sheets exit symmetrically and dismiss on swipe, and the existing hand test (`scratchpad/handtest.mjs`) still passes its phone checks.
