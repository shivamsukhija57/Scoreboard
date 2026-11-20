## 1. Schedule operations

- [x] 1.1 Add round-robin pairing and slot-placement planning with venue and section clash checks
- [x] 1.2 Add a bulk fixture-create endpoint that re-checks clashes, requires acknowledgement, and writes one audit entry
- [x] 1.3 Add a fixture shift planner and endpoint that moves only scheduled fixtures, flags new clashes, and audits old and new times
- [x] 1.4 Store optional same-day delay notices and show them on the overview and schedule
- [x] 1.5 Add generator and shift panels to the schedule view for schedulers and central admins

## 2. Spectator engagement

- [x] 2.1 Build leaderboard calculations from finalized cricket deliveries and player-attributed scorecard events, with shared ranks
- [x] 2.2 Serve leaderboards from the server, hiding names from visitors who are not signed in
- [x] 2.3 Add a Players view with gender and section filters
- [x] 2.4 Calculate cumulative section points by day and add the points-race chart with hover readout and table view
- [x] 2.5 Add the My section picker, device storage, section summary, and calendar export
- [x] 2.6 Add the `/tv` page with periodic refresh and a link from the overview

## 3. Verification

- [x] 3.1 Add tests for round-robin pairing, slot placement, shifting, leaderboards, and the points race
- [x] 3.2 Run the build and check each new view against a local data file, never the live database
