## Purpose

Define sport-specific, auditable scorecards for non-athletics Division Wars matches, including scoring inputs and spectator presentation.

## ADDED Requirements

### Requirement: Record structured match events
The system MUST record each live scoring action as a structured match event containing its type, team/section, optional player attribution, match period or innings context, actor, timestamp, and sport-relevant details. The system MUST derive or validate the displayed scorecard state from these events or keep an equivalent auditable state with the same correction history.

#### Scenario: Record a team score without player attribution
- **WHEN** an authorized scorer records a valid scoring action but cannot identify the player
- **THEN** the match score updates and the event remains recorded with no player attribution

#### Scenario: Attribute an event to a rostered player
- **WHEN** an authorized scorer selects a player for a match event
- **THEN** the system verifies that the player belongs to one of the participating section entries and updates that player's match summary

### Requirement: Provide sport-appropriate score entry
The system MUST show scoring actions and match state appropriate to the fixture's configured event and MUST reject actions that are invalid for that sport, event, period, or match status.

#### Scenario: Cricket scorer records a delivery
- **WHEN** an authorized scorer records a legal delivery, boundary, extra, wicket, or dismissal detail
- **THEN** the system updates innings runs, wickets, legal-ball count, over display, batter/bowler figures where supplied, and the ball-by-ball timeline consistently

#### Scenario: Football scorer records a goal or card
- **WHEN** an authorized scorer records a goal, yellow card, red card, or substitution
- **THEN** the team total and any associated player match statistics update, and the event appears in match order

#### Scenario: Basketball scorer records scoring and discipline
- **WHEN** an authorized scorer records a two-point, three-point, free-throw, foul, or substitution event
- **THEN** team and optionally attributed player totals update with the applicable point value and event detail

#### Scenario: Racquet match records a point
- **WHEN** an authorized scorer awards a rally/point in a configured tennis, lawn-tennis, table-tennis, badminton, squash, or pickleball event
- **THEN** the correct game/set/match state advances according to that event's configured format

#### Scenario: Unsupported event type is submitted
- **WHEN** a scorer submits an event type not enabled for the fixture's sport/event
- **THEN** the system rejects it without changing the scorecard

### Requirement: Present a sport-specific match scorecard
The system MUST display the current match score and relevant sport-specific state, participant/team figures, and a chronological match event timeline. The score must remain the most prominent information, with detailed statistics available without obscuring the live score.

#### Scenario: Spectator opens a live scorecard
- **WHEN** a spectator opens a live fixture
- **THEN** the spectator sees the participating sections, score, match state, sport-specific summary, and recent events without organizer controls or student IDs

#### Scenario: Event head opens scoring console
- **WHEN** an assigned event head opens a fixture they can manage
- **THEN** the console presents large, fast scoring controls, relevant player selectors, current player/team figures, recent event history, and a clear correction action

### Requirement: Correct a match event safely
The system MUST permit authorized correction or reversal of a previously recorded match event, preserve the original action and correction actor/reason in the audit history, and recalculate affected scorecard totals. A correction MUST NOT silently erase history.

#### Scenario: Scorer undoes a mistaken action
- **WHEN** an authorized scorer reverses a recent mistaken event before result confirmation
- **THEN** the scorecard recalculates and both the original event and reversal remain traceable

#### Scenario: Central admin corrects a submitted result
- **WHEN** a central admin corrects an event after submission or confirmation
- **THEN** the system retains the prior state, records the reason and actor, and updates the authoritative result according to the existing result-confirmation rules

### Requirement: Keep scorecards within existing match access controls
The system MUST enforce event-head scope and central-admin override on every scorecard mutation. Spectators and users without an applicable scoring assignment MUST NOT mutate match events.

#### Scenario: Unauthorized scorecard mutation
- **WHEN** a spectator or unassigned user submits a scorecard event
- **THEN** the system rejects the request and leaves the match unchanged

### Requirement: Preserve athletics result workflow
Athletics fixtures MUST continue to use event-place/result recording and MUST NOT be forced into match event scorecards or live player-stat controls.

#### Scenario: Athletics result is entered
- **WHEN** an authorized organizer records an athletics result
- **THEN** the existing place/result workflow remains available without cricket/team match controls
