## MODIFIED Requirements

### Requirement: Provide sport-specific scorekeeping
The system MUST provide sport-appropriate scorecard state and scoring controls for configured non-athletics events, including cricket, basketball, volleyball, football, tennis/lawn tennis, table tennis, badminton, squash, pickleball, foosball, throwball, and other configured match sports. Scoring actions MUST be recorded as match events, and player attribution MUST be optional except where the event format requires named individual competitors. Athletics MUST remain on its result/place workflow.

#### Scenario: Event head scores an assigned live match
- **WHEN** an assigned event head opens a live match
- **THEN** the system displays sport-specific scorecard state, applicable scoring controls, and the event timeline

#### Scenario: Team score is recorded without player detail
- **WHEN** player attribution is unknown or not meaningful for an event
- **THEN** the event head can update the team score without selecting a player

#### Scenario: Unauthorized user attempts to score
- **WHEN** a user without the event assignment attempts to change a live score
- **THEN** the system denies the change

### Requirement: Track match lifecycle and result confirmation
The system MUST distinguish scheduled, live, completed, and result-confirmation states, and MUST retain the sport-specific scorecard, event history, recorded outcome, and confirmation status.

#### Scenario: Event head submits a result
- **WHEN** an event head completes a match and submits its result
- **THEN** the system preserves the scorecard and marks the result as awaiting confirmation or confirmed according to the event's configured approval rule

#### Scenario: Correct a confirmed result
- **WHEN** a central administrator corrects a confirmed result
- **THEN** the system records the correction and recalculates affected standings from the corrected outcome

### Requirement: Apply the configured points policy
The system MUST calculate section points from confirmed match/event outcomes using the event's published points policy and MUST make the resulting points available to competition standings.

#### Scenario: Confirm an event result
- **WHEN** an event result is confirmed
- **THEN** the system applies the configured event points to the represented section or sections

#### Scenario: Result is not confirmed
- **WHEN** a result is awaiting confirmation
- **THEN** the system does not treat its points as final in the standings
