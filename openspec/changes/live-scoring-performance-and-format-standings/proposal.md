## Why

Score entry currently feels delayed because the scorer waits for a full competition reload after every action, while spectators may wait up to ten seconds for the next refresh. Standings also combine event formats, making it hard to compare divisions within a specific event such as badminton singles or mixed doubles.

## What Changes

- Make scorer feedback immediate and resilient, with an optimistic update from the saved match response, clear saving/synced/error state, and safe recovery when a save fails.
- Deliver live match changes to other viewers much sooner while reducing unnecessary whole-competition requests, especially when the page is in the background or no match is live.
- Improve scorer controls with sport-appropriate quick actions, keyboard-friendly input, visible connection/save state, and a clear correction path.
- Add a second standings selector for event format. Its choices will follow the selected board (all events, combined sports, combined cultural, or one sport), and a selected format will show standings for that event only.
- Remove the central-admin result approval queue. When an assigned event head submits a completed result, finalize it and apply the published event points immediately.
- Replace the approval screen with a central-admin audit screen showing who changed scores or results, when the action occurred, what changed, and which fixture was affected; retain a central-admin correction path with an audit entry.
- Keep reopened fixtures out of final standings until the event head submits the corrected result again.

## Capabilities

### New Capabilities

- `format-standings`: Filter standings to an individual event format while preserving combined and overall boards.

### Modified Capabilities

- `live-scoring`: Change scorer feedback and event-head controls so a saved score appears immediately, finalizes without a central-admin approval step, and is traceable through a central-admin audit screen.
- `spectator-experience`: Change live-update freshness and avoid unnecessary refresh work when no active live information needs refreshing.

## Impact

Dashboard live score, standings, and central-admin audit views; match PATCH and live snapshot APIs; client update and recovery behavior; competition-store reads and audit details; sport-specific scorer controls; OpenSpec `live-scoring` and `spectator-experience` contracts. No third-party live score feed is introduced. Published points policies remain authoritative, and finalized results no longer wait for a review action.
