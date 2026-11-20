export const ROLES = [
  "spectator",
  "section-admin",
  "event-head",
  "scheduler",
  "central-admin",
  "judge",
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
  /** The colour lifted for thin marks on the dark UI; falls back to `color`. */
  line?: string;
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

/** How an event turns results into division points (2026 rulebooks). */
export type PointsFormat = "league" | "chit-ring" | "ring-group" | "placings";

export interface PointsPolicy {
  id: string;
  name: string;
  places: number[];
  published: boolean;
  version: number;
  pointsByOutcome?: Record<string, number>;
  /** League, chit-ring and ring-group events pay in units of X; placings events use `places`. */
  format?: PointsFormat;
  /** X, the event's match-win value. */
  unit?: number;
}

/**
 * Points that don't come from one two-sided fixture: the table-topper bonus, and the finishing places of
 * placings events (athletics, cultural), where every division is ranked at once.
 */
export interface BonusAward {
  id: string;
  eventId: string;
  sectionId: SectionId;
  kind: "table-topper" | "placing";
  /** For placings: 1 for first, 2 for second, and so on. */
  place?: number;
  points: number;
  note?: string;
  awardedAt: string;
  awardedBy: string;
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
  /** Score recorded for the side that turned up when the other doesn't (e.g. football 3, volleyball 25); 0 records the win only. */
  walkoverScore?: number;
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
  /** Ring-group events: the group this match belongs to. Each division's team N plays in group N. */
  group?: 1 | 2;
  /** Ring-group events: which of the division's teams plays (1 or 2). Lets a division's two teams meet in a semifinal. */
  entryA?: number;
  entryB?: number;
  noResult?: boolean;
  /** Set when the other side didn't turn up within 10 minutes; walkovers are left out of net run rate and score difference. */
  walkoverWinner?: "a" | "b";
  /**
   * Cricket only: who won a match level after both innings. "super-over" is set from innings 3 and 4;
   * "bowl-out" is recorded by a central admin when the Super Over is also level. Scores stay as played.
   */
  tieBreak?: { winner: "a" | "b"; method: "super-over" | "bowl-out"; note?: string; at: string; by: string };
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
  notices?: ScheduleNotice[];
  bonusAwards?: BonusAward[];
  /** Set by the central admin at the closing ceremony; plays the champion moment once for everyone. */
  champion?: { sectionId: SectionId; announcedAt: string; announcedBy: string; note?: string };
  /** Rulebook edition the event definitions were last brought in line with. */
  rulebookEdition?: string;
  /** Division names and colours the stored sections were last brought in line with. */
  divisionIdentity?: string;
  /** Live running tallies for placings events scored as they happen (quiz, treasure hunt), keyed by event id. */
  tallies?: Record<string, EventTally>;
  /** Judged Stage events: settings, judges' sealed marks, penalties and the announced result, keyed by event id. */
  judging?: Record<string, EventJudging>;
}

/** Judges mark on their phones, or the coordinator types each division's final total. */
export type JudgingMethod = "judges" | "entry";
/** How judges' marks combine into a division's score: the average of the judges who submitted, or their sum. */
export type JudgingCombine = "average" | "sum";

export interface JudgingCriterion { id: string; name: string; max: number }

/** One judge's marks for one division: `scores[item][criterion]` (items are participants or artworks; usually one). */
export interface JudgeSheet {
  judge: string;
  sectionId: SectionId;
  scores: number[][];
  comment?: string;
  submittedAt: string;
}

export type JudgingPenaltyKind = "marks" | "percent" | "disqualify";

export interface JudgingPenalty {
  id: string;
  sectionId: SectionId;
  kind: JudgingPenaltyKind;
  /** Marks off, or percent off; 0 for a disqualification. */
  value: number;
  reason: string;
  by: string;
  at: string;
}

/** What everyone sees once results are announced: each division's final mark and place. Per-judge marks stay private. */
export interface AnnouncedRow {
  sectionId: SectionId;
  place?: number;
  points: number;
  /** Judges' combined score before penalties. */
  score: number | null;
  final: number | null;
  penalty?: string;
  disqualified: boolean;
  /** Combined marks per criterion (same order as the criteria), when known. */
  criteria?: number[];
}

export interface EventJudging {
  eventId: string;
  method: JudgingMethod;
  criteria: JudgingCriterion[];
  judgeCount: number;
  /** Marked units per division: 1 for a performance; Poetry participants; Colour Roulette artworks. */
  items: number;
  itemLabel?: string;
  combine: JudgingCombine;
  /** Performance order. */
  order: SectionId[];
  /** Judges in the order they first marked (Judge 1, Judge 2, …). */
  judges: string[];
  sheets: JudgeSheet[];
  penalties: JudgingPenalty[];
  /** Score entry: each division's final judges' total, typed by the coordinator. */
  entered?: Partial<Record<SectionId, { total: number; criteria?: number[] }>>;
  announced?: { at: string; by: string; note?: string; rows: AnnouncedRow[] };
  updatedAt: string;
}

/** Quiz marks, announced before the quiz (2026 cultural rulebook: bounce and pounce). */
export interface QuizMarking { direct: number; bounce: number; pounceRight: number; pounceWrong: number }

/** A treasure-hunt milestone; `points[0]` goes to the first team to arrive, `points[1]` to the second, and so on. */
export interface HuntMilestone { id: string; name: string; points: number[] }

export type TallyEntryKind = "direct" | "bounce" | "pounce-right" | "pounce-wrong" | "arrival";

export interface TallyEntry {
  id: string;
  sectionId: SectionId;
  kind: TallyEntryKind;
  /** Points as awarded when recorded (marks can't change once scoring starts). */
  points: number;
  /** Quiz: the question this was scored on. */
  question?: number;
  /** Hunt: the milestone reached, and the place it arrived in. */
  milestoneId?: string;
  place?: number;
  by: string;
  at: string;
  reversedAt?: string;
  reverseReason?: string;
}

export interface EventTally {
  eventId: string;
  kind: "quiz" | "hunt";
  quiz?: QuizMarking;
  milestones?: HuntMilestone[];
  /** Quiz: the question being played, 1 to 30. */
  question?: number;
  entries: TallyEntry[];
  updatedAt: string;
}

export interface ScheduleNotice {
  id: string;
  /** Calendar day in Asia/Kolkata, YYYY-MM-DD. The notice is shown only on this day. */
  day: string;
  venue: string;
  minutes: number;
  reason: string;
  createdAt: string;
}

export interface UserAccess {
  email: string;
  name: string;
  assignments: RoleAssignment[];
}

export interface MatchScoreInput {
  action: "start" | "increment-a" | "increment-b" | "decrement-a" | "decrement-b" | "record-event" | "reverse-event" | "submit" | "reopen" | "walkover" | "cricket-delivery" | "cricket-start-innings" | "cricket-end-innings" | "cricket-correct-delivery" | "cricket-bowl-out";
  /** For "cricket-bowl-out": the side that won the bowl-out (central admin only). */
  tieBreakWinner?: "a" | "b";
  /** For "walkover": the side that turned up. */
  walkoverWinner?: "a" | "b";
  pointsA?: number;
  pointsB?: number;
  event?: Omit<MatchEvent, "id" | "actor" | "createdAt" | "period"> & { period?: string };
  eventId?: string;
  correctionReason?: string;
  reviewNote?: string;
  cricketDelivery?: Omit<CricketDelivery, "id" | "createdAt" | "actor" | "over" | "ball" | "legal">;
  cricketInnings?: Omit<CricketInnings, "number" | "deliveries">;
}
