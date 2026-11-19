## ADDED Requirements

### Requirement: Give immediate and recoverable scoring feedback
The system MUST give event heads immediate visible feedback when they record a score, identify whether it is pending, saved, or failed, and preserve the scoring input for correction or retry if saving fails. A successful update MUST reconcile to the server-authoritative match state without reloading the full competition after every scoring action.

#### Scenario: Save a live scoring action
- **WHEN** an assigned event head records a scoring action
- **THEN** the scorer immediately shows the pending score change and save state
- **AND** after the server accepts the action, the view uses the canonical saved match data

#### Scenario: Scoring action fails to save
- **WHEN** the server rejects a score update or the connection fails
- **THEN** the scorer shows an actionable error and restores the last saved score
- **AND** the event head's scoring input remains available so it can be corrected or retried

#### Scenario: Prevent duplicate pending actions
- **WHEN** a scoring request is still pending
- **THEN** the corresponding scoring control cannot submit the same action repeatedly
- **AND** the interface clearly indicates that the action is still being saved

### Requirement: Keep common scoring actions fast and keyboard accessible
The system MUST let event heads enter common actions for the configured sport with a short, predictable interaction flow. All score controls MUST be operable by keyboard and MUST expose their labels and pending/disabled state to assistive technology.

#### Scenario: Use a common scoring action
- **WHEN** an event head opens an assigned live fixture
- **THEN** the common scoring actions for that sport are immediately available without opening a separate settings page

#### Scenario: Score by keyboard
- **WHEN** an event head navigates the scoring controls with a keyboard
- **THEN** the event head can select and submit a common scoring action without using a pointer
- **AND** keyboard shortcuts do not trigger while text or numeric inputs are being edited

## MODIFIED Requirements

### Requirement: Track match lifecycle and result confirmation
The system MUST distinguish scheduled, live, and completed result-final states, retain the recorded outcome and finalization status, and MUST NOT require a central-administrator approval action to finalize a result. When an assigned event head submits a completed match with a published points policy, the system MUST immediately finalize the result and make its points available to standings. A central administrator MAY reopen a finalized result for correction; reopening removes its points until the corrected result is submitted again.

#### Scenario: Event head submits a completed result
- **WHEN** an assigned event head submits a completed match
- **THEN** the system marks it completed and final without a central-admin review step
- **AND** it calculates and stores the event points immediately

#### Scenario: Event points policy is not published
- **WHEN** an event head attempts to finalize a result whose points policy is not published
- **THEN** the system keeps the match live and explains that the event policy must be published first

#### Scenario: Central admin reopens a finalized result
- **WHEN** a central administrator reopens a completed result with a correction reason
- **THEN** the fixture returns to live correction state and contributes no final standings points until resubmitted
- **AND** the reopen action and reason are written to the audit history

### Requirement: Apply the configured points policy
The system MUST calculate section points from finalized outcomes using the event's published points policy and the fixture tournament stage, and MUST make the resulting points available to competition standings when the event head submits the completed result.

#### Scenario: Finalize a stage-specific result
- **WHEN** an assigned event head submits a completed result
- **THEN** points for both sections are calculated using the event's published policy and the fixture stage
- **AND** the points are immediately included in standings

#### Scenario: Result is live or reopened
- **WHEN** a result has not been submitted as final or has been reopened for correction
- **THEN** it contributes no final points to standings

## ADDED Requirements

### Requirement: Provide a central-admin audit screen in place of result approvals
The system MUST provide central administrators with a filterable audit screen in place of the result approval queue. The screen MUST show successful score changes, corrections, final result submissions, and result reopens with the actor, time, affected fixture, human-readable change details, and reason where supplied. The screen MUST NOT offer approve or reject result actions.

#### Scenario: Central administrator reviews scoring history
- **WHEN** a central administrator opens the audit screen
- **THEN** the system shows the newest audit entries with actor, timestamp, action, fixture, and change details
- **AND** the administrator can filter entries by date, event, action, or actor

#### Scenario: Event head submits a final result
- **WHEN** an event head finalizes a result
- **THEN** the audit screen records the final score, awarded points, actor, and submission time

#### Scenario: Event head corrects a score
- **WHEN** an event head reverses or corrects a scoring action
- **THEN** the audit screen retains the original action and displays the correction reason and resulting score

#### Scenario: Non-admin attempts to view the audit screen
- **WHEN** a user without central-admin access requests audit history
- **THEN** the system denies access and does not expose audit actor details

### Requirement: Migrate legacy result records without approval
When the system encounters a legacy awaiting-confirmation result whose points policy is published, it MUST finalize the result and add one stable audit record. When an already-finalized legacy result has missing point awards and its policy is published, the system MUST restore its awards and add one stable audit record. Results requiring an unpublished policy MUST remain visible to central administrators as requiring policy setup and MUST NOT expose approve or reject actions.

#### Scenario: Legacy submitted result can be finalized after policy publication
- **WHEN** the event points policy is published for a legacy awaiting-confirmation result
- **THEN** migration MUST finalize the result, apply stage points, and record exactly one stable audit entry

#### Scenario: Missing legacy awards can be restored
- **WHEN** a finalized legacy result has missing point values and its policy is published
- **THEN** migration MUST populate the awards and record exactly one stable audit entry
