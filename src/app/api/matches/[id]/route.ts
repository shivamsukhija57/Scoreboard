import { NextResponse } from "next/server";
import { canManageEvent, getUserAccess, isCentralAdmin, presentCompetition } from "@/lib/access";
import type { MatchScoreInput } from "@/lib/domain";
import { endCricketInnings, recordCricketDelivery, recordMatchEvent, reverseCricketDelivery, startCricketInnings } from "@/lib/match-scorecard";
import { readCompetition, updateCompetition } from "@/lib/store";
import { describeMatchAuditAction, isUnchangedSnapshot } from "@/lib/live-scoring-utils";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const access = await getUserAccess();
  if (!access) return NextResponse.json({ error: "Sign in to view this match." }, { status: 401 });
  const { id } = await context.params;
  const data = await readCompetition();
  const fixture = data.fixtures.find((item) => item.id === id);
  if (!fixture) return NextResponse.json({ error: "Match not found." }, { status: 404 });
  const revision = fixture.updatedAt || "initial";
  const headers = { "Cache-Control": "no-store, max-age=0", ETag: `\"${revision}\"` };
  if (isUnchangedSnapshot(request.headers.get("if-none-match"), revision)) return new Response(null, { status: 304, headers });
  const safe = presentCompetition({ ...data, fixtures: [fixture] }, access).fixtures[0];
  return NextResponse.json({ match: safe, revision }, { headers });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const access = await getUserAccess();
  if (!access) return NextResponse.json({ error: "Sign in to score this match." }, { status: 401 });
  const { id } = await context.params;
  const input = (await request.json()) as MatchScoreInput;
  let auditDetail = `Applied ${input.action}`;
  const result = await updateCompetition(access.email, `match-${input.action}`, () => auditDetail, id, (data) => {
    const match = data.fixtures.find((fixture) => fixture.id === id);
    if (!match) return { error: "Match not found.", status: 404 };
    if (!isCentralAdmin(access) && !canManageEvent(access, match.eventId)) {
      return { error: "You do not have scoring access for this event.", status: 403 };
    }

    if (input.action === "reopen" && !isCentralAdmin(access)) return { error: "Only the central admin can reopen finalized results.", status: 403 };
    const before = { scoreA: match.scoreA, scoreB: match.scoreB, pointsA: match.awardedPointsA ?? 0, pointsB: match.awardedPointsB ?? 0 };
    const error = input.action === "cricket-delivery" ? recordCricketDelivery(data, match, input, access.email) : input.action === "cricket-start-innings" ? startCricketInnings(data, match, input) : input.action === "cricket-end-innings" ? endCricketInnings(match) : input.action === "cricket-correct-delivery" ? reverseCricketDelivery(data, match, input, access.email) : recordMatchEvent(data, match, input, access.email);
    if (error) return { error, status: 400 };
    match.updatedAt = new Date().toISOString();
    auditDetail = describeMatchAuditAction(data, match, input, before);
    return { match };
  });

  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
  const response = { match: result.match };
  if (isCentralAdmin(access) && "auditEntry" in result) Object.assign(response, { auditEntry: result.auditEntry });
  return NextResponse.json(response);
}
