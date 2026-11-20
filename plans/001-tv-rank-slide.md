# 001 — Slide TV and Overview rank rows to their new places

- **Status**: TODO
- **Commit**: none (repository has no commits yet; plan written 2026-11-20). Locate code by the search strings below, not by line numbers.
- **Severity**: MEDIUM
- **Category**: Missed opportunities (state indication)
- **Estimated scope**: 1 new hook file, 2 small component edits, ~25 lines of CSS

## Problem

When a result changes the overall order, the rows of the points table jump to their new positions in one frame. On the
projector (`/tv`) a whole room is watching and an overtake is invisible unless people read the numbers.

```tsx
// src/components/tv-board.tsx — search for: <ol>{table.map((row) => <li key={row.section.id}>
<ol>{table.map((row) => <li key={row.section.id}>
```

The Overview ranking has the same behaviour:

```tsx
// src/components/dashboard.tsx — search for: <div className="mini-standings">{rankedSections.map((section, index) => <div className="mini-rank" key={section.id}>
```

The bars inside the TV rows already animate their length (`.tv-bar i{...transition:transform 500ms var(--ease-in-out)}` in
`src/app/globals.css`); only the row order teleports.

## Target

A FLIP reorder: measure each row's position before and after the data update and animate only `transform`.

- Duration: **500ms**. Curve: **`var(--ease-in-out)`** = `cubic-bezier(0.77, 0, 0.175, 1)` (on-screen movement).
- Rows that don't move do nothing. A row that enters or leaves (shouldn't happen: always 5 divisions) just appears.
- Retargeting: if data changes again mid-slide, start the new slide from the row's current on-screen position (read
  `getBoundingClientRect()` which includes the in-flight transform).
- Reduced motion (`prefers-reduced-motion: reduce`): no slide; the moved rows fade from opacity 0.4 to 1 over 200ms.

## Repo conventions to follow

- Motion tokens already exist in `src/app/globals.css`: `--ease-out:cubic-bezier(.23,1,.32,1)`, `--ease-in-out:cubic-bezier(.77,0,.175,1)`, `--ease-spring`.
- Exemplar of change-triggered motion in this repo: `TvScore` in `src/components/tv-board.tsx` (search `function TvScore`) uses a ref of the previous value and only animates on change.
- Client components start with `"use client"`; shared hooks can live in `src/components/` as a new file.

## Steps

1. Create `src/components/use-flip-list.ts`:

   ```ts
   "use client";
   import { useLayoutEffect, useRef } from "react";

   /**
    * FLIP for a list whose items are keyed by id: after each render, rows that moved slide from their previous
    * position to the new one. Pass the ordered ids; attach the returned ref callback to each row with its id.
    */
   export function useFlipList(order: string[]) {
     const nodes = useRef(new Map<string, HTMLElement>());
     const last = useRef(new Map<string, DOMRect>());
     useLayoutEffect(() => {
       const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
       for (const [id, el] of nodes.current) {
         const before = last.current.get(id);
         const after = el.getBoundingClientRect();
         if (before) {
           const dy = before.top - after.top;
           if (Math.abs(dy) > 1) {
             if (reduced) {
               el.animate([{ opacity: 0.4 }, { opacity: 1 }], { duration: 200, easing: "ease-out" });
             } else {
               el.animate([{ transform: `translateY(${dy}px)` }, { transform: "translateY(0)" }], { duration: 500, easing: "cubic-bezier(0.77, 0, 0.175, 1)" });
             }
           }
         }
         last.current.set(id, after);
       }
     }, [order.join("|")]);
     return (id: string) => (el: HTMLElement | null) => { if (el) nodes.current.set(id, el); else nodes.current.delete(id); };
   }
   ```

   Note: `getBoundingClientRect()` includes any running WAAPI transform, which is what makes a mid-flight change start
   from where the row currently is. Cancel nothing; a new `animate()` on the same element replaces the visual of the old one
   because both animate `transform` and the newest wins.

2. In `src/components/tv-board.tsx`, inside `TvBoard`, after `const table = sectionTable(data);` add
   `const flip = useFlipList(table.map((row) => row.section.id));` and import `useFlipList` from `./use-flip-list`.
   Change `<li key={row.section.id}>` to `<li key={row.section.id} ref={flip(row.section.id)}>`.

3. In `src/components/dashboard.tsx`, inside `Overview`, after `rankedSections` is computed add
   `const flip = useFlipList(rankedSections.map((section) => section.id));` (import from `./use-flip-list`), and add
   `ref={flip(section.id)}` to `<div className="mini-rank" key={section.id}>`.

## Boundaries

- Do NOT animate bar widths or numbers here (bars already transition; numbers are plan 004's pattern).
- Do NOT change sort order, markup structure or keys beyond adding `ref`.
- Do NOT add dependencies (no Framer Motion); WAAPI only.
- If the search strings above don't match (the files are being edited by other work), STOP and report.

## Verification

- **Mechanical**: `npx tsc --noEmit` and `npm run build` pass; `npm test` passes.
- **Feel check**: run a dev server on scratch data (never the real store), open `/tv`, then change a finalized result in the data file so two divisions swap places; within the 20s poll:
  - the two rows slide past each other over ~half a second, others stay still;
  - in DevTools Animations panel at 10% speed, the movement eases in and out (slow start, slow end), no jump at the end;
  - with Rendering > prefers-reduced-motion: reduce, rows swap with a short fade, no slide.
- **Done when**: order changes on `/tv` and on the Overview ranking slide instead of teleporting, and the first render after page load does not animate.
