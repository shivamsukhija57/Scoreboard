# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

delegated: Next.js with TypeScript and server-side route handling, chosen to support a multi-role application with college sign-in and server-enforced permissions.

## Users

- First-year college students, mostly ages 23–26 with some outliers, use the app as spectators to follow their five-section competition.
- Up to three administrators per section maintain their section's event entries and player lists.
- Event heads manage scoring for their assigned sports or events.
- Scheduling staff create and change fixtures and venues.
- The central admin team manages the entire competition and can override other roles' changes.

## Product Purpose

Division Wars is the shared home for a first-year college competition lasting roughly two to three weeks. It brings together live matches, event entries, schedules, results, and section standings so students can follow the competition and organizers can run it from one place.

## Positioning

The app combines a live spectator experience with the event-specific operations behind it: sports can have different participant counts, tournament formats, scoring controls, and points policies while contributing to one section-versus-section competition.

## Operating Context

- Five classroom sections within the first-year cohort compete against each other.
- Each section submits one entry per event. An entry can be an individual or a group, depending on the sport.
- Section administrators maintain entries until submission. Submitted entries are locked for them; central administrators may edit them.
- The central team will supply user email IDs and assignments, potentially as spreadsheets or plain text.
- Organizer access is assigned by section, event, or scheduling responsibility. A person may hold multiple assignments.
- Supported sports discussed so far: cricket, basketball, volleyball, football, tennis/lawn tennis, table tennis, foosball, and throwball.

## Capabilities and Constraints

- All access, including spectator access, must use a college-domain account. Google Workspace is the identified sign-in provider; the exact college email domain and OAuth configuration are not yet known.
- Player eligibility, maximum sports per player, event team size, tournament format, and points are configurable competition rules. The organizer will provide the concrete rules.
- Section administrators are capped at three per section.
- Central administrators have full access. Other organizer access is limited to assigned sections, events, or scheduling tasks.
- Referee or game-official permissions remain undecided and are not assumed for the initial application.
- Any sample names, results, schedules, and points used during development are synthetic and must be labeled as examples.

## Brand Commitments

The app should feel high-energy, bold, and current for a college-age audience. The dashboard and organizer experience must support real operational complexity rather than feeling like a minimal or generic scoreboard. Score and schedule information still need to remain immediately legible.

## Evidence on Hand

No real section names, student lists, organizer emails, venue list, tournament formats, scoring rules, or points tables have been supplied yet. Do not present synthetic example data as real competition information.

## Product Principles

- Show the live state of the competition as soon as users arrive.
- Let each sport use rules that fit its format while keeping standings unified across sections.
- Give each organizer only the tools and scope needed for their assignment, with central-admin oversight.
- Preserve a traceable history for submitted entries, score corrections, schedule changes, and administrative overrides.
