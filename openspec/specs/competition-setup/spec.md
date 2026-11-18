# competition-setup Specification

## Purpose

Defines how central administrators configure the first-year Division Wars and how section entries, participant eligibility, tournament formats, and event points are maintained.

## Requirements

### Requirement: Configure the competition and its events
The system MUST allow a central administrator to configure a competition for the first-year cohort with five sections, the participating sports, individual events, and event-specific team-size and eligibility rules.

#### Scenario: Configure an event
- **WHEN** a central administrator creates an event for a sport
- **THEN** the system records its name, sport, allowed entry size, eligibility rules, tournament format, and points policy

### Requirement: Maintain one section entry per event
The system MUST allow each section to submit one entry for each event, where an entry may contain one or more participants according to the event's configured team-size rules.

#### Scenario: Submit a valid entry
- **WHEN** a section administrator submits an entry that satisfies the event's roster and eligibility rules
- **THEN** the system accepts the entry for that section and event

#### Scenario: Reject an invalid entry
- **WHEN** a section administrator submits an entry with an invalid team size or an ineligible participant
- **THEN** the system rejects the submission and identifies the rule that was not met

### Requirement: Enforce player participation caps
The system MUST enforce the configured maximum number of sports or events in which a participant may be entered, and MUST prevent a submission that exceeds that cap.

#### Scenario: Participant reaches the cap
- **WHEN** a section administrator adds a participant to an event that would exceed the configured cap
- **THEN** the system blocks the submission and explains the cap conflict

### Requirement: Lock submitted entries for section administrators
The system MUST prevent section administrators from changing an entry after it is submitted. A central administrator MUST be able to make changes to any entry.

#### Scenario: Section administrator edits a submitted entry
- **WHEN** a section administrator attempts to change a submitted entry
- **THEN** the system denies the change

#### Scenario: Central administrator changes a submitted entry
- **WHEN** a central administrator changes a submitted entry
- **THEN** the system saves the change and records who made it and when

### Requirement: Configure event points
The system MUST let a central administrator define and review the points awarded for event outcomes or tournament placements according to the event's selected format before the points policy is published.

#### Scenario: Review a points policy
- **WHEN** a central administrator configures the points for an event
- **THEN** the system presents the outcomes or placements and their corresponding section points for review before publication
