import type { BonusAward, CompetitionData, SectionId } from "./domain";

export type PlacingsResult = { error: string; status: number } | { awards: BonusAward[]; detail: string };

/**
 * Record the finishing order of a placings event: each place pays the event's own points table
 * (`event.pointsPolicy.places`). Recorded once; a central admin withdraws to correct it.
 * Shared by the placings route and the quiz and treasure-hunt pads, so all three pay out the same way.
 */
export function recordPlacings(data: CompetitionData, input: { eventId: string; order: unknown; note?: unknown }, actor: string): PlacingsResult {
  const order = input.order;
  if (!Array.isArray(order) || !order.length || !order.every((id) => typeof id === "string")) return { error: "Choose the event and at least the winner.", status: 400 };
  if (new Set(order).size !== order.length) return { error: "A division can only take one place.", status: 400 };
  if (input.note !== undefined && typeof input.note !== "string") return { error: "The note must be text.", status: 400 };
  const note = typeof input.note === "string" ? input.note.trim() : "";
  if (note.length > 300) return { error: "Keep the note under 300 characters.", status: 400 };
  const event = data.events.find((item) => item.id === input.eventId);
  if (!event) return { error: "Event not found.", status: 404 };
  if (event.pointsPolicy.format !== "placings") return { error: "This event is decided by matches, not placings.", status: 400 };
  const places = event.pointsPolicy.places;
  if (order.length > places.length) return { error: `This event pays ${places.length} places.`, status: 400 };
  if (!order.every((id) => data.sections.some((section) => section.id === id))) return { error: "Choose valid divisions.", status: 400 };
  if ((data.bonusAwards ?? []).some((award) => award.eventId === event.id && award.kind === "placing")) return { error: "Results for this event are already recorded. A central admin can withdraw them to correct a mistake.", status: 409 };
  const at = new Date().toISOString();
  const awards: BonusAward[] = (order as SectionId[]).map((sectionId, index) => ({ id: crypto.randomUUID(), eventId: event.id, sectionId, kind: "placing", place: index + 1, points: places[index] ?? 0, note: note || undefined, awardedAt: at, awardedBy: actor }));
  data.bonusAwards ??= [];
  data.bonusAwards.push(...awards);
  const detail = `${event.name} · placings ${awards.map((award) => `${award.place}. ${award.sectionId} +${award.points}`).join(", ")}${note ? ` · ${note}` : ""}`;
  return { awards, detail };
}
