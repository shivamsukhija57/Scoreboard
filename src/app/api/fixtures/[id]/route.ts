import { NextResponse } from "next/server";
import { canSchedule, getUserAccess, isCentralAdmin } from "@/lib/access";
import type { SectionId } from "@/lib/domain";
import { updateCompetition } from "@/lib/store";

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
    acknowledgeConflict?: boolean;
  };
  if (!body.eventId || !body.startsAt || !body.venue || !Number.isFinite(body.durationMinutes) || body.durationMinutes <= 0) {
    return NextResponse.json({ error: "Event, time, venue, and a positive duration are required." }, { status: 400 });
  }
  if (body.sectionA === body.sectionB) return NextResponse.json({ error: "Choose two different sections." }, { status: 400 });

  let changeDetail = `Updated fixture ${id}`;
  const result = await updateCompetition(access.email, "fixture-change", () => changeDetail, id, (data) => {
    const fixture = data.fixtures.find((item) => item.id === id);
    if (!fixture) return { error: "Fixture not found.", status: 404 };
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
    fixture.updatedAt = new Date().toISOString();
    changeDetail = JSON.stringify({ before, after: { eventId: fixture.eventId, sectionA: fixture.sectionA, sectionB: fixture.sectionB, startsAt: fixture.startsAt, durationMinutes: fixture.durationMinutes, venue: fixture.venue }, acknowledgedConflicts: conflicts.length });
    return { fixture, conflicts: conflicts.length };
  });
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
  if ("conflict" in result) return NextResponse.json({ error: "This fixture overlaps another venue or section booking.", conflicts: result.conflict }, { status: 409 });
  return NextResponse.json(result);
}
