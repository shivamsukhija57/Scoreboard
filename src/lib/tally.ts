import type { CompetitionData, EventDefinition, EventTally, HuntMilestone, QuizMarking, SectionId, TallyEntry, TallyEntryKind } from "./domain";
// Explicit extension so the Node test runner (type stripping) can load it too.
import { recordPlacings } from "./placings.ts";

/**
 * Live tallies for the two placings events scored as they happen (2026 cultural rulebook):
 * - Quiz: one four-person team per division, five sections of six questions, bounce and pounce. Marks for direct
 *   answers, bounces and pounces (and any negative marking) are announced before the quiz. Level teams: a
 *   tie-breaker question or sudden death, so the organizer puts tied divisions in order with a note.
 * - Treasure hunt: each milestone pays most to the first team to complete it; milestone points are announced before
 *   the hunt; all members must be together at each milestone. Level totals: more first-place finishes ranks higher.
 * The final order is then recorded through the same placings mechanism as every other placings event.
 */

export const QUIZ_SECTIONS = 5;
export const QUIZ_QUESTIONS_PER_SECTION = 6;
export const QUIZ_QUESTIONS = QUIZ_SECTIONS * QUIZ_QUESTIONS_PER_SECTION;
export const DEFAULT_QUIZ_MARKING: QuizMarking = { direct: 10, bounce: 5, pounceRight: 10, pounceWrong: -5 };
export const DEFAULT_HUNT_POINTS = [10, 8, 6, 4, 2];
export const MAX_TALLY_ENTRIES = 1000;
export const MAX_MILESTONES = 30;
const QUIZ_KINDS = ["direct", "bounce", "pounce-right", "pounce-wrong"] as const;

export type TallyKind = EventTally["kind"];

export function tallyKindFor(event: Pick<EventDefinition, "sportId" | "pointsPolicy"> | undefined): TallyKind | null {
  if (!event || event.pointsPolicy.format !== "placings") return null;
  if (event.sportId === "quiz") return "quiz";
  if (event.sportId === "treasure-hunt") return "hunt";
  return null;
}

export function emptyTally(eventId: string, kind: TallyKind, divisions = 5): EventTally {
  return kind === "quiz"
    ? { eventId, kind, quiz: { ...DEFAULT_QUIZ_MARKING }, question: 1, entries: [], updatedAt: new Date().toISOString() }
    : { eventId, kind, milestones: [defaultMilestone(1, divisions)], entries: [], updatedAt: new Date().toISOString() };
}

function defaultMilestone(index: number, divisions = 5): HuntMilestone {
  return { id: `m${index}`, name: `Milestone ${index}`, points: DEFAULT_HUNT_POINTS.slice(0, divisions) };
}

export const activeEntries = (tally: Pick<EventTally, "entries"> | undefined): TallyEntry[] => (tally?.entries ?? []).filter((entry) => !entry.reversedAt);

export function quizPoints(marking: QuizMarking, kind: TallyEntryKind): number {
  return kind === "direct" ? marking.direct : kind === "bounce" ? marking.bounce : kind === "pounce-right" ? marking.pounceRight : kind === "pounce-wrong" ? marking.pounceWrong : 0;
}

/** The divisions that have checked in at a milestone, in arrival order. */
export function huntArrivals(tally: Pick<EventTally, "entries">, milestoneId: string): SectionId[] {
  return activeEntries(tally).filter((entry) => entry.kind === "arrival" && entry.milestoneId === milestoneId).map((entry) => entry.sectionId);
}

/** Points for arriving in `place` (1-based) at a milestone; places beyond the table pay nothing. */
export function huntPointsFor(milestone: Pick<HuntMilestone, "points">, place: number): number {
  const value = milestone.points[place - 1];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export interface TallyRow { sectionId: SectionId; total: number; firsts: number; entries: number }

/** Running totals for every division, best first: total, then (treasure hunt) more first-place milestones. */
export function tallyStandings(tally: Pick<EventTally, "kind" | "entries"> | undefined, sectionIds: SectionId[]): TallyRow[] {
  const active = activeEntries(tally);
  const rows = sectionIds.map((sectionId) => {
    const mine = active.filter((entry) => entry.sectionId === sectionId);
    return {
      sectionId,
      total: mine.reduce((sum, entry) => sum + entry.points, 0),
      firsts: mine.filter((entry) => entry.kind === "arrival" && entry.place === 1).length,
      entries: mine.length,
    };
  });
  const kind = tally?.kind ?? "quiz";
  return rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => compareRows(kind, a.row, b.row) || a.index - b.index)
    .map(({ row }) => row);
}

/** Negative when `a` ranks above `b`. Equal (0) means the rulebook can't separate them: a tie-breaker decides. */
export function compareRows(kind: TallyKind, a: Pick<TallyRow, "total" | "firsts">, b: Pick<TallyRow, "total" | "firsts">): number {
  return b.total - a.total || (kind === "hunt" ? b.firsts - a.firsts : 0);
}

/** Groups of divisions level after the rulebook's tie-break, in standings order (only groups of two or more). */
export function tieGroups(kind: TallyKind, rows: TallyRow[]): SectionId[][] {
  const groups: SectionId[][] = [];
  let current: TallyRow[] = [];
  for (const row of rows) {
    if (current.length && compareRows(kind, current[0], row) !== 0) { if (current.length > 1) groups.push(current.map((item) => item.sectionId)); current = []; }
    current.push(row);
  }
  if (current.length > 1) groups.push(current.map((item) => item.sectionId));
  return groups;
}

/**
 * Check an organizer's final order against the standings: every division once, nobody above a division that beat them.
 * Divisions level on the rulebook's tie-break may be in either order (settled by a tie-breaker question, sudden death,
 * or the hunt coordinator), and then a note saying how is required.
 */
export function checkFinishOrder(kind: TallyKind, rows: TallyRow[], order: SectionId[], note?: string): string | null {
  if (order.length !== rows.length || new Set(order).size !== order.length || !order.every((id) => rows.some((row) => row.sectionId === id))) return "Rank every division once.";
  const byId = new Map(rows.map((row) => [row.sectionId, row]));
  let tiesSettled = false;
  for (let index = 1; index < order.length; index += 1) {
    const comparison = compareRows(kind, byId.get(order[index - 1])!, byId.get(order[index])!);
    if (comparison > 0) return "That order doesn't match the totals. Only divisions level on the tie-break can swap places.";
    if (comparison === 0) tiesSettled = true;
  }
  if (tiesSettled && !note?.trim()) return kind === "quiz" ? "Say how the tie was settled (tie-breaker question or sudden death)." : "Say how the tie was settled.";
  return null;
}

export interface TallyInput {
  eventId?: unknown;
  action?: unknown;
  marking?: unknown;
  milestones?: unknown;
  sectionId?: unknown;
  kind?: unknown;
  milestoneId?: unknown;
  allPresent?: unknown;
  question?: unknown;
  reason?: unknown;
  order?: unknown;
  note?: unknown;
}

export type TallyResult = { error: string; status: number } | { tally: EventTally; detail: string; placings?: boolean };

const isInt = (value: unknown, min: number, max: number): value is number => typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
const text = (value: unknown, max: number): string | null => typeof value === "string" && value.trim().length > 0 && value.trim().length <= max ? value.trim() : null;

/**
 * Apply one scorer action to an event's tally. Permission (the event's head in scope, or a central admin) is
 * checked by the route; everything else is validated here. Mutates `data` on success.
 */
export function applyTallyAction(data: CompetitionData, input: TallyInput, actor: string): TallyResult {
  const event = data.events.find((item) => item.id === input.eventId);
  if (!event) return { error: "Event not found.", status: 404 };
  const kind = tallyKindFor(event);
  if (!kind) return { error: "Live tallies are for the quiz and the treasure hunt.", status: 400 };
  const sectionIds = data.sections.map((section) => section.id);
  data.tallies ??= {};
  const tally = data.tallies[event.id] ?? emptyTally(event.id, kind, sectionIds.length);
  if (tally.kind !== kind) return { error: "This tally belongs to a different kind of event.", status: 409 };
  const recorded = (data.bonusAwards ?? []).some((award) => award.eventId === event.id && award.kind === "placing");
  const active = activeEntries(tally);
  const now = new Date().toISOString();
  const name = (id: string) => data.sections.find((section) => section.id === id)?.name ?? id;
  let detail = "";

  if (input.action !== "finish" && recorded) return { error: "Results are recorded. A central admin can withdraw them to reopen scoring.", status: 409 };

  if (input.action === "settings" && kind === "quiz") {
    if (active.length) return { error: "Marks are locked once scoring starts. Undo every entry to change them.", status: 409 };
    const raw = (input.marking ?? {}) as Record<string, unknown>;
    if (!isInt(raw.direct, 0, 100) || !isInt(raw.bounce, 0, 100) || !isInt(raw.pounceRight, 0, 100) || !isInt(raw.pounceWrong, -100, 0)) return { error: "Marks are whole numbers from 0 to 100; a wrong pounce is 0 or less (down to −100).", status: 400 };
    tally.quiz = { direct: raw.direct, bounce: raw.bounce, pounceRight: raw.pounceRight, pounceWrong: raw.pounceWrong };
    detail = `${event.name} · marks set · direct ${raw.direct}, bounce ${raw.bounce}, pounce ${raw.pounceRight}/${raw.pounceWrong}`;
  } else if (input.action === "settings" && kind === "hunt") {
    if (!Array.isArray(input.milestones) || !input.milestones.length || input.milestones.length > MAX_MILESTONES) return { error: `Set between 1 and ${MAX_MILESTONES} milestones.`, status: 400 };
    const next: HuntMilestone[] = [];
    const usedIds = new Set<string>();
    for (const [index, item] of (input.milestones as unknown[]).entries()) {
      const raw = (item ?? {}) as Record<string, unknown>;
      const label = text(raw.name, 60);
      if (!label) return { error: `Give milestone ${index + 1} a name (up to 60 characters).`, status: 400 };
      if (!Array.isArray(raw.points) || raw.points.length !== sectionIds.length || !raw.points.every((value) => isInt(value, 0, 1000))) return { error: `Milestone ${index + 1} needs ${sectionIds.length} whole-number points, one per arrival place (0 to 1000).`, status: 400 };
      const existing = typeof raw.id === "string" ? tally.milestones?.find((milestone) => milestone.id === raw.id) : undefined;
      let id = existing?.id ?? "";
      if (!id) { let n = (tally.milestones?.length ?? 0) + index + 1; while (usedIds.has(`m${n}`) || tally.milestones?.some((milestone) => milestone.id === `m${n}`)) n += 1; id = `m${n}`; }
      if (usedIds.has(id)) return { error: "Each milestone can appear once.", status: 400 };
      usedIds.add(id);
      next.push({ id, name: label, points: raw.points as number[] });
    }
    // Points are announced before the hunt: once a team has checked in somewhere, that milestone's points stay put.
    for (const milestone of tally.milestones ?? []) {
      if (!huntArrivals(tally, milestone.id).length) continue;
      const kept = next.find((item) => item.id === milestone.id);
      if (!kept) return { error: `${milestone.name} already has check-ins and can't be removed.`, status: 409 };
      if (kept.points.join() !== milestone.points.join()) return { error: `${milestone.name} already has check-ins; its points are locked.`, status: 409 };
    }
    tally.milestones = next;
    detail = `${event.name} · milestones set · ${next.map((milestone) => `${milestone.name} ${milestone.points.join("/")}`).join("; ")}`;
  } else if (input.action === "question" && kind === "quiz") {
    if (!isInt(input.question, 1, QUIZ_QUESTIONS)) return { error: `Questions run from 1 to ${QUIZ_QUESTIONS}.`, status: 400 };
    tally.question = input.question;
    detail = `${event.name} · question ${input.question}`;
  } else if (input.action === "add") {
    if (typeof input.sectionId !== "string" || !sectionIds.includes(input.sectionId as SectionId)) return { error: "Choose a division.", status: 400 };
    if (tally.entries.length >= MAX_TALLY_ENTRIES) return { error: "This tally's log is full. Ask a central admin.", status: 409 };
    const sectionId = input.sectionId as SectionId;
    let entry: TallyEntry;
    if (kind === "quiz") {
      if (!QUIZ_KINDS.includes(input.kind as typeof QUIZ_KINDS[number])) return { error: "Choose direct, bounce, or pounce.", status: 400 };
      const entryKind = input.kind as TallyEntryKind;
      entry = { id: crypto.randomUUID(), sectionId, kind: entryKind, points: quizPoints(tally.quiz ?? DEFAULT_QUIZ_MARKING, entryKind), question: tally.question ?? 1, by: actor, at: now };
      detail = `${event.name} · Q${entry.question} · ${name(sectionId)} ${entryKind} ${entry.points >= 0 ? "+" : ""}${entry.points}`;
    } else {
      const milestone = tally.milestones?.find((item) => item.id === input.milestoneId);
      if (!milestone) return { error: "Choose a milestone.", status: 400 };
      if (input.allPresent !== true) return { error: "Tick that all the team's members are here. A team counts only when everyone has arrived together.", status: 400 };
      const arrivals = huntArrivals(tally, milestone.id);
      if (arrivals.includes(sectionId)) return { error: `${name(sectionId)} has already checked in at ${milestone.name}.`, status: 409 };
      const place = arrivals.length + 1;
      entry = { id: crypto.randomUUID(), sectionId, kind: "arrival", points: huntPointsFor(milestone, place), milestoneId: milestone.id, place, by: actor, at: now };
      detail = `${event.name} · ${milestone.name} · ${name(sectionId)} arrived ${place}${["st", "nd", "rd"][place - 1] ?? "th"} +${entry.points}`;
    }
    tally.entries.push(entry);
  } else if (input.action === "undo") {
    const reason = text(input.reason, 300);
    if (!reason) return { error: "Give a reason for the undo.", status: 400 };
    const last = active.at(-1);
    if (!last) return { error: "There's nothing to undo.", status: 400 };
    last.reversedAt = now;
    last.reverseReason = reason;
    detail = `${event.name} · undid ${name(last.sectionId)} ${last.kind} ${last.points >= 0 ? "+" : ""}${last.points} · ${reason}`;
  } else if (input.action === "finish") {
    if (!active.length) return { error: "Nothing has been scored yet.", status: 400 };
    const rows = tallyStandings(tally, sectionIds);
    if (!Array.isArray(input.order) || !input.order.every((id) => typeof id === "string")) return { error: "Rank every division once.", status: 400 };
    const note = typeof input.note === "string" ? input.note : undefined;
    const problem = checkFinishOrder(kind, rows, input.order as SectionId[], note);
    if (problem) return { error: problem, status: 400 };
    const result = recordPlacings(data, { eventId: event.id, order: input.order, note }, actor);
    if ("error" in result) return result;
    detail = `${result.detail} · from the live ${kind === "quiz" ? "quiz" : "hunt"} tally`;
    tally.updatedAt = now;
    data.tallies[event.id] = tally;
    return { tally, detail, placings: true };
  } else {
    return { error: "Unknown tally action.", status: 400 };
  }
  tally.updatedAt = now;
  data.tallies[event.id] = tally;
  return { tally, detail };
}
