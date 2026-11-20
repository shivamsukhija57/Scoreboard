import type { CompetitionData, EventDefinition, Fixture, SectionId } from "./domain";
// Explicit extension so the Node test runner (type stripping) can load it too.
import { findClashes, istDateTime } from "./schedule-tools.ts";

/**
 * Fixture import: reads rows from the fixtures template (or pasted CSV/TSV with the same columns), matches them to
 * events and divisions, checks them, and compares them with the fixtures already on the schedule so a re-upload
 * only adds what's new and moves what changed. Nothing here touches storage; the routes do that.
 */

export const IMPORT_MAX_BYTES = 1_000_000;
export const IMPORT_MAX_ROWS = 600;
const MAX_CELL_LENGTH = 200;
const MAX_VENUE_LENGTH = 80;
export const DEFAULT_DURATION = 60;

export type Cell = string | number;
export const IMPORT_FIELDS = ["event", "date", "time", "duration", "venue", "divisionA", "divisionB", "stage", "group", "notes"] as const;
export type ImportField = (typeof IMPORT_FIELDS)[number];
export type RawRow = { row: number } & Record<ImportField, Cell>;
export type Stage = NonNullable<Fixture["stage"]>;

const HEADER_ALIASES: Record<ImportField, string[]> = {
  event: ["event", "sport event", "sport and event", "sport"],
  date: ["date", "day", "match date", "date ist"],
  time: ["start time", "time", "start", "starts", "start time ist", "time ist", "kick off"],
  duration: ["duration min", "duration", "duration minutes", "minutes", "mins", "length min"],
  venue: ["venue", "court", "ground", "place", "location"],
  divisionA: ["division a", "div a", "section a", "team a", "side a"],
  divisionB: ["division b", "div b", "section b", "team b", "side b"],
  stage: ["stage", "round", "tournament stage"],
  group: ["group", "pool"],
  notes: ["notes", "note", "comments", "comment", "remarks"],
};

const headerKey = (value: unknown) => String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Which import field each column holds; null for columns the import ignores. */
export function mapHeaders(headers: unknown[]): Array<ImportField | null> {
  const used = new Set<ImportField>();
  return headers.map((header) => {
    const key = headerKey(header);
    const field = IMPORT_FIELDS.find((name) => !used.has(name) && HEADER_ALIASES[name].includes(key));
    if (field) used.add(field);
    return field ?? null;
  });
}

/** True when the mapped headers look like the template's header row. */
export function looksLikeHeader(map: Array<ImportField | null>): boolean {
  return map.includes("event") && map.includes("divisionA") && map.includes("divisionB");
}

/** Template column order, used for pasted rows without a header line. */
const TEMPLATE_ORDER: ImportField[] = [...IMPORT_FIELDS];

/** Turns one spreadsheet cell (exceljs value, or plain text) into a string or number the parsers understand. */
export function normalizeCell(value: unknown): Cell {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return Number.isFinite(value) ? value : "";
  if (typeof value === "string") return value.trim().slice(0, MAX_CELL_LENGTH);
  if (typeof value === "boolean") return String(value);
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return "";
    // Excel stores times as a fraction of a day; exceljs gives them as dates on 30 Dec 1899 (UTC).
    const minuteOfDay = Math.round((value.getTime() - Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate())) / 60_000);
    const day = new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()) + (minuteOfDay >= 1440 ? 86_400_000 : 0));
    const time = timeOfMinutes(minuteOfDay % 1440);
    if (value.getUTCFullYear() < 1901) return time;
    const date = day.toISOString().slice(0, 10);
    return minuteOfDay % 1440 ? `${date}T${time}` : date;
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    if ("result" in record) return normalizeCell(record.result);
    if (Array.isArray(record.richText)) return normalizeCell(record.richText.map((part) => String((part as { text?: unknown }).text ?? "")).join(""));
    if ("text" in record) return normalizeCell(record.text);
    return "";
  }
  return "";
}

function emptyRow(row: number): RawRow {
  return { row, event: "", date: "", time: "", duration: "", venue: "", divisionA: "", divisionB: "", stage: "", group: "", notes: "" };
}

/** Builds raw rows from a header row and data rows (cells already normalized). Empty rows are dropped. */
export function rowsFromTable(headers: unknown[], body: Array<{ row: number; cells: Cell[] }>): RawRow[] {
  const map = mapHeaders(headers);
  const rows: RawRow[] = [];
  for (const { row, cells } of body) {
    const raw = emptyRow(row);
    map.forEach((field, index) => { if (field) raw[field] = cells[index] ?? ""; });
    if (IMPORT_FIELDS.some((field) => field !== "notes" && String(raw[field]).trim())) rows.push(raw);
  }
  return rows;
}

/** Splits pasted text into rows of cells. Tab-separated when any line has a tab, otherwise CSV with quotes. */
export function splitDelimited(text: string): string[][] {
  const tab = text.includes("\t");
  const delimiter = tab ? "\t" : text.split(/\r?\n/).some((line) => line.includes(",")) ? "," : ";";
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') { cell += '"'; index += 1; }
      else if (char === '"') quoted = false;
      else cell += char;
      continue;
    }
    if (char === '"' && cell.trim() === "") { quoted = true; cell = ""; }
    else if (char === delimiter) { row.push(cell); cell = ""; }
    else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += char;
  }
  row.push(cell);
  rows.push(row);
  return rows.map((cells) => cells.map((value) => value.trim().slice(0, MAX_CELL_LENGTH)));
}

/** Pasted CSV/TSV: uses the header line when there is one, else the template's column order. */
export function rowsFromText(text: string): RawRow[] {
  const lines = splitDelimited(text);
  const firstMap = mapHeaders(lines[0] ?? []);
  const hasHeader = looksLikeHeader(firstMap);
  const headers = hasHeader ? lines[0] : TEMPLATE_ORDER.map((field) => HEADER_ALIASES[field][0]);
  const body = lines.slice(hasHeader ? 1 : 0).map((cells, index) => ({ row: index + (hasHeader ? 2 : 1), cells: cells as Cell[] }));
  return rowsFromTable(headers, body);
}

/** Request data back into raw rows: only the known fields, strings or numbers, trimmed and capped. */
export function sanitizeRawRows(input: unknown): RawRow[] | null {
  if (!Array.isArray(input) || input.length > IMPORT_MAX_ROWS) return null;
  const rows: RawRow[] = [];
  for (const item of input) {
    if (!item || typeof item !== "object") return null;
    const record = item as Record<string, unknown>;
    const row = Number(record.row);
    if (!Number.isInteger(row) || row < 1 || row > 1_000_000) return null;
    const raw = emptyRow(row);
    for (const field of IMPORT_FIELDS) {
      const value = record[field];
      if (value === undefined || value === null) continue;
      if (typeof value === "number") raw[field] = Number.isFinite(value) ? value : "";
      else if (typeof value === "string") raw[field] = value.trim().slice(0, MAX_CELL_LENGTH);
      else return null;
    }
    rows.push(raw);
  }
  return rows;
}

// ---------- cell parsers ----------

const MONTH_NAMES = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
/** Month index from "Nov", "November" or "Sept"; -1 when it isn't a month. */
const monthOf = (word: string) => { const key = word.toLowerCase(); return key === "sept" ? 8 : key.length >= 3 ? MONTH_NAMES.findIndex((name) => name.startsWith(key)) : -1; };

function ymd(year: number, month: number, day: number): string | null {
  if (year < 100) year += 2000;
  if (year < 2000 || year > 2100 || month < 0 || month > 11 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month, day));
  if (date.getUTCMonth() !== month || date.getUTCDate() !== day) return null;
  return date.toISOString().slice(0, 10);
}

/** A match day as YYYY-MM-DD. Accepts Excel dates, 2026-11-21, 21-Nov-2026, 21 Nov 2026, Nov 21, 2026 and 21/11/2026 (day first). */
export function parseDateCell(cell: Cell): string | null {
  if (typeof cell === "number") {
    if (cell < 30000 || cell > 80000) return null;
    return new Date(Date.UTC(1899, 11, 30) + Math.floor(cell) * 86_400_000).toISOString().slice(0, 10);
  }
  const text = cell.trim().replace(/^(mon|tue|wed|thu|fri|sat|sun)[a-z]*\.?,?\s+/i, "");
  if (!text) return null;
  let match = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/.exec(text);
  if (match) return ymd(+match[1], +match[2] - 1, +match[3]);
  match = /^(\d{1,2})[/.\- ](\d{1,2})[/.\- ](\d{4}|\d{2})$/.exec(text);
  if (match) return ymd(+match[3], +match[2] - 1, +match[1]);
  match = /^(\d{1,2})(?:st|nd|rd|th)?[\s\-/.]*([a-z]{3,9})\.?[\s\-/.,]*(\d{4}|\d{2})$/i.exec(text);
  if (match) { const month = monthOf(match[2]); return month < 0 ? null : ymd(+match[3], month, +match[1]); }
  match = /^([a-z]{3,9})\.?\s*(\d{1,2})(?:st|nd|rd|th)?,?\s*(\d{4})$/i.exec(text);
  if (match) { const month = monthOf(match[1]); return month < 0 ? null : ymd(+match[3], month, +match[2]); }
  return null;
}

function timeOfMinutes(total: number): string {
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/** A start time as HH:MM (24-hour). Accepts Excel times, 17:30, 17.30, 1730, 5:30 pm and 5 pm. */
export function parseTimeCell(cell: Cell): string | null {
  if (typeof cell === "number") {
    if (cell < 0) return null;
    const fraction = cell >= 1 ? cell - Math.floor(cell) : cell;
    if (cell >= 1 && fraction === 0) return null;
    return timeOfMinutes(Math.round(fraction * 1440) % 1440);
  }
  let text = cell.trim().toLowerCase();
  const iso = /^\d{4}-\d{2}-\d{2}[t ](\d{2}:\d{2})/.exec(text);
  if (iso) text = iso[1];
  const four = /^(\d{2})(\d{2})$/.exec(text);
  if (four) text = `${four[1]}:${four[2]}`;
  const match = /^(\d{1,2})(?:[:.](\d{2}))?(?::\d{2})?\s*(a\.?m\.?|p\.?m\.?)?$/.exec(text);
  if (!match) return null;
  let hours = +match[1];
  const minutes = match[2] === undefined ? 0 : +match[2];
  const meridiem = match[3]?.[0];
  if (match[2] === undefined && !meridiem) return null;
  if (minutes > 59) return null;
  if (meridiem) {
    if (hours < 1 || hours > 12) return null;
    hours = (hours % 12) + (meridiem === "p" ? 12 : 0);
  } else if (hours > 23) return null;
  return timeOfMinutes(hours * 60 + minutes);
}

const looseKey = (value: string) => value.toLowerCase().normalize("NFKC").replace(/[’‘`´]/g, "'").replace(/\s*[·•|]\s*|\s+[-–—]\s+/g, " · ").replace(/\s+/g, " ").trim();

export function eventLabelOf(data: Pick<CompetitionData, "sports">, event: EventDefinition): string {
  const sport = data.sports.find((item) => item.id === event.sportId)?.name ?? "Event";
  return `${sport} · ${event.name}`;
}

/** Finds an event by its "Sport · Event" label, its id, or its name (or sport name) when that is unique. */
export function eventResolver(data: Pick<CompetitionData, "events" | "sports">) {
  const index = new Map<string, Set<string>>();
  const add = (key: string, id: string) => { const k = looseKey(key); if (!k) return; if (!index.has(k)) index.set(k, new Set()); index.get(k)!.add(id); };
  const exact = new Map<string, string>();
  for (const event of data.events) {
    exact.set(looseKey(eventLabelOf(data, event)), event.id);
    exact.set(looseKey(event.id), event.id);
    add(event.name, event.id);
    const sport = data.sports.find((item) => item.id === event.sportId)?.name;
    if (sport) add(sport, event.id);
  }
  return (cell: Cell): { event?: EventDefinition; error?: string } => {
    const text = String(cell).trim();
    if (!text) return { error: "Event is missing." };
    const key = looseKey(text);
    const exactId = exact.get(key);
    const ids = exactId ? new Set([exactId]) : index.get(key);
    if (ids?.size === 1) return { event: data.events.find((item) => item.id === [...ids][0]) };
    if (ids && ids.size > 1) {
      const example = data.events.find((item) => ids.has(item.id));
      return { error: `"${text}" matches more than one event. Use the Sport · Event name, e.g. "${example ? eventLabelOf(data, example) : text}".` };
    }
    return { error: `Unknown event "${text}". Use the Sport · Event name from the template's list.` };
  };
}

/** Finds a division by name, letter (A–E), "Div A", "Division A", "Section A", or id. */
export function divisionResolver(data: Pick<CompetitionData, "sections">) {
  const index = new Map<string, SectionId>();
  for (const section of data.sections) {
    for (const key of [section.name, section.shortName, section.code, section.id, `div ${section.code}`, `division ${section.code}`, `section ${section.code}`]) index.set(headerKey(key), section.id);
  }
  return (cell: Cell): SectionId | undefined => index.get(headerKey(cell));
}

export function parseStage(cell: Cell): Stage | null {
  const key = headerKey(cell);
  if (!key || ["league", "league match", "group", "group stage", "group match", "ring", "round robin"].includes(key)) return "league";
  if (["semifinal", "semi final", "semi", "semis", "sf"].includes(key)) return "semifinal";
  if (["final", "finals", "grand final", "f"].includes(key)) return "final";
  if (["other", "third place", "playoff", "play off"].includes(key)) return "other";
  return null;
}

/** "" for blank, 1 or 2, or null when it's neither. */
export function parseGroup(cell: Cell): 1 | 2 | "" | null {
  const key = headerKey(cell).replace(/^(group|grp|g|pool)\s*/, "");
  if (!key) return "";
  if (key === "1") return 1;
  if (key === "2") return 2;
  return null;
}

// ---------- analysis ----------

export type RowStatus = "new" | "changed" | "unchanged" | "started" | "error";

export interface ImportRow {
  row: number;
  status: RowStatus;
  eventId?: string;
  /** The event's label, or the text from the sheet when it didn't match. */
  eventLabel: string;
  sectionA?: SectionId;
  sectionB?: SectionId;
  divisionAText: string;
  divisionBText: string;
  entryA?: number;
  entryB?: number;
  startsAt?: string;
  durationMinutes?: number;
  venue?: string;
  stage?: Stage;
  group?: 1 | 2;
  /** Problems that stop the row from being published. */
  errors: string[];
  /** Overlaps with other bookings; publishing them needs acknowledgement. */
  clashes: string[];
  /** For changed (and started) rows: what differs from the fixture on the schedule. */
  changes: string[];
  /** The existing fixture this row matches. */
  fixtureId?: string;
}

export interface ImportSummary {
  rows: number;
  new: number;
  changed: number;
  unchanged: number;
  started: number;
  errors: number;
  clashes: number;
  /** EXAMPLE rows left out. */
  examples: number;
}

export interface ImportAnalysis { rows: ImportRow[]; summary: ImportSummary }

const isExample = (row: RawRow) => /^\s*example/i.test(String(row.notes));
const stageOf = (fixture: Pick<Fixture, "stage">): Stage => fixture.stage ?? "league";
const pairKey = (a: SectionId, b: SectionId) => [a, b].sort().join("-");
const sameVenue = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

const istFormat = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });
/** "Sat 21 Nov, 09:00" in India time. */
export function formatIst(iso: string): string {
  const parts = Object.fromEntries(istFormat.formatToParts(new Date(iso)).map((part) => [part.type, part.value]));
  return `${parts.weekday} ${parts.day} ${parts.month}, ${parts.hour === "24" ? "00" : parts.hour}:${parts.minute}`;
}

/** Reads, checks and classifies every row against the competition as it is now. */
export function analyzeImport(raw: RawRow[], data: CompetitionData): ImportAnalysis {
  const resolveEvent = eventResolver(data);
  const resolveDivision = divisionResolver(data);
  const sectionName = (id?: SectionId) => data.sections.find((section) => section.id === id)?.name ?? String(id ?? "");
  const divisionList = data.sections.map((section) => section.name).join(", ").replace(/, ([^,]*)$/, " or $1");
  const examples = raw.filter(isExample).length;
  const rows: ImportRow[] = [];
  const seen = new Map<string, number>();

  for (const item of raw.filter((row) => !isExample(row))) {
    const errors: string[] = [];
    const out: ImportRow = { row: item.row, status: "new", eventLabel: String(item.event).trim(), divisionAText: String(item.divisionA).trim(), divisionBText: String(item.divisionB).trim(), errors, clashes: [], changes: [] };

    const { event, error: eventError } = resolveEvent(item.event);
    if (eventError) errors.push(eventError);
    if (event) {
      out.eventId = event.id;
      out.eventLabel = eventLabelOf(data, event);
      if (event.pointsPolicy.format === "placings") errors.push(`${out.eventLabel} is ranked by placing, so it has no fixtures. Record its placings on the event page instead.`);
    }
    const ringGroup = event?.pointsPolicy.format === "ring-group";

    for (const side of ["A", "B"] as const) {
      const text = side === "A" ? out.divisionAText : out.divisionBText;
      const id = resolveDivision(text);
      if (!text) errors.push(`Division ${side} is missing.`);
      else if (!id) errors.push(`Division ${side} "${text}" isn't a division. Use ${divisionList}.`);
      if (side === "A") out.sectionA = id; else out.sectionB = id;
    }

    const stage = parseStage(item.stage);
    if (!stage) errors.push(`Stage "${String(item.stage).trim()}" isn't a stage. Use League, Semifinal, Final or Other.`);
    else out.stage = stage;

    const group = parseGroup(item.group);
    if (group === null) errors.push(`Group "${String(item.group).trim()}" isn't valid. Use 1 or 2.`);
    else if (group && event && !ringGroup) errors.push("Group is only for ring-group events. Leave it blank for this event.");
    else if (group && ringGroup && stage && stage !== "league") errors.push("Group is only for league matches. Leave it blank for semifinals and finals.");
    else if (!group && ringGroup && stage === "league") errors.push("Group is missing. Ring-group league matches need group 1 or 2.");
    else if (group) out.group = group;

    if (out.sectionA && out.sectionB && out.sectionA === out.sectionB) {
      if (ringGroup && stage === "semifinal") { out.entryA = 1; out.entryB = 2; }
      else errors.push(`Both sides are ${sectionName(out.sectionA)}. A division plays itself only in a ring-group semifinal.`);
    } else if (out.group) { out.entryA = out.group; out.entryB = out.group; }

    const day = String(item.date).trim() === "" ? null : parseDateCell(item.date);
    const time = String(item.time).trim() === "" ? null : parseTimeCell(item.time);
    if (String(item.date).trim() === "") errors.push("Date is missing.");
    else if (!day) errors.push(`Date "${String(item.date).trim()}" isn't a date. Use 21-Nov-2026, 2026-11-21 or 21/11/2026.`);
    if (String(item.time).trim() === "") errors.push("Start time is missing.");
    else if (!time) errors.push(`Start time "${String(item.time).trim()}" isn't a time. Use 24-hour time like 17:30, or 5:30 pm.`);
    if (day && time) out.startsAt = istDateTime(day, time);

    const durationText = String(item.duration).trim();
    const duration = durationText === "" ? DEFAULT_DURATION : Number(durationText.replace(/\s*(min|mins|minutes)$/i, ""));
    if (!Number.isFinite(duration) || duration < 5 || duration > 600) errors.push(`Duration "${durationText}" must be 5 to 600 minutes.`);
    else out.durationMinutes = Math.round(duration);

    const venue = String(item.venue).trim();
    if (!venue) errors.push("Venue is missing.");
    else if (venue.length > MAX_VENUE_LENGTH) errors.push(`Venue is longer than ${MAX_VENUE_LENGTH} characters.`);
    else out.venue = venue;

    if (!errors.length && out.eventId && out.sectionA && out.sectionB) {
      const key = [out.eventId, pairKey(out.sectionA, out.sectionB), out.stage, out.group ?? ""].join("|");
      const first = seen.get(key);
      if (first !== undefined) errors.push(`Same match as row ${first}. Each match needs one row.`);
      else seen.set(key, item.row);
    }
    rows.push(out);
  }

  // Match each good row to the schedule: same event, divisions, stage and group; or same event, start and venue.
  const claimed = new Set<string>();
  for (const row of rows) {
    if (row.errors.length) continue;
    const identity = data.fixtures.filter((fixture) => !claimed.has(fixture.id) && fixture.eventId === row.eventId && pairKey(fixture.sectionA, fixture.sectionB) === pairKey(row.sectionA!, row.sectionB!) && stageOf(fixture) === row.stage && (fixture.group ?? undefined) === row.group);
    const match = identity.find((fixture) => fixture.startsAt === row.startsAt) ?? identity[0];
    if (match) {
      claimed.add(match.id);
      row.fixtureId = match.id;
      if (new Date(match.startsAt).getTime() !== new Date(row.startsAt!).getTime()) row.changes.push(`Time ${formatIst(match.startsAt)} to ${formatIst(row.startsAt!)}`);
      if (match.venue.trim() !== row.venue) row.changes.push(`Venue ${match.venue} to ${row.venue}`);
      if (match.durationMinutes !== row.durationMinutes) row.changes.push(`Duration ${match.durationMinutes} to ${row.durationMinutes} min`);
      row.status = !row.changes.length ? "unchanged" : match.status === "scheduled" ? "changed" : "started";
      continue;
    }
    const slot = data.fixtures.find((fixture) => !claimed.has(fixture.id) && fixture.eventId === row.eventId && new Date(fixture.startsAt).getTime() === new Date(row.startsAt!).getTime() && sameVenue(fixture.venue, row.venue!));
    if (slot) {
      const who = `${sideName(data, slot.sectionA, slot.entryA)} v ${sideName(data, slot.sectionB, slot.entryB)}${slot.group ? ` (group ${slot.group})` : ""}`;
      row.errors.push(`This event already has ${who}, ${stageWord(stageOf(slot))}, at this time and venue. The import can't change who plays or the stage; edit that fixture on the schedule instead.`);
      continue;
    }
    row.status = "new";
  }
  for (const row of rows) if (row.errors.length) row.status = "error";

  // Clashes: rows that will be added or moved, against the schedule as it will be after publishing.
  type Booking = { id: string; eventId: string; startsAt: string; durationMinutes: number; venue: string; sectionA: SectionId; sectionB: SectionId; entryA?: number; entryB?: number; row?: number };
  const moving = new Map(rows.filter((row) => row.status === "changed").map((row) => [row.fixtureId!, row]));
  const bookings: Booking[] = data.fixtures.map((fixture) => {
    const moved = moving.get(fixture.id);
    return moved ? { id: fixture.id, eventId: fixture.eventId, startsAt: moved.startsAt!, durationMinutes: moved.durationMinutes!, venue: moved.venue!, sectionA: fixture.sectionA, sectionB: fixture.sectionB, entryA: fixture.entryA, entryB: fixture.entryB, row: moved.row }
      : { id: fixture.id, eventId: fixture.eventId, startsAt: fixture.startsAt, durationMinutes: fixture.durationMinutes, venue: fixture.venue, sectionA: fixture.sectionA, sectionB: fixture.sectionB, entryA: fixture.entryA, entryB: fixture.entryB };
  });
  for (const row of rows) if (row.status === "new") bookings.push({ id: `row:${row.row}`, eventId: row.eventId!, startsAt: row.startsAt!, durationMinutes: row.durationMinutes!, venue: row.venue!, sectionA: row.sectionA!, sectionB: row.sectionB!, entryA: row.entryA, entryB: row.entryB, row: row.row });
  const byId = new Map(bookings.map((booking) => [booking.id, booking]));
  const describe = (booking: Booking) => {
    const event = data.events.find((item) => item.id === booking.eventId);
    const label = event ? eventLabelOf(data, event) : "Fixture";
    return `${label}, ${sideName(data, booking.sectionA, booking.entryA)} v ${sideName(data, booking.sectionB, booking.entryB)} at ${formatIst(booking.startsAt)} ${booking.row ? `(row ${booking.row})` : "(on the schedule)"}`;
  };
  for (const row of rows) {
    if (row.status !== "new" && row.status !== "changed") continue;
    const self = byId.get(row.status === "new" ? `row:${row.row}` : row.fixtureId!)!;
    for (const clash of findClashes(self, bookings, () => "")) {
      const other = byId.get(clash.fixtureId!);
      if (!other) continue;
      if (clash.kind === "venue") row.clashes.push(`${other.venue} is already booked: ${describe(other)}.`);
      else {
        const shared = [...new Set([self.sectionA, self.sectionB].filter((id) => id === other.sectionA || id === other.sectionB))].map((id) => sectionName(id)).join(" and ");
        row.clashes.push(`${shared} already ${shared.includes(" and ") ? "play" : "plays"} then: ${describe(other)}.`);
      }
    }
  }

  const count = (status: RowStatus) => rows.filter((row) => row.status === status).length;
  return {
    rows,
    summary: { rows: rows.length, new: count("new"), changed: count("changed"), unchanged: count("unchanged"), started: count("started"), errors: count("error"), clashes: rows.filter((row) => row.clashes.length).length, examples },
  };
}

function sideName(data: Pick<CompetitionData, "sections">, id: SectionId, entry?: number) {
  const name = data.sections.find((section) => section.id === id)?.name ?? id;
  return entry ? `${name} team ${entry}` : name;
}
function stageWord(stage: Stage) { return stage === "league" ? "league match" : stage; }

export interface ApplyResult { created: Fixture[]; updated: Fixture[] }

/**
 * Adds the new rows and moves the changed ones (time, venue and duration only, and only while still scheduled).
 * Rows with errors, unchanged rows and started matches are left alone. Never deletes anything.
 */
export function applyImport(data: CompetitionData, analysis: ImportAnalysis, now: string, newId: () => string): ApplyResult {
  const created: Fixture[] = [];
  const updated: Fixture[] = [];
  for (const row of analysis.rows) {
    if (row.status === "new") {
      const fixture: Fixture = {
        id: newId(), eventId: row.eventId!, sectionA: row.sectionA!, sectionB: row.sectionB!, startsAt: row.startsAt!, durationMinutes: row.durationMinutes!, venue: row.venue!,
        stage: row.stage ?? "league", ...(row.group ? { group: row.group } : {}), ...(row.entryA ? { entryA: row.entryA } : {}), ...(row.entryB ? { entryB: row.entryB } : {}),
        status: "scheduled", scoreA: 0, scoreB: 0, periodLabel: "Not started", clockLabel: "—", resultConfirmed: false, updatedAt: now,
      };
      data.fixtures.push(fixture);
      created.push(fixture);
    } else if (row.status === "changed") {
      const fixture = data.fixtures.find((item) => item.id === row.fixtureId);
      if (!fixture || fixture.status !== "scheduled") continue;
      fixture.startsAt = row.startsAt!;
      fixture.venue = row.venue!;
      fixture.durationMinutes = row.durationMinutes!;
      fixture.updatedAt = now;
      updated.push(fixture);
    }
  }
  return { created, updated };
}

/** "42 new, 3 changed, 10 unchanged, 2 errors, 1 clash" */
export function summaryLine(summary: ImportSummary): string {
  const parts = [`${summary.new} new`, `${summary.changed} changed`, `${summary.unchanged} unchanged`];
  if (summary.started) parts.push(`${summary.started} already started`);
  parts.push(`${summary.errors} ${summary.errors === 1 ? "error" : "errors"}`, `${summary.clashes} ${summary.clashes === 1 ? "clash" : "clashes"}`);
  return parts.join(", ");
}
