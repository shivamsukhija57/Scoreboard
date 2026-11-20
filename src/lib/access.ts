import { redirect } from "next/navigation";
import { auth } from "../../auth";
import type { CompetitionData, Role, RoleAssignment, UserAccess } from "./domain";
import { readCompetition } from "./store";
import { auditForRole, canScoreEvent } from "./live-scoring-utils";
import { canJudgeEvent, presentJudging } from "./judging";

export async function getUserAccess(): Promise<UserAccess | null> {
  const session = await auth();
  const email = session?.user?.email?.trim().toLowerCase();
  if (!email) {
    if (process.env.NODE_ENV !== "production" && process.env.DEMO_MODE === "true") {
      return {
        email: "preview@spjimr.org",
        name: "Local preview",
        assignments: [{ email: "preview@spjimr.org", role: "central-admin", active: true }],
      };
    }
    if (process.env.REQUIRE_SIGN_IN === "true") return null;
    return {
      email: "guest@public.invalid",
      name: "Guest spectator",
      assignments: [{ email: "guest@public.invalid", role: "spectator", active: true }],
    };
  }

  const data = await readCompetition();
  const assignments: RoleAssignment[] = data.assignments.filter(
    (assignment) => assignment.active && assignment.email.toLowerCase() === email,
  );
  assignments.unshift({ email, role: "spectator", active: true });
  return {
    email,
    name: session?.user?.name?.trim() || email,
    assignments,
  };
}

export function hasRole(access: UserAccess, role: Role, scopeId?: string): boolean {
  return access.assignments.some((assignment) => {
    if (assignment.role === "central-admin") return true;
    if (assignment.role !== role) return false;
    return !scopeId || !assignment.scopeId || assignment.scopeId === scopeId || scopeId.startsWith(`${assignment.scopeId}-`);
  });
}

export async function requireAccess(): Promise<UserAccess> {
  const access = await getUserAccess();
  if (!access) redirect("/login");
  return access;
}

export function canManageSection(access: UserAccess, sectionId: string): boolean {
  return hasRole(access, "section-admin", sectionId);
}

export function canManageEvent(access: UserAccess, eventId: string): boolean {
  return canScoreEvent(access.assignments, eventId);
}

export function canSchedule(access: UserAccess): boolean {
  return hasRole(access, "scheduler");
}

export function isCentralAdmin(access: UserAccess): boolean {
  return hasRole(access, "central-admin");
}

export function presentCompetition(data: CompetitionData, access: UserAccess): CompetitionData {
  const central = isCentralAdmin(access);
  const publicGuest = access.email === "guest@public.invalid";
  const managedEvents = new Set(access.assignments.filter((assignment) => assignment.role === "event-head").map((assignment) => assignment.scopeId));
  const managedSections = new Set(access.assignments.filter((assignment) => assignment.role === "section-admin").map((assignment) => assignment.scopeId));
  // Organizer emails are only for the central admins; everyone else sees "Organizer". Guests also lose player names.
  const hideEmails = (text?: string) => text?.replace(/[^\s@<>()]+@[^\s@<>()]+/g, "an organizer");
  const presentFixture = (fixture: CompetitionData["fixtures"][number]) => {
    const scorer = managedEvents.has(fixture.eventId);
    const scorecard = fixture.scorecard && {
      ...fixture.scorecard,
      events: fixture.scorecard.events.map((event) => ({
        ...event,
        ...(scorer ? {} : { playerId: undefined, secondaryPlayerId: undefined }),
        ...(publicGuest ? { playerName: undefined, secondaryPlayerName: undefined } : {}),
        actor: "Organizer",
      })),
      cricket: fixture.scorecard.cricket && { innings: fixture.scorecard.cricket.innings.map((innings) => ({ ...innings, deliveries: innings.deliveries.map((delivery) => ({ ...delivery, actor: "Organizer", correctionReason: hideEmails(delivery.correctionReason) })) })) },
    };
    return { ...fixture, scorecard, tieBreak: fixture.tieBreak && { ...fixture.tieBreak, by: "Organizer", note: hideEmails(fixture.tieBreak.note) }, resultSubmittedBy: undefined, resultFinalizedBy: undefined, resultReviewedBy: undefined, resultReviewNote: hideEmails(fixture.resultReviewNote) };
  };
  return {
    ...data,
    assignments: central ? data.assignments : [],
    audit: auditForRole(data.audit ?? [], central),
    entries: publicGuest ? [] : data.entries,
    events: central ? data.events : data.events.map((event) => ({ ...event, headEmails: [] })),
    bonusAwards: central ? data.bonusAwards : data.bonusAwards?.map((bonus) => ({ ...bonus, awardedBy: "Organizer" })),
    champion: central || !data.champion ? data.champion : { ...data.champion, announcedBy: "Organizer" },
    fixtures: central ? data.fixtures : data.fixtures.map(presentFixture),
    // Live quiz and hunt tallies are public (they show on the event page); who scored each entry is not.
    // Judged Stage events stay sealed: judges see only their own marks, coordinators everything, others the announced result.
    judging: presentJudging(data.judging, { email: access.email, central, coordinates: (eventId) => canScoreEvent(access.assignments, eventId), judges: (eventId) => canJudgeEvent(access.assignments, eventId) }),
    tallies: central || !data.tallies ? data.tallies : Object.fromEntries(Object.entries(data.tallies).map(([id, tally]) => [id, { ...tally, entries: tally.entries.map((entry) => ({ ...entry, by: "Organizer", reverseReason: hideEmails(entry.reverseReason) })) }])),
    participants: publicGuest ? [] : data.participants.map((participant) => ({
      ...participant,
      studentId: central || managedSections.has(participant.sectionId) ? participant.studentId : "",
    })),
  };
}
