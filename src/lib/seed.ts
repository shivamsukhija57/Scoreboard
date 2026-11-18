import type { CompetitionData } from "./domain";
import { rulebookEvents, rulebookSections, rulebookSports } from "./rulebook-data";

export function createSeedData(): CompetitionData {
  return {
    name: "Division Wars",
    edition: "First-year edition",
    sections: rulebookSections.map((section) => ({ ...section })),
    sports: rulebookSports.map((sport) => ({ ...sport, participationNotes: [...sport.participationNotes] })),
    events: rulebookEvents.map((event) => ({
      ...event,
      rosterRules: [...event.rosterRules],
      scoringRules: [...event.scoringRules],
      pointsPolicy: { ...event.pointsPolicy, places: [...event.pointsPolicy.places], pointsByOutcome: event.pointsPolicy.pointsByOutcome ? { ...event.pointsPolicy.pointsByOutcome } : undefined },
      headEmails: [],
    })),
    participants: [],
    entries: [],
    fixtures: [],
    assignments: [
      { email: "pgp26.shivams@spjimr.org", role: "central-admin", active: true },
    ],
    audit: [],
  };
}
