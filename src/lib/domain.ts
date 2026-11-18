export const ROLES = [
  "spectator",
  "section-admin",
  "event-head",
  "scheduler",
  "central-admin",
] as const;

export type Role = (typeof ROLES)[number];
export type MatchStatus = "scheduled" | "live" | "awaiting-confirmation" | "completed";
export type SectionId = "s1" | "s2" | "s3" | "s4" | "s5";
export type ParticipantGender = "male" | "female" | "other";
export type GenderEligibility = "men" | "women" | "mixed" | "open";

export interface Section {
  id: SectionId;
  name: string;
  shortName: string;
  code: string;
  color: string;
  accent: string;
  maxSportsPerPlayer: number;
}

export interface RoleAssignment {
  email: string;
  role: Role;
  scopeId?: string;
  scopeLabel?: string;
  active: boolean;
}

export interface Participant {
  id: string;
  name: string;
  studentId: string;
  sectionId: SectionId;
  gender?: ParticipantGender;
}

export interface Entry {
  id: string;
  eventId: string;
  sectionId: SectionId;
  entryNumber?: number;
  participantIds: string[];
  status: "draft" | "submitted";
  updatedAt: string;
}

export interface Sport {
  id: string;
  name: string;
  category: "sport" | "cultural";
  countsTowardOverallSportsCap: boolean;
  maxFormatsPerPlayer: number | null;
  participationNotes: string[];
}

export interface PointsPolicy {
  id: string;
  name: string;
  places: number[];
  published: boolean;
  version: number;
  pointsByOutcome?: Record<string, number>;
}

export interface EventDefinition {
  id: string;
  sportId: string;
  name: string;
  format: string;
  minPlayers: number | null;
  maxPlayers: number | null;
  maxEventsPerPlayer: number | null;
  entriesPerDivision: number;
  substitutePlayers: number;
  genderEligibility: GenderEligibility;
  tournamentFormat: string;
  matchCount: number | null;
  rosterRules: string[];
  scoringRules: string[];
  scoringType: string;
  pointsPolicy: PointsPolicy;
  headEmails: string[];
}

export interface Fixture {
  id: string;
  eventId: string;
  sectionA: SectionId;
  sectionB: SectionId;
  startsAt: string;
  durationMinutes: number;
  venue: string;
  status: MatchStatus;
  scoreA: number;
  scoreB: number;
  periodLabel: string;
  clockLabel: string;
  resultConfirmed: boolean;
  updatedAt: string;
}

export interface AuditEntry {
  id: string;
  at: string;
  actor: string;
  action: string;
  detail: string;
  entityId: string;
}

export interface CompetitionData {
  name: string;
  edition: string;
  sections: Section[];
  sports: Sport[];
  events: EventDefinition[];
  participants: Participant[];
  entries: Entry[];
  fixtures: Fixture[];
  assignments: RoleAssignment[];
  audit: AuditEntry[];
}

export interface UserAccess {
  email: string;
  name: string;
  assignments: RoleAssignment[];
}

export interface MatchScoreInput {
  action: "start" | "increment-a" | "increment-b" | "decrement-a" | "decrement-b" | "submit" | "confirm";
  pointsA?: number;
  pointsB?: number;
}
