## Context

See `proposal.md` for the product motivation and `specs/` for observable behavior. The application folder is `scoreboard/`. The user selected Next.js with TypeScript, Google Workspace sign-in restricted to `spjimr.org`, and Supabase Postgres for shared persistence. Competition data and organizer assignments will be supplied later; tournament formats, point values, and player caps are not yet specified.

## Goals / Non-Goals

**Goals:**
- Keep competition rules configurable so different sports and event formats can use different rosters, scorekeeping, and points.
- Keep permissions scoped to a section, event, or schedule function, with central-admin override and an audit trail for important changes.
- Keep live results, fixtures, and standings consistent across spectator and organizer workspaces.
- Give spectators a high-energy, broadcast-inspired view, while giving organizers role-focused tools suited to dense, time-sensitive work.

**Non-Goals:**
- Deploy the application before its Supabase project credentials and Google OAuth credentials are configured.
- Publish fixed scoring rules or tournament formats before the organizer-provided rules are available.
- Define referee/official permissions before the event workflow is agreed.

## Decisions

### Model competition configuration separately from match execution

Represent the competition, five sections, sports, events, entry rules, tournament format, and points policy as configuration. Fixtures and matches reference that configuration and the section entries. Each event has its own team-size, eligibility, participant-cap, scoring, and points settings. This keeps the same section-versus-section structure while allowing an event entry to be an individual or a group.

Alternative considered: hard-code rules by sport. This would make initial screens quicker to build but would require code changes for event-specific formats and exceptions; it does not fit the organizer-supplied rules model.

### Use Next.js and TypeScript with Google Workspace identity

Build the web application in `scoreboard/` using Next.js and TypeScript. Authenticate through Google Workspace and require a verified `spjimr.org` hosted domain and matching college email. Keep OAuth client credentials in environment variables; deployment is not ready until the college OAuth client is configured.

Alternative considered: postpone the stack and identity decision. The user delegated the stack choice and confirmed the college identity provider/domain, so the implementation can establish a working application shell now.

### Persist shared competition state in Supabase Postgres

Use a server-only Supabase service key from Next.js API routes. Keep the existing typed competition aggregate in one JSONB state row for the first migration, with a Postgres version column and compare-and-swap RPC so concurrent organizer updates retry instead of overwriting each other. Enable row-level security and grant the state table and RPC only to the service role. Keep the JSON file store only for local development when Supabase is not configured; production requires Supabase credentials.

Alternative considered: keep local JSON persistence. It does not persist reliably across Vercel function instances and cannot coordinate edits from multiple organizers. Fully normalized tables would require a larger domain/repository rewrite; the versioned state row gives the current application a durable, atomic persistence boundary while preserving its data model.

### Keep live scoring sport-specific behind a shared match lifecycle

All matches share identity, event, entries, venue, schedule, status, and result-confirmation fields. Each sport supplies its own score state and scoring actions. The spectator experience reads the shared match summary and the sport-specific live score. This supports the initial sport list without pretending that runs, goals, sets, and points are interchangeable.

Alternative considered: one generic score editor for all sports. It is simpler but cannot accurately represent innings, periods, sets, or other sport-specific state.

### Enforce scoped access at the application boundary

Use college-domain sign-in, then resolve a user's role assignments and scopes for each action. Section administrators are limited to their assigned section, event heads to assigned events, and schedulers to schedule functions. One account may hold several assignments; central administration grants global permissions. Validate access on every data-changing action, not only by hiding controls in the interface.

Alternative considered: separate accounts or separate applications per role. That duplicates identity and makes multi-role staff and central overrides harder to manage.

### Treat high-impact changes as auditable operations

Keep an audit record for central-admin overrides, submitted-entry edits, score corrections, points-rule changes, assignment imports, and schedule changes. Preserve the prior and new values so organizers can explain standings and schedule updates.

Alternative considered: overwrite the current value only. This is less complex initially but makes disputes and accidental changes difficult to investigate.

### Derive standings from confirmed results and published rules

Calculate standings from confirmed event outcomes and their applicable points policies. Keep pending results out of final totals. When a correction is authorized, record it and recalculate affected totals. A published policy should be associated with the results it governs so later configuration edits do not silently rewrite completed outcomes.

Alternative considered: manually edit a single total for each section. That is difficult to reconcile with individual results and event-specific formats.

### Separate spectator and organizer workspaces within one application

Use a shared application shell and competition data, with different landing views and navigation by role. Spectators prioritize live matches, schedule, results, and section standings. Organizers prioritize their assigned queues and actions; central admins receive a comprehensive control room. Keep the visual identity bold and energetic while maintaining legible scores, clear status, responsive layouts, and reduced-motion support.

Alternative considered: one generic dashboard for all users. It would either hide organizer controls too deeply or overload spectators with administrative detail.

### Stage imports before applying assignments

Parse spreadsheets and plain-text assignment lists into a preview that displays email, role, scope, and row-level validation results. Apply only after a central administrator reviews the preview. This avoids silently granting access from malformed or ambiguous input.

Alternative considered: apply imports immediately. This is faster but increases the chance of mis-scoped access.

### Treat schedule conflicts as acknowledged warnings

Show venue and section-entry overlaps before a fixture is published. Allow an assigned scheduler to proceed after explicitly acknowledging the conflict, and record that acknowledgement for review. Schedule changes are within scheduler scope; a separate central-admin override is not required for this action.

Alternative considered: block every conflicting fixture. This avoids accidental overlaps but prevents organizers from recording intentional exceptions such as shared venues or parallel event arrangements.

## Risks / Trade-offs

- [Supabase project credentials are not configured yet] → Require server-only credentials in production and document the migration/bootstrap steps before deployment.
- [Sport rules and points policies may vary by tournament] → Make formats and policies explicit event configuration and validate each with organizers before enabling scoring.
- [Live-score corrections can alter standings] → Keep result and points changes auditable and recalculate standings from confirmed results.
- [A high-energy interface can reduce score readability] → Prioritize score, match state, and venue hierarchy; use motion and effects sparingly and respect reduced-motion preferences.
- [Schedule conflicts may be acknowledged too casually] → Require an explicit acknowledgement when publishing despite a conflict and retain it for review.

## Migration Plan

On the first Supabase read, initialize the singleton state row from the local JSON file when present, or from illustrative seed data otherwise. Later organizer updates are stored durably in Supabase. Build the official competition configuration and user assignments from organizer-provided source lists, preview and validate them, then publish the competition. If initial configuration is incorrect, central administrators can correct it before event launch; retain audit history for changes made after publication.

## Open Questions

- Which tournament formats, scoring details, points policies, and player participation caps apply to each event?
- Should referees or game officials submit provisional scores, confirm final results, or have another permission set?
