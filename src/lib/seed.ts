import type { CompetitionData, EventDefinition, Sport } from "./domain";
// Explicit extensions so the Node test runner (type stripping) can load this module too.
import { fixtureAwards, fixtureOutcome } from "./points-rules.ts";
import { DIVISION_IDENTITY, RULEBOOK_EDITION, rulebookEvents, rulebookSections, rulebookSports } from "./rulebook-data.ts";

/** Brings stored divisions to their current names and colours. Ids, caps and every result stay as they are. */
export function applyDivisionIdentity(data: CompetitionData): void {
  if (data.divisionIdentity === DIVISION_IDENTITY) return;
  for (const fresh of rulebookSections) {
    const section = data.sections.find((item) => item.id === fresh.id);
    if (!section) continue;
    Object.assign(section, { name: fresh.name, shortName: fresh.shortName, code: fresh.code, color: fresh.color, accent: fresh.accent, line: fresh.line });
  }
  data.divisionIdentity = DIVISION_IDENTITY;
  data.audit ??= [];
  data.audit.unshift({ id: `division-identity-${DIVISION_IDENTITY}`, at: new Date().toISOString(), actor: "system-migration", action: "division-identity-applied", detail: `Divisions renamed and recoloured: ${rulebookSections.map((item) => item.name).join(", ")}`, entityId: "divisions" });
}

const cloneEvent = (event: EventDefinition): EventDefinition => ({
  ...event,
  rosterRules: [...event.rosterRules],
  scoringRules: [...event.scoringRules],
  scoringConfig: event.scoringConfig ? { ...event.scoringConfig } : undefined,
  pointsPolicy: { ...event.pointsPolicy, places: [...event.pointsPolicy.places], pointsByOutcome: event.pointsPolicy.pointsByOutcome ? { ...event.pointsPolicy.pointsByOutcome } : undefined },
  headEmails: [],
});
const cloneSport = (sport: Sport): Sport => ({ ...sport, participationNotes: [...sport.participationNotes], standingsTieBreakers: sport.standingsTieBreakers ? [...sport.standingsTieBreakers] : undefined });

export function createSeedData(): CompetitionData {
  return {
    name: "Division Wars",
    edition: "First-year edition",
    sections: rulebookSections.map((section) => ({ ...section })),
    sports: rulebookSports.map(cloneSport),
    events: rulebookEvents.map(cloneEvent),
    participants: [],
    entries: [],
    fixtures: [],
    assignments: [
      { email: "pgp26.shivams@spjimr.org", role: "central-admin", active: true },
    ],
    audit: [],
    bonusAwards: [],
    rulebookEdition: RULEBOOK_EDITION,
    divisionIdentity: DIVISION_IDENTITY,
  };
}

/**
 * Brings stored competition data in line with the current rulebook edition once: event names, formats, points,
 * walkover scores and tie-break orders. Roster entries, fixtures, people and event heads are kept, and finalized
 * results are re-awarded under the new points. Runs on read (idempotent) and is saved with the next change, after
 * which central-admin edits to the rules are left alone.
 */
export function applyRulebookEdition(data: CompetitionData): void {
  applyDivisionIdentity(data);
  if (data.rulebookEdition === RULEBOOK_EDITION) return;
  for (const fresh of rulebookSports) {
    const sport = data.sports.find((item) => item.id === fresh.id);
    if (!sport) { data.sports.push(cloneSport(fresh)); continue; }
    sport.name = fresh.name;
    sport.participationNotes = [...fresh.participationNotes];
    sport.standingsTieBreakers = fresh.standingsTieBreakers ? [...fresh.standingsTieBreakers] : undefined;
  }
  for (const fresh of rulebookEvents) {
    const event = data.events.find((item) => item.id === fresh.id);
    if (!event) { data.events.push(cloneEvent(fresh)); continue; }
    const next = cloneEvent(fresh);
    event.name = next.name;
    event.format = next.format;
    event.entriesPerDivision = next.entriesPerDivision;
    event.tournamentFormat = next.tournamentFormat;
    event.matchCount = next.matchCount;
    event.rosterRules = next.rosterRules;
    event.scoringRules = next.scoringRules;
    event.scoringConfig = { ...(event.scoringConfig ?? {}), ...(next.scoringConfig?.walkoverScore !== undefined ? { walkoverScore: next.scoringConfig.walkoverScore } : {}) };
    event.pointsPolicy = { ...next.pointsPolicy, version: (event.pointsPolicy?.version ?? 0) + 1 };
  }
  let reawarded = 0;
  for (const fixture of data.fixtures) {
    if (fixture.status !== "completed" || !fixture.resultConfirmed) continue;
    const event = data.events.find((item) => item.id === fixture.eventId);
    if (!event || event.pointsPolicy.format === "placings") continue;
    const [a, b] = fixtureAwards(event.pointsPolicy, fixture.stage, fixtureOutcome(fixture));
    if (a !== fixture.awardedPointsA || b !== fixture.awardedPointsB) { fixture.awardedPointsA = a; fixture.awardedPointsB = b; reawarded += 1; }
  }
  data.bonusAwards ??= [];
  data.rulebookEdition = RULEBOOK_EDITION;
  data.audit ??= [];
  data.audit.unshift({
    id: `rulebook-edition-${RULEBOOK_EDITION}`,
    at: new Date().toISOString(),
    actor: "system-migration",
    action: "rulebook-edition-applied",
    detail: `Event rules and points updated to the ${RULEBOOK_EDITION} rulebooks${reawarded ? ` · ${reawarded} finalized result${reawarded === 1 ? "" : "s"} re-awarded` : ""}`,
    entityId: "rulebook",
  });
}
