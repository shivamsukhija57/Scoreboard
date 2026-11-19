## Context

The application already stores fixtures, sport/event policies, and result approval state. Approved match scorecards can drive sport statistics; published points policies determine section totals. Results may be reopened, so standings must derive from current confirmed fixtures rather than accumulate irreversible counters.

## Goals / Non-Goals

**Goals:** calculate standings from approved fixtures; separate sport and cultural categories; make tie-breaks transparent and event configurable.

**Non-Goals:** invent missing rulebook tie-breaks or award points for unapproved results.

## Decisions

- Build standings as derived views over confirmed fixtures and event definitions, so reopening/correction automatically recalculates every table.
- Add explicit sport-level tie-break configuration; seed cricket with NRR and football with goal difference then goals for. Other sports use configured score differential or sport-specific equivalent.
- Keep combined sports and cultural totals separate, with a per-event breakdown table and an overall summary combining both categories.
- Use deterministic ranking: total competition points first, then configured tie-break sequence, then shared rank for exact ties.
- Derive P/W/L/NR/draw and scored/conceded totals from approved fixtures only; cricket NRR uses completed innings run rates and excludes abandoned/no-result fixtures according to the competition rule.

## Risks / Trade-offs

- NRR needs complete innings ball/run data; missing or incomplete scorecards must be marked unavailable rather than treated as zero.
- Rulebooks may specify tournament-specific tie-break order; central admins must be able to configure it per event.
- Many fixtures can make client-side aggregation expensive; begin with server-side aggregation or memoized selectors and migrate to a materialized view only if needed.

## Migration Plan

Add optional tie-break configuration to event policies with safe defaults; existing approved results remain queryable. Reopening or editing a result automatically removes its derived contribution until reconfirmed.

## Open Questions

- Confirm tie-break order for sports other than cricket and football against the official rules before publishing their tables.
