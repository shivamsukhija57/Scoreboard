## ADDED Requirements

### Requirement: Generate round-robin fixtures for an event
The system MUST let schedulers and central admins generate a round-robin set of fixtures for one event, review it, and publish it in one action.

#### Scenario: Five sections in a round robin
- **WHEN** a scheduler selects an event, five sections, a date range, a daily window, a slot length, and one or more venues
- **THEN** the preview lists ten matches in five rounds, with each section playing every other section once and one section sitting out each round
- **AND** each match is placed in the earliest slot where its venue is free and neither section has another fixture

#### Scenario: Not enough slots
- **WHEN** the window, venues, and existing fixtures cannot fit every match
- **THEN** the preview marks the matches that could not be placed and publishing creates only the placed ones

#### Scenario: Publishing re-checks clashes
- **WHEN** the generated fixtures are published
- **THEN** the server re-checks venue and section overlaps and requires acknowledgement before creating clashing fixtures
- **AND** one audit entry records the bulk creation

### Requirement: Shift a venue's fixtures
The system MUST let schedulers and central admins move every scheduled fixture at one venue on one day, from a chosen time onward, by a fixed number of minutes.

#### Scenario: Running late
- **WHEN** a scheduler shifts a venue's fixtures by 45 minutes from 15:00
- **THEN** only fixtures at that venue, on that day, still scheduled, and starting at or after 15:00 move
- **AND** live and finalized fixtures never move

#### Scenario: New clashes after shifting
- **WHEN** a moved fixture would overlap another fixture at the same venue or with the same section
- **THEN** the preview flags it and the server requires acknowledgement before applying the shift

#### Scenario: Delay notice
- **WHEN** the scheduler chooses to notify spectators
- **THEN** a delay notice naming the venue, delay, and reason appears on the overview and schedule for the rest of that day
- **AND** each moved fixture's old and new times are recorded in the audit history
