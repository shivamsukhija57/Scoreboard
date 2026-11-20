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
    stage?: Fixture["stage"];
    /** Ring-group events: group-stage match in group 1 or 2 (each division's team N plays in group N). */
    group?: 1 | 2;
    /** Ring-group knockouts: which team of each division plays. */
    entryA?: number;
    entryB?: number;
    acknowledgeConflict?: boolean;
  };
  if (body.group !== undefined && body.group !== 1 && body.group !== 2) return NextResponse.json({ error: "Group must be 1 or 2." }, { status: 400 });
  const entryA = body.group ?? body.entryA;
  const entryB = body.group ?? body.entryB;
  if (!body.eventId || !body.startsAt || !body.venue || !Number.isFinite(body.durationMinutes) || body.durationMinutes <= 0) {
    return NextResponse.json({ error: "Event, time, venue, and a positive duration are required." }, { status: 400 });
  }
  // A division's two teams may only meet in a ring-group knockout (the same-division semifinal rule).
  const sameDivisionKnockout = body.sectionA === body.sectionB && (body.stage === "semifinal" || body.stage === "final") && !body.group && !!entryA && !!entryB && entryA !== entryB;
  if (body.sectionA === body.sectionB && !sameDivisionKnockout) return NextResponse.json({ error: "Choose two different divisions. A division's two teams can only meet in a group-format semifinal; set their team numbers." }, { status: 400 });

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
      stage: body.stage ?? "league",
      ...(body.group ? { group: body.group } : {}),
      ...(entryA ? { entryA } : {}),
      ...(entryB ? { entryB } : {}),
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

  if ("conflict" in result) return NextResponse.json({ error: "This fixture overlaps another venue or division booking.", conflicts: result.conflict }, { status: 409 });
  return NextResponse.json(result, { status: 201 });
}
