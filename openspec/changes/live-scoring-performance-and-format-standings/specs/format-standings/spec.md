## Purpose

Allows organizers and spectators to compare division results in each individual event format while retaining the combined sports, cultural, and overall standings boards.

## ADDED Requirements

### Requirement: Filter standings by event format
The standings view MUST provide a format selector separate from the board selector. Available formats MUST be scoped to the selected board and represented by the event definitions. Selecting one format MUST show rankings and results for that event only; selecting all formats MUST preserve the selected board's existing aggregate view.

#### Scenario: Select one format within combined sports
- **WHEN** a user selects Combined sports and chooses an event format such as Men's Singles
- **THEN** the view lists only finalized results and awarded points from that specific event
- **AND** it ranks the sections using that event's points and applicable sport tie-break statistics

#### Scenario: Select one cultural format
- **WHEN** a user selects Combined cultural and chooses one cultural event format
- **THEN** the view shows only that event's finalized results, section points, and ranking

#### Scenario: Change the board selection
- **WHEN** a user changes the board from a sport to cultural, combined, or another sport
- **THEN** the format selector updates to include only formats available in the selected board
- **AND** a format that is no longer available is cleared to All formats

#### Scenario: Choose all formats
- **WHEN** a user chooses All formats
- **THEN** the view shows the existing aggregate standings for the selected board

#### Scenario: Result is reopened for correction
- **WHEN** a finalized result for the selected format is reopened by a central administrator
- **THEN** it is excluded from final format standings until the event head submits the corrected result
