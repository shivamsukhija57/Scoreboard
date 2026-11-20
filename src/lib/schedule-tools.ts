import type { CompetitionData, Fixture, SectionId } from "./domain";

/** All competition times are shown in India Standard Time, which has no daylight saving. */
const IST_OFFSET = "+05:30";

export function istDayKey(iso: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Builds an ISO timestamp from an IST calendar day (YYYY-MM-DD) and a time (HH:MM). */
export function istDateTime(day: string, time: string): string {
  return new Date(`${day}T${time}:00${IST_OFFSET}`).toISOString();
}

export function minutesOfTime(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

function timeOfMinutes(total: number): string {
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

export function daysBetween(startDay: string, endDay: string): string[] {
  const days: string[] = [];
  const cursor = new Date(`${startDay}T00:00:00Z`);
  const end = new Date(`${endDay}T00:00:00Z`);
  while (cursor <= end && days.length < 62) {
    days.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

interface Booking { startsAt: string; durationMinutes: number; venue: string; sectionA: SectionId; sectionB: SectionId; id?: string; eventId?: string }

function span(booking: Pick<Booking, "startsAt" | "durationMinutes">): [number, number] {
  const start = new Date(booking.startsAt).getTime();
  return [start, start + booking.durationMinutes * 60_000];
}

function overlaps(a: Pick<Booking, "startsAt" | "durationMinutes">, b: Pick<Booking, "startsAt" | "durationMinutes">): boolean {
  const [aStart, aEnd] = span(a);
  const [bStart, bEnd] = span(b);
  return aStart < bEnd && aEnd > bStart;
}

const sameVenue = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
const sharesSection = (a: Booking, b: Booking) => [a.sectionA, a.sectionB].some((section) => section === b.sectionA || section === b.sectionB);

export interface BookingClash { fixtureId?: string; kind: "venue" | "section"; label: string }

/** Lists existing bookings that overlap the candidate at the same venue or with either of its sections. */
export function findClashes(candidate: Booking, others: Booking[], describe: (other: Booking) => string): BookingClash[] {
  const clashes: BookingClash[] = [];
  for (const other of others) {
    if (other.id && other.id === candidate.id) continue;
    if (!overlaps(candidate, other)) continue;
    if (sameVenue(candidate.venue, other.venue)) clashes.push({ fixtureId: other.id, kind: "venue", label: `${other.venue} is booked: ${describe(other)}` });
    else if (sharesSection(candidate, other)) clashes.push({ fixtureId: other.id, kind: "section", label: `Section clash: ${describe(other)}` });
  }
  return clashes;
}

/**
 * Round-robin pairings by the circle method. With an odd number of sections, one sits out each round.
 * Every pair meets exactly once across `n - 1` rounds (or `n` rounds when `n` is odd).
 */
export function roundRobinRounds(sectionIds: SectionId[]): Array<{ round: number; matches: Array<[SectionId, SectionId]>; bye?: SectionId }> {
  const slots: Array<SectionId | null> = [...sectionIds];
  if (slots.length < 2) return [];
  if (slots.length % 2 === 1) slots.push(null);
  const count = slots.length;
  const rounds: Array<{ round: number; matches: Array<[SectionId, SectionId]>; bye?: SectionId }> = [];
  for (let round = 0; round < count - 1; round += 1) {
    const matches: Array<[SectionId, SectionId]> = [];
    let bye: SectionId | undefined;
    for (let index = 0; index < count / 2; index += 1) {
      const home = slots[index];
      const away = slots[count - 1 - index];
      if (home && away) matches.push([home, away]);
      else bye = (home ?? away) ?? undefined;
    }
    rounds.push({ round: round + 1, matches, bye });
    // Keep the first slot fixed and rotate the rest one place.
    slots.splice(1, 0, slots.pop() as SectionId | null);
  }
  return rounds;
}

export interface RoundRobinOptions {
  eventId: string;
  sectionIds: SectionId[];
  startDay: string;
  endDay: string;
  windowStart: string;
  windowEnd: string;
  slotMinutes: number;
  venues: string[];
  /** Keep a section's generated matches at least one slot apart. */
  restBetweenMatches: boolean;
  /** Skip slots that start before this instant (e.g. now), so nothing is planned in the past. */
  earliestStart?: string;
}

export interface PlannedFixture {
  round: number;
  sectionA: SectionId;
  sectionB: SectionId;
  startsAt?: string;
  venue?: string;
  durationMinutes: number;
}

export interface RoundRobinPlan {
  rounds: Array<{ round: number; bye?: SectionId }>;
  fixtures: PlannedFixture[];
  unplaced: number;
}

/**
 * Places each round-robin match in the earliest free slot, in round order, without double-booking a venue
 * or a section (against existing fixtures and the matches already placed by this plan).
 */
export function planRoundRobin(existing: Fixture[], options: RoundRobinOptions): RoundRobinPlan {
  const venues = [...new Set(options.venues.map((venue) => venue.trim()).filter(Boolean))];
  const slotMinutes = Math.max(5, Math.round(options.slotMinutes));
  const windowStart = minutesOfTime(options.windowStart);
  const windowEnd = minutesOfTime(options.windowEnd);
  const earliest = options.earliestStart ? new Date(options.earliestStart).getTime() : -Infinity;
  const slotStarts: string[] = [];
  for (const day of daysBetween(options.startDay, options.endDay)) {
    for (let minute = windowStart; minute + slotMinutes <= windowEnd; minute += slotMinutes) {
      const start = istDateTime(day, timeOfMinutes(minute));
      if (new Date(start).getTime() >= earliest) slotStarts.push(start);
    }
  }
  const bookings: Booking[] = existing.map((fixture) => ({ id: fixture.id, startsAt: fixture.startsAt, durationMinutes: fixture.durationMinutes, venue: fixture.venue, sectionA: fixture.sectionA, sectionB: fixture.sectionB }));
  const planned: Booking[] = [];
  const rounds = roundRobinRounds(options.sectionIds);
  const fixtures: PlannedFixture[] = [];
  let earliestSlot = 0;
  for (const round of rounds) {
    for (const [sectionA, sectionB] of round.matches) {
      let placed: PlannedFixture | null = null;
      for (let slot = earliestSlot; slot < slotStarts.length && !placed; slot += 1) {
        for (const venue of venues) {
          const candidate: Booking = { startsAt: slotStarts[slot], durationMinutes: slotMinutes, venue, sectionA, sectionB };
          const busy = [...bookings, ...planned].some((other) => overlaps(candidate, other) && (sameVenue(candidate.venue, other.venue) || sharesSection(candidate, other)));
          if (busy) continue;
          if (options.restBetweenMatches) {
            const rested = { ...candidate, startsAt: new Date(new Date(candidate.startsAt).getTime() - slotMinutes * 60_000).toISOString(), durationMinutes: slotMinutes * 3 };
            if (planned.some((other) => sharesSection(candidate, other) && overlaps(rested, other))) continue;
          }
          placed = { round: round.round, sectionA, sectionB, startsAt: candidate.startsAt, venue, durationMinutes: slotMinutes };
          planned.push(candidate);
          earliestSlot = slot;
          break;
        }
      }
      fixtures.push(placed ?? { round: round.round, sectionA, sectionB, durationMinutes: slotMinutes });
    }
  }
  return { rounds: rounds.map(({ round, bye }) => ({ round, bye })), fixtures, unplaced: fixtures.filter((fixture) => !fixture.startsAt).length };
}

export interface ShiftOptions { venue: string; day: string; fromTime: string; minutes: number }

export interface ShiftMove { fixture: Fixture; newStartsAt: string; clashes: BookingClash[] }

/** Scheduled fixtures at one venue on one IST day, starting at or after `fromTime`, moved by `minutes`. */
export function planFixtureShift(data: CompetitionData, options: ShiftOptions, describe: (fixture: Booking) => string): ShiftMove[] {
  const from = new Date(istDateTime(options.day, options.fromTime)).getTime();
  const moving = data.fixtures
    .filter((fixture) => fixture.status === "scheduled" && sameVenue(fixture.venue, options.venue) && istDayKey(fixture.startsAt) === options.day && new Date(fixture.startsAt).getTime() >= from)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const movingIds = new Set(moving.map((fixture) => fixture.id));
  const staying = data.fixtures.filter((fixture) => !movingIds.has(fixture.id));
  return moving.map((fixture) => {
    const newStartsAt = new Date(new Date(fixture.startsAt).getTime() + options.minutes * 60_000).toISOString();
    return { fixture, newStartsAt, clashes: findClashes({ ...fixture, startsAt: newStartsAt }, staying, describe) };
  });
}

export function activeNotices(data: CompetitionData, now = new Date()) {
  const today = istDayKey(now.toISOString());
  return (data.notices ?? []).filter((notice) => notice.day === today);
}

/** "Cricket · A vs C · 17:30" style labels for clash messages. */
export function bookingDescriber(data: CompetitionData) {
  return (booking: { eventId?: string; sectionA: SectionId; sectionB: SectionId; startsAt: string }) => {
    const event = booking.eventId ? data.events.find((item) => item.id === booking.eventId) : undefined;
    const sport = event ? data.sports.find((item) => item.id === event.sportId)?.name : undefined;
    const code = (id: SectionId) => data.sections.find((section) => section.id === id)?.code ?? id;
    const time = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(booking.startsAt));
    return `${sport ?? "Fixture"} · ${code(booking.sectionA)} vs ${code(booking.sectionB)} · ${time}`;
  };
}
