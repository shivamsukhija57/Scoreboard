"use client";

import { useEffect, useRef, useState } from "react";
import { ChampionMoment, LeadBanner } from "./moments";
import { TvReveal } from "./results-reveal";
import type { CompetitionData, Fixture } from "@/lib/domain";
import { activeNotices } from "@/lib/schedule-tools";
import { DivChip, eventLabel, formatDay, formatTime, headlineScore, lineColor, sectionOf, sectionTable } from "./event-features";

/** One refresh every 20 seconds is plenty for a shared screen and keeps database reads low. */
const REFRESH_MS = 20_000;

function cricketChase(data: CompetitionData, fixture: Fixture): string | null {
  const innings = fixture.scorecard?.cricket?.innings ?? [];
  if (innings.length < 2 || innings[1].completed) return null;
  const runs = (index: number) => innings[index].deliveries.filter((delivery) => !delivery.reversedAt).reduce((sum, delivery) => sum + delivery.batRuns + delivery.extraRuns + (delivery.extraType === "wide" || delivery.extraType === "no-ball" ? 1 : 0), 0);
  const balls = innings[1].deliveries.filter((delivery) => !delivery.reversedAt && delivery.legal).length;
  const need = runs(0) + 1 - runs(1);
  if (need <= 0) return null;
  const quota = (data.events.find((event) => event.id === fixture.eventId)?.scoringConfig?.oversPerInnings ?? 0) * 6;
  const chasing = sectionOf(data, innings[1].battingSide === "a" ? fixture.sectionA : fixture.sectionB)?.code ?? "";
  return `${chasing} need ${need} ${quota ? `off ${Math.max(0, quota - balls)} balls` : "to win"}`;
}

function overs(fixture: Fixture, side: "a" | "b"): string | null {
  const innings = fixture.scorecard?.cricket?.innings.filter((item) => item.battingSide === side && item.number <= 2) ?? [];
  if (!innings.length) return null;
  const balls = innings.flatMap((item) => item.deliveries).filter((delivery) => !delivery.reversedAt && delivery.legal).length;
  return `${Math.floor(balls / 6)}.${balls % 6} ov`;
}

/** A score that settles into place when it changes, so a goal across the room is noticed. The first render is still. */
function TvScore({ value }: { value: string }) {
  const previous = useRef(value);
  const [changes, setChanges] = useState(0);
  useEffect(() => { if (previous.current !== value) { previous.current = value; setChanges((count) => count + 1); } }, [value]);
  return <strong className="tv-score"><span key={changes} className={changes ? "tv-score-changed" : undefined}>{value}</span></strong>;
}

function MatchTile({ data, fixture, feature }: { data: CompetitionData; fixture: Fixture; feature?: boolean }) {
  const a = sectionOf(data, fixture.sectionA);
  const b = sectionOf(data, fixture.sectionB);
  const chase = feature ? cricketChase(data, fixture) : null;
  return <section className={feature ? "tv-match tv-feature" : "tv-match"}>
    <div className="tv-match-head"><span>{eventLabel(data, fixture.eventId).toUpperCase()}</span><span>{fixture.venue.toUpperCase()}{fixture.periodLabel && fixture.periodLabel !== "Not started" ? ` · ${fixture.periodLabel.toUpperCase()}` : ""}</span></div>
    <div className="tv-sides">
      {[{ section: a, side: "a" as const }, { section: b, side: "b" as const }].map(({ section, side }) => <div className="tv-side" key={side}>
        <span className="tv-side-name"><DivChip section={section} size="l" />{section?.name ?? "Division"}</span>
        <TvScore value={headlineScore(data, fixture, side)} />
        {feature && overs(fixture, side) && <small>{overs(fixture, side)}</small>}
      </div>)}
    </div>
    {chase && <div className="tv-chase">{chase}</div>}
  </section>;
}

function minutesUntil(iso: string, now: Date | null) {
  if (!now) return "";
  const minutes = Math.round((new Date(iso).getTime() - now.getTime()) / 60_000);
  if (minutes <= 0) return "Starting now";
  if (minutes < 60) return `In ${minutes} min`;
  return `In ${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")} min`;
}

/**
 * The projector is never blank between matches: the next whistle with a countdown, what follows, and the latest
 * results, so the room always has something to read.
 */
function BetweenMatches({ data, upcoming, now }: { data: CompetitionData; upcoming: Fixture[]; now: Date | null }) {
  const [next, ...later] = upcoming;
  const results = data.fixtures.filter((fixture) => fixture.status === "completed" && fixture.resultConfirmed).sort((a, b) => (b.resultFinalizedAt ?? b.updatedAt).localeCompare(a.resultFinalizedAt ?? a.updatedAt)).slice(0, 3);
  const teams = (fixture: Fixture) => <span className="tv-teams"><DivChip section={sectionOf(data, fixture.sectionA)} size="l" />{sectionOf(data, fixture.sectionA)?.name} <em>v</em> <DivChip section={sectionOf(data, fixture.sectionB)} size="l" />{sectionOf(data, fixture.sectionB)?.name}</span>;
  return <section className="tv-match tv-feature tv-between-panel">
    {next ? <div className="tv-next-whistle">
      <span className="tv-kicker">Next whistle</span>
      <strong className="tv-countdown">{minutesUntil(next.startsAt, now)}</strong>
      <span className="tv-next-event">{eventLabel(data, next.eventId)} · {formatTime(next.startsAt)} · {next.venue}</span>
      {teams(next)}
    </div> : <div className="tv-next-whistle"><span className="tv-kicker">Between matches</span><strong className="tv-countdown">See you at the next one</strong></div>}
    {(later.length > 0 || results.length > 0) && <div className="tv-between-lists">
      {later.length > 0 && <div><span className="tv-kicker">After that</span><ol>{later.slice(0, 3).map((fixture) => <li key={fixture.id}><b>{formatTime(fixture.startsAt)}</b>{teams(fixture)}</li>)}</ol></div>}
      {results.length > 0 && <div><span className="tv-kicker">Latest results</span><ol>{results.map((fixture) => <li key={fixture.id}><b>{fixture.scoreA}–{fixture.scoreB}</b>{teams(fixture)}</li>)}</ol></div>}
    </div>}
  </section>;
}

export default function TvBoard({ initialData }: { initialData: CompetitionData }) {
  const [data, setData] = useState(initialData);
  const [stale, setStale] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [now, setNow] = useState<Date | null>(null);
  const [host, setHost] = useState("");

  useEffect(() => {
    setNow(new Date());
    setHost(window.location.host);
    const clock = window.setInterval(() => setNow(new Date()), 15_000);
    const refresh = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const response = await fetch("/api/competition", { cache: "no-store" });
        if (!response.ok) throw new Error(String(response.status));
        const payload = (await response.json()) as { data: CompetitionData };
        setData(payload.data); setStale(false); setLastUpdate(new Date());
      } catch { setStale(true); }
    };
    const timer = window.setInterval(refresh, REFRESH_MS);
    const onVisible = () => { if (document.visibilityState === "visible") void refresh(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { window.clearInterval(clock); window.clearInterval(timer); document.removeEventListener("visibilitychange", onVisible); };
  }, []);

  const live = data.fixtures.filter((fixture) => fixture.status === "live").sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const upcoming = data.fixtures.filter((fixture) => fixture.status === "scheduled" && (!now || new Date(fixture.startsAt).getTime() + fixture.durationMinutes * 60_000 > now.getTime())).sort((a, b) => a.startsAt.localeCompare(b.startsAt)).slice(0, 4);
  const table = sectionTable(data);
  const top = Math.max(1, table[0]?.points ?? 0);
  const notices = now ? activeNotices(data, now) : [];
  const [feature, ...others] = live;

  return <main className="tv-shell">
    <header className="tv-header">
      <div className="tv-brand"><span className="wordmark-icon">DW</span><span>DIVISION <b>WARS</b></span></div>
      <div className="tv-status">
        {stale ? <span className="tv-stale">Paused · last updated {lastUpdate ? formatTime(lastUpdate.toISOString()) : "earlier"}</span> : live.length ? <span className="tv-live"><i />{live.length} LIVE</span> : <span className="tv-between">BETWEEN MATCHES</span>}
        <span className="tv-clock">{now ? formatTime(now.toISOString()) : ""}</span>
      </div>
    </header>
    {notices.length > 0 && <div className="tv-notices">{notices.map((notice) => <span key={notice.id}>{notice.venue} running {Math.abs(notice.minutes)} min {notice.minutes > 0 ? "late" : "early"}{notice.reason ? ` · ${notice.reason}` : ""}</span>)}</div>}
    <div className="tv-body">
      <div className="tv-left">
        {feature ? <MatchTile data={data} fixture={feature} feature /> : <BetweenMatches data={data} upcoming={upcoming} now={now} />}
        {others.length > 0 && <div className="tv-others">{others.slice(0, 2).map((fixture) => <MatchTile key={fixture.id} data={data} fixture={fixture} />)}</div>}
      </div>
      <div className="tv-right">
        <section className="tv-table">
          <div className="tv-table-head"><h2>Overall points</h2></div>
          <ol>{table.map((row) => <li key={row.section.id}>
            <span className="tv-rank">{row.tied ? "=" : ""}{row.rank}</span>
            <span className="tv-bar-wrap"><span className="tv-bar-name"><DivChip section={row.section} size="l" />{row.section.name.toUpperCase()}</span><span className="tv-bar"><i style={{ transform: `scaleX(${row.points / top})`, background: lineColor(row.section) }} /></span></span>
            <strong>{row.points}</strong>
          </li>)}</ol>
        </section>
        <section className="tv-follow"><strong>Follow every match on your phone</strong><span>{host}</span></section>
      </div>
    </div>
    <LeadBanner data={data} mode="tv" />
    {/* On the big screen the champion stays up once announced; the room watches it together. */}
    {/* A judged Stage event announced while the board is open: the room watches the reveal, then it clears. */}
    {!data.champion && <TvReveal data={data} />}
    {data.champion && <ChampionMoment key={data.champion.announcedAt} data={data} mode="tv" />}
    <footer className="tv-next"><span className="tv-next-label">UP NEXT</span><span className="tv-next-list">{upcoming.length ? upcoming.map((fixture) => `${formatTime(fixture.startsAt)}${now && formatDay(fixture.startsAt) !== formatDay(now.toISOString()) ? ` ${formatDay(fixture.startsAt)}` : ""} · ${eventLabel(data, fixture.eventId)} · ${sectionOf(data, fixture.sectionA)?.code} vs ${sectionOf(data, fixture.sectionB)?.code} · ${fixture.venue}`).join("   /   ") : "No more fixtures scheduled"}</span></footer>
  </main>;
}
