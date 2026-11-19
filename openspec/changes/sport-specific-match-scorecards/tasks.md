## 1. Scorecard domain and compatibility

- [x] 1.1 Define typed match-event envelope, sport scorecard state, correction links, and public-safe summaries
- [x] 1.2 Add backward-compatible scorecard defaults for existing fixtures and seed data
- [x] 1.3 Build sport-specific validators/reducers for event totals and derived team/player summaries
- [x] 1.4 Add server-side validation for event sport, match status, participant roster membership, and permissions

## 2. Sport scoring flows

- [x] 2.1 Implement cricket innings, delivery, legal-ball/over, runs, extras, wicket, dismissal, batter, and bowler scoring
- [x] 2.2 Implement football goals, optional scorer/assist attribution, cards, substitutions, and match timeline
- [x] 2.3 Implement basketball two/three/free-throw scoring, player point totals, fouls, and substitutions
- [x] 2.4 Implement volleyball and throwball set/rally scoring and configured set completion
- [x] 2.5 Implement tennis, lawn tennis, table tennis, badminton, squash, and pickleball point/game/set progression using event format configuration
- [x] 2.6 Implement foosball and other configured goal-based sports with optional scorer attribution
- [x] 2.7 Keep athletics on the existing place/result workflow and verify it has no match scorecard controls

## 3. Scorer and spectator interfaces

- [x] 3.1 Add responsive event-head scorecard console with sport-specific quick actions and optional player selection
- [x] 3.2 Add detailed event forms for extras, dismissals, cards, substitutions, fouls, and configured sport actions
- [x] 3.3 Add correction/reversal flow with reason capture and visible scorer feedback
- [x] 3.4 Add spectator scorecard summaries and chronological event timeline without student IDs
- [x] 3.5 Show roster-derived player figures and team-only events distinctly

## 4. Lifecycle, integrity, and rollout

- [x] 4.1 Preserve scorecard and event history across submit, confirmation, and central-admin correction
- [x] 4.2 Integrate scorecard writes with existing versioned Supabase concurrency and audit mechanisms
- [x] 4.3 Add event configuration for sport-specific format limits and enabled scoring actions
- [x] 4.4 Document rulebook settings required before enabling each event's scoring console
- [x] 4.5 Verify legacy fixture reads, authorization rejection, correction history, derived totals, and spectator privacy
