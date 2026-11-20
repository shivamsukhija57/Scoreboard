import type { BonusAward, CompetitionData, EventDefinition, Fixture, PointsFormat, PointsPolicy, SectionId } from "./domain";

/**
 * The 2026 sports rulebook pays every sport in units of X (its win value):
 * match win X, table topper X (league and chit-ring only), semifinal win 1.5X, semifinal loss 0.5X, final win 2X.
 * Ring-group events (two teams per division in two groups) pay X per group win and no topper bonus.
 */
export function outcomePointsFor(format: PointsFormat, unit: number, options: { splitDraw?: boolean } = {}): Record<string, number> {
  if (format === "placings") return {};
  const half = (value: number) => Math.round(value * 10) / 10;
  const base: Record<string, number> = format === "ring-group"
    ? { groupWin: unit }
    : { leagueWin: unit, leagueTopper: unit };
  return {
    ...base,
    semifinalWin: half(unit * 1.5),
    semifinalLoss: half(unit * 0.5),
    finalWin: unit * 2,
    ...(options.splitDraw ? { draw: half(unit / 2) } : {}),
  };
}

export type FixtureOutcome = "a_win" | "b_win" | "draw";

export function fixtureOutcome(fixture: Pick<Fixture, "noResult" | "scoreA" | "scoreB" | "walkoverWinner"> & Partial<Pick<Fixture, "tieBreak">>): FixtureOutcome {
  if (fixture.walkoverWinner) return fixture.walkoverWinner === "a" ? "a_win" : "b_win";
  if (fixture.noResult) return "draw";
  // Cricket: level after both innings, decided by the Super Over or a bowl-out.
  if (fixture.scoreA === fixture.scoreB && fixture.tieBreak) return fixture.tieBreak.winner === "a" ? "a_win" : "b_win";
  if (fixture.scoreA === fixture.scoreB) return "draw";
  return fixture.scoreA > fixture.scoreB ? "a_win" : "b_win";
}

/** Points for [side A, side B] from a finalized fixture, using the event's stored points. */
export function fixtureAwards(policy: PointsPolicy, stage: Fixture["stage"], outcome: FixtureOutcome): [number, number] {
  const points = policy.pointsByOutcome ?? {};
  const first = (...values: Array<number | undefined>) => values.find((value) => typeof value === "number" && Number.isFinite(value)) ?? 0;
  const win = stage === "final"
    ? first(points.finalWin, points.win, policy.places[0])
    : stage === "semifinal"
      ? first(points.semifinalWin, points.leagueWin, points.groupWin, points.win, policy.places[0])
      : first(points.leagueWin, points.groupWin, points.win, policy.places[0]);
  const loss = stage === "semifinal" ? first(points.semifinalLoss, points.loss) : stage === "final" ? first(points.finalLoss, points.loss) : first(points.leagueLoss, points.loss);
  if (outcome === "draw") {
    const draw = first(points.draw);
    return [draw, draw];
  }
  return outcome === "a_win" ? [win, loss] : [loss, win];
}

const isFinal = (fixture: Fixture) => fixture.status === "completed" && fixture.resultConfirmed;

/** Bonus points (table toppers) that count for a section, optionally limited to some events. */
export function bonusPointsFor(data: Pick<CompetitionData, "bonusAwards">, sectionId: SectionId, includeEvent: (eventId: string) => boolean = () => true): number {
  return (data.bonusAwards ?? []).filter((award) => award.sectionId === sectionId && includeEvent(award.eventId)).reduce((sum, award) => sum + award.points, 0);
}

export interface TableRow {
  sectionId: SectionId;
  played: number;
  wins: number;
  points: number;
  scored: number;
  conceded: number;
  diff: number;
  netRunRate: number;
}

/**
 * League or ring table for one event: rulebook order is matches won, then the sport's difference statistic
 * (net run rate for cricket, otherwise score difference), then total scored. Walkovers count as wins but
 * add nothing to scores or net run rate. Head-to-head and the final committee call are left to the admin.
 */
export function eventTable(data: Pick<CompetitionData, "sections" | "fixtures" | "events">, eventId: string): TableRow[] {
  const event = data.events.find((item) => item.id === eventId);
  const cricket = event?.sportId === "cricket";
  const fixtures = data.fixtures.filter((fixture) => fixture.eventId === eventId && (fixture.stage ?? "league") === "league" && isFinal(fixture));
  const rows = data.sections.map((section) => {
    const mine = fixtures.filter((fixture) => fixture.sectionA === section.id || fixture.sectionB === section.id);
    let wins = 0, points = 0, scored = 0, conceded = 0, ballsFor = 0, ballsAgainst = 0;
    for (const fixture of mine) {
      const isA = fixture.sectionA === section.id;
      const outcome = fixtureOutcome(fixture);
      if (outcome === (isA ? "a_win" : "b_win")) wins += 1;
      points += (isA ? fixture.awardedPointsA : fixture.awardedPointsB) ?? 0;
      if (fixture.walkoverWinner) continue;
      scored += isA ? fixture.scoreA : fixture.scoreB;
      conceded += isA ? fixture.scoreB : fixture.scoreA;
      ballsFor += (isA ? fixture.scorecard?.legalBallsA : fixture.scorecard?.legalBallsB) ?? 0;
      ballsAgainst += (isA ? fixture.scorecard?.legalBallsB : fixture.scorecard?.legalBallsA) ?? 0;
    }
    const netRunRate = cricket && ballsFor > 0 && ballsAgainst > 0 ? scored * 6 / ballsFor - conceded * 6 / ballsAgainst : 0;
    return { sectionId: section.id, played: mine.length, wins, points, scored, conceded, diff: scored - conceded, netRunRate };
  });
  return rows.sort((a, b) => b.wins - a.wins || (cricket ? b.netRunRate - a.netRunRate : b.diff - a.diff) || b.scored - a.scored);
}

/** League matches each format plays before the table is complete: everyone meets once, or each plays two ring neighbours. */
export function expectedTableMatches(format: PointsFormat | undefined, divisions: number): number | null {
  if (format === "league") return divisions * (divisions - 1) / 2;
  if (format === "chit-ring") return divisions;
  return null;
}

export interface TopperStatus {
  eligible: boolean;
  complete: boolean;
  played: number;
  expected: number | null;
  /** Divisions level with the leader on wins and the tie-break statistic; the committee decides between them. */
  contenders: SectionId[];
  suggested: SectionId | null;
  bonus: number;
  awarded?: BonusAward;
}

export function topperStatus(data: Pick<CompetitionData, "sections" | "fixtures" | "events" | "bonusAwards">, event: EventDefinition): TopperStatus {
  const format = event.pointsPolicy.format;
  const expected = expectedTableMatches(format, data.sections.length);
  const bonus = event.pointsPolicy.pointsByOutcome?.leagueTopper ?? 0;
  const awarded = (data.bonusAwards ?? []).find((award) => award.eventId === event.id && award.kind === "table-topper");
  const played = data.fixtures.filter((fixture) => fixture.eventId === event.id && (fixture.stage ?? "league") === "league" && isFinal(fixture)).length;
  if (expected === null || bonus <= 0) return { eligible: false, complete: false, played, expected, contenders: [], suggested: null, bonus, awarded };
  const table = eventTable(data, event.id);
  const leader = table[0];
  const cricket = event.sportId === "cricket";
  const contenders = leader ? table.filter((row) => row.wins === leader.wins && (cricket ? Math.abs(row.netRunRate - leader.netRunRate) < 1e-9 : row.diff === leader.diff) && row.scored === leader.scored).map((row) => row.sectionId) : [];
  return {
    eligible: true,
    complete: played >= expected,
    played,
    expected,
    contenders,
    suggested: contenders.length === 1 ? contenders[0] : null,
    bonus,
    awarded,
  };
}

export interface GroupTeam { sectionId: SectionId; entry: number }

/** One group's ring table in a ring-group event, ranked like a league table (wins, difference, scored). */
export function groupTable(data: Pick<CompetitionData, "sections" | "fixtures" | "events">, eventId: string, group: 1 | 2) {
  const fixtures = data.fixtures.filter((fixture) => fixture.eventId === eventId && (fixture.stage ?? "league") === "league" && fixture.group === group && isFinal(fixture));
  const rows = data.sections.map((section) => {
    const mine = fixtures.filter((fixture) => fixture.sectionA === section.id || fixture.sectionB === section.id);
    let wins = 0, scored = 0, conceded = 0;
    for (const fixture of mine) {
      const isA = fixture.sectionA === section.id;
      if (fixtureOutcome(fixture) === (isA ? "a_win" : "b_win")) wins += 1;
      if (fixture.walkoverWinner) continue;
      scored += isA ? fixture.scoreA : fixture.scoreB;
      conceded += isA ? fixture.scoreB : fixture.scoreA;
    }
    return { team: { sectionId: section.id, entry: group } as GroupTeam, played: mine.length, wins, diff: scored - conceded, scored };
  });
  return { played: fixtures.length, rows: rows.sort((a, b) => b.wins - a.wins || b.diff - a.diff || b.scored - a.scored) };
}

export interface SemifinalDraw {
  eligible: boolean;
  complete: boolean;
  played: number;
  expected: number;
  /** Top two of group 1 and group 2. */
  qualifiers: [GroupTeam[], GroupTeam[]];
  /** Level on wins, difference and scored across 2nd and 3rd place in a group: the committee decides who goes through. */
  tiedAtCutoff: boolean;
  semis: [GroupTeam, GroupTeam][];
  /** Divisions with both teams in the semis, who must play each other. */
  sameDivision: SectionId[];
}

/**
 * Ring-group semifinals (2026 sports rulebook): the top two of each group cross over (group 1 winner v group 2
 * runner-up, group 2 winner v group 1 runner-up). Same-division rule: if a division has both of its teams among the
 * four semifinalists, those two teams play each other, so the final is always between two different divisions.
 */
export function pairRingGroupSemis(group1: GroupTeam[], group2: GroupTeam[]): { semis: [GroupTeam, GroupTeam][]; sameDivision: SectionId[] } {
  const [g1First, g1Second] = group1;
  const [g2First, g2Second] = group2;
  const four = [g1First, g1Second, g2First, g2Second].filter(Boolean);
  const sameDivision = [...new Set(four.map((team) => team.sectionId))].filter((id) => four.filter((team) => team.sectionId === id).length === 2);
  if (!sameDivision.length) return { semis: [[g1First, g2Second], [g2First, g1Second]], sameDivision };
  const paired = sameDivision.map((id) => four.filter((team) => team.sectionId === id) as [GroupTeam, GroupTeam]);
  const rest = four.filter((team) => !sameDivision.includes(team.sectionId));
  return { semis: [...paired, ...(rest.length === 2 ? [[rest[0], rest[1]] as [GroupTeam, GroupTeam]] : [])], sameDivision };
}

export function semifinalDraw(data: Pick<CompetitionData, "sections" | "fixtures" | "events">, event: EventDefinition): SemifinalDraw {
  const eligible = event.pointsPolicy.format === "ring-group";
  const tables = [groupTable(data, event.id, 1), groupTable(data, event.id, 2)];
  // Each group is a ring: every team plays its two neighbours, one match per team.
  const expected = data.sections.length * 2;
  const played = tables[0].played + tables[1].played;
  const level = (a?: { wins: number; diff: number; scored: number }, b?: { wins: number; diff: number; scored: number }) => !!a && !!b && a.wins === b.wins && a.diff === b.diff && a.scored === b.scored;
  const qualifiers = tables.map((table) => table.rows.slice(0, 2).map((row) => row.team)) as [GroupTeam[], GroupTeam[]];
  const { semis, sameDivision } = pairRingGroupSemis(qualifiers[0], qualifiers[1]);
  return {
    eligible,
    complete: eligible && played >= expected,
    played,
    expected,
    qualifiers,
    tiedAtCutoff: tables.some((table) => level(table.rows[1], table.rows[2])),
    semis,
    sameDivision,
  };
}

/** Walkover scores from the rulebook: the side that turned up wins by the event's walkover score. */
export function walkoverScores(event: Pick<EventDefinition, "scoringConfig">, winner: "a" | "b"): [number, number] {
  const score = event.scoringConfig?.walkoverScore ?? 0;
  return winner === "a" ? [score, 0] : [0, score];
}
