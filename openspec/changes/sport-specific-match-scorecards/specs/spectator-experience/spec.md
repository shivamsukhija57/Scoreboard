## MODIFIED Requirements

### Requirement: Keep live information current
The system MUST make live scorecard totals, sport-specific match state, recent match events, schedule changes, and confirmed standings available to spectators after authorized organizers update them. Public match views MUST omit student IDs and private roster details.

#### Scenario: Live match event is recorded
- **WHEN** an authorized event head records a scoring event
- **THEN** the spectator view refreshes to show the updated score, relevant sport-specific state, and latest timeline event

#### Scenario: Spectator views player attribution
- **WHEN** a match event has a public-safe player name attribution
- **THEN** the spectator can see that name and the associated match statistic without seeing the student's ID

#### Scenario: Athletics result is displayed
- **WHEN** an athletics result is entered
- **THEN** spectators see the event result/place presentation rather than a match scorecard
