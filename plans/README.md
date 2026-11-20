# Animation plans

Written 2026-11-20 from a `find-animation-opportunities` sweep. The repository has no commits yet, so each plan locates
code by search strings rather than line numbers. Execute them after the current feature build (war map, scoring pads,
Stage judging) has landed, because those touch the same files.

| # | Plan | Severity | Status |
|---|---|---|---|
| 001 | [Slide TV and Overview rank rows to their new places](001-tv-rank-slide.md) | MEDIUM | TODO |
| 002 | [Phone sheets leave the way they came, and can be swiped down](002-sheets-exit-and-swipe.md) | MEDIUM | TODO |
| 003 | [The final-result confirm strip grows from the button](003-final-submit-arm-motion.md) | LOW | TODO |
| 004 | [Score pad numbers settle when they change](004-score-pad-change-feedback.md) | LOW | TODO |
| 005 | [Day-one checklist: completed steps tick in, progress bar glides](005-setup-checklist-completion.md) | LOW | TODO |
| 006 | [Cross-fade the light/dark theme switch](006-theme-switch-crossfade.md) | LOW | TODO |

## Recommended order

1. **003, 004, 006** first: each is a few lines, independent, and low risk.
2. **005**: small, independent.
3. **001**: adds a shared hook (`use-flip-list.ts`); touches `tv-board.tsx` and the Overview.
4. **002** last: the largest (a new bottom-sheet component with gesture handling); test on a real phone.

## Dependencies

- None between plans. 002 and 004 both edit `src/components/dashboard.tsx`; run them one after another, not in parallel.
- 002 adds the `--ease-drawer` token; no other plan needs it.
- Every plan's verification includes the existing hand test (`scratchpad/handtest.mjs` in the session scratchpad) where relevant; rerun it after each.
