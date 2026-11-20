import { NextResponse } from "next/server";
import { canManageEvent, getUserAccess, isCentralAdmin } from "@/lib/access";
import { recordPlacings } from "@/lib/placings";
import { reopenJudging } from "@/lib/judging";
import { updateCompetition } from "@/lib/store";

/**
 * Record the finishing order of a placings event (athletics, Stage events): the event's head or a central admin ranks
 * the divisions, and each place pays the event's points table. Recorded once; a central admin withdraws to correct it.
 */
export async function POST(request: Request) {
  const access = await getUserAccess();
  if (!access) return NextResponse.json({ error: "Sign in to record results." }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { eventId?: unknown; order?: unknown; note?: unknown };
  if (typeof body.eventId !== "string" || !body.eventId || !Array.isArray(body.order) || !body.order.length) return NextResponse.json({ error: "Choose the event and at least the winner." }, { status: 400 });
  const eventId = body.eventId;
  if (!isCentralAdmin(access) && !canManageEvent(access, eventId)) return NextResponse.json({ error: "Only this event's head or a central admin can record its results." }, { status: 403 });
  let detail = "";
  const result = await updateCompetition(access.email, "placings-recorded", () => detail, eventId, (data) => {
    const recorded = recordPlacings(data, { eventId, order: body.order, note: body.note }, access.email);
    if ("error" in recorded) return recorded;
    detail = recorded.detail;
    return { awards: recorded.awards };
  });
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(result);
}

/** Withdraw a placings result recorded in error. Central admin only, with a reason for the audit log. */
export async function DELETE(request: Request) {
  const access = await getUserAccess();
  if (!access) return NextResponse.json({ error: "Sign in to change results." }, { status: 401 });
  if (!isCentralAdmin(access)) return NextResponse.json({ error: "Central-admin access is required." }, { status: 403 });
  const body = (await request.json().catch(() => ({}))) as { eventId?: unknown; reason?: unknown };
  if (typeof body.eventId !== "string" || !body.eventId || typeof body.reason !== "string" || !body.reason.trim()) return NextResponse.json({ error: "Give a reason for withdrawing these results." }, { status: 400 });
  const eventId = body.eventId;
  const reason = body.reason.trim().slice(0, 300);
  let detail = "";
  const result = await updateCompetition(access.email, "placings-withdrawn", () => detail, eventId, (data) => {
    const before = (data.bonusAwards ?? []).length;
    data.bonusAwards = (data.bonusAwards ?? []).filter((award) => !(award.eventId === eventId && award.kind === "placing"));
    if (data.bonusAwards.length === before) return { error: "No placings are recorded for this event.", status: 404 };
    // A judged Stage event goes back to its results desk with the marks and penalties as they were.
    reopenJudging(data, eventId);
    detail = `${eventId} · placings withdrawn · ${reason}`;
    return { ok: true };
  });
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(result);
}
