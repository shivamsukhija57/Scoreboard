import { NextResponse } from "next/server";
import { getUserAccess, presentCompetition } from "@/lib/access";
import { readCompetition } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  const access = await getUserAccess();
  if (!access) return NextResponse.json({ error: "Sign in with your college account to continue." }, { status: 401 });
  const data = await readCompetition();
  return NextResponse.json({ data: presentCompetition(data, access), access, illustrative: true });
}
