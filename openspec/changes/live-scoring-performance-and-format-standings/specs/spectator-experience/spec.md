## MODIFIED Requirements

### Requirement: Keep live information current
The system MUST make score, match status, schedule changes, and final standings available to spectators after they are updated by authorized organizers. When a live match is open and the page is visible, a score update MUST appear on spectator displays within two seconds of being saved under normal network conditions. Live refresh MUST avoid repeatedly transferring or rendering the full competition when only one match has changed, pause or reduce work while the page is hidden, and recover from transient connection failures.

#### Scenario: Live match score changes
- **WHEN** an authorized event head records and saves a score update
- **THEN** the spectator view displays the updated score and live status within two seconds under normal network conditions

#### Scenario: Only the open live match changes
- **WHEN** a spectator is viewing a live fixture and another fixture is unchanged
- **THEN** the system refreshes the changed fixture without requiring a full competition reload

#### Scenario: Browser tab is not visible
- **WHEN** the spectator's browser tab is hidden
- **THEN** the system pauses or reduces frequent live refresh work and catches up when the tab becomes visible

#### Scenario: Live refresh temporarily fails
- **WHEN** a live snapshot request fails temporarily
- **THEN** the last confirmed display remains visible, the live state indicates a stale/reconnecting condition, and refresh resumes automatically
