"use client";

import { ArrowRight, CalendarPlus, Clock3, Shuffle, Timer, TriangleAlert, Tv, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import type { CompetitionData, Fixture, Section, SectionId } from "@/lib/domain";
import { activeNotices, bookingDescriber, istDayKey, planFixtureShift, planRoundRobin } from "@/lib/schedule-tools";
import { buildPointsRace, isFinalized, type Leaderboard, type LeaderboardGender, type RaceBoard } from "@/lib/leaderboards";

type Toast = (message: string, error?: boolean) => void;

// ---------- shared helpers ----------

class RequestError extends Error {
  constructor(message: string, readonly status: number, readonly payload: Record<string, unknown>) { super(message); }
}

async function request<T>(url: string, method = "GET", body?: unknown): Promise<T> {
  const response = await fetch(url, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined, cache: "no-store" });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new RequestError(payload.error ?? "The request could not be completed.", response.status, payload);
  return payload as T;
}

export function sectionOf(data: CompetitionData, id: string) { return data.sections.find((section) => section.id === id); }

/** The division's colour for thin marks (lines, bars, dots) on the dark UI. */
export function lineColor(section?: Section) {
  // Light theme: the division's own colour reads fine on white. Dark theme: the lifted colour, so navy, burgundy and
  // black don't vanish. light-dark() follows the page's color-scheme, so the TV and champion screen stay on "dark".
  return section ? `light-dark(${section.color}, ${section.line ?? section.color})` : "#7d869c";
}

/**
 * A division's colour never appears on its own: the chip carries its letter, and a thin light ring keeps
 * navy, burgundy and black visible on the dark UI. Decorative: the name always sits next to it.
 */
/** Grey placeholder rows in the shape of the content that's coming, instead of "Loading…". */
export function SkeletonRows({ count, label }: { count: number; label?: string }) {
  return <div className="skeleton-rows" role={label ? "status" : undefined} aria-label={label}>{Array.from({ length: count }, (_, index) => <span key={index} className="skeleton-row" style={{ width: `${92 - (index % 3) * 14}%` }} />)}</div>;
}

// Each division's mark, tinted with CSS masks so one file serves every colour and theme.
const DIVISION_ICONS: Record<string, string> = { s1: "/divisions/ares.png", s2: "/divisions/bloodhounds.png", s3: "/divisions/cyappa.svg", s4: "/divisions/dracarys.png", s5: "/divisions/eagles.png" };

/** The division's icon beside its chip (never instead of it). Decorative: the name is always next to it. */
export function DivIcon({ section, size = 18, className = "" }: { section?: Section; size?: number; className?: string }) {
  const file = section ? DIVISION_ICONS[section.id] : undefined;
  if (!section || !file) return null;
  // Primary colour in both themes. The outer span carries a thin light edge on dark (a mask would clip a filter on
  // the same element), so navy, burgundy and black stay visible against the dark page.
  return <span className={`div-icon-wrap ${className}`} aria-hidden="true"><span className="div-icon" style={{ width: size, height: size, color: section.color, WebkitMaskImage: `url(${file})`, maskImage: `url(${file})` }} /></span>;
}

export function DivChip({ section, size = "s" }: { section?: Section; size?: "s" | "m" | "l" }) {
  if (!section) return null;
  return <span className={`div-chip ${size}`} style={{ background: section.color }} aria-hidden="true">{section.code}</span>;
}
function sectionName(data: CompetitionData, id: string) { return sectionOf(data, id)?.name ?? id; }
function sectionCode(data: CompetitionData, id: string) { return sectionOf(data, id)?.code ?? "—"; }
export function eventLabel(data: CompetitionData, eventId: string) {
  const event = data.events.find((item) => item.id === eventId);
  const sport = data.sports.find((item) => item.id === event?.sportId)?.name ?? "Event";
  return event && event.name !== sport ? `${sport} · ${event.name}` : sport;
}
const istFormat = (options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", ...options });
export const formatTime = (iso: string) => istFormat({ hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));
export const formatDay = (iso: string) => istFormat({ weekday: "short", day: "numeric", month: "short" }).format(new Date(iso));
const formatDayKey = (day: string) => istFormat({ weekday: "short", day: "numeric", month: "short" }).format(new Date(`${day}T12:00:00+05:30`));
const formatDayShort = (day: string) => istFormat({ day: "numeric", month: "short" }).format(new Date(`${day}T12:00:00+05:30`));
function addDays(day: string, count: number) { const date = new Date(`${day}T00:00:00Z`); date.setUTCDate(date.getUTCDate() + count); return date.toISOString().slice(0, 10); }
function nowIstTime(stepMinutes = 15) {
  const parts = istFormat({ hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date()).split(":").map(Number);
  const total = Math.floor((parts[0] * 60 + parts[1]) / stepMinutes) * stepMinutes;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

const SET_SPORTS = ["volleyball", "throwball", "badminton", "table-tennis", "lawn-tennis", "pickleball", "squash"];
export function headlineScore(data: CompetitionData, fixture: Fixture, side: "a" | "b"): string {
  const sport = data.events.find((item) => item.id === fixture.eventId)?.sportId;
  const score = side === "a" ? fixture.scoreA : fixture.scoreB;
  if (sport === "cricket") return `${score}/${side === "a" ? fixture.scorecard?.wicketsA ?? 0 : fixture.scorecard?.wicketsB ?? 0}`;
  if (SET_SPORTS.includes(sport ?? "")) return String(side === "a" ? fixture.scorecard?.setsA ?? 0 : fixture.scorecard?.setsB ?? 0);
  return String(score);
}

/** Overall finalized points per section, ranked, with shared ranks for equal totals. */
export function sectionTable(data: CompetitionData) {
  const totals = new Map<SectionId, number>(data.sections.map((section) => [section.id, 0]));
  for (const fixture of data.fixtures) {
    if (!isFinalized(fixture)) continue;
    totals.set(fixture.sectionA, (totals.get(fixture.sectionA) ?? 0) + (fixture.awardedPointsA ?? 0));
    totals.set(fixture.sectionB, (totals.get(fixture.sectionB) ?? 0) + (fixture.awardedPointsB ?? 0));
  }
  for (const bonus of data.bonusAwards ?? []) totals.set(bonus.sectionId, (totals.get(bonus.sectionId) ?? 0) + bonus.points);
  const rows = data.sections.map((section) => ({ section, points: totals.get(section.id) ?? 0 })).sort((a, b) => b.points - a.points);
  return rows.map((row) => ({ ...row, rank: rows.filter((other) => other.points > row.points).length + 1, tied: rows.filter((other) => other.points === row.points).length > 1 }));
}

function ordinal(rank: number) {
  const suffix = rank % 100 >= 11 && rank % 100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[rank % 10] ?? "th";
  return `${rank}${suffix}`;
}

// ---------- delay notices ----------

export function NoticeBanner({ data }: { data: CompetitionData }) {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  if (!now) return null;
  const notices = activeNotices(data, now);
  if (!notices.length) return null;
  return <div className="delay-notices" role="status">{notices.map((notice) => <p className="delay-notice" key={notice.id}><Clock3 size={15} aria-hidden="true" /><strong>{notice.venue} is running {Math.abs(notice.minutes)} min {notice.minutes > 0 ? "late" : "early"}</strong>{notice.reason && <span>{notice.reason}</span>}</p>)}</div>;
}

// ---------- my section ----------

const MY_SECTION_KEY = "dw.mySection";

export function useMySection(data: CompetitionData): [SectionId | null, (id: SectionId | null) => void] {
  const [value, setValue] = useState<SectionId | null>(null);
  const sectionIds = data.sections.map((section) => section.id).join(",");
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(MY_SECTION_KEY);
      if (stored && sectionIds.split(",").includes(stored)) setValue(stored as SectionId);
    } catch { /* storage unavailable: the picker simply shows again */ }
  }, [sectionIds]);
  const update = (id: SectionId | null) => {
    setValue(id);
    try { if (id) window.localStorage.setItem(MY_SECTION_KEY, id); else window.localStorage.removeItem(MY_SECTION_KEY); } catch { /* ignore */ }
  };
  return [value, update];
}

function SectionPicker({ data, onPick, selected, compact }: { data: CompetitionData; onPick: (id: SectionId) => void; selected?: SectionId | null; compact?: boolean }) {
  const table = sectionTable(data);
  // The pennant drop is a first-impression moment: once per browser session, not on every return to the overview.
  // Decided after mount, so the server and browser render the same markup first (no hydration mismatch).
  const [drop, setDrop] = useState(false);
  useEffect(() => { try { if (!compact || window.sessionStorage.getItem("dw.pickerDropped")) return; window.sessionStorage.setItem("dw.pickerDropped", "1"); setDrop(true); } catch { /* storage blocked: no drop-in */ } }, [compact]);
  return <div className={compact ? `section-picker compact${drop ? " drop" : ""}` : "section-picker"}>{data.sections.map((section, index) => {
    const row = table.find((item) => item.section.id === section.id);
    return <button key={section.id} type="button" aria-pressed={selected === section.id} onClick={() => onPick(section.id)} style={{ ["--section-color" as string]: section.color, ["--section-accent" as string]: section.accent, ["--section-line" as string]: lineColor(section), ["--i" as string]: index }}>
      <span className="section-picker-mark">{section.code}</span><span className="section-picker-name">{section.name}</span>{!compact && row && <small>{row.tied ? "=" : ""}{ordinal(row.rank)} · {row.points} pts</small>}
    </button>;
  })}</div>;
}

/**
 * The colour key, always in the sidebar: every division's chip, name, rank and points. It doubles as the
 * follow control, so learning the colours and choosing a side happen in one place.
 */
export function DivisionKey({ data, mySection, setMySection, variant = "list" }: { data: CompetitionData; mySection: SectionId | null; setMySection: (id: SectionId | null) => void; variant?: "list" | "strip" }) {
  const table = sectionTable(data);
  const scored = table.some((row) => row.points > 0);
  const titleId = `division-key-title-${variant}`;
  if (variant === "strip") return <section className="division-key-strip" aria-labelledby={titleId}>
    <h2 id={titleId} className="sr-only">Divisions</h2>
    <ul>{data.sections.map((section) => <li key={section.id}><button type="button" aria-pressed={mySection === section.id} onClick={() => setMySection(mySection === section.id ? null : section.id)} aria-label={mySection === section.id ? `Stop following ${section.name}` : `Follow ${section.name}`}><DivChip section={section} size="m" /><span>{section.name}</span></button></li>)}</ul>
  </section>;
  return <section className="division-key" aria-labelledby={titleId}>
    <h2 id={titleId}>Divisions</h2>
    <ul>{data.sections.map((section) => {
      const row = table.find((item) => item.section.id === section.id);
      const following = mySection === section.id;
      return <li key={section.id}><button type="button" aria-pressed={following} onClick={() => setMySection(following ? null : section.id)} title={following ? `Stop following ${section.name}` : `Follow ${section.name}`}>
        <DivChip section={section} size="m" /><DivIcon section={section} />
        <span className="key-name">{section.name}<small>{following ? "Following" : scored && row ? `${row.tied ? "=" : ""}${ordinal(row.rank)}` : `Div ${section.code}`}</small></span>
        {scored && row && <b>{row.points}</b>}
      </button></li>;
    })}</ul>
    <p>{mySection ? "Tap again to stop following." : "Tap a division to follow it."}</p>
  </section>;
}

export function MySectionStrip({ data, mySection, setMySection, openMine }: { data: CompetitionData; mySection: SectionId | null; setMySection: (id: SectionId | null) => void; openMine: () => void }) {
  const row = mySection ? sectionTable(data).find((item) => item.section.id === mySection) : undefined;
  // The pick plays its swing-and-wash once, right after the choice; a returning visitor just sees the strip.
  const [justPicked, setJustPicked] = useState(false);
  useEffect(() => { if (!justPicked) return; const done = window.setTimeout(() => setJustPicked(false), 1300); return () => window.clearTimeout(done); }, [justPicked]);
  return <div className={`my-section-strip${justPicked && row ? " just-picked" : ""}`} style={row ? { ["--picked" as string]: row.section.color } : undefined}>
    {row ? <><span className="strip-mark" style={{ background: row.section.color }}>{row.section.code}</span><span className="strip-copy"><small>Following</small><strong>{row.section.name} · {row.tied ? "=" : ""}{ordinal(row.rank)} · {row.points} pts</strong></span><button className="text-button strip-open" onClick={openMine}>My division <ArrowRight size={13} /></button></>
      : <><span className="strip-copy"><small>Who are you cheering for?</small><strong>Pick a division to put its matches first</strong></span><SectionPicker data={data} onPick={(id) => { setMySection(id); setJustPicked(true); }} compact /></>}
    <a className="secondary-button strip-tv" href="/tv" target="_blank" rel="noopener"><Tv size={14} aria-hidden="true" /> TV mode</a>
  </div>;
}

function downloadCalendar(data: CompetitionData, sectionId: SectionId, fixtures: Fixture[]) {
  const stamp = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  // CR as well as LF: a stray carriage return in a venue name could otherwise start a new calendar property.
  const escape = (text: string) => text.replace(/\\/g, "\\\\").replace(/[,;]/g, (match) => `\\${match}`).replace(/\r\n|\r|\n/g, "\\n");
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Division Wars//Scoreboard//EN", "CALSCALE:GREGORIAN", `X-WR-CALNAME:${escape(`Division Wars · ${sectionName(data, sectionId)}`)}`];
  for (const fixture of fixtures) {
    const opponent = fixture.sectionA === sectionId ? fixture.sectionB : fixture.sectionA;
    const end = new Date(new Date(fixture.startsAt).getTime() + fixture.durationMinutes * 60_000).toISOString();
    lines.push("BEGIN:VEVENT", `UID:${fixture.id}@division-wars`, `DTSTAMP:${stamp(new Date().toISOString())}`, `DTSTART:${stamp(fixture.startsAt)}`, `DTEND:${stamp(end)}`, `SUMMARY:${escape(`${eventLabel(data, fixture.eventId)} · ${sectionCode(data, sectionId)} vs ${sectionCode(data, opponent)}`)}`, `LOCATION:${escape(fixture.venue)}`, "END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  const url = URL.createObjectURL(new Blob([lines.join("\r\n")], { type: "text/calendar" }));
  const link = document.createElement("a");
  link.href = url; link.download = `division-wars-section-${sectionCode(data, sectionId).toLowerCase()}.ics`;
  document.body.appendChild(link); link.click(); link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function useLeaderboards(gender: LeaderboardGender) {
  const [state, setState] = useState<{ boards: Leaderboard[]; showNames: boolean; loading: boolean; error: string }>({ boards: [], showNames: false, loading: true, error: "" });
  useEffect(() => {
    let cancelled = false;
    setState((current) => ({ ...current, loading: true, error: "" }));
    request<{ boards: Leaderboard[]; showNames: boolean }>(`/api/leaderboards?gender=${gender}`)
      .then((result) => { if (!cancelled) setState({ boards: result.boards, showNames: result.showNames, loading: false, error: "" }); })
      .catch((error: unknown) => { if (!cancelled) setState((current) => ({ ...current, loading: false, error: error instanceof Error ? error.message : "Leaderboards could not load." })); });
    return () => { cancelled = true; };
  }, [gender]);
  return state;
}

export function MySectionView({ data, mySection, setMySection, openMatch }: { data: CompetitionData; mySection: SectionId | null; setMySection: (id: SectionId | null) => void; openMatch: (id: string) => void }) {
  const leaders = useLeaderboards("all");
  const [today, setToday] = useState("");
  useEffect(() => { setToday(istDayKey(new Date().toISOString())); }, []);
  const section = mySection ? sectionOf(data, mySection) : undefined;
  if (!mySection || !section) {
    return <div className="view-content"><div className="page-title-row"><div><p className="eyebrow">My division <span>·</span> Saved on this device</p><h1>Who are you cheering for</h1><p className="subtitle">Pick a division to put its matches, results, and players first. No sign-in needed, and you can change it any time.</p></div></div><SectionPicker data={data} onPick={setMySection} /></div>;
  }
  const table = sectionTable(data);
  const index = table.findIndex((row) => row.section.id === mySection);
  const row = table[index];
  const above = table.slice(0, index).filter((other) => other.points > row.points).at(-1);
  const below = table.slice(index + 1).find((other) => other.points < row.points);
  const involves = (fixture: Fixture) => fixture.sectionA === mySection || fixture.sectionB === mySection;
  const live = data.fixtures.filter((fixture) => fixture.status === "live" && involves(fixture));
  const upcoming = data.fixtures.filter((fixture) => fixture.status === "scheduled" && involves(fixture)).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const finalized = data.fixtures.filter((fixture) => isFinalized(fixture) && involves(fixture)).sort((a, b) => (b.resultFinalizedAt ?? b.updatedAt).localeCompare(a.resultFinalizedAt ?? a.updatedAt));
  const pointsOf = (fixture: Fixture) => (fixture.sectionA === mySection ? fixture.awardedPointsA : fixture.awardedPointsB) ?? 0;
  const todayBonus = today ? (data.bonusAwards ?? []).filter((bonus) => bonus.sectionId === mySection && istDayKey(bonus.awardedAt) === today).reduce((sum, bonus) => sum + bonus.points, 0) : 0;
  const todayPoints = today ? finalized.filter((fixture) => istDayKey(fixture.resultFinalizedAt ?? fixture.updatedAt) === today).reduce((sum, fixture) => sum + pointsOf(fixture), todayBonus) : 0;
  const isSport = (fixture: Fixture) => data.sports.find((sport) => sport.id === data.events.find((event) => event.id === fixture.eventId)?.sportId)?.category === "sport";
  const outcome = (fixture: Fixture) => {
    if (fixture.noResult) return { label: "NR", tone: "neutral" };
    if (!isSport(fixture)) return { label: "Pts", tone: pointsOf(fixture) > 0 ? "win" : "neutral" };
    const mine = fixture.sectionA === mySection ? fixture.scoreA : fixture.scoreB;
    const theirs = fixture.sectionA === mySection ? fixture.scoreB : fixture.scoreA;
    return mine > theirs ? { label: "W", tone: "win" } : mine < theirs ? { label: "L", tone: "loss" } : { label: "D", tone: "neutral" };
  };
  const performers = leaders.boards.map((board) => ({ board, top: board.rows.find((item) => item.sectionId === mySection) })).filter((item) => item.top);
  return <div className="view-content my-section" style={{ ["--section-color" as string]: section.color, ["--section-accent" as string]: section.accent, ["--section-line" as string]: lineColor(section) }}>
    <section className="my-section-hero"><DivIcon section={section} size={220} className="hero-mark" />
      <div className="my-section-hero-top"><span className="my-section-mark">{section.code}</span><div><p className="eyebrow">My division</p><h1>{section.name}</h1></div><button className="secondary-button" onClick={() => setMySection(null)}>Change</button></div>
      <div className="my-section-stats">
        <div><small>Overall</small><strong>{row.tied ? "=" : ""}{ordinal(row.rank)}</strong></div>
        <div><small>Points</small><strong>{row.points}</strong>{todayPoints > 0 && <span>+{todayPoints} today</span>}</div>
        <div><small>{above ? `BEHIND ${above.section.code} BY` : "Top of the table"}</small><strong>{above ? above.points - row.points : "—"}</strong></div>
        <div><small>{below ? `AHEAD OF ${below.section.code} BY` : "Bottom of the table"}</small><strong>{below ? row.points - below.points : "—"}</strong></div>
      </div>
    </section>
    {live.length > 0 && <section className="my-block"><h2 className="my-block-title"><span className="live-pulse" /> Playing now</h2><div className="my-live-grid">{live.map((fixture) => {
      const opponent = fixture.sectionA === mySection ? fixture.sectionB : fixture.sectionA;
      const mineSide = fixture.sectionA === mySection ? "a" : "b";
      return <button className="my-live-card" key={fixture.id} onClick={() => openMatch(fixture.id)}><small>{eventLabel(data, fixture.eventId).toUpperCase()} · {fixture.venue.toUpperCase()}</small><span><strong>{section.name}</strong><b>{headlineScore(data, fixture, mineSide)}</b></span><span className="opponent"><strong>{sectionName(data, opponent)}</strong><b>{headlineScore(data, fixture, mineSide === "a" ? "b" : "a")}</b></span><em>Open match center <ArrowRight size={12} /></em></button>;
    })}</div></section>}
    <div className="my-two-col">
      <section className="my-block"><div className="my-block-head"><h2 className="my-block-title">Next up</h2>{upcoming.length > 0 && <button className="secondary-button" onClick={() => downloadCalendar(data, mySection, upcoming)}><CalendarPlus size={14} aria-hidden="true" /> Add to calendar</button>}</div>
        {upcoming.length ? <ol className="my-list">{upcoming.slice(0, 6).map((fixture) => <li key={fixture.id}><span className="my-list-time"><strong>{formatTime(fixture.startsAt)}</strong><small>{formatDay(fixture.startsAt)}</small></span><span><strong>{eventLabel(data, fixture.eventId)}</strong><small>vs {sectionName(data, fixture.sectionA === mySection ? fixture.sectionB : fixture.sectionA)} · {fixture.venue}</small></span></li>)}</ol> : <p className="empty-inline">No upcoming fixtures for {section.name} yet.</p>}
      </section>
      <section className="my-block"><h2 className="my-block-title">Recent results</h2>
        {finalized.length ? <ol className="my-list">{finalized.slice(0, 6).map((fixture) => { const result = outcome(fixture); const opponent = fixture.sectionA === mySection ? fixture.sectionB : fixture.sectionA; return <li key={fixture.id}><span className={`result-chip ${result.tone}`}>{result.label}</span><span><strong>{eventLabel(data, fixture.eventId)}</strong><small>vs {sectionName(data, opponent)}{isSport(fixture) && !fixture.noResult ? ` · ${headlineScore(data, fixture, fixture.sectionA === mySection ? "a" : "b")}–${headlineScore(data, fixture, fixture.sectionA === mySection ? "b" : "a")}` : ""}</small></span><b className="my-points">+{pointsOf(fixture)}</b></li>; })}</ol> : <p className="empty-inline">No finalized results for {section.name} yet.</p>}
      </section>
    </div>
    <section className="my-block"><h2 className="my-block-title">Top performers</h2>
      {leaders.loading ? <SkeletonRows count={3} label="Loading players" /> : leaders.error ? <p className="empty-inline error-inline" role="alert">Players didn&apos;t load: {leaders.error} Pull to refresh or reopen this page.</p> : performers.length ? <div className="my-performers">{performers.map(({ board, top }) => <div key={board.id}><strong>{top!.value}</strong><small>{board.unit} · {board.sport}</small><span>{top!.name ?? `${section.code} player`}</span><em>{top!.tied ? "=" : ""}{ordinal(top!.rank)} overall</em></div>)}</div> : <p className="empty-inline">No player-attributed results for {section.name} yet.</p>}
      {!leaders.loading && !leaders.showNames && performers.length > 0 && <p className="fine-print">Sign in with your college account to see player names.</p>}
    </section>
  </div>;
}

// ---------- leaderboards ----------

export function LeaderboardsView({ data, mySection }: { data: CompetitionData; mySection: SectionId | null }) {
  const [gender, setGender] = useState<LeaderboardGender>("all");
  const [onlyMine, setOnlyMine] = useState(false);
  const { boards, showNames, loading, error } = useLeaderboards(gender);
  const filters: Array<{ id: LeaderboardGender; label: string }> = [{ id: "all", label: "All events" }, { id: "men", label: "Men's" }, { id: "women", label: "Women's" }];
  return <div className="view-content">
    <div className="page-title-row"><div><p className="eyebrow">Players <span>·</span> Finalized results</p><h1>Top performers</h1><p className="subtitle">Individual totals from finalized matches where the scorer recorded the player.</p></div></div>
    <div className="pill-row" role="group" aria-label="Filter leaderboards">
      {filters.map((filter) => <button key={filter.id} type="button" className="pill" aria-pressed={gender === filter.id} onClick={() => setGender(filter.id)}>{filter.label}</button>)}
      {mySection && <button type="button" className="pill" aria-pressed={onlyMine} onClick={() => setOnlyMine((value) => !value)}>{sectionName(data, mySection)} only</button>}
    </div>
    {error && <p className="empty-inline">{error}</p>}
    <div className="leader-grid" aria-busy={loading}>{(loading && !boards.length ? [] : boards).map((board) => {
      const rows = (onlyMine && mySection ? board.rows.filter((item) => item.sectionId === mySection) : board.rows).slice(0, 10);
      return <section className="leader-card" key={board.id}><div className="leader-card-head"><h2>{board.title}</h2><span>{board.sport}</span></div>
        {rows.length ? <ol className="leader-list">{rows.map((item, position) => { const section = sectionOf(data, item.sectionId); return <li key={`${item.sectionId}-${position}`}><span className={item.rank === 1 ? "leader-rank first" : "leader-rank"}>{item.tied ? "=" : ""}{item.rank}</span><span className="leader-name"><strong>{item.name ?? `${section?.name ?? "Division"} player`}</strong><small><DivChip section={section} />{section?.name ?? "—"} · {item.detail}</small></span><b>{item.value}</b></li>; })}</ol> : <p className="empty-inline">No player-attributed results yet.</p>}
      </section>;
    })}{loading && !boards.length && [0, 1, 2].map((key) => <section className="leader-card" key={key} aria-hidden="true"><SkeletonRows count={5} /></section>)}</div>
    <p className="fine-print">Team-only scoring actions (no player picked) don&apos;t count, so these boards are only as complete as the scorers&apos; player selection. {showNames ? "Student IDs are never shown." : "Sign in with your college account to see player names."}</p>
  </div>;
}

// ---------- points race ----------

/** A round axis: about four steps of 1, 2, 2.5 or 5 × a power of ten, covering `value`. */
function niceAxis(value: number): { max: number; ticks: number[] } {
  const target = Math.max(value, 1) / 4;
  const magnitude = 10 ** Math.floor(Math.log10(target));
  const step = [1, 2, 2.5, 5, 10].map((factor) => factor * magnitude).find((candidate) => candidate >= target) ?? 10 * magnitude;
  const max = Math.max(step, Math.ceil(value / step) * step);
  const ticks: number[] = [];
  for (let tick = 0; tick <= max + step / 2; tick += step) ticks.push(Math.round(tick * 100) / 100);
  return { max, ticks };
}

export function PointsRaceChart({ data, board }: { data: CompetitionData; board: RaceBoard }) {
  const race = useMemo(() => buildPointsRace(data, board), [data, board]);
  const [view, setView] = useState<"chart" | "table">("chart");
  const [hover, setHover] = useState<number | null>(null);
  const plotRef = useRef<HTMLDivElement>(null);
  const series = race.series.map((item) => ({ ...item, section: sectionOf(data, item.sectionId) }));
  const days = race.days;
  const title = board === "overall" ? "Overall" : board === "sports" ? "Combined sports" : "Combined cultural";
  if (!days.length) return <section className="race-card"><div className="race-head"><div><p className="eyebrow">Points race <span>·</span> {title.toUpperCase()}</p><h2>How the race has moved</h2></div></div><p className="empty-inline">The race appears once results on this board are finalized.</p></section>;

  const { max, ticks } = niceAxis(Math.max(...series.flatMap((item) => item.values)));
  const last = days.length - 1;
  const x = (index: number) => (last === 0 ? 50 : (index / last) * 100);
  const y = (value: number) => (1 - value / max) * 100;
  const labelEvery = Math.max(1, Math.ceil(days.length / 8));
  // Direct end labels, nudged apart so close finishes do not overlap.
  const endLabels = series.map((item) => ({ item, top: y(item.values[last] ?? 0) })).sort((a, b) => a.top - b.top);
  const LABEL_GAP = 7;
  for (let index = 1; index < endLabels.length; index += 1) endLabels[index].top = Math.max(endLabels[index].top, endLabels[index - 1].top + LABEL_GAP);
  // Pull the stack back up if it ran past the bottom of the plot.
  for (let index = endLabels.length - 1; index >= 0; index -= 1) endLabels[index].top = Math.min(endLabels[index].top, index === endLabels.length - 1 ? 100 : endLabels[index + 1].top - LABEL_GAP);
  const active = hover ?? null;
  const pick = (clientX: number) => {
    const rect = plotRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    setHover(Math.max(0, Math.min(last, Math.round(((clientX - rect.left) / rect.width) * last))));
  };
  const onKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowRight") { event.preventDefault(); setHover((value) => Math.min(last, (value ?? -1) + 1)); }
    if (event.key === "ArrowLeft") { event.preventDefault(); setHover((value) => Math.max(0, (value ?? last + 1) - 1)); }
    if (event.key === "Escape") setHover(null);
  };
  const tipRows = active === null ? [] : [...series].sort((a, b) => b.values[active] - a.values[active]);

  return <section className="race-card">
    <div className="race-head">
      <div><p className="eyebrow">Points race <span>·</span> {title.toUpperCase()}</p><h2>How the race has moved</h2></div>
      <div className="segmented" role="group" aria-label="Points race view"><button type="button" aria-pressed={view === "chart"} onClick={() => setView("chart")}>Chart</button><button type="button" aria-pressed={view === "table"} onClick={() => setView("table")}>Table</button></div>
    </div>
    <div className="race-legend" aria-label="Legend">{series.map((item) => <span key={item.sectionId}><DivChip section={item.section} />{item.section?.name ?? item.sectionId}</span>)}</div>
    {view === "chart" ? <div className="race-plot-wrap">
      <div className="race-plot" ref={plotRef}>
        {ticks.map((tick) => <div className="race-grid" key={tick} style={{ top: `${y(tick)}%` }}><span>{tick}</span></div>)}
        {days.map((day, index) => index % labelEvery === 0 || index === last ? <span className="race-x" key={day} style={{ left: `${x(index)}%` }}>{formatDayShort(day)}</span> : null)}
        <svg viewBox="0 0 1000 400" preserveAspectRatio="none" role="img" aria-label={`Cumulative ${title.toLowerCase()} points by day for each section`}>
          {series.map((item) => <polyline key={item.sectionId} points={item.values.map((value, index) => `${x(index) * 10},${y(value) * 4}`).join(" ")} fill="none" style={{ stroke: lineColor(item.section) }} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />)}
        </svg>
        {endLabels.map(({ item, top }) => <span className="race-end" key={item.sectionId} style={{ top: `${top}%` }}><i style={{ background: lineColor(item.section) }} /><strong>{item.values[last]}</strong>{item.section?.code}</span>)}
        {active !== null && <>
          <div className="race-crosshair" style={{ left: `${x(active)}%` }} />
          {series.map((item) => <i className="race-marker" key={item.sectionId} style={{ left: `${x(active)}%`, top: `${y(item.values[active])}%`, background: lineColor(item.section) }} />)}
          <div className="race-tip" style={{ left: `${x(active)}%`, transform: active > last / 2 ? "translateX(calc(-100% - 12px))" : "translateX(12px)" }}>
            <small>{formatDayKey(days[active]).toUpperCase()}</small>
            {tipRows.map((item) => <span key={item.sectionId}><DivChip section={item.section} />{item.section?.name}<strong>{item.values[active]}</strong><em>{active > 0 ? `+${item.values[active] - item.values[active - 1]}` : ""}</em></span>)}
          </div>
        </>}
        <div className="race-hit" tabIndex={0} role="slider" aria-label="Day" aria-valuemin={1} aria-valuemax={days.length} aria-valuenow={(active ?? last) + 1} aria-valuetext={formatDayKey(days[active ?? last])}
          onPointerMove={(event: PointerEvent<HTMLDivElement>) => pick(event.clientX)} onPointerDown={(event: PointerEvent<HTMLDivElement>) => pick(event.clientX)} onPointerLeave={() => setHover(null)} onKeyDown={onKey} onBlur={() => setHover(null)} />
      </div>
    </div> : <div className="standings-table-wrap race-table"><table className="standings-table"><caption className="sr-only">Cumulative points at the end of each day</caption><thead><tr><th scope="col">Day</th>{series.map((item) => <th scope="col" key={item.sectionId}>{item.section?.name}</th>)}</tr></thead><tbody>{days.map((day, index) => <tr key={day}><th scope="row">{formatDayKey(day)}</th>{series.map((item) => <td key={item.sectionId}>{item.values[index]}</td>)}</tr>)}</tbody></table></div>}
    <p className="fine-print">Finalized results only, counted on the day they were finalized. A reopened result drops out until it is finalized again.</p>
  </section>;
}

// ---------- schedule tools ----------

export function ScheduleToolButtons({ active, onChange }: { active: "generate" | "shift" | null; onChange: (tool: "generate" | "shift" | null) => void }) {
  return <>
    <button className="secondary-button" aria-pressed={active === "generate"} onClick={() => onChange(active === "generate" ? null : "generate")}><Shuffle size={15} aria-hidden="true" /> Generate</button>
    <button className="secondary-button" aria-pressed={active === "shift"} onClick={() => onChange(active === "shift" ? null : "shift")}><Timer size={15} aria-hidden="true" /> Running late</button>
  </>;
}

function ConflictList({ conflicts }: { conflicts: Array<{ label: string; fixture?: string }> }) {
  return <ul className="tool-conflicts">{conflicts.slice(0, 8).map((conflict, index) => <li key={index}><TriangleAlert size={14} aria-hidden="true" />{conflict.fixture ? `${conflict.fixture}: ` : ""}{conflict.label}</li>)}{conflicts.length > 8 && <li>and {conflicts.length - 8} more</li>}</ul>;
}

export function FixtureGenerator({ data, refresh, toast, onClose }: { data: CompetitionData; refresh: () => Promise<void>; toast: Toast; onClose: () => void }) {
  const matchEvents = data.events.filter((event) => event.sportId !== "athletics");
  const [openedAt] = useState(() => new Date().toISOString());
  const today = istDayKey(openedAt);
  const [eventId, setEventId] = useState(matchEvents[0]?.id ?? "");
  const entered = (id: string) => data.sections.filter((section) => data.entries.some((entry) => entry.eventId === id && entry.sectionId === section.id && entry.status === "submitted")).map((section) => section.id);
  const [sectionIds, setSectionIds] = useState<SectionId[]>(() => { const list = entered(matchEvents[0]?.id ?? ""); return list.length >= 2 ? list : data.sections.map((section) => section.id); });
  const [startDay, setStartDay] = useState(today);
  const [endDay, setEndDay] = useState(addDays(today, 2));
  const [windowStart, setWindowStart] = useState("16:00");
  const [windowEnd, setWindowEnd] = useState("20:00");
  const [slotMinutes, setSlotMinutes] = useState(60);
  const [group, setGroup] = useState<"" | "1" | "2">("");
  const [venues, setVenues] = useState("");
  const [rest, setRest] = useState(true);
  const [busy, setBusy] = useState(false);
  const [conflicts, setConflicts] = useState<Array<{ label: string; fixture?: string }> | null>(null);
  const venueList = venues.split(",").map((venue) => venue.trim()).filter(Boolean);
  const ready = Boolean(eventId) && sectionIds.length >= 2 && venueList.length > 0 && slotMinutes >= 5 && startDay <= endDay && windowStart < windowEnd;
  const plan = useMemo(() => ready ? planRoundRobin(data.fixtures, { eventId, sectionIds, startDay, endDay, windowStart, windowEnd, slotMinutes, venues: venueList, restBetweenMatches: rest, earliestStart: openedAt }) : null,
    // `venueList` is derived from `venues`, which is the dependency listed here.
    [ready, data.fixtures, eventId, sectionIds, startDay, endDay, windowStart, windowEnd, slotMinutes, venues, rest, openedAt]);
  const existingForEvent = data.fixtures.filter((fixture) => fixture.eventId === eventId).length;
  const placed = plan?.fixtures.filter((fixture) => fixture.startsAt) ?? [];
  const knownVenues = [...new Set(data.fixtures.map((fixture) => fixture.venue).filter(Boolean))];

  function chooseEvent(id: string) {
    setEventId(id); setConflicts(null);
    const list = entered(id);
    setSectionIds(list.length >= 2 ? list : data.sections.map((section) => section.id));
    const eventVenues = [...new Set(data.fixtures.filter((fixture) => fixture.eventId === id).map((fixture) => fixture.venue))];
    if (eventVenues.length) setVenues(eventVenues.join(", "));
  }
  async function publish(acknowledgeConflict = false) {
    if (!placed.length) return;
    setBusy(true);
    try {
      await request("/api/fixtures/bulk", "POST", { eventId, acknowledgeConflict, ...(group ? { group: Number(group) } : {}), fixtures: placed.map((fixture) => ({ sectionA: fixture.sectionA, sectionB: fixture.sectionB, startsAt: fixture.startsAt, durationMinutes: fixture.durationMinutes, venue: fixture.venue })) });
      await refresh(); onClose();
      toast(`${placed.length} fixtures added to the schedule.`);
    } catch (error) {
      if (error instanceof RequestError && error.status === 409) setConflicts((error.payload.conflicts as Array<{ label: string; fixture?: string }>) ?? []);
      else toast(error instanceof Error ? error.message : "The fixtures could not be published.", true);
    } finally { setBusy(false); }
  }

  return <section className="tool-panel" aria-labelledby="generator-title">
    <div className="create-fixture-title"><div><p className="eyebrow">Scheduling desk <span>·</span> Round robin</p><h2 id="generator-title">Generate fixtures</h2></div><button type="button" className="icon-button" aria-label="Close" onClick={onClose}><X size={18} /></button></div>
    <div className="tool-layout">
      <div className="tool-form">
        <label>Event<select value={eventId} onChange={(event) => chooseEvent(event.target.value)}>{matchEvents.map((event) => <option key={event.id} value={event.id}>{eventLabel(data, event.id)}</option>)}</select></label>
        <fieldset><legend>Divisions</legend><div className="tool-checks">{data.sections.map((section) => <label key={section.id}><input type="checkbox" checked={sectionIds.includes(section.id)} onChange={(event) => { setConflicts(null); setSectionIds((current) => event.target.checked ? data.sections.map((item) => item.id).filter((id) => id === section.id || current.includes(id)) : current.filter((id) => id !== section.id)); }} />{section.code}</label>)}</div></fieldset>
        <div className="tool-pair"><label>From<input type="date" value={startDay} onChange={(event) => setStartDay(event.target.value)} /></label><label>To<input type="date" value={endDay} min={startDay} onChange={(event) => setEndDay(event.target.value)} /></label></div>
        <div className="tool-pair"><label>Daily start<input type="time" value={windowStart} onChange={(event) => setWindowStart(event.target.value)} /></label><label>Daily end<input type="time" value={windowEnd} onChange={(event) => setWindowEnd(event.target.value)} /></label></div>
        <label>Group · group-format events<select value={group} onChange={(event) => setGroup(event.target.value as "" | "1" | "2")}><option value="">Not a group</option><option value="1">Group 1 · team 1 of each division</option><option value="2">Group 2 · team 2 of each division</option></select></label>
        <label>Slot length (min)<input type="number" min={5} step={5} value={slotMinutes} onChange={(event) => setSlotMinutes(Number(event.target.value))} /></label>
        <label>Venues (comma-separated)<input value={venues} list="known-venues" placeholder="Court 1, Court 2" onChange={(event) => setVenues(event.target.value)} /><datalist id="known-venues">{knownVenues.map((venue) => <option key={venue} value={venue} />)}</datalist></label>
        <label className="tool-inline"><input type="checkbox" checked={rest} onChange={(event) => setRest(event.target.checked)} />Keep a free slot between a division&apos;s matches</label>
        <p className="fine-print">Matches avoid every existing fixture at the same venue and every fixture involving either division, and never start in the past.</p>
      </div>
      <div className="tool-preview">
        {!ready ? <p className="empty-inline">Choose at least two divisions, a venue, and a valid date and time window to see the plan.</p> : plan && <>
          <div className="tool-summary"><strong>{plan.fixtures.length} matches · {plan.rounds.length} rounds</strong><span>{placed.length} placed{plan.unplaced ? ` · ${plan.unplaced} don't fit, so widen the window or add a venue` : ""}</span></div>
          {existingForEvent > 0 && <p className="tool-warning"><TriangleAlert size={14} aria-hidden="true" />This event already has {existingForEvent} fixture{existingForEvent === 1 ? "" : "s"}. Generated fixtures are added alongside them.</p>}
          <div className="standings-table-wrap"><table className="standings-table tool-table"><thead><tr><th scope="col">Round</th><th scope="col">Day</th><th scope="col">Time</th><th scope="col">Venue</th><th scope="col">Match</th></tr></thead><tbody>{plan.fixtures.map((fixture, index) => <tr key={index} className={fixture.startsAt ? "" : "unplaced"}><td>R{fixture.round}{plan.rounds.find((round) => round.round === fixture.round)?.bye && index === plan.fixtures.findIndex((item) => item.round === fixture.round) ? <small> · {sectionCode(data, plan.rounds.find((round) => round.round === fixture.round)!.bye!)} rests</small> : null}</td><td>{fixture.startsAt ? formatDay(fixture.startsAt) : "—"}</td><td>{fixture.startsAt ? formatTime(fixture.startsAt) : "No slot"}</td><td>{fixture.venue ?? "—"}</td><td><strong>{sectionCode(data, fixture.sectionA)} vs {sectionCode(data, fixture.sectionB)}</strong></td></tr>)}</tbody></table></div>
          {conflicts && <div className="conflict-warning"><TriangleAlert size={17} aria-hidden="true" /><span>The schedule changed since this plan was made. These overlap now:<ConflictList conflicts={conflicts} /></span><button type="button" disabled={busy} onClick={() => void publish(true)}>Acknowledge & publish</button></div>}
          <div className="form-actions"><span>Fixtures are added as league matches.</span><button type="button" className="primary-button" disabled={busy || !placed.length} onClick={() => void publish(false)}>{busy ? "PUBLISHING…" : `PUBLISH ${placed.length} FIXTURES`}</button></div>
        </>}
      </div>
    </div>
  </section>;
}

export function FixtureShifter({ data, refresh, toast, onClose }: { data: CompetitionData; refresh: () => Promise<void>; toast: Toast; onClose: () => void }) {
  const venues = [...new Set(data.fixtures.filter((fixture) => fixture.status === "scheduled").map((fixture) => fixture.venue).filter(Boolean))].sort();
  const [venue, setVenue] = useState(venues[0] ?? "");
  const [day, setDay] = useState(() => istDayKey(new Date().toISOString()));
  const [fromTime, setFromTime] = useState(() => nowIstTime());
  const [minutes, setMinutes] = useState(30);
  const [reason, setReason] = useState("");
  const [notify, setNotify] = useState(true);
  const [busy, setBusy] = useState(false);
  const describe = useMemo(() => bookingDescriber(data), [data]);
  const moves = useMemo(() => venue && minutes ? planFixtureShift(data, { venue, day, fromTime, minutes }, describe) : [], [data, venue, day, fromTime, minutes, describe]);
  const clashCount = moves.reduce((sum, move) => sum + move.clashes.length, 0);
  const canSubmit = moves.length > 0 && (!notify || reason.trim().length > 0) && !busy;

  async function submit() {
    setBusy(true);
    try {
      const result = await request<{ moved: number }>("/api/fixtures/shift", "POST", { venue, day, fromTime, minutes, reason: reason.trim(), notify, acknowledgeConflict: clashCount > 0 });
      await refresh(); onClose();
      toast(`${result.moved} fixture${result.moved === 1 ? "" : "s"} moved${notify ? " and spectators notified" : ""}.`);
    } catch (error) {
      toast(error instanceof RequestError && error.status === 409 ? "The schedule changed while you were editing. Check the new clashes and try again." : error instanceof Error ? error.message : "The fixtures could not be moved.", true);
      if (error instanceof RequestError && error.status === 409) await refresh();
    } finally { setBusy(false); }
  }

  return <section className="tool-panel" aria-labelledby="shift-title">
    <div className="create-fixture-title"><div><p className="eyebrow">Scheduling desk <span>·</span> Delays</p><h2 id="shift-title">Shift a venue&apos;s fixtures</h2></div><button type="button" className="icon-button" aria-label="Close" onClick={onClose}><X size={18} /></button></div>
    <div className="tool-layout">
      <div className="tool-form">
        <label>Venue<select value={venue} onChange={(event) => setVenue(event.target.value)}>{venues.length ? venues.map((item) => <option key={item} value={item}>{item}</option>) : <option value="">No scheduled fixtures</option>}</select></label>
        <div className="tool-pair"><label>Day<input type="date" value={day} onChange={(event) => setDay(event.target.value)} /></label><label>From<input type="time" value={fromTime} onChange={(event) => setFromTime(event.target.value)} /></label></div>
        <fieldset><legend>Shift by (minutes)</legend><div className="tool-checks">{[15, 30, 45, 60].map((value) => <label key={value} className={minutes === value ? "selected" : ""}><input type="radio" name="shift-minutes" checked={minutes === value} onChange={() => setMinutes(value)} />+{value}</label>)}<label className="tool-custom">Other<input type="number" step={5} min={-360} max={360} value={minutes} onChange={(event) => setMinutes(Math.round(Number(event.target.value)))} aria-label="Custom shift in minutes, negative to move earlier" /></label></div></fieldset>
        <label>Reason (shown to spectators)<input value={reason} maxLength={140} placeholder="Rain delay" onChange={(event) => setReason(event.target.value)} /></label>
        <label className="tool-inline"><input type="checkbox" checked={notify} onChange={(event) => setNotify(event.target.checked)} />Show a delay notice for the rest of the day</label>
        {notify && reason.trim() && <p className="delay-notice preview"><Clock3 size={15} aria-hidden="true" /><strong>{venue} is running {Math.abs(minutes)} min {minutes > 0 ? "late" : "early"}</strong><span>{reason.trim()}</span></p>}
      </div>
      <div className="tool-preview">
        <div className="tool-summary"><strong>{moves.length} fixture{moves.length === 1 ? "" : "s"} will move</strong><span>Only scheduled fixtures move. Live and finalized ones stay put.</span></div>
        {moves.length ? <div className="standings-table-wrap"><table className="standings-table tool-table"><thead><tr><th scope="col">Match</th><th scope="col">Now</th><th scope="col">New</th><th scope="col">Check</th></tr></thead><tbody>{moves.map((move) => <tr key={move.fixture.id} className={move.clashes.length ? "clash" : ""}><td><strong>{sectionCode(data, move.fixture.sectionA)} vs {sectionCode(data, move.fixture.sectionB)}</strong><small>{eventLabel(data, move.fixture.eventId)}</small></td><td><s>{formatTime(move.fixture.startsAt)}</s></td><td><strong>{formatTime(move.newStartsAt)}</strong>{istDayKey(move.newStartsAt) !== day && <small>{formatDay(move.newStartsAt)}</small>}</td><td>{move.clashes.length ? <span className="tool-clash"><TriangleAlert size={13} aria-hidden="true" />{move.clashes.map((clash) => clash.label).join("; ")}</span> : <span className="tool-ok">OK</span>}</td></tr>)}</tbody></table></div> : <p className="empty-inline">No scheduled fixtures at {venue || "this venue"} on {formatDayKey(day)} from {fromTime}.</p>}
        <div className="form-actions"><span>{moves.length && notify && !reason.trim() ? "Add a reason to post the delay notice, or untick the notice." : clashCount ? `${clashCount} new clash${clashCount === 1 ? "" : "es"}. Shifting anyway records the acknowledgement.` : "The audit history keeps the old and new times."}</span><button type="button" className="primary-button" disabled={!canSubmit} onClick={() => void submit()}>{busy ? "MOVING…" : clashCount ? `Shift anyway (${moves.length})` : `Shift ${moves.length} ${moves.length === 1 ? "fixture" : "fixtures"}`}</button></div>
      </div>
    </div>
  </section>;
}
