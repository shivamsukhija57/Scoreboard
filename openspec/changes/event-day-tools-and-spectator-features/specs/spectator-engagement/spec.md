## ADDED Requirements

### Requirement: TV / projector mode
The system MUST provide a full-screen view at `/tv` for shared screens that shows live matches, the overall points table, and upcoming fixtures, and refreshes without interaction.

#### Scenario: Shared screen
- **WHEN** the `/tv` page is open on a display
- **THEN** it shows up to three live matches, the five sections ranked by finalized points, and the next scheduled fixtures in type sized for reading across a room
- **AND** it refreshes periodically while visible and keeps the last data if a refresh fails

### Requirement: Individual leaderboards
The system MUST rank individual players from finalized, player-attributed scorecard events for cricket runs, cricket wickets, football goals, and basketball points.

#### Scenario: Ranking players
- **WHEN** finalized fixtures contain player-attributed events
- **THEN** each board lists the top players by total with their section, and players with equal totals share a rank
- **AND** team-only events and unfinalized fixtures are excluded

#### Scenario: Privacy
- **WHEN** a visitor is not signed in with a college account
- **THEN** leaderboards show sections and totals without player names
- **AND** student IDs are never shown to anyone on a leaderboard

### Requirement: Points race over time
The system MUST show cumulative section points by day on the Overall, Combined sports, and Combined cultural boards.

#### Scenario: Reading the race
- **WHEN** finalized results exist on more than one day
- **THEN** a line per section shows its cumulative points at the end of each day, with a legend, direct end labels, a hover readout, and a table view
- **AND** a reopened result no longer counts toward any day

### Requirement: My section view
The system MUST let a spectator choose a section to follow, remember it on the device, and show a section-focused summary.

#### Scenario: Following a section
- **WHEN** a spectator picks a section
- **THEN** the My section view shows its overall rank and points, the gap to the sections directly above and below, its live and upcoming fixtures, its recent finalized results, and its top performers
- **AND** the choice persists on that device without sign-in and can be changed at any time

#### Scenario: Calendar export
- **WHEN** the spectator exports the section's fixtures
- **THEN** they receive a calendar file containing each upcoming fixture's event, opponent, venue, and time
