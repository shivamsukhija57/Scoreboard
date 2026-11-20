# 005 — Day-one checklist: completed steps tick in, progress bar glides

- **Status**: TODO
- **Commit**: none (repository has no commits yet; plan written 2026-11-20). Locate code by search strings.
- **Severity**: LOW
- **Category**: Missed opportunities (delight, rare)
- **Estimated scope**: ~12 lines of CSS, 1 small markup edit

## Problem

The central admin's "Getting ready" checklist on Today has four steps. When a step completes, its number circle turns
into a green tick in one frame, and the progress bar jumps to its new width. This happens about four times in the whole
competition, which is the rare tier where a small celebration is earned.

```tsx
// src/components/dashboard.tsx — search: function SetupChecklist
<div className="setup-progress" aria-hidden="true"><i style={{ width: `${(done / steps.length) * 100}%` }} /></div>
...
<span className="setup-num" aria-hidden="true">{step.done ? <Check size={16} /> : index + 1}</span>
```

```css
/* src/app/globals.css — current */
.setup-progress i{display:block;height:100%;border-radius:3px;background:var(--lime)}
.setup-checklist li.done .setup-num{background:#30d158;color:#fff}
```

## Target

- Progress bar: animate `transform: scaleX(done/total)` with `transform-origin: 0 50%` instead of `width`, **500ms `var(--ease-in-out)`** (`cubic-bezier(0.77, 0, 0.175, 1)`), as a transition so it retargets.
- Tick: when a step's circle becomes done, the tick scales from **0.6 → 1** with a gentle overshoot, **300ms `var(--ease-spring)`** (`cubic-bezier(.34,1.56,.64,1)`), and the green background fades in over 200ms ease-out. Must end exactly at scale 1.
- Only animate a step that becomes done while the page is open, not steps already done on load (use a keyed span that changes key when `done` flips, or compare with the previous render).
- Reduced motion: no scaling; colour change only; bar moves instantly.

## Repo conventions to follow

- Tokens: `--ease-in-out`, `--ease-spring` already exist in globals.css. Exemplar of scaleX bars: `.tv-bar i{width:100%;transform-origin:0 50%;transition:transform 500ms var(--ease-in-out)}`.

## Steps

1. In `SetupChecklist`, change the bar to `<i style={{ transform: `scaleX(${done / steps.length})` }} />`.
2. Track which steps were already done at mount: `const doneAtMount = useRef(new Set(steps.filter((s) => s.done).map((s) => s.title)));`. For the tick, render `<Check size={16} className={doneAtMount.current.has(step.title) ? undefined : "setup-tick-in"} />`.
3. Append CSS:
   ```css
   .setup-progress i{width:100%;transform-origin:0 50%;transition:transform 500ms var(--ease-in-out)}
   @keyframes dw-tick-in{from{transform:scale(.6);opacity:0}to{transform:none;opacity:1}}
   .setup-tick-in{animation:dw-tick-in 300ms var(--ease-spring) both}
   .setup-num{transition:background-color 200ms ease-out,color 200ms ease-out}
   @media(prefers-reduced-motion:reduce){.setup-tick-in{animation:none}.setup-progress i{transition:none}}
   ```

## Boundaries

- Do NOT change the checklist's logic, steps or copy.
- If the search strings don't match, STOP and report.

## Verification

- **Mechanical**: `npx tsc --noEmit`, `npm run build` pass; hand test "Day-one checklist shows for the central admin" passes.
- **Feel check**: on scratch data with the demo account, complete a step (e.g. import one organizer in People & access) and return to Today: the bar glides to its new length; the new tick pops in with a slight overshoot and settles; steps done earlier don't animate.
- **Done when**: completion animates once per step, at the values above.
