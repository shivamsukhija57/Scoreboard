import { NextResponse } from "next/server";
import { canSchedule, getUserAccess, isCentralAdmin } from "@/lib/access";
import type { SectionId } from "@/lib/domain";
import { updateCompetition } from "@/lib/store";

/** Remove a fixture that hasn't started. Started or finished matches hold scores and points, so they can't be deleted. */
export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const access = await getUserAccess();
  if (!access) return NextResponse.json({ error: "Sign in to delete this fixture." }, { status: 401 });
  if (!isCentralAdmin(access) && !canSchedule(access)) return NextResponse.json({ error: "Scheduling access is required." }, { status: 403 });
  const { id } = await context.params;
  let detail = `Deleted fixture ${id}`;
  const result = await updateCompetition(access.email, "fixture-delete", () => detail, id, (data) => {
    const index = data.fixtures.findIndex((item) => item.id === id);
    if (index < 0) return { error: "Fixture not found.", status: 404 };
    const fixture = data.fixtures[index];
    if (fixture.status !== "scheduled") return { error: "This match has already started, so it can't be deleted. Its result stays on record.", status: 409 };
    detail = JSON.stringify({ deleted: { eventId: fixture.eventId, sectionA: fixture.sectionA, sectionB: fixture.sectionB, startsAt: fixture.startsAt, venue: fixture.venue } });
    data.fixtures.splice(index, 1);
    return { ok: true };
  });
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(result);
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const access = await getUserAccess();
  if (!access) return NextResponse.json({ error: "Sign in to change this fixture." }, { status: 401 });
  if (!isCentralAdmin(access) && !canSchedule(access)) return NextResponse.json({ error: "Scheduling access is required." }, { status: 403 });
  const { id } = await context.params;
  const body = (await request.json()) as {
    eventId: string;
    sectionA: SectionId;
    sectionB: SectionId;
    startsAt: string;
    durationMinutes: number;
    venue: string;
    stage?: "league" | "semifinal" | "final" | "other";
    acknowledgeConflict?: boolean;
  };
  if (!body.eventId || !body.startsAt || !body.venue || !Number.isFinite(body.durationMinutes) || body.durationMinutes <= 0) {
    return NextResponse.json({ error: "Event, time, venue, and a positive duration are required." }, { status: 400 });
  }
  if (body.sectionA === body.sectionB) return NextResponse.json({ error: "Choose two different divisions." }, { status: 400 });
  if (Number.isNaN(new Date(body.startsAt).getTime())) return NextResponse.json({ error: "Choose a valid date and time." }, { status: 400 });
  if (typeof body.venue !== "string" || body.venue.length > 120 || body.durationMinutes > 24 * 60) return NextResponse.json({ error: "Venue is limited to 120 characters and duration to 24 hours." }, { status: 400 });
  if (body.stage !== undefined && !["league", "semifinal", "final", "other"].includes(body.stage)) return NextResponse.json({ error: "Choose a valid stage." }, { status: 400 });

  let changeDetail = `Updated fixture ${id}`;
  const result = await updateCompetition(access.email, "fixture-change", () => changeDetail, id, (data) => {
    const fixture = data.fixtures.find((item) => item.id === id);
    if (!fixture) return { error: "Fixture not found.", status: 404 };
    if (!data.events.some((event) => event.id === body.eventId)) return { error: "Choose a valid event.", status: 400 };
    if (![body.sectionA, body.sectionB].every((sectionId) => data.sections.some((section) => section.id === sectionId))) return { error: "Choose two valid divisions.", status: 400 };
    // Once a match has started, who played and in what event is history: changing it would move awarded points.
    // Time and venue can still be corrected; a wrong result goes through the central admin's reopen flow instead.
    const identityChanged = fixture.eventId !== body.eventId || fixture.sectionA !== body.sectionA || fixture.sectionB !== body.sectionB || (body.stage !== undefined && (fixture.stage ?? "league") !== body.stage);
    if (identityChanged && fixture.status !== "scheduled") return { error: "This match has started, so its divisions, event and stage are fixed. Reopen the result from the scoring audit to correct it.", status: 409 };
    const start = new Date(body.startsAt).getTime();
    const end = start + body.durationMinutes * 60_000;
    const conflicts = data.fixtures.filter((other) => {
      if (other.id === id) return false;
      const otherStart = new Date(other.startsAt).getTime();
      const otherEnd = otherStart + other.durationMinutes * 60_000;
      const overlaps = start < otherEnd && end > otherStart;
      const sameVenue = other.venue.trim().toLowerCase() === body.venue.trim().toLowerCase();
      const sameSection = [other.sectionA, other.sectionB].some((section) => [body.sectionA, body.sectionB].includes(section));
      return overlaps && (sameVenue || sameSection);
    });
    if (conflicts.length && !body.acknowledgeConflict) {
      return { conflict: conflicts.map(({ id: conflictId, venue, startsAt }) => ({ id: conflictId, venue, startsAt })) };
    }
    const before = { eventId: fixture.eventId, sectionA: fixture.sectionA, sectionB: fixture.sectionB, startsAt: fixture.startsAt, durationMinutes: fixture.durationMinutes, venue: fixture.venue };
    fixture.eventId = body.eventId;
    fixture.sectionA = body.sectionA;
    fixture.sectionB = body.sectionB;
    fixture.startsAt = new Date(body.startsAt).toISOString();
    fixture.durationMinutes = body.durationMinutes;
    fixture.venue = body.venue.trim();
    fixture.stage = body.stage ?? fixture.stage ?? "league";
    fixture.updatedAt = new Date().toISOString();
    changeDetail = JSON.stringify({ before, after: { eventId: fixture.eventId, sectionA: fixture.sectionA, sectionB: fixture.sectionB, startsAt: fixture.startsAt, durationMinutes: fixture.durationMinutes, venue: fixture.venue }, acknowledgedConflicts: conflicts.length });
    return { fixture, conflicts: conflicts.length };
  });
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
  if ("conflict" in result) return NextResponse.json({ error: "This fixture overlaps another venue or division booking.", conflicts: result.conflict }, { status: 409 });
  return NextResponse.json(result);
}
