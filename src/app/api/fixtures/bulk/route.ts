import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { canSchedule, getUserAccess, isCentralAdmin } from "@/lib/access";
import type { Fixture, SectionId } from "@/lib/domain";
import { bookingDescriber, findClashes } from "@/lib/schedule-tools";
import { updateCompetition } from "@/lib/store";

interface BulkFixtureInput { sectionA: SectionId; sectionB: SectionId; startsAt: string; durationMinutes: number; venue: string }

/** Creates several league fixtures for one event at once, e.g. from the round-robin generator. */
export async function POST(request: Request) {
  const access = await getUserAccess();
  if (!access) return NextResponse.json({ error: "Sign in to schedule fixtures." }, { status: 401 });
  if (!isCentralAdmin(access) && !canSchedule(access)) return NextResponse.json({ error: "Scheduling access is required." }, { status: 403 });

  const body = (await request.json()) as { eventId?: string; fixtures?: BulkFixtureInput[]; acknowledgeConflict?: boolean; group?: 1 | 2 };
  if (body.group !== undefined && body.group !== 1 && body.group !== 2) return NextResponse.json({ error: "Group must be 1 or 2." }, { status: 400 });
  const group = body.group;
  const items = Array.isArray(body.fixtures) ? body.fixtures : [];
  if (!body.eventId || !items.length) return NextResponse.json({ error: "Choose an event and at least one fixture." }, { status: 400 });
  if (items.length > 60) return NextResponse.json({ error: "Publish at most 60 fixtures at a time." }, { status: 400 });
  for (const item of items) {
    if (!item.sectionA || !item.sectionB || item.sectionA === item.sectionB) return NextResponse.json({ error: "Each fixture needs two different divisions." }, { status: 400 });
    if (!item.venue?.trim() || Number.isNaN(new Date(item.startsAt).getTime()) || !Number.isFinite(item.durationMinutes) || item.durationMinutes <= 0) {
      return NextResponse.json({ error: "Each fixture needs a valid time, venue, and positive duration." }, { status: 400 });
    }
  }

  const eventId = body.eventId;
  const result = await updateCompetition(access.email, "fixture-bulk-create", () => `Generated ${items.length} fixtures for ${eventId}`, eventId, (data) => {
    if (!data.events.some((event) => event.id === eventId)) return { error: "Event not found.", status: 404 };
    const sectionIds = new Set(data.sections.map((section) => section.id));
    if (items.some((item) => !sectionIds.has(item.sectionA) || !sectionIds.has(item.sectionB))) return { error: "Unknown division in the generated fixtures.", status: 400 };
    const describe = bookingDescriber(data);
    const drafts = items.map((item, index) => ({ id: `draft-${index}`, eventId, sectionA: item.sectionA, sectionB: item.sectionB, startsAt: new Date(item.startsAt).toISOString(), durationMinutes: Math.round(item.durationMinutes), venue: item.venue.trim() }));
    const conflicts = drafts.flatMap((draft) => findClashes(draft, [...data.fixtures, ...drafts], describe).map((clash) => ({ ...clash, fixture: describe(draft) })));
    if (conflicts.length && !body.acknowledgeConflict) return { conflict: conflicts };

    const now = new Date().toISOString();
    const created: Fixture[] = drafts.map((draft) => ({
      id: randomUUID(), eventId, sectionA: draft.sectionA, sectionB: draft.sectionB, startsAt: draft.startsAt, durationMinutes: draft.durationMinutes, venue: draft.venue,
      stage: "league", ...(group ? { group, entryA: group, entryB: group } : {}), status: "scheduled", scoreA: 0, scoreB: 0, periodLabel: "Not started", clockLabel: "—", resultConfirmed: false, updatedAt: now,
    }));
    data.fixtures.push(...created);
    return { fixtures: created, conflicts: conflicts.length };
  });

  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
  if ("conflict" in result) return NextResponse.json({ error: "Some generated fixtures overlap another venue or division booking.", conflicts: result.conflict }, { status: 409 });
  return NextResponse.json(result, { status: 201 });
}
