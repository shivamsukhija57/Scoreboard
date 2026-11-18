import { NextResponse } from "next/server";
import { getUserAccess, isCentralAdmin } from "@/lib/access";
import type { RoleAssignment } from "@/lib/domain";
import { updateCompetition } from "@/lib/store";

const allowedDomain = (process.env.COLLEGE_EMAIL_DOMAIN ?? "spjimr.org").trim().toLowerCase();

export async function PUT(request: Request) {
  const access = await getUserAccess();
  if (!access) return NextResponse.json({ error: "Sign in to update assignments." }, { status: 401 });
  if (!isCentralAdmin(access)) return NextResponse.json({ error: "Central-admin access is required." }, { status: 403 });
  const { assignments } = (await request.json()) as { assignments: RoleAssignment[] };
  if (!Array.isArray(assignments)) return NextResponse.json({ error: "No validated assignments were provided." }, { status: 400 });

  const result = await updateCompetition(access.email, "assignments-import", `Applied ${assignments.length} assignments`, "assignments", (data) => {
    const combined = [...data.assignments];
    for (const assignment of assignments) {
      if (!assignment.email.toLowerCase().endsWith(`@${allowedDomain}`)) return { error: `All organizer accounts must use @${allowedDomain}.`, status: 400 };
      if (!assignment.role || !assignment.email) return { error: "Each assignment requires an email and role.", status: 400 };
      const key = (item: RoleAssignment) => `${item.email}|${item.role}|${item.scopeId ?? ""}`;
      const index = combined.findIndex((item) => key(item) === key(assignment));
      if (index >= 0) combined[index] = assignment;
      else combined.push(assignment);
    }
    const sectionCounts = new Map<string, number>();
    for (const assignment of combined.filter((item) => item.active && item.role === "section-admin")) {
      const count = (sectionCounts.get(assignment.scopeId ?? "") ?? 0) + 1;
      sectionCounts.set(assignment.scopeId ?? "", count);
      if (!assignment.scopeId || count > 3) return { error: "Each section can have at most three active section administrators; add a section scope or remove an extra assignment.", status: 409 };
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
