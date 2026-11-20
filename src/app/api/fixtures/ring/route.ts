import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { canSchedule, getUserAccess, isCentralAdmin } from "@/lib/access";
import type { Fixture, SectionId } from "@/lib/domain";
import { drawOrderError, planRingFixtures } from "@/lib/ring-draw";
import { bookingDescriber, findClashes } from "@/lib/schedule-tools";
import { updateCompetition } from "@/lib/store";

/**
 * Chit draw: turns a drawn ring order into the five neighbour matches of a chit-ring event, or of one group of a
 * ring-group event. Matches run back to back at one venue, ordered so no division plays two slots in a row.
 * Scheduler or central admin. The draw order is recorded in the audit log.
 */
export async function POST(request: Request) {
  const access = await getUserAccess();
  if (!access) return NextResponse.json({ error: "Sign in to schedule fixtures." }, { status: 401 });
  if (!isCentralAdmin(access) && !canSchedule(access)) return NextResponse.json({ error: "Scheduling access is required." }, { status: 403 });

  let body: Record<string, unknown>;
  try { body = (await request.json()) as Record<string, unknown>; } catch { return NextResponse.json({ error: "The request couldn't be read." }, { status: 400 }); }
  if (!body || typeof body !== "object") return NextResponse.json({ error: "The request couldn't be read." }, { status: 400 });

  const eventId = typeof body.eventId === "string" && body.eventId.length <= 120 ? body.eventId : "";
  const venue = typeof body.venue === "string" ? body.venue.trim() : "";
  const firstStart = typeof body.firstStart === "string" ? new Date(body.firstStart) : null;
  const slotMinutes = typeof body.slotMinutes === "number" ? Math.round(body.slotMinutes) : NaN;
  const group = body.group === undefined || body.group === null ? undefined : body.group;
  const acknowledgeConflict = body.acknowledgeConflict === true;
  const acknowledgeExisting = body.acknowledgeExisting === true;

  if (!eventId) return NextResponse.json({ error: "Choose an event." }, { status: 400 });
  if (!venue || venue.length > 80) return NextResponse.json({ error: "Give a venue of up to 80 characters." }, { status: 400 });
  if (!firstStart || Number.isNaN(firstStart.getTime())) return NextResponse.json({ error: "Give a valid time for the first match." }, { status: 400 });
  if (!Number.isFinite(slotMinutes) || slotMinutes < 5 || slotMinutes > 600) return NextResponse.json({ error: "Slot length must be between 5 and 600 minutes." }, { status: 400 });
  if (group !== undefined && group !== 1 && group !== 2) return NextResponse.json({ error: "Group must be 1 or 2." }, { status: 400 });

  let detail = "";
  const result = await updateCompetition(access.email, "chit-draw-fixtures", () => detail, eventId, (data) => {
    const event = data.events.find((item) => item.id === eventId);
    if (!event) return { error: "Event not found.", status: 404 };
    const format = event.pointsPolicy.format;
    if (format !== "chit-ring" && format !== "ring-group") return { error: "Only chit-ring and ring-group events are drawn into a ring.", status: 400 };
    if (format === "ring-group" && group === undefined) return { error: "Choose group 1 or group 2 for this event.", status: 400 };
    if (format === "chit-ring" && group !== undefined) return { error: "This event has a single ring, not groups.", status: 400 };
    const sectionIds = data.sections.map((section) => section.id);
    const orderError = drawOrderError(body.order, sectionIds);
    if (orderError) return { error: orderError, status: 400 };
    const order = body.order as SectionId[];

    const existing = data.fixtures.filter((fixture) => fixture.eventId === eventId && (fixture.stage ?? "league") === "league" && (group === undefined || fixture.group === group));
    if (existing.length && !acknowledgeExisting) return { error: `This ${group ? "group" : "event"} already has ${existing.length} league fixture${existing.length === 1 ? "" : "s"}.`, status: 409, existing: existing.length };

    const plan = planRingFixtures(order, { firstStart: firstStart.toISOString(), slotMinutes, venue });
    const describe = bookingDescriber(data);
    const drafts = plan.map((match, index) => ({ id: `draft-${index}`, eventId, ...match }));
    const conflicts = drafts.flatMap((draft) => findClashes(draft, data.fixtures, describe).map((clash) => ({ ...clash, fixture: describe(draft) })));
    if (conflicts.length && !acknowledgeConflict) return { conflict: conflicts };

    const now = new Date().toISOString();
    const created: Fixture[] = plan.map((match) => ({
      id: randomUUID(), eventId, sectionA: match.sectionA, sectionB: match.sectionB, startsAt: match.startsAt, durationMinutes: match.durationMinutes, venue: match.venue,
      stage: "league", ...(group ? { group, entryA: group, entryB: group } : {}),
      status: "scheduled", scoreA: 0, scoreB: 0, periodLabel: "Not started", clockLabel: "—", resultConfirmed: false, updatedAt: now,
    }));
    data.fixtures.push(...created);
    const code = (id: SectionId) => data.sections.find((section) => section.id === id)?.code ?? id;
    detail = `Chit draw for ${event.name}${group ? ` group ${group}` : ""}: ring ${order.map(code).join("-")}; ${created.length} fixtures at ${venue} from ${firstStart.toISOString()}${conflicts.length ? ` (${conflicts.length} clash${conflicts.length === 1 ? "" : "es"} acknowledged)` : ""}`;
    return { fixtures: created, order };
  });

  if ("error" in result) return NextResponse.json({ error: result.error, ...("existing" in result ? { existing: result.existing } : {}) }, { status: result.status });
  if ("conflict" in result) return NextResponse.json({ error: "Some matches overlap another venue or division booking.", conflicts: result.conflict }, { status: 409 });
  return NextResponse.json(result, { status: 201 });
}
