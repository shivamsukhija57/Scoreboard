## Why

The current match center changes only a generic team total, so it cannot explain how a score happened or represent the different structures of cricket, football, basketball, racquet sports, and other events. Organizers need a reliable event-by-event scorecard that is quick to operate live and gives spectators a clear match summary and timeline.

## What Changes

- Add structured match events and sport-specific state for every non-athletics competitive event.
- Provide event-head scoring controls for runs, wickets, overs, goals, cards, player points, sets, games, rallies, and other applicable events.
- Attribute events to rostered players when the sport/event supports it, while allowing team-only scoring when player attribution is unknown or unnecessary.
- Present a sport-appropriate scorecard, player/team summaries, and chronological commentary to spectators and organizers.
- Support correction/undo with an attributable audit history; preserve result submission and central-admin confirmation lifecycle.
- Leave athletics event scoring as place/result entry and out of scope for this change.

## Capabilities

### New Capabilities
- `match-scorecards`: Sport-specific match state, event entry, score summaries, player attribution, corrections, and spectator scorecard display for non-athletics events.

### Modified Capabilities
- `live-scoring`: Replace generic-only score adjustment behavior with sport-appropriate scorecard actions while retaining shared authorization, lifecycle, and confirmation behavior.
- `spectator-experience`: Display sport-specific scorecards and match timelines to spectators, with public-safe player names and no student IDs.

## Impact

- Affects `Fixture` and competition domain data, match scoring APIs, organizer live-scoring UI, spectator match views, and audit records.
- Requires event-specific scoring configuration and roster linkage from submitted entries; existing fixtures need a compatible empty scorecard default.
- No new runtime dependency is assumed. Supabase stores the updated aggregate state using the existing versioned state mechanism.
- Athletics remains on its existing result/place workflow.
