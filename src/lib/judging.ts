import type { AnnouncedRow, CompetitionData, EventDefinition, EventJudging, JudgeSheet, JudgingCombine, JudgingCriterion, JudgingMethod, JudgingPenalty, JudgingPenaltyKind, RoleAssignment, SectionId } from "./domain";
// Explicit extension so the Node test runner (type stripping) can load it too.
import { recordPlacings } from "./placings.ts";

/**
 * Judged Stage events (2026 cultural rulebook): judges mark each division on their phones, or the coordinator types
 * the final totals. Marks stay sealed until the coordinator announces; then the order is recorded as placings.
 *
 * - A division's score is the average of the judges who submitted (or their sum), criterion by criterion, then
 *   added across its participants or artworks (Poetry: participants added; Colour Roulette: three artworks added).
 * - Penalties: marks off, a percentage off the judges' score, or disqualification (no points, not even 5th).
 * - Divisions level after penalties are put in order by the committee, with a note saying how.
 * - Criteria and maximums lock once any judge has submitted; "Edit anyway" clears submitted marks for re-marking.
 */

export const MAX_CRITERIA = 12;
export const MAX_JUDGES = 9;
export const MAX_ITEMS = 5;
export const MAX_PENALTIES = 60;
const EPSILON = 1e-6;

const round6 = (value: number) => Math.round(value * 1e6) / 1e6;
export const round2 = (value: number) => Math.round(value * 100) / 100;

/** Placings events marked by judges: every Stage placings event except the live-scored quiz and treasure hunt. */
export function isJudgedEvent(data: Pick<CompetitionData, "sports">, event: Pick<EventDefinition, "sportId" | "pointsPolicy"> | undefined): boolean {
  if (!event || event.pointsPolicy.format !== "placings") return false;
  if (event.sportId === "quiz" || event.sportId === "treasure-hunt") return false;
  return data.sports.find((sport) => sport.id === event.sportId)?.category === "cultural";
}

const criteria = (list: Array<[string, number]>): JudgingCriterion[] => list.map(([name, max], index) => ({ id: `c${index + 1}`, name, max }));

/** Rulebook defaults for an event's judging; a central admin can change any of it. */
export function defaultJudging(event: Pick<EventDefinition, "id" | "sportId">, sectionIds: SectionId[]): EventJudging {
  const base = { eventId: event.id, method: "judges" as JudgingMethod, judgeCount: 3, items: 1, combine: "average" as JudgingCombine, order: [...sectionIds], judges: [], sheets: [], penalties: [], updatedAt: new Date(0).toISOString() };
  if (event.id === "culture-battle-of-bands") return { ...base, criteria: criteria([["Vocal quality", 15], ["Use of instruments", 20], ["Group dynamics", 20], ["Song arrangement", 10], ["Creativity and versatility", 15], ["Stage presence", 10], ["Keeping to time", 10]]) };
  if (event.sportId === "short-film") return { ...base, criteria: criteria([["Story and concept", 25], ["Direction and cinematography", 25], ["Editing and sound", 20], ["Performance and production design", 20], ["Audience impact", 10]]) };
  if (event.sportId === "dance") return { ...base, criteria: criteria([["Choreography and creativity", 50], ["Technique and execution", 50]]) };
  if (event.sportId === "stage-play") return { ...base, criteria: criteria([["Script and concept", 25], ["Acting", 25], ["Creative elements and participation", 25], ["Audience engagement", 25]]) };
  if (event.sportId === "poetry") return { ...base, items: 1, itemLabel: "Participant", criteria: criteria([["Content", 10], ["Use of the topic", 10], ["Creativity", 10], ["Delivery", 10]]) };
  if (event.sportId === "art") return { ...base, items: 3, itemLabel: "Artwork", criteria: criteria([["Artwork", 100]]) };
  if (event.sportId === "roast-comedy") return { ...base, criteria: criteria([["Round 1", 20], ["Round 2", 20], ["Round 3", 20]]) };
  return { ...base, criteria: criteria([["Overall", 100]]) };
}

/** The stored judging for an event, or its defaults (not saved until something changes). */
export function judgingFor(data: Pick<CompetitionData, "judging" | "sections">, event: Pick<EventDefinition, "id" | "sportId">): EventJudging {
  return data.judging?.[event.id] ?? defaultJudging(event, data.sections.map((section) => section.id));
}

/** Penalties the rulebook names for an event, offered as quick picks on the results desk. */
export function penaltyPresets(event: Pick<EventDefinition, "id" | "sportId">): Array<{ label: string; kind: JudgingPenaltyKind; value: number }> {
  const noShow = { label: "Didn't take part", kind: "disqualify" as const, value: 0 };
  if (event.id === "culture-group-dance") return [{ label: "Over the 7-minute limit", kind: "marks", value: 10 }, { label: "Inappropriate gestures, profanity or unsafe stunts", kind: "disqualify", value: 0 }, noShow];
  if (event.sportId === "dance") return [{ label: "Over time", kind: "marks", value: 10 }, noShow];
  if (event.sportId === "stage-play") return [{ label: "Over 15 minutes", kind: "marks", value: 10 }, { label: "Damage to the stage or equipment", kind: "percent", value: 10 }, { label: "Flammable items or alcohol", kind: "disqualify", value: 0 }, noShow];
  return [noShow];
}

export const criteriaTotal = (judging: Pick<EventJudging, "criteria">) => judging.criteria.reduce((sum, item) => sum + item.max, 0);
/** The most a division can score: every criterion at its maximum, for each item (and each judge when marks are added). */
export function maxScore(judging: Pick<EventJudging, "criteria" | "items" | "combine" | "judgeCount">): number {
  return criteriaTotal(judging) * judging.items * (judging.combine === "sum" ? judging.judgeCount : 1);
}

export const submittedSheets = (judging: Pick<EventJudging, "sheets">, sectionId?: SectionId) => judging.sheets.filter((sheet) => !sectionId || sheet.sectionId === sectionId);
/** Criteria and maximums lock once any judge has submitted marks. */
export const criteriaLocked = (judging: Pick<EventJudging, "sheets">) => judging.sheets.length > 0;
/** A judge is "in" once they've submitted marks for every division. */
export function judgesIn(judging: Pick<EventJudging, "judges" | "sheets" | "order">): string[] {
  return judging.judges.filter((judge) => judging.order.every((sectionId) => judging.sheets.some((sheet) => sheet.judge === judge && sheet.sectionId === sectionId)));
}

export interface ScoreRow {
  sectionId: SectionId;
  /** Combined judges' score before penalties; null while no judge has marked this division (or no total is entered). */
  score: number | null;
  /** Combined marks per criterion, summed across items; null when unknown. */
  criteria: number[] | null;
  /** Combined score of each item (participant or artwork). */
  itemScores: number[] | null;
  judges: number;
  marksOff: number;
  percentOff: number;
  disqualified: boolean;
  final: number | null;
}

function combine(values: number[], how: JudgingCombine): number {
  const sum = values.reduce((total, value) => total + value, 0);
  return how === "sum" ? sum : sum / values.length;
}

/** Every division's score, penalties and final mark, in performance order. */
export function scoreRows(judging: EventJudging, sectionIds: SectionId[]): ScoreRow[] {
  return sectionIds.map((sectionId) => {
    let score: number | null = null;
    let criteriaScores: number[] | null = null;
    let itemScores: number[] | null = null;
    let judges = 0;
    if (judging.method === "judges") {
      const sheets = submittedSheets(judging, sectionId).filter((sheet) => sheet.scores.length === judging.items && sheet.scores.every((row) => row.length === judging.criteria.length));
      judges = sheets.length;
      if (sheets.length) {
        criteriaScores = judging.criteria.map((_, c) => round6(combine(sheets.map((sheet) => sheet.scores.reduce((sum, row) => sum + row[c], 0)), judging.combine)));
        itemScores = Array.from({ length: judging.items }, (_, i) => round6(combine(sheets.map((sheet) => sheet.scores[i].reduce((sum, value) => sum + value, 0)), judging.combine)));
        score = round6(itemScores.reduce((sum, value) => sum + value, 0));
      }
    } else {
      const entered = judging.entered?.[sectionId];
      if (entered) { score = entered.total; criteriaScores = entered.criteria ?? null; }
    }
    const penalties = judging.penalties.filter((penalty) => penalty.sectionId === sectionId);
    const marksOff = penalties.filter((penalty) => penalty.kind === "marks").reduce((sum, penalty) => sum + penalty.value, 0);
    const percentOff = Math.min(100, penalties.filter((penalty) => penalty.kind === "percent").reduce((sum, penalty) => sum + penalty.value, 0));
    const disqualified = penalties.some((penalty) => penalty.kind === "disqualify");
    const final = score === null ? null : round6(Math.max(0, score - marksOff - score * percentOff / 100));
    return { sectionId, score, criteria: criteriaScores, itemScores, judges, marksOff, percentOff, disqualified, final };
  });
}

/** Divisions that can be placed, best first (ties keep performance order). Disqualified and unmarked divisions are left out. */
export function rankedRows(rows: ScoreRow[]): ScoreRow[] {
  return rows.map((row, index) => ({ row, index })).filter(({ row }) => !row.disqualified && row.final !== null)
    .sort((a, b) => (b.row.final! - a.row.final!) || a.index - b.index).map(({ row }) => row);
}

const level = (a: ScoreRow, b: ScoreRow) => Math.abs((a.final ?? 0) - (b.final ?? 0)) < EPSILON;

/** Groups of divisions level on their final mark (only groups of two or more), best first. */
export function scoreTies(ranked: ScoreRow[]): SectionId[][] {
  const groups: SectionId[][] = [];
  let current: ScoreRow[] = [];
  for (const row of ranked) {
    if (current.length && !level(current[0], row)) { if (current.length > 1) groups.push(current.map((item) => item.sectionId)); current = []; }
    current.push(row);
  }
  if (current.length > 1) groups.push(current.map((item) => item.sectionId));
  return groups;
}

/** Check the order to announce: every placeable division once, in mark order; level divisions may swap, with a committee note. */
export function checkAnnounceOrder(ranked: ScoreRow[], order: SectionId[], note?: string): string | null {
  if (order.length !== ranked.length || new Set(order).size !== order.length || !order.every((id) => ranked.some((row) => row.sectionId === id))) return "Put every division that's being placed in order once.";
  const byId = new Map(ranked.map((row) => [row.sectionId, row]));
  for (let index = 1; index < order.length; index += 1) {
    const above = byId.get(order[index - 1])!;
    const below = byId.get(order[index])!;
    if ((below.final ?? 0) - (above.final ?? 0) > EPSILON) return "That order doesn't match the marks. Only divisions level on marks can swap places.";
  }
  if (scoreTies(ranked).length && !note?.trim()) return "Some divisions are level. Add the committee's note saying how the tie was settled.";
  return null;
}

/** What may still block announcing: unmarked divisions, or nothing to place. */
export function announceBlocker(judging: EventJudging, rows: ScoreRow[]): string | null {
  const missing = rows.filter((row) => !row.disqualified && row.final === null);
  if (missing.length) return judging.method === "judges" ? "Every division needs marks from at least one judge, or a disqualification." : "Enter a total for every division, or disqualify the ones that didn't take part.";
  if (!rows.some((row) => !row.disqualified)) return "Every division is disqualified; there's no one to place.";
  return null;
}

// ---------- validation ----------

const isNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
/** Marks are whole or half marks (and tenths for averages typed in score entry). */
const isMark = (value: unknown, max: number, step = 0.5): value is number => isNumber(value) && value >= 0 && value <= max && Math.abs(value / step - Math.round(value / step)) < 1e-9;
const isInt = (value: unknown, min: number, max: number): value is number => typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
const text = (value: unknown, max: number): string | null => typeof value === "string" && value.trim().length > 0 && value.trim().length <= max ? value.trim() : null;

export function canJudgeEvent(assignments: RoleAssignment[], eventId: string): boolean {
  return assignments.some((assignment) => assignment.active && assignment.role === "judge" && !!assignment.scopeId && (assignment.scopeId === eventId || eventId.startsWith(`${assignment.scopeId}-`)));
}

export interface JudgingInput {
  eventId?: unknown;
  action?: unknown;
  method?: unknown;
  criteria?: unknown;
  judgeCount?: unknown;
  items?: unknown;
  combine?: unknown;
  force?: unknown;
  reason?: unknown;
  order?: unknown;
  sectionId?: unknown;
  scores?: unknown;
  comment?: unknown;
  kind?: unknown;
  value?: unknown;
  penaltyId?: unknown;
  judge?: unknown;
  entries?: unknown;
  note?: unknown;
}

export type JudgingRole = { central: boolean; coordinator: boolean; judge: boolean };
export type JudgingResult = { error: string; status: number } | { judging: EventJudging; detail: string; announced?: boolean };

export const JUDGE_ACTIONS = ["submit"] as const;
export const COORDINATOR_ACTIONS = ["order", "penalty-add", "penalty-remove", "unlock", "enter", "announce"] as const;
export const ADMIN_ACTIONS = ["settings"] as const;

/**
 * Apply one judging action. The route works out who the actor is (central admin, coordinator = the event's head or a
 * central admin, judge = assigned to judge this event); permission per action and every input are checked here.
 * Mutates `data` on success.
 */
export function applyJudgingAction(data: CompetitionData, input: JudgingInput, actor: string, who: JudgingRole): JudgingResult {
  const event = data.events.find((item) => item.id === input.eventId);
  if (!event) return { error: "Event not found.", status: 404 };
  if (!isJudgedEvent(data, event)) return { error: "Judging is for the Stage's judged events.", status: 400 };
  const sectionIds = data.sections.map((section) => section.id);
  const judging: EventJudging = structuredClone(judgingFor(data, event));
  const action = String(input.action);
  const now = new Date().toISOString();
  const name = (id: string) => data.sections.find((section) => section.id === id)?.name ?? id;
  const recorded = (data.bonusAwards ?? []).some((award) => award.eventId === event.id && award.kind === "placing");
  if (recorded) return { error: "Results are announced. A central admin can withdraw them to reopen judging.", status: 409 };
  const isSection = (value: unknown): value is SectionId => typeof value === "string" && sectionIds.includes(value as SectionId);
  const judgeLabel = (email: string) => `Judge ${judging.judges.indexOf(email) + 1}`;
  let detail = "";

  if ((ADMIN_ACTIONS as readonly string[]).includes(action) && !who.central) return { error: "Only a central admin can change judging settings.", status: 403 };
  if ((COORDINATOR_ACTIONS as readonly string[]).includes(action) && !who.coordinator) return { error: "Only this event's head or a central admin can run the results desk.", status: 403 };
  if ((JUDGE_ACTIONS as readonly string[]).includes(action) && !who.judge) return { error: "Only this event's judges can submit marks.", status: 403 };

  if (action === "settings") {
    const changes: string[] = [];
    if (input.method !== undefined) {
      if (input.method !== "judges" && input.method !== "entry") return { error: "Choose judges marking in the app, or scores entered by the coordinator.", status: 400 };
      if (input.method !== judging.method) {
        const reason = text(input.reason, 300);
        if (!reason) return { error: "Give a reason for switching how this event is judged.", status: 400 };
        judging.method = input.method;
        changes.push(`method ${input.method === "judges" ? "judges mark in the app" : "coordinator enters scores"} (${reason}); ${judging.sheets.length} submitted mark sheet${judging.sheets.length === 1 ? "" : "s"} kept for the record`);
      }
    }
    if (input.judgeCount !== undefined) {
      if (!isInt(input.judgeCount, 1, MAX_JUDGES)) return { error: `Judges: a whole number from 1 to ${MAX_JUDGES}.`, status: 400 };
      if (input.judgeCount < judging.judges.length) return { error: `${judging.judges.length} judges have already marked; the count can't go below that.`, status: 409 };
      if (input.judgeCount !== judging.judgeCount) { changes.push(`judges ${judging.judgeCount} → ${input.judgeCount}`); judging.judgeCount = input.judgeCount; }
    }
    if (input.combine !== undefined) {
      if (input.combine !== "average" && input.combine !== "sum") return { error: "Combine marks by average or by sum.", status: 400 };
      if (input.combine !== judging.combine) { changes.push(`marks combine by ${input.combine}`); judging.combine = input.combine; }
    }
    let shapeChanged = false;
    if (input.items !== undefined) {
      if (!isInt(input.items, 1, MAX_ITEMS)) return { error: `Marked per division: a whole number from 1 to ${MAX_ITEMS}.`, status: 400 };
      if (input.items !== judging.items) { shapeChanged = true; changes.push(`${(judging.itemLabel ?? "entries").toLowerCase()}s per division ${judging.items} → ${input.items}`); judging.items = input.items; }
    }
    if (input.criteria !== undefined) {
      if (!Array.isArray(input.criteria) || !input.criteria.length || input.criteria.length > MAX_CRITERIA) return { error: `Set between 1 and ${MAX_CRITERIA} criteria.`, status: 400 };
      const next: JudgingCriterion[] = [];
      for (const [index, raw] of (input.criteria as unknown[]).entries()) {
        const item = (raw ?? {}) as Record<string, unknown>;
        const label = text(item.name, 60);
        if (!label) return { error: `Give criterion ${index + 1} a name (up to 60 characters).`, status: 400 };
        if (!isInt(item.max, 1, 1000)) return { error: `${label}: the maximum is a whole number from 1 to 1000.`, status: 400 };
        next.push({ id: `c${index + 1}`, name: label, max: item.max });
      }
      const same = next.length === judging.criteria.length && next.every((item, index) => item.name === judging.criteria[index].name && item.max === judging.criteria[index].max);
      if (!same) { shapeChanged = true; changes.push(`criteria ${next.map((item) => `${item.name} ${item.max}`).join(", ")}`); judging.criteria = next; }
    }
    if (shapeChanged && criteriaLocked(judging)) {
      const reason = text(input.reason, 300);
      if (input.force !== true || !reason) return { error: "Judges have submitted marks, so criteria and maximums are locked. Use Edit anyway with a reason; submitted marks are cleared for re-marking.", status: 409 };
      changes.push(`edited anyway (${reason}); ${judging.sheets.length} submitted mark sheet${judging.sheets.length === 1 ? "" : "s"} cleared for re-marking`);
      judging.sheets = [];
    }
    if (shapeChanged && judging.entered) {
      // Typed per-criterion totals no longer line up with the criteria; keep the totals.
      for (const value of Object.values(judging.entered)) if (value) delete value.criteria;
    }
    if (!changes.length) return { error: "Nothing changed.", status: 400 };
    detail = `${event.name} · judging · ${changes.join(" · ")}`;
  } else if (action === "order") {
    if (!Array.isArray(input.order) || input.order.length !== sectionIds.length || new Set(input.order).size !== sectionIds.length || !input.order.every(isSection)) return { error: "Put every division in the performance order once.", status: 400 };
    judging.order = [...input.order] as SectionId[];
    detail = `${event.name} · performance order ${judging.order.map((id) => data.sections.find((section) => section.id === id)?.code ?? id).join(", ")}`;
  } else if (action === "submit") {
    if (judging.method !== "judges") return { error: "This event's scores are entered by the coordinator, so there's nothing to mark here.", status: 409 };
    if (!isSection(input.sectionId)) return { error: "Choose the division you're marking.", status: 400 };
    const sectionId = input.sectionId;
    if (judging.sheets.some((sheet) => sheet.judge === actor && sheet.sectionId === sectionId)) return { error: `You've already submitted marks for ${name(sectionId)}. Ask the coordinator to reopen them.`, status: 409 };
    if (!judging.judges.includes(actor)) {
      if (judging.judges.length >= judging.judgeCount) return { error: `This event already has ${judging.judgeCount} judges marking. Ask a central admin to raise the judge count.`, status: 409 };
      judging.judges.push(actor);
    }
    const scores = input.scores;
    if (!Array.isArray(scores) || scores.length !== judging.items) return { error: `Mark ${judging.items} ${judging.items === 1 ? "entry" : "entries"} for this division.`, status: 400 };
    for (const row of scores as unknown[]) {
      if (!Array.isArray(row) || row.length !== judging.criteria.length) return { error: "Mark every criterion.", status: 400 };
      for (const [c, value] of (row as unknown[]).entries()) if (!isMark(value, judging.criteria[c].max)) return { error: `${judging.criteria[c].name}: marks run from 0 to ${judging.criteria[c].max}, in whole or half marks.`, status: 400 };
    }
    if (input.comment !== undefined && input.comment !== null && typeof input.comment !== "string") return { error: "The note must be text.", status: 400 };
    const comment = typeof input.comment === "string" ? input.comment.trim().slice(0, 500) : "";
    const sheet: JudgeSheet = { judge: actor, sectionId, scores: (scores as number[][]).map((row) => [...row]), ...(comment ? { comment } : {}), submittedAt: now };
    judging.sheets.push(sheet);
    // Sealed: the audit says who marked whom, never the marks.
    detail = `${event.name} · ${judgeLabel(actor)} submitted marks for ${name(sectionId)}`;
  } else if (action === "unlock") {
    const reason = text(input.reason, 300);
    if (!reason) return { error: "Give a reason for reopening a judge's marks.", status: 400 };
    if (!isInt(input.judge, 1, judging.judges.length)) return { error: "Choose the judge to reopen.", status: 400 };
    const email = judging.judges[input.judge - 1];
    if (input.sectionId !== undefined && !isSection(input.sectionId)) return { error: "Choose a valid division.", status: 400 };
    const before = judging.sheets.length;
    judging.sheets = judging.sheets.filter((sheet) => !(sheet.judge === email && (input.sectionId === undefined || sheet.sectionId === input.sectionId)));
    if (judging.sheets.length === before) return { error: "That judge has no submitted marks to reopen.", status: 404 };
    detail = `${event.name} · reopened Judge ${input.judge}'s marks${input.sectionId ? ` for ${name(input.sectionId as string)}` : ""} · ${reason}`;
  } else if (action === "penalty-add") {
    if (!isSection(input.sectionId)) return { error: "Choose the division.", status: 400 };
    if (input.kind !== "marks" && input.kind !== "percent" && input.kind !== "disqualify") return { error: "Choose marks off, percent off, or disqualification.", status: 400 };
    const reason = text(input.reason, 200);
    if (!reason) return { error: "Say what the penalty is for.", status: 400 };
    let value = 0;
    if (input.kind === "marks") { if (!isMark(input.value, 1000) || (input.value as number) <= 0) return { error: "Marks off: a number above 0, in whole or half marks.", status: 400 }; value = input.value as number; }
    if (input.kind === "percent") { if (!isInt(input.value, 1, 100)) return { error: "Percent off: a whole number from 1 to 100.", status: 400 }; value = input.value; }
    if (judging.penalties.length >= MAX_PENALTIES) return { error: "This event has too many penalties recorded. Ask a central admin.", status: 409 };
    if (input.kind === "disqualify" && judging.penalties.some((penalty) => penalty.sectionId === input.sectionId && penalty.kind === "disqualify")) return { error: `${name(input.sectionId)} is already disqualified.`, status: 409 };
    const penalty: JudgingPenalty = { id: crypto.randomUUID(), sectionId: input.sectionId, kind: input.kind, value, reason, by: actor, at: now };
    judging.penalties.push(penalty);
    detail = `${event.name} · penalty · ${name(penalty.sectionId)} ${penaltyText(penalty)} · ${reason}`;
  } else if (action === "penalty-remove") {
    const reason = text(input.reason, 300);
    if (!reason) return { error: "Give a reason for removing the penalty.", status: 400 };
    const penalty = judging.penalties.find((item) => item.id === input.penaltyId);
    if (!penalty) return { error: "That penalty no longer exists.", status: 404 };
    judging.penalties = judging.penalties.filter((item) => item.id !== penalty.id);
    detail = `${event.name} · removed penalty · ${name(penalty.sectionId)} ${penaltyText(penalty)} · ${reason}`;
  } else if (action === "enter") {
    if (judging.method !== "entry") return { error: "Judges mark this event in the app. Switch to score entry first.", status: 409 };
    if (!Array.isArray(input.entries) || !input.entries.length || input.entries.length > sectionIds.length) return { error: "Enter at least one division's total.", status: 400 };
    const top = maxScore(judging);
    const next = { ...(judging.entered ?? {}) };
    const seen = new Set<string>();
    for (const raw of input.entries as unknown[]) {
      const item = (raw ?? {}) as Record<string, unknown>;
      if (!isSection(item.sectionId) || seen.has(item.sectionId)) return { error: "Enter each division once.", status: 400 };
      seen.add(item.sectionId);
      if (item.total === null) { delete next[item.sectionId]; continue; }
      if (!isMark(item.total, top, 0.01)) return { error: `${name(item.sectionId)}: the total runs from 0 to ${top}, to two decimal places.`, status: 400 };
      let criteriaTotals: number[] | undefined;
      if (item.criteria !== undefined && item.criteria !== null) {
        const perItem = judging.items * (judging.combine === "sum" ? judging.judgeCount : 1);
        if (!Array.isArray(item.criteria) || item.criteria.length !== judging.criteria.length || !item.criteria.every((value, c) => isMark(value, judging.criteria[c].max * perItem, 0.01))) return { error: `${name(item.sectionId)}: each criterion total runs from 0 to its maximum.`, status: 400 };
        criteriaTotals = [...(item.criteria as number[])];
        const sum = criteriaTotals.reduce((total, value) => total + value, 0);
        if (Math.abs(sum - (item.total as number)) > 0.011) return { error: `${name(item.sectionId)}: the criteria add up to ${round2(sum)}, not ${item.total}.`, status: 400 };
      }
      next[item.sectionId] = { total: item.total as number, ...(criteriaTotals ? { criteria: criteriaTotals } : {}) };
    }
    judging.entered = next;
    detail = `${event.name} · totals entered for ${[...seen].map(name).join(", ")}`;
  } else if (action === "announce") {
    const rows = scoreRows(judging, judging.order.length === sectionIds.length ? judging.order : sectionIds);
    const blocker = announceBlocker(judging, rows);
    if (blocker) return { error: blocker, status: 409 };
    const ranked = rankedRows(rows);
    if (!Array.isArray(input.order) || !input.order.every((id) => typeof id === "string")) return { error: "Put every division that's being placed in order once.", status: 400 };
    if (input.note !== undefined && typeof input.note !== "string") return { error: "The note must be text.", status: 400 };
    const note = typeof input.note === "string" ? input.note.trim() : "";
    if (note.length > 300) return { error: "Keep the note under 300 characters.", status: 400 };
    const problem = checkAnnounceOrder(ranked, input.order as SectionId[], note);
    if (problem) return { error: problem, status: 400 };
    const result = recordPlacings(data, { eventId: event.id, order: input.order, note: note || undefined }, actor);
    if ("error" in result) return result;
    const awards = new Map(result.awards.map((award) => [award.sectionId, award]));
    const published: AnnouncedRow[] = rows.map((row) => {
      const award = awards.get(row.sectionId);
      const penalties = judging.penalties.filter((penalty) => penalty.sectionId === row.sectionId).map(penaltyText);
      return { sectionId: row.sectionId, ...(award ? { place: award.place } : {}), points: award?.points ?? 0, score: row.score === null ? null : round2(row.score), final: row.final === null || row.disqualified ? null : round2(row.final), ...(penalties.length ? { penalty: penalties.join(", ") } : {}), disqualified: row.disqualified, ...(row.criteria ? { criteria: row.criteria.map(round2) } : {}) };
    }).sort((a, b) => (a.place ?? 99) - (b.place ?? 99));
    judging.announced = { at: now, by: actor, ...(note ? { note } : {}), rows: published };
    detail = `${result.detail} · announced from the results desk${judging.method === "judges" ? ` · ${judgesIn(judging).length} of ${judging.judgeCount} judges in` : " · totals entered by the coordinator"}${rows.some((row) => row.disqualified) ? ` · disqualified ${rows.filter((row) => row.disqualified).map((row) => name(row.sectionId)).join(", ")}` : ""}`;
    judging.updatedAt = now;
    data.judging = { ...(data.judging ?? {}), [event.id]: judging };
    return { judging, detail, announced: true };
  } else {
    return { error: "Unknown judging action.", status: 400 };
  }
  judging.updatedAt = now;
  data.judging = { ...(data.judging ?? {}), [event.id]: judging };
  return { judging, detail };
}

export function penaltyText(penalty: Pick<JudgingPenalty, "kind" | "value">): string {
  return penalty.kind === "marks" ? `−${penalty.value} marks` : penalty.kind === "percent" ? `−${penalty.value}%` : "disqualified";
}

/** After a central admin withdraws announced results, the desk reopens with the marks and penalties as they were. */
export function reopenJudging(data: CompetitionData, eventId: string): void {
  const judging = data.judging?.[eventId];
  if (!judging?.announced) return;
  delete judging.announced;
  judging.updatedAt = new Date().toISOString();
}

export interface JudgingViewer { email: string; central: boolean; coordinates: (eventId: string) => boolean; judges: (eventId: string) => boolean }

/**
 * What each person may see. Coordinators (the event's head, central admins): everything, with judges shown as
 * "Judge 1, 2, …" to non-central coordinators. Judges: the settings and their own marks only. Everyone else: the
 * settings and, once announced, the announced result. Individual judges' marks are never published.
 */
export function presentJudging(all: Record<string, EventJudging> | undefined, viewer: JudgingViewer): Record<string, EventJudging> | undefined {
  if (!all) return all;
  return Object.fromEntries(Object.entries(all).map(([eventId, judging]) => {
    const announced = judging.announced && { ...judging.announced, by: viewer.central ? judging.announced.by : "Organizer" };
    if (viewer.central) return [eventId, judging];
    const label = (email: string) => `Judge ${judging.judges.indexOf(email) + 1}`;
    if (viewer.coordinates(eventId)) {
      return [eventId, { ...judging, announced, judges: judging.judges.map(label), sheets: judging.sheets.map((sheet) => ({ ...sheet, judge: label(sheet.judge) })), penalties: judging.penalties.map((penalty) => ({ ...penalty, by: "Organizer" })) }];
    }
    const own = viewer.judges(eventId);
    const sealed: EventJudging = { ...judging, announced, judges: own ? judging.judges.map((email) => (email === viewer.email ? email : label(email))) : [], sheets: own ? judging.sheets.filter((sheet) => sheet.judge === viewer.email) : [], penalties: [], entered: undefined };
    return [eventId, sealed];
  }));
}
