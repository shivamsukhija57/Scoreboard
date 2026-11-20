# 003 — The final-result confirm strip grows from the button

- **Status**: TODO
- **Commit**: none (repository has no commits yet; plan written 2026-11-20). Locate code by search strings.
- **Severity**: LOW
- **Category**: Missed opportunities (preventing a jarring change)
- **Estimated scope**: ~6 lines of CSS

## Problem

Tapping "Submit final result" swaps the button for a strip ("Final: Ares 3–1 Cyappa. Points go on the board." with
Cancel / Confirm final) in one frame. This is the most consequential tap a scorer makes, and the swap has no visual link
to the button that was pressed. The other in-app confirmations already animate in (`.inline-confirm{...animation:dw-panel-in 180ms var(--ease-out) both;transform-origin:50% 0}`), so this one is inconsistent.

```tsx
// src/components/dashboard.tsx — search: function ConfirmFinal
if (!armed) return <button className="confirm-button" ...>Submit final result</button>;
return <span className="confirm-final" role="group" aria-label="Confirm final result">...
```

```css
/* src/app/globals.css — current, search: .confirm-final{ */
.confirm-final{display:flex;flex-wrap:wrap;align-items:center;gap:8px;justify-content:flex-end}
```

## Target

- `.confirm-final` enters from `opacity: 0; transform: scale(0.97)` to rest, **180ms `var(--ease-out)`**, `transform-origin: 100% 50%` (it replaces a right-aligned button, so it grows from that edge).
- Use the existing keyframes `dw-panel-in` only if its transform matches; otherwise add `@keyframes dw-arm-in{from{opacity:0;transform:scale(.97)}to{opacity:1;transform:none}}`.
- Reduced motion: opacity only (`@keyframes dw-fade` already exists in globals.css: `from{opacity:0}to{opacity:1}`).
- Leaving (Cancel or auto-reset after 6s): no exit animation needed; the button returning in place is the expected snap-back.

## Repo conventions to follow

- Exemplar: `.inline-confirm` rule in `src/app/globals.css` (search `.inline-confirm{`).
- Tokens: `--ease-out:cubic-bezier(.23,1,.32,1)`.

## Steps

1. Append to `src/app/globals.css`:
   ```css
   @keyframes dw-arm-in{from{opacity:0;transform:scale(.97)}to{opacity:1;transform:none}}
   .confirm-final{transform-origin:100% 50%;animation:dw-arm-in 180ms var(--ease-out) both}
   @media(prefers-reduced-motion:reduce){.confirm-final{animation:dw-fade 150ms ease-out both!important;animation-duration:150ms!important}}
   ```

## Boundaries

- CSS only. Do NOT change `ConfirmFinal` logic, timings or markup.
- If `.confirm-final` doesn't exist in globals.css, STOP and report.

## Verification

- **Mechanical**: `npm run build` passes.
- **Feel check**: open Live matches on a live fixture as an event head / central admin (demo account), tap "Submit final result":
  - the strip fades and grows slightly from the right, in well under a quarter second;
  - at 10% playback it starts at 97% size, never from a point;
  - reduced motion: fade only.
- **Done when**: the arm step animates and nothing else about the flow changed (hand test "First tap shows the final score" still passes).
