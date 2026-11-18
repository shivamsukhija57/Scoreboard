# access-control Specification

## Purpose

Allows public read-only access to the competition while requiring college-account users with the proper role and assignment to perform organizer actions.

## Requirements

### Requirement: Restrict organizer access to college accounts
The system MAY allow public read-only spectator access. Any organizer action MUST require sign-in with an account in the configured college identity domain, and accounts outside that domain MUST be denied organizer access.

#### Scenario: College account signs in
- **WHEN** a user signs in with an account in the configured college domain
- **THEN** the system grants access according to the user's assignments

#### Scenario: Public visitor opens the scoreboard
- **WHEN** a visitor opens the application without signing in while public access is enabled
- **THEN** the system shows the spectator experience without exposing participant rosters or allowing organizer changes

#### Scenario: Non-college account signs in
- **WHEN** a user attempts to sign in with an account outside the configured college domain
- **THEN** the system denies access

### Requirement: Assign scoped organizer roles
The system MUST support spectator, section administrator, event head, scheduler, and central administrator roles. Organizer permissions MUST be limited to their assigned section, event, or scheduling scope, while a central administrator has access to all application functions.

#### Scenario: Section administrator manages assigned section
- **WHEN** a section administrator manages entries
- **THEN** the system permits changes only for their assigned section and enforces a maximum of three section administrators per section

#### Scenario: Event head opens an assigned event
- **WHEN** an event head accesses scoring tools
- **THEN** the system permits access only to events assigned to that person

#### Scenario: Scheduler manages fixtures
- **WHEN** a scheduler creates or changes a fixture
- **THEN** the system permits schedule actions and does not grant unrelated central-admin controls

#### Scenario: Central administrator uses the application
- **WHEN** a central administrator accesses any competition area
- **THEN** the system grants the permissions needed to view and manage all sections, events, schedules, results, rules, and assignments

### Requirement: Import and review organizer assignments
The system MUST allow central administrators to import organizer assignments from a spreadsheet or plain-text list, review the parsed email IDs and scopes, and resolve invalid or conflicting rows before applying the assignments.

#### Scenario: Review imported assignments
- **WHEN** a central administrator uploads or pastes an assignment list
- **THEN** the system shows the parsed users, roles, scopes, and any validation errors before saving

### Requirement: Allow multiple assignments per account
The system MUST allow one college account to hold multiple role assignments, and MUST grant the combined permissions of those assignments without exceeding their scopes.

#### Scenario: User has more than one organizer role
- **WHEN** a user has assignments for more than one role
- **THEN** the system makes the tools for each assignment available while retaining each assignment's scope
