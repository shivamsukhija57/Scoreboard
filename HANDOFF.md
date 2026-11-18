# Division Wars Scoreboard — Development Handoff

This folder contains the latest scoreboard application source and the OpenSpec project artifacts.

## Start developing

1. Install Node.js 20.9 or later.
2. Open a terminal in this folder and run `npm install`.
3. Copy `.env.example` to `.env.local` and configure the required values.
4. For a UI-only local preview, set `DEMO_MODE=true` and run `npm run dev`.
5. For real data, configure a Supabase project and apply `supabase/migrations/20261108090000_create_competition_state.sql`; then set `SUPABASE_URL` and `SUPABASE_SECRET_KEY`.
6. Visit `http://localhost:3000`.

Google OAuth local callback URL: `http://localhost:3000/api/auth/callback/google`. Use credentials from your own Google Cloud/Workspace OAuth configuration. Never commit `.env.local` or server-side keys.

## OpenSpec

OpenSpec artifacts are in `openspec/`, including the `division-wars-scoreboard` change, its proposal, design, tasks, delta specs, and current main specs. Continue by opening this folder as the project root in the target system and using its OpenSpec workflow.

## Current application notes

- Five first-year sections: A–E.
- Spectator scoreboard is public; organizer actions require sign-in and role access.
- Competition catalog and state are persisted in Supabase when configured.
- `supabase/rulebook_update.sql` updates the dynamic catalog from the 2026 rulebooks.
- Vercel is the current production host; deployment settings and credentials are deliberately not included in this handoff.

See `README.md` for additional details.
