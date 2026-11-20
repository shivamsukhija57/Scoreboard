import type { EventDefinition, PointsFormat, Section, Sport } from "./domain";
// Explicit extension so the Node test runner (type stripping) can load it too.
import { outcomePointsFor } from "./points-rules.ts";

/** The rulebook edition these definitions follow (Sprint × Ojas '27, Division Wars 2026 sports and cultural rulebooks). */
export const RULEBOOK_EDITION = "2026";

export const rulebookSections: Section[] = [
  // color: the division's fill, always carrying white text. accent: a dark tint for backgrounds.
  // line: the same hue lifted for thin marks (chart lines, dots, bars) on the dark UI, where navy, burgundy and black would vanish.
  { id: "s1", name: "Ares", shortName: "Ares", code: "A", color: "#2D52D6", accent: "#121C45", line: "#7391FF", maxSportsPerPlayer: 3 },
  { id: "s2", name: "Bloodhounds", shortName: "Bloodhounds", code: "B", color: "#178740", accent: "#0C2E19", line: "#3FD272", maxSportsPerPlayer: 3 },
  { id: "s3", name: "Cyappa", shortName: "Cyappa", code: "C", color: "#D92B28", accent: "#3D1312", line: "#FF6461", maxSportsPerPlayer: 3 },
  { id: "s4", name: "Dracarys", shortName: "Dracarys", code: "D", color: "#A8234F", accent: "#35101F", line: "#E8588A", maxSportsPerPlayer: 4 },
  { id: "s5", name: "Eagles", shortName: "Eagles", code: "E", color: "#17191F", accent: "#0B0C10", line: "#C9CDD6", maxSportsPerPlayer: 4 },
];

/** Bump when the divisions' names or colours change; stored data is brought in line on the next read. */
export const DIVISION_IDENTITY = "2026-11-divisions-2";

/** League-table tie-break order from each sport's section of the 2026 sports rulebook. */
const tieBreakers: Record<string, string[]> = {
  cricket: ["matches-won", "net-run-rate", "runs-scored", "head-to-head", "coin-toss"],
  football: ["matches-won", "goal-difference", "goals-scored", "head-to-head", "penalty-shootout"],
  volleyball: ["matches-won", "point-difference", "points-scored", "head-to-head", "one-set-decider"],
  basketball: ["matches-won", "point-difference", "points-scored", "head-to-head", "fewer-fouls", "coin-toss"],
  throwball: ["matches-won", "point-difference", "points-scored", "head-to-head", "coin-toss"],
  badminton: ["event-points", "points-scored-all-games", "committee"],
  "table-tennis": ["event-points", "points-scored-all-games", "committee"],
  "lawn-tennis": ["event-points", "points-scored-all-games", "committee"],
  pickleball: ["event-points", "points-scored-all-games", "committee"],
  squash: ["event-points", "points-scored-all-games", "committee"],
  pool: ["matches-won", "frame-difference", "head-to-head", "one-frame-playoff"],
  carrom: ["matches-won", "score-difference", "queens-covered", "head-to-head", "sudden-death-board"],
  foosball: ["matches-won", "goal-difference", "goals-scored", "head-to-head", "golden-goal"],
  chess: ["matches-won", "board-point-difference", "head-to-head", "armageddon"],
  fifa: ["matches-won", "goal-difference", "goals-scored", "head-to-head", "coin-toss"],
  valorant: ["matches-won", "round-difference", "kda-difference", "head-to-head", "one-map-decider"],
};

const sport = (id: string, name: string, category: Sport["category"] = "sport", cap = true, formats: number | null = 2, participationNotes: string[] = []): Sport => ({
  id, name, category, countsTowardOverallSportsCap: cap, maxFormatsPerPlayer: formats, participationNotes,
  ...(tieBreakers[id] ? { standingsTieBreakers: tieBreakers[id] } : {}),
});

export const rulebookSports: Sport[] = [
  sport("cricket", "Cricket", "sport", true, 2, ["Men's and women's tournaments are separate.", "Men: 11 on field; squad up to 15. Women: 7 on field; squad up to 9."]),
  sport("football", "Football", "sport", true, 2, ["Men's event only. Seven-a-side; squad up to 10 (7 + 3 substitutes).", "Played in the ring-group format of the scoring section: two teams per division."]),
  sport("volleyball", "Volleyball", "sport", true, 2, ["Separate men's and women's events. Six on court; squad of 8–10."]),
  sport("basketball", "Basketball", "sport", true, 2, ["Men: 5v5, squad up to 8. Women: 3v3, squad up to 6."]),
  sport("throwball", "Throwball", "sport", true, 2, ["Women's event. Five on court; squad up to 7."]),
  sport("badminton", "Badminton", "sport", true, 2, ["A player may enter at most two formats. Division squad: 2–4 men and 2–4 women, plus 2 male and 2 female substitutes."]),
  sport("table-tennis", "Table Tennis", "sport", true, 2, ["At most two players may play in two formats each. Across each gender's three formats, at least 4 different men and 4 different women must play.", "Division squad: at least 4 men and 4 women, plus one substitute of each gender."]),
  sport("lawn-tennis", "Lawn Tennis", "sport", true, 2, ["A doubles reserve may replace a player before a match, but not during it."]),
  sport("pickleball", "Pickleball", "sport", true, 2, ["Each division plays with 3 men and 3 women, plus up to one reserve of each gender, across men's, women's and mixed doubles."]),
  sport("squash", "Squash", "sport", true, 2, ["Each division enters 2 men (one per group) and 1 woman, plus one reserve for each."]),
  sport("pool", "Pool", "sport", true, 2, ["Eight-ball mixed doubles. Two teams per division; each team is one man and one woman. One reserve man and one reserve woman per division. A player represents only one team."]),
  sport("carrom", "Carrom", "sport", true, 2, ["Mixed doubles, two teams per division; a player represents only one team. One male and one female substitute per division."]),
  sport("foosball", "Foosball", "sport", true, 2, ["Mixed doubles, two teams per division; each team is one man and one woman. Two substitutes per division (one of each gender)."]),
  sport("chess", "Chess", "sport", true, 2, ["Two teams per division. Each team has two board players and one substitute."]),
  sport("fifa", "Esports: FIFA", "sport", false, null, ["Open to any gender. A division squad of three players plus one substitute is shared by Singles and Doubles; a player may enter both. FIFA does not count toward the 3-sport limit."]),
  sport("valorant", "Esports: Valorant", "sport", false, 2, ["One open-gender team of five plus one optional substitute. Valorant does not count toward the 3-sport limit."]),
  sport("athletics", "Athletics", "sport", false, 2, ["Eight separate men's and women's races. Athletics does not count toward the 3-sport limit. Subject to venue availability."]),
  sport("music", "Music", "cultural", false, null),
  sport("dance", "Dance", "cultural", false, null),
  sport("stage-play", "Group Skit", "cultural", false, null),
  sport("short-film", "Short Film", "cultural", false, null),
  sport("quiz", "Quiz", "cultural", false, null),
  sport("treasure-hunt", "Treasure Hunt", "cultural", false, null),
  sport("roast-comedy", "Roast Comedy", "cultural", false, null),
  sport("poetry", "Poetry", "cultural", false, null),
  sport("art", "Art", "cultural", false, null),
];

type EventInput = {
  id: string; sportId: string; name: string; format: string; gender: EventDefinition["genderEligibility"];
  min: number; max: number | null; entries?: number; substitutes?: number;
  /** League, chit-ring or ring-group with its win value X, or placings with points by place. */
  points: { format: Exclude<PointsFormat, "placings">; x: number; splitDraw?: boolean } | { format: "placings"; places: number[] };
  scoring: string; roster?: string[]; extraRules?: string[]; walkover?: number;
  scoringConfig?: EventDefinition["scoringConfig"];
};

const tournamentText: Record<PointsFormat, string> = {
  league: "League: every division plays every other once (10 matches), then a 2nd v 3rd semifinal and a final against the table topper. 12 matches.",
  "chit-ring": "Chit-ring: divisions are placed in a ring by chit draw and each plays its two neighbours (5 matches), then a 2nd v 3rd semifinal and a final against the table topper. 7 matches.",
  "ring-group": "Ring-group: each division enters two teams, one per group; each group is a chit-drawn ring (10 matches across both groups). The top two of each group play cross semifinals, and two teams from the same division must meet in a semifinal so the final is always between two divisions. 13 matches.",
  placings: "Single contest; every division is ranked 1st to 5th.",
};
const matchCounts: Record<PointsFormat, number | null> = { league: 12, "chit-ring": 7, "ring-group": 13, placings: null };

function pointsRules(points: EventInput["points"]): string[] {
  if (points.format === "placings") return [`Points by place: ${points.places.join(" / ")}.`, "A division that doesn't take part is disqualified and gets no 5th-place points."];
  const o = outcomePointsFor(points.format, points.x, { splitDraw: points.splitDraw });
  return [
    `${points.format === "ring-group" ? "Group" : "League"} match win: ${points.x}.`,
    ...(points.format === "ring-group" ? ["No bonus for finishing 1st in a group."] : [`Table topper bonus: ${o.leagueTopper} (goes straight to the final).`]),
    `Semifinal win ${o.semifinalWin}, semifinal loss ${o.semifinalLoss}, final win ${o.finalWin}; the losing finalist adds nothing.`,
    ...(points.splitDraw ? [`League match level 1–1: each side gets ${o.draw} (half the points).`] : []),
  ];
}

const e = (input: EventInput): EventDefinition => {
  const format = input.points.format;
  return {
    id: input.id, sportId: input.sportId, name: input.name, format: input.format,
    minPlayers: input.min, maxPlayers: input.max, maxEventsPerPlayer: null,
    entriesPerDivision: input.entries ?? (format === "ring-group" ? 2 : 1), substitutePlayers: input.substitutes ?? 0,
    genderEligibility: input.gender, tournamentFormat: tournamentText[format],
    matchCount: matchCounts[format],
    rosterRules: input.roster ?? [], scoringRules: [...pointsRules(input.points), ...(input.extraRules ?? [])], scoringType: input.scoring,
    scoringConfig: { ...(input.scoringConfig ?? parseScoringConfig(input)), ...(input.walkover !== undefined ? { walkoverScore: input.walkover } : {}) },
    pointsPolicy: {
      id: `points-${input.id}`, name: `${input.name} rulebook points`,
      places: input.points.format === "placings" ? [...input.points.places] : [],
      published: true, version: 1, format,
      ...(input.points.format !== "placings" ? { unit: input.points.x, pointsByOutcome: outcomePointsFor(input.points.format, input.points.x, { splitDraw: input.points.splitDraw }) } : {}),
    }, headEmails: [],
  };
};

function parseScoringConfig(input: EventInput): EventDefinition["scoringConfig"] {
  const rules = [...(input.roster ?? []), input.format].join(" ");
  const overs = rules.match(/(\d+)\s*overs?/i);
  const wickets = rules.match(/(\d+)\s*wickets?/i);
  const points = rules.match(/(?:to|up to)\s*(\d+)\b/i);
  const sets = rules.match(/best of\s*(\d+)/i);
  const periods = rules.match(/(\d+)\s*[×x]\s*(\d+)[- ]minute/i);
  return {
    ...(overs ? { oversPerInnings: Number(overs[1]) } : {}),
    ...(wickets ? { wicketsPerInnings: Number(wickets[1]) } : {}),
    ...(points ? { pointsToWin: Number(points[1]), winBy: 2 } : {}),
    ...(sets ? { setsToWin: Math.ceil(Number(sets[1]) / 2) } : {}),
    ...(periods ? { periods: Number(periods[1]), periodMinutes: Number(periods[2]) } : {}),
  };
}

const league = (x: number) => ({ format: "league" as const, x });
const ring = (x: number) => ({ format: "chit-ring" as const, x });
const group = (x: number, splitDraw = false) => ({ format: "ring-group" as const, x, splitDraw });
const BIG = { format: "placings" as const, places: [160, 120, 80, 40, 20] };
const SMALL = { format: "placings" as const, places: [100, 80, 50, 20, 10] };
const SPRINT = { format: "placings" as const, places: [15, 10, 5, 0, 0] };
const RELAY = { format: "placings" as const, places: [30, 15, 5, 0, 0] };
const walkoverNote = (score: string) => `Walkover: a side not ready 10 minutes after the scheduled start loses ${score}.`;

export const rulebookEvents: EventDefinition[] = [
  e({ id: "cricket-open", sportId: "cricket", name: "Men's Cricket", format: "11-a-side ground cricket at Bhavan's Ground; 8 overs per side; squad up to 15 including substitutes.", gender: "men", min: 11, max: 15, substitutes: 4, points: league(14), scoring: "runs-wickets", roster: ["11 players on field; up to 15 in squad.", "8 overs per side; innings ends at 10 wickets."], extraRules: ["Tie: Super Over, then a bowl-out.", "Walkover: recorded as a win for the opponents and left out of net run rate."], walkover: 0 }),
  e({ id: "cricket-women", sportId: "cricket", name: "Women's Cricket", format: "7-a-side box cricket on the Rec Centre terrace; 8 overs per side; squad up to 9.", gender: "women", min: 7, max: 9, substitutes: 2, points: league(14), scoring: "runs-wickets", roster: ["7 players on field; up to 9 in squad.", "8 overs per side; innings ends at 6 wickets."], extraRules: ["Tie: Super Over, then a bowl-out.", "Walkover: recorded as a win for the opponents and left out of net run rate."], walkover: 0 }),
  e({ id: "football-open", sportId: "football", name: "Men's Football", format: "7-a-side on the external turf; 2 × 12-minute halves; squad up to 10.", gender: "men", min: 7, max: 10, substitutes: 3, points: group(14), scoring: "goals", roster: ["7 players including goalkeeper; 7 required to start; at least 5 to continue.", "Rolling unlimited substitutions."], extraRules: ["Level at full time: 3 penalties each, then sudden death; no extra time.", walkoverNote("3–0")], walkover: 3 }),
  e({ id: "volleyball-open", sportId: "volleyball", name: "Men's Volleyball", format: "Six on court; squad 8–10. League and semifinal: one set to 25; final best of three to 15.", gender: "men", min: 8, max: 10, substitutes: 4, points: league(14), scoring: "points-sets", roster: ["6 players on court; squad of 8–10.", "All six players must serve."], extraRules: [walkoverNote("25–0 (15–0, 15–0 in the final)")], walkover: 25 }),
  e({ id: "volleyball-women", sportId: "volleyball", name: "Women's Volleyball", format: "Six on court; squad 8–10. League and semifinal: one set to 15; final best of three to 11.", gender: "women", min: 8, max: 10, substitutes: 4, points: league(14), scoring: "points-sets", roster: ["6 players on court; squad of 8–10.", "At least three players must serve."], extraRules: [walkoverNote("15–0 (11–0, 11–0 in the final)")], walkover: 15 }),
  e({ id: "basketball-open", sportId: "basketball", name: "Men's Basketball", format: "5v5 full court at Wadia court; 2 × 10-minute league halves; knockouts 4 × 8 minutes; squad up to 8.", gender: "men", min: 5, max: 8, substitutes: 3, points: league(14), scoring: "basketball-points", roster: ["5 players on court; squad up to 8."], extraRules: [walkoverNote("20–0")], walkover: 20 }),
  e({ id: "basketball-women", sportId: "basketball", name: "Women's Basketball", format: "3v3 half court at Wadia court; 14-minute league games; knockouts 4 × 6 minutes; squad up to 6.", gender: "women", min: 3, max: 6, substitutes: 3, points: league(14), scoring: "basketball-points", roster: ["3 players on court; squad up to 6."], extraRules: [walkoverNote("20–0")], walkover: 20 }),
  e({ id: "throwball-open", sportId: "throwball", name: "Women's Throwball", format: "Five on court at the SPCE court; squad up to 7. League: one set to 15; knockouts best of three.", gender: "women", min: 5, max: 7, substitutes: 2, points: league(14), scoring: "points-sets", roster: ["5 players on court; squad up to 7.", "Substitutions during service breaks."], extraRules: [walkoverNote("15–0 (15–0, 15–0 in knockouts)")], walkover: 15 }),
  e({ id: "badminton-mens-singles", sportId: "badminton", name: "Men's Singles", format: "One man per division. Ring: one game to 15; knockouts best of three to 21.", gender: "men", min: 1, max: 1, points: ring(8), scoring: "rally-points", extraRules: [walkoverNote("15–0 (21–0, 21–0 in knockouts)")], walkover: 15 }),
  e({ id: "badminton-womens-singles", sportId: "badminton", name: "Women's Singles", format: "One woman per division. Ring: one game to 15; knockouts best of three to 21.", gender: "women", min: 1, max: 1, points: ring(8), scoring: "rally-points", extraRules: [walkoverNote("15–0 (21–0, 21–0 in knockouts)")], walkover: 15 }),
  e({ id: "badminton-mens-doubles", sportId: "badminton", name: "Men's Doubles", format: "Two men per division. Ring: one game to 15; knockouts best of three to 21.", gender: "men", min: 2, max: 2, points: ring(8), scoring: "rally-points", extraRules: [walkoverNote("15–0 (21–0, 21–0 in knockouts)")], walkover: 15 }),
  e({ id: "badminton-womens-doubles", sportId: "badminton", name: "Women's Doubles", format: "Two women per division. Ring: one game to 15; knockouts best of three to 21.", gender: "women", min: 2, max: 2, points: ring(8), scoring: "rally-points", extraRules: [walkoverNote("15–0 (21–0, 21–0 in knockouts)")], walkover: 15 }),
  e({ id: "badminton-open", sportId: "badminton", name: "Mixed Doubles", format: "One man and one woman per division. Ring: one game to 15; knockouts best of three to 21.", gender: "mixed", min: 2, max: 2, points: ring(8), scoring: "rally-points", extraRules: [walkoverNote("15–0 (21–0, 21–0 in knockouts)")], walkover: 15 }),
  e({ id: "table-tennis-open", sportId: "table-tennis", name: "Men's Singles", format: "Three men per division (A/B/C). Each meeting is a team tie of up to five best-of-three matches; first to three match wins takes the tie.", gender: "men", min: 3, max: 3, points: ring(8), scoring: "games-points", roster: ["Three singles players; line-up order is fixed before the first match.", "Games to 11; at 10–10 a side must lead by 2."], extraRules: [walkoverNote("11–0")], walkover: 11 }),
  e({ id: "table-tennis-womens-singles", sportId: "table-tennis", name: "Women's Singles", format: "Three women per division (A/B/C). Each meeting is a team tie of up to five best-of-three matches; first to three match wins takes the tie.", gender: "women", min: 3, max: 3, points: ring(8), scoring: "games-points", roster: ["Three singles players; line-up order is fixed before the first match.", "Games to 11; at 10–10 a side must lead by 2."], extraRules: [walkoverNote("11–0")], walkover: 11 }),
  e({ id: "table-tennis-mens-doubles", sportId: "table-tennis", name: "Men's Doubles", format: "Two men per division; each meeting is one best-of-three match of 11-point games.", gender: "men", min: 2, max: 2, points: ring(8), scoring: "games-points", extraRules: [walkoverNote("11–0")], walkover: 11 }),
  e({ id: "table-tennis-womens-doubles", sportId: "table-tennis", name: "Women's Doubles", format: "Two women per division; each meeting is one best-of-three match of 11-point games.", gender: "women", min: 2, max: 2, points: ring(8), scoring: "games-points", extraRules: [walkoverNote("11–0")], walkover: 11 }),
  e({ id: "table-tennis-mixed-doubles", sportId: "table-tennis", name: "Mixed Doubles", format: "One man and one woman per division; each meeting is one best-of-three match of 11-point games.", gender: "mixed", min: 2, max: 2, points: ring(8), scoring: "games-points", extraRules: [walkoverNote("11–0")], walkover: 11 }),
  e({ id: "tennis-open", sportId: "lawn-tennis", name: "Men's Singles", format: "One man per division. Ring and semifinal: one set, first to four games, tiebreak at 3–3; final best of three sets.", gender: "men", min: 1, max: 1, points: ring(12), scoring: "tennis-games", extraRules: [walkoverNote("4–0")], walkover: 4 }),
  e({ id: "lawn-tennis-womens-singles", sportId: "lawn-tennis", name: "Women's Singles", format: "One woman per division. Ring and semifinal: one set, first to four games, tiebreak at 3–3; final best of three sets.", gender: "women", min: 1, max: 1, points: ring(12), scoring: "tennis-games", extraRules: [walkoverNote("4–0")], walkover: 4 }),
  e({ id: "lawn-tennis-open-doubles", sportId: "lawn-tennis", name: "Open Doubles", format: "Two players of any gender per division; one reserve may replace a player before a match.", gender: "open", min: 2, max: 3, substitutes: 1, points: ring(12), scoring: "tennis-games", extraRules: [walkoverNote("4–0")], walkover: 4 }),
  e({ id: "pickleball-mens-doubles", sportId: "pickleball", name: "Men's Doubles", format: "Two men per division; one game to 15 (win by 2) in the ring and semifinal, best of three in the final.", gender: "men", min: 2, max: 2, points: ring(12), scoring: "rally-points", extraRules: [walkoverNote("15–0")], walkover: 15 }),
  e({ id: "pickleball-womens-doubles", sportId: "pickleball", name: "Women's Doubles", format: "Two women per division; one game to 15 (win by 2) in the ring and semifinal, best of three in the final.", gender: "women", min: 2, max: 2, points: ring(12), scoring: "rally-points", extraRules: [walkoverNote("15–0")], walkover: 15 }),
  e({ id: "pickleball-open", sportId: "pickleball", name: "Mixed Doubles", format: "One man and one woman per division; one game to 15 (win by 2) in the ring and semifinal, best of three in the final.", gender: "mixed", min: 2, max: 2, points: ring(12), scoring: "rally-points", extraRules: [walkoverNote("15–0")], walkover: 15 }),
  e({ id: "squash-mens-singles", sportId: "squash", name: "Men's Singles", format: "Two men per division, one in each group, plus a reserve; one game to 11 in groups and semifinals, best of three in the final.", gender: "men", min: 1, max: 2, substitutes: 1, points: group(12), scoring: "rally-points", extraRules: [walkoverNote("11–0")], walkover: 11 }),
  e({ id: "squash-womens-singles", sportId: "squash", name: "Women's Singles", format: "One woman and one reserve per division; one game to 11 in the ring and semifinal, best of three in the final.", gender: "women", min: 1, max: 2, substitutes: 1, points: ring(12), scoring: "rally-points", extraRules: [walkoverNote("11–0")], walkover: 11 }),
  e({ id: "pool-open", sportId: "pool", name: "Mixed Doubles · Team 1 / Team 2", format: "Two mixed teams per division in two groups of five; best of three frames, final best of five.", gender: "mixed", min: 2, max: 2, substitutes: 2, points: group(10), scoring: "frames", roster: ["Each entry is one man and one woman.", "One reserve man and one reserve woman per division; each player represents only one team."], extraRules: [walkoverNote("2–0 (3–0 in the final)")], walkover: 2 }),
  e({ id: "carrom-open", sportId: "carrom", name: "Mixed Doubles · Team 1 / Team 2", format: "Two 2-player teams per division in two groups of five; one board of up to 30 minutes.", gender: "mixed", min: 2, max: 2, substitutes: 2, points: group(10), scoring: "board-points", roster: ["Each team is one man and one woman; a player may represent only one team.", "One male and one female substitute per division; replacements only between matches for illness or injury."], extraRules: [walkoverNote("9–0")], walkover: 9 }),
  e({ id: "foosball-open", sportId: "foosball", name: "Mixed Doubles · Team 1 / Team 2", format: "Two mixed teams per division in two groups of five; first to 10 goals, 20-minute limit.", gender: "mixed", min: 2, max: 2, substitutes: 2, points: group(10), scoring: "goals", roster: ["Each entry is one man and one woman.", "One male and one female substitute per division; substitutions only between games or during a timeout."], extraRules: [walkoverNote("10–0")], walkover: 10 }),
  e({ id: "chess-open", sportId: "chess", name: "Team Chess · Team 1 / Team 2", format: "Two 2-player teams per division in two groups of five; two boards at once, 10 minutes + 2 seconds a move.", gender: "open", min: 2, max: 3, substitutes: 1, points: group(10, true), scoring: "board-points", roster: ["Each team has two board players and one substitute.", "Board order is submitted before each round and locks when the round begins."], extraRules: ["Knockouts level 1–1: one Armageddon game decides.", walkoverNote("2–0")], walkover: 2 }),
  e({ id: "fifa-open-singles", sportId: "fifa", name: "FIFA Singles (1v1)", format: "Open-gender 1v1; two 5-minute halves.", gender: "open", min: 1, max: 1, points: league(6), scoring: "goals", roster: ["A division squad of 3 players plus one substitute is shared by Singles and Doubles.", "A player may enter both FIFA events."], extraRules: [walkoverNote("3–0")], walkover: 3 }),
  e({ id: "fifa-open", sportId: "fifa", name: "FIFA Doubles (2v2)", format: "Open-gender 2v2; two 5-minute halves.", gender: "open", min: 2, max: 2, substitutes: 1, points: league(6), scoring: "goals", roster: ["A division squad of 3 players plus one substitute is shared by Singles and Doubles.", "A player may enter both FIFA events."], extraRules: [walkoverNote("3–0")], walkover: 3 }),
  e({ id: "valorant-open", sportId: "valorant", name: "Valorant 5v5", format: "Open-gender team of five plus one optional substitute; one map to 13 in the league and semifinal, best of three maps in the final.", gender: "open", min: 5, max: 6, substitutes: 1, points: league(12), scoring: "rounds", roster: ["One team per division. A player may represent only one team.", "No duplicate agents within a team."], extraRules: [walkoverNote("13–0")], walkover: 13 }),
  e({ id: "athletics-100m-men", sportId: "athletics", name: "Men's 100 m", format: "One runner per division; one race, no heats; lanes drawn by lot.", gender: "men", min: 1, max: 1, points: SPRINT, scoring: "finish-place", extraRules: ["Dead heat: the runners share the points for the places involved."] }),
  e({ id: "athletics-200m-men", sportId: "athletics", name: "Men's 200 m", format: "One runner per division; one race, no heats; lanes drawn by lot.", gender: "men", min: 1, max: 1, points: SPRINT, scoring: "finish-place", extraRules: ["Dead heat: the runners share the points for the places involved."] }),
  e({ id: "athletics-400m-men", sportId: "athletics", name: "Men's 400 m", format: "One runner per division; one race, no heats; lanes drawn by lot.", gender: "men", min: 1, max: 1, points: SPRINT, scoring: "finish-place", extraRules: ["Dead heat: the runners share the points for the places involved."] }),
  e({ id: "athletics-4x100-men", sportId: "athletics", name: "Men's 4 × 100 m Relay", format: "One team of four runners plus one reserve per division; one race.", gender: "men", min: 4, max: 5, substitutes: 1, points: RELAY, scoring: "finish-place", extraRules: ["Dead heat: the teams share the points for the places involved."] }),
  e({ id: "athletics-100m-women", sportId: "athletics", name: "Women's 100 m", format: "One runner per division; one race, no heats; lanes drawn by lot.", gender: "women", min: 1, max: 1, points: SPRINT, scoring: "finish-place", extraRules: ["Dead heat: the runners share the points for the places involved."] }),
  e({ id: "athletics-200m-women", sportId: "athletics", name: "Women's 200 m", format: "One runner per division; one race, no heats; lanes drawn by lot.", gender: "women", min: 1, max: 1, points: SPRINT, scoring: "finish-place", extraRules: ["Dead heat: the runners share the points for the places involved."] }),
  e({ id: "athletics-400m-women", sportId: "athletics", name: "Women's 400 m", format: "One runner per division; one race, no heats; lanes drawn by lot.", gender: "women", min: 1, max: 1, points: SPRINT, scoring: "finish-place", extraRules: ["Dead heat: the runners share the points for the places involved."] }),
  e({ id: "athletics-4x100-women", sportId: "athletics", name: "Women's 4 × 100 m Relay", format: "One team of four runners plus one reserve per division; one race.", gender: "women", min: 4, max: 5, substitutes: 1, points: RELAY, scoring: "finish-place", extraRules: ["Dead heat: the teams share the points for the places involved."] }),
  e({ id: "culture-battle-of-bands", sportId: "music", name: "Battle of Bands", format: "One band per division at MLS; up to 10 minutes plus soundcheck (warning at 3, hard stop at 5).", gender: "open", min: 1, max: null, points: BIG, scoring: "judges-score", extraRules: ["Marks out of 100: vocal quality 15, use of instruments 20, group dynamics 20, song arrangement 10, creativity and versatility 15, stage presence 10, keeping to time 10.", "Rank by total judges' score."] }),
  e({ id: "culture-duet-song", sportId: "music", name: "Duet Song", format: "Two singers per division, any gender, at MLS; up to 5 minutes; one accompanist allowed.", gender: "open", min: 2, max: 2, points: SMALL, scoring: "judges-score", extraRules: ["Criteria marks are shared before the event.", "Rank by total judges' score."] }),
  e({ id: "culture-group-dance", sportId: "dance", name: "Group Dance", format: "One team per division with at least 7 members, at MLS; 7 minutes plus 30 seconds setup.", gender: "open", min: 7, max: null, points: BIG, scoring: "judges-score", extraRules: ["Judged on choreography and creativity, and technique and execution.", "Going over time: 10 marks off. Inappropriate gestures, profanity or unsafe stunts: disqualification.", "Rank by total judges' score after penalties."] }),
  e({ id: "culture-partner-in-rhyme", sportId: "dance", name: "Two Much Groove", format: "Exactly two performers per division fusing two dance styles, at MLS; 4 + 1 minutes, 15 seconds setup.", gender: "open", min: 2, max: 2, points: SMALL, scoring: "judges-score", extraRules: ["Judged on choreography and creativity, and technique and execution.", "Going over time: 10 marks off.", "Rank by total judges' score after penalties."] }),
  e({ id: "culture-curtain-call", sportId: "stage-play", name: "Group Skit", format: "One performance per division at MLS; 15 minutes including setup; English, Hindi or both.", gender: "open", min: 1, max: null, points: BIG, scoring: "judges-score", roster: ["No performer limit; up to three people may help backstage."], extraRules: ["Judged on script and concept, acting, creative elements and participation, and audience engagement.", "Over 15 minutes: 10 marks off. Damage to the stage or equipment: 10% off. Flammable items or alcohol: disqualification.", "Rank by total judges' score after penalties."] }),
  e({ id: "culture-short-film", sportId: "short-film", name: "Short Film", format: "One original two-minute film per division on a common theme; no cast or crew limit.", gender: "open", min: 1, max: null, points: BIG, scoring: "judges-score", roster: ["Only current students of the division may be cast or crew; no outside help."], extraRules: ["Marks out of 100: story and concept 25, direction and cinematography 25, editing and sound 20, performance and production design 20, audience impact 10.", "Special awards and People's Choice don't count for division points.", "Rank by total judges' score after penalties."] }),
  e({ id: "culture-quiz", sportId: "quiz", name: "Quiz", format: "One four-person team per division; five sections of six questions, bounce and pounce.", gender: "open", min: 4, max: 4, points: SMALL, scoring: "quiz-points", extraRules: ["Marks for direct answers, bounces and pounces, and any negative marking, are announced before the quiz.", "Level teams: a tie-breaker question or sudden death."] }),
  e({ id: "culture-treasure-hunt", sportId: "treasure-hunt", name: "Treasure Hunt", format: "One team per division, up to 10 members with five main representatives; 75–120 minutes across campus.", gender: "open", min: 5, max: 10, points: SMALL, scoring: "milestone-points", roster: ["All team members must be together at each milestone."], extraRules: ["Each milestone pays most to the first team to complete it; milestone points are announced before the hunt.", "Level totals: more first-place milestone finishes ranks higher."] }),
  e({ id: "culture-roast-comedy", sportId: "roast-comedy", name: "Roast Comedy", format: "Five performers plus one optional standby per division across three rounds.", gender: "open", min: 5, max: 6, substitutes: 1, points: SMALL, scoring: "judges-score", roster: ["Round 1: one performer, 5 minutes; round 2: four performers, 1 minute each; round 3: one performer, 2 minutes."], extraRules: ["Round scoring and deductions are shared before the event.", "Rank by total score across the three rounds after deductions."] }),
  e({ id: "culture-poetry", sportId: "poetry", name: "Poetry", format: "Up to three solo participants per division at Gyaan Auditorium; poem written on the spot in 20 minutes, performed in up to 3 minutes.", gender: "open", min: 1, max: 3, points: SMALL, scoring: "judges-score", extraRules: ["Each participant is marked out of 40: content, use of the topic, creativity, delivery (10 each).", "How individual scores combine into a division rank is shared before the event."] }),
  e({ id: "culture-art", sportId: "art", name: "Colour Roulette", format: "Three artists per division; one original hand-made artwork each in 150 minutes, using 5 spun colours and a spun style.", gender: "open", min: 3, max: 3, points: SMALL, scoring: "judges-score", extraRules: ["Each artwork is the average of 3 judges' marks out of 100; a division's three artworks are added (out of 300).", "Rank by division score after penalties."] }),
];
