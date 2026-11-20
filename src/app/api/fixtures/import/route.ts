import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { canSchedule, getUserAccess, isCentralAdmin } from "@/lib/access";
import { analyzeImport, applyImport, sanitizeRawRows, type ImportSummary } from "@/lib/fixture-import";
import { updateCompetition } from "@/lib/store";

/**
 * Publishes an imported fixtures sheet. The rows are checked again here against the schedule as it is now; the
 * preview the browser showed is never trusted. Adds new fixtures and moves changed ones; never deletes.
 */
export async function POST(request: Request) {
  const access = await getUserAccess();
  if (!access) return NextResponse.json({ error: "Sign in to import fixtures." }, { status: 401 });
  if (!isCentralAdmin(access) && !canSchedule(access)) return NextResponse.json({ error: "Scheduling access is required." }, { status: 403 });

  let body: { rows?: unknown; acknowledgeClashes?: unknown; skipErrors?: unknown; source?: unknown };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Upload the sheet again, then publish." }, { status: 400 }); }
  const raw = sanitizeRawRows(body?.rows);
  if (!raw || !raw.length) return NextResponse.json({ error: "Upload the sheet again, then publish. The rows didn't come through." }, { status: 400 });
  const acknowledgeClashes = body.acknowledgeClashes === true;
  const skipErrors = body.skipErrors === true;
  const source = typeof body.source === "string" ? body.source.replace(/[^\w .()-]/g, "").slice(0, 80).trim() : "";

  let summary: ImportSummary | undefined;
  let counts = { created: 0, updated: 0 };
  const detail = () => {
    const parts = [`${counts.created} added`, `${counts.updated} updated`, `${summary?.unchanged ?? 0} unchanged`];
    if (summary?.started) parts.push(`${summary.started} already started and left as they were`);
    if (summary?.errors) parts.push(`${summary.errors} rows with errors skipped`);
    if (summary?.clashes) parts.push(`${summary.clashes} clashes acknowledged`);
    return `Imported fixtures${source ? ` from ${source}` : ""}: ${parts.join(", ")}.`;
  };
  const result = await updateCompetition(access.email, "fixture-import", detail, "schedule", (data) => {
    const analysis = analyzeImport(raw, data);
    summary = analysis.summary;
    if (analysis.summary.errors && !skipErrors) return { error: `${analysis.summary.errors} ${analysis.summary.errors === 1 ? "row has" : "rows have"} errors. Fix them, or choose to publish only the valid rows.`, status: 400, analysis };
    if (analysis.summary.clashes && !acknowledgeClashes) return { conflict: true, analysis };
    if (!analysis.summary.new && !analysis.summary.changed) return { error: "Nothing to publish. Every valid row is already on the schedule.", status: 400, analysis };
    const applied = applyImport(data, analysis, new Date().toISOString(), randomUUID);
    counts = { created: applied.created.length, updated: applied.updated.length };
    return { created: counts.created, updated: counts.updated, summary: analysis.summary };
  });

  if ("error" in result) return NextResponse.json({ error: result.error, rows: result.analysis?.rows, summary: result.analysis?.summary }, { status: result.status });
  if ("conflict" in result) return NextResponse.json({ error: "Some rows clash with other bookings. Check them, then publish with the clashes acknowledged.", rows: result.analysis?.rows, summary: result.analysis?.summary }, { status: 409 });
  return NextResponse.json(result, { status: 201 });
}
