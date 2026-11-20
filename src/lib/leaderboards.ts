import type { CompetitionData, Fixture, SectionId } from "./domain";

export type LeaderboardGender = "all" | "men" | "women";

export interface LeaderboardRow {
  rank: number;
  tied: boolean;
  /** Omitted when the viewer may not see participant names. */
  name?: string;
  sectionId: SectionId;
  value: number;
  detail: string;
}

export interface Leaderboard {
  id: "cricket-runs" | "cricket-wickets" | "football-goals" | "basketball-points";
  title: string;
  sport: string;
  unit: string;
  rows: LeaderboardRow[];
}

interface Tally { value: number; matches: Set<string>; balls: number; runsConceded: number }

const BOWLER_WICKETS = new Set(["bowled", "caught", "lbw", "stumped", "hit-wicket"]);

export function isFinalized(fixture: Fixture): boolean {
  return fixture.status === "completed" && fixture.resultConfirmed;
}

function sportOf(data: CompetitionData, fixture: Fixture): string | undefined {
  return data.events.find((event) => event.id === fixture.eventId)?.sportId;
}

function genderMatches(data: CompetitionData, fixture: Fixture, gender: LeaderboardGender): boolean {
  if (gender === "all") return true;
  return data.events.find((event) => event.id === fixture.eventId)?.genderEligibility === gender;
}

function tallyFor(map: Map<string, Tally>, playerId: string): Tally {
  let tally = map.get(playerId);
  if (!tally) { tally = { value: 0, matches: new Set(), balls: 0, runsConceded: 0 }; map.set(playerId, tally); }
  return tally;
}

/**
 * Builds individual leaderboards from finalized fixtures only, counting only events attributed to a player.
 * Cricket uses ball-by-ball deliveries when the fixture has them, otherwise the generic player totals.
 */
export function buildLeaderboards(data: CompetitionData, options: { gender?: LeaderboardGender; showNames: boolean; limit?: number }): Leaderboard[] {
  const gender = options.gender ?? "all";
  const limit = options.limit ?? 10;
  const runs = new Map<string, Tally>();
  const wickets = new Map<string, Tally>();
  const goals = new Map<string, Tally>();
  const baskets = new Map<string, Tally>();

  for (const fixture of data.fixtures) {
    if (!isFinalized(fixture) || !genderMatches(data, fixture, gender) || !fixture.scorecard) continue;
    const sport = sportOf(data, fixture);
    const card = fixture.scorecard;
    if (sport === "cricket") {
      const innings = card.cricket?.innings ?? [];
      if (innings.length) {
        // Super Over balls (innings 3 and 4) decide a tie but don't count toward player figures.
        for (const delivery of innings.filter((item) => item.number <= 2).flatMap((item) => item.deliveries)) {
          if (delivery.reversedAt) continue;
          const batter = tallyFor(runs, delivery.batterId);
          batter.value += delivery.batRuns;
          batter.matches.add(fixture.id);
          if (delivery.extraType !== "wide") batter.balls += 1;
          const bowler = tallyFor(wickets, delivery.bowlerId);
          bowler.matches.add(fixture.id);
          if (delivery.legal) bowler.balls += 1;
          if (delivery.extraType !== "bye" && delivery.extraType !== "leg-bye" && delivery.extraType !== "penalty") bowler.runsConceded += delivery.batRuns + (delivery.extraType === "wide" || delivery.extraType === "no-ball" ? delivery.extraRuns + 1 : 0);
          if (delivery.wicket && BOWLER_WICKETS.has(delivery.wicket.kind)) bowler.value += 1;
        }
        continue;
      }
      for (const [playerId, stats] of Object.entries(card.playerStats ?? {})) {
        if (stats.runs) { const tally = tallyFor(runs, playerId); tally.value += stats.runs; tally.matches.add(fixture.id); }
        if (stats.wickets || stats.legalBalls) {
          const tally = tallyFor(wickets, playerId);
          tally.value += stats.wickets ?? 0; tally.balls += stats.legalBalls ?? 0; tally.runsConceded += stats.runsConceded ?? 0; tally.matches.add(fixture.id);
        }
      }
      continue;
    }
    for (const [playerId, stats] of Object.entries(card.playerStats ?? {})) {
      if (sport === "football" && stats.goal) { const tally = tallyFor(goals, playerId); tally.value += stats.goal; tally.matches.add(fixture.id); }
      if (sport === "basketball" && stats.points) { const tally = tallyFor(baskets, playerId); tally.value += stats.points; tally.matches.add(fixture.id); }
    }
  }

  const participants = new Map(data.participants.map((participant) => [participant.id, participant]));
  const rank = (map: Map<string, Tally>, detail: (tally: Tally) => string): LeaderboardRow[] => {
    const entries = [...map.entries()]
      .map(([playerId, tally]) => ({ participant: participants.get(playerId), tally }))
      .filter((entry): entry is { participant: NonNullable<typeof entry.participant>; tally: Tally } => Boolean(entry.participant) && entry.tally.value > 0)
      .sort((a, b) => b.tally.value - a.tally.value || a.participant.name.localeCompare(b.participant.name));
    return entries.slice(0, limit).map(({ participant, tally }) => {
      const higher = entries.filter((other) => other.tally.value > tally.value).length;
      const equal = entries.filter((other) => other.tally.value === tally.value).length;
      return { rank: higher + 1, tied: equal > 1, name: options.showNames ? participant.name : undefined, sectionId: participant.sectionId, value: tally.value, detail: detail(tally) };
    });
  };
  const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

  return [
    { id: "cricket-runs", title: "Most runs", sport: "Cricket", unit: "runs", rows: rank(runs, (tally) => `${plural(tally.balls, "ball")}${tally.balls ? ` · SR ${(tally.value * 100 / tally.balls).toFixed(1)}` : ""}`) },
    { id: "cricket-wickets", title: "Most wickets", sport: "Cricket", unit: "wickets", rows: rank(wickets, (tally) => tally.balls ? `Econ ${(tally.runsConceded * 6 / tally.balls).toFixed(2)} · ${Math.floor(tally.balls / 6)}.${tally.balls % 6} ov` : plural(tally.matches.size, "match")) },
    { id: "football-goals", title: "Top scorers", sport: "Football", unit: "goals", rows: rank(goals, (tally) => plural(tally.matches.size, "match")) },
    { id: "basketball-points", title: "Most points", sport: "Basketball", unit: "points", rows: rank(baskets, (tally) => `${plural(tally.matches.size, "game")} · ${(tally.value / Math.max(1, tally.matches.size)).toFixed(1)} per game`) },
  ];
}

function istDay(iso: string): string {
  return new Date(new Date(iso).getTime() + 330 * 60_000).toISOString().slice(0, 10);
}

function dayRange(first: string, last: string): string[] {
  const days: string[] = [];
  const cursor = new Date(`${first}T00:00:00Z`);
  const end = new Date(`${last}T00:00:00Z`);
  while (cursor <= end && days.length < 62) { days.push(cursor.toISOString().slice(0, 10)); cursor.setUTCDate(cursor.getUTCDate() + 1); }
  return days;
}

export type RaceBoard = "overall" | "sports" | "cultural";

export interface PointsRace {
  /** IST calendar days, YYYY-MM-DD. */
  days: string[];
  series: Array<{ sectionId: SectionId; values: number[] }>;
}

/**
 * Cumulative finalized points per section at the end of each IST day, from the first day with a result to the last.
 * A result counts on the day it was finalized; reopened results are no longer finalized and drop out entirely.
 */
export function buildPointsRace(data: CompetitionData, board: RaceBoard): PointsRace {
  const sportCategory = new Map(data.sports.map((sport) => [sport.id, sport.category]));
  const awards = data.fixtures.flatMap((fixture) => {
    if (!isFinalized(fixture)) return [];
    const event = data.events.find((item) => item.id === fixture.eventId);
    if (!event) return [];
    const category = sportCategory.get(event.sportId);
    if (board === "sports" && category !== "sport") return [];
    if (board === "cultural" && category !== "cultural") return [];
    const day = istDay(fixture.resultFinalizedAt ?? fixture.updatedAt);
    return [
      { day, sectionId: fixture.sectionA, points: fixture.awardedPointsA ?? 0 },
      { day, sectionId: fixture.sectionB, points: fixture.awardedPointsB ?? 0 },
    ];
  });
  // Table-topper bonuses count on the day they were awarded.
  for (const bonus of data.bonusAwards ?? []) {
    const event = data.events.find((item) => item.id === bonus.eventId);
    if (!event) continue;
    const category = sportCategory.get(event.sportId);
    if (board === "sports" && category !== "sport") continue;
    if (board === "cultural" && category !== "cultural") continue;
    awards.push({ day: istDay(bonus.awardedAt), sectionId: bonus.sectionId, points: bonus.points });
  }
  if (!awards.length) return { days: [], series: data.sections.map((section) => ({ sectionId: section.id, values: [] })) };
  const sorted = awards.map((award) => award.day).sort();
  const days = dayRange(sorted[0], sorted[sorted.length - 1]);
  return {
    days,
    series: data.sections.map((section) => {
      let total = 0;
      return {
        sectionId: section.id,
        values: days.map((day) => {
          total += awards.filter((award) => award.day === day && award.sectionId === section.id).reduce((sum, award) => sum + award.points, 0);
          return total;
        }),
      };
    }),
  };
}
