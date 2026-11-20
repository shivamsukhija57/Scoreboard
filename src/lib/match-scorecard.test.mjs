import test from "node:test";
import assert from "node:assert/strict";
import { endCricketInnings, migrateLegacyResults, recordCricketBowlOut, recordCricketDelivery, recordMatchEvent, reverseCricketDelivery, startCricketInnings } from "./match-scorecard.ts";
import { auditForRole, canScoreEvent, describeMatchAuditAction, finalizedFixturesForEvents, isUnchangedSnapshot, mergeCompetitionData, newerFixture, projectScoreAction, retryDelayMs, shouldPollFixture } from "./live-scoring-utils.ts";

const eventId = "cricket-event";
const data = {
  sports: [{ id: "cricket", name: "Cricket" }],
  events: [{ id: eventId, sportId: "cricket", scoringConfig: { oversPerInnings: 2, wicketsPerInnings: 2 }, pointsPolicy: { published: true, pointsByOutcome: { win: 2, loss: 0, draw: 1 }, places: [2, 0] } }],
  participants: [],
  entries: [
    { eventId, sectionId: "section-a", participantIds: ["a1", "a2", "a3"] },
    { eventId, sectionId: "section-b", participantIds: ["b1", "b2", "b3"] },
  ],
};

function setup({ oversPerInnings = 2, wicketsPerInnings = 2 } = {}) {
  const matchData = structuredClone(data);
  matchData.events[0].scoringConfig = { oversPerInnings, wicketsPerInnings };
  const fixture = { id: "fixture-1", eventId, sectionA: "section-a", sectionB: "section-b", status: "live", scoreA: 0, scoreB: 0 };
  assert.equal(startCricketInnings(matchData, fixture, { cricketInnings: { battingSide: "a", strikerId: "a1", nonStrikerId: "a2", bowlerId: "b1" } }), null);
  return { data: matchData, fixture };
}

function ball(fixture, overrides = {}) {
  const innings = fixture.scorecard.cricket.innings.at(-1);
  return recordCricketDelivery(data, fixture, {
    cricketDelivery: {
      battingSide: innings.battingSide,
      batterId: innings.strikerId,
      nonStrikerId: innings.nonStrikerId,
      bowlerId: innings.bowlerId,
      batRuns: 0,
      extraType: "none",
      extraRuns: 0,
      ...overrides,
    },
  }, "scorer@example.edu");
}

test("records batter runs, boundaries, and legal-ball totals", () => {
  const { fixture } = setup();
  assert.equal(ball(fixture, { batRuns: 4 }), null);
  const innings = fixture.scorecard.cricket.innings[0];
  assert.equal(ball(fixture, { batterId: innings.strikerId, nonStrikerId: innings.nonStrikerId, batRuns: 6 }), null);
  assert.equal(fixture.scoreA, 10);
  assert.equal(fixture.scorecard.legalBallsA, 2);
});

test("wide and no-ball penalties add one run and do not use a legal ball", () => {
  const { fixture } = setup();
  assert.equal(ball(fixture, { extraType: "wide" }), null);
  let innings = fixture.scorecard.cricket.innings[0];
  assert.equal(ball(fixture, { batterId: innings.strikerId, nonStrikerId: innings.nonStrikerId, extraType: "no-ball", batRuns: 1 }), null);
  assert.equal(fixture.scoreA, 3);
  assert.equal(fixture.scorecard.legalBallsA, 0);
});

test("byes and leg-byes add to the team total without charging the bowler", () => {
  const { fixture } = setup();
  assert.equal(ball(fixture, { extraType: "bye", extraRuns: 2 }), null);
  let innings = fixture.scorecard.cricket.innings[0];
  assert.equal(ball(fixture, { batterId: innings.strikerId, nonStrikerId: innings.nonStrikerId, extraType: "leg-bye", extraRuns: 1 }), null);
  assert.equal(fixture.scoreA, 3);
  const deliveries = fixture.scorecard.cricket.innings[0].deliveries;
  assert.equal(deliveries.filter((delivery) => delivery.legal).length, 2);
});

test("dismissals update the wicket total and invalid no-ball dismissals are rejected", () => {
  const { fixture } = setup();
  assert.equal(ball(fixture, { extraType: "no-ball", wicket: { kind: "bowled", playerOutId: "a1" } }), "This dismissal cannot be awarded from a no-ball.");
  assert.equal(ball(fixture, { wicket: { kind: "bowled", playerOutId: "a1" } }), null);
  assert.equal(fixture.scorecard.wicketsA, 1);
});

test("odd runs rotate strike", () => {
  const { fixture } = setup();
  assert.equal(ball(fixture, { batRuns: 1 }), null);
  assert.equal(fixture.scorecard.cricket.innings[0].strikerId, "a2");
});

test("the strike changes at the end of six legal balls", () => {
  const { fixture } = setup();
  for (let i = 0; i < 6; i += 1) assert.equal(ball(fixture), null);
  assert.equal(fixture.scorecard.cricket.innings[0].strikerId, "a2");
  assert.equal(fixture.scorecard.legalBallsA, 6);
});

test("legal-ball display numbering begins at 0.1 and advances by over", () => {
  const { fixture } = setup();
  for (let i = 0; i < 6; i += 1) assert.equal(ball(fixture), null);
  const innings = fixture.scorecard.cricket.innings[0];
  assert.deepEqual(innings.deliveries.map((delivery) => [delivery.over, delivery.ball]), [[0, 1], [0, 2], [0, 3], [0, 4], [0, 5], [0, 6]]);
  assert.equal(ball(fixture), "Choose a different bowler for the new over.");
  assert.equal(ball(fixture, { bowlerId: "b2" }), null);
  assert.deepEqual([innings.deliveries[6].over, innings.deliveries[6].ball], [1, 1]);
});

test("reversing a delivery recalculates totals and preserves correction metadata", () => {
  const { data: matchData, fixture } = setup();
  assert.equal(ball(fixture, { batRuns: 4 }), null);
  const delivery = fixture.scorecard.cricket.innings[0].deliveries[0];
  assert.equal(reverseCricketDelivery(matchData, fixture, { eventId: delivery.id, correctionReason: "Wrong button" }, "admin@example.edu"), null);
  assert.equal(fixture.scoreA, 0);
  assert.equal(fixture.scorecard.legalBallsA, 0);
  assert.match(delivery.correctionReason, /Wrong button.*admin@example.edu/);
  assert.ok(delivery.reversedAt);
});

test("innings can be closed and the opposing section must bat second", () => {
  const { data: matchData, fixture } = setup();
  assert.equal(endCricketInnings(fixture), null);
  assert.equal(startCricketInnings(matchData, fixture, { cricketInnings: { battingSide: "a", strikerId: "a1", nonStrikerId: "a2", bowlerId: "b1" } }), "The second innings must be played by the other section.");
  assert.equal(startCricketInnings(matchData, fixture, { cricketInnings: { battingSide: "b", strikerId: "b1", nonStrikerId: "b2", bowlerId: "a1" } }), null);
});

test("a completed chase is finalized on submit with configured points", () => {
  const { data: matchData, fixture } = setup();
  assert.equal(ball(fixture, { batRuns: 4 }), null);
  assert.equal(endCricketInnings(fixture), null);
  assert.equal(startCricketInnings(matchData, fixture, { cricketInnings: { battingSide: "b", strikerId: "b1", nonStrikerId: "b2", bowlerId: "a1" } }), null);
  const second = fixture.scorecard.cricket.innings.at(-1);
  assert.equal(recordCricketDelivery(matchData, fixture, { cricketDelivery: { battingSide: "b", batterId: "b1", nonStrikerId: "b2", bowlerId: "a1", batRuns: 6, extraType: "none", extraRuns: 0 } }, "scorer@example.edu"), null);
  assert.equal(second.completed, true);
  assert.equal(recordMatchEvent(matchData, fixture, { action: "submit" }, "scorer@example.edu"), null);
  assert.equal(fixture.resultConfirmed, true);
  assert.equal(fixture.status, "completed");
  assert.deepEqual([fixture.awardedPointsA, fixture.awardedPointsB], [0, 2]);
});

test("reopening removes awarded points until the corrected result is resubmitted", () => {
  const matchData = {
    sports: [{ id: "football", name: "Football" }],
    events: [{ id: "football-event", sportId: "football", pointsPolicy: { published: true, pointsByOutcome: { win: 3, loss: 0, draw: 1 }, places: [3] } }],
    entries: [], participants: [],
  };
  const fixture = { id: "football-fixture", eventId: "football-event", sectionA: "section-a", sectionB: "section-b", status: "live", scoreA: 8, scoreB: 3 };
  assert.equal(recordMatchEvent(matchData, fixture, { action: "submit" }, "scorer@example.edu"), null);
  assert.equal(fixture.status, "completed");
  assert.deepEqual([fixture.awardedPointsA, fixture.awardedPointsB], [3, 0]);
  assert.equal(recordMatchEvent(matchData, fixture, { action: "reopen", reviewNote: "Corrected score" }, "admin@example.edu"), null);
  assert.equal(fixture.status, "live");
  assert.deepEqual([fixture.awardedPointsA, fixture.awardedPointsB], [0, 0]);
  fixture.scoreA = 2;
  fixture.scoreB = 4;
  assert.equal(recordMatchEvent(matchData, fixture, { action: "submit" }, "scorer@example.edu"), null);
  assert.deepEqual([fixture.awardedPointsA, fixture.awardedPointsB], [0, 3]);
});

test("legacy submitted results auto-finalize once after the points policy is published", () => {
  const matchData = structuredClone(data);
  const fixture = { id: "legacy-fixture", eventId, sectionA: "section-a", sectionB: "section-b", status: "awaiting-confirmation", scoreA: 5, scoreB: 2, resultConfirmed: false, resultSubmittedAt: "2026-01-01T00:00:00.000Z", resultSubmittedBy: "head@example.edu", updatedAt: "2026-01-01T00:00:00.000Z" };
  matchData.fixtures = [fixture];
  matchData.audit = [];
  migrateLegacyResults(matchData);
  assert.equal(fixture.status, "completed");
  assert.deepEqual([fixture.awardedPointsA, fixture.awardedPointsB], [2, 0]);
  assert.equal(matchData.audit.length, 1);
  assert.equal(matchData.audit[0].id, "legacy-finalized:legacy-fixture");
  migrateLegacyResults(matchData);
  assert.equal(matchData.audit.length, 1);
});

test("missing points on an already-final legacy result are backfilled and audited once", () => {
  const matchData = structuredClone(data);
  const fixture = { id: "legacy-final", eventId, sectionA: "section-a", sectionB: "section-b", status: "completed", scoreA: 3, scoreB: 1, resultConfirmed: true, awardedPointsA: undefined, awardedPointsB: undefined, resultSubmittedBy: "head@example.edu", updatedAt: "2026-01-01T00:00:00.000Z" };
  matchData.fixtures = [fixture];
  matchData.audit = [];
  migrateLegacyResults(matchData);
  assert.deepEqual([fixture.awardedPointsA, fixture.awardedPointsB], [2, 0]);
  assert.equal(matchData.audit[0].id, "legacy-awards-backfilled:legacy-final");
  migrateLegacyResults(matchData);
  assert.equal(matchData.audit.length, 1);
});

test("focused live snapshot helpers handle revisions, visibility, and bounded retry", () => {
  assert.equal(isUnchangedSnapshot('"r1"', "r1"), true);
  assert.equal(isUnchangedSnapshot('"r0"', "r1"), false);
  assert.equal(shouldPollFixture("live", true), true);
  assert.equal(shouldPollFixture("live", false), false);
  assert.equal(shouldPollFixture("scheduled", true), false);
  assert.equal(retryDelayMs(0), 1_000);
  assert.equal(retryDelayMs(3), 8_000);
  assert.equal(retryDelayMs(50), 8_000);
  const current = { id: "m", updatedAt: "2026-01-02T00:00:00.000Z" };
  const stale = { id: "m", updatedAt: "2026-01-01T00:00:00.000Z" };
  assert.equal(newerFixture(current, stale, current.updatedAt), current);
});

test("score projection is optimistic and callers can reconcile to canonical fixture", () => {
  const fixture = { id: "m", scoreA: 4, scoreB: 2, updatedAt: "2026-01-01T00:00:00.000Z" };
  const optimistic = projectScoreAction(fixture, { action: "record-event", event: { kind: "goal", side: "a", points: 1 } });
  assert.deepEqual([optimistic.scoreA, optimistic.scoreB], [5, 2]);
  assert.deepEqual([fixture.scoreA, fixture.scoreB], [4, 2]);
  const canonical = { ...optimistic, scoreA: 6, updatedAt: "2026-01-02T00:00:00.000Z" };
  const reconciled = newerFixture(optimistic, canonical, fixture.updatedAt);
  assert.equal(reconciled.scoreA, 6);
});

test("a slower full competition response cannot replace a newer selected-match snapshot", () => {
  const newer = { id: "m", updatedAt: "2026-01-02T00:00:00.000Z", scoreA: 9 };
  const stale = { id: "m", updatedAt: "2026-01-01T00:00:00.000Z", scoreA: 2 };
  const merged = mergeCompetitionData({ fixtures: [newer] }, { fixtures: [stale] }, "m", new Map([["m", newer.updatedAt]]));
  assert.equal(merged.fixtures[0].scoreA, 9);
});

test("format selection includes finalized event rows only and retains zero-point results", () => {
  const fixtures = [
    { eventId: "cricket-men", status: "completed", resultConfirmed: true, awardedPointsA: 0 },
    { eventId: "cricket-women", status: "completed", resultConfirmed: true, awardedPointsA: 2 },
    { eventId: "cricket-men", status: "live", resultConfirmed: false, awardedPointsA: 9 },
    { eventId: "cricket-men", status: "live", resultConfirmed: false, reopened: true, awardedPointsA: 4 },
  ];
  const rows = finalizedFixturesForEvents(fixtures, new Set(["cricket-men"]));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].awardedPointsA, 0);
});

test("audit filtering exposes no audit entries outside central-admin access", () => {
  const entries = [{ id: "a", at: "now", actor: "admin@example.edu", action: "match-submit", detail: "finalized", entityId: "m" }];
  assert.deepEqual(auditForRole(entries, false), []);
  assert.deepEqual(auditForRole(entries, true), entries);
});

test("event-scoring access respects specific assignments and central-admin override", () => {
  assert.equal(canScoreEvent([{ email: "head@example.edu", role: "event-head", scopeId: "cricket", active: true }], "cricket-men"), true);
  assert.equal(canScoreEvent([{ email: "head@example.edu", role: "event-head", scopeId: "cricket", active: true }], "football"), false);
  assert.equal(canScoreEvent([{ email: "head@example.edu", role: "event-head", scopeId: "cricket", active: false }], "cricket-men"), false);
  assert.equal(canScoreEvent([{ email: "admin@example.edu", role: "central-admin", active: true }], "football"), true);
});

test("submitted semifinal results use the semifinal-loss award configured for that stage", () => {
  const matchData = {
    sports: [{ id: "football", name: "Football" }],
    events: [{ id: "football-event", sportId: "football", pointsPolicy: { published: true, pointsByOutcome: { win: 4, loss: 0, leagueLoss: 0, semifinalLoss: 2, finalWin: 7 }, places: [4] } }],
    entries: [], participants: [],
  };
  const fixture = { id: "semi-final", eventId: "football-event", sectionA: "section-a", sectionB: "section-b", stage: "semifinal", status: "live", scoreA: 3, scoreB: 1 };
  assert.equal(recordMatchEvent(matchData, fixture, { action: "submit" }, "head@example.edu"), null);
  assert.deepEqual([fixture.awardedPointsA, fixture.awardedPointsB], [4, 2]);
});

test("audit details include actor context data, final points, and correction reason", () => {
  const auditData = {
    events: [{ id: "football-event", name: "Men's Football", sportId: "football" }],
    participants: [{ id: "p1", name: "Player One" }],
  };
  const fixture = { id: "audit-match", eventId: "football-event", sectionA: "A", sectionB: "B", stage: "final", scoreA: 2, scoreB: 1, awardedPointsA: 7, awardedPointsB: 1 };
  const submitted = describeMatchAuditAction(auditData, fixture, { action: "submit" }, { scoreA: 2, scoreB: 1, pointsA: 0, pointsB: 0 });
  assert.match(submitted, /finalized · points 7–1/);
  const reopened = describeMatchAuditAction(auditData, fixture, { action: "reopen", reviewNote: "Wrong score" }, { scoreA: 2, scoreB: 1, pointsA: 7, pointsB: 1 });
  assert.match(reopened, /points removed 7–1 · reason: Wrong score/);
  const correction = describeMatchAuditAction(auditData, fixture, { action: "reverse-event", correctionReason: "Duplicate goal" }, { scoreA: 3, scoreB: 1, pointsA: 0, pointsB: 0 });
  assert.match(correction, /3–1 → 2–1 · reason: Duplicate goal/);
});

test("a level match needs a Super Over; the Super Over winner takes the points without changing the score", () => {
  const { data: matchData, fixture } = setup();
  const tie = (side, batter, partner, bowler, runs) => recordCricketDelivery(matchData, fixture, { cricketDelivery: { battingSide: side, batterId: batter, nonStrikerId: partner, bowlerId: bowler, batRuns: runs, extraType: "none", extraRuns: 0 } }, "scorer@example.edu");
  assert.equal(tie("a", "a1", "a2", "b1", 4), null);
  assert.equal(endCricketInnings(fixture), null);
  assert.equal(startCricketInnings(matchData, fixture, { cricketInnings: { battingSide: "b", strikerId: "b1", nonStrikerId: "b2", bowlerId: "a1" } }), null);
  assert.equal(tie("b", "b1", "b2", "a1", 4), null);
  assert.equal(endCricketInnings(fixture), null);
  assert.match(recordMatchEvent(matchData, fixture, { action: "submit" }, "s"), /Super Over/);
  // Super Over: innings 3 and 4, one over and two wickets each.
  assert.equal(startCricketInnings(matchData, fixture, { cricketInnings: { battingSide: "b", strikerId: "b1", nonStrikerId: "b2", bowlerId: "a1" } }), null);
  assert.equal(tie("b", "b1", "b2", "a1", 6), null);
  assert.equal(endCricketInnings(fixture), null);
  assert.equal(startCricketInnings(matchData, fixture, { cricketInnings: { battingSide: "a", strikerId: "a1", nonStrikerId: "a2", bowlerId: "b1" } }), null);
  assert.equal(tie("a", "a1", "a2", "b1", 2), null);
  assert.equal(endCricketInnings(fixture), null);
  assert.deepEqual([fixture.scoreA, fixture.scoreB], [4, 4]);
  assert.equal(fixture.tieBreak.winner, "b");
  assert.equal(recordMatchEvent(matchData, fixture, { action: "submit" }, "s"), null);
  assert.deepEqual([fixture.awardedPointsA, fixture.awardedPointsB], [0, 2]);
});

test("a level Super Over waits for the bowl-out winner", () => {
  const { data: matchData, fixture } = setup();
  for (const [side, bat, bowl] of [["a", ["a1", "a2"], "b1"], ["b", ["b1", "b2"], "a1"], ["b", ["b1", "b2"], "a1"], ["a", ["a1", "a2"], "b1"]]) {
    if (fixture.scorecard.cricket.innings.at(-1)?.completed) assert.equal(startCricketInnings(matchData, fixture, { cricketInnings: { battingSide: side, strikerId: bat[0], nonStrikerId: bat[1], bowlerId: bowl } }), null);
    assert.equal(endCricketInnings(fixture), null);
  }
  assert.match(recordMatchEvent(matchData, fixture, { action: "submit" }, "s"), /bowl-out/);
  assert.match(startCricketInnings(matchData, fixture, { cricketInnings: { battingSide: "a", strikerId: "a1", nonStrikerId: "a2", bowlerId: "b1" } }), /Super Over is complete/);
  assert.equal(recordCricketBowlOut(matchData, fixture, { action: "cricket-bowl-out", tieBreakWinner: "a", reviewNote: "3-2 in the bowl-out" }, "admin"), null);
  assert.equal(recordMatchEvent(matchData, fixture, { action: "submit" }, "s"), null);
  assert.deepEqual([fixture.awardedPointsA, fixture.awardedPointsB], [2, 0]);
});
