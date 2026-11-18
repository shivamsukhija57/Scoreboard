# event-scheduling Specification

## Purpose

Gives scheduling staff a shared way to publish and maintain fixtures, venues, and changes throughout the multi-week competition.

## Requirements

### Requirement: Create and manage event fixtures
The system MUST allow scheduling staff to create and update fixtures with an event, participating sections or entries, date and time, venue, and status.

#### Scenario: Publish a fixture
- **WHEN** a scheduler saves a fixture with its required event, time, and venue details
- **THEN** the system makes the fixture available in the schedule

### Requirement: Surface schedule conflicts
The system MUST identify overlapping fixture assignments that use the same venue or involve the same section entry at the same time, and MUST show the conflict to the scheduler before publication.

#### Scenario: Fixture conflicts with a venue booking
- **WHEN** a scheduler creates a fixture that overlaps another fixture at the same venue
- **THEN** the system flags the venue conflict before the fixture is published

#### Scenario: Fixture conflicts with a section entry
- **WHEN** a scheduler creates a fixture that overlaps another fixture for the same section entry
- **THEN** the system flags the section conflict before the fixture is published

### Requirement: Communicate schedule changes
The system MUST show the current fixture time and venue after an authorized schedule change, and MUST retain the previous value and change details for central-admin review.

#### Scenario: Scheduler changes a published fixture
- **WHEN** a scheduler changes the time or venue of a published fixture
- **THEN** the system updates the schedule and records the previous and new values and the responsible user
