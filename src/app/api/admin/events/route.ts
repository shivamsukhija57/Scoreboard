import { NextResponse } from "next/server";
import { getUserAccess, isCentralAdmin } from "@/lib/access";
import type { EventDefinition, PointsFormat, SportScoringConfig } from "@/lib/domain";
import { updateCompetition } from "@/lib/store";

interface EventRulesInput {
  eventId: string;
  name: string;
  format: string;
  minPlayers: number;
  maxPlayers: number | null;
  entriesPerDivision: number;
  substitutePlayers: number;
  genderEligibility: EventDefinition["genderEligibility"];
  tournamentFormat: string;
  matchCount: number | null;
  rosterRules: string[];
  scoringRules: string[];
  scoringType: string;
  scoringConfig: SportScoringConfig;
  points: number[];
  outcomePoints: Record<string, number>;
  publishPoints: boolean;
  /** League / chit-ring / ring-group (paid in units of X) or placings. */
  pointsFormat?: PointsFormat;
  /** X, the match-win value. */
  unit?: number | null;
  walkoverScore?: number | null;
}

const validFormats = new Set<PointsFormat>(["league", "chit-ring", "ring-group", "placings"]);
const validGenders = new Set<EventDefinition["genderEligibility"]>(["men", "women", "mixed", "open"]);

export async function PUT(request: Request) {
  const access = await getUserAccess();
  if (!access) return NextResponse.json({ error: "Sign in to configure events." }, { status: 401 });
  if (!isCentralAdmin(access)) return NextResponse.json({ error: "Central-admin access is required." }, { status: 403 });

  const body = (await request.json()) as EventRulesInput;
  if (!body.eventId || !body.name?.trim() || !body.format?.trim() || !body.tournamentFormat?.trim()) {
    return NextResponse.json({ error: "Event name, entry format, and tournament format are required." }, { status: 400 });
  }
  if (!Number.isInteger(body.minPlayers) || body.minPlayers < 1 || (body.maxPlayers !== null && (!Number.isInteger(body.maxPlayers) || body.maxPlayers < body.minPlayers))) {
    return NextResponse.json({ error: "Check the minimum and maximum roster sizes. Leave maximum blank for no cap." }, { status: 400 });
  }
  if (!Number.isInteger(body.entriesPerDivision) || body.entriesPerDivision < 1 || body.entriesPerDivision > 10 || !Number.isInteger(body.substitutePlayers) || body.substitutePlayers < 0) {
    return NextResponse.json({ error: "Entries per division and substitute counts must be valid whole numbers." }, { status: 400 });
  }
  if (!validGenders.has(body.genderEligibility)) return NextResponse.json({ error: "Choose a valid gender-eligibility rule." }, { status: 400 });
  if (body.matchCount !== null && (!Number.isInteger(body.matchCount) || body.matchCount < 1)) return NextResponse.json({ error: "Match count must be a positive whole number or blank." }, { status: 400 });
  if (body.points.some((value) => !Number.isFinite(value) || value < 0) || Object.values(body.outcomePoints).some((value) => !Number.isFinite(value) || value < 0)) {
    return NextResponse.json({ error: "Points must be zero or greater." }, { status: 400 });
  }
  if (body.pointsFormat !== undefined && !validFormats.has(body.pointsFormat)) return NextResponse.json({ error: "Choose a valid points format." }, { status: 400 });
  if (body.unit !== undefined && body.unit !== null && (!Number.isFinite(body.unit) || body.unit < 0)) return NextResponse.json({ error: "The win value X must be zero or greater." }, { status: 400 });
  if (body.walkoverScore !== undefined && body.walkoverScore !== null && (!Number.isInteger(body.walkoverScore) || body.walkoverScore < 0 || body.walkoverScore > 1000)) return NextResponse.json({ error: "The walkover score must be a whole number from 0." }, { status: 400 });
  for (const key of ["inningsCount", "oversPerInnings", "wicketsPerInnings", "pointsToWin", "winBy", "setsToWin", "periods", "periodMinutes"] as const) {
    const value = body.scoringConfig?.[key];
    if (value !== undefined && (!Number.isInteger(value) || value < 1 || value > 1000)) return NextResponse.json({ error: `Scoring setting ${key} must be a positive whole number.` }, { status: 400 });
  }

  const result = await updateCompetition(access.email, "event-rules-update", `Updated ${body.eventId} rulebook data`, body.eventId, (data) => {
    const event = data.events.find((item) => item.id === body.eventId);
    if (!event) return { error: "Event not found.", status: 404 };
    event.name = body.name.trim();
    event.format = body.format.trim();
    event.minPlayers = body.minPlayers;
    event.maxPlayers = body.maxPlayers;
    event.entriesPerDivision = body.entriesPerDivision;
    event.substitutePlayers = body.substitutePlayers;
    event.genderEligibility = body.genderEligibility;
    event.tournamentFormat = body.tournamentFormat.trim();
    event.matchCount = body.matchCount;
    event.rosterRules = body.rosterRules.map((rule) => rule.trim()).filter(Boolean);
    event.scoringRules = body.scoringRules.map((rule) => rule.trim()).filter(Boolean);
    event.scoringType = body.scoringType.trim();
    const walkoverScore = body.walkoverScore === undefined ? event.scoringConfig?.walkoverScore : body.walkoverScore ?? undefined;
    event.scoringConfig = { ...(body.scoringConfig ?? {}), ...(walkoverScore !== undefined ? { walkoverScore } : {}) };
    if (body.pointsFormat) event.pointsPolicy.format = body.pointsFormat;
    if (body.unit !== undefined) event.pointsPolicy.unit = body.unit ?? undefined;
    event.pointsPolicy.places = body.points;
    event.pointsPolicy.pointsByOutcome = body.outcomePoints;
    event.pointsPolicy.name = body.publishPoints ? `${body.name.trim()} rulebook points` : "Draft points policy";
    event.pointsPolicy.published = body.publishPoints;
    event.pointsPolicy.version += body.publishPoints ? 1 : 0;
    return { event };
  });
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(result);
}
