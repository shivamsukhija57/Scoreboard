# Division Wars Scoreboard

The first-year Division Wars workspace for five sections, event organizers, scheduling staff, and spectators.

## Start a local preview

1. Install Node.js 20.9 or later.
2. In this folder, run `npm install`.
3. Copy `.env.example` to `.env.local`.
4. Set `DEMO_MODE=true` in `.env.local` to preview the illustrative dashboard without signing in.
5. Run `npm run dev` and open `http://localhost:3000`.

The public scoreboard view is open without sign-in by default. Visitors can browse the scoreboard but cannot perform organizer actions or see participant rosters and student IDs. To require a college sign-in for every visitor, set `REQUIRE_SIGN_IN=true`. The seeded central administrator is `pgp26.shivams@spjimr.org`; that account can use the organizer tools after Google sign-in is configured. `DEMO_MODE=true` grants a central-admin preview identity only for local development and must not be enabled in production.

## Enable Google Workspace sign-in

Create an OAuth web client in the college Google Workspace and configure its callback URL as `http://localhost:3000/api/auth/callback/google` for local development. Set `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, and a strong random `AUTH_SECRET` in `.env.local`. Keep `NEXTAUTH_URL=http://localhost:3000` locally; set it to the public app URL after deployment. The authentication callback requires a verified Google account whose email and hosted domain are both `spjimr.org`.

Before deployment, register the production callback URL with the college OAuth administrator and set the matching environment variables in the deployment environment. Do not commit `.env.local` or OAuth credentials.

## Connect Supabase

1. Create a Supabase project and run `supabase/migrations/20261108090000_create_competition_state.sql` in its SQL Editor.
2. Copy the project URL and its server-side **Secret key** from **Project Settings → API Keys** into `SUPABASE_URL` and `SUPABASE_SECRET_KEY` in `.env.local`.
3. Keep the Secret key server-side only. Never add it to a `NEXT_PUBLIC_` variable or browser code.
4. Restart the local app. On its first database read, the app creates the state row from existing local `.data/competition.json` when available, otherwise from illustrative seed data.

When deploying, add the Supabase values as Vercel environment variables and redeploy. Production mode requires Supabase configuration; it does not fall back to writing a local file. This integration stores the existing competition model as one versioned JSONB row, with optimistic concurrency protection for simultaneous organizer updates. Sport-specific scoring and standings calculation still depend on organizer-confirmed formats, rules, result approval, and points policies.

## Load the 2026 rulebooks

The current rulebook catalog is dynamic competition data: sections, sports, event formats, roster limits, tournament structure, scoring rules, points, and participation caps are stored in the Supabase `competition_state.state` JSONB document. The TypeScript catalog provides defaults for a brand-new installation; it does not overwrite an existing database row.

For an existing database, open Supabase **SQL Editor**, create a query, paste the contents of `supabase/rulebook_update.sql`, and run it once. The script replaces sections, sports/cultural categories, and events with the rulebook catalog; preserves participants, entries, access assignments, audit history, and non-sample fixtures; and removes only fixtures whose IDs start with `sample-`. It returns the updated row version and catalog counts. Back up the project before applying a bulk catalog update if it already contains live event data.

Afterward, central admins can edit event rules, points, sport-wide participation conditions, and each section's sports cap from **Sports & events** in the app. The first-year caps are A/B/C: 3 sports; D/E: 4 sports. FIFA, Valorant, and Athletics are excluded from that cap. Cultural participation has no overall cap. Badminton and Table Tennis also apply their shared roster/overlap requirements during entry submission.
