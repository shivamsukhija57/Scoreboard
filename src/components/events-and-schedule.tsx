"use client";

import { ChevronLeft, Dices, TriangleAlert, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { CompetitionData, EventDefinition, Fixture, SectionId } from "@/lib/domain";
import { bonusPointsFor, eventTable, expectedTableMatches, fixtureOutcome, groupTable, topperStatus } from "@/lib/points-rules";
import { drawOrderError, hasBackToBack, planRingFixtures, ringFromPairs, shuffleDraw } from "@/lib/ring-draw";
import { bookingDescriber, findClashes, istDateTime, istDayKey } from "@/lib/schedule-tools";
import { sportCode } from "@/lib/sport-codes";
import { TallyLiveCard } from "./tally-pads";
import { StageResult } from "./results-reveal";
import { isJudgedEvent } from "@/lib/judging";
import { DivChip, DivIcon, eventLabel, formatDay, formatTime, headlineScore, lineColor, sectionOf } from "./event-features";

type Toast = (message: string, error?: boolean) => void;

// ---------- shared helpers ----------

class RequestError extends Error {
  constructor(message: string, readonly status: number, readonly payload: Record<string, unknown>) { super(message); }
}

async function request<T>(url: string, method: string, body: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), cache: "no-store" });
  } catch {
    throw new RequestError("Couldn't reach Division Wars. Check your connection and try again; nothing was saved.", 0, {});
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new RequestError(payload.error ?? "That didn't go through. Try again.", response.status, payload);
  return payload as T;
}

const isFinal = (fixture: Fixture) => fixture.status === "completed" && fixture.resultConfirmed;
const stageOf = (fixture: Fixture) => fixture.stage ?? "league";
const categoryOf = (data: CompetitionData, event: EventDefinition) => data.sports.find((sport) => sport.id === event.sportId)?.category ?? "sport";
const sportName = (data: CompetitionData, event: EventDefinition) => data.sports.find((sport) => sport.id === event.sportId)?.name ?? "Event";
const teamName = (data: CompetitionData, id: SectionId, entry?: number) => `${sectionOf(data, id)?.name ?? id}${entry ? ` · Team ${entry}` : ""}`;
const sideName = (data: CompetitionData, fixture: Fixture, side: "a" | "b") => side === "a" ? teamName(data, fixture.sectionA, fixture.entryA) : teamName(data, fixture.sectionB, fixture.entryB);
/** Clash labels come from the shared schedule helpers, which say "section"; the UI says "division". */
const divisionWords = (text: string) => text.replace(/Section/g, "Division").replace(/section/g, "division");
const RING_FORMATS = new Set(["chit-ring", "ring-group"]);

/** "Today 17:30" or "Sat 21 Nov, 17:30", in India time. */
function whenLabel(iso: string, now = new Date()) {
  return istDayKey(iso) === istDayKey(now.toISOString()) ? `Today ${formatTime(iso)}` : `${formatDay(iso)}, ${formatTime(iso)}`;
}

function stageLabel(fixture: Fixture) {
  const stage = stageOf(fixture);
  if (stage === "final") return "Final";
  if (stage === "semifinal") return "Semifinal";
  if (stage === "other") return "Match";
  return fixture.group ? `Group ${fixture.group}` : "League";
}

// ---------- event state ----------

export type EventState =
  | { kind: "won"; winners: SectionId[]; note: string }
  | { kind: "live"; note: string }
  | { kind: "next"; at: string; note: string }
  | { kind: "progress"; note: string }
  | { kind: "idle"; note: string };

/** How far an event has got, without guessing a winner: league or group progress, then semifinals, then the final. */
function progressNote(data: CompetitionData, event: EventDefinition, fixtures: Fixture[]): string {
  const format = event.pointsPolicy.format;
  if (format === "placings") return "One contest";
  const finals = fixtures.filter((fixture) => stageOf(fixture) === "final");
  if (finals.length) return "Final";
  const semis = fixtures.filter((fixture) => stageOf(fixture) === "semifinal");
  if (semis.length) return `Semifinals ${semis.filter(isFinal).length} of ${semis.length}`;
  const league = fixtures.filter((fixture) => stageOf(fixture) === "league");
  const expected = format === "ring-group" ? data.sections.length * 2 : expectedTableMatches(format, data.sections.length) ?? league.length;
  const word = format === "ring-group" ? "Groups" : format === "chit-ring" ? "Ring" : "League";
  return `${word} ${league.filter(isFinal).length} of ${expected}`;
}

export function eventState(data: CompetitionData, event: EventDefinition): EventState {
  const fixtures = data.fixtures.filter((fixture) => fixture.eventId === event.id);
  if (event.pointsPolicy.format === "placings") {
    const first = (data.bonusAwards ?? []).filter((award) => award.eventId === event.id && award.kind === "placing" && award.place === 1).map((award) => award.sectionId);
    if (first.length) return { kind: "won", winners: [...new Set(first)], note: "Won" };
  } else {
    const final = fixtures.find((fixture) => stageOf(fixture) === "final" && isFinal(fixture));
    const outcome = final ? fixtureOutcome(final) : null;
    if (final && outcome !== "draw") return { kind: "won", winners: [outcome === "a_win" ? final.sectionA : final.sectionB], note: "Won the final" };
  }
  const note = progressNote(data, event, fixtures);
  if (fixtures.some((fixture) => fixture.status === "live")) return { kind: "live", note };
  const next = fixtures.filter((fixture) => fixture.status === "scheduled").sort((a, b) => a.startsAt.localeCompare(b.startsAt))[0];
  if (next) return { kind: "next", at: next.startsAt, note: fixtures.some(isFinal) ? note : "Not started" };
  if (fixtures.some(isFinal) || fixtures.some((fixture) => fixture.status === "awaiting-confirmation")) return { kind: "progress", note };
  return { kind: "idle", note: "Not started" };
}

/** Event points per division in one event: every finalized fixture's award plus its bonuses (topper, placings). */
function eventPoints(data: CompetitionData, eventId: string, sectionId: SectionId) {
  const fromFixtures = data.fixtures.filter((fixture) => fixture.eventId === eventId && isFinal(fixture)).reduce((sum, fixture) => sum + (fixture.sectionA === sectionId ? fixture.awardedPointsA ?? 0 : 0) + (fixture.sectionB === sectionId ? fixture.awardedPointsB ?? 0 : 0), 0);
  return fromFixtures + bonusPointsFor(data, sectionId, (id) => id === eventId);
}

// ---------- the ring ----------

/** Divisions around a circle with a line to each neighbour; chips and names, never colour alone. */
export function RingDiagram({ data, order, size = 240 }: { data: CompetitionData; order: SectionId[]; size?: number }) {
  const radius = size / 2 - 34;
  const points = order.map((_, index) => {
    const angle = -Math.PI / 2 + (index * 2 * Math.PI) / order.length;
    return [size / 2 + radius * Math.cos(angle), size / 2 + radius * Math.sin(angle)];
  });
  return <div className="ring-diagram" style={{ width: size, height: size }} role="img" aria-label={`Ring order: ${order.map((id) => sectionOf(data, id)?.name ?? id).join(", ")}, back to the start`}>
    <svg width={size} height={size} aria-hidden="true"><polygon points={points.map(([x, y]) => `${x},${y}`).join(" ")} /></svg>
    {order.map((id, index) => { const section = sectionOf(data, id); return <span key={id} className="ring-node" style={{ left: points[index][0], top: points[index][1] }}><DivChip section={section} size="l" /><small>{section?.name}</small></span>; })}
  </div>;
}

// ---------- 1. chit draw ----------

function randomBelow(n: number) {
  // Rejection sampling keeps every position equally likely.
  const limit = Math.floor(0x1_0000_0000 / n) * n;
  const buffer = new Uint32Array(1);
  do { crypto.getRandomValues(buffer); } while (buffer[0] >= limit);
  return buffer[0] % n;
}

export function ChitDrawTool({ data, refresh, toast, onClose }: { data: CompetitionData; refresh: () => Promise<void>; toast: Toast; onClose: () => void }) {
  const ringEvents = data.events.filter((event) => RING_FORMATS.has(event.pointsPolicy.format ?? ""));
  const [openedAt] = useState(() => new Date().toISOString());
  const [eventId, setEventId] = useState(ringEvents[0]?.id ?? "");
  const event = ringEvents.find((item) => item.id === eventId);
  const grouped = event?.pointsPolicy.format === "ring-group";
  const [group, setGroup] = useState<1 | 2>(1);
  const [order, setOrder] = useState<SectionId[] | null>(null);
  const [paper, setPaper] = useState(false);
  const [paperOrder, setPaperOrder] = useState<string[]>(() => data.sections.map(() => ""));
  const [day, setDay] = useState(() => istDayKey(new Date(Date.parse(openedAt) + 86_400_000).toISOString()));
  const [time, setTime] = useState("09:00");
  const [slotMinutes, setSlotMinutes] = useState(40);
  const [venue, setVenue] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [serverConflicts, setServerConflicts] = useState<Array<{ label: string; fixture?: string }> | null>(null);
  const sectionIds = data.sections.map((section) => section.id);
  const knownVenues = [...new Set(data.fixtures.map((fixture) => fixture.venue).filter(Boolean))];

  const drawn = paper ? (drawOrderError(paperOrder, sectionIds) ? null : (paperOrder as SectionId[])) : order;
  const paperError = paper && paperOrder.some(Boolean) ? drawOrderError(paperOrder, sectionIds) : null;
  const validTime = /^\d{4}-\d{2}-\d{2}$/.test(day) && /^\d{2}:\d{2}$/.test(time);
  const firstStart = validTime ? istDateTime(day, time) : "";
  const ready = Boolean(event && drawn && validTime && venue.trim() && slotMinutes >= 5 && slotMinutes <= 600);
  const plan = useMemo(() => drawn && firstStart ? planRingFixtures(drawn, { firstStart, slotMinutes: Math.max(5, slotMinutes || 0), venue: venue.trim() || "Venue to be set" }) : [], [drawn, firstStart, slotMinutes, venue]);
  const describe = bookingDescriber(data);
  const clashes = ready ? plan.flatMap((match) => findClashes({ ...match, eventId }, data.fixtures, describe).map((clash) => ({ ...clash, fixture: describe({ ...match, eventId }) }))) : [];
  const existing = data.fixtures.filter((fixture) => fixture.eventId === eventId && stageOf(fixture) === "league" && (!grouped || fixture.group === group)).length;
  const backToBack = hasBackToBack(plan.map((match) => [match.sectionA, match.sectionB] as const));

  function reset() { setOrder(null); setConfirming(false); setServerConflicts(null); }
  function chooseEvent(id: string) {
    setEventId(id); reset();
    const venues = [...new Set(data.fixtures.filter((fixture) => fixture.eventId === id).map((fixture) => fixture.venue))];
    if (venues.length === 1) setVenue(venues[0]);
  }
  function draw() { setPaper(false); setOrder(shuffleDraw(sectionIds, randomBelow)); setConfirming(false); setServerConflicts(null); }

  async function add(acknowledgeConflict = false) {
    if (!ready || !drawn) return;
    setBusy(true);
    try {
      await request("/api/fixtures/ring", "POST", { eventId, order: drawn, ...(grouped ? { group } : {}), firstStart, slotMinutes, venue: venue.trim(), acknowledgeExisting: existing > 0, acknowledgeConflict });
      await refresh(); onClose();
      toast(`${plan.length} ${event?.name ?? ""}${grouped ? ` group ${group}` : ""} fixtures added from the chit draw.`);
    } catch (error) {
      if (error instanceof RequestError && error.status === 409 && Array.isArray(error.payload.conflicts)) setServerConflicts(error.payload.conflicts as Array<{ label: string; fixture?: string }>);
      else toast(error instanceof Error ? error.message : "The fixtures could not be added.", true);
      setConfirming(false);
    } finally { setBusy(false); }
  }

  if (!ringEvents.length) return <section className="tool-panel chit-tool"><p className="empty-inline">No chit-ring or ring-group events are set up.</p></section>;

  return <section className="tool-panel chit-tool" aria-labelledby="chit-title">
    <div className="create-fixture-title"><div><p className="eyebrow">Scheduling desk <span>·</span> Ring events</p><h2 id="chit-title">Chit draw{event ? `: ${event.name}` : ""}</h2></div><button type="button" className="icon-button" aria-label="Close" onClick={onClose}><X size={18} /></button></div>
    <p className="chit-format">{event?.tournamentFormat}</p>
    <div className="chit-layout">
      <div className="chit-card">
        <div className="chit-fields">
          <label>Event<select value={eventId} onChange={(change) => chooseEvent(change.target.value)}>{ringEvents.map((item) => <option key={item.id} value={item.id}>{eventLabel(data, item.id)}</option>)}</select></label>
          {grouped && <label>Group<select value={group} onChange={(change) => { setGroup(Number(change.target.value) as 1 | 2); reset(); }}><option value={1}>Group 1 · team 1 of each division</option><option value={2}>Group 2 · team 2 of each division</option></select></label>}
        </div>
        <div className="chit-head"><strong>The draw</strong>{drawn && !paper && <span className="chit-status">Drawn here</span>}{drawn && paper && <span className="chit-status">Paper draw</span>}</div>
        {paper ? <div className="paper-draw">{paperOrder.map((value, index) => <label key={index}>Chit {index + 1}<select value={value} onChange={(change) => { const next = [...paperOrder]; next[index] = change.target.value; setPaperOrder(next); setConfirming(false); setServerConflicts(null); }}><option value="">Choose</option>{data.sections.map((section) => <option key={section.id} value={section.id}>{section.code} · {section.name}</option>)}</select></label>)}{paperError && <p className="tool-warning" role="alert"><TriangleAlert size={14} aria-hidden="true" />{paperError}</p>}</div>
          : drawn ? <div className="chit-row" aria-label="Drawn order">{drawn.map((id, index) => <span key={`${id}-${index}`} className="chit" style={{ animationDelay: `${index * 70}ms` }}><DivChip section={sectionOf(data, id)} size="m" /><small>{sectionOf(data, id)?.name}</small></span>)}</div>
          : <p className="empty-inline">Draw here on the projector, or type in the order from the paper chits drawn on stage.</p>}
        {drawn && <RingDiagram data={data} order={drawn} />}
        <div className="chit-actions"><button type="button" className="secondary-button" onClick={draw}><Dices size={15} aria-hidden="true" /> {order && !paper ? "Redraw" : "Draw"}</button><button type="button" className="secondary-button" aria-pressed={paper} onClick={() => { setPaper((value) => !value); setConfirming(false); setServerConflicts(null); }}>{paper ? "Use a random draw" : "Enter a paper draw"}</button></div>
        <p className="fine-print">Either way, the app saves the draw order in the audit log with the fixtures.</p>
      </div>
      <div className="chit-card">
        <div className="chit-head"><div><p className="eyebrow">Fixtures from the draw</p><h3>{data.sections.length} ring matches</h3></div><span className="fine-print">Each division plays twice</span></div>
        <div className="chit-fields three">
          <label>First match day<input type="date" value={day} onChange={(change) => setDay(change.target.value)} /></label>
          <label>Start (IST)<input type="time" value={time} onChange={(change) => setTime(change.target.value)} /></label>
          <label>Slot length (min)<input type="number" min={5} max={600} step={5} value={slotMinutes} onChange={(change) => setSlotMinutes(Number(change.target.value))} /></label>
          <label className="wide">Venue<input value={venue} maxLength={80} list="chit-venues" placeholder="Court 1" onChange={(change) => setVenue(change.target.value)} /><datalist id="chit-venues">{knownVenues.map((item) => <option key={item} value={item} />)}</datalist></label>
        </div>
        {drawn ? <ol className="chit-matches">{plan.map((match) => <li key={match.slot}><span className="chit-slot">{match.slot}</span><span className="matchup"><DivChip section={sectionOf(data, match.sectionA)} />{teamName(data, match.sectionA, grouped ? group : undefined)} <span>v</span> <DivChip section={sectionOf(data, match.sectionB)} />{teamName(data, match.sectionB, grouped ? group : undefined)}</span><small>{validTime ? `${formatDay(match.startsAt)} · ${formatTime(match.startsAt)}` : "Set a time"}{venue.trim() ? ` · ${venue.trim()}` : ""}</small></li>)}</ol>
          : <p className="empty-inline">The five matches appear here once the order is drawn.</p>}
        {existing > 0 && <p className="tool-warning"><TriangleAlert size={14} aria-hidden="true" />{grouped ? `Group ${group}` : "This event"} already has {existing} league fixture{existing === 1 ? "" : "s"}. New fixtures are added alongside them.</p>}
        {ready && !backToBack && !clashes.length && <div className="chit-ok"><strong>No clashes</strong><span>No division plays two matches in a row, and {venue.trim()} is free for all five slots.</span></div>}
        {ready && clashes.length > 0 && <div className="conflict-warning chit-clash"><TriangleAlert size={17} aria-hidden="true" /><span>These slots overlap other bookings:<ul className="tool-conflicts">{clashes.slice(0, 6).map((clash, index) => <li key={index}>{clash.fixture}: {divisionWords(clash.label)}</li>)}</ul></span></div>}
        {serverConflicts && <div className="conflict-warning"><TriangleAlert size={17} aria-hidden="true" /><span>The schedule changed while you were drawing. These overlap now:<ul className="tool-conflicts">{serverConflicts.slice(0, 6).map((clash, index) => <li key={index}>{clash.fixture ? `${clash.fixture}: ` : ""}{divisionWords(clash.label)}</li>)}</ul></span><button type="button" disabled={busy} onClick={() => void add(true)}>Add anyway</button></div>}
        <div className="form-actions"><span>The app adds the semifinal and final once the table is complete.</span>
          {confirming ? <span className="inline-confirm" role="group" aria-label="Add fixtures"><span className="inline-confirm-text">Add {plan.length} fixtures to the schedule{clashes.length ? " despite the overlaps" : ""}?</span><span className="inline-confirm-actions"><button type="button" className="secondary-button" onClick={() => setConfirming(false)}>Cancel</button><button type="button" className="confirm-button" disabled={busy} onClick={() => void add(clashes.length > 0)}>{busy ? "Adding…" : "Add fixtures"}</button></span></span>
            : <button type="button" className="primary-button" disabled={!ready || busy} onClick={() => setConfirming(true)}>Add {plan.length || data.sections.length} fixtures</button>}
        </div>
      </div>
    </div>
  </section>;
}

// ---------- 2. war map ----------

function useWinnerFlash(data: CompetitionData) {
  const winners = useMemo(() => new Map(data.events.map((event) => { const state = eventState(data, event); return [event.id, state.kind === "won" ? state.winners.join("+") : ""]; })), [data]);
  const previous = useRef<Map<string, string> | null>(null);
  const timer = useRef(0);
  const [flash, setFlash] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    const before = previous.current;
    previous.current = winners;
    if (!before) return;
    const changed = [...winners].filter(([id, winner]) => winner && before.get(id) !== winner).map(([id]) => id);
    if (!changed.length) return;
    setFlash(new Set(changed));
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setFlash(new Set()), 1600);
  }, [winners]);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return flash;
}

function WarTile({ data, event, flash, onOpen }: { data: CompetitionData; event: EventDefinition; flash: boolean; onOpen: () => void }) {
  const state = eventState(data, event);
  const winner = state.kind === "won" ? sectionOf(data, state.winners[0]) : undefined;
  const shared = state.kind === "won" && state.winners.length > 1;
  const sport = sportName(data, event);
  const name = event.name === sport ? sport : event.name;
  const label = state.kind === "won" ? `${shared ? state.winners.map((id) => sectionOf(data, id)?.name).join(" and ") : winner?.name} won` : state.kind === "live" ? "Live" : state.kind === "next" ? `Up next ${whenLabel(state.at)}` : state.note;
  return <button type="button" className={`wm-tile ${state.kind}${flash ? " flash" : ""}`} data-event={event.id} onClick={onOpen} aria-label={`${sport}${name !== sport ? `, ${name}` : ""}: ${label}. Open the event page`}>
    {winner && <span className="wm-fill" aria-hidden="true" style={{ background: winner.color }} />}
    <span className="wm-top"><span className="wm-code">{sportCode(event.sportId)}</span><span className="wm-sport">{sport}</span>{winner && <DivIcon section={winner} size={22} className="wm-icon" />}</span>
    <span className="wm-name">{name}</span>
    <span className="wm-state">
      {state.kind === "won" && winner && <span className="wm-won">{state.winners.map((id) => <DivChip key={id} section={sectionOf(data, id)} size="m" />)}<b>{shared ? "Shared" : winner.name}</b><small>{state.note}</small></span>}
      {state.kind === "live" && <span className="wm-live"><i aria-hidden="true" />Live<small>{state.note}</small></span>}
      {state.kind === "next" && <span className="wm-next">Up next {whenLabel(state.at)}<small>{state.note}</small></span>}
      {(state.kind === "progress" || state.kind === "idle") && <span className="wm-idle">{state.note}</span>}
    </span>
  </button>;
}

export function WarMapView({ data, eventId: openId, setEventId: setOpenId }: { data: CompetitionData; eventId: string | null; setEventId: (id: string | null) => void }) {
  const [half, setHalf] = useState<"all" | "sport" | "cultural">("all");
  const flash = useWinnerFlash(data);
  const open = (id: string | null) => { setOpenId(id); window.scrollTo(0, 0); };
  const openEvent = openId ? data.events.find((event) => event.id === openId) : undefined;
  if (openEvent) return <EventPage data={data} event={openEvent} back={() => open(null)} />;

  const states = new Map(data.events.map((event) => [event.id, eventState(data, event)]));
  const wins = data.sections.map((section) => ({ section, count: data.events.filter((event) => { const state = states.get(event.id); return state?.kind === "won" && state.winners.includes(section.id); }).length })).sort((a, b) => b.count - a.count);
  const halves = ([["sport", "The Arena", "Sports"], ["cultural", "The Stage", "Cultural"]] as const).map(([category, title, kind]) => {
    const events = data.events.filter((event) => categoryOf(data, event) === category);
    const decided = events.filter((event) => states.get(event.id)?.kind === "won").length;
    const live = events.filter((event) => states.get(event.id)?.kind === "live").length;
    return { category, title, kind, events, decided, live };
  });
  return <div className="view-content war-map">
    <div className="page-title-row"><div><p className="eyebrow">{data.events.length} events across the Arena and the Stage</p><h1>Events</h1></div>
      <div className="event-tabs" role="tablist" aria-label="Show">{([["all", "All"], ["sport", "Arena"], ["cultural", "Stage"]] as const).map(([value, label]) => <button key={value} type="button" role="tab" aria-selected={half === value} className={half === value ? "on" : ""} onClick={() => setHalf(value)}>{label}</button>)}</div>
    </div>
    <section className="wm-summary" aria-label="Events won per division">
      <h2>Events won</h2>
      <ol>{wins.map(({ section, count }) => <li key={section.id}><DivChip section={section} size="m" /><span>{section.name}</span><b>{count}</b><i aria-hidden="true" style={{ background: lineColor(section), width: `${wins[0].count ? (count / wins[0].count) * 100 : 0}%` }} /></li>)}</ol>
      <p>{halves.map((item) => `${item.title.replace("The ", "")}: ${item.decided} of ${item.events.length} decided${item.live ? `, ${item.live} live` : ""}`).join(" · ")}</p>
    </section>
    <div className="wm-key" aria-hidden="true"><span><i className="k-won" />Won, in the winner&apos;s colour</span><span><i className="k-live" />Live</span><span><i className="k-next" />To play</span></div>
    {halves.filter((item) => half === "all" || half === item.category).map((item) => <section key={item.category} className="wm-half" aria-labelledby={`wm-${item.category}`}>
      <div className="wm-half-head"><h2 id={`wm-${item.category}`}>{item.title}</h2><span>{item.kind} · {item.decided} of {item.events.length} decided{item.live ? ` · ${item.live} live` : ""}</span></div>
      <div className="wm-grid">{item.events.map((event) => <WarTile key={event.id} data={data} event={event} flash={flash.has(event.id)} onOpen={() => open(event.id)} />)}</div>
    </section>)}
    <p className="fine-print">Every tile opens its event page. A tile fills with a division&apos;s colour once it wins the final, or first place in a placings event.</p>
  </div>;
}

// ---------- 3. event page ----------

function FixtureLine({ data, fixture }: { data: CompetitionData; fixture: Fixture }) {
  const showScore = fixture.status !== "scheduled";
  const outcome = isFinal(fixture) ? fixtureOutcome(fixture) : null;
  return <li className={`ep-fixture ${fixture.status}`}>
    <span className="ep-when"><b>{formatTime(fixture.startsAt)}</b><small>{formatDay(fixture.startsAt)}</small></span>
    <span className="ep-match"><small>{stageLabel(fixture)} · {fixture.venue}</small>
      <span className={`ep-side${outcome === "a_win" ? " won" : ""}`}><DivChip section={sectionOf(data, fixture.sectionA)} /><span>{sideName(data, fixture, "a")}</span>{showScore && <b>{headlineScore(data, fixture, "a")}</b>}</span>
      <span className={`ep-side${outcome === "b_win" ? " won" : ""}`}><DivChip section={sectionOf(data, fixture.sectionB)} /><span>{sideName(data, fixture, "b")}</span>{showScore && <b>{headlineScore(data, fixture, "b")}</b>}</span>
    </span>
    <span className={`ep-status ${fixture.status}`}>{fixture.status === "live" ? <><i aria-hidden="true" />Live</> : fixture.status === "completed" ? (fixture.walkoverWinner ? "Walkover" : fixture.resultConfirmed ? "Final" : "Result in") : fixture.status === "awaiting-confirmation" ? "Awaiting result" : "To play"}</span>
  </li>;
}

function EventPage({ data, event, back }: { data: CompetitionData; event: EventDefinition; back: () => void }) {
  const sport = data.sports.find((item) => item.id === event.sportId);
  const format = event.pointsPolicy.format;
  const state = eventState(data, event);
  const fixtures = data.fixtures.filter((fixture) => fixture.eventId === event.id).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const half = sport?.category === "cultural" ? "Stage" : "Arena";
  const venues = [...new Set(fixtures.map((fixture) => fixture.venue))];
  const rings = format === "chit-ring" ? [{ label: "The ring", order: ringFromPairs(fixtures.filter((fixture) => stageOf(fixture) === "league").map((fixture) => [fixture.sectionA, fixture.sectionB] as const)) }]
    : format === "ring-group" ? ([1, 2] as const).map((group) => ({ label: `Group ${group} ring`, order: ringFromPairs(fixtures.filter((fixture) => stageOf(fixture) === "league" && fixture.group === group).map((fixture) => [fixture.sectionA, fixture.sectionB] as const)) })) : [];
  const winner = state.kind === "won" ? sectionOf(data, state.winners[0]) : undefined;
  const topper = format === "league" || format === "chit-ring" ? topperStatus(data, event) : null;
  const placings = (data.bonusAwards ?? []).filter((award) => award.eventId === event.id && award.kind === "placing").sort((a, b) => (a.place ?? 9) - (b.place ?? 9));

  return <div className="view-content event-page">
    <div className="ep-head">
      <nav className="ep-crumb" aria-label="Breadcrumb"><button type="button" className="text-button" onClick={back}><ChevronLeft size={16} aria-hidden="true" />Events</button><span>{half} · {sport?.name}</span></nav>
      <h1><span className="wm-code" aria-hidden="true">{sportCode(event.sportId)}</span>{eventLabel(data, event.id)}</h1>
      <p className="subtitle">{event.format}{venues.length ? ` · ${venues.join(", ")}` : ""}</p>
      <div className={`ep-state ${state.kind}`}>
        {state.kind === "won" && winner && <><DivChip section={winner} size="l" /><DivIcon section={winner} size={26} /><strong>{state.winners.map((id) => sectionOf(data, id)?.name).join(" and ")}</strong><span>{state.note}</span></>}
        {state.kind === "live" && <><i aria-hidden="true" /><strong>Live now</strong><span>{state.note}</span></>}
        {state.kind === "next" && <><strong>Up next {whenLabel(state.at)}</strong><span>{state.note}</span></>}
        {(state.kind === "progress" || state.kind === "idle") && <strong>{state.note}</strong>}
      </div>
    </div>
    <div className="ep-grid">
      <section className="ep-card" aria-labelledby="ep-table">
        <h2 id="ep-table">{format === "placings" ? "Result" : format === "ring-group" ? "Group tables" : format === "chit-ring" ? "Ring table" : "League table"}</h2>
        {format === "placings" && isJudgedEvent(data, event) ? <StageResult data={data} event={event} /> : format === "placings" ? (placings.length ? <ol className="ep-placings">{placings.map((award) => <li key={award.id}><span className="ep-place">{award.place}</span><DivChip section={sectionOf(data, award.sectionId)} size="m" /><span>{sectionOf(data, award.sectionId)?.name}</span><b>{award.points}</b></li>)}</ol> : <><TallyLiveCard data={data} event={event} /><p className="empty-inline">Places appear here once the judges&apos; result is recorded. Points by place: {event.pointsPolicy.places.join(" / ")}.</p></>)
          : format === "ring-group" ? ([1, 2] as const).map((group) => { const table = groupTable(data, event.id, group); return <div key={group} className="ep-table-wrap"><table className="ep-table"><caption>Group {group} · {table.played} of {data.sections.length} played</caption><thead><tr><th scope="col">Team</th><th scope="col">P</th><th scope="col">W</th><th scope="col">Diff</th></tr></thead><tbody>{table.rows.map((row) => <tr key={row.team.sectionId}><th scope="row"><span className="ep-team"><DivChip section={sectionOf(data, row.team.sectionId)} />{teamName(data, row.team.sectionId, group)}</span></th><td>{row.played}</td><td>{row.wins}</td><td>{row.diff > 0 ? `+${row.diff}` : row.diff}</td></tr>)}</tbody></table></div>; })
          : <div className="ep-table-wrap"><table className="ep-table"><thead><tr><th scope="col">Division</th><th scope="col">P</th><th scope="col">W</th><th scope="col">Diff</th><th scope="col">Pts</th></tr></thead><tbody>{eventTable(data, event.id).map((row) => <tr key={row.sectionId}><th scope="row"><span className="ep-team"><DivChip section={sectionOf(data, row.sectionId)} />{sectionOf(data, row.sectionId)?.name}</span></th><td>{row.played}</td><td>{row.wins}</td><td>{event.sportId === "cricket" ? row.netRunRate.toFixed(2) : row.diff > 0 ? `+${row.diff}` : row.diff}</td><td><b>{eventPoints(data, event.id, row.sectionId)}</b></td></tr>)}</tbody></table></div>}
        {topper && topper.eligible && <p className="fine-print">{topper.awarded ? `${sectionOf(data, topper.awarded.sectionId)?.name} topped the table: +${topper.awarded.points} and straight to the final.` : `${topper.played} of ${topper.expected} table matches played. The table topper gets ${topper.bonus} and goes straight to the final.`}</p>}
        {sport?.standingsTieBreakers?.length ? <p className="fine-print">Table order: {sport.standingsTieBreakers.map((item) => item.replace(/-/g, " ")).join(", then ")}.</p> : null}
      </section>
      {rings.length > 0 && <section className="ep-card" aria-label="Chit-drawn rings">
        {rings.map((ring) => <div key={ring.label} className="ep-ring"><h2>{ring.label}</h2>{ring.order ? <><p className="fine-print">Drawn by chits. Each plays the two beside it.</p><RingDiagram data={data} order={ring.order} size={220} /></> : <p className="empty-inline">The ring appears once its chit draw is scheduled.</p>}</div>)}
      </section>}
    </div>
    <section className="ep-card" aria-labelledby="ep-fixtures">
      <h2 id="ep-fixtures">Matches</h2>
      {fixtures.length ? <ol className="ep-fixtures">{fixtures.map((fixture) => <FixtureLine key={fixture.id} data={data} fixture={fixture} />)}</ol> : <p className="empty-inline">{format === "placings" ? "This is a single contest; the result appears above once it is in." : "No matches are scheduled yet."}</p>}
    </section>
    <section className="ep-card ep-rules" aria-labelledby="ep-rules">
      <h2 id="ep-rules">Rules</h2>
      <h3>Format</h3><p>{event.tournamentFormat}</p>
      {event.rosterRules.length > 0 && <><h3>Roster</h3><ul>{event.rosterRules.map((rule, index) => <li key={index}>{rule}</li>)}</ul></>}
      {sport?.participationNotes.length ? <><h3>Taking part</h3><ul>{sport.participationNotes.map((rule, index) => <li key={index}>{rule}</li>)}</ul></> : null}
      {event.scoringRules.length > 0 && <><h3>Scoring and points</h3><ul>{event.scoringRules.map((rule, index) => <li key={index}>{rule}</li>)}</ul></>}
    </section>
  </div>;
}

// ---------- 4. schedule by venue ----------

export function VenueBoard({ data, fixtures, filterDay }: { data: CompetitionData; fixtures: Fixture[]; filterDay: string }) {
  const days = [...new Set(fixtures.map((fixture) => istDayKey(fixture.startsAt)))].sort();
  const today = istDayKey(new Date().toISOString());
  const [chosen, setChosen] = useState<string | null>(null);
  const day = filterDay !== "all" ? filterDay : chosen && days.includes(chosen) ? chosen : days.includes(today) ? today : days.find((item) => item >= today) ?? days[0];
  const shown = fixtures.filter((fixture) => istDayKey(fixture.startsAt) === day);
  const venues = [...new Set(shown.map((fixture) => fixture.venue.trim()))].sort((a, b) => a.localeCompare(b));
  const dayLabel = (key: string) => formatDay(`${key}T12:00:00+05:30`);
  return <div className="venue-board">
    {filterDay === "all" && days.length > 1 && <div className="venue-days event-tabs" role="tablist" aria-label="Day">{days.map((key) => <button key={key} type="button" role="tab" aria-selected={key === day} className={key === day ? "on" : ""} onClick={() => setChosen(key)}>{key === today ? "Today" : dayLabel(key)}</button>)}</div>}
    {venues.length ? <div className="venue-columns">{venues.map((venue) => { const list = shown.filter((fixture) => fixture.venue.trim() === venue); const live = list.some((fixture) => fixture.status === "live"); return <section key={venue} className="venue-col" aria-label={venue}>
      <header><strong>{venue}</strong><span className={live ? "live" : ""}>{live ? "Live now" : `${list.length} ${list.length === 1 ? "match" : "matches"}`}</span></header>
      <ol>{list.map((fixture) => { const end = new Date(new Date(fixture.startsAt).getTime() + fixture.durationMinutes * 60_000).toISOString(); return <li key={fixture.id} className={`venue-block ${fixture.status}`}>
        <span className="venue-time">{formatTime(fixture.startsAt)}–{formatTime(end)}{fixture.status === "live" ? " · Live" : fixture.status === "completed" ? " · Done" : ""}</span>
        <span className="venue-event">{eventLabel(data, fixture.eventId)} · {stageLabel(fixture)}</span>
        <span className="matchup"><DivChip section={sectionOf(data, fixture.sectionA)} />{sideName(data, fixture, "a")} <span>v</span> <DivChip section={sectionOf(data, fixture.sectionB)} />{sideName(data, fixture, "b")}</span>
        {fixture.status !== "scheduled" && <span className="venue-score">{headlineScore(data, fixture, "a")}–{headlineScore(data, fixture, "b")}</span>}
      </li>; })}</ol>
    </section>; })}</div> : <div className="empty-state"><strong>No matches on this day</strong><p>Try another day, or clear the filters.</p></div>}
  </div>;
}

