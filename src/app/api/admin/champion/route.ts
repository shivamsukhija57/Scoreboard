import { NextResponse } from "next/server";
import { getUserAccess, isCentralAdmin } from "@/lib/access";
import type { SectionId } from "@/lib/domain";
import { bonusPointsFor } from "@/lib/points-rules";
import { updateCompetition } from "@/lib/store";

/** Announce the overall champion (closing ceremony). Central admin only; the champion moment then plays once for everyone. */
export async function POST(request: Request) {
  const access = await getUserAccess();
  if (!access) return NextResponse.json({ error: "Sign in to announce the champion." }, { status: 401 });
  if (!isCentralAdmin(access)) return NextResponse.json({ error: "Central-admin access is required." }, { status: 403 });
  const body = (await request.json()) as { sectionId?: SectionId; note?: string };
  if (!body.sectionId) return NextResponse.json({ error: "Choose the champion division." }, { status: 400 });
  let detail = "";
  const result = await updateCompetition(access.email, "champion-announced", () => detail, "champion", (data) => {
    if (!data.sections.some((section) => section.id === body.sectionId)) return { error: "Division not found.", status: 400 };
    if (data.champion) return { error: "A champion has already been announced. Withdraw it first to change it.", status: 409 };
    const total = (id: SectionId) => data.fixtures.filter((fixture) => fixture.status === "completed" && fixture.resultConfirmed).reduce((sum, fixture) => sum + (fixture.sectionA === id ? fixture.awardedPointsA ?? 0 : fixture.sectionB === id ? fixture.awardedPointsB ?? 0 : 0), bonusPointsFor(data, id));
    const ranked = [...data.sections].sort((a, b) => total(b.id) - total(a.id));
    const top = ranked[0];
    const level = ranked.length > 1 && total(ranked[0].id) === total(ranked[1].id);
    if ((level || top?.id !== body.sectionId) && !body.note?.trim()) {
      return { error: level ? "Divisions are level at the top. Add the committee's decision as a note." : "That division isn't top of the standings. Add the committee's reason as a note.", status: 400 };
    }
    data.champion = { sectionId: body.sectionId!, announcedAt: new Date().toISOString(), announcedBy: access.email, note: body.note?.trim() || undefined };
    detail = `Champion announced: ${body.sectionId}${data.champion.note ? ` · ${data.champion.note}` : ""}`;
    return { champion: data.champion };
  });
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(result);
}

/** Withdraw an announcement made in error. Central admin only. */
export async function DELETE(request: Request) {
  const access = await getUserAccess();
  if (!access) return NextResponse.json({ error: "Sign in to change the champion." }, { status: 401 });
  if (!isCentralAdmin(access)) return NextResponse.json({ error: "Central-admin access is required." }, { status: 403 });
  const body = (await request.json()) as { reason?: string };
  if (!body.reason?.trim()) return NextResponse.json({ error: "Give a reason for withdrawing the announcement." }, { status: 400 });
  let detail = "";
  const result = await updateCompetition(access.email, "champion-withdrawn", () => detail, "champion", (data) => {
    if (!data.champion) return { error: "No champion has been announced.", status: 404 };
    detail = `Champion announcement withdrawn (${data.champion.sectionId}) · ${body.reason!.trim()}`;
    data.champion = undefined;
    return { ok: true };
  });
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(result);
}
