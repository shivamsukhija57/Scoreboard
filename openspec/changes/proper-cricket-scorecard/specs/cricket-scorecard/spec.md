## ADDED Requirements

### Requirement: Score cricket one delivery at a time
The system MUST provide assigned event heads with a ball-by-ball scorer for the configured cricket match, including innings, batting side, striker, non-striker, bowler, over, legal-ball count, runs, extras, and wickets.

#### Scenario: Record a legal delivery
- **WHEN** an event head records a legal delivery's batter runs or wicket
- **THEN** the innings total, batter figures, bowler figures, over notation, and commentary update together

#### Scenario: Record a wide or no-ball
- **WHEN** an event head records a wide or no-ball
- **THEN** the scorecard records the extra type and automatic penalty, allows additional runs, and does not count the delivery as a legal ball
- **AND** batter, bowler, and team totals follow the selected extra/run type

#### Scenario: Record bye or leg-bye
- **WHEN** an event head records byes or leg-byes
- **THEN** team extras increase, batter runs do not increase, and bowler runs conceded follow cricket scoring rules

#### Scenario: Complete an over
- **WHEN** six legal balls have been recorded in the over
- **THEN** the over closes, the bowler is changed, and striker/non-striker ends swap according to the recorded run outcome and over-end rule

### Requirement: Maintain a complete innings scorecard
The system MUST derive the innings total and display batting figures (runs, balls, fours, sixes, dismissal), bowling figures (overs, maidens where available, runs, wickets, wides, no-balls), extras by type, fall of wickets, and current partnership from the delivery history.

#### Scenario: View an innings in progress
- **WHEN** a spectator or authorized scorer opens a live cricket fixture
- **THEN** they see the team score, wickets, overs, current batters, current bowler, innings/target context, batting table, bowling table, extras, and recent ball-by-ball commentary

#### Scenario: View a completed innings
- **WHEN** an innings or match is complete
- **THEN** its full scorecard remains available with innings totals, batting and bowling figures, fall of wickets, and result

### Requirement: Correct scoring without losing history
The system MUST let an authorized scorer correct a delivery through an explicit reversal and replacement, retaining the original delivery, correction reason, actor, and updated derived scorecard.

#### Scenario: Correct an incorrect delivery
- **WHEN** an event head corrects a recorded delivery
- **THEN** totals and player figures are recalculated and the correction is visible in the audit/commentary history

### Requirement: Preserve approval and standings integrity
The system MUST retain the existing event-head result submission and central-admin approval workflow for cricket. Unapproved, reopened, or rejected results MUST NOT count as confirmed standings results.

#### Scenario: Submit and approve a cricket result
- **WHEN** the event head submits a completed cricket match and the central admin approves it
- **THEN** the approved scorecard becomes final and its configured tournament-stage points flow to standings
