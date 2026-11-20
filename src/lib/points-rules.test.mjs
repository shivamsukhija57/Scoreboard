import test from "node:test";
import assert from "node:assert/strict";
import { bonusPointsFor, eventTable, fixtureAwards, fixtureOutcome, outcomePointsFor, topperStatus, walkoverScores } from "./points-rules.ts";
import { rulebookEvents } from "./rulebook-data.ts";

const event = (id) => rulebookEvents.find((item) => item.id === id);

test("2026 sports points follow X, 1.5X, 0.5X and 2X", () => {
  assert.deepEqual(outcomePointsFor("league", 14), { leagueWin: 14, leagueTopper: 14, semifinalWin: 21, semifinalLoss: 7, finalWin: 28 });
  assert.deepEqual(outcomePointsFor("ring-group", 10, { splitDraw: true }), { groupWin: 10, semifinalWin: 15, semifinalLoss: 5, finalWin: 20, draw: 5 });
  assert.equal(outcomePointsFor("chit-ring", 8).leagueTopper, 8);
});

test("rulebook events carry the 2026 values", () => {
  assert.equal(event("cricket-open").pointsPolicy.pointsByOutcome.semifinalWin, 21);
  assert.equal(event("football-open").pointsPolicy.format, "ring-group");
  assert.equal(event("football-open").pointsPolicy.pointsByOutcome.groupWin, 14);
  assert.equal(event("football-open").entriesPerDivision, 2);
  assert.equal(event("badminton-mens-singles").pointsPolicy.pointsByOutcome.finalWin, 16);
  assert.equal(event("tennis-open").pointsPolicy.unit, 12);
  assert.equal(event("squash-mens-singles").pointsPolicy.format, "ring-group");
  assert.equal(event("squash-womens-singles").pointsPolicy.format, "chit-ring");
  assert.equal(event("fifa-open").pointsPolicy.unit, 6);
  assert.equal(event("valorant-open").pointsPolicy.unit, 12);
  assert.equal(event("chess-open").pointsPolicy.pointsByOutcome.draw, 5);
  assert.deepEqual(event("culture-group-dance").pointsPolicy.places, [160, 120, 80, 40, 20]);
  assert.deepEqual(event("culture-quiz").pointsPolicy.places, [100, 80, 50, 20, 10]);
  assert.equal(event("culture-partner-in-rhyme").name, "Two Much Groove");
  assert.equal(event("culture-curtain-call").name, "Group Skit");
  assert.equal(event("football-open").scoringConfig.walkoverScore, 3);
});

test("stage decides the points a fixture pays", () => {
  const policy = event("cricket-open").pointsPolicy;
  assert.deepEqual(fixtureAwards(policy, "league", "a_win"), [14, 0]);
  assert.deepEqual(fixtureAwards(policy, "semifinal", "b_win"), [7, 21]);
  assert.deepEqual(fixtureAwards(policy, "final", "a_win"), [28, 0]);
  assert.deepEqual(fixtureAwards(event("pool-open").pointsPolicy, "league", "a_win"), [10, 0]);
  assert.deepEqual(fixtureAwards(event("chess-open").pointsPolicy, "league", "draw"), [5, 5]);
});

test("walkovers win on the flag and use the event's walkover score", () => {
  assert.equal(fixtureOutcome({ scoreA: 0, scoreB: 0, walkoverWinner: "b" }), "b_win");
  assert.deepEqual(walkoverScores(event("volleyball-open"), "a"), [25, 0]);
  assert.deepEqual(walkoverScores(event("cricket-open"), "b"), [0, 0]);
});

const sections = ["s1", "s2", "s3", "s4", "s5"].map((id) => ({ id }));
const done = (id, a, b, scoreA, scoreB, extra = {}) => ({ id, eventId: "e", sectionA: a, sectionB: b, scoreA, scoreB, stage: "league", status: "completed", resultConfirmed: true, ...extra });

test("table-topper bonus waits for a complete table and flags ties for the committee", () => {
  const leagueEvent = { id: "e", sportId: "football", pointsPolicy: { format: "chit-ring", places: [], pointsByOutcome: { leagueWin: 8, leagueTopper: 8 } } };
  const ring = [done("1", "s1", "s2", 3, 1), done("2", "s2", "s3", 2, 0), done("3", "s3", "s4", 1, 0), done("4", "s4", "s5", 0, 2)];
  const partial = topperStatus({ sections, fixtures: ring, events: [leagueEvent], bonusAwards: [] }, leagueEvent);
  assert.equal(partial.complete, false);
  assert.equal(partial.expected, 5);
  const full = topperStatus({ sections, fixtures: [...ring, done("5", "s5", "s1", 0, 1)], events: [leagueEvent], bonusAwards: [] }, leagueEvent);
  assert.equal(full.complete, true);
  assert.equal(full.suggested, "s1");
  const levelRing = [done("1", "s1", "s2", 1, 0), done("2", "s2", "s3", 1, 0), done("3", "s3", "s4", 1, 0), done("4", "s4", "s5", 1, 0), done("5", "s5", "s1", 1, 0)];
  const level = topperStatus({ sections, fixtures: levelRing, events: [leagueEvent], bonusAwards: [] }, leagueEvent);
  assert.equal(level.suggested, null);
  assert.equal(level.contenders.length, 5);
});

test("walkovers count as wins but not toward score difference", () => {
  const leagueEvent = { id: "e", sportId: "football", pointsPolicy: { format: "league", places: [], pointsByOutcome: { leagueWin: 14 } } };
  const table = eventTable({ sections, events: [leagueEvent], fixtures: [done("1", "s1", "s2", 3, 0, { walkoverWinner: "a" }), done("2", "s3", "s4", 2, 1)] }, "e");
  const a = table.find((row) => row.sectionId === "s1");
  assert.equal(a.wins, 1);
  assert.equal(a.diff, 0);
});

test("bonus points add to a section's total", () => {
  const data = { bonusAwards: [{ eventId: "e", sectionId: "s1", points: 14 }, { eventId: "f", sectionId: "s1", points: 8 }] };
  assert.equal(bonusPointsFor(data, "s1"), 22);
  assert.equal(bonusPointsFor(data, "s1", (eventId) => eventId === "e"), 14);
});

test("stored data from the older rulebook is updated once and its results re-awarded", async () => {
  const { applyRulebookEdition, createSeedData } = await import("./seed.ts");
  const data = createSeedData();
  delete data.rulebookEdition;
  const football = data.events.find((item) => item.id === "football-open");
  football.name = "Old name";
  football.pointsPolicy = { id: "p", name: "old", places: [], published: true, version: 3, pointsByOutcome: { leagueWin: 20, finalWin: 40 } };
  data.fixtures.push({ id: "f1", eventId: "football-open", sectionA: "s1", sectionB: "s2", scoreA: 2, scoreB: 1, stage: "league", status: "completed", resultConfirmed: true, awardedPointsA: 20, awardedPointsB: 0 });
  applyRulebookEdition(data);
  assert.equal(football.name, "Men's Football");
  assert.equal(football.pointsPolicy.version, 4);
  assert.deepEqual([data.fixtures[0].awardedPointsA, data.fixtures[0].awardedPointsB], [14, 0]);
  assert.equal(data.rulebookEdition, "2026");
  football.pointsPolicy.pointsByOutcome.groupWin = 99;
  applyRulebookEdition(data);
  assert.equal(football.pointsPolicy.pointsByOutcome.groupWin, 99, "admin edits after the update are kept");
});

test("ring-group semis cross over, and a division's two teams meet each other", async () => {
  const { pairRingGroupSemis, semifinalDraw } = await import("./points-rules.ts");
  const t = (sectionId, entry) => ({ sectionId, entry });
  const normal = pairRingGroupSemis([t("s1", 1), t("s3", 1)], [t("s2", 2), t("s4", 2)]);
  assert.deepEqual(normal.semis, [[t("s1", 1), t("s4", 2)], [t("s2", 2), t("s3", 1)]]);
  assert.deepEqual(normal.sameDivision, []);
  const same = pairRingGroupSemis([t("s1", 1), t("s3", 1)], [t("s1", 2), t("s4", 2)]);
  assert.deepEqual(same.sameDivision, ["s1"]);
  assert.deepEqual(same.semis, [[t("s1", 1), t("s1", 2)], [t("s3", 1), t("s4", 2)]]);
  const twoDivisions = pairRingGroupSemis([t("s1", 1), t("s2", 1)], [t("s2", 2), t("s1", 2)]);
  assert.deepEqual(twoDivisions.semis.map(([a, b]) => [a.sectionId, b.sectionId]), [["s1", "s1"], ["s2", "s2"]]);

  // Full draw from finished group rings: Section A tops both groups.
  const event = { id: "pool", pointsPolicy: { format: "ring-group" } };
  const ring = [["s1", "s2"], ["s2", "s3"], ["s3", "s4"], ["s4", "s5"], ["s5", "s1"]];
  const fixtures = [1, 2].flatMap((group) => ring.map(([a, b], i) => ({ id: `${group}-${i}`, eventId: "pool", sectionA: a, sectionB: b, group, entryA: group, entryB: group, stage: "league", status: "completed", resultConfirmed: true,
    scoreA: a === "s1" || (a === "s3" && group === 1) || (a === "s4" && group === 2) ? 2 : 0, scoreB: b === "s1" ? 2 : a === "s1" ? 0 : 1 })));
  const draw = semifinalDraw({ sections, events: [event], fixtures }, event);
  assert.equal(draw.complete, true);
  assert.deepEqual(draw.sameDivision, ["s1"]);
  assert.deepEqual(draw.semis[0].map((team) => team.sectionId), ["s1", "s1"]);
});

test("stored divisions take their real names and colours, keeping ids, caps and results", async () => {
  const { applyDivisionIdentity, createSeedData } = await import("./seed.ts");
  const data = createSeedData();
  delete data.divisionIdentity;
  data.sections[0].name = "Section A"; data.sections[0].color = "#e4ff3f"; data.sections[0].maxSportsPerPlayer = 5;
  applyDivisionIdentity(data);
  assert.equal(data.sections[0].id, "s1");
  assert.equal(data.sections[0].name, "Ares");
  assert.equal(data.sections[4].name, "Eagles");
  assert.equal(data.sections[0].maxSportsPerPlayer, 5);
  assert.ok(data.sections.every((section) => section.line));
  const audits = data.audit.length;
  applyDivisionIdentity(data);
  assert.equal(data.audit.length, audits, "runs once");
});
