import { NextResponse } from "next/server";
import { canManageEvent, getUserAccess, isCentralAdmin } from "@/lib/access";
import type { MatchScoreInput } from "@/lib/domain";
import { updateCompetition } from "@/lib/store";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const access = await getUserAccess();
  if (!access) return NextResponse.json({ error: "Sign in to score this match." }, { status: 401 });
  const { id } = await context.params;
  const input = (await request.json()) as MatchScoreInput;
  const result = await updateCompetition(access.email, "score-update", `Applied ${input.action}`, id, (data) => {
    const match = data.fixtures.find((fixture) => fixture.id === id);
    if (!match) return { error: "Match not found.", status: 404 };
    if (!isCentralAdmin(access) && !canManageEvent(access, match.eventId)) {
      return { error: "You do not have scoring access for this event.", status: 403 };
    }

    switch (input.action) {
      case "start":
        match.status = "live";
        break;
      case "increment-a":
        match.scoreA += 1;
        match.status = "live";
        break;
      case "increment-b":
        match.scoreB += 1;
        match.status = "live";
        break;
      case "decrement-a":
        match.scoreA = Math.max(0, match.scoreA - 1);
        break;
      case "decrement-b":
        match.scoreB = Math.max(0, match.scoreB - 1);
        break;
      case "submit":
        match.status = "awaiting-confirmation";
        match.resultConfirmed = false;
        break;
      case "confirm":
        if (!isCentralAdmin(access)) return { error: "Only the central admin can confirm this result.", status: 403 };
        match.status = "completed";
        match.resultConfirmed = true;
        break;
    }
    match.updatedAt = new Date().toISOString();
    return { match };
  });

  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(result);
}
