import test from "node:test";
import assert from "node:assert/strict";
import { activeNotices, findClashes, istDateTime, istDayKey, planFixtureShift, planRoundRobin, roundRobinRounds } from "./schedule-tools.ts";
import { buildLeaderboards, buildPointsRace } from "./leaderboards.ts";

const sections = ["s1", "s2", "s3", "s4", "s5"];
const describe = (other) => `${other.sectionA} vs ${other.sectionB}`;

function fixture(overrides) {
  return { id: overrides.id ?? Math.random().toString(36).slice(2), eventId: "ev", sectionA: "s1", sectionB: "s2", startsAt: istDateTime("2026-11-24", "16:00"), durationMinutes: 50, venue: "Court 1", status: "scheduled", scoreA: 0, scoreB: 0, periodLabel: "", clockLabel: "", resultConfirmed: false, updatedAt: "2026-11-24T00:00:00.000Z", ...overrides };
}

test("IST helpers convert between calendar time and UTC", () => {
  assert.equal(istDateTime("2026-11-24", "16:00"), "2026-11-24T10:30:00.000Z");
  assert.equal(istDayKey("2026-11-24T19:00:00.000Z"), "2026-11-25");
});

test("round robin pairs every section once with one bye per round for five sections", () => {
  const rounds = roundRobinRounds(sections);
  assert.equal(rounds.length, 5);
  const pairs = rounds.flatMap((round) => round.matches.map((match) => [...match].sort().join("-")));
  assert.equal(pairs.length, 10);
  assert.equal(new Set(pairs).size, 10);
  assert.deepEqual(rounds.map((round) => round.bye).sort(), sections);
  for (const round of rounds) assert.equal(new Set(round.matches.flat()).size, round.matches.length * 2);
});

test("round robin with an even count has no byes", () => {
  const rounds = roundRobinRounds(["s1", "s2", "s3", "s4"]);
  assert.equal(rounds.length, 3);
  assert.ok(rounds.every((round) => round.matches.length === 2 && !round.bye));
});

const baseOptions = { eventId: "ev", sectionIds: sections, startDay: "2026-11-24", endDay: "2026-11-26", windowStart: "16:00", windowEnd: "19:00", slotMinutes: 50, venues: ["Court 1", "Court 2"], restBetweenMatches: false };

test("planning places every match without double-booking venues or sections", () => {
  const plan = planRoundRobin([], baseOptions);
  assert.equal(plan.fixtures.length, 10);
  assert.equal(plan.unplaced, 0);
  for (const [index, item] of plan.fixtures.entries()) {
    const others = plan.fixtures.filter((_, other) => other !== index).map((other) => ({ ...other }));
    assert.deepEqual(findClashes({ ...item }, others, describe), []);
  }
  const lastStart = Math.max(...plan.fixtures.map((item) => new Date(item.startsAt).getTime()));
  assert.ok(lastStart < new Date(istDateTime("2026-11-26", "19:00")).getTime());
});

test("planning avoids existing fixtures for the same section or venue", () => {
  const existing = [fixture({ id: "busy", eventId: "other", sectionA: "s1", sectionB: "s3", venue: "Main Ground", startsAt: istDateTime("2026-11-24", "16:00"), durationMinutes: 120 })];
  const plan = planRoundRobin(existing, baseOptions);
  for (const item of plan.fixtures.filter((planned) => planned.startsAt)) {
    assert.deepEqual(findClashes({ ...item }, existing, describe), [], `${item.sectionA}-${item.sectionB} at ${item.startsAt}`);
  }
});

test("planning reports matches that do not fit", () => {
  const plan = planRoundRobin([], { ...baseOptions, endDay: "2026-11-24", venues: ["Court 1"] });
  assert.equal(plan.fixtures.filter((item) => item.startsAt).length, 3);
  assert.equal(plan.unplaced, 7);
});

test("planning never uses slots before the earliest start", () => {
  const plan = planRoundRobin([], { ...baseOptions, earliestStart: istDateTime("2026-11-24", "17:30") });
  assert.equal(plan.unplaced, 0);
  assert.ok(plan.fixtures.every((item) => new Date(item.startsAt).getTime() >= new Date(istDateTime("2026-11-24", "17:30")).getTime()));
  assert.equal(plan.fixtures[0].startsAt, istDateTime("2026-11-24", "17:40"));
});

test("rest option keeps a section's generated matches at least one slot apart", () => {
  const plan = planRoundRobin([], { ...baseOptions, restBetweenMatches: true, endDay: "2026-11-30" });
  assert.equal(plan.unplaced, 0);
  for (const section of sections) {
    const starts = plan.fixtures.filter((item) => item.sectionA === section || item.sectionB === section).map((item) => new Date(item.startsAt).getTime()).sort((a, b) => a - b);
    for (let index = 1; index < starts.length; index += 1) assert.ok(starts[index] - starts[index - 1] >= 2 * 50 * 60_000);
  }
});

test("shifting moves only scheduled fixtures at the venue from the chosen time", () => {
  const data = { notices: [], fixtures: [
    fixture({ id: "early", startsAt: istDateTime("2026-11-25", "14:00") }),
    fixture({ id: "move-1", startsAt: istDateTime("2026-11-25", "15:00") }),
    fixture({ id: "live", status: "live", startsAt: istDateTime("2026-11-25", "16:00") }),
    fixture({ id: "move-2", sectionA: "s3", sectionB: "s4", startsAt: istDateTime("2026-11-25", "17:00") }),
    fixture({ id: "other-venue", venue: "Turf", sectionA: "s5", sectionB: "s4", startsAt: istDateTime("2026-11-25", "17:00") }),
    fixture({ id: "next-day", startsAt: istDateTime("2026-11-26", "15:00") }),
  ] };
  const moves = planFixtureShift(data, { venue: "court 1", day: "2026-11-25", fromTime: "15:00", minutes: 45 }, describe);
  assert.deepEqual(moves.map((move) => move.fixture.id), ["move-1", "move-2"]);
  assert.equal(moves[0].newStartsAt, istDateTime("2026-11-25", "15:45"));
  // 15:45–16:35 now runs into the live match that stayed at 16:00 on the same court.
  assert.deepEqual(moves[0].clashes.map((clash) => [clash.kind, clash.fixtureId]), [["venue", "live"]]);
  assert.equal(moves[1].clashes.length, 1);
  assert.equal(moves[1].clashes[0].kind, "section");
  assert.equal(moves[1].clashes[0].fixtureId, "other-venue");
});

test("delay notices only show on their own day", () => {
  const data = { notices: [{ id: "n1", day: "2026-11-25", venue: "Court 1", minutes: 30, reason: "Rain", createdAt: "" }] };
  assert.equal(activeNotices(data, new Date(istDateTime("2026-11-25", "18:00"))).length, 1);
  assert.equal(activeNotices(data, new Date(istDateTime("2026-11-26", "09:00"))).length, 0);
});

function statsData() {
  const delivery = (batterId, bowlerId, batRuns, extra = {}) => ({ id: Math.random().toString(36), over: 0, ball: 1, battingSide: "a", batterId, nonStrikerId: "x", bowlerId, batRuns, extraType: "none", extraRuns: 0, legal: true, createdAt: "", actor: "", ...extra });
  return {
    sections: sections.map((id) => ({ id })),
    sports: [{ id: "cricket", category: "sport" }, { id: "football", category: "sport" }, { id: "basketball", category: "sport" }, { id: "dance", category: "cultural" }],
    events: [
      { id: "cricket-m", sportId: "cricket", genderEligibility: "men" },
      { id: "football-m", sportId: "football", genderEligibility: "men" },
      { id: "basketball-w", sportId: "basketball", genderEligibility: "women" },
      { id: "dance", sportId: "dance", genderEligibility: "open" },
    ],
    participants: [
      { id: "p1", name: "Batter One", sectionId: "s1", studentId: "X1" },
      { id: "p2", name: "Batter Two", sectionId: "s2", studentId: "X2" },
      { id: "p3", name: "Bowler", sectionId: "s2", studentId: "X3" },
      { id: "p4", name: "Striker", sectionId: "s3", studentId: "X4" },
      { id: "p5", name: "Guard", sectionId: "s4", studentId: "X5" },
    ],
    fixtures: [
      fixture({ id: "c1", eventId: "cricket-m", status: "completed", resultConfirmed: true, resultFinalizedAt: istDateTime("2026-11-20", "18:00"), awardedPointsA: 2, awardedPointsB: 0, scorecard: { playerStats: {}, events: [], cricket: { innings: [{ number: 1, battingSide: "a", strikerId: "p1", nonStrikerId: "x", bowlerId: "p3", deliveries: [
        delivery("p1", "p3", 4), delivery("p1", "p3", 6), delivery("p2", "p3", 0, { extraType: "wide", extraRuns: 0, legal: false }),
        delivery("p2", "p3", 10), delivery("p1", "p3", 0, { wicket: { kind: "bowled", playerOutId: "p1" } }),
        delivery("p2", "p3", 6, { reversedAt: "2026-11-20T00:00:00Z" }),
      ] }] } } }),
      fixture({ id: "f1", eventId: "football-m", status: "completed", resultConfirmed: true, resultFinalizedAt: istDateTime("2026-11-21", "18:00"), awardedPointsA: 0, awardedPointsB: 3, scorecard: { playerStats: { p4: { goal: 2 } }, events: [] } }),
      fixture({ id: "f2", eventId: "football-m", status: "live", resultConfirmed: false, scorecard: { playerStats: { p4: { goal: 5 } }, events: [] } }),
      fixture({ id: "b1", eventId: "basketball-w", status: "completed", resultConfirmed: true, resultFinalizedAt: istDateTime("2026-11-21", "19:00"), awardedPointsA: 3, awardedPointsB: 0, sectionA: "s4", sectionB: "s5", scorecard: { playerStats: { p5: { points: 17 } }, events: [] } }),
      fixture({ id: "d1", eventId: "dance", status: "completed", resultConfirmed: true, resultFinalizedAt: istDateTime("2026-11-23", "20:00"), awardedPointsA: 8, awardedPointsB: 5, sectionA: "s3", sectionB: "s1", scorecard: undefined }),
    ],
  };
}

test("leaderboards count finalized, attributed events and share tied ranks", () => {
  const boards = Object.fromEntries(buildLeaderboards(statsData(), { showNames: true }).map((board) => [board.id, board]));
  assert.deepEqual(boards["cricket-runs"].rows.map((row) => [row.name, row.value, row.rank, row.tied]), [["Batter One", 10, 1, true], ["Batter Two", 10, 1, true]]);
  assert.equal(boards["cricket-runs"].rows.find((row) => row.name === "Batter One").detail, "3 balls · SR 333.3");
  assert.deepEqual(boards["cricket-wickets"].rows.map((row) => [row.name, row.value]), [["Bowler", 1]]);
  // 4 + 6 + 1 (wide) + 10 + 0 = 21 conceded from 4 legal balls; the reversed delivery and the wide ball do not count as balls.
  assert.equal(boards["cricket-wickets"].rows[0].detail, "Econ 31.50 · 0.4 ov");
  assert.deepEqual(boards["football-goals"].rows.map((row) => row.value), [2]);
  assert.deepEqual(boards["basketball-points"].rows.map((row) => [row.name, row.value]), [["Guard", 17]]);
});

test("leaderboards hide names when asked and filter by event gender", () => {
  const anonymous = buildLeaderboards(statsData(), { showNames: false });
  assert.ok(anonymous.every((board) => board.rows.every((row) => row.name === undefined && row.sectionId)));
  assert.ok(anonymous.every((board) => board.rows.every((row) => !("studentId" in row))));
  const women = Object.fromEntries(buildLeaderboards(statsData(), { showNames: true, gender: "women" }).map((board) => [board.id, board]));
  assert.equal(women["cricket-runs"].rows.length, 0);
  assert.equal(women["basketball-points"].rows.length, 1);
});

test("points race accumulates finalized points by IST day and board", () => {
  const overall = buildPointsRace(statsData(), "overall");
  assert.deepEqual(overall.days, ["2026-11-20", "2026-11-21", "2026-11-22", "2026-11-23"]);
  const values = Object.fromEntries(overall.series.map((series) => [series.sectionId, series.values]));
  assert.deepEqual(values.s1, [2, 2, 2, 7]);
  assert.deepEqual(values.s2, [0, 3, 3, 3]);
  assert.deepEqual(values.s4, [0, 3, 3, 3]);
  const cultural = buildPointsRace(statsData(), "cultural");
  assert.deepEqual(cultural.days, ["2026-11-23"]);
  const sports = buildPointsRace(statsData(), "sports");
  assert.equal(sports.series.find((series) => series.sectionId === "s3").values.at(-1), 0);
});

test("points race is empty without finalized results", () => {
  const data = statsData();
  data.fixtures = data.fixtures.map((item) => ({ ...item, status: "scheduled", resultConfirmed: false }));
  assert.deepEqual(buildPointsRace(data, "overall").days, []);
});
