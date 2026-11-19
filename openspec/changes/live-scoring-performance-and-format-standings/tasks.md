## 1. Fast and reliable scoring

- [x] 1.1 Add an authenticated, viewer-safe endpoint for one fixture with an `updatedAt` revision and a not-modified response for unchanged snapshots.
- [x] 1.2 Apply the returned canonical fixture after a successful scoring PATCH instead of fetching the full competition after every action.
- [x] 1.3 Add per-fixture pending state and an optimistic score projection; restore the last saved fixture and retain scorer inputs when a save fails.
- [x] 1.4 Prevent duplicate score submissions while a fixture action is pending and show pending, saved, and error states clearly.
- [x] 1.5 Add accessible sport-specific quick actions and keyboard entry for common scoring actions; ignore shortcuts while editing text or numeric inputs.
- [x] 1.6 Finalize results and award published stage points when an event head submits; remove approve/reject result actions.
- [x] 1.7 Reopen final results only for central-admin correction, remove their standings points, and require event-head resubmission to finalize again.
- [x] 1.8 Auto-finalize legacy awaiting-confirmation results when their points policy is published and record a stable migration audit entry.

## 2. Fresh live match updates

- [x] 2.1 Poll only the active fixture snapshot while a live match is open and the browser tab is visible; pause while hidden and refresh on return.
- [x] 2.2 Add bounded retry/backoff and a visible stale/reconnecting state while retaining the last confirmed score.
- [x] 2.3 Keep slower competition refreshes for non-match changes without allowing them to overwrite a newer fixture snapshot.

## 3. Format-specific standings

- [x] 3.1 Add a second format selector whose options are scoped to Overall, Combined sports, Combined cultural, or the selected sport.
- [x] 3.2 Compute a single-format board from only finalized results for the selected event, using that event's stored points and applicable tie-break statistics.
- [x] 3.3 Preserve current aggregate standings when All formats is selected, and clear an out-of-scope event selection when the board changes.
- [x] 3.4 Make both selectors and the format-specific standings usable on narrow screens and with keyboard navigation.

## 4. Central-admin audit screen

- [x] 4.1 Replace the Result approvals navigation item and page with a central-admin-only audit screen; remove approve/reject controls.
- [x] 4.2 Record readable audit details for score actions, corrections, final result submissions, stage points, and reopens, including actor, time, and fixture identity.
- [x] 4.3 Add date, event, action, and actor filters and a way to open the affected fixture; preserve audit access restrictions for non-admin users.

## 5. Verification

- [x] 5.1 Add tests for fixture snapshot revisions, unchanged snapshots, viewer filtering, hidden-tab pause/resume, and transient failures.
- [x] 5.2 Add tests for optimistic score reconciliation, save failure rollback/input retention, duplicate-submit prevention, and final points on submission without approval.
- [x] 5.3 Add tests proving format filters include only the selected event, exclude reopened results, and preserve zero-point awards.
- [x] 5.4 Add tests for legacy finalization, audit details, central-admin-only audit access, and correction/reopen history.
- [x] 5.5 Verify event-head authorization, spectator freshness, keyboard operation, responsive layout, and standings after direct finalization.

