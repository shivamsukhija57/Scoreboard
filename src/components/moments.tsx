"use client";

import { Crown, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { CompetitionData, SectionId } from "@/lib/domain";
import { awaySummary, leadCatchUp, leaderHistory, type SeenLeader } from "@/lib/moments";
import { DivChip, eventLabel, formatTime, lineColor, sectionOf, sectionTable } from "./event-features";

/*
 * Moments: the rare animations (the lead changing hands, the champion). Each person sees each one once:
 * live if they're watching, otherwise as a catch-up the next time they open the app. What they last saw is
 * kept in this browser. Staff never get a full-screen takeover mid-task; only the champion takes the screen.
 */

const LAST_LEADER = "dw.lastLeader";
const LAST_VISIT = "dw.lastVisit";
const CHAMPION_SEEN = "dw.championSeen";

function read<T>(key: string): T | null {
  try { const raw = window.localStorage.getItem(key); return raw ? (JSON.parse(raw) as T) : null; } catch { return null; }
}
function write(key: string, value: unknown) {
  try { window.localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode: moments still play, just not remembered */ }
}

interface BannerContent { title: string; sub: string; sectionId: SectionId | null; past: boolean }

/**
 * The lead-change banner. Live: drops in when the leader changes while the page is open.
 * Catch-up (app only): on load, if the leader is different from the one this person last saw, in the past tense.
 */
export function LeadBanner({ data, mode }: { data: CompetitionData; mode: "app" | "tv" }) {
  const history = useMemo(() => leaderHistory(data), [data]);
  const previous = useRef<SectionId | null | undefined>(undefined);
  const [banner, setBanner] = useState<BannerContent | null>(null);
  const [leaving, setLeaving] = useState(false);
  const name = (id: SectionId | null) => (id ? sectionOf(data, id)?.name ?? id : "");

  useEffect(() => {
    const leader = history.leader;
    if (previous.current === undefined) {
      previous.current = leader;
      if (mode === "app") {
        const seen = read<SeenLeader>(LAST_LEADER);
        const catchUp = leadCatchUp(history, seen, new Date());
        if (catchUp.kind === "single") setBanner({ title: `${name(catchUp.change.sectionId)} took the lead at ${formatTime(catchUp.change.at)}`, sub: `${catchUp.change.cause} · while you were away`, sectionId: catchUp.change.sectionId, past: true });
        if (catchUp.kind === "many") setBanner({ title: `The lead changed ${catchUp.count} times`, sub: `${name(catchUp.last.sectionId)} lead now · last change at ${formatTime(catchUp.last.at)}`, sectionId: catchUp.last.sectionId, past: true });
        write(LAST_LEADER, { leader, at: new Date().toISOString() });
      }
      return;
    }
    if (leader && previous.current && leader !== previous.current) {
      const change = history.changes.at(-1);
      setLeaving(false);
      setBanner({ title: `${name(leader)} take the lead`, sub: change ? `${change.cause} · ${change.points} points` : "", sectionId: leader, past: false });
    }
    previous.current = leader;
    if (mode === "app") write(LAST_LEADER, { leader, at: new Date().toISOString() });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [history.leader]);

  useEffect(() => {
    if (!banner) return;
    const hold = window.setTimeout(() => setLeaving(true), mode === "tv" ? 7000 : 5500);
    const gone = window.setTimeout(() => { setBanner(null); setLeaving(false); }, mode === "tv" ? 7200 : 5700);
    return () => { window.clearTimeout(hold); window.clearTimeout(gone); };
  }, [banner, mode]);

  if (!banner) return null;
  const section = banner.sectionId ? sectionOf(data, banner.sectionId) : undefined;
  return <div className={`lead-banner ${mode === "tv" ? "lead-banner-tv" : ""} ${leaving ? "leaving" : ""}`} role="status" style={{ ["--lead-color" as string]: section?.color ?? "#20263a", ["--lead-ink" as string]: "#ffffff" }}>
    <Crown size={mode === "tv" ? 34 : 20} aria-hidden="true" />
    <span><strong>{banner.title}</strong><small>{banner.sub}</small></span>
    {mode === "app" && <button className="lead-banner-close" aria-label="Dismiss" onClick={() => { setLeaving(true); window.setTimeout(() => { setBanner(null); setLeaving(false); }, 200); }}><X size={16} /></button>}
  </div>;
}

/** The still "While you were away" card on the overview: what was finalized since this person's last visit. */
export function AwayDigest({ data, openStandings }: { data: CompetitionData; openStandings: () => void }) {
  const [since, setSince] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => {
    const last = read<string>(LAST_VISIT);
    // Only worth showing after a real gap; a quick refresh shouldn't bring it back.
    if (last && Date.now() - new Date(last).getTime() > 60 * 60_000) setSince(last);
    const stamp = () => write(LAST_VISIT, new Date().toISOString());
    stamp();
    const onHide = () => { if (document.visibilityState === "hidden") stamp(); };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, []);
  const summary = useMemo(() => since ? awaySummary(data, since) : null, [data, since]);
  if (!summary || dismissed || (!summary.decided && !summary.leadChanges.length)) return null;
  const name = (id: SectionId | null) => (id ? sectionOf(data, id)?.name ?? id : "");
  const rows = [
    ...summary.leadChanges.slice(0, 3).map((change) => ({ key: `lead-${change.at}`, id: change.sectionId, text: `${name(change.sectionId)} took the lead`, sub: `${formatTime(change.at)} · ${change.cause}` })),
    ...summary.results.slice(0, 3).map((item) => ({ key: item.id, id: item.winner, text: item.winner ? `${eventLabel(data, item.eventId)}: ${name(item.winner)} won` : `${eventLabel(data, item.eventId)}: level`, sub: `${formatTime(item.at)}${item.points ? ` · +${item.points}` : ""}` })),
  ];
  return <section className="away-digest" aria-labelledby="away-title">
    <div className="away-head"><h2 id="away-title">While you were away</h2><span>Since {formatTime(since!)}</span></div>
    <ol>{rows.map((row) => <li key={row.key}>{row.id ? <DivChip section={sectionOf(data, row.id)} size="m" /> : <i className="away-level" aria-hidden="true" />}<span><strong>{row.text}</strong><small>{row.sub}</small></span></li>)}</ol>
    <div className="away-actions">{summary.decided > 3 && <button className="text-button" onClick={openStandings}>See all {summary.decided} results</button>}<button className="secondary-button" onClick={() => setDismissed(true)}>Got it</button></div>
  </section>;
}

/** Shows the champion moment once per person: when it's announced while they're here, or the next time they open the app. */
export function useChampionMoment(data: CompetitionData) {
  const [open, setOpen] = useState(false);
  const announcedAt = data.champion?.announcedAt;
  useEffect(() => {
    if (!announcedAt) { setOpen(false); return; }
    if (read<string>(CHAMPION_SEEN) !== announcedAt) setOpen(true);
  }, [announcedAt]);
  return {
    open,
    replay: () => setOpen(true),
    close: () => { if (announcedAt) write(CHAMPION_SEEN, announcedAt); setOpen(false); },
  };
}

interface Burst { left: string; top: string; color: string; delay: number }
const BURSTS: Array<Omit<Burst, "color"> & { colorIndex: number }> = [
  { left: "16%", top: "34%", delay: 4700, colorIndex: 0 }, { left: "84%", top: "30%", delay: 5000, colorIndex: 1 }, { left: "32%", top: "16%", delay: 5450, colorIndex: 2 },
  { left: "68%", top: "14%", delay: 5800, colorIndex: 0 }, { left: "50%", top: "8%", delay: 6300, colorIndex: 3 }, { left: "22%", top: "22%", delay: 6900, colorIndex: 1 },
  { left: "78%", top: "20%", delay: 7300, colorIndex: 0 }, { left: "42%", top: "30%", delay: 7800, colorIndex: 2 }, { left: "60%", top: "26%", delay: 8300, colorIndex: 0 },
];

/**
 * The champion moment: podium rises 3rd, 2nd, 1st; a crown drops onto the winner; the name lands; then fireworks
 * in the podium colours (TV and wide screens). Reduced motion: the global rule cuts it to the final frame.
 */
export function ChampionMoment({ data, mode, onClose }: { data: CompetitionData; mode: "app" | "tv"; onClose?: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const [wide, setWide] = useState(mode === "tv");
  useEffect(() => {
    if (mode === "app") setWide(window.matchMedia("(min-width: 900px)").matches);
    // Focus Continue once it has faded in (4s), so keyboard focus never sits on an invisible button.
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const focus = window.setTimeout(() => closeRef.current?.focus(), reduced ? 0 : 4300);
    if (mode !== "app" || !onClose) return () => window.clearTimeout(focus);
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => { window.clearTimeout(focus); window.removeEventListener("keydown", onKey); };
  }, [mode, onClose]);
  if (!data.champion) return null;
  const table = sectionTable(data);
  const winner = table.find((row) => row.section.id === data.champion!.sectionId);
  const others = table.filter((row) => row.section.id !== data.champion!.sectionId);
  if (!winner) return null;
  // All five places, revealed last to first; laid out 4th, 2nd, 1st, 3rd, 5th so the winner stands in the middle.
  const podium = [
    { row: others[2], place: "4th", height: 52, delay: 900 },
    { row: others[0], place: "2nd", height: 78, delay: 1900 },
    { row: winner, place: "1st", height: 100, delay: 2500 },
    { row: others[1], place: "3rd", height: 62, delay: 1400 },
    { row: others[3], place: "5th", height: 42, delay: 400 },
  ].filter((item) => item.row);
  // Fireworks use the lifted colours: a black or navy spark would be invisible against the night sky.
  const colors = [lineColor(winner.section), others[0] ? lineColor(others[0].section) : "light-dark(#e0a800, #ffffff)", others[1] ? lineColor(others[1].section) : "light-dark(#e0a800, #ffffff)", "light-dark(#e0a800, #ffffff)"];
  const bursts: Burst[] = wide ? BURSTS.map((burst) => ({ ...burst, color: colors[burst.colorIndex] })) : [];
  return <div className={`champion-moment ${mode === "tv" ? "champion-tv" : ""}`} role="dialog" aria-modal="true" aria-labelledby="champion-title" style={{ ["--winner" as string]: winner.section.color }}>
    <p className="champion-kicker">{data.name} · final standings</p>
    <div className="champion-name" style={{ color: lineColor(winner.section) }} id="champion-title">{winner.section.name}</div>
    <div className="champion-sub">Champions of {data.name}</div>
    <div className="champion-stage">
      <div className="champion-halo" aria-hidden="true" style={{ ["--halo" as string]: lineColor(winner.section) }} />
      <svg className="champion-crown" viewBox="0 0 120 84" role="img" aria-label={`Crown over ${winner.section.name}`}>
        <path d="M8 70 L14 22 L38 46 L60 8 L82 46 L106 22 L112 70 Z" fill="#FFD60A" stroke="#FFF3B0" strokeWidth="3" strokeLinejoin="round" />
        <rect x="8" y="66" width="104" height="14" rx="4" fill="#E0B400" />
        <circle cx="14" cy="20" r="6" fill="#FFF3B0" /><circle cx="60" cy="6" r="7" fill="#FFF3B0" /><circle cx="106" cy="20" r="6" fill="#FFF3B0" />
      </svg>
      <div className="champion-podium">{podium.map(({ row, place, height, delay }) => <div key={place} className="champion-block" style={{ height: `${height}%`, background: row!.section.color, color: "#ffffff", animationDelay: `${delay}ms` }}>
        <b>{place}</b><strong>{row!.section.code}</strong><em>{row!.section.name}</em><span>{row!.points}</span>
      </div>)}</div>
    </div>
    {mode === "app" && onClose && <button ref={closeRef} className="primary-button champion-continue" onClick={onClose}>Continue</button>}
    {bursts.length > 0 && <div className="champion-fireworks" aria-hidden="true">{bursts.map((burst, index) => <div key={index} className="fw-burst" style={{ left: burst.left, top: burst.top }}>
      <i className="fw-shell" style={{ background: `linear-gradient(180deg, ${burst.color}, transparent)`, animationDelay: `${burst.delay - 600}ms` }} />
      <i className="fw-flash" style={{ background: `radial-gradient(closest-side, ${burst.color}, transparent)`, animationDelay: `${burst.delay}ms` }} />
      {Array.from({ length: 22 }, (_, spark) => {
        const far = spark % 2 === 0;
        const color = spark % 7 === 3 ? "light-dark(#e0a800, #ffffff)" : burst.color;
        return <span key={spark} className="fw-spoke" style={{ transform: `rotate(${spark * 360 / 22 + (far ? 0 : 8)}deg)` }}><i className={far ? "fw-far" : "fw-near"} style={{ background: color, boxShadow: `0 0 14px 3px ${color}`, animationDelay: `${burst.delay + (far ? 0 : 60)}ms` }} /></span>;
      })}
    </div>)}</div>}
  </div>;
}

/** After someone has seen the champion moment, the overview keeps a still card with a replay. */
export function ChampionCard({ data, onReplay }: { data: CompetitionData; onReplay: () => void }) {
  if (!data.champion) return null;
  const section = sectionOf(data, data.champion.sectionId);
  const row = sectionTable(data).find((item) => item.section.id === data.champion!.sectionId);
  return <section className="champion-card" style={{ ["--champion" as string]: lineColor(section) }}>
    <Crown size={22} aria-hidden="true" />
    <div><small>Champions of {data.name.toUpperCase()}</small><strong>{section?.name ?? data.champion.sectionId}</strong>{row && <span>{row.points} points</span>}</div>
    <button className="secondary-button" onClick={onReplay}>Replay the moment</button>
  </section>;
}
