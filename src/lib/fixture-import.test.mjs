import test from "node:test";
import assert from "node:assert/strict";
import { analyzeImport, applyImport, divisionResolver, eventResolver, normalizeCell, parseDateCell, parseTimeCell, rowsFromTable, rowsFromText, sanitizeRawRows, summaryLine } from "./fixture-import.ts";
import { rulebookEvents, rulebookSections, rulebookSports } from "./rulebook-data.ts";

const competition = (fixtures = []) => ({ sections: rulebookSections, sports: rulebookSports, events: rulebookEvents, fixtures: structuredClone(fixtures) });
const row = (n, fields) => ({ row: n, event: "", date: "", time: "", duration: "", venue: "", divisionA: "", divisionB: "", stage: "", group: "", notes: "", ...fields });
const cricket = (n, extra = {}) => row(n, { event: "Cricket · Men's Cricket", date: "21-Nov-2026", time: "09:00", duration: 90, venue: "Bhavan's Ground", divisionA: "Ares", divisionB: "Bloodhounds", ...extra });

test("events match by label, loosely, by id, or by a unique name", () => {
  const resolve = eventResolver(competition());
  assert.equal(resolve("Football · Men's Football").event?.id, "football-open");
  assert.equal(resolve("  football - men’s football ").event?.id, "football-open");
  assert.equal(resolve("cricket-women").event?.id, "cricket-women");
  assert.equal(resolve("Women's Throwball").event?.id, "throwball-open");
  assert.equal(resolve("Throwball").event?.id, "throwball-open");
  assert.match(resolve("Men's Singles").error, /more than one event/);
  assert.match(resolve("Kabaddi").error, /Unknown event "Kabaddi"/);
  assert.equal(resolve("").error, "Event is missing.");
});

test("divisions match by name, letter, Div A or Section A", () => {
  const resolve = divisionResolver(competition());
  for (const value of ["Ares", "ares", "A", "a", "Div A", "Division A", "Section A", "s1"]) assert.equal(resolve(value), "s1", value);
  assert.equal(resolve("Div-E"), "s5");
  assert.equal(resolve("Zeus"), undefined);
});

test("dates: Excel serials, ISO, 21-Nov-2026, day-first slashes; impossible dates refused", () => {
  assert.equal(parseDateCell(46347), "2026-11-21");
  assert.equal(parseDateCell("2026-11-21"), "2026-11-21");
  assert.equal(parseDateCell("2026-11-21T09:00"), "2026-11-21");
  assert.equal(parseDateCell("21-Nov-2026"), "2026-11-21");
  assert.equal(parseDateCell("21 November 2026"), "2026-11-21");
  assert.equal(parseDateCell("Sat, 21 Nov 2026"), "2026-11-21");
  assert.equal(parseDateCell("Nov 21, 2026"), "2026-11-21");
  assert.equal(parseDateCell("21/11/2026"), "2026-11-21");
  assert.equal(parseDateCell("03/11/2026"), "2026-11-03");
  assert.equal(parseDateCell("21.11.26"), "2026-11-21");
  assert.equal(parseDateCell("31/02/2026"), null);
  assert.equal(parseDateCell("21-Nox-2026"), null);
  assert.equal(parseDateCell("tomorrow"), null);
});

test("times: Excel fractions, 24-hour, am/pm", () => {
  assert.equal(parseTimeCell(0.375), "09:00");
  assert.equal(parseTimeCell(46347.729166), "17:30");
  assert.equal(parseTimeCell("17:30"), "17:30");
  assert.equal(parseTimeCell("9.05"), "09:05");
  assert.equal(parseTimeCell("1730"), "17:30");
  assert.equal(parseTimeCell("5:30 pm"), "17:30");
  assert.equal(parseTimeCell("5 PM"), "17:00");
  assert.equal(parseTimeCell("12:15 am"), "00:15");
  assert.equal(parseTimeCell("12 noon"), null);
  assert.equal(parseTimeCell("25:00"), null);
  assert.equal(parseTimeCell("13:00 pm"), null);
  assert.equal(parseTimeCell("17"), null);
});

test("exceljs cells: dates, times, formulas and rich text", () => {
  assert.equal(normalizeCell(new Date("2026-11-21T00:00:00.000Z")), "2026-11-21");
  assert.equal(normalizeCell(new Date("1899-12-30T09:00:00.000Z")), "09:00");
  assert.equal(normalizeCell(new Date("1899-12-30T17:29:59.990Z")), "17:30");
  assert.equal(normalizeCell({ formula: "A1", result: 40 }), 40);
  assert.equal(normalizeCell({ richText: [{ text: "Ar" }, { text: "es" }] }), "Ares");
  assert.equal(normalizeCell(null), "");
});

test("start times are converted from IST to UTC", () => {
  const { rows } = analyzeImport([cricket(2, { time: "17:30" })], competition());
  assert.equal(rows[0].startsAt, "2026-11-21T12:00:00.000Z");
  const late = analyzeImport([cricket(2, { time: "02:00" })], competition());
  assert.equal(late.rows[0].startsAt, "2026-11-20T20:30:00.000Z");
});

test("headers map to fields; EXAMPLE rows are skipped; empty rows dropped", () => {
  const headers = ["Event", "Date", "Start time", "Duration (min)", "Venue", "Division A", "Division B", "Stage", "Group", "Notes"];
  const raw = rowsFromTable(headers, [
    { row: 2, cells: ["Cricket · Men's Cricket", "2026-11-21", "09:00", 90, "Ground", "Ares", "Eagles", "League", "", "EXAMPLE, replace or delete"] },
    { row: 3, cells: ["", "", "", "", "", "", "", "", "", ""] },
    { row: 4, cells: ["Cricket · Men's Cricket", "2026-11-21", "12:00", "", "Ground", "Cyappa", "Eagles", "", "", "real"] },
  ]);
  assert.equal(raw.length, 2);
  const { rows, summary } = analyzeImport(raw, competition());
  assert.equal(summary.examples, 1);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].row, 4);
  assert.equal(rows[0].durationMinutes, 60, "blank duration defaults to 60");
  assert.equal(rows[0].stage, "league");
});

test("pasted TSV and CSV, with or without a header line", () => {
  const tsv = "Event\tDate\tStart time\tDuration (min)\tVenue\tDivision A\tDivision B\tStage\tGroup\tNotes\nThrowball\t21/11/2026\t5:30 pm\t45\tCourt 2\tB\tC\t\t\t\n";
  const fromTsv = rowsFromText(tsv);
  assert.equal(fromTsv.length, 1);
  assert.equal(fromTsv[0].row, 2);
  assert.equal(fromTsv[0].venue, "Court 2");
  const csv = '"Cricket · Men\'s Cricket",2026-11-21,09:00,90,"Ground, east",Ares,Eagles,League,,';
  const fromCsv = rowsFromText(csv);
  assert.equal(fromCsv[0].row, 1);
  assert.equal(fromCsv[0].venue, "Ground, east");
  assert.equal(analyzeImport(fromCsv, competition()).rows[0].status, "new");
});

test("row checks: placings, same division, duration, venue, group and stage", () => {
  const { rows } = analyzeImport([
    cricket(2, { event: "Athletics · Men's 100 m" }),
    cricket(3, { divisionB: "Ares" }),
    cricket(4, { duration: 3 }),
    cricket(5, { venue: "" }),
    cricket(6, { group: 1 }),
    row(7, { event: "Football · Men's Football", date: "2026-11-22", time: "09:00", venue: "Turf", divisionA: "A", divisionB: "B" }),
    row(8, { event: "Football · Men's Football", date: "2026-11-22", time: "10:00", venue: "Turf", divisionA: "A", divisionB: "B", group: 3 }),
    row(9, { event: "Football · Men's Football", date: "2026-11-23", time: "09:00", venue: "Turf", divisionA: "A", divisionB: "A", stage: "Semifinal" }),
    row(10, { event: "Football · Men's Football", date: "2026-11-23", time: "10:00", venue: "Turf", divisionA: "C", divisionB: "D", stage: "Final", group: 1 }),
    cricket(11, { stage: "Quarterfinal" }),
    cricket(12, { date: "32/11/2026", time: "noon" }),
    cricket(13, { divisionA: "", divisionB: "Zeus" }),
  ], competition());
  const by = (n) => rows.find((item) => item.row === n);
  assert.match(by(2).errors[0], /ranked by placing/);
  assert.match(by(3).errors[0], /Both sides are Ares/);
  assert.match(by(4).errors[0], /5 to 600 minutes/);
  assert.equal(by(5).errors[0], "Venue is missing.");
  assert.match(by(6).errors[0], /only for ring-group events/);
  assert.match(by(7).errors[0], /Group is missing/);
  assert.match(by(8).errors[0], /Use 1 or 2/);
  assert.equal(by(9).status, "new", "ring-group semifinal: a division's two teams may meet");
  assert.deepEqual([by(9).entryA, by(9).entryB], [1, 2]);
  assert.match(by(10).errors[0], /only for league matches/);
  assert.match(by(11).errors[0], /isn't a stage/);
  assert.equal(by(12).errors.length, 2);
  assert.deepEqual(by(13).errors, ["Division A is missing.", 'Division B "Zeus" isn\'t a division. Use Ares, Bloodhounds, Cyappa, Dracarys or Eagles.']);
  assert.ok(rows.filter((item) => item.row !== 9).every((item) => item.status === "error"));
});

test("chit-ring semifinal with the same division twice is refused", () => {
  const { rows } = analyzeImport([row(2, { event: "Badminton · Men's Singles", date: "2026-11-22", time: "17:00", venue: "SPCE court", divisionA: "Cyappa", divisionB: "Cyappa", stage: "Semifinal" })], competition());
  assert.match(rows[0].errors[0], /Both sides are Cyappa/);
});

test("ring-group league rows carry their group as each side's team", () => {
  const { rows } = analyzeImport([row(2, { event: "Football · Men's Football", date: "2026-11-22", time: "09:00", venue: "Turf", divisionA: "Ares", divisionB: "Dracarys", group: "Group 2" })], competition());
  assert.equal(rows[0].status, "new");
  assert.deepEqual([rows[0].group, rows[0].entryA, rows[0].entryB], [2, 2, 2]);
});

test("clashes inside the file: same venue, same division, and duplicate rows", () => {
  const { rows, summary } = analyzeImport([
    cricket(2),
    cricket(3, { divisionA: "Cyappa", divisionB: "Dracarys", time: "10:00" }),
    cricket(4, { event: "Volleyball · Men's Volleyball", venue: "Court", divisionA: "Ares", divisionB: "Eagles", time: "10:00" }),
    cricket(5, { time: "15:00" }),
    cricket(6, { venue: "Elsewhere", divisionA: "Cyappa", divisionB: "Eagles", time: "13:00" }),
  ], competition());
  const by = (n) => rows.find((item) => item.row === n);
  assert.ok(by(2).clashes.some((text) => /Bhavan's Ground is already booked: .*\(row 3\)/.test(text)), by(2).clashes.join(" "));
  assert.ok(by(2).clashes.some((text) => /^Ares already plays then: Volleyball · Men's Volleyball, Ares v Eagles/.test(text)), by(2).clashes.join(" "));
  assert.ok(by(4).clashes.length === 1);
  assert.match(by(5).errors[0], /Same match as row 2/);
  assert.equal(by(6).clashes.length, 0);
  assert.equal(summary.clashes, 3);
  assert.equal(summary.errors, 1);
  assert.equal(summaryLine(summary), "4 new, 0 changed, 0 unchanged, 1 error, 3 clashes");
});

const existing = (overrides = {}) => ({ id: "fx-a", eventId: "cricket-open", sectionA: "s2", sectionB: "s1", startsAt: "2026-11-21T03:30:00.000Z", durationMinutes: 90, venue: "Bhavan's Ground", stage: "league", status: "scheduled", scoreA: 0, scoreB: 0, periodLabel: "Not started", clockLabel: "—", resultConfirmed: false, updatedAt: "2026-11-01T00:00:00.000Z", ...overrides });

test("re-upload: unchanged, changed and started rows; existing fixtures don't clash with themselves", () => {
  const data = competition([existing(), existing({ id: "fx-b", sectionA: "s3", sectionB: "s4", startsAt: "2026-11-21T06:30:00.000Z" }), existing({ id: "fx-c", sectionA: "s5", sectionB: "s1", startsAt: "2026-11-22T03:30:00.000Z", status: "live" })]);
  const { rows, summary } = analyzeImport([
    cricket(2),
    cricket(3, { divisionA: "Dracarys", divisionB: "Cyappa", time: "12:30", venue: "Wadia court", duration: 100 }),
    cricket(4, { divisionA: "Eagles", divisionB: "Ares", date: "22/11/2026", time: "10:00" }),
    cricket(5, { divisionA: "Eagles", divisionB: "Ares", date: "22/11/2026", time: "09:00" }),
  ], data);
  const by = (n) => rows.find((item) => item.row === n);
  assert.equal(by(2).status, "unchanged");
  assert.equal(by(2).fixtureId, "fx-a");
  assert.equal(by(2).clashes.length, 0);
  assert.equal(by(3).status, "changed");
  assert.deepEqual(by(3).changes, ["Time Sat 21 Nov, 12:00 to Sat 21 Nov, 12:30", "Venue Bhavan's Ground to Wadia court", "Duration 90 to 100 min"]);
  assert.equal(by(4).status, "started");
  assert.match(by(5).errors[0], /Same match as row 4/);
  assert.deepEqual([summary.new, summary.changed, summary.unchanged, summary.started, summary.errors], [0, 1, 1, 1, 1]);
});

test("re-upload: same event, start and venue with different divisions is an error, not a duplicate", () => {
  const { rows } = analyzeImport([cricket(2, { divisionA: "Cyappa", divisionB: "Eagles" })], competition([existing()]));
  assert.equal(rows[0].status, "error");
  assert.match(rows[0].errors[0], /already has Bloodhounds v Ares, league match, at this time and venue/);
});

test("a moved fixture is checked against its new slot", () => {
  const data = competition([existing(), existing({ id: "fx-b", sectionA: "s3", sectionB: "s4", startsAt: "2026-11-21T06:30:00.000Z" })]);
  const { rows } = analyzeImport([cricket(2, { time: "12:30" })], data);
  assert.equal(rows[0].status, "changed");
  assert.ok(rows[0].clashes.some((text) => /Bhavan's Ground is already booked: .*Cyappa v Dracarys.*\(on the schedule\)/.test(text)), rows[0].clashes.join(" "));
});

test("apply adds new rows, moves changed ones, leaves the rest", () => {
  const data = competition([existing(), existing({ id: "fx-b", sectionA: "s3", sectionB: "s4", startsAt: "2026-11-21T06:30:00.000Z" })]);
  const analysis = analyzeImport([
    cricket(2),
    cricket(3, { divisionA: "Cyappa", divisionB: "Dracarys", time: "15:00" }),
    row(4, { event: "Football · Men's Football", date: "2026-11-23", time: "09:00", venue: "Turf", divisionA: "Eagles", divisionB: "Eagles", stage: "semi" }),
    cricket(5, { venue: "" }),
  ], data);
  let n = 0;
  const { created, updated } = applyImport(data, analysis, "2026-11-20T00:00:00.000Z", () => `new-${++n}`);
  assert.equal(created.length, 1);
  assert.deepEqual({ ...created[0] }, { id: "new-1", eventId: "football-open", sectionA: "s5", sectionB: "s5", startsAt: "2026-11-23T03:30:00.000Z", durationMinutes: 60, venue: "Turf", stage: "semifinal", entryA: 1, entryB: 2, status: "scheduled", scoreA: 0, scoreB: 0, periodLabel: "Not started", clockLabel: "—", resultConfirmed: false, updatedAt: "2026-11-20T00:00:00.000Z" });
  assert.equal(updated.length, 1);
  assert.equal(data.fixtures.find((item) => item.id === "fx-b").startsAt, "2026-11-21T09:30:00.000Z");
  assert.equal(data.fixtures.length, 3);
  // Re-analysing after publishing shows everything as unchanged.
  const again = analyzeImport([cricket(2), cricket(3, { divisionA: "Cyappa", divisionB: "Dracarys", time: "15:00" }), row(4, { event: "Football · Men's Football", date: "2026-11-23", time: "09:00", venue: "Turf", divisionA: "Eagles", divisionB: "Eagles", stage: "semi" })], data);
  assert.deepEqual(again.rows.map((item) => item.status), ["unchanged", "unchanged", "unchanged"]);
});

test("request rows are rebuilt field by field", () => {
  const rows = sanitizeRawRows([{ row: 2, event: "Throwball", venue: " Court ", extra: "x", __proto__: { admin: true } }]);
  assert.deepEqual(Object.keys(rows[0]).sort(), ["date", "divisionA", "divisionB", "duration", "event", "group", "notes", "row", "stage", "time", "venue"]);
  assert.equal(rows[0].venue, "Court");
  assert.equal(sanitizeRawRows([{ row: 2, event: { $gt: "" } }]), null);
  assert.equal(sanitizeRawRows([{ row: -1 }]), null);
  assert.equal(sanitizeRawRows(new Array(601).fill({ row: 2 })), null);
  assert.equal(sanitizeRawRows("nope"), null);
});
