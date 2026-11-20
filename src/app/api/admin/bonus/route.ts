import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getUserAccess, isCentralAdmin } from "@/lib/access";
import type { SectionId } from "@/lib/domain";
import { topperStatus } from "@/lib/points-rules";
import { updateCompetition } from "@/lib/store";

/** Award the table-topper bonus for a league or chit-ring event. Central admin only. */
export async function POST(request: Request) {
  const access = await getUserAccess();
  if (!access) return NextResponse.json({ error: "Sign in to award points." }, { status: 401 });
  if (!isCentralAdmin(access)) return NextResponse.json({ error: "Central-admin access is required." }, { status: 403 });
  const body = (await request.json()) as { eventId?: string; sectionId?: SectionId; note?: string };
  if (!body.eventId || !body.sectionId) return NextResponse.json({ error: "Choose the event and the division that topped the table." }, { status: 400 });
  let detail = "";
  const result = await updateCompetition(access.email, "table-topper-bonus", () => detail, body.eventId, (data) => {
    const event = data.events.find((item) => item.id === body.eventId);
    if (!event) return { error: "Event not found.", status: 404 };
    if (!data.sections.some((section) => section.id === body.sectionId)) return { error: "Division not found.", status: 400 };
    const status = topperStatus(data, event);
    if (!status.eligible) return { error: "This event has no table-topper bonus.", status: 400 };
    if (!status.complete) return { error: `The table isn't complete yet: ${status.played} of ${status.expected} matches are final.`, status: 400 };
    if (status.awarded) return { error: "The bonus has already been awarded. Remove it first to change it.", status: 409 };
    const overridesTable = status.suggested !== null && status.suggested !== body.sectionId;
    const decidesTie = status.suggested === null;
    if ((overridesTable || decidesTie) && !body.note?.trim()) {
      return { error: decidesTie ? "Divisions are level on the table. Add the committee's decision as a note." : "This isn't the division on top of the table. Add the committee's reason as a note.", status: 400 };
    }
    data.bonusAwards ??= [];
    const award = { id: randomUUID(), eventId: event.id, sectionId: body.sectionId!, kind: "table-topper" as const, points: status.bonus, note: body.note?.trim() || undefined, awardedAt: new Date().toISOString(), awardedBy: access.email };
    data.bonusAwards.push(award);
    detail = `${event.name} · table-topper bonus ${award.points} to ${body.sectionId}${award.note ? ` · ${award.note}` : ""}`;
    return { award };
  });
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(result);
}

/** Remove an event's table-topper bonus so it can be awarded again. Central admin only. */
export async function DELETE(request: Request) {
  const access = await getUserAccess();
  if (!access) return NextResponse.json({ error: "Sign in to change points." }, { status: 401 });
  if (!isCentralAdmin(access)) return NextResponse.json({ error: "Central-admin access is required." }, { status: 403 });
  const body = (await request.json()) as { eventId?: string; reason?: string };
  if (!body.eventId || !body.reason?.trim()) return NextResponse.json({ error: "Give a reason for removing the bonus." }, { status: 400 });
  let detail = "";
  const result = await updateCompetition(access.email, "table-topper-bonus-removed", () => detail, body.eventId, (data) => {
    const index = (data.bonusAwards ?? []).findIndex((award) => award.eventId === body.eventId && award.kind === "table-topper");
    if (index < 0) return { error: "No bonus to remove.", status: 404 };
    const [removed] = data.bonusAwards!.splice(index, 1);
    detail = `${body.eventId} · table-topper bonus ${removed.points} removed from ${removed.sectionId} · ${body.reason!.trim()}`;
    return { removed };
  });
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(result);
}
