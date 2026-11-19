## Context

See `proposal.md` for the observed delays and requested standings filter. The dashboard currently reloads the complete competition after each successful match PATCH and polls that same full payload every ten seconds. The PATCH handler already returns the updated fixture, and fixtures already have an `updatedAt` field. Standings currently have one selector for board/sport and aggregate all event definitions for that selection.

## Goals / Non-Goals

**Goals:** shorten the scorer's feedback loop, reduce refresh work for spectators, make scoring failure recoverable, let a user isolate one event format within any applicable standings board, remove result approvals, and retain central-admin auditability.

**Non-Goals:** change the event's published scoring/points rules, introduce a third-party live-score service, or redesign the competition data store in this change.

## Decisions

- **Use the match PATCH response as the canonical write acknowledgement.** The scorer will first show a pending projection of the action, then replace it with the fixture returned by the server. This removes the current extra full-competition GET after each score. If the write fails, restore the last confirmed fixture, retain the selected input, and provide a retry/error state. Disable score submission for the same fixture while its write is pending to avoid accidental duplicate clicks.
- **Add a focused match snapshot path for other viewers.** A small GET response for a fixture will include its `updatedAt` revision and honor a conditional request so unchanged data can return without a fixture payload. While a live fixture is open and the tab is visible, poll that one fixture at a one-second interval; pause while hidden, catch up on visibility, and back off temporarily after failures. Continue less frequent competition refreshes for schedule/roster/admin changes. This avoids a new realtime dependency and works with both local file storage and the current Supabase-backed store.
- **Keep transport status distinct from match status.** Show a subtle live/connecting/stale indicator to spectators and a pending/saved/error indicator to scorers. A temporary refresh failure leaves the last saved score visible instead of replacing it with an empty state.
- **Keep sport-specific scoring semantics in the existing server scoring layer.** Fast controls and keyboard shortcuts use the current event configuration. A shortcut is ignored while a text or numeric field has focus. The server remains authoritative for validation, scoring, authorization, corrections, and standings.
- **Finalize on event-head submission.** A successful result submission sets the fixture to completed/final, calculates its event-stage points from the published policy, and makes them visible in standings in the same saved update. If the policy is unpublished, reject finalization with an actionable message. Remove approve/reject actions and the result-approval navigation item.
- **Replace the approval queue with a central-admin audit screen.** Use the existing audit store, but enrich match-action audit details with action type, event/match identity, score before and after, points on final submission, correction reason, actor, and time. The view is central-admin-only, filterable, and read-only except for a clearly labeled reopen-for-correction action. Reopening removes final points and itself creates an audit entry; corrected scores become final again only when the event head submits.
- **Migrate legacy results without preserving approval.** On data read/update, auto-finalize an `awaiting-confirmation` fixture if its event points policy is published and add one stable audit entry describing the migration. Also restore missing point awards on an already-finalized legacy fixture when its policy is published, with a separate stable audit entry. If a needed policy is unpublished, expose the fixture in the audit screen as needing policy setup; publishing the policy lets migration finalize or backfill it. Do not present approve/reject controls for legacy fixtures.
- **Filter standings by event identity, not by parsing the free-text format description.** The second selector uses event IDs and labels each choice with the event name plus its format description. Its options are scoped by the primary board: all definitions for Overall, sport definitions for Combined sports, cultural definitions for Combined cultural, or definitions belonging to the selected sport. All formats remains the default. Selecting one event scopes finalized fixtures and the points/statistics rows to that event; changing the primary board clears a selected event that is no longer in scope.
- **Use submitted-final state as the standings boundary.** Both aggregate and single-format standings use only completed, final fixtures and their stored awarded points. A reopened result is excluded, and a zero-point award remains zero rather than being replaced by a fallback calculation.

## Risks / Trade-offs

- [A one-second poll can add requests when many spectators watch concurrently] → Poll only the active fixture, stop while hidden, avoid unchanged payloads with a revision/conditional response, and use backoff after failures.
- [A score projection may not match a complex sport action] → Mark projections as pending, replace them with the server's fixture on success, and roll back to the confirmed fixture on failure; never treat the projection as a final result.
- [Full competition polling may still be needed for non-match changes] → Keep that slower refresh for general dashboard data and use focused match polling only for live score views.
- [Free-text event format descriptions may be long or similar] → Display event name as the primary option label and the format description as secondary context; use the stable event ID for filtering.
- [A sport can contain multiple events with separate points policies] → Single-format ranking uses that event's own awarded points and sport-specific statistics, not a sum across sibling event formats.
- [Legacy pending submissions may not have published points policies] → Keep these visibly flagged in the audit screen, prevent silent zero-point finalization, and auto-finalize once the policy is published.

## Migration Plan

No database schema migration is required. Existing fixture `updatedAt` values provide the initial live revision; the focused snapshot endpoint may return its current fixture even when a conditional revision is absent. Existing board selection remains the primary selector, and the new format selector defaults to All formats. Legacy submitted results are finalized as above. The central-admin approval page is removed and replaced by the audit screen; published points, corrections, and standings remain visible.
