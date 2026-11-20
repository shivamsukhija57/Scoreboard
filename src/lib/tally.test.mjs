import test from "node:test";
import assert from "node:assert/strict";
import { applyTallyAction, checkFinishOrder, huntArrivals, huntPointsFor, tallyStandings, tieGroups } from "./tally.ts";

const sections = ["s1", "s2", "s3", "s4", "s5"].map((id) => ({ id, name: id.toUpperCase() }));
const places = [100, 80, 50, 20, 10];
function data() {
  return {
    sections,
    events: [
      { id: "quiz", name: "Quiz", sportId: "quiz", pointsPolicy: { format: "placings", places } },
      { id: "hunt", name: "Hunt", sportId: "treasure-hunt", pointsPolicy: { format: "placings", places } },
      { id: "foot", name: "Football", sportId: "football", pointsPolicy: { format: "league", places: [] } },
    ],
    bonusAwards: [],
  };
}
const ok = (result) => { assert.ok(!("error" in result), result.error); return result; };

test("quiz totals add marks including negative pounces, and undo removes the last entry", () => {
  const d = data();
  ok(applyTallyAction(d, { eventId: "quiz", action: "settings", marking: { direct: 10, bounce: 5, pounceRight: 15, pounceWrong: -5 } }, "q@x"));
  ok(applyTallyAction(d, { eventId: "quiz", action: "add", sectionId: "s1", kind: "direct" }, "q@x"));
  ok(applyTallyAction(d, { eventId: "quiz", action: "add", sectionId: "s2", kind: "pounce-wrong" }, "q@x"));
  ok(applyTallyAction(d, { eventId: "quiz", action: "add", sectionId: "s3", kind: "pounce-right" }, "q@x"));
  ok(applyTallyAction(d, { eventId: "quiz", action: "add", sectionId: "s4", kind: "bounce" }, "q@x"));
  let rows = tallyStandings(d.tallies.quiz, sections.map((s) => s.id));
  assert.deepEqual(rows.map((row) => [row.sectionId, row.total]), [["s3", 15], ["s1", 10], ["s4", 5], ["s5", 0], ["s2", -5]]);
  assert.match(applyTallyAction(d, { eventId: "quiz", action: "undo" }, "q@x").error, /reason/);
  ok(applyTallyAction(d, { eventId: "quiz", action: "undo", reason: "Wrong division" }, "q@x"));
  rows = tallyStandings(d.tallies.quiz, sections.map((s) => s.id));
  assert.equal(rows.find((row) => row.sectionId === "s4").total, 0);
  // Marks are locked once scoring has started.
  assert.equal(applyTallyAction(d, { eventId: "quiz", action: "settings", marking: { direct: 1, bounce: 1, pounceRight: 1, pounceWrong: 0 } }, "q@x").status, 409);
});

test("quiz rejects bad input and non-tally events", () => {
  const d = data();
  assert.equal(applyTallyAction(d, { eventId: "foot", action: "add", sectionId: "s1", kind: "direct" }, "x").status, 400);
  assert.equal(applyTallyAction(d, { eventId: "quiz", action: "add", sectionId: "s9", kind: "direct" }, "x").status, 400);
  assert.equal(applyTallyAction(d, { eventId: "quiz", action: "add", sectionId: "s1", kind: "arrival" }, "x").status, 400);
  assert.equal(applyTallyAction(d, { eventId: "quiz", action: "settings", marking: { direct: 10, bounce: 5, pounceRight: 10, pounceWrong: 5 } }, "x").status, 400);
  assert.equal(applyTallyAction(d, { eventId: "quiz", action: "question", question: 31 }, "x").status, 400);
});

test("tie detection groups level quiz totals; the finish order may settle them only with a note", () => {
  const d = data();
  for (const id of ["s1", "s2"]) ok(applyTallyAction(d, { eventId: "quiz", action: "add", sectionId: id, kind: "direct" }, "x"));
  const rows = tallyStandings(d.tallies.quiz, sections.map((s) => s.id));
  assert.deepEqual(tieGroups("quiz", rows), [["s1", "s2"], ["s3", "s4", "s5"]]);
  assert.match(checkFinishOrder("quiz", rows, ["s2", "s1", "s3", "s4", "s5"]), /tie/);
  assert.equal(checkFinishOrder("quiz", rows, ["s2", "s1", "s3", "s4", "s5"], "Tie-breaker question"), null);
  assert.match(checkFinishOrder("quiz", rows, ["s3", "s1", "s2", "s4", "s5"], "note"), /totals/);
  assert.match(checkFinishOrder("quiz", rows, ["s1", "s2"], "note"), /every division/);
});

test("hunt check-ins pay by arrival order and a division can't check in twice", () => {
  const d = data();
  ok(applyTallyAction(d, { eventId: "hunt", action: "settings", milestones: [{ name: "Gate 4", points: [10, 8, 6, 4, 2] }, { name: "Library", points: [20, 15, 10, 5, 0] }] }, "v@x"));
  const [gate, library] = d.tallies.hunt.milestones;
  assert.equal(huntPointsFor(gate, 2), 8);
  assert.equal(huntPointsFor(gate, 9), 0);
  assert.equal(applyTallyAction(d, { eventId: "hunt", action: "add", sectionId: "s3", milestoneId: gate.id }, "v").status, 400, "all-present tick required");
  ok(applyTallyAction(d, { eventId: "hunt", action: "add", sectionId: "s3", milestoneId: gate.id, allPresent: true }, "v"));
  ok(applyTallyAction(d, { eventId: "hunt", action: "add", sectionId: "s1", milestoneId: gate.id, allPresent: true }, "v"));
  assert.equal(applyTallyAction(d, { eventId: "hunt", action: "add", sectionId: "s3", milestoneId: gate.id, allPresent: true }, "v").status, 409);
  assert.deepEqual(huntArrivals(d.tallies.hunt, gate.id), ["s3", "s1"]);
  assert.deepEqual(d.tallies.hunt.entries.map((entry) => [entry.place, entry.points]), [[1, 10], [2, 8]]);
  ok(applyTallyAction(d, { eventId: "hunt", action: "add", sectionId: "s1", milestoneId: library.id, allPresent: true }, "v"));
  // Points of a milestone with check-ins are locked.
  assert.equal(applyTallyAction(d, { eventId: "hunt", action: "settings", milestones: [{ id: gate.id, name: "Gate 4", points: [1, 1, 1, 1, 1] }, { id: library.id, name: "Library", points: [20, 15, 10, 5, 0] }] }, "v").status, 409);
});

test("hunt tie-break: level totals rank by more first-place milestones, then record placings", () => {
  const d = data();
  ok(applyTallyAction(d, { eventId: "hunt", action: "settings", milestones: [{ name: "One", points: [10, 8, 6, 4, 2] }, { name: "Two", points: [10, 8, 6, 4, 2] }, { name: "Three", points: [10, 8, 6, 4, 2] }] }, "v"));
  const [one, two, three] = d.tallies.hunt.milestones;
  const arrive = (milestone, order) => order.forEach((id) => ok(applyTallyAction(d, { eventId: "hunt", action: "add", sectionId: id, milestoneId: milestone.id, allPresent: true }, "v")));
  // s2: 8 + 8 + 10 = 26 with one first; s1: 10 + 10 + 6 = 26 with two firsts.
  arrive(one, ["s1", "s2", "s3", "s4", "s5"]);
  arrive(two, ["s1", "s2", "s3", "s4", "s5"]);
  arrive(three, ["s2", "s3", "s1", "s4", "s5"]);
  const rows = tallyStandings(d.tallies.hunt, sections.map((s) => s.id));
  assert.deepEqual(rows.slice(0, 2).map((row) => [row.sectionId, row.total, row.firsts]), [["s1", 26, 2], ["s2", 26, 1]]);
  assert.deepEqual(tieGroups("hunt", rows), []);
  assert.match(checkFinishOrder("hunt", rows, ["s2", "s1", "s3", "s4", "s5"], "note"), /totals/);
  const result = ok(applyTallyAction(d, { eventId: "hunt", action: "finish", order: rows.map((row) => row.sectionId) }, "v"));
  assert.equal(result.placings, true);
  assert.deepEqual(d.bonusAwards.map((award) => [award.sectionId, award.place, award.points, award.kind]), [["s1", 1, 100, "placing"], ["s2", 2, 80, "placing"], ["s3", 3, 50, "placing"], ["s4", 4, 20, "placing"], ["s5", 5, 10, "placing"]]);
  // Once recorded, scoring is closed and the results can't be recorded twice.
  assert.equal(applyTallyAction(d, { eventId: "hunt", action: "add", sectionId: "s5", milestoneId: one.id, allPresent: true }, "v").status, 409);
  assert.equal(applyTallyAction(d, { eventId: "hunt", action: "finish", order: rows.map((row) => row.sectionId) }, "v").status, 409);
});
