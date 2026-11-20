import test from "node:test";
import assert from "node:assert/strict";
import { applyJudgingAction, checkAnnounceOrder, criteriaLocked, defaultJudging, judgesIn, presentJudging, rankedRows, scoreRows, scoreTies } from "./judging.ts";

const ids = ["s1", "s2", "s3", "s4", "s5"];
const sections = ids.map((id, index) => ({ id, name: id.toUpperCase(), code: "ABCDE"[index] }));
const BIG = [160, 120, 80, 40, 20];
function data() {
  return {
    sections,
    sports: [{ id: "music", category: "cultural" }, { id: "dance", category: "cultural" }, { id: "art", category: "cultural" }, { id: "poetry", category: "cultural" }, { id: "quiz", category: "cultural" }, { id: "athletics", category: "sport" }],
    events: [
      { id: "culture-battle-of-bands", name: "Battle of Bands", sportId: "music", pointsPolicy: { format: "placings", places: BIG } },
      { id: "culture-group-dance", name: "Group Dance", sportId: "dance", pointsPolicy: { format: "placings", places: BIG } },
      { id: "culture-art", name: "Colour Roulette", sportId: "art", pointsPolicy: { format: "placings", places: [100, 80, 50, 20, 10] } },
      { id: "culture-poetry", name: "Poetry", sportId: "poetry", pointsPolicy: { format: "placings", places: [100, 80, 50, 20, 10] } },
      { id: "culture-quiz", name: "Quiz", sportId: "quiz", pointsPolicy: { format: "placings", places: [100, 80, 50, 20, 10] } },
      { id: "athletics-100m-men", name: "100 m", sportId: "athletics", pointsPolicy: { format: "placings", places: [15, 10, 5, 0, 0] } },
    ],
    bonusAwards: [],
  };
}
const ADMIN = { central: true, coordinator: true, judge: true };
const HEAD = { central: false, coordinator: true, judge: false };
const JUDGE = { central: false, coordinator: false, judge: true };
const ok = (result) => { assert.ok(!("error" in result), result.error); return result; };
const dance = (marks) => [[marks[0], marks[1]]];
/** Every judge marks every division of Group Dance: `table[judge][division] = [choreography, technique]`. */
function markAll(d, table) {
  table.forEach((row, j) => row.forEach((marks, s) => ok(applyJudgingAction(d, { eventId: "culture-group-dance", action: "submit", sectionId: ids[s], scores: dance(marks) }, `j${j + 1}@spjimr.org`, JUDGE))));
}

test("defaults follow the rulebook", () => {
  const bands = defaultJudging({ id: "culture-battle-of-bands", sportId: "music" }, ids);
  assert.equal(bands.criteria.reduce((sum, c) => sum + c.max, 0), 100);
  assert.equal(bands.criteria.length, 7);
  assert.equal(bands.judgeCount, 3);
  const art = defaultJudging({ id: "culture-art", sportId: "art" }, ids);
  assert.equal(art.items, 3);
  assert.equal(art.criteria[0].max, 100);
  assert.deepEqual(defaultJudging({ id: "culture-duet-song", sportId: "music" }, ids).criteria.map((c) => [c.name, c.max]), [["Overall", 100]]);
});

test("a division's score is the average of the judges who submitted, criterion by criterion", () => {
  const d = data();
  ok(applyJudgingAction(d, { eventId: "culture-group-dance", action: "submit", sectionId: "s1", scores: dance([40, 40]) }, "j1@spjimr.org", JUDGE));
  ok(applyJudgingAction(d, { eventId: "culture-group-dance", action: "submit", sectionId: "s1", scores: dance([30, 35]) }, "j2@spjimr.org", JUDGE));
  const row = scoreRows(d.judging["culture-group-dance"], ids).find((item) => item.sectionId === "s1");
  assert.equal(row.judges, 2);
  assert.deepEqual(row.criteria, [35, 37.5]);
  assert.equal(row.score, 72.5);
  // Summing instead of averaging, if a central admin chooses it.
  ok(applyJudgingAction(d, { eventId: "culture-group-dance", action: "settings", combine: "sum" }, "admin@spjimr.org", ADMIN));
  assert.equal(scoreRows(d.judging["culture-group-dance"], ids)[0].score, 145);
  // Unmarked divisions have no score yet.
  assert.equal(scoreRows(d.judging["culture-group-dance"], ids)[1].score, null);
});

test("Colour Roulette: each artwork is the judges' average, and a division adds its three artworks", () => {
  const d = data();
  ok(applyJudgingAction(d, { eventId: "culture-art", action: "submit", sectionId: "s2", scores: [[80], [60], [90]] }, "j1@spjimr.org", JUDGE));
  ok(applyJudgingAction(d, { eventId: "culture-art", action: "submit", sectionId: "s2", scores: [[70], [70], [70]] }, "j2@spjimr.org", JUDGE));
  ok(applyJudgingAction(d, { eventId: "culture-art", action: "submit", sectionId: "s2", scores: [[90], [50], [80]] }, "j3@spjimr.org", JUDGE));
  const row = scoreRows(d.judging["culture-art"], ids).find((item) => item.sectionId === "s2");
  assert.deepEqual(row.itemScores, [80, 60, 80]);
  assert.equal(row.score, 220);
  // Marks must fit the criterion: no 101, no wrong number of artworks.
  assert.match(applyJudgingAction(d, { eventId: "culture-art", action: "submit", sectionId: "s3", scores: [[101], [60], [90]] }, "j1@spjimr.org", JUDGE).error, /0 to 100/);
  assert.match(applyJudgingAction(d, { eventId: "culture-art", action: "submit", sectionId: "s3", scores: [[50], [60]] }, "j1@spjimr.org", JUDGE).error, /3 entries/);
});

test("Poetry: participants per division are set by an admin and their marks are added", () => {
  const d = data();
  ok(applyJudgingAction(d, { eventId: "culture-poetry", action: "settings", items: 2 }, "admin@spjimr.org", ADMIN));
  ok(applyJudgingAction(d, { eventId: "culture-poetry", action: "submit", sectionId: "s1", scores: [[8, 7, 9, 6], [10, 10, 9.5, 8]] }, "j1@spjimr.org", JUDGE));
  ok(applyJudgingAction(d, { eventId: "culture-poetry", action: "submit", sectionId: "s1", scores: [[6, 7, 7, 6], [8, 8, 9.5, 10]] }, "j2@spjimr.org", JUDGE));
  const row = scoreRows(d.judging["culture-poetry"], ids)[0];
  assert.deepEqual(row.itemScores, [28, 36.5]);
  assert.equal(row.score, 64.5);
});

test("penalties: marks off, percent off, and disqualification", () => {
  const d = data();
  markAll(d, [[[40, 40], [35, 35], [30, 30], [25, 25], [20, 20]]]);
  ok(applyJudgingAction(d, { eventId: "culture-group-dance", action: "penalty-add", sectionId: "s1", kind: "marks", value: 10, reason: "Over the 7-minute limit" }, "head@spjimr.org", HEAD));
  ok(applyJudgingAction(d, { eventId: "culture-group-dance", action: "penalty-add", sectionId: "s2", kind: "percent", value: 10, reason: "Damaged the stage" }, "head@spjimr.org", HEAD));
  ok(applyJudgingAction(d, { eventId: "culture-group-dance", action: "penalty-add", sectionId: "s3", kind: "disqualify", reason: "Didn't take part" }, "head@spjimr.org", HEAD));
  assert.match(applyJudgingAction(d, { eventId: "culture-group-dance", action: "penalty-add", sectionId: "s4", kind: "marks", value: 5 }, "head@spjimr.org", HEAD).error, /what the penalty is for/);
  assert.match(applyJudgingAction(d, { eventId: "culture-group-dance", action: "penalty-add", sectionId: "s4", kind: "percent", value: 150, reason: "x" }, "head@spjimr.org", HEAD).error, /1 to 100/);
  const rows = scoreRows(d.judging["culture-group-dance"], ids);
  assert.equal(rows[0].final, 70);
  assert.equal(rows[1].final, 63);
  assert.equal(rows[2].disqualified, true);
  assert.deepEqual(rankedRows(rows).map((row) => row.sectionId), ["s1", "s2", "s4", "s5"]);
  // A judge can't add penalties.
  assert.equal(applyJudgingAction(d, { eventId: "culture-group-dance", action: "penalty-add", sectionId: "s4", kind: "marks", value: 5, reason: "x" }, "j1@spjimr.org", JUDGE).status, 403);
});

test("ties need a committee note; announcing pays places and gives a disqualified division nothing", () => {
  const d = data();
  markAll(d, [[[40, 40], [40, 40], [30, 30], [25, 25], [20, 20]]]);
  ok(applyJudgingAction(d, { eventId: "culture-group-dance", action: "penalty-add", sectionId: "s5", kind: "disqualify", reason: "Unsafe stunts" }, "head@spjimr.org", HEAD));
  const ranked = rankedRows(scoreRows(d.judging["culture-group-dance"], ids));
  assert.deepEqual(scoreTies(ranked), [["s1", "s2"]]);
  assert.match(checkAnnounceOrder(ranked, ["s2", "s1", "s3", "s4"]), /committee's note/);
  assert.match(checkAnnounceOrder(ranked, ["s3", "s1", "s2", "s4"], "note"), /doesn't match/);
  assert.equal(checkAnnounceOrder(ranked, ["s2", "s1", "s3", "s4"], "Committee: B's technique was cleaner"), null);
  assert.match(applyJudgingAction(d, { eventId: "culture-group-dance", action: "announce", order: ["s2", "s1", "s3", "s4"] }, "head@spjimr.org", HEAD).error, /note/);
  const result = ok(applyJudgingAction(d, { eventId: "culture-group-dance", action: "announce", order: ["s2", "s1", "s3", "s4"], note: "Committee: B's technique was cleaner" }, "head@spjimr.org", HEAD));
  assert.equal(result.announced, true);
  assert.deepEqual(d.bonusAwards.map((award) => [award.sectionId, award.place, award.points]), [["s2", 1, 160], ["s1", 2, 120], ["s3", 3, 80], ["s4", 4, 40]]);
  const published = d.judging["culture-group-dance"].announced.rows;
  assert.deepEqual(published.find((row) => row.sectionId === "s5"), { sectionId: "s5", points: 0, score: 40, final: null, penalty: "disqualified", disqualified: true, criteria: [20, 20] });
  // Once announced, nothing changes until a central admin withdraws.
  assert.equal(applyJudgingAction(d, { eventId: "culture-group-dance", action: "penalty-add", sectionId: "s1", kind: "marks", value: 1, reason: "x" }, "head@spjimr.org", HEAD).status, 409);
});

test("announce needs every division marked or disqualified, and works with the marks that are in", () => {
  const d = data();
  ok(applyJudgingAction(d, { eventId: "culture-group-dance", action: "submit", sectionId: "s1", scores: dance([10, 10]) }, "j1@spjimr.org", JUDGE));
  assert.match(applyJudgingAction(d, { eventId: "culture-group-dance", action: "announce", order: ["s1"] }, "head@spjimr.org", HEAD).error, /at least one judge/);
  for (const [index, sectionId] of ["s2", "s3", "s4", "s5"].entries()) ok(applyJudgingAction(d, { eventId: "culture-group-dance", action: "submit", sectionId, scores: dance([20 + index * 5, 20]) }, "j1@spjimr.org", JUDGE));
  assert.equal(judgesIn(d.judging["culture-group-dance"]).length, 1);
  const ranked = rankedRows(scoreRows(d.judging["culture-group-dance"], ids));
  ok(applyJudgingAction(d, { eventId: "culture-group-dance", action: "announce", order: ranked.map((row) => row.sectionId) }, "head@spjimr.org", HEAD));
  assert.deepEqual(d.bonusAwards.map((award) => [award.sectionId, award.points]), [["s5", 160], ["s4", 120], ["s3", 80], ["s2", 40], ["s1", 20]]);
});

test("one judge per slot, marks lock after submit, and only a coordinator reopens them with a reason", () => {
  const d = data();
  markAll(d, [[[40, 40], [35, 35], [30, 30], [25, 25], [20, 20]]]);
  const j = d.judging["culture-group-dance"];
  assert.deepEqual(judgesIn(j), ["j1@spjimr.org"]);
  assert.match(applyJudgingAction(d, { eventId: "culture-group-dance", action: "submit", sectionId: "s1", scores: dance([1, 1]) }, "j1@spjimr.org", JUDGE).error, /already submitted/);
  assert.match(applyJudgingAction(d, { eventId: "culture-group-dance", action: "unlock", judge: 1, sectionId: "s1" }, "head@spjimr.org", HEAD).error, /reason/);
  assert.equal(applyJudgingAction(d, { eventId: "culture-group-dance", action: "unlock", judge: 1, sectionId: "s1", reason: "x" }, "j1@spjimr.org", JUDGE).status, 403);
  ok(applyJudgingAction(d, { eventId: "culture-group-dance", action: "unlock", judge: 1, sectionId: "s1", reason: "Typed 4 for 40" }, "head@spjimr.org", HEAD));
  ok(applyJudgingAction(d, { eventId: "culture-group-dance", action: "submit", sectionId: "s1", scores: dance([45, 45]) }, "j1@spjimr.org", JUDGE));
  // A fourth judge is refused while the count is 3.
  ok(applyJudgingAction(d, { eventId: "culture-group-dance", action: "submit", sectionId: "s1", scores: dance([1, 1]) }, "j2@spjimr.org", JUDGE));
  ok(applyJudgingAction(d, { eventId: "culture-group-dance", action: "submit", sectionId: "s1", scores: dance([1, 1]) }, "j3@spjimr.org", JUDGE));
  assert.match(applyJudgingAction(d, { eventId: "culture-group-dance", action: "submit", sectionId: "s1", scores: dance([1, 1]) }, "j4@spjimr.org", JUDGE).error, /already has 3 judges/);
  assert.match(applyJudgingAction(d, { eventId: "culture-group-dance", action: "settings", judgeCount: 2 }, "admin@spjimr.org", ADMIN).error, /can't go below/);
  ok(applyJudgingAction(d, { eventId: "culture-group-dance", action: "settings", judgeCount: 4 }, "admin@spjimr.org", ADMIN));
});

test("criteria lock once a judge submits; Edit anyway needs a reason and clears submitted marks", () => {
  const d = data();
  ok(applyJudgingAction(d, { eventId: "culture-battle-of-bands", action: "settings", criteria: [{ name: "Overall", max: 100 }] }, "admin@spjimr.org", ADMIN));
  assert.equal(criteriaLocked(d.judging["culture-battle-of-bands"]), false);
  ok(applyJudgingAction(d, { eventId: "culture-battle-of-bands", action: "submit", sectionId: "s1", scores: [[77]] }, "j1@spjimr.org", JUDGE));
  assert.equal(criteriaLocked(d.judging["culture-battle-of-bands"]), true);
  const edit = { eventId: "culture-battle-of-bands", action: "settings", criteria: [{ name: "Music", max: 60 }, { name: "Show", max: 40 }] };
  assert.equal(applyJudgingAction(d, edit, "admin@spjimr.org", ADMIN).status, 409);
  assert.equal(applyJudgingAction(d, { ...edit, force: true }, "admin@spjimr.org", ADMIN).status, 409);
  assert.equal(applyJudgingAction(d, { ...edit, force: true, reason: "x" }, "head@spjimr.org", HEAD).status, 403);
  const result = ok(applyJudgingAction(d, { ...edit, force: true, reason: "Committee split the marks" }, "admin@spjimr.org", ADMIN));
  assert.match(result.detail, /cleared for re-marking/);
  assert.equal(d.judging["culture-battle-of-bands"].sheets.length, 0);
  assert.equal(d.judging["culture-battle-of-bands"].criteria.length, 2);
  // Changing the judge count or how marks combine doesn't touch the criteria lock.
  ok(applyJudgingAction(d, { eventId: "culture-battle-of-bands", action: "submit", sectionId: "s1", scores: [[50, 30]] }, "j1@spjimr.org", JUDGE));
  ok(applyJudgingAction(d, { eventId: "culture-battle-of-bands", action: "settings", judgeCount: 5 }, "admin@spjimr.org", ADMIN));
  assert.equal(d.judging["culture-battle-of-bands"].sheets.length, 1);
});

test("switching to score entry needs a reason and keeps marks; the coordinator's totals are checked", () => {
  const d = data();
  ok(applyJudgingAction(d, { eventId: "culture-group-dance", action: "submit", sectionId: "s1", scores: dance([10, 10]) }, "j1@spjimr.org", JUDGE));
  assert.match(applyJudgingAction(d, { eventId: "culture-group-dance", action: "settings", method: "entry" }, "admin@spjimr.org", ADMIN).error, /reason/);
  ok(applyJudgingAction(d, { eventId: "culture-group-dance", action: "settings", method: "entry", reason: "Judges used paper sheets" }, "admin@spjimr.org", ADMIN));
  assert.equal(d.judging["culture-group-dance"].sheets.length, 1);
  assert.match(applyJudgingAction(d, { eventId: "culture-group-dance", action: "submit", sectionId: "s2", scores: dance([10, 10]) }, "j1@spjimr.org", JUDGE).error, /entered by the coordinator/);
  assert.match(applyJudgingAction(d, { eventId: "culture-group-dance", action: "enter", entries: [{ sectionId: "s1", total: 101 }] }, "head@spjimr.org", HEAD).error, /0 to 100/);
  assert.match(applyJudgingAction(d, { eventId: "culture-group-dance", action: "enter", entries: [{ sectionId: "s1", total: 80, criteria: [40, 30] }] }, "head@spjimr.org", HEAD).error, /add up/);
  ok(applyJudgingAction(d, { eventId: "culture-group-dance", action: "enter", entries: [{ sectionId: "s1", total: 81.5, criteria: [41.5, 40] }, { sectionId: "s2", total: 78.33 }, { sectionId: "s3", total: 76 }, { sectionId: "s4", total: 84 }, { sectionId: "s5", total: 69 }] }, "head@spjimr.org", HEAD));
  ok(applyJudgingAction(d, { eventId: "culture-group-dance", action: "penalty-add", sectionId: "s4", kind: "marks", value: 10, reason: "Over time" }, "head@spjimr.org", HEAD));
  const ranked = rankedRows(scoreRows(d.judging["culture-group-dance"], ids));
  assert.deepEqual(ranked.map((row) => [row.sectionId, row.final]), [["s1", 81.5], ["s2", 78.33], ["s3", 76], ["s4", 74], ["s5", 69]]);
  ok(applyJudgingAction(d, { eventId: "culture-group-dance", action: "announce", order: ranked.map((row) => row.sectionId) }, "head@spjimr.org", HEAD));
  assert.deepEqual(d.bonusAwards.map((award) => award.points), BIG);
});

test("only judged Stage events take judging; the quiz and athletics don't", () => {
  const d = data();
  assert.equal(applyJudgingAction(d, { eventId: "culture-quiz", action: "order", order: ids }, "admin@spjimr.org", ADMIN).status, 400);
  assert.equal(applyJudgingAction(d, { eventId: "athletics-100m-men", action: "order", order: ids }, "admin@spjimr.org", ADMIN).status, 400);
  assert.match(applyJudgingAction(d, { eventId: "culture-group-dance", action: "order", order: ["s1", "s1", "s2", "s3", "s4"] }, "head@spjimr.org", HEAD).error, /once/);
});

test("redaction: judges see only their own marks, spectators nothing until announced, never another judge's marks", () => {
  const d = data();
  markAll(d, [[[40, 40], [35, 35], [30, 30], [25, 25], [20, 20]], [[30, 30], [35, 35], [30, 30], [25, 25], [20, 20]]]);
  ok(applyJudgingAction(d, { eventId: "culture-group-dance", action: "penalty-add", sectionId: "s1", kind: "marks", value: 10, reason: "Over time" }, "head@spjimr.org", HEAD));
  const viewer = (email, coordinates, judges) => ({ email, central: false, coordinates: () => coordinates, judges: () => judges });
  const asJudge = presentJudging(d.judging, viewer("j2@spjimr.org", false, true))["culture-group-dance"];
  assert.ok(asJudge.sheets.every((sheet) => sheet.judge === "j2@spjimr.org"));
  assert.equal(asJudge.sheets.length, 5);
  assert.equal(asJudge.penalties.length, 0);
  assert.deepEqual(asJudge.judges, ["Judge 1", "j2@spjimr.org"]);
  const asSpectator = presentJudging(d.judging, viewer("fan@spjimr.org", false, false))["culture-group-dance"];
  assert.equal(asSpectator.sheets.length, 0);
  assert.equal(asSpectator.penalties.length, 0);
  assert.equal(asSpectator.announced, undefined);
  const asHead = presentJudging(d.judging, viewer("head@spjimr.org", true, false))["culture-group-dance"];
  assert.equal(asHead.sheets.length, 10);
  assert.ok(asHead.sheets.every((sheet) => /^Judge \d$/.test(sheet.judge)));
  assert.equal(JSON.stringify(asHead).includes("@spjimr.org"), false);
});
