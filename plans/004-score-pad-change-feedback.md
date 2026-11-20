# 004 — Score pad numbers settle when they change

- **Status**: TODO
- **Commit**: none (repository has no commits yet; plan written 2026-11-20). Locate code by search strings.
- **Severity**: LOW
- **Category**: Missed opportunities (feedback)
- **Estimated scope**: 1 small component, 1 call-site edit

## Problem

On the scoring console, a +1 tap changes the big score number with no acknowledgement beyond the button's press scale.
On a weak venue connection the scorer can't tell at a glance that the point registered (the save is optimistic, then
confirmed).

```tsx
// src/components/dashboard.tsx — search: <strong className="score-pad-score">
<strong className="score-pad-score">{matchHeadlineScore(data, match, which)}</strong>
```

The TV board already solves this for its scores:

```tsx
// src/components/tv-board.tsx — search: function TvScore
function TvScore({ value }: { value: string }) {
  const previous = useRef(value);
  const [changes, setChanges] = useState(0);
  useEffect(() => { if (previous.current !== value) { previous.current = value; setChanges((count) => count + 1); } }, [value]);
  return <strong className="tv-score"><span key={changes} className={changes ? "tv-score-changed" : undefined}>{value}</span></strong>;
}
```

```css
/* src/app/globals.css — existing */
@keyframes dw-score-in{from{opacity:0;transform:translateY(.12em)}to{opacity:1;transform:none}}
.tv-score-changed{display:inline-block;animation:dw-score-in 200ms var(--ease-out) both}
```

## Target

- Same motion as the TV: on change only, the number rises `0.12em` and fades in, **200ms `var(--ease-out)`**. No animation on first render.
- Keep it at 200ms: scorers tap rapidly; anything longer lags their input. A new change mid-animation restarts it (keyed remount), which is acceptable for a 200ms settle.
- Reduced motion: the global rule in globals.css already cuts animation duration to 0.01ms; nothing extra needed.

## Repo conventions to follow

- Reuse `dw-score-in` and the `TvScore` pattern; do not create a new keyframe.

## Steps

1. Export a generic version: in `src/components/tv-board.tsx`, leave `TvScore` as is. In `src/components/dashboard.tsx` add near `ConfirmFinal`:
   ```tsx
   /** A number that settles into place when it changes (not on first render): confirms a tap registered. */
   function SettlingNumber({ value, className }: { value: string; className?: string }) {
     const previous = useRef(value);
     const [changes, setChanges] = useState(0);
     useEffect(() => { if (previous.current !== value) { previous.current = value; setChanges((count) => count + 1); } }, [value]);
     return <strong className={className}><span key={changes} className={changes ? "tv-score-changed" : undefined}>{value}</span></strong>;
   }
   ```
2. Replace `<strong className="score-pad-score">{matchHeadlineScore(data, match, which)}</strong>` with
   `<SettlingNumber className="score-pad-score" value={String(matchHeadlineScore(data, match, which))} />`.

## Boundaries

- Do NOT touch scoring logic, the buttons or the TV component.
- Do NOT change durations above 200ms.
- If the search strings don't match, STOP and report.

## Verification

- **Mechanical**: `npx tsc --noEmit`, `npm run build` pass; hand test checks "Tapping +1 for Ares records a goal" and "Screen shows the new score" still pass.
- **Feel check**: on the score pad, tap +1 several times quickly: each change gives a tiny rise-and-fade; nothing lags behind the taps; page load shows no animation.
- **Done when**: score pad numbers animate on change only.
