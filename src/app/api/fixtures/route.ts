import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { canSchedule, getUserAccess, isCentralAdmin } from "@/lib/access";
import type { Fixture, SectionId } from "@/lib/domain";
import { updateCompetition } from "@/lib/store";

export async function POST(request: Request) {
  const access = await getUserAccess();
  if (!access) return NextResponse.json({ error: "Sign in to schedule an event." }, { status: 401 });
  if (!isCentralAdmin(access) && !canSchedule(access)) {
    return NextResponse.json({ error: "Scheduling access is required." }, { status: 403 });
  }

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

  const result = await updateCompetition(access.email, "fixture-create", `Created ${body.eventId} fixture`, "schedule", (data) => {
    const start = new Date(body.startsAt).getTime();
    const end = start + body.durationMinutes * 60_000;
    const conflicts = data.fixtures.filter((fixture) => {
      const otherStart = new Date(fixture.startsAt).getTime();
      const otherEnd = otherStart + fixture.durationMinutes * 60_000;
      const overlaps = start < otherEnd && end > otherStart;
      const sameVenue = fixture.venue.trim().toLowerCase() === body.venue.trim().toLowerCase();
      const sameSection = [fixture.sectionA, fixture.sectionB].some((section) => [body.sectionA, body.sectionB].includes(section));
      return overlaps && (sameVenue || sameSection);
    });
    if (conflicts.length && !body.acknowledgeConflict) {
      return { conflict: conflicts.map(({ id, venue, startsAt }) => ({ id, venue, startsAt })) };
    }

    const fixture: Fixture = {
      id: randomUUID(),
      eventId: body.eventId,
      sectionA: body.sectionA,
      sectionB: body.sectionB,
      startsAt: new Date(body.startsAt).toISOString(),
      durationMinutes: body.durationMinutes,
      venue: body.venue.trim(),
      status: "scheduled",
      scoreA: 0,
      scoreB: 0,
      periodLabel: "Not started",
      clockLabel: "—",
      resultConfirmed: false,
      updatedAt: new Date().toISOString(),
    };
    data.fixtures.push(fixture);
    return { fixture, conflicts: conflicts.length };
  });

  if ("conflict" in result) return NextResponse.json({ error: "This fixture overlaps another venue or section booking.", conflicts: result.conflict }, { status: 409 });
  return NextResponse.json(result, { status: 201 });
}
