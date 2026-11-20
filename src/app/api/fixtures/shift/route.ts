import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { canSchedule, getUserAccess, isCentralAdmin } from "@/lib/access";
import { bookingDescriber, istDayKey, planFixtureShift } from "@/lib/schedule-tools";
import { updateCompetition } from "@/lib/store";

/** Moves every scheduled fixture at one venue on one day, from a time onward, by a fixed number of minutes. */
export async function POST(request: Request) {
  const access = await getUserAccess();
  if (!access) return NextResponse.json({ error: "Sign in to change the schedule." }, { status: 401 });
  if (!isCentralAdmin(access) && !canSchedule(access)) return NextResponse.json({ error: "Scheduling access is required." }, { status: 403 });

  const body = (await request.json()) as { venue?: string; day?: string; fromTime?: string; minutes?: number; reason?: string; notify?: boolean; acknowledgeConflict?: boolean };
  const venue = body.venue?.trim() ?? "";
  const minutes = Math.round(Number(body.minutes));
  const reason = (body.reason ?? "").trim().slice(0, 140);
  if (!venue || !/^\d{4}-\d{2}-\d{2}$/.test(body.day ?? "") || !/^\d{2}:\d{2}$/.test(body.fromTime ?? "")) return NextResponse.json({ error: "Choose a venue, day, and start time." }, { status: 400 });
  if (!Number.isFinite(minutes) || minutes === 0 || Math.abs(minutes) > 360) return NextResponse.json({ error: "Shift by between 1 and 360 minutes, earlier or later." }, { status: 400 });
  if (body.notify && !reason) return NextResponse.json({ error: "Add a reason to show spectators." }, { status: 400 });

  let detail = "";
  const result = await updateCompetition(access.email, "fixture-shift", () => detail, `venue:${venue}`, (data) => {
    const moves = planFixtureShift(data, { venue, day: body.day as string, fromTime: body.fromTime as string, minutes }, bookingDescriber(data));
    if (!moves.length) return { error: "No scheduled fixtures at this venue from that time.", status: 404 };
    const clashes = moves.flatMap((move) => move.clashes.map((clash) => ({ ...clash, fixtureMoved: move.fixture.id })));
    if (clashes.length && !body.acknowledgeConflict) return { conflict: clashes };

    const now = new Date().toISOString();
    const changes = moves.map((move) => {
      const before = move.fixture.startsAt;
      move.fixture.startsAt = move.newStartsAt;
      move.fixture.updatedAt = now;
      return { id: move.fixture.id, before, after: move.newStartsAt };
    });
    if (body.notify) {
      const today = istDayKey(now);
      // Keep the list small: only today's and later notices survive, and a venue keeps its latest notice per day.
      data.notices = (data.notices ?? []).filter((notice) => notice.day >= today && !(notice.day === body.day && notice.venue.toLowerCase() === venue.toLowerCase()));
      data.notices.push({ id: randomUUID(), day: body.day as string, venue: moves[0].fixture.venue, minutes, reason, createdAt: now });
    }
    detail = JSON.stringify({ venue, day: body.day, fromTime: body.fromTime, minutes, reason, notified: Boolean(body.notify), acknowledgedConflicts: clashes.length, changes });
    return { moved: changes.length, fixtures: moves.map((move) => move.fixture), notices: data.notices ?? [] };
  });

  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
  if ("conflict" in result) return NextResponse.json({ error: "Shifting creates new overlaps.", conflicts: result.conflict }, { status: 409 });
  return NextResponse.json(result);
}
