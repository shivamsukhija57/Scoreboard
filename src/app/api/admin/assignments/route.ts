import { NextResponse } from "next/server";
import { getUserAccess, isCentralAdmin } from "@/lib/access";
import { ROLES, type RoleAssignment } from "@/lib/domain";
import { updateCompetition } from "@/lib/store";
import { isJudgedEvent } from "@/lib/judging";

const allowedDomain = (process.env.COLLEGE_EMAIL_DOMAIN ?? "spjimr.org").trim().toLowerCase();

export async function PUT(request: Request) {
  const access = await getUserAccess();
  if (!access) return NextResponse.json({ error: "Sign in to update assignments." }, { status: 401 });
  if (!isCentralAdmin(access)) return NextResponse.json({ error: "Central-admin access is required." }, { status: 403 });
  const { assignments } = (await request.json()) as { assignments: RoleAssignment[] };
  if (!Array.isArray(assignments)) return NextResponse.json({ error: "No validated assignments were provided." }, { status: 400 });

  const result = await updateCompetition(access.email, "assignments-import", `Applied ${assignments.length} assignments`, "assignments", (data) => {
    const combined = [...data.assignments];
    for (const raw of assignments) {
      if (typeof raw?.email !== "string" || !raw.role) return { error: "Each assignment requires an email and role.", status: 400 };
      if (!(ROLES as readonly string[]).includes(raw.role)) return { error: `Unknown role "${String(raw.role).slice(0, 40)}".`, status: 400 };
      // Store only known fields, with the email normalised the same way sign-in normalises it.
      const assignment: RoleAssignment = { email: raw.email.trim().toLowerCase(), role: raw.role, active: raw.active !== false, ...(raw.scopeId ? { scopeId: String(raw.scopeId).trim() } : {}), ...(raw.scopeLabel ? { scopeLabel: String(raw.scopeLabel).slice(0, 80) } : {}) };
      if (!assignment.email.endsWith(`@${allowedDomain}`)) return { error: `All organizer accounts must use @${allowedDomain}.`, status: 400 };
      // An event head with no event would be head of every event.
      if (assignment.role === "event-head" && !assignment.scopeId) return { error: `${assignment.email} needs an event to be event head for.`, status: 400 };
      if (assignment.role === "event-head" && !data.events.some((event) => event.id === assignment.scopeId || event.id.startsWith(`${assignment.scopeId}-`))) return { error: `No event matches "${assignment.scopeId}".`, status: 400 };
      // A judge marks only the events they're assigned; with no event they'd judge nothing, so it's required.
      if (assignment.role === "judge" && !assignment.scopeId) return { error: `${assignment.email} needs an event to judge.`, status: 400 };
      // The spreadsheet names the event ("Battle of Bands"); match it to the event's id.
      if (assignment.role === "judge" && !data.events.some((event) => event.id === assignment.scopeId || event.id.startsWith(`${assignment.scopeId}-`))) {
        const slug = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
        const named = data.events.find((event) => isJudgedEvent(data, event) && slug(event.name) === assignment.scopeId);
        if (named) { assignment.scopeId = named.id; assignment.scopeLabel ??= named.name; }
      }
      if (assignment.role === "judge" && !data.events.some((event) => isJudgedEvent(data, event) && (event.id === assignment.scopeId || event.id.startsWith(`${assignment.scopeId}-`)))) return { error: `No judged Stage event matches "${assignment.scopeId}".`, status: 400 };
      const key = (item: RoleAssignment) => `${item.email}|${item.role}|${item.scopeId ?? ""}`;
      const index = combined.findIndex((item) => key(item) === key(assignment));
      if (index >= 0) combined[index] = assignment;
      else combined.push(assignment);
    }
    const sectionCounts = new Map<string, number>();
    for (const assignment of combined.filter((item) => item.active && item.role === "section-admin")) {
      const count = (sectionCounts.get(assignment.scopeId ?? "") ?? 0) + 1;
      sectionCounts.set(assignment.scopeId ?? "", count);
      if (!assignment.scopeId || count > 3) return { error: "Each division can have at most three active division administrators; add a division scope or remove an extra assignment.", status: 409 };
    }
    data.assignments = combined;
    return { saved: assignments.length };
  });
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(result);
}

export async function DELETE(request: Request) {
  const access = await getUserAccess();
  if (!access) return NextResponse.json({ error: "Sign in to remove an assignment." }, { status: 401 });
  if (!isCentralAdmin(access)) return NextResponse.json({ error: "Central-admin access is required." }, { status: 403 });
  const body = (await request.json()) as { email?: string; role?: RoleAssignment["role"]; scopeId?: string };
  const email = body.email?.trim().toLowerCase();
  if (!email || !body.role) return NextResponse.json({ error: "Choose an email and role to remove." }, { status: 400 });

  const result = await updateCompetition(access.email, "assignment-remove", `Removed ${body.role} assignment for ${email}`, email, (data) => {
    const index = data.assignments.findIndex((item) => item.email.toLowerCase() === email && item.role === body.role && (item.scopeId ?? "") === (body.scopeId ?? ""));
    if (index < 0) return { error: "That assignment no longer exists.", status: 404 };
    data.assignments.splice(index, 1);
    return { removed: true };
  });
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(result);
}
