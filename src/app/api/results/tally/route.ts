import { NextResponse } from "next/server";
import { canManageEvent, getUserAccess, isCentralAdmin, presentCompetition } from "@/lib/access";
import type { EventTally } from "@/lib/domain";
import { updateCompetition } from "@/lib/store";
import { applyTallyAction, type TallyInput } from "@/lib/tally";

export const dynamic = "force-dynamic";

/**
 * Live quiz and treasure-hunt tallies: marks or milestones set before the start, entries as they happen, undo with a
 * reason, and "finish" to record the final placings. Only the event's head (in scope) or a central admin.
 */
export async function POST(request: Request) {
  const access = await getUserAccess();
  if (!access) return NextResponse.json({ error: "Sign in to score this event." }, { status: 401 });
  const input = (await request.json().catch(() => null)) as TallyInput | null;
  if (!input || typeof input !== "object" || typeof input.eventId !== "string" || !input.eventId || input.eventId.length > 120) return NextResponse.json({ error: "Choose the event." }, { status: 400 });
  const eventId = input.eventId;
  if (typeof input.action !== "string" || !["settings", "add", "undo", "question", "finish"].includes(input.action)) return NextResponse.json({ error: "Unknown tally action." }, { status: 400 });
  if (!isCentralAdmin(access) && !canManageEvent(access, eventId)) return NextResponse.json({ error: "Only this event's head or a central admin can score it." }, { status: 403 });
  let detail = "";
  const result = await updateCompetition(access.email, input.action === "finish" ? "placings-recorded" : `tally-${input.action}`, () => detail, eventId, (data) => {
    const applied = applyTallyAction(data, input, access.email);
    if ("error" in applied) return applied;
    detail = applied.detail;
    // Hand back the tally as this person would see it in the competition data.
    const presented = presentCompetition({ ...data, tallies: { [eventId]: applied.tally } }, access).tallies?.[eventId] as EventTally;
    return { tally: presented, placings: applied.placings ?? false };
  });
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ tally: result.tally, placings: result.placings });
}
