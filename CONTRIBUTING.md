# Contributing

Thanks for helping improve Division Wars Scoreboard.

## Before changing the app

- Read `README.md`, `HANDOFF.md`, and the relevant OpenSpec artifacts in `openspec/`.
- For changes to product behavior, update or create the corresponding OpenSpec proposal/spec/task artifacts.
- Keep credentials, student data, and private event information out of commits and issue reports.

## Local setup

1. Install Node.js 20.9 or later.
2. Run `npm install`.
3. Copy `.env.example` to `.env.local` and fill in the values needed for your task.
4. Run `npm run dev` to start the app.

## Before opening a pull request

- Run `npm run build` and resolve build failures.
- Describe the user-visible change and any Supabase or environment setup it requires.
- Include screenshots for interface changes when practical.
- Do not include `.env.local`, credentials, database exports, or generated directories.
