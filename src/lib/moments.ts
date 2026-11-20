import type { CompetitionData, SectionId } from "./domain";

/**
 * "Moments": the rare, high-stakes changes the app celebrates (the lead changing hands, the champion).
 * Everything here is derived from finalized results, so it needs no extra storage on the server.
 */

export interface LeadChange {
  /** When the result that changed the lead was finalized. */
  at: string;
  sectionId: SectionId;
  /** The previous leader; null when the first leader emerges. */
  from: SectionId | null;
  /** The new leader's total right after the change. */
  points: number;
  /** What did it, e.g. "Group Dance +160". */
  cause: string;
}

interface PointsStep { at: string; awards: Array<{ sectionId: SectionId; points: number }>; cause: (sectionId: SectionId) => string }

function steps(data: Pick<CompetitionData, "fixtures" | "events" | "bonusAwards">): PointsStep[] {
  const name = (eventId: string) => data.events.find((event) => event.id === eventId)?.name ?? "Event";
  const fixtureSteps: PointsStep[] = data.fixtures
    .filter((fixture) => fixture.status === "completed" && fixture.resultConfirmed)
    .map((fixture) => ({
      at: fixture.resultFinalizedAt ?? fixture.updatedAt,
      awards: [{ sectionId: fixture.sectionA, points: fixture.awardedPointsA ?? 0 }, { sectionId: fixture.sectionB, points: fixture.awardedPointsB ?? 0 }],
      cause: (sectionId) => `${name(fixture.eventId)} +${(fixture.sectionA === sectionId ? fixture.awardedPointsA : fixture.awardedPointsB) ?? 0}`,
    }));
  const bonusSteps: PointsStep[] = (data.bonusAwards ?? []).map((bonus) => ({
    at: bonus.awardedAt,
    awards: [{ sectionId: bonus.sectionId, points: bonus.points }],
    cause: () => bonus.kind === "placing" ? `${name(bonus.eventId)} ${["1st", "2nd", "3rd", "4th", "5th"][(bonus.place ?? 1) - 1] ?? `${bonus.place}th`} place +${bonus.points}` : `${name(bonus.eventId)} table-topper bonus +${bonus.points}`,
  }));
  return [...fixtureSteps, ...bonusSteps].sort((a, b) => a.at.localeCompare(b.at));
}

/**
 * The overall leader and every time the lead changed hands, replaying results in the order they were finalized.
 * A tie at the top doesn't change the leader: the lead only moves when someone is clear on their own.
 */
export function leaderHistory(data: Pick<CompetitionData, "sections" | "fixtures" | "events" | "bonusAwards">): { leader: SectionId | null; changes: LeadChange[] } {
  const totals = new Map<SectionId, number>(data.sections.map((section) => [section.id, 0]));
  const changes: LeadChange[] = [];
  let leader: SectionId | null = null;
  for (const step of steps(data)) {
    for (const award of step.awards) totals.set(award.sectionId, (totals.get(award.sectionId) ?? 0) + award.points);
    const ranked = [...totals.entries()].sort((a, b) => b[1] - a[1]);
    const [first, second] = ranked;
    if (!first || first[1] <= 0 || (second && second[1] === first[1])) continue;
    if (first[0] !== leader) {
      changes.push({ at: step.at, sectionId: first[0], from: leader, points: first[1], cause: step.cause(first[0]) });
      leader = first[0];
    }
  }
  return { leader, changes };
}

export interface SeenLeader { leader: SectionId | null; at: string }

export type CatchUp =
  | { kind: "none" }
  | { kind: "single"; change: LeadChange }
  | { kind: "many"; count: number; last: LeadChange };

/**
 * What to replay for someone coming back: only if the leader now is different from the one they last saw,
 * the change is recent (48 hours by default), and this isn't their first visit.
 */
export function leadCatchUp(history: { leader: SectionId | null; changes: LeadChange[] }, seen: SeenLeader | null, now: Date, maxAgeMs = 48 * 3_600_000): CatchUp {
  if (!seen || !history.leader || seen.leader === history.leader) return { kind: "none" };
  const since = history.changes.filter((change) => change.at > seen.at && change.from !== null);
  const last = since.at(-1);
  if (!last || now.getTime() - new Date(last.at).getTime() > maxAgeMs) return { kind: "none" };
  return since.length === 1 ? { kind: "single", change: last } : { kind: "many", count: since.length, last };
}

export interface AwaySummary {
  leadChanges: LeadChange[];
  results: Array<{ id: string; at: string; eventId: string; winner: SectionId | null; loser: SectionId | null; points: number }>;
  decided: number;
}

/** Everything finalized since the visitor's last visit, newest first, for the still "While you were away" card. */
export function awaySummary(data: Pick<CompetitionData, "sections" | "fixtures" | "events" | "bonusAwards">, since: string): AwaySummary {
  const fresh = data.fixtures
    .filter((fixture) => fixture.status === "completed" && fixture.resultConfirmed && (fixture.resultFinalizedAt ?? fixture.updatedAt) > since)
    .sort((a, b) => (b.resultFinalizedAt ?? b.updatedAt).localeCompare(a.resultFinalizedAt ?? a.updatedAt));
  return {
    leadChanges: leaderHistory(data).changes.filter((change) => change.at > since && change.from !== null).reverse(),
    results: fresh.map((fixture) => {
      const aWon = (fixture.awardedPointsA ?? 0) > (fixture.awardedPointsB ?? 0) || (fixture.awardedPointsA === fixture.awardedPointsB && fixture.scoreA > fixture.scoreB);
      const level = fixture.awardedPointsA === fixture.awardedPointsB && fixture.scoreA === fixture.scoreB;
      return {
        id: fixture.id, at: fixture.resultFinalizedAt ?? fixture.updatedAt, eventId: fixture.eventId,
        winner: level ? null : aWon ? fixture.sectionA : fixture.sectionB,
        loser: level ? null : aWon ? fixture.sectionB : fixture.sectionA,
        points: Math.max(fixture.awardedPointsA ?? 0, fixture.awardedPointsB ?? 0),
      };
    }),
    decided: fresh.length,
  };
}
