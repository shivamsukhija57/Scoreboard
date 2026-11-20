import { NextResponse } from "next/server";
import { getUserAccess } from "@/lib/access";
import { buildLeaderboards, type LeaderboardGender } from "@/lib/leaderboards";
import { readCompetition } from "@/lib/store";

export const dynamic = "force-dynamic";

/**
 * Leaderboards are computed on the server because spectators never receive player IDs or (as public guests)
 * the participant list. Names are only included for signed-in college accounts; student IDs are never included.
 */
export async function GET(request: Request) {
  const access = await getUserAccess();
  if (!access) return NextResponse.json({ error: "Sign in with your college account to continue." }, { status: 401 });
  const param = new URL(request.url).searchParams.get("gender");
  const gender: LeaderboardGender = param === "men" || param === "women" ? param : "all";
  const showNames = access.email !== "guest@public.invalid";
  const boards = buildLeaderboards(await readCompetition(), { gender, showNames, limit: 50 });
  return NextResponse.json({ boards, showNames }, { headers: { "Cache-Control": "no-store" } });
}
