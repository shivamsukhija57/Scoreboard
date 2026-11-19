## ADDED Requirements

### Requirement: Show sport-level standings with sport-specific statistics
The system MUST provide a standings board for each sport, calculated from approved match results, with the statistics needed to rank teams for that sport.

#### Scenario: Cricket standings
- **WHEN** approved cricket results exist
- **THEN** the board shows played, wins, losses, no-results, draws, and net run rate for each section
- **AND** ranks sections by configured competition points, then net run rate

#### Scenario: Football standings
- **WHEN** approved football results exist
- **THEN** the board shows played, wins, losses, no-results, draws, goals for, goals against, and goal difference
- **AND** ranks sections by configured competition points, then goal difference and goals for

#### Scenario: Other sport standings
- **WHEN** a sport has approved results
- **THEN** the board shows sport-appropriate played/win/loss/draw and score differential or equivalent statistics
- **AND** applies that sport's published tie-break order

### Requirement: Show combined cultural and sports points boards
The system MUST show a combined cultural board and a combined sports board, each with total points by section and points awarded by event.

#### Scenario: Compare section totals by event
- **WHEN** a user views a combined board
- **THEN** they can see each section's total and a separate per-event points breakdown
- **AND** rows rank by total points, with any remaining tie resolved by the board's configured tie-break rule

### Requirement: Separate sports and cultural totals on the main scoreboard
The main scoreboard MUST display sports points and cultural points as separate totals alongside the overall combined total.

#### Scenario: Approved result changes standings
- **WHEN** a result is approved, reopened, or corrected
- **THEN** all affected sport, combined category, and main standings recalculate from the approved result state
- **AND** pending or reopened results do not contribute points or match statistics
