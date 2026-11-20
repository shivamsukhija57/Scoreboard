import { NextResponse } from "next/server";
import { getUserAccess, isCentralAdmin } from "@/lib/access";
import type { SectionId } from "@/lib/domain";
import { updateCompetition } from "@/lib/store";

export async function PUT(request: Request) {
  const access = await getUserAccess();
  if (!access) return NextResponse.json({ error: "Sign in to update participation rules." }, { status: 401 });
  if (!isCentralAdmin(access)) return NextResponse.json({ error: "Central-admin access is required." }, { status: 403 });
  const body = (await request.json()) as { sectionId: SectionId; maxSportsPerPlayer: number };
  if (!Number.isInteger(body.maxSportsPerPlayer) || body.maxSportsPerPlayer < 1 || body.maxSportsPerPlayer > 20) {
    return NextResponse.json({ error: "The sports-per-player cap must be a whole number from 1 to 20." }, { status: 400 });
  }
  const result = await updateCompetition(access.email, "participation-cap-update", `Set ${body.sectionId} sports cap to ${body.maxSportsPerPlayer}`, body.sectionId, (data) => {
    const section = data.sections.find((item) => item.id === body.sectionId);
    if (!section) return { error: "Division not found.", status: 404 };
    section.maxSportsPerPlayer = body.maxSportsPerPlayer;
    return { section };
  });
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(result);
}
