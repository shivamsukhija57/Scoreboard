"use client";

import { Trophy, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { AnnouncedRow, CompetitionData, EventDefinition } from "@/lib/domain";
import { isJudgedEvent } from "@/lib/judging";
import { DivChip, DivIcon, formatTime, sectionOf } from "./event-features";

/*
 * The results reveal for judged Stage events: 5th to 1st, then 1st floods in the winner's colour and its points count
 * up. It plays once per person (kept in this browser): on the TV when announced while it's open, on the event page,
 * and in the app. Staff aren't taken over mid-task; they get a small banner with "Watch the reveal".
 */

const SEEN = "dw.revealSeen";
/** Announcements older than this don't come back as a catch-up. */
const CATCH_UP_MS = 12 * 60 * 60_000;
const ordinal = (n: number) => `${n}${["st", "nd", "rd"][n - 1] ?? "th"}`;

function readSeen(): Record<string, string> {
  try { return JSON.parse(window.localStorage.getItem(SEEN) ?? "{}") as Record<string, string>; } catch { return {}; }
}
export function markRevealSeen(eventId: string, at: string) {
  try { window.localStorage.setItem(SEEN, JSON.stringify({ ...readSeen(), [eventId]: at })); } catch { /* private mode: it just plays again */ }
}
export function revealSeen(eventId: string, at: string) { return readSeen()[eventId] === at; }

const reducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Placed divisions best first, then any disqualified. */
export function revealRows(rows: AnnouncedRow[]): AnnouncedRow[] {
  return [...rows.filter((row) => row.place).sort((a, b) => a.place! - b.place!), ...rows.filter((row) => !row.place)];
}

/** The winner's points count up once its row has flooded. Reduced motion: shown straight away. */
function CountUp({ to, delay }: { to: number; delay: number }) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (reducedMotion()) { setValue(to); return; }
    let frame = 0;
    const start = window.setTimeout(() => {
      const began = performance.now();
      const tick = (now: number) => {
        const t = Math.min(1, (now - began) / 900);
        setValue(Math.round(to * (1 - Math.pow(1 - t, 3))));
        if (t < 1) frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    }, delay);
    return () => { window.clearTimeout(start); cancelAnimationFrame(frame); };
  }, [to, delay]);
  return <>+{value}</>;
}

/** The reveal itself: rows appear from last place up, 1st arrives last and floods. `size` follows the screen. */
export function RevealList({ data, event, size = "phone" }: { data: CompetitionData; event: EventDefinition; size?: "phone" | "wide" }) {
  const announced = data.judging?.[event.id]?.announced;
  if (!announced) return null;
  const rows = revealRows(announced.rows);
  const placed = rows.filter((row) => row.place).length;
  const step = size === "wide" ? 600 : 450;
  const hold = size === "wide" ? 850 : 600;
  // Disqualified first, then 5th … 2nd at a steady beat, a hold, then 1st.
  const delayOf = (row: AnnouncedRow) => row.place ? (row.place === 1 ? 300 + (placed - 1) * step + hold : 300 + (placed - row.place) * step) : 0;
  const firstAt = rows[0]?.place === 1 ? delayOf(rows[0]) : 0;
  return <ol className={`rv-list ${size}`} aria-label={`${event.name} results`}>
    {rows.map((row) => {
      const section = sectionOf(data, row.sectionId);
      const first = row.place === 1;
      return <li key={row.sectionId} className={`rv-row${first ? " first" : ""}${row.disqualified ? " out" : ""}`} style={{ animationDelay: `${delayOf(row)}ms`, ["--rv-color" as string]: section?.color ?? "transparent" }}>
        {first && <i className="rv-flood" aria-hidden="true" style={{ animationDelay: `${firstAt + 250}ms` }} />}
        <b className="rv-place">{row.place ? ordinal(row.place) : "Out"}</b>
        <span className="rv-tile"><DivChip section={section} size={first ? "l" : "m"} /><DivIcon section={section} size={first ? 26 : 20} /></span>
        <span className="rv-name"><strong>{section?.name ?? row.sectionId}</strong><small>{row.disqualified ? `Disqualified${row.penalty && row.penalty !== "disqualified" ? `, ${row.penalty.replace(", disqualified", "")}` : ""}` : row.final !== null ? `${row.final} marks${row.penalty ? ` after ${row.penalty}` : ""}` : ""}</small></span>
        <b className="rv-points">{row.disqualified ? "No points" : first ? <CountUp to={row.points} delay={firstAt + 350} /> : `+${row.points}`}</b>
      </li>;
    })}
  </ol>;
}

/** Full-screen reveal (app and TV). The app version waits for Continue; the TV clears itself. */
export function RevealMoment({ data, event, mode, onClose }: { data: CompetitionData; event: EventDefinition; mode: "app" | "tv"; onClose?: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const [wide, setWide] = useState(mode === "tv");
  useEffect(() => {
    if (mode === "app") setWide(window.matchMedia("(min-width: 900px)").matches);
    const focus = window.setTimeout(() => closeRef.current?.focus(), reducedMotion() ? 0 : 3500);
    if (!onClose) return () => window.clearTimeout(focus);
    const onKey = (key: KeyboardEvent) => { if (key.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => { window.clearTimeout(focus); window.removeEventListener("keydown", onKey); };
  }, [mode, onClose]);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  // On document.body, so no transformed ancestor can pull the fixed layer out of place.
  return createPortal(<div className={`rv-moment ${mode === "tv" ? "tv" : ""}`} role="dialog" aria-modal="true" aria-labelledby="rv-title">
    <div className="rv-moment-inner">
      <div className="rv-moment-head"><div><p className="rv-kicker">The Stage · results just announced</p><h1 id="rv-title">{event.name}</h1></div>{mode === "app" && onClose && <button type="button" className="rv-close" aria-label="Close the reveal" onClick={onClose}><X size={18} /></button>}</div>
      <RevealList data={data} event={event} size={wide ? "wide" : "phone"} />
      {mode === "app" && onClose && <button ref={closeRef} type="button" className="primary-button rv-continue" onClick={onClose}>Continue</button>}
    </div>
  </div>, document.body);
}

/** The latest announced judged event this person hasn't seen revealed (within the last 12 hours). */
export function useResultsReveal(data: CompetitionData) {
  const latest = useMemo(() => {
    const announced = data.events.filter((event) => isJudgedEvent(data, event) && data.judging?.[event.id]?.announced)
      .map((event) => ({ event, at: data.judging![event.id].announced!.at })).sort((a, b) => b.at.localeCompare(a.at));
    return announced[0] ?? null;
  }, [data]);
  const [pending, setPending] = useState<{ event: EventDefinition; at: string } | null>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!latest || Date.now() - new Date(latest.at).getTime() > CATCH_UP_MS || revealSeen(latest.event.id, latest.at)) { setPending(null); return; }
    setPending(latest);
  }, [latest?.event.id, latest?.at]); // eslint-disable-line react-hooks/exhaustive-deps
  return {
    pending,
    open,
    watch: () => setOpen(true),
    close: () => { if (pending) markRevealSeen(pending.event.id, pending.at); setOpen(false); setPending(null); },
  };
}

/**
 * In the app: spectators get the reveal full screen, once. Organizers get a small banner instead, so a judge or a
 * scorer mid-task isn't taken over, and watch it when they choose.
 */
export function RevealHost({ data, staff }: { data: CompetitionData; staff: boolean }) {
  const reveal = useResultsReveal(data);
  if (!reveal.pending) return null;
  const { event, at } = reveal.pending;
  if (!staff || reveal.open) return <RevealMoment key={at} data={data} event={event} mode="app" onClose={reveal.close} />;
  const winner = data.judging?.[event.id]?.announced?.rows.find((row) => row.place === 1);
  const section = winner ? sectionOf(data, winner.sectionId) : undefined;
  return <div className="rv-banner" role="status">
    <Trophy size={18} aria-hidden="true" />
    <span><strong>{event.name} results are in</strong><small>{section ? `${section.name} won. Announced at ${formatTime(at)}.` : `Announced at ${formatTime(at)}.`}</small></span>
    <button type="button" className="secondary-button" onClick={reveal.watch}>Watch the reveal</button>
    <button type="button" className="rv-banner-close" aria-label="Dismiss" onClick={reveal.close}><X size={16} /></button>
  </div>;
}

/** TV: when a judged event is announced while the board is open, the room watches the reveal, then it clears. */
export function TvReveal({ data }: { data: CompetitionData }) {
  const known = useRef<Set<string> | null>(null);
  const [showing, setShowing] = useState<{ event: EventDefinition; at: string } | null>(null);
  useEffect(() => {
    const announced = data.events.filter((event) => isJudgedEvent(data, event) && data.judging?.[event.id]?.announced).map((event) => ({ event, at: data.judging![event.id].announced!.at }));
    if (!known.current) { known.current = new Set(announced.map((item) => `${item.event.id}@${item.at}`)); return; }
    const fresh = announced.filter((item) => !known.current!.has(`${item.event.id}@${item.at}`)).sort((a, b) => b.at.localeCompare(a.at));
    for (const item of announced) known.current.add(`${item.event.id}@${item.at}`);
    if (fresh[0]) setShowing(fresh[0]);
  }, [data]);
  useEffect(() => {
    if (!showing) return;
    const timer = window.setTimeout(() => setShowing(null), 15_000);
    return () => window.clearTimeout(timer);
  }, [showing]);
  if (!showing) return null;
  return <RevealMoment key={showing.at} data={data} event={showing.event} mode="tv" />;
}

/**
 * Event page, judged Stage events: sealed with the running order until announced; then the result with each
 * division's marks. The reveal plays here once if this person hasn't seen it; "Replay the reveal" after that.
 */
export function StageResult({ data, event }: { data: CompetitionData; event: EventDefinition }) {
  const judging = data.judging?.[event.id];
  const announced = judging?.announced;
  const recorded = (data.bonusAwards ?? []).some((award) => award.eventId === event.id && award.kind === "placing");
  const [play, setPlay] = useState(0);
  useEffect(() => {
    if (!announced) return;
    if (!revealSeen(event.id, announced.at)) { setPlay((count) => count + 1); markRevealSeen(event.id, announced.at); }
  }, [event.id, announced?.at]); // eslint-disable-line react-hooks/exhaustive-deps
  if (recorded && !announced) {
    // Placings recorded directly (not from the results desk): the order and points, without marks.
    const awards = (data.bonusAwards ?? []).filter((award) => award.eventId === event.id && award.kind === "placing").sort((a, b) => (a.place ?? 9) - (b.place ?? 9));
    return <ol className="ep-placings">{awards.map((award) => <li key={award.id}><span className="ep-place">{award.place}</span><DivChip section={sectionOf(data, award.sectionId)} size="m" /><span>{sectionOf(data, award.sectionId)?.name}</span><b>{award.points}</b></li>)}</ol>;
  }
  if (!announced || !recorded) {
    const order = judging?.order ?? data.sections.map((section) => section.id);
    return <div className="rv-sealed">
      <ol className="rv-order" aria-label="Performance order">{order.map((id, index) => { const section = sectionOf(data, id); return <li key={id}><span className="rv-order-n">{index + 1}</span><DivChip section={section} size="m" /><span>{section?.name}</span></li>; })}</ol>
      <p className="empty-inline">Results are sealed until the coordinator announces them. Points by place: {event.pointsPolicy.places.join(" / ")}.</p>
    </div>;
  }
  const criteria = judging?.criteria ?? [];
  const winner = announced.rows.find((row) => row.place === 1);
  const winnerSection = winner ? sectionOf(data, winner.sectionId) : undefined;
  return <div className="rv-result">
    {play > 0 ? <RevealList key={play} data={data} event={event} size="phone" /> : <ol className="rv-list still" aria-label={`${event.name} results`}>{revealRows(announced.rows).map((row) => { const section = sectionOf(data, row.sectionId); return <li key={row.sectionId} className={`rv-row${row.place === 1 ? " first" : ""}${row.disqualified ? " out" : ""}`} style={{ ["--rv-color" as string]: section?.color ?? "transparent" }}>
      {row.place === 1 && <i className="rv-flood" aria-hidden="true" />}
      <b className="rv-place">{row.place ? ordinal(row.place) : "Out"}</b><span className="rv-tile"><DivChip section={section} size={row.place === 1 ? "l" : "m"} /><DivIcon section={section} size={row.place === 1 ? 26 : 20} /></span>
      <span className="rv-name"><strong>{section?.name}</strong><small>{row.disqualified ? "Disqualified" : row.final !== null ? `${row.final} marks${row.penalty ? ` after ${row.penalty}` : ""}` : ""}</small></span>
      <b className="rv-points">{row.disqualified ? "No points" : `+${row.points}`}</b>
    </li>; })}</ol>}
    <button type="button" className="text-button rv-replay" onClick={() => setPlay((count) => count + 1)}>Replay the reveal</button>
    {winner?.criteria && criteria.length > 1 && winnerSection && <div className="rv-why">
      <strong>Why {winnerSection.name} won: marks by criterion</strong>
      <ul>{criteria.map((criterion, index) => { const got = winner.criteria![index] ?? 0; const out = criterion.max * (judging?.items ?? 1) * (judging?.combine === "sum" ? judging.judgeCount : 1); return <li key={criterion.id}><span>{criterion.name}</span><span className="rv-why-bar" aria-hidden="true"><i style={{ width: `${Math.min(100, (got / out) * 100)}%`, background: winnerSection.color }} /></span><b>{got}/{out}</b></li>; })}</ul>
      <p className="fine-print">Average of the judges&apos; marks. Each judge&apos;s own marks stay private.</p>
    </div>}
    {announced.note && <p className="fine-print">{announced.note}</p>}
  </div>;
}
