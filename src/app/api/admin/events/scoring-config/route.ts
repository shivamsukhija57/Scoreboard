import { NextResponse } from "next/server";
import { getUserAccess, isCentralAdmin } from "@/lib/access";
import type { SportScoringConfig } from "@/lib/domain";
import { allowedKinds } from "@/lib/match-scorecard";
import { updateCompetition } from "@/lib/store";

const numericFields = ["inningsCount", "oversPerInnings", "wicketsPerInnings", "pointsToWin", "winBy", "setsToWin", "periods", "periodMinutes"] as const;

export async function PUT(request: Request) {
  const access = await getUserAccess();
  if (!access) return NextResponse.json({ error: "Sign in to configure scoring." }, { status: 401 });
  if (!isCentralAdmin(access)) return NextResponse.json({ error: "Central-admin access is required." }, { status: 403 });
  const body = await request.json() as { eventId?: string; scoringConfig?: SportScoringConfig };
  if (!body.eventId || !body.scoringConfig || typeof body.scoringConfig !== "object") return NextResponse.json({ error: "Choose an event and provide its scoring settings." }, { status: 400 });
  for (const key of numericFields) {
    const value = body.scoringConfig[key];
    if (value !== undefined && value !== null && (!Number.isInteger(value) || value < 1 || value > 1000)) return NextResponse.json({ error: `${key} must be a positive whole number or blank.` }, { status: 400 });
  }
  if (body.scoringConfig.enabledActions && (!Array.isArray(body.scoringConfig.enabledActions) || body.scoringConfig.enabledActions.some((action) => typeof action !== "string"))) return NextResponse.json({ error: "Scoring actions must be a list." }, { status: 400 });
  const result = await updateCompetition(access.email, "event-scoring-config", `Updated scoring settings for ${body.eventId}`, body.eventId, (data) => {
    const event = data.events.find((item) => item.id === body.eventId);
    if (!event) return { error: "Event not found.", status: 404 };
    const supported = new Set(allowedKinds(event.sportId));
    if (body.scoringConfig?.enabledActions?.some((action) => !supported.has(action))) return { error: "One or more enabled actions are not supported by this sport.", status: 400 };
    // Walkover scores are set with the event's points rules, so keep the stored one.
    event.scoringConfig = { ...body.scoringConfig, walkoverScore: event.scoringConfig?.walkoverScore, enabledActions: body.scoringConfig?.enabledActions?.length ? body.scoringConfig.enabledActions : undefined };
    return { event };
  });
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(result);
}
