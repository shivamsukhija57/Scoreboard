import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { canSchedule, getUserAccess, isCentralAdmin } from "@/lib/access";
import type { Fixture } from "@/lib/domain";
import { semifinalDraw } from "@/lib/points-rules";
import { updateCompetition } from "@/lib/store";

interface Slot { startsAt: string; venue: string }

/**
 * Creates the two semifinals of a ring-group event from its group tables, applying the same-division rule
 * (a division's two teams meet each other in a semifinal). Scheduler or central admin.
 */
export async function POST(request: Request) {
  const access = await getUserAccess();
  if (!access) return NextResponse.json({ error: "Sign in to schedule fixtures." }, { status: 401 });
  if (!isCentralAdmin(access) && !canSchedule(access)) return NextResponse.json({ error: "Scheduling access is required." }, { status: 403 });
  const body = (await request.json()) as { eventId?: string; slots?: Slot[]; durationMinutes?: number };
  const slots = Array.isArray(body.slots) ? body.slots : [];
  if (!body.eventId || slots.length !== 2) return NextResponse.json({ error: "Choose the event and a time and venue for each semifinal." }, { status: 400 });
  if (slots.some((slot) => !slot.venue?.trim() || Number.isNaN(new Date(slot.startsAt).getTime()))) return NextResponse.json({ error: "Each semifinal needs a valid time and venue." }, { status: 400 });
  const duration = Math.round(body.durationMinutes ?? 0);
  if (!Number.isFinite(duration) || duration <= 0) return NextResponse.json({ error: "Give the match length in minutes." }, { status: 400 });

  let detail = "";
  const result = await updateCompetition(access.email, "semifinals-create", () => detail, body.eventId, (data) => {
    const event = data.events.find((item) => item.id === body.eventId);
    if (!event) return { error: "Event not found.", status: 404 };
    const draw = semifinalDraw(data, event);
    if (!draw.eligible) return { error: "Only ring-group events (two teams per division) use this draw.", status: 400 };
    if (!draw.complete) return { error: `The groups aren't finished: ${draw.played} of ${draw.expected} group matches are final.`, status: 400 };
    if (draw.tiedAtCutoff) return { error: "Teams are level for a semifinal place. Settle it as the rulebook says, then add the semifinals by hand.", status: 409 };
    if (data.fixtures.some((fixture) => fixture.eventId === event.id && fixture.stage === "semifinal")) return { error: "This event already has semifinals.", status: 409 };
    const now = new Date().toISOString();
    const created: Fixture[] = draw.semis.map(([a, b], index) => ({
      id: randomUUID(), eventId: event.id, sectionA: a.sectionId, sectionB: b.sectionId, entryA: a.entry, entryB: b.entry,
      startsAt: new Date(slots[index].startsAt).toISOString(), durationMinutes: duration, venue: slots[index].venue.trim(),
      stage: "semifinal", status: "scheduled", scoreA: 0, scoreB: 0, periodLabel: "Not started", clockLabel: "—", resultConfirmed: false, updatedAt: now,
    }));
    data.fixtures.push(...created);
    detail = `${event.name} · semifinals ${created.map((fixture) => `${fixture.sectionA} team ${fixture.entryA} v ${fixture.sectionB} team ${fixture.entryB}`).join("; ")}${draw.sameDivision.length ? ` · same-division rule applied for ${draw.sameDivision.join(", ")}` : ""}`;
    return { fixtures: created, sameDivision: draw.sameDivision };
  });
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(result, { status: 201 });
}
