## 1. Project foundation

- [x] 1.1 Confirm the college identity provider and implementation stack, then establish the application shell in `scoreboard/`
- [x] 1.2 Define the shared competition data model for sections, sports, events, entries, participants, fixtures, matches, and points
- [x] 1.3 Create the shared navigation and role-aware application layout for spectator and organizer workspaces
- [x] 1.4 Integrate Supabase Postgres for durable competition state, with a development-only local fallback

## 2. Identity and access

- [x] 2.1 Add college-domain sign-in and deny access for accounts outside the configured domain
- [x] 2.2 Add scoped role assignments for spectators, section administrators, event heads, schedulers, and central administrators
- [x] 2.3 Add central-admin controls to review and update user assignments
- [x] 2.4 Build spreadsheet and plain-text assignment import with a validation preview before applying changes
- [x] 2.5 Enforce permissions on server-side data changes and record high-impact administrative actions

## 3. Competition configuration and section entries

- [ ] 3.1 Add central-admin setup for five first-year sections, sports, events, entry sizes, eligibility rules, formats, and point policies
- [x] 3.2 Add section-admin roster workspaces with a maximum of three administrators assigned per section
- [x] 3.3 Enforce one entry per section per event, event-specific team size, participant eligibility, and participation caps
- [x] 3.4 Lock submitted entries for section administrators and allow audited central-admin corrections
- [x] 3.5 Add review and preview for event point policies before publication

## 4. Scheduling

- [x] 4.1 Add scheduler tools to create and edit fixtures with event, entries, date, time, venue, and status
- [x] 4.2 Detect venue and section-entry overlaps and require acknowledgement before publishing a conflicting fixture
- [x] 4.3 Record schedule changes and show updated fixture details to spectators
- [x] 4.4 Add schedule views and filters for date, sport, section, venue, and match status

## 5. Live scoring and standings

- [x] 5.1 Define shared match lifecycle, result submission, central-admin approval/rejection/reopen, and correction behavior
- [ ] 5.2 Implement sport-specific live scoring for cricket
- [ ] 5.3 Implement sport-specific live scoring for basketball and football
- [ ] 5.4 Implement sport-specific live scoring for volleyball and throwball
- [ ] 5.5 Implement sport-specific live scoring for tennis/lawn tennis and table tennis
- [ ] 5.6 Implement sport-specific live scoring for foosball
- [ ] 5.7 Apply stage-aware published points policies to both sections for confirmed outcomes and recalculate standings after authorized corrections
- [ ] 5.8 Confirm event formats, sport rules, points, and participation caps with the organizer before configuring the live competition

## 6. Spectator experience

- [ ] 6.1 Create a high-energy competition overview for live matches, upcoming fixtures, recent results, and section standings
- [x] 6.2 Add spectator filters for sport, section, date, and venue
- [ ] 6.3 Keep live match status, confirmed results, schedule changes, and standings current across spectator views
- [x] 6.4 Refine responsive layouts, score legibility, motion, and accessibility for event-day use
