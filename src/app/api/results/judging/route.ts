import { NextResponse } from "next/server";
import { canManageEvent, getUserAccess, isCentralAdmin, presentCompetition } from "@/lib/access";
import type { EventJudging } from "@/lib/domain";
import { ADMIN_ACTIONS, applyJudgingAction, canJudgeEvent, COORDINATOR_ACTIONS, JUDGE_ACTIONS, type JudgingInput } from "@/lib/judging";
import { updateCompetition } from "@/lib/store";

export const dynamic = "force-dynamic";

const ACTIONS: readonly string[] = [...ADMIN_ACTIONS, ...COORDINATOR_ACTIONS, ...JUDGE_ACTIONS];

/**
 * Judged Stage events. Judges (assigned to the event) submit their own marks; the coordinator (the event's head or a
 * central admin) runs the results desk: performance order, penalties, reopening a judge, score entry, and announcing.
 * Settings (method, criteria, judges, how marks combine) are for central admins. Everything is validated in the lib.
 */
export async function POST(request: Request) {
  const access = await getUserAccess();
  if (!access) return NextResponse.json({ error: "Sign in to judge or record results." }, { status: 401 });
  const input = (await request.json().catch(() => null)) as JudgingInput | null;
  if (!input || typeof input !== "object" || Array.isArray(input) || typeof input.eventId !== "string" || !input.eventId || input.eventId.length > 120) return NextResponse.json({ error: "Choose the event." }, { status: 400 });
  if (typeof input.action !== "string" || !ACTIONS.includes(input.action)) return NextResponse.json({ error: "Unknown judging action." }, { status: 400 });
  const eventId = input.eventId;
  const central = isCentralAdmin(access);
  const who = { central, coordinator: central || canManageEvent(access, eventId), judge: central || canJudgeEvent(access.assignments, eventId) };
  if (!who.coordinator && !who.judge) return NextResponse.json({ error: "Only this event's judges, its head, or a central admin can do that." }, { status: 403 });
  let detail = "";
  const result = await updateCompetition(access.email, input.action === "announce" ? "placings-recorded" : `judging-${input.action}`, () => detail, eventId, (data) => {
    const applied = applyJudgingAction(data, input, access.email, who);
    if ("error" in applied) return applied;
    detail = applied.detail;
    // Hand back the judging as this person may see it.
    const presented = presentCompetition({ ...data, judging: { [eventId]: applied.judging } }, access).judging?.[eventId] as EventJudging;
    return { judging: presented, announced: applied.announced ?? false };
  });
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ judging: result.judging, announced: result.announced });
}
