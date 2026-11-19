## Context

See `proposal.md` for motivation and `specs/` for observable behavior. The current `Fixture` stores only `scoreA`, `scoreB`, `periodLabel`, and `clockLabel`; the PATCH API accepts generic increments/decrements. Competition state is a versioned JSONB aggregate in Supabase and scoring writes already pass through event authorization and audit recording.

## Goals / Non-Goals

**Goals:**
- Represent a match scorecard as sport-specific state plus an ordered, attributable event log.
- Keep team totals and scorecard summaries consistent when actions are added, edited, or reversed.
- Make event entry fast on a phone and provide a spectator view that emphasizes score then details.
- Support optional player attribution where useful and roster-validated attribution when selected.
- Allow event-specific formats and settings to control rules such as innings limits, set format, and period duration.

**Non-Goals:**
- Athletics live match controls; athletics retains place/result entry.
- Automatic disciplinary consequences such as suspensions or tournament bans.
- Assuming professional rule sets or inventing competition-specific formats where organizer rules are not configured.
- Public display of student IDs or private roster information.

## Decisions

### Store normalized match events inside the existing fixture aggregate

Add an optional sport scorecard/state object and ordered event list to a fixture, with a compatibility default for existing fixtures. Each event has a stable ID, event type, side, optional participant ID, event-specific payload, period/innings reference, actor, time, and correction/reversal relationship. Keep the aggregate in the current versioned Supabase row rather than introducing a new service or dependency.

Alternative: persist only mutable totals. Rejected because player summaries, ball-by-ball/period timelines, and corrections would be impossible to reconstruct reliably. A separate normalized table can be considered if aggregate size or concurrent-write contention becomes material.

### Use sport adapters over a common event envelope

The common envelope handles identity, authorization, actor/time, ordering, correction, and public rendering metadata. Sport-specific validators/reducers handle cricket innings and deliveries; football goals/cards/substitutions; basketball scoring/fouls/substitutions; set-and-game sports; volleyball/throwball rallies and sets; and goal-based team events such as foosball. Event configuration supplies format limits and rule variants. Reject impossible transitions instead of silently applying them.

Alternative: one generic point counter. Rejected because it cannot model wickets, extras, cards, sets, or player points accurately.

### Keep player attribution optional, roster-linked when supplied

Scorers may enter team-only events when attribution is unknown or irrelevant. If a participant is selected, validate that the player belongs to one of the participating sections' submitted entries for the configured event. Individual-entry matches use their registered participants as the competitors. Never use free-text player names for official stats; provide an explicit unattributed option.

Alternative: require a player on every action. Rejected because event-day scorers may not know the responsible player and team scoring should not be blocked.

### Use sport-specific quick controls and a reviewable event timeline

The scorer workspace shows large common actions for the current sport, optional player selectors, undo/correction, and the latest actions. More detailed forms capture dismissal/card/substitution/foul/extra context. The spectator card leads with section names, score, innings/period/set/clock, then concise player figures and a chronological feed. Responsive layout should keep primary controls usable on small screens; detailed stats can expand below the main score.

Alternative: a long generic form for all possible event types. Rejected because irrelevant controls slow down live operation and increase errors.

### Recalculate derived summaries and preserve corrections

Treat accepted events as the authoritative sequence. Reducers derive team/player summaries. A correction appends a reversal or replacement event with actor, timestamp, and reason; it does not delete the original. Submitting/confirming a result freezes ordinary event entry and routes later changes through existing central-admin correction behavior.

Alternative: mutate summary values and overwrite mistaken events. Rejected because it loses the explanation for score changes.

## Risks / Trade-offs

- [Many sport formats are not yet specified] → Make settings and event types configurable; block unsupported actions and leave rule limits unset until confirmed.
- [A JSONB event history may grow] → Keep concise payloads, and assess normalization/archival if real match volume requires it.
- [Two scorers may submit concurrently] → Use existing compare-and-swap persistence; surface retry/conflict feedback and avoid optimistic display as authoritative until saved.
- [Player attribution can expose personal information] → Public views expose names only where appropriate and never expose student IDs; retain private roster access controls.
- [Rules such as basketball fouls or football cards can be mistaken for disciplinary policy] → Record match statistics only; do not enact competition sanctions without explicit rules configuration.

## Migration Plan

1. Deploy schema-tolerant code that reads old fixtures with an empty scorecard and retains legacy totals for display.
2. Initialize scorecard metadata lazily or in a reversible data migration, without changing existing scores or statuses.
3. Enable sport-specific scoring per configured event after the event head roster and match rules are available.
4. Monitor score updates and corrections; if rollback is needed, disable new scoring actions while retaining stored events and displaying the last derived totals.

## Open Questions

- Exact cricket overs per innings, wicket limit, extra/dismissal options, and tie resolution must come from the tournament rules before cricket scoring is enabled.
- Which basketball stat actions beyond points/fouls/substitutions should be shown (for example rebounds, assists, steals, blocks)?
- Should football assist attribution and second-yellow-to-red derivation be enabled, or should cards be recorded as explicit official actions only?
- Which configured event formats require player attribution rather than permitting team-only event entry?
