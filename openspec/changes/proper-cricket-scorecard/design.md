## Context

The app already stores generic match events with a side, points, player and secondary-player attribution, legal-ball markers, reversals, and event-head/central-admin permissions. That representation is not enough to reliably derive a complete cricket innings or determine striker rotation and bowler figures. Cricket event settings already carry configurable overs, wickets, and innings limits.

## Goals / Non-Goals

**Goals:** make each delivery a durable source record; derive all scorecard totals from deliveries; provide fast scorer controls and a readable spectator scorecard; preserve correction history and result approval.

**Non-Goals:** import live feeds for these local college matches; manage professional match catalogs; promise advanced analytics such as wagon wheels or pitch maps.

## Decisions

- Add typed cricket innings/delivery state rather than infer cricket rules from generic `MatchEvent.detail` strings. Retain compatibility by migrating legacy events into a clearly marked legacy innings or keeping them read-only until migrated.
- Persist delivery-level fields: innings number, batting/bowling section, batter, non-striker, bowler, batter runs, extra type/runs, wicket type/player, legal delivery, over/ball, and scorer/audit metadata.
- Derive innings, batter, bowler, extras, fall-of-wickets, partnership, target, and result from delivery records. Corrections append reversal/replacement events and trigger full recomputation.
- Provide scorer shortcuts for common outcomes (0, 1, 2, 3, 4, 6, wide, no-ball, bye, leg-bye, wicket) with a detail panel for less common cases. Validate roster membership and cricket rules server-side.
- Store innings order and toss/choice before first ball; use the configured event rules for overs, wickets and innings. Provide safe manual selection for strike/bowler at innings start and over change, with derived strike rotation for deliveries.
- Keep score entry on the server-authorized event-head console. Spectators receive only published match data; approval remains central-admin controlled.
- Do not add a third-party provider dependency: the college's ad-hoc fixtures are not expected to exist in public cricket feeds.

## Risks / Trade-offs

- Run-out, retired hurt, obstructing the field, penalty runs, and no-ball scoring have edge cases; model dismissal and extras as enums and test each supported case.
- Legacy generic events may lack enough information to reconstruct batter/bowler attribution. Do not fabricate it; display legacy data as unverified and allow an authorized scorer/admin migration or fresh scorecard.
- Incomplete innings must not produce authoritative NRR. Mark NRR unavailable until balls and innings are complete or validly closed under configured rules.

## Migration Plan

Add an optional cricket scorecard structure to existing fixtures. Preserve generic score events for non-cricket sports. Existing cricket fixtures remain readable; new scoring uses the typed delivery model. Add a documented path to reset/re-enter test fixtures and handle legacy score data without silently overwriting it.

## Open Questions

- Confirm whether event heads must enter toss winner/decision and named umpires before scoring begins.
- Confirm local-rule dismissal details and whether retired hurt, penalty runs, and timed out are in scope for the college format.
