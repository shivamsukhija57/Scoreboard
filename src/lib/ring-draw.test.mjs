import test from "node:test";
import assert from "node:assert/strict";
import { drawOrderError, hasBackToBack, planRingFixtures, ringFromPairs, ringMatchOrder, ringNeighbourPairs, shuffleDraw } from "./ring-draw.ts";

const ids = ["s1", "s2", "s3", "s4", "s5"];
const key = ([a, b]) => [a, b].sort().join("-");

test("each division plays its two ring neighbours, five matches", () => {
  const order = ["s3", "s1", "s5", "s2", "s4"];
  const pairs = ringNeighbourPairs(order);
  assert.equal(pairs.length, 5);
  assert.deepEqual(pairs.map(key).sort(), ["s1-s3", "s1-s5", "s2-s4", "s2-s5", "s3-s4"]);
  for (const id of order) assert.equal(pairs.filter((pair) => pair.includes(id)).length, 2);
});

test("playing order uses ring pairs 0, 2, 4, 1, 3", () => {
  const order = ["s3", "s1", "s5", "s2", "s4"];
  assert.deepEqual(ringMatchOrder(order), [["s3", "s1"], ["s5", "s2"], ["s4", "s3"], ["s1", "s5"], ["s2", "s4"]]);
});

test("no division plays two slots in a row, for every possible draw", () => {
  const permutations = (list) => list.length <= 1 ? [list] : list.flatMap((item, index) => permutations([...list.slice(0, index), ...list.slice(index + 1)]).map((rest) => [item, ...rest]));
  const all = permutations(ids);
  assert.equal(all.length, 120);
  for (const order of all) {
    const matches = ringMatchOrder(order);
    assert.equal(hasBackToBack(matches), false, order.join(","));
    assert.equal(new Set(matches.map(key)).size, 5);
  }
});

test("hasBackToBack spots a division in consecutive matches", () => {
  assert.equal(hasBackToBack([["s1", "s2"], ["s2", "s3"]]), true);
  assert.equal(hasBackToBack([["s1", "s2"], ["s3", "s4"], ["s1", "s5"]]), false);
});

test("draw order must name every division once", () => {
  assert.equal(drawOrderError(ids, ids), null);
  assert.match(drawOrderError(["s1", "s2", "s3", "s4"], ids), /all 5/);
  assert.match(drawOrderError(["s1", "s1", "s3", "s4", "s5"], ids), /only once/);
  assert.match(drawOrderError(["s1", "s2", "s3", "s4", "s9"], ids), /doesn't exist/);
  assert.match(drawOrderError("s1,s2", ids), /drawn order/);
});

test("fixtures run one slot after another at the venue", () => {
  const plan = planRingFixtures(["s1", "s2", "s3", "s4", "s5"], { firstStart: "2026-11-21T03:30:00.000Z", slotMinutes: 40, venue: "Court 1" });
  assert.equal(plan.length, 5);
  assert.equal(plan[0].startsAt, "2026-11-21T03:30:00.000Z");
  assert.equal(plan[4].startsAt, "2026-11-21T06:10:00.000Z");
  assert.ok(plan.every((match) => match.venue === "Court 1" && match.durationMinutes === 40));
});

test("shuffleDraw keeps every division", () => {
  let seed = 7;
  const random = (n) => { seed = (seed * 9301 + 49297) % 233280; return Math.floor(seed / 233280 * n); };
  const drawn = shuffleDraw(ids, random);
  assert.deepEqual([...drawn].sort(), ids);
});

test("ringFromPairs recovers the drawn ring from its matches", () => {
  const order = ["s3", "s1", "s5", "s2", "s4"];
  const ring = ringFromPairs(ringMatchOrder(order));
  assert.equal(ring.length, 5);
  const rotations = order.map((_, index) => [...order.slice(index), ...order.slice(0, index)].join());
  const reversed = [...order].reverse();
  const rotationsBack = reversed.map((_, index) => [...reversed.slice(index), ...reversed.slice(0, index)].join());
  assert.ok([...rotations, ...rotationsBack].includes(ring.join()));
  assert.equal(ringFromPairs([["s1", "s2"], ["s2", "s3"]]), null);
  assert.equal(ringFromPairs([["s1", "s2"], ["s2", "s3"], ["s3", "s1"], ["s4", "s5"], ["s5", "s4"]]), null);
});
