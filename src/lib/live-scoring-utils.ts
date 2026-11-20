import type { AuditEntry, CompetitionData, Fixture, MatchScoreInput, MatchStatus, RoleAssignment } from "./domain";

export function isUnchangedSnapshot(ifNoneMatch: string | null, revision: string): boolean {
  return ifNoneMatch === `"${revision}"`;
}

export function shouldPollFixture(status: MatchStatus, visible: boolean): boolean {
  return visible && status === "live";
}

export function retryDelayMs(failures: number): number {
  return Math.min(8_000, 1_000 * 2 ** Math.min(Math.max(failures, 0), 3));
}

export function newerFixture(current: Fixture, incoming: Fixture | undefined, latestKnownRevision: string): Fixture {
  if (!incoming || current.updatedAt > incoming.updatedAt || latestKnownRevision > (incoming.updatedAt ?? "")) return current;
  return incoming;
}

export function mergeCompetitionData(current: CompetitionData, incoming: CompetitionData, selectedFixtureId: string, latestRevisions: Map<string, string>): CompetitionData {
  const fixtureMap = new Map(incoming.fixtures.map((fixture) => [fixture.id, fixture]));
  for (const fixture of current.fixtures) {
    const next = fixtureMap.get(fixture.id);
    if (fixture.id === selectedFixtureId) fixtureMap.set(fixture.id, newerFixture(fixture, next, latestRevisions.get(fixture.id) ?? fixture.updatedAt));
  }
  for (const fixture of fixtureMap.values()) latestRevisions.set(fixture.id, fixture.updatedAt);
  return { ...incoming, fixtures: [...fixtureMap.values()] };
}

export function projectScoreAction(fixture: Fixture, input: MatchScoreInput): Fixture {
  const projection = structuredClone(fixture);
  if (input.action === "increment-a") projection.scoreA += 1;
  if (input.action === "increment-b") projection.scoreB += 1;
  if (input.action === "decrement-a") projection.scoreA = Math.max(0, projection.scoreA - 1);
  if (input.action === "decrement-b") projection.scoreB = Math.max(0, projection.scoreB - 1);
  if (input.action === "record-event" && input.event) {
    if (input.event.side === "a") projection.scoreA += input.event.points;
    else projection.scoreB += input.event.points;
  }
  // The Super Over (innings 3 and 4) decides a tie but doesn't add to the match score.
  if (input.action === "cricket-delivery" && input.cricketDelivery && (projection.scorecard?.cricket?.innings.at(-1)?.number ?? 1) <= 2) {
    const delivery = input.cricketDelivery;
    const total = delivery.batRuns + delivery.extraRuns + (delivery.extraType === "wide" || delivery.extraType === "no-ball" ? 1 : 0);
    if (delivery.battingSide === "a") projection.scoreA += total;
    else projection.scoreB += total;
  }
  return projection;
}

export function finalizedFixturesForEvents(fixtures: Fixture[], eventIds: Set<string>): Fixture[] {
  return fixtures.filter((fixture) => fixture.status === "completed" && fixture.resultConfirmed && eventIds.has(fixture.eventId));
}

export function auditForRole(entries: AuditEntry[], isCentralAdmin: boolean): AuditEntry[] {
  return isCentralAdmin ? entries : [];
}

export function canScoreEvent(assignments: RoleAssignment[], eventId: string): boolean {
  return assignments.some((assignment) => {
    if (!assignment.active) return false;
    if (assignment.role === "central-admin") return true;
    if (assignment.role !== "event-head") return false;
    return !assignment.scopeId || assignment.scopeId === eventId || eventId.startsWith(`${assignment.scopeId}-`);
  });
}

export function describeMatchAuditAction(data: CompetitionData, fixture: Fixture, input: MatchScoreInput, before: { scoreA: number; scoreB: number; pointsA: number; pointsB: number }): string {
  const event = data.events.find((item) => item.id === fixture.eventId);
  if (input.action === "submit") return `${event?.name ?? "Match"} · ${fixture.sectionA} ${fixture.scoreA}–${fixture.scoreB} ${fixture.sectionB} · ${fixture.stage ?? "league"} · finalized · points ${fixture.awardedPointsA ?? 0}–${fixture.awardedPointsB ?? 0}`;
  if (input.action === "walkover") return `${event?.name ?? "Match"} · walkover to ${input.walkoverWinner === "a" ? fixture.sectionA : fixture.sectionB} · recorded ${fixture.scoreA}–${fixture.scoreB} · ${fixture.stage ?? "league"} · points ${fixture.awardedPointsA ?? 0}–${fixture.awardedPointsB ?? 0}`;
  if (input.action === "reopen") return `${event?.name ?? "Match"} · ${fixture.sectionA} ${before.scoreA}–${before.scoreB} ${fixture.sectionB} · reopened for correction · points removed ${before.pointsA}–${before.pointsB} · reason: ${input.reviewNote?.trim()}`;
  if (input.action === "cricket-bowl-out") return `${event?.name ?? "Cricket"} · ${fixture.sectionA} ${fixture.scoreA}–${fixture.scoreB} ${fixture.sectionB} · level · bowl-out won by ${input.tieBreakWinner === "a" ? fixture.sectionA : fixture.sectionB}${input.reviewNote?.trim() ? ` · ${input.reviewNote.trim().slice(0, 300)}` : ""}`;
  if (input.action === "cricket-correct-delivery" || input.action === "reverse-event") return `${event?.name ?? "Match"} · score corrected ${before.scoreA}–${before.scoreB} → ${fixture.scoreA}–${fixture.scoreB} · reason: ${input.correctionReason?.trim() ?? "not provided"}`;
  if (input.action === "cricket-delivery" && input.cricketDelivery) {
    const delivery = input.cricketDelivery;
    const batter = data.participants.find((player) => player.id === delivery.batterId)?.name ?? delivery.batterId;
    const extra = delivery.extraType !== "none" ? ` · ${delivery.extraType} ${delivery.extraRuns}` : "";
    const wicket = delivery.wicket ? ` · wicket ${delivery.wicket.kind}` : "";
    return `${event?.name ?? "Cricket"} · ${fixture.sectionA} ${fixture.scoreA}–${fixture.scoreB} ${fixture.sectionB} · ${batter}: ${delivery.batRuns} off bat${extra}${wicket}`;
  }
  const sideLabel = input.event?.side === "a" ? fixture.sectionA : input.event?.side === "b" ? fixture.sectionB : "";
  const playerName = input.event?.playerId ? data.participants.find((player) => player.id === input.event?.playerId)?.name : undefined;
  return `${event?.name ?? "Match"} · ${fixture.sectionA} ${fixture.scoreA}–${fixture.scoreB} ${fixture.sectionB} · ${input.event?.label ?? input.action}${sideLabel ? ` · ${sideLabel}` : ""}${playerName ? ` · ${playerName}` : ""}${input.event ? ` · ${input.event.points} point${input.event.points === 1 ? "" : "s"}` : ""}${input.event?.detail ? ` · ${input.event.detail}` : ""}`;
}
