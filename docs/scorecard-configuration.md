# Match scorecard configuration

The scorecard uses each event's `scoringConfig`. Rulebook defaults are parsed from existing event format/roster text; set explicit values when an event's rules differ.

```ts
scoringConfig: {
  inningsCount: 2,
  oversPerInnings: 8,
  wicketsPerInnings: 10,
  pointsToWin: 21,
  winBy: 2,
  setsToWin: 2,
  periods: 2,
  periodMinutes: 12,
  enabledActions: ["run", "extra", "wicket"]
}
```

All fields are optional. The current cricket catalog specifies eight overs and event-specific wicket limits. `pointsToWin`, `winBy`, and `setsToWin` configure rally sports. `periods` and `periodMinutes` describe timed matches. `enabledActions` can narrow the event types enabled by the sport adapter.

## Scorer workflow

1. Open Live matches and select an assigned fixture.
2. Start a scheduled fixture to enable scoring.
3. Choose the section, event type, and optional rostered player(s). Team-only events are allowed.
   For cricket, choose the batter from the batting section and the bowler/fielder from the opposing section; the card tracks batter runs/boundaries and bowler runs conceded, legal balls, and credited wickets.
4. Add optional detail for a dismissal, extra, card, foul, or substitution. Cricket wide/no-ball detail excludes the delivery from legal-ball counts.
5. Review the event feed. Reversing an event requires a reason and retains the original entry.
6. Submit the result for the existing confirmation workflow.

## Current limits

The scorecard records team totals, per-side innings/overs, batter runs/boundaries/dismissals, and bowler conceded runs/legal balls/credited wickets. Tournament-specific dismissal edge cases, batting order/strike, penalties, substitution eligibility, and sport-specific tie-break rules still need explicit event configuration. Cards and fouls are records only; they do not automatically trigger disciplinary decisions.

Athletics continues through its place/result workflow and is excluded from match event scoring.
