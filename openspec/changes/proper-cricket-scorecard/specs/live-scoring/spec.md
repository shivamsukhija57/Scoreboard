## MODIFIED Requirements

### Requirement: Track match lifecycle and result confirmation
The system MUST distinguish scheduled, live, completed, and result-confirmation states, retain the recorded outcome and its confirmation status, and support cricket scorecard submission and central-admin approval without losing innings detail.

#### Scenario: Cricket scorer submits final result
- **WHEN** an assigned event head completes all configured cricket innings and submits the result
- **THEN** the match enters awaiting confirmation with the complete innings scorecards frozen for review

#### Scenario: Cricket result is approved or returned
- **WHEN** a central administrator approves or returns a cricket result
- **THEN** approval finalizes the scorecard for standings, while return reopens scoring with the administrator's reason and preserves the submitted history

### Requirement: Apply the configured points policy
The system MUST calculate section points from confirmed outcomes using the event's published points policy and the fixture tournament stage, and MUST make resulting points available to the competition standings.

#### Scenario: Approve a stage-specific cricket result
- **WHEN** a central administrator approves a cricket result
- **THEN** points for both sections are calculated using the cricket event's published policy and the fixture stage
- **AND** unapproved or reopened results contribute no final points
