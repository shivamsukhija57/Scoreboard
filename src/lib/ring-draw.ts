import type { SectionId } from "./domain";

/**
 * Chit-ring and ring-group events (2026 sports rulebook): divisions are placed in a ring by chit draw and each plays
 * its two neighbours. With five divisions that is five matches per ring.
 */

/** The neighbour pairs of a ring, in ring order: [0,1], [1,2], …, [n-1,0]. */
export function ringNeighbourPairs(order: readonly SectionId[]): Array<[SectionId, SectionId]> {
  if (order.length < 3) return [];
  return order.map((id, index) => [id, order[(index + 1) % order.length]] as [SectionId, SectionId]);
}

/**
 * Pairs in playing order so no division plays two slots in a row: the even-numbered ring pairs first, then the odd
 * ones (indices 0, 2, 4, 1, 3 for five divisions). Two pairs next to each other in this order never share a division
 * when the ring has five or more places.
 */
export function ringMatchOrder(order: readonly SectionId[]): Array<[SectionId, SectionId]> {
  const pairs = ringNeighbourPairs(order);
  const evens = pairs.filter((_, index) => index % 2 === 0);
  const odds = pairs.filter((_, index) => index % 2 === 1);
  return [...evens, ...odds];
}

/** True when some division appears in two consecutive matches of the list. */
export function hasBackToBack(matches: ReadonlyArray<readonly [SectionId, SectionId]>): boolean {
  return matches.some((match, index) => index > 0 && match.some((id) => matches[index - 1].includes(id)));
}

/** Checks a drawn order against the competition's divisions: every division exactly once. Returns an error or null. */
export function drawOrderError(order: unknown, sectionIds: readonly string[]): string | null {
  if (!Array.isArray(order)) return "Give the drawn order of the divisions.";
  if (order.length !== sectionIds.length) return `The draw needs all ${sectionIds.length} divisions, each once.`;
  if (order.some((id) => typeof id !== "string" || !sectionIds.includes(id))) return "The draw names a division that doesn't exist.";
  if (new Set(order).size !== order.length) return "Each division can be drawn only once.";
  if (order.length < 5) return "A ring needs at least five divisions.";
  return null;
}

/** Shuffles the divisions into a draw order (Fisher–Yates). `randomBelow(n)` must return an integer in [0, n). */
export function shuffleDraw<T>(items: readonly T[], randomBelow: (n: number) => number): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const pick = randomBelow(index + 1);
    [result[index], result[pick]] = [result[pick], result[index]];
  }
  return result;
}

export interface RingSlotOptions { firstStart: string; slotMinutes: number; venue: string }
export interface PlannedRingMatch { slot: number; sectionA: SectionId; sectionB: SectionId; startsAt: string; durationMinutes: number; venue: string }

/** The ring's matches in back-to-back-free order, one after another at one venue from the first start time. */
export function planRingFixtures(order: readonly SectionId[], options: RingSlotOptions): PlannedRingMatch[] {
  const start = new Date(options.firstStart).getTime();
  return ringMatchOrder(order).map(([sectionA, sectionB], slot) => ({
    slot: slot + 1,
    sectionA,
    sectionB,
    startsAt: new Date(start + slot * options.slotMinutes * 60_000).toISOString(),
    durationMinutes: options.slotMinutes,
    venue: options.venue,
  }));
}

/**
 * Recovers the ring from its neighbour matches: when every division plays exactly two of them and they form one
 * cycle, returns the divisions in ring order (starting from the first match's side A). Otherwise null.
 */
export function ringFromPairs(pairs: ReadonlyArray<readonly [SectionId, SectionId]>): SectionId[] | null {
  if (pairs.length < 3) return null;
  const links = new Map<SectionId, SectionId[]>();
  for (const [a, b] of pairs) {
    if (a === b) return null;
    links.set(a, [...(links.get(a) ?? []), b]);
    links.set(b, [...(links.get(b) ?? []), a]);
  }
  if (links.size !== pairs.length || [...links.values()].some((list) => list.length !== 2 || list[0] === list[1])) return null;
  const start = pairs[0][0];
  const ring: SectionId[] = [start];
  let previous = start;
  let current = pairs[0][1];
  while (current !== start) {
    ring.push(current);
    const next = links.get(current)!.find((id) => id !== previous)!;
    previous = current;
    current = next;
    if (ring.length > pairs.length) return null;
  }
  return ring.length === pairs.length ? ring : null;
}
