## Why

Schedulers build every fixture by hand and have no way to move a venue's whole afternoon when play runs late. Spectators can follow live scores but have no view built for a shared screen, no individual player rankings, no sense of how the section race has moved over time, and no quick way to follow only their own section.

## What Changes

- Add a round-robin fixture generator that proposes a full set of fixtures for one event from a date range, daily time window, slot length, and venue list, avoiding venue and section clashes, with a preview before publishing.
- Add a "shift fixtures" tool that moves every scheduled fixture at one venue on one day (from a given time onward) by a fixed number of minutes, previews new clashes, and can post a same-day delay notice for spectators.
- Add a full-screen TV / projector mode at `/tv` showing live matches, overall points, and upcoming fixtures, refreshing on its own.
- Add individual leaderboards (cricket runs and wickets, football goals, basketball points) built from finalized, player-attributed scorecard events. Player names are shown only to signed-in college users.
- Add a points-race chart of cumulative section points by day to the Overall, Combined sports, and Combined cultural standings boards, with a table view.
- Add a "My section" view: a spectator picks a section once (stored on their device) and sees its rank, points gaps, live and upcoming fixtures, recent results, and top performers, with a calendar export of its fixtures.

## Non-goals

Features that depend on organizer-confirmed rulebook details are deferred: walkover/forfeit results, protests and dispute resolution, knockout brackets and seeding, configurable tie-break order and shared ranks in team standings, venue closing times, and a player-of-the-tournament formula.

## Capabilities

### New Capabilities
- `schedule-operations`: Round-robin fixture generation and bulk fixture time shifts with delay notices.
- `spectator-engagement`: TV mode, individual leaderboards, points race, and the My section view.

## Impact

New library modules for scheduling, leaderboards, and the points race; new fixture bulk-create, fixture shift, and leaderboard API routes; a `/tv` page; new dashboard views; an optional `notices` list on the competition state. No new external dependencies and no database migration (the state document gains an optional field).
