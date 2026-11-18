import { NextResponse } from "next/server";
import { getUserAccess, isCentralAdmin } from "@/lib/access";
import type { Sport } from "@/lib/domain";
import { updateCompetition } from "@/lib/store";

export async function PUT(request: Request) {
  const access = await getUserAccess();
  if (!access) return NextResponse.json({ error: "Sign in to update sport rules." }, { status: 401 });
  if (!isCentralAdmin(access)) return NextResponse.json({ error: "Central-admin access is required." }, { status: 403 });
  const body = (await request.json()) as {
    sportId: string;
    category: Sport["category"];
    countsTowardOverallSportsCap: boolean;
    maxFormatsPerPlayer: number | null;
    participationNotes: string[];
  };
  if (!body.sportId || !["sport", "cultural"].includes(body.category)) return NextResponse.json({ error: "Choose a valid category." }, { status: 400 });
  if (body.maxFormatsPerPlayer !== null && (!Number.isInteger(body.maxFormatsPerPlayer) || body.maxFormatsPerPlayer < 1 || body.maxFormatsPerPlayer > 20)) {
    return NextResponse.json({ error: "Formats per player must be a whole number from 1 to 20 or unlimited." }, { status: 400 });
  }
  const isCultural = body.category === "cultural";
  const result = await updateCompetition(access.email, "sport-rules-update", `Updated participation rules for ${body.sportId}`, body.sportId, (data) => {
    const sport = data.sports.find((item) => item.id === body.sportId);
    if (!sport) return { error: "Sport or activity not found.", status: 404 };
    sport.category = body.category;
    sport.countsTowardOverallSportsCap = isCultural ? false : body.countsTowardOverallSportsCap;
    sport.maxFormatsPerPlayer = isCultural ? null : body.maxFormatsPerPlayer;
    sport.participationNotes = body.participationNotes.map((note) => note.trim()).filter(Boolean);
    return { sport };
  });
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(result);
}
