## Purpose

Provides live, sport-appropriate scoring for Division Wars events and turns confirmed match outcomes into trusted event results and section points.

## ADDED Requirements

### Requirement: Provide sport-specific scorekeeping
The system MUST provide scoring controls and match state appropriate to each configured event, including cricket, basketball, volleyball, football, tennis or lawn tennis, table tennis, foosball, and throwball.

#### Scenario: Event head scores an assigned live match
- **WHEN** an assigned event head opens a live match
- **THEN** the system displays the event's configured scoring controls and current match state

#### Scenario: Unauthorized user attempts to score
- **WHEN** a user without the event assignment attempts to change a live score
- **THEN** the system denies the change

### Requirement: Track match lifecycle and result confirmation
The system MUST distinguish scheduled, live, completed, and result-confirmation states, and MUST retain the recorded outcome and its confirmation status.

#### Scenario: Event head submits a result
- **WHEN** an event head completes a match and submits its result
- **THEN** the system marks the result as awaiting confirmation or confirmed according to the event's configured approval rule

#### Scenario: Correct a confirmed result
- **WHEN** a central administrator corrects a confirmed result
- **THEN** the system records the correction and recalculates affected standings from the corrected outcome

### Requirement: Apply the configured points policy
The system MUST calculate section points from confirmed outcomes using the event's published points policy and MUST make the resulting points available to the competition standings.

#### Scenario: Confirm an event result
- **WHEN** an event result is confirmed
- **THEN** the system applies the configured event points to the represented section or sections

#### Scenario: Result is not confirmed
- **WHEN** a result is awaiting confirmation
- **THEN** the system does not treat its points as final in the standings
