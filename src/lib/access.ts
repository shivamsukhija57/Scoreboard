import { redirect } from "next/navigation";
import { auth } from "../../auth";
import type { CompetitionData, Role, RoleAssignment, UserAccess } from "./domain";
import { readCompetition } from "./store";
import { auditForRole, canScoreEvent } from "./live-scoring-utils";

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
  return {
    ...data,
    assignments: central ? data.assignments : [],
    audit: auditForRole(data.audit ?? [], central),
    entries: publicGuest ? [] : data.entries,
    fixtures: central ? data.fixtures : data.fixtures.map((fixture) => ({ ...fixture, scorecard: fixture.scorecard && !managedEvents.has(fixture.eventId) ? { ...fixture.scorecard, events: fixture.scorecard.events.map((event) => ({ ...event, playerId: undefined, secondaryPlayerId: undefined, actor: "Organizer" })) } : fixture.scorecard })),
    participants: publicGuest ? [] : data.participants.map((participant) => ({
      ...participant,
      studentId: central || managedSections.has(participant.sectionId) ? participant.studentId : "",
    })),
  };
}
