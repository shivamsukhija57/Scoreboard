import test from "node:test";
import assert from "node:assert/strict";
import { awaySummary, leadCatchUp, leaderHistory } from "./moments.ts";

const sections = ["s1", "s2", "s3"].map((id) => ({ id }));
const events = [{ id: "e", name: "Group Dance" }];
const result = (id, at, a, b, pa, pb) => ({ id, eventId: "e", sectionA: a, sectionB: b, scoreA: pa, scoreB: pb, awardedPointsA: pa, awardedPointsB: pb, status: "completed", resultConfirmed: true, resultFinalizedAt: at, updatedAt: at });

const fixtures = [
  result("1", "2026-11-19T10:00:00Z", "s1", "s2", 14, 0),
  result("2", "2026-11-19T11:00:00Z", "s2", "s3", 14, 0),
  result("3", "2026-11-19T12:00:00Z", "s2", "s1", 14, 0),
  result("4", "2026-11-19T13:00:00Z", "s3", "s1", 160, 0),
];

test("the lead changes only when someone is clear on their own", () => {
  const history = leaderHistory({ sections, events, fixtures, bonusAwards: [] });
  assert.deepEqual(history.changes.map((change) => [change.sectionId, change.from]), [["s1", null], ["s2", "s1"], ["s3", "s2"]]);
  assert.equal(history.leader, "s3");
  assert.equal(history.changes.at(-1).cause, "Group Dance +160");
});

test("returning visitors see a catch-up only when the leader is different and the change is recent", () => {
  const history = leaderHistory({ sections, events, fixtures, bonusAwards: [] });
  const now = new Date("2026-11-19T14:00:00Z");
  assert.equal(leadCatchUp(history, null, now).kind, "none", "first visit");
  assert.equal(leadCatchUp(history, { leader: "s3", at: "2026-11-19T09:00:00Z" }, now).kind, "none", "same leader");
  const single = leadCatchUp(history, { leader: "s2", at: "2026-11-19T12:30:00Z" }, now);
  assert.equal(single.kind, "single");
  const many = leadCatchUp(history, { leader: "s1", at: "2026-11-19T10:30:00Z" }, now);
  assert.deepEqual([many.kind, many.count], ["many", 2]);
  assert.equal(leadCatchUp(history, { leader: "s2", at: "2026-11-19T12:30:00Z" }, new Date("2026-11-23T14:00:00Z")).kind, "none", "too old to replay");
});

test("the away summary lists what was finalized since the last visit", () => {
  const summary = awaySummary({ sections, events, fixtures, bonusAwards: [] }, "2026-11-19T11:30:00Z");
  assert.equal(summary.decided, 2);
  assert.equal(summary.results[0].winner, "s3");
  assert.equal(summary.leadChanges.length, 2);
});
