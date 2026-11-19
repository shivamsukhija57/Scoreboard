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
  standingsTieBreakers?: string[];
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
  scoringConfig?: SportScoringConfig;
  pointsPolicy: PointsPolicy;
  headEmails: string[];
}

export interface SportScoringConfig {
  inningsCount?: number;
  oversPerInnings?: number;
  wicketsPerInnings?: number;
  pointsPerSet?: number;
  setsToWin?: number;
  pointsToWin?: number;
  winBy?: number;
  periods?: number;
  periodMinutes?: number;
  enabledActions?: MatchEventKind[];
}

export interface Fixture {
  id: string;
  eventId: string;
  sectionA: SectionId;
  sectionB: SectionId;
  startsAt: string;
  durationMinutes: number;
  venue: string;
  stage?: "league" | "semifinal" | "final" | "other";
  noResult?: boolean;
  status: MatchStatus;
  scoreA: number;
  scoreB: number;
  periodLabel: string;
  clockLabel: string;
  resultConfirmed: boolean;
  resultSubmittedAt?: string;
  resultSubmittedBy?: string;
  resultFinalizedAt?: string;
  resultFinalizedBy?: string;
  resultReviewedAt?: string;
  resultReviewedBy?: string;
  resultReviewNote?: string;
  awardedPointsA?: number;
  awardedPointsB?: number;
  scorecard?: MatchScorecard;
  updatedAt: string;
}

export type MatchEventKind = "run" | "extra" | "wicket" | "goal" | "yellow-card" | "red-card" | "substitution" | "basket" | "free-throw" | "foul" | "rally-point" | "point" | "set-point" | "frame-point" | "score";

export interface MatchEvent {
  id: string;
  kind: MatchEventKind;
  side: "a" | "b";
  points: number;
  playerId?: string;
  playerName?: string;
  secondaryPlayerId?: string;
  secondaryPlayerName?: string;
  label?: string;
  detail?: string;
  period: string;
  overBall?: string;
  legalDelivery?: boolean;
  reversedAt?: string;
  reversesEventId?: string;
  actor: string;
  createdAt: string;
}

export interface MatchScorecard {
  innings: number;
  legalBalls: number;
  legalBallsA: number;
  legalBallsB: number;
  wicketsA: number;
  wicketsB: number;
  baselineScoreA: number;
  baselineScoreB: number;
  setsA: number;
  setsB: number;
  currentGameA: number;
  currentGameB: number;
  pointsA: number;
  pointsB: number;
  playerStats: Record<string, Record<string, number>>;
  events: MatchEvent[];
  cricket?: CricketMatchCard;
}

export type CricketExtra = "none" | "wide" | "no-ball" | "bye" | "leg-bye" | "penalty";
export type CricketDismissal = "bowled" | "caught" | "lbw" | "run-out" | "stumped" | "hit-wicket" | "retired-hurt" | "other";
export interface CricketDelivery {
  id: string; over: number; ball: number; battingSide: "a" | "b"; batterId: string; nonStrikerId: string; bowlerId: string;
  batRuns: number; extraType: CricketExtra; extraRuns: number; legal: boolean;
  wicket?: { kind: CricketDismissal; playerOutId: string; fielderId?: string };
  createdAt: string; actor: string; reversedAt?: string; correctionReason?: string;
}
export interface CricketInnings {
  number: number; battingSide: "a" | "b"; deliveries: CricketDelivery[]; strikerId: string; nonStrikerId: string; bowlerId: string;
  openingStrikerId?: string; openingNonStrikerId?: string;
  completed?: boolean; completionReason?: string;
}
export interface CricketMatchCard { innings: CricketInnings[]; }

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
  action: "start" | "increment-a" | "increment-b" | "decrement-a" | "decrement-b" | "record-event" | "reverse-event" | "submit" | "reopen" | "cricket-delivery" | "cricket-start-innings" | "cricket-end-innings" | "cricket-correct-delivery";
  pointsA?: number;
  pointsB?: number;
  event?: Omit<MatchEvent, "id" | "actor" | "createdAt" | "period"> & { period?: string };
  eventId?: string;
  correctionReason?: string;
  reviewNote?: string;
  cricketDelivery?: Omit<CricketDelivery, "id" | "createdAt" | "actor" | "over" | "ball" | "legal">;
  cricketInnings?: Omit<CricketInnings, "number" | "deliveries">;
}
