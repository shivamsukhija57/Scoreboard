import { NextResponse } from "next/server";
import { canSchedule, getUserAccess, isCentralAdmin } from "@/lib/access";
import { analyzeImport, sanitizeRawRows } from "@/lib/fixture-import";
import { readImportRequest } from "@/lib/fixture-import-sheet";
import { readCompetition } from "@/lib/store";

/** Reads an uploaded fixtures sheet (or pasted rows) and reports what publishing it would do. Saves nothing. */
export async function POST(request: Request) {
  const access = await getUserAccess();
  if (!access) return NextResponse.json({ error: "Sign in to import fixtures." }, { status: 401 });
  if (!isCentralAdmin(access) && !canSchedule(access)) return NextResponse.json({ error: "Scheduling access is required." }, { status: 403 });
  if (Number(request.headers.get("content-length") ?? 0) > 1_200_000) return NextResponse.json({ error: "That file is over 1 MB. Remove extra sheets or images, or split it into two files." }, { status: 413 });

  // After publishing, the panel sends the same rows back as JSON to show the schedule as it is now.
  if ((request.headers.get("content-type") ?? "").includes("application/json")) {
    const body = await request.json().catch(() => null) as { rows?: unknown; source?: unknown } | null;
    const rows = sanitizeRawRows(body?.rows);
    if (!rows || !rows.length) return NextResponse.json({ error: "Upload the sheet again to check it." }, { status: 400 });
    const source = typeof body?.source === "string" ? body.source.slice(0, 80) : "";
    return NextResponse.json({ source, raw: rows, ...analyzeImport(rows, await readCompetition()) });
  }

  let form: FormData;
  try { form = await request.formData(); }
  catch { return NextResponse.json({ error: "Upload the filled template, or paste rows copied from it." }, { status: 400 }); }
  const read = await readImportRequest(form);
  if ("error" in read) return NextResponse.json({ error: read.error }, { status: 400 });
  const analysis = analyzeImport(read.rows, await readCompetition());
  return NextResponse.json({ source: read.source, raw: read.rows, ...analysis });
}
