## Why

Division Wars needs a reliable, legible cricket scorecard for matches scored by college event heads. The current generic event log cannot maintain a complete innings, batting order, bowling figures, or standard cricket extras and dismissal state.

## What Changes

- Replace cricket's generic event controls with a ball-by-ball scorer backed by explicit innings, batting and bowling state.
- Show a broadcast-style live scorecard with team totals, overs, current batters, bowler figures, batting/bowling tables, extras, fall of wickets, and commentary.
- Support legal and illegal deliveries, wides, no-balls, byes, leg-byes, penalty runs, wickets, strike changes, over changes, and corrections.
- Preserve the existing event-head submission and central-admin approval process; only approved final results feed standings.
- Keep college matches manually scored in-app. No third-party feed is used as the source for these fixtures.

## Capabilities

### New Capabilities
- `cricket-scorecard`: Ball-by-ball cricket scoring, scorecard statistics, presentation, and correction behavior.

### Modified Capabilities
- `live-scoring`: Cricket-specific scoring, submission, review, and approved-result behavior.

## Impact

Cricket event scorer and spectator views, scorecard domain model, match scoring API and persistence, result approval integration, and cricket standings statistics. Existing fixtures require a backward-compatible migration/default innings state. No external API dependency is required.
