import type { Role, RoleAssignment } from "./domain";

const allowedDomain = (process.env.COLLEGE_EMAIL_DOMAIN ?? "spjimr.org").toLowerCase();
const roleAliases: Record<string, Role> = {
  spectator: "spectator",
  "division admin": "section-admin",
  "section admin": "section-admin",
  "section-admin": "section-admin",
  "event head": "event-head",
  "event-head": "event-head",
  scheduler: "scheduler",
  "scheduling access": "scheduler",
  "central admin": "central-admin",
  "central-admin": "central-admin",
  judge: "judge",
  "stage judge": "judge",
};

export interface ParsedAssignment {
  email: string;
  role: Role;
  scopeId?: string;
  scopeLabel?: string;
  active: boolean;
}

export interface ImportIssue {
  row: number;
  message: string;
}

function normalizeKey(value: unknown): string {
  return String(value ?? "").trim().toLowerCase().replace(/[_-]+/g, " ");
}

function col(row: Record<string, unknown>, ...names: string[]): string {
  for (const [key, value] of Object.entries(row)) {
    if (names.includes(normalizeKey(key))) return String(value ?? "").trim();
  }
  return "";
}

export function normalizeAssignmentRows(rows: Array<Record<string, unknown>>) {
  const assignments: ParsedAssignment[] = [];
  const issues: ImportIssue[] = [];
  rows.forEach((row, index) => {
    const email = col(row, "email", "email id", "college email").toLowerCase();
    const rawRole = normalizeKey(col(row, "role", "responsibility", "access"));
    const role = roleAliases[rawRole];
    const rawScope = col(row, "scope", "division", "section", "event", "sport");
    const rawActive = normalizeKey(col(row, "active", "status"));
    if (!email || !email.includes("@")) {
      issues.push({ row: index + 2, message: "Enter a valid email address." });
      return;
    }
    if (!email.endsWith(`@${allowedDomain}`)) {
      issues.push({ row: index + 2, message: `Email must use @${allowedDomain}.` });
      return;
    }
    if (!role) {
      issues.push({ row: index + 2, message: `Role "${rawRole || "(empty)"}" is not recognized.` });
      return;
    }
    let scopeId: string | undefined;
    let scopeLabel: string | undefined;
    if (role === "section-admin" && rawScope) {
      const sectionMatch = rawScope.match(/(?:section\s*)?([a-e1-5])$/i);
      if (!sectionMatch) {
        issues.push({ row: index + 2, message: `Section scope "${rawScope}" is not recognized. Use Section A–E.` });
        return;
      }
      const letter = sectionMatch[1].toLowerCase();
      scopeId = `s${/[1-5]/.test(letter) ? letter : "abcde".indexOf(letter) + 1}`;
      scopeLabel = `Section ${/[1-5]/.test(letter) ? "ABCDE"[Number(letter) - 1] : letter.toUpperCase()}`;
    } else if ((role === "section-admin" || role === "event-head" || role === "judge") && !rawScope) {
      issues.push({ row: index + 2, message: `${role === "section-admin" ? "Section" : "Event"} scope is required.` });
      return;
    } else if (rawScope) {
      scopeLabel = rawScope;
      scopeId = rawScope.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    }
    assignments.push({ email, role, scopeId, scopeLabel, active: !["no", "inactive", "false", "disabled"].includes(rawActive) });
  });
  return { assignments, issues };
}

export function assignmentFromParsed(value: ParsedAssignment): RoleAssignment {
  return { ...value };
}

export function parseTextAssignments(text: string) {
  const lines = text.split(/\r?\n/).filter((line) => line.trim() && !line.trim().startsWith("#"));
  if (!lines.length) return { assignments: [], issues: [{ row: 1, message: "Add a header row and at least one assignment." }] };
  const separator = lines[0].includes("\t") ? "\t" : lines[0].includes(";") ? ";" : ",";
  const headers = lines[0].split(separator).map((cell) => cell.trim());
  const rows = lines.slice(1).map((line) => Object.fromEntries(line.split(separator).map((cell, index) => [headers[index] ?? `column-${index + 1}`, cell.trim()])));
  return normalizeAssignmentRows(rows);
}
