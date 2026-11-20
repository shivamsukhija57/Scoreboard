"use client";

import {
  Activity, ArrowRight, Bell, CalendarDays, Check, ClipboardList,
  ChevronDown, ChevronLeft, ChevronRight, CircleHelp, Clock3, Crown, Filter,
  Flag, Gauge, LayoutDashboard, LockKeyhole, Medal, MoreHorizontal, Plus,
  Radio, Search, Settings2, Shield, SlidersHorizontal, Sparkles, Star, Trophy, Users,
  Tv, Volleyball, X, Dices, LayoutGrid, Gavel, FileSpreadsheet,
} from "lucide-react";
import ThemeToggle from "./theme-toggle";
import { InlineConfirm } from "./inline-confirm";
import { HuntPad, QuizPad, TallyLiveCard } from "./tally-pads";
import { JudgingView, ResultsDesk, SealedResultsNote } from "./judging";
import { RevealHost } from "./results-reveal";
import { DivChip, DivIcon, DivisionKey, eventLabel, FixtureGenerator, FixtureShifter, LeaderboardsView, lineColor, MySectionStrip, MySectionView, NoticeBanner, PointsRaceChart, ScheduleToolButtons, sectionOf, useMySection } from "./event-features";
import type { RaceBoard } from "@/lib/leaderboards";
import { ChitDrawTool, VenueBoard, WarMapView } from "./events-and-schedule";
import { FixtureImportTool } from "./fixture-import";
import { AwayDigest, ChampionCard, ChampionMoment, LeadBanner, useChampionMoment } from "./moments";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type { AuditEntry, CompetitionData, CricketDelivery, CricketDismissal, CricketExtra, CricketInnings, EventDefinition, Fixture, MatchEventKind, MatchScoreInput, ParticipantGender, PointsFormat, Role, SectionId, UserAccess } from "@/lib/domain";
import { sportCode } from "@/lib/sport-codes";
import { canScoreEvent, finalizedFixturesForEvents, mergeCompetitionData, projectScoreAction, retryDelayMs, shouldPollFixture } from "@/lib/live-scoring-utils";
import { tallyKindFor } from "@/lib/tally";
import { isJudgedEvent } from "@/lib/judging";
import { cricketInningsLimits, cricketRunsToBeat, cricketTieState, inningsRuns } from "@/lib/match-scorecard";
import { bonusPointsFor, fixtureOutcome, outcomePointsFor, semifinalDraw, topperStatus } from "@/lib/points-rules";

type View = "overview" | "mine" | "live" | "schedule" | "standings" | "warmap" | "players" | "entries" | "events" | "access" | "audit" | "judging";
const roleNames: Record<Role, string> = {
  spectator: "Spectator",
  "section-admin": "Division admin",
  "event-head": "Event head",
  scheduler: "Scheduler",
  "central-admin": "Central admin",
  judge: "Judge",
};

async function api<T>(url: string, method = "GET", body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    // fetch only throws when the request never reached the server.
    throw new Error("Couldn't reach Division Wars. Check your connection and try again; nothing was saved.");
  }
  const result = await response.json().catch(() => ({} as { error?: string }));
  if (!response.ok) {
    if (response.status === 401) throw new Error("You've been signed out. Sign in again, then retry.");
    if (response.status >= 500) throw new Error("The server had a problem and nothing was saved. Try again in a moment.");
    throw new Error((result as { error?: string }).error ?? "That didn't go through. Try again.");
  }
  return result as T;
}

/** "in 2 h 05 min", ticking each minute; "starting now" once it's due. */
function Countdown({ to }: { to: string }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => { setNow(Date.now()); const tick = window.setInterval(() => setNow(Date.now()), 30_000); return () => window.clearInterval(tick); }, []);
  if (now === null) return <>{formatFixtureDateTime(to)}</>;
  const minutes = Math.round((new Date(to).getTime() - now) / 60_000);
  if (minutes <= 0) return <>starting now</>;
  if (minutes >= 24 * 60) return <>{formatFixtureDateTime(to)}</>;
  const hours = Math.floor(minutes / 60);
  return <>{hours ? `in ${hours} h ${String(minutes % 60).padStart(2, "0")} min` : `in ${minutes} min`}</>;
}

/** One quiet pattern for "nothing here yet": what's missing, why, and what happens next or what to do. */
function EmptyState({ title, body, action }: { title: string; body?: string; action?: { label: string; onClick: () => void } }) {
  return <div className="empty-state"><strong>{title}</strong>{body && <p>{body}</p>}{action && <button type="button" className="secondary-button" onClick={action.onClick}>{action.label}</button>}</div>;
}

function organizerNav(role: Role): Array<{ id: View; label: string; icon: typeof LayoutDashboard; group?: string }> {
  const items: Array<{ id: View; label: string; icon: typeof LayoutDashboard; group?: string }> = [];
  if (role === "section-admin" || role === "central-admin") items.push({ id: "entries", label: "Division entries", icon: Users });
  if (role === "event-head" || role === "scheduler" || role === "central-admin") items.push({ id: "events", label: "Sports & events", icon: Volleyball });
  if (role === "central-admin") items.push({ id: "access", label: "People & access", icon: Shield }, { id: "audit", label: "Scoring audit", icon: ClipboardList });
  // Judges get one page: the Stage events they mark.
  if (role === "judge") items.push({ id: "judging", label: "Judging", icon: Gavel });
  if (items[0]) items[0].group = "Organizers";
  return items;
}

export default function Dashboard({ data: initialData, access, previewMode }: { data: CompetitionData; access: UserAccess; previewMode: boolean }) {
  const [data, setData] = useState(initialData);
  const [view, setView] = useState<View>("overview");
  const [role, setRole] = useState<Role>(previewMode ? "central-admin" : access.assignments.find((item) => item.role !== "spectator")?.role ?? "spectator");
  const [notice, setNotice] = useState("");
  const [noticeError, setNoticeError] = useState(false);
  const [noticeLeaving, setNoticeLeaving] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [filterSport, setFilterSport] = useState("all");
  const [filterSection, setFilterSection] = useState("all");
  const [filterDay, setFilterDay] = useState("all");
  const [filterVenue, setFilterVenue] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [openEventId, setOpenEventId] = useState<string | null>(null);
  // Set when Live matches sends a scorer to a quiz or hunt pad on the event's Results tab.
  const [scorerEventId, setScorerEventId] = useState<string | null>(null);
  const [selectedMatchId, setSelectedMatchId] = useState(initialData.fixtures.find((item) => item.status === "live")?.id ?? initialData.fixtures[0]?.id ?? "");
  const [pendingMatches, setPendingMatches] = useState<string[]>([]);
  const pendingMatchIds = useRef(new Set<string>());
  const [connectionState, setConnectionState] = useState<"connected" | "reconnecting">("connected");
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [mySection, setMySection] = useMySection(initialData);
  const revisions = useRef(new Map(initialData.fixtures.map((fixture) => [fixture.id, fixture.updatedAt])));

  useEffect(() => {
    let failures = 0;
    let cancelled = false;
    const mergeCompetition = (incoming: CompetitionData) => setData((current) => mergeCompetitionData(current, incoming, selectedMatchId, revisions.current));
    const competitionTimer = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void api<{ data: CompetitionData }>("/api/competition").then(({ data: incoming }) => { failures = 0; setConnectionState("connected"); setLastSync(new Date()); mergeCompetition(incoming); }).catch(() => { failures += 1; setConnectionState("reconnecting"); });
    }, 30_000);
    let liveTimer = 0;
    const refreshSelected = async () => {
      const match = data.fixtures.find((item) => item.id === selectedMatchId);
      if (!match || !shouldPollFixture(match.status, document.visibilityState === "visible")) return;
      const wait = retryDelayMs(failures);
      try {
        const headers = match.updatedAt ? { "If-None-Match": `"${match.updatedAt}"` } : undefined;
        const response = await fetch(`/api/matches/${match.id}`, { headers, cache: "no-store" });
        if (response.status === 304) { failures = 0; setConnectionState("connected"); setLastSync(new Date()); return; }
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error ?? "Match refresh failed");
        const next = payload.match as Fixture;
        revisions.current.set(next.id, next.updatedAt);
        setData((current) => ({ ...current, fixtures: current.fixtures.map((fixture) => fixture.id === next.id ? next : fixture) }));
        failures = 0; setConnectionState("connected"); setLastSync(new Date());
      } catch { failures += 1; setConnectionState("reconnecting"); }
      finally { if (!cancelled) { window.clearTimeout(liveTimer); liveTimer = window.setTimeout(refreshSelected, wait); } }
    };
    const onVisible = () => { if (document.visibilityState === "visible") void refreshSelected(); };
    document.addEventListener("visibilitychange", onVisible);
    void refreshSelected();
    return () => { cancelled = true; window.clearInterval(competitionTimer); window.clearTimeout(liveTimer); document.removeEventListener("visibilitychange", onVisible); };
  }, [selectedMatchId, data.fixtures]);

  const selectedMatch = data.fixtures.find((match) => match.id === selectedMatchId) ?? data.fixtures[0];
  const navItems: Array<{ id: View; label: string; icon: typeof LayoutDashboard; group?: string }> = [
    { id: "overview", label: "Overview", icon: LayoutDashboard },
    { id: "mine", label: "My division", icon: Star },
    { id: "live", label: "Live matches", icon: Radio },
    { id: "schedule", label: "Schedule", icon: CalendarDays },
    { id: "standings", label: "Standings", icon: Trophy },
    { id: "warmap", label: "Events", icon: LayoutGrid },
    { id: "players", label: "Players", icon: Medal },
    // Organizer pages appear only for the roles that work in them; spectators and guests get the six above.
    ...organizerNav(role),
  ];
  useEffect(() => { if (!navItems.some((item) => item.id === view)) setView("overview"); }, [role]); // eslint-disable-line react-hooks/exhaustive-deps

  const shownFixtures = useMemo(() => data.fixtures.filter((fixture) => {
    const event = data.events.find((item) => item.id === fixture.eventId);
    const sport = data.sports.find((item) => item.id === event?.sportId);
    const names = `${sport?.name ?? ""} ${fixture.venue} ${sideName(data, fixture, "a")} ${sideName(data, fixture, "b")}`.toLowerCase();
    const bySport = filterSport === "all" || event?.sportId === filterSport;
    const bySection = filterSection === "all" || fixture.sectionA === filterSection || fixture.sectionB === filterSection;
    const bySearch = !search || names.includes(search.toLowerCase());
    const day = formatDayKey(fixture.startsAt);
    const byDay = filterDay === "all" || day === filterDay;
    const byVenue = filterVenue === "all" || fixture.venue === filterVenue;
    const byStatus = filterStatus === "all" || fixture.status === filterStatus;
    return bySport && bySection && bySearch && byDay && byVenue && byStatus;
  }).sort((a, b) => a.startsAt.localeCompare(b.startsAt)), [data, filterSport, filterSection, filterDay, filterVenue, filterStatus, search]);

  // A toast plays its exit before it unmounts; a new message restarts the clock instead of being cut short by the old one.
  const noticeTimers = useRef<number[]>([]);
  const clearNoticeTimers = () => { noticeTimers.current.forEach((id) => window.clearTimeout(id)); noticeTimers.current = []; };
  const dismissNotice = () => { clearNoticeTimers(); setNoticeLeaving(true); noticeTimers.current.push(window.setTimeout(() => { setNotice(""); setNoticeError(false); setNoticeLeaving(false); }, 150)); };
  const toast = (message: string, error = false) => {
    clearNoticeTimers(); setNotice(message); setNoticeError(error); setNoticeLeaving(false);
    // Errors stay until dismissed: a scorer looking at the game shouldn't miss that a save failed.
    if (!error) noticeTimers.current.push(window.setTimeout(dismissNotice, 5000));
  };
  const champion = useChampionMoment(data);
  async function refreshData() {
    const response = await api<{ data: CompetitionData }>("/api/competition");
    setData((current) => mergeCompetitionData(current, response.data, selectedMatchId, revisions.current));
  }
  async function score(match: Fixture, input: MatchScoreInput): Promise<boolean> {
    if (pendingMatchIds.current.has(match.id)) return false;
    pendingMatchIds.current.add(match.id);
    const saved = match;
    const optimistic = projectScoreAction(match, input);
    if (optimistic.scoreA !== saved.scoreA || optimistic.scoreB !== saved.scoreB) setData((current) => ({ ...current, fixtures: current.fixtures.map((fixture) => fixture.id === match.id ? optimistic : fixture) }));
    setPendingMatches((current) => [...current, match.id]);
    try {
      const response = await api<{ match: Fixture; auditEntry?: AuditEntry }>(`/api/matches/${match.id}`, "PATCH", input);
      revisions.current.set(response.match.id, response.match.updatedAt);
      setData((current) => ({ ...current, fixtures: current.fixtures.map((fixture) => fixture.id === match.id ? response.match : fixture), audit: response.auditEntry ? [response.auditEntry, ...(current.audit ?? []).filter((entry) => entry.id !== response.auditEntry!.id)] : current.audit }));
      // Point-by-point saves are confirmed by the console's own status line; a toast for each one would just be noise.
      if (input.action === "submit") toast("Result finalized and event points awarded.");
      else if (input.action === "walkover") toast("Walkover recorded and event points awarded.");
      else if (input.action === "reopen") toast("Result reopened for correction.");
      return true;
    } catch (error) {
      setData((current) => ({ ...current, fixtures: current.fixtures.map((fixture) => fixture.id === match.id ? saved : fixture) }));
      toast(error instanceof Error ? error.message : "Score update failed.", true);
      return false;
    } finally { pendingMatchIds.current.delete(match.id); setPendingMatches((current) => current.filter((id) => id !== match.id)); }
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <a className="wordmark" href="/" aria-label="Division Wars home"><span className="wordmark-icon">DW</span><span>Division <b>Wars</b></span></a>
        
        <nav aria-label="Main navigation" className="main-nav">
          {navItems.map((item) => <div key={item.id}>{item.group && <p className="nav-group">{item.group}</p>}<button className={`nav-link ${view === item.id ? "selected" : ""}`} onClick={() => setView(item.id)}><item.icon size={17} strokeWidth={1.8} /><span>{item.label}</span>{item.id === "live" && <i className="nav-live-dot" />}</button></div>)}
        </nav>
        <div className="sidebar-bottom">
          <DivisionKey data={data} mySection={mySection} setMySection={setMySection} />
          {view === "overview" && (role === "central-admin" || role === "section-admin") && <div className="division-card"><div className="division-card-head"><Flag size={14} /><span>Competition setup</span></div><strong>First year</strong><small>{data.events.length} events · {data.entries.filter((item) => item.status === "submitted").length} submitted entries</small><div className="division-streak"><span style={{ width: `${data.events.length ? Math.min(100, (data.entries.filter((item) => item.status === "submitted").length / (data.events.length * data.sections.length)) * 100) : 0}%` }} /></div><small className="rank-line">{data.sections.length} divisions <span>{data.fixtures.length} fixtures</span></small></div>}
          {(previewMode || new Set(access.assignments.map((item) => item.role).filter((item) => item !== "spectator")).size > 1) && <label className="preview-role"><span>{previewMode ? "View as" : "Your role"}</span><select value={role} onChange={(event) => setRole(event.target.value as Role)} aria-label="Active workspace">{(previewMode ? Object.entries(roleNames).map(([id, name]) => [id as Role, name] as [Role, string]) : [...new Set(access.assignments.map((item) => item.role))].map((item) => [item, roleNames[item]] as [Role, string])).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>}
          <div className="profile-row"><span className="avatar">{initials(access.name)}</span><span className="profile-copy"><strong>{access.name}</strong><small>{roleNames[role]}</small></span></div>
        </div>
      </aside>

      <section className="main-column">
        {/* Phones: a 56px bar replaces the sidebar, crumb and banners; everything else lives in the menu sheet. */}
        <PhoneBar data={data} mySection={mySection} title={view === "overview" ? "Division Wars" : navItems.find((item) => item.id === view)?.label ?? "Division Wars"} openMenu={() => setSheetOpen(true)} />
        <header className="topbar">
          <div className="crumb"><span>Division Wars</span><ChevronRight size={14} /><b>{navItems.find((item) => item.id === view)?.label}</b></div>
          <div className="topbar-actions"><ThemeToggle />{access.email === "guest@public.invalid" && <a className="google-sign-in-link" href="/login">Google sign-in <ArrowRight size={13} /></a>}<label className="search-box"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search matches, sports…" aria-label="Search matches and sports" /></label><span className="topbar-avatar">{initials(access.name)}</span></div>
        </header>
        {previewMode && <div className="preview-banner"><Sparkles size={14} /><span>Demo access</span><p>Demo access is on. You're seeing this workspace's data.</p></div>}
        <LeadBanner data={data} mode="app" />
        {champion.open && <ChampionMoment data={data} mode="app" onClose={champion.close} />}
        {!champion.open && <RevealHost data={data} staff={role !== "spectator"} />}
        {notice && <div className={`toast ${noticeError ? "toast-error" : ""} ${noticeLeaving ? "leaving" : ""}`} role="status"><span>{noticeError ? <X size={16} /> : <Check size={16} />}</span>{notice}<button onClick={dismissNotice} aria-label="Dismiss message"><X size={15} /></button></div>}

        {view === "overview" && <Overview data={data} setView={setView} setSelectedMatchId={setSelectedMatchId} mySection={mySection} setMySection={setMySection} replayChampion={champion.replay} role={role} />}
        {view === "mine" && <MySectionView data={data} mySection={mySection} setMySection={setMySection} openMatch={(id) => { setSelectedMatchId(id); setView("live"); }} />}
        {view === "players" && <LeaderboardsView data={data} mySection={mySection} />}
        {view === "live" && <LiveView data={data} role={role} access={access} lastSync={lastSync} selectedMatch={selectedMatch} setSelectedMatchId={setSelectedMatchId} score={score} pending={pendingMatches.includes(selectedMatch?.id ?? "")} connectionState={connectionState} openTally={(id) => { setScorerEventId(id); setView("events"); window.scrollTo(0, 0); }} />}
        {view === "schedule" && <ScheduleView data={data} fixtures={shownFixtures} role={role} filterSport={filterSport} setFilterSport={setFilterSport} filterSection={filterSection} setFilterSection={setFilterSection} filterDay={filterDay} setFilterDay={setFilterDay} filterVenue={filterVenue} setFilterVenue={setFilterVenue} filterStatus={filterStatus} setFilterStatus={setFilterStatus} refresh={refreshData} toast={toast} />}
        {view === "warmap" && <WarMapView data={data} eventId={openEventId} setEventId={setOpenEventId} />}
        {view === "standings" && <StandingsView data={data} role={role} refresh={refreshData} toast={toast} />}
        {view === "audit" && role === "central-admin" && <AuditView data={data} score={score} openFixture={(id) => { setSelectedMatchId(id); setView("live"); }} />}
        {view === "entries" && <EntriesView data={data} role={role} access={access} refresh={refreshData} toast={toast} />}
        {view === "events" && <EventsView key={scorerEventId ?? "events"} initialEventId={scorerEventId} data={data} role={role} access={access} refresh={refreshData} toast={toast} openEventPage={(id) => { setOpenEventId(id); setView("warmap"); window.scrollTo(0, 0); }} />}
        {view === "access" && <AccessView data={data} role={role} refresh={refreshData} toast={toast} />}
        {view === "judging" && role === "judge" && <JudgingView data={data} access={access} previewMode={previewMode} refresh={refreshData} toast={toast} />}
      </section>
      <PhoneTabs view={view} setView={setView} openMenu={() => setSheetOpen(true)} />
      {sheetOpen && <PhoneSheet data={data} mySection={mySection} setMySection={setMySection} items={navItems} view={view} go={(next) => { setView(next); setSheetOpen(false); }} close={() => setSheetOpen(false)} role={role} setRole={setRole} access={access} previewMode={previewMode} />}
    </main>
  );
}

function Overview({ data, setView, setSelectedMatchId, mySection, setMySection, replayChampion, role }: { data: CompetitionData; setView: (view: View) => void; setSelectedMatchId: (id: string) => void; mySection: SectionId | null; setMySection: (id: SectionId | null) => void; replayChampion: () => void; role: Role }) {
  const live = data.fixtures.filter((item) => item.status === "live");
  const upcoming = [...data.fixtures].filter((item) => item.status === "scheduled").sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const finalized = data.fixtures.filter((match) => match.status === "completed" && match.resultConfirmed);
  const inCategory = (eventId: string, category?: "sport" | "cultural") => {
    const event = data.events.find((item) => item.id === eventId);
    return !!event && (!category || data.sports.find((item) => item.id === event.sportId)?.category === category);
  };
  const award = (sectionId: SectionId, category?: "sport" | "cultural") => finalized.reduce((sum, match) => {
    if (!inCategory(match.eventId, category)) return sum;
    return sum + (match.sectionA === sectionId ? match.awardedPointsA ?? 0 : match.sectionB === sectionId ? match.awardedPointsB ?? 0 : 0);
  }, bonusPointsFor(data, sectionId, (eventId) => inCategory(eventId, category)));
  const points = data.sections.map((section) => award(section.id));
  const rankedSections = [...data.sections].sort((a,b) => award(b.id)-award(a.id));
  const leader = rankedSections[0];
  return <div className="view-content">
    <NoticeBanner data={data} />
    {role === "central-admin" && <SetupChecklist data={data} go={setView} />}
    <ChampionCard data={data} onReplay={replayChampion} />
    <AwayDigest data={data} openStandings={() => setView("standings")} />
    <MySectionStrip data={data} mySection={mySection} setMySection={setMySection} openMine={() => setView("mine")} />
    <div className="page-title-row"><div><p className="eyebrow">{new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", weekday: "long", day: "numeric", month: "long" }).format(new Date())}</p><h1>Today</h1><p className="subtitle">{leader && award(leader.id) > 0 ? `${leader.name} lead with ${award(leader.id)} points` : "No results finalized yet"} · {live.length ? `${live.length} ${live.length === 1 ? "match" : "matches"} live` : "nothing live right now"}</p></div></div>
    <div className="pulse-strip"><div className="pulse-label"><span className="live-pulse" /> Live across campus</div><div className="pulse-stat"><strong>{live.length}</strong><span>matches live</span></div><div className="pulse-stat"><strong>{upcoming.length}</strong><span>up next</span></div><div className="pulse-stat"><strong>{data.sports.filter((sport) => sport.category === "sport").length}</strong><span>sports</span></div><div className="pulse-right">Rulebook <strong>{data.events.length} events</strong></div></div>

    <div className="overview-grid">
      <section className="live-feature">
        <div className="feature-top"><div className="feature-live"><span className="live-pulse" /> On court now</div><span className="feature-sport">{live[0] ? eventSportName(data, live[0].eventId) : "Match center"} <span>·</span> {live[0]?.venue ?? "Awaiting schedule"}</span></div>
        {live[0] ? <div className="match-feature-main"><div className="team-lockup"><TeamMark data={data} id={live[0].sectionA} /><div><strong>{sectionName(data, live[0].sectionA)}</strong></div></div><div className="scoreline"><div className="score-numbers"><strong>{live[0].scoreA}</strong><span>:</span><strong>{live[0].scoreB}</strong></div><div className="match-time"><span className="live-pill">Live</span><span>{live[0].periodLabel}</span><span className="time-separator">·</span><span>{live[0].clockLabel}</span></div></div><div className="team-lockup team-away"><TeamMark data={data} id={live[0].sectionB} /><div><strong>{sectionName(data, live[0].sectionB)}</strong></div></div></div> : <div className="empty-live"><Radio size={22} />{upcoming[0] ? <><strong>Next: {eventLabel(data, upcoming[0].eventId)}</strong><span className="empty-live-teams"><DivChip section={sectionOf(data, upcoming[0].sectionA)} size="m" />{sectionName(data, upcoming[0].sectionA)} v {sectionName(data, upcoming[0].sectionB)}<DivChip section={sectionOf(data, upcoming[0].sectionB)} size="m" /></span><span><Countdown to={upcoming[0].startsAt} /> · {upcoming[0].venue}</span></> : <><strong>Nothing live right now</strong><span>Matches appear here the moment they start. The schedule isn&apos;t published yet.</span></>}</div>}
        <div className="feature-footer"><span><Activity size={14} /> Score updates live</span><button className="text-button" onClick={() => { if (live[0]) setSelectedMatchId(live[0].id); setView("live"); }}>Open match center <ArrowRight size={14} /></button></div>
      </section>
      <section className="race-panel">
        <div className="section-heading"><div><p className="eyebrow">The division race</p><h2>Overall standings</h2></div><button className="subtle-button" onClick={() => setView("standings")}>Full board <ArrowRight size={14} /></button></div>
        <div className="ribbon-leader"><div className="leader-copy"><span className="leader-crown"><Crown size={15} /></span><div><small>Overall leader</small><strong>{leader ? leader.name : "Awaiting finalized results"}</strong></div></div><div className="leader-score"><strong>{leader ? points[data.sections.findIndex((section) => section.id === leader.id)] : 0}</strong><span>Pts</span></div><div className="leader-tick" /></div>
        {rankedSections.every((section) => award(section.id) === 0) ? <EmptyState title="No results yet" body={upcoming[0] ? `The table fills in as results are finalized. First up: ${eventLabel(data, upcoming[0].eventId)}, ${formatFixtureDate(upcoming[0].startsAt)}.` : "The table fills in as results are finalized."} /> : <div className="mini-standings">{rankedSections.map((section, index) => <div className="mini-rank" key={section.id}><span className="mini-rank-number">{rankedSections.filter((item) => award(item.id) === award(section.id)).length > 1 ? "=" : ""}{rankedSections.findIndex((item) => award(item.id) === award(section.id)) + 1}</span><DivChip section={section} /><strong>{section.name}</strong><div className="rank-track"><i style={{ width: `${Math.max(3, Math.round(award(section.id) / Math.max(1, award(rankedSections[0].id)) * 100))}%`, background: lineColor(section) }} /></div><span className="mini-points">{award(section.id)} pts</span></div>)}</div>}
        <div className="points-note"><span>Sports {leader ? award(leader.id,"sport") : 0} · Cultural {leader ? award(leader.id,"cultural") : 0} · Combined {leader ? award(leader.id) : 0}</span><button onClick={() => setView("standings")}><Settings2 size={13} /> Full breakdown</button></div>
      </section>
    </div>

    <div className="lower-grid"><section className="next-panel"><div className="section-heading"><div><p className="eyebrow">The run of show</p><h2>Next up on campus</h2></div><button className="subtle-button" onClick={() => setView("schedule")}>Full schedule <ArrowRight size={14} /></button></div><FixtureList data={data} fixtures={upcoming.slice(0, 4)} /></section><section className="sports-panel"><div className="section-heading"><div><p className="eyebrow">Event catalog</p><h2>{data.events.length} events · {data.sections.length} divisions</h2></div><button className="icon-button" aria-label="Browse all events" onClick={() => setView("events")}><ArrowRight size={17} /></button></div><div className="sport-grid">{data.events.slice(0, 8).map((event, index) => <button className="sport-chip" key={event.id} onClick={() => setView("events")}><span className={`sport-index s${index}`} aria-hidden="true" /><span>{event.name}</span><ChevronRight size={14} /></button>)}</div></section></div>
    
  </div>;
}

function LiveView({ data, role, access, lastSync, selectedMatch, setSelectedMatchId, score, pending, connectionState, openTally }: { data: CompetitionData; role: Role; access: UserAccess; lastSync: Date | null; selectedMatch?: Fixture; setSelectedMatchId: (id: string) => void; score: (match: Fixture, input: MatchScoreInput) => Promise<boolean>; pending: boolean; connectionState: "connected" | "reconnecting"; openTally?: (eventId: string) => void }) {
  const event = selectedMatch && data.events.find((item) => item.id === selectedMatch.eventId);
  // Scoring controls only where this person may score: central admins everywhere, event heads on their own events.
  const mayScore = (eventId?: string) => !!eventId && (role === "central-admin" || (role === "event-head" && canScoreEvent(access.assignments, eventId)));
  const canScore = mayScore(event?.id) && event?.sportId !== "athletics";
  const [mineOnly, setMineOnly] = useState(role === "event-head");
  const [switchOpen, setSwitchOpen] = useState(false);
  useEffect(() => setMineOnly(role === "event-head"), [role]);
  const listed = role === "event-head" && mineOnly ? data.fixtures.filter((match) => mayScore(match.eventId)) : data.fixtures;
  // Event heads arrive on their own match: the live one if there is one, otherwise their next.
  useEffect(() => {
    if (role !== "event-head" || (selectedMatch && mayScore(selectedMatch.eventId))) return;
    const mine = data.fixtures.find((match) => match.status === "live" && mayScore(match.eventId)) ?? data.fixtures.find((match) => match.status === "scheduled" && mayScore(match.eventId));
    if (mine) setSelectedMatchId(mine.id);
  }, [role]); // eslint-disable-line react-hooks/exhaustive-deps
  return <div className="view-content">
    {/* Phones: a pinned bar to change match without scrolling the list; it opens a sheet of the same matches. */}
    {selectedMatch && <div className="switch-bar"><span><small>{role === "event-head" && mineOnly ? "Your events" : "Matches"} · {listed.filter((match) => match.status === "live").length} live</small><strong>{sideName(data, selectedMatch, "a")} v {sideName(data, selectedMatch, "b")}</strong></span><button type="button" className="secondary-button" onClick={() => setSwitchOpen(true)}>Switch match</button></div>}
    {switchOpen && <div className="phone-sheet-layer" onClick={() => setSwitchOpen(false)}><div className="phone-sheet" role="dialog" aria-modal="true" aria-label="Switch match" onClick={(event) => event.stopPropagation()}><span className="sheet-grab" aria-hidden="true" /><p className="sheet-label">Switch match</p>{listed.map((match) => <button key={match.id} type="button" className={`sheet-row${match.id === selectedMatch?.id ? " on" : ""}`} onClick={() => { setSelectedMatchId(match.id); setSwitchOpen(false); window.scrollTo(0, 0); }}><span className={`status-dot ${match.status}`} /><span>{sideName(data, match, "a")} v {sideName(data, match, "b")}<small>{eventSportName(data, match.eventId)} · {match.status === "live" ? "Live" : match.status === "scheduled" ? formatTime(match.startsAt) : "Finished"}</small></span><ChevronRight size={16} /></button>)}<button type="button" className="secondary-button sheet-close" onClick={() => setSwitchOpen(false)}>Close</button></div></div>}
    <div className="page-title-row"><div><p className="eyebrow">Match center <span>·</span> {data.fixtures.filter((match) => match.status === "live").length} live</p><h1>Live matches</h1><p className="subtitle">Scores update as each point is recorded. Pick a match to follow it.</p></div><span role="status" className={`score-connection ${connectionState}`}>{connectionState === "connected" ? "● Live sync" : `● Reconnecting · showing scores from ${lastSync ? formatTime(lastSync.toISOString()) : "the last save"}`}</span></div>
    {data.events.filter((item) => tallyKindFor(item)).map((item) => <TallyLiveCard key={item.id} data={data} event={item} onOpen={openTally && mayScore(item.id) ? () => openTally(item.id) : undefined} />)}
    <div className="live-layout"><div className="match-list">{role === "event-head" && <button type="button" className="pill" aria-pressed={mineOnly} onClick={() => setMineOnly((value) => !value)}>My events only</button>}{!listed.length && <EmptyState title={mineOnly ? "None of your events are scheduled yet" : "No fixtures yet"} body={mineOnly ? "Your matches appear here as soon as the schedulers add them." : "Matches appear here once the schedule is published."} />}{listed.map((match) => <button key={match.id} className={`match-list-item ${selectedMatch?.id === match.id ? "active" : ""}`} onClick={() => setSelectedMatchId(match.id)}><div className="match-list-top"><span className={`status-dot ${match.status}`} />{match.status === "live" ? "Live now" : match.status === "scheduled" ? formatTime(match.startsAt) : fixtureStatusLabel(match.status)}<span>{eventSportName(data, match.eventId)}</span></div><div className="match-list-score"><span>{sideName(data, match, "a")}</span><strong>{matchHeadlineScore(data, match, "a")} — {matchHeadlineScore(data, match, "b")}</strong><span>{sideName(data, match, "b")}</span></div><small>{match.venue} · {match.periodLabel}</small></button>)}</div>
      <div className="selected-match">{selectedMatch ? <><div className="selected-match-head"><span className={`match-status-tag ${selectedMatch.status}`}><i />{fixtureStatusLabel(selectedMatch.status)}</span><span>{event?.name}</span></div><div className="scoreboard-large"><div className="score-side"><TeamMark data={data} id={selectedMatch.sectionA} /><strong>{matchHeadlineScore(data, selectedMatch, "a")}</strong><span className="score-side-name">{sectionName(data, selectedMatch.sectionA)}</span></div><div className="versus">{selectedMatch.status === "completed" ? <div className="clock-face final-face">Final</div> : <><span>v</span><div className="clock-face">{selectedMatch.status === "scheduled" ? "Up next" : selectedMatch.clockLabel}<small>{event?.sportId === "cricket" ? `${Math.floor((selectedMatch.scorecard?.legalBallsA ?? 0) / 6)}.${(selectedMatch.scorecard?.legalBallsA ?? 0) % 6} ov · ${Math.floor((selectedMatch.scorecard?.legalBallsB ?? 0) / 6)}.${(selectedMatch.scorecard?.legalBallsB ?? 0) % 6} ov` : selectedMatch.scorecard && ["volleyball", "throwball", "badminton", "table-tennis", "lawn-tennis", "pickleball", "squash"].includes(event?.sportId ?? "") ? `Points ${selectedMatch.scorecard.pointsA}-${selectedMatch.scorecard.pointsB} · ${selectedMatch.periodLabel}` : selectedMatch.periodLabel}</small></div></>}</div><div className="score-side"><TeamMark data={data} id={selectedMatch.sectionB} /><strong>{matchHeadlineScore(data, selectedMatch, "b")}</strong><span className="score-side-name">{sectionName(data, selectedMatch.sectionB)}</span></div></div><div className="scoreboard-meta"><span><Flag size={14} /> {selectedMatch.venue}</span><span><Clock3 size={14} /> {formatFixtureDateTime(selectedMatch.startsAt)}</span><span><Activity size={14} /> {selectedMatch.status === "live" ? "Updating live" : selectedMatch.status === "completed" ? "Result finalized" : "Fixture scheduled"}</span></div>
        {canScore ? <SportScoreConsole data={data} match={selectedMatch} event={event} score={score} pending={pending} central={role === "central-admin"} /> : <>{event?.sportId === "cricket" && <CricketReadOnlyScorecard data={data} match={selectedMatch} />}<MatchEventFeed data={data} match={selectedMatch} /><div className="read-only-note"><LockKeyhole size={16} /><span>Score entry is available to the assigned event head.</span></div></>}</> : <div className="empty-state"><Radio /><strong>No fixture selected</strong><span>Choose a match from the list.</span></div>}</div></div>
    </div>;
}

function SportScoreConsole({ data, match, event, score, pending, central }: { data: CompetitionData; match: Fixture; event?: EventDefinition; score: (match: Fixture, input: MatchScoreInput) => Promise<boolean>; pending: boolean; central?: boolean }) {
  const sport = data.sports.find((item) => item.id === event?.sportId);
  const [side, setSide] = useState<"a" | "b">("a");
  const [playerId, setPlayerId] = useState("");
  const [secondaryPlayerId, setSecondaryPlayerId] = useState("");
  const [points, setPoints] = useState(1);
  const [kind, setKind] = useState("score");
  const [detail, setDetail] = useState("");
  const [cricketExtra, setCricketExtra] = useState("wide");
  const [detailed, setDetailed] = useState(false);
  const participantIds = data.entries.filter((entry) => entry.eventId === match.eventId && entry.sectionId === (side === "a" ? match.sectionA : match.sectionB)).flatMap((entry) => entry.participantIds);
  const players = data.participants.filter((player) => participantIds.includes(player.id));
  const opponentIds = data.entries.filter((entry) => entry.eventId === match.eventId && entry.sectionId === (side === "a" ? match.sectionB : match.sectionA)).flatMap((entry) => entry.participantIds);
  const opponentPlayers = data.participants.filter((player) => opponentIds.includes(player.id));
  const sportId = sport?.id ?? "";
  const kinds = sportId === "cricket" ? [["run", "Runs"], ["extra", "Extra"], ["wicket", "Wicket"]] : sportId === "football" ? [["goal", "Goal"], ["yellow-card", "Yellow card"], ["red-card", "Red card"], ["substitution", "Substitution"]] : sportId === "basketball" ? [["basket", "Basket"], ["free-throw", "Free throw"], ["foul", "Foul"], ["substitution", "Substitution"]] : ["volleyball", "throwball", "badminton", "table-tennis", "lawn-tennis", "squash", "pickleball"].includes(sportId) ? [["rally-point", "Rally point"], ["set-point", "Set point"]] : sportId === "foosball" || sportId === "fifa" ? [["goal", "Goal"]] : [["score", "Score"]];
  useEffect(() => { setKind(kinds[0][0]); }, [sportId]);
  const quickScoringKinds = new Set(["run", "goal", "basket", "free-throw", "rally-point", "set-point", "score"]);
  const quickValues = sportId === "basketball" ? [1, 2, 3] : [1];
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (pending || match.status !== "live" || !quickScoringKinds.has(kind) || target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName))) return;
      if (!quickValues.includes(Number(event.key))) return;
      event.preventDefault();
      void score(match, { action: "record-event", event: { kind: kind as MatchEventKind, side, points: Number(event.key), playerId: playerId || undefined, label: kinds.find(([option]) => option === kind)?.[1] } });
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [kind, side, playerId, pending, match, score, sportId]);
  const playerStatEvents = (match.scorecard?.events ?? []).filter((item) => !item.reversedAt);
  const playerTotals = data.participants.filter((player) => [...participantIds, ...opponentIds].includes(player.id)).map((player) => ({ player, score: playerStatEvents.filter((item) => item.playerId === player.id).reduce((sum, item) => sum + (item.kind === "run" || item.kind === "goal" || item.kind === "basket" ? item.points : 0), 0), actions: playerStatEvents.filter((item) => item.playerId === player.id || item.secondaryPlayerId === player.id) })).filter((item) => item.actions.length > 0);
  if (sportId === "cricket") return <CricketScoreConsole data={data} match={match} event={event} score={score} pending={pending} central={central} />;
  const sideSection = (which: "a" | "b") => data.sections.find((item) => item.id === (which === "a" ? match.sectionA : match.sectionB));
  const kindLabel = kinds.find(([option]) => option === kind)?.[1];
  const pad = match.status === "live" && quickScoringKinds.has(kind);
  return <div className="scoring-console">
    <div className="console-band" aria-hidden="true"><i style={{ background: sideSection("a")?.color }} /><i style={{ background: sideSection("b")?.color }} /></div>
<div className="console-title"><div><p className="eyebrow">Live scorecard · {sport?.name ?? "Match"}</p><strong>{match.status === "scheduled" ? "Ready to start" : match.status === "live" ? "Record match event" : "Scoring closed"}</strong></div><span className="console-access"><LockKeyhole size={13} /> Assigned event only</span></div>
    {match.status === "scheduled" && <button className="score-add" disabled={pending} onClick={() => void score(match, { action: "start" })}>{pending ? "SAVING…" : "Start match"}</button>}
    {match.status === "live" && <>
      {/* Score pad: one big button per team in its own colour. One tap records the selected event for that team. */}
      <div className="score-pad" role="group" aria-label="Score pad">{(["a", "b"] as const).map((which) => <div className="score-pad-side" key={which}>
        <span className="score-pad-team"><DivChip section={sideSection(which)} size="m" />{sideName(data, match, which)}</span>
        <strong className="score-pad-score">{matchHeadlineScore(data, match, which)}</strong>
        {pad && <div className="score-pad-buttons">{quickValues.map((value) => <button key={value} type="button" className="score-pad-button" style={{ ["--team" as string]: sideSection(which)?.color }} disabled={pending} aria-label={`${kindLabel ?? "Score"} +${value} for ${sideName(data, match, which)}`} onClick={() => void score(match, { action: "record-event", event: { kind: kind as MatchEventKind, side: which, points: value, playerId: which === side ? playerId || undefined : undefined, label: kindLabel } })}>+{value}</button>)}</div>}
      </div>)}</div>
      <div className="score-kinds" role="group" aria-label="What happened">{kinds.map(([value, label]) => <button key={value} type="button" className="pill" aria-pressed={kind === value} onClick={() => setKind(value)}>{label}</button>)}</div>
      {pad && <p className="score-pad-hint">{quickValues.length > 1 ? `On a keyboard, keys ${quickValues.join("/")} add points for ${sideName(data, match, side)}.` : `On a keyboard, press 1 to add a point for ${sideName(data, match, side)}.`}</p>}
      <button type="button" className="text-button score-details-toggle" aria-expanded={detailed} onClick={() => setDetailed((value) => !value)}>{detailed ? "Hide details" : pad ? "Add player, card or substitution" : "Record with details"}</button>
      {(detailed || !pad) && <div className="scorecard-controls"><label><span>Division</span><select value={side} onChange={(e) => { setSide(e.target.value as "a" | "b"); setPlayerId(""); }}><option value="a">{sideName(data, match, "a")}</option><option value="b">{sideName(data, match, "b")}</option></select></label><label><span>Event</span><select value={kind} onChange={(e) => setKind(e.target.value)}>{kinds.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label><span>Player · optional</span><select value={playerId} onChange={(e) => setPlayerId(e.target.value)}><option value="">Team-only / unattributed</option>{players.map((player) => <option key={player.id} value={player.id}>{player.name}</option>)}</select></label><label><span>{sportId === "cricket" ? "Bowler / fielder · optional" : sportId === "football" ? "Assist / second player · optional" : "Second player · optional"}</span><select value={secondaryPlayerId} onChange={(e) => setSecondaryPlayerId(e.target.value)}><option value="">None</option>{(sportId === "cricket" ? opponentPlayers : players).map((player) => <option key={player.id} value={player.id}>{player.name}</option>)}</select></label>
      {kind === "extra" && sportId === "cricket" && <label><span>Extra type</span><select value={cricketExtra} onChange={(e) => { setCricketExtra(e.target.value); setDetail(e.target.value); setPoints(1); }}><option value="wide">Wide</option><option value="no-ball">No-ball</option><option value="bye">Bye</option><option value="leg-bye">Leg bye</option><option value="penalty">Penalty</option></select></label>}
      {kind === "run" || kind === "extra" || kind === "basket" || kind === "free-throw" || kind === "rally-point" || kind === "set-point" || kind === "goal" || kind === "score" ? <label><span>{kind === "extra" && sportId === "cricket" ? "Total runs, including the 1 run a wide or no-ball adds" : "Points"}</span><select value={points} onChange={(e) => setPoints(Number(e.target.value))}>{(kind === "basket" ? [1, 2, 3] : kind === "run" ? [0, 1, 2, 3, 4, 6] : kind === "extra" && sportId === "cricket" ? (cricketExtra === "wide" || cricketExtra === "no-ball" ? [1, 2, 3, 4, 5, 6] : [0, 1, 2, 3, 4, 6]) : [1]).map((value) => <option value={value} key={value}>{value}</option>)}</select></label> : null}
      {(kind === "wicket" || kind === "extra" || kind === "yellow-card" || kind === "red-card" || kind === "foul" || kind === "substitution") && <label className="scorecard-detail"><span>Detail</span><input value={detail} onChange={(e) => setDetail(e.target.value)} placeholder={kind === "wicket" ? "Dismissal type (optional)" : "Optional note"} /></label>}
      <button className="score-add scorecard-submit" disabled={pending} onClick={() => void score(match, { action: "record-event", event: { kind: kind as MatchEventKind, side, points: ["yellow-card", "red-card", "substitution", "foul", "wicket"].includes(kind) ? 0 : points, playerId: playerId || undefined, secondaryPlayerId: secondaryPlayerId || undefined, label: kind === "extra" && sportId === "cricket" ? `${cricketExtra === "no-ball" ? "No-ball" : cricketExtra === "leg-bye" ? "Leg bye" : cricketExtra[0].toUpperCase() + cricketExtra.slice(1)}` : kinds.find(([value]) => value === kind)?.[1], detail: kind === "extra" && sportId === "cricket" ? cricketExtra : detail || undefined } })}>{pending ? "SAVING…" : "Add to scorecard"}</button></div>}
      <div className="console-footer"><span role="status">{pending ? "Saving score…" : "Score saved · updates are live"}</span><ConfirmFinal data={data} match={match} disabled={pending} onConfirm={() => void score(match, { action: "submit" })} /></div></>}
    <WalkoverControl data={data} match={match} event={event} score={score} pending={pending} />
    {sportId === "cricket" && <p className="scoring-rule-hint">Cricket settings: {event?.scoringConfig?.oversPerInnings ?? 8} overs per innings · {event?.scoringConfig?.wicketsPerInnings ?? 10} wickets. Wides/no-balls are marked in the detail field; add the extra runs in Points.</p>}
    {playerTotals.length > 0 && <div className="scorecard-player-totals"><strong>{sportId === "cricket" ? "Batter / bowler figures" : sportId === "basketball" ? "Player points / stats" : "Player match stats"}</strong>{playerTotals.map(({ player, score: total, actions }) => <span key={player.id}>{player.name}<small>{actions.map((action) => `${action.secondaryPlayerId === player.id ? "Bowling" : "Batting"}: ${action.label ?? action.kind}${action.points ? ` ${action.points}` : ""}`).join(" · ")}</small><b>{total}</b></span>)}</div>}
    {sportId === "cricket" && <div className="scorecard-player-totals"><strong>Cricket batter & bowler card</strong>{data.participants.filter((player) => [...participantIds, ...opponentIds].includes(player.id)).map((player) => <span key={`cricket-${player.id}`}>{player.name}<small>{cricketFigure(player.id, match.scorecard?.events ?? [])}</small><b>Figures</b></span>)}</div>}
    <MatchEventFeed data={data} match={match} score={score} />
  </div>;
}

type Dismissal = Exclude<CricketDismissal, "other">;
const DISMISSALS: Array<[Dismissal, string]> = [["bowled", "Bowled"], ["caught", "Caught"], ["lbw", "LBW"], ["run-out", "Run out"], ["stumped", "Stumped"], ["hit-wicket", "Hit wicket"], ["retired-hurt", "Retired hurt"]];
const deliveryRuns = (d: CricketDelivery) => d.batRuns + d.extraRuns + (d.extraType === "wide" || d.extraType === "no-ball" ? 1 : 0);
const oversText = (balls: number) => `${Math.floor(balls / 6)}.${balls % 6}`;

/** How one ball reads in the "This over" strip: runs, 4 and 6 picked out, W for a wicket, wd/nb/b/lb for extras. */
function ballMark(d: CricketDelivery): { text: string; tone: string } {
  if (d.wicket && d.wicket.kind !== "retired-hurt") return { text: "W", tone: "w" };
  if (d.extraType === "wide") return { text: `${d.extraRuns ? d.extraRuns + 1 : ""}wd`, tone: "x" };
  if (d.extraType === "no-ball") return { text: `nb${d.batRuns + d.extraRuns ? `+${d.batRuns + d.extraRuns}` : ""}`, tone: "x" };
  if (d.extraType === "bye") return { text: `${d.extraRuns}b`, tone: "x" };
  if (d.extraType === "leg-bye") return { text: `${d.extraRuns}lb`, tone: "x" };
  if (d.extraType === "penalty") return { text: `${d.extraRuns}p`, tone: "x" };
  return { text: String(d.batRuns), tone: d.batRuns === 6 ? "six" : d.batRuns === 4 ? "four" : "" };
}

function inningsName(number: number) {
  return number === 1 ? "1st innings" : number === 2 ? "2nd innings" : number === 3 ? "Super Over · 1st innings" : "Super Over · 2nd innings";
}

/**
 * The cricket score pad: one tap per ball. Runs off the bat record a legal delivery straight away; extras ask only for
 * their runs; a wicket opens a sheet for how out, who, the fielder and the new batter. Every rule (overs, wickets, the
 * bowler change, the Super Over) is checked again by the server.
 */
function CricketScoreConsole({ data, match, event, score, pending, central }: { data: CompetitionData; match: Fixture; event?: EventDefinition; score: (match: Fixture, input: MatchScoreInput) => Promise<boolean>; pending: boolean; central?: boolean }) {
  const history = match.scorecard?.cricket?.innings ?? [];
  const innings = history.at(-1);
  const legacy = !match.scorecard?.cricket && (match.scorecard?.events.length ?? 0) > 0;
  const tie = cricketTieState(match);
  const side = (which: "a" | "b") => sectionOf(data, which === "a" ? match.sectionA : match.sectionB);
  const roster = (which: "a" | "b") => data.entries.filter((entry) => entry.eventId === match.eventId && entry.sectionId === (which === "a" ? match.sectionA : match.sectionB)).flatMap((entry) => data.participants.filter((player) => entry.participantIds.includes(player.id)));
  const playerName = (id?: string) => data.participants.find((player) => player.id === id)?.name ?? "Choose";
  const other = (which: "a" | "b") => (which === "a" ? "b" : "a");

  // Opening a new innings: 1, 2, and the Super Over's 3 and 4 when the match is level.
  const nextNumber = !innings ? 1 : innings.completed && (history.length === 1 || (history.length === 2 && tie === "level") || history.length === 3) ? history.length + 1 : 0;
  const [chosenSide, setChosenSide] = useState<"a" | "b" | null>(null);
  const setupSide: "a" | "b" = nextNumber === 2 || nextNumber === 4 ? other(history.at(-1)!.battingSide) : chosenSide ?? (nextNumber === 3 ? history[1].battingSide : "a");
  const setupBatters = roster(setupSide);
  const setupBowlers = roster(other(setupSide));
  const [setupStriker, setSetupStriker] = useState("");
  const [setupNon, setSetupNon] = useState("");
  const [setupBowler, setSetupBowler] = useState("");
  useEffect(() => { setSetupStriker(setupBatters[0]?.id ?? ""); setSetupNon(setupBatters[1]?.id ?? ""); setSetupBowler(setupBowlers[0]?.id ?? ""); }, [match.id, nextNumber, setupSide]); // eslint-disable-line react-hooks/exhaustive-deps

  const canScore = !!innings && !innings.completed && match.status === "live";
  const battingSide = innings?.battingSide ?? "a";
  const batters = roster(battingSide);
  const bowlers = roster(other(battingSide));
  const active = innings?.deliveries.filter((d) => !d.reversedAt) ?? [];
  const balls = active.filter((d) => d.legal).length;
  const runs = active.reduce((sum, d) => sum + deliveryRuns(d), 0);
  const wickets = active.filter((d) => d.wicket && d.wicket.kind !== "retired-hurt").length;
  const limits = innings ? cricketInningsLimits(event, innings) : { balls: (event?.scoringConfig?.oversPerInnings ?? 8) * 6, wickets: event?.scoringConfig?.wicketsPerInnings ?? 10 };
  const runsToBeat = innings ? cricketRunsToBeat(history, innings) : undefined;
  const dismissed = new Set(active.filter((d) => d.wicket && d.wicket.kind !== "retired-hurt").map((d) => d.wicket!.playerOutId));
  const lastOverBowler = balls > 0 && balls % 6 === 0 ? active.filter((d) => d.legal).at(-1)?.bowlerId : undefined;

  const [striker, setStriker] = useState("");
  const [nonStriker, setNonStriker] = useState("");
  const [bowler, setBowler] = useState("");
  const nextBatter = useRef("");
  useEffect(() => {
    let s = innings?.strikerId ?? ""; let n = innings?.nonStrikerId ?? "";
    // After a wicket the server leaves the dismissed batter's end empty; the new batter chosen on the wicket sheet goes there.
    if (nextBatter.current) { if (!s) s = nextBatter.current; else if (!n) n = nextBatter.current; nextBatter.current = ""; }
    setStriker(s); setNonStriker(n); setBowler(innings?.bowlerId ?? "");
  }, [match.id, innings?.number, innings?.deliveries.length, innings?.strikerId, innings?.nonStrikerId, innings?.bowlerId]);

  const [picking, setPicking] = useState<"striker" | "nonStriker" | "bowler" | null>(null);
  const [extra, setExtra] = useState<"wide" | "no-ball" | "bye" | "leg-bye" | null>(null);
  const [wicketOpen, setWicketOpen] = useState(false);
  const [how, setHow] = useState<Dismissal>("bowled");
  const [outId, setOutId] = useState("");
  const [fielder, setFielder] = useState("");
  const [runOutRuns, setRunOutRuns] = useState(0);
  const [newBatter, setNewBatter] = useState("");
  useEffect(() => { setPicking(null); setExtra(null); setWicketOpen(false); }, [match.id, innings?.number]);

  const bowlerChange = !!lastOverBowler && bowler === lastOverBowler;
  const ready = canScore && !!striker && !!nonStriker && !!bowler && !bowlerChange && !pending;
  const blocker = !canScore ? "" : !striker || !nonStriker ? "Choose the new batter before the next ball." : !bowler ? "Choose the bowler." : bowlerChange ? "New over: choose the next bowler. The same bowler can't bowl two overs in a row." : "";
  const atCrease = new Set([striker, nonStriker]);
  const available = batters.filter((player) => !dismissed.has(player.id) && !atCrease.has(player.id));

  async function deliver(fields: { batRuns?: number; extraType?: CricketExtra; extraRuns?: number; wicket?: { kind: Dismissal; playerOutId: string; fielderId?: string } }) {
    if (!innings || !ready) return false;
    return score(match, { action: "cricket-delivery", cricketDelivery: { battingSide, batterId: striker, nonStrikerId: nonStriker, bowlerId: bowler, batRuns: fields.batRuns ?? 0, extraType: fields.extraType ?? "none", extraRuns: fields.extraRuns ?? 0, wicket: fields.wicket } });
  }
  const openWicket = () => { setExtra(null); setPicking(null); setHow("bowled"); setOutId(striker); setFielder(""); setRunOutRuns(0); setNewBatter(available[0]?.id ?? ""); setWicketOpen(true); };
  const endsInnings = how !== "retired-hurt" && wickets + 1 >= limits.wickets;
  async function recordWicket() {
    const playerOutId = how === "run-out" || how === "retired-hurt" ? outId : striker;
    nextBatter.current = endsInnings ? "" : newBatter;
    const saved = await deliver({ batRuns: how === "run-out" ? runOutRuns : 0, wicket: { kind: how, playerOutId, fielderId: ["caught", "run-out", "stumped"].includes(how) && fielder ? fielder : undefined } });
    if (saved) setWicketOpen(false); else nextBatter.current = "";
  }

  useEffect(() => {
    const onKeyDown = (keyEvent: KeyboardEvent) => {
      const target = keyEvent.target;
      if (!ready || wicketOpen || extra || target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|SELECT|TEXTAREA|BUTTON)$/.test(target.tagName))) return;
      if (/^[0-46]$/.test(keyEvent.key)) { keyEvent.preventDefault(); void deliver({ batRuns: Number(keyEvent.key) }); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  // The strip shows the over in progress; between overs, the one just bowled.
  const currentOver = Math.floor(balls / 6);
  const overBalls = active.filter((d) => d.over === currentOver);
  const strip = overBalls.length || balls === 0 ? overBalls : active.filter((d) => d.over === currentOver - 1);
  const batterLine = (id: string) => { const faced = active.filter((d) => d.batterId === id); return `${faced.reduce((sum, d) => sum + d.batRuns, 0)} (${faced.filter((d) => d.extraType !== "wide").length})`; };
  const bowlerLine = (id: string) => { const bowled = active.filter((d) => d.bowlerId === id); const legal = bowled.filter((d) => d.legal).length; const conceded = bowled.reduce((sum, d) => sum + d.batRuns + (d.extraType === "wide" || d.extraType === "no-ball" ? d.extraRuns + 1 : 0), 0); const taken = bowled.filter((d) => d.wicket && ["bowled", "caught", "lbw", "stumped", "hit-wicket"].includes(d.wicket.kind)).length; return `${oversText(legal)}-${conceded}-${taken}`; };
  const need = runsToBeat !== undefined ? runsToBeat + 1 - runs : 0;
  const ballsLeft = Math.max(0, limits.balls - balls);
  const result = cricketMatchResult(data, match);
  const lastBall = innings?.deliveries.filter((d) => !d.reversedAt).at(-1);
  const pickerOptions = picking === "bowler" ? bowlers.filter((player) => player.id !== lastOverBowler) : batters.filter((player) => !dismissed.has(player.id) && player.id !== (picking === "striker" ? nonStriker : striker));

  return <div className="scoring-console cricket-console cricket-pad">
    <div className="console-band" aria-hidden="true"><i style={{ background: side("a")?.color }} /><i style={{ background: side("b")?.color }} /></div>
    <div className="console-title"><div><p className="eyebrow">Live scorecard · {event?.name ?? "Cricket"}</p><strong>{match.status === "scheduled" ? "Ready to start" : canScore ? "Ball by ball" : tie === "level" ? "Scores level: Super Over" : tie === "super-over-level" ? "Super Over level: bowl-out" : innings?.completed && nextNumber ? "Next innings" : match.status === "live" && !innings ? "Set up the innings" : "Scoring closed"}</strong></div><span className="console-access"><LockKeyhole size={13} /> Assigned event only</span></div>
    {legacy && <p className="scoring-rule-hint" role="status">This fixture has older generic cricket events without innings and player attribution. They are preserved as history. Create a fresh fixture to use detailed scoring.</p>}
    {match.status === "scheduled" && <button className="score-add" disabled={pending} onClick={() => void score(match, { action: "start" })}>{pending ? "Saving…" : "Start match"}</button>}
    {!history.length && <WalkoverControl data={data} match={match} event={event} score={score} pending={pending} />}

    {match.status === "live" && tie === "level" && <div className="cp-tie" role="status"><strong>Scores level: Super Over</strong><p>Both innings finished on {inningsRuns(history[0])}. The rulebook settles a tie with a Super Over: one over a side, two wickets. The side that batted second usually bats first. Level again after the Super Over: a bowl-out.</p></div>}
    {match.status === "live" && tie === "super-over-level" && <div className="cp-tie" role="status"><strong>Super Over level: bowl-out</strong><p>{central ? "Run the bowl-out, then record the division that won it. The scores stay as played; the winner takes the match points." : "Run the bowl-out. A central admin records the winner, then the result can be submitted."}</p>
      {central && <div className="cp-tie-actions">{(["a", "b"] as const).map((which) => <InlineConfirm key={which} label={`${sideName(data, match, which)} won the bowl-out`} disabled={pending} title={`Record ${sideName(data, match, which)} as the bowl-out winner?`} reasonLabel="Bowl-out note for the audit log" placeholder="e.g. 3 hits to 2 after five balls each" confirmLabel="Record bowl-out" onConfirm={(note) => void score(match, { action: "cricket-bowl-out", tieBreakWinner: which, reviewNote: note })} />)}</div>}
    </div>}

    {match.status === "live" && !legacy && nextNumber > 0 && <div className="cp-setup">
      <strong className="cp-setup-title">{nextNumber > 2 ? `Super Over · ${nextNumber === 3 ? "first" : "second"} innings` : `Innings ${nextNumber}`}</strong>
      {(nextNumber === 1 || nextNumber === 3) ? <div className="cp-side-pick" role="group" aria-label="Batting side">{(["a", "b"] as const).map((which) => <button key={which} type="button" className="cp-side" aria-pressed={setupSide === which} onClick={() => setChosenSide(which)}><DivChip section={side(which)} size="m" />{sideName(data, match, which)} bat</button>)}</div>
        : <p className="cp-note"><DivChip section={side(setupSide)} /> {sideName(data, match, setupSide)} bat{runsToBeatFor(history, nextNumber) !== undefined ? ` · target ${runsToBeatFor(history, nextNumber)! + 1}` : ""}</p>}
      <div className="cp-setup-fields">
        <label className="cp-field">Striker<select value={setupStriker} onChange={(change) => setSetupStriker(change.target.value)}><option value="">Choose batter</option>{setupBatters.map((player) => <option key={player.id} value={player.id}>{player.name}</option>)}</select></label>
        <label className="cp-field">Non-striker<select value={setupNon} onChange={(change) => setSetupNon(change.target.value)}><option value="">Choose batter</option>{setupBatters.filter((player) => player.id !== setupStriker).map((player) => <option key={player.id} value={player.id}>{player.name}</option>)}</select></label>
        <label className="cp-field">Opening bowler<select value={setupBowler} onChange={(change) => setSetupBowler(change.target.value)}><option value="">Choose bowler</option>{setupBowlers.map((player) => <option key={player.id} value={player.id}>{player.name}</option>)}</select></label>
      </div>
      {!setupBatters.length && <p className="cp-note">No submitted roster for {sideName(data, match, setupSide)} yet. Division admins submit rosters under Division entries.</p>}
      <button type="button" className="score-add" disabled={pending || !setupStriker || !setupNon || !setupBowler || setupStriker === setupNon} onClick={() => void score(match, { action: "cricket-start-innings", cricketInnings: { battingSide: setupSide, strikerId: setupStriker, nonStrikerId: setupNon, bowlerId: setupBowler } })}>{nextNumber > 2 ? "Start Super Over innings" : "Start innings"}</button>
    </div>}

    {canScore && innings && <>
      <div className="cp-board">
        <div className="cp-board-head"><span className="cp-batting"><DivChip section={side(battingSide)} size="m" />{sideName(data, match, battingSide)} batting</span><span className="cp-note">{inningsName(innings.number)}{runsToBeat !== undefined ? ` · target ${runsToBeat + 1}` : ""}</span></div>
        <div className="cp-score-row"><strong className="cp-score">{runs}/{wickets}</strong><span className="cp-overs"><b>{oversText(balls)}</b><small>of {limits.balls / 6} over{limits.balls === 6 ? "" : "s"}</small></span></div>
        {runsToBeat !== undefined && <p className="cp-chase">{need > 0 ? `Need ${need} from ${ballsLeft} ball${ballsLeft === 1 ? "" : "s"}${ballsLeft ? ` · required rate ${(need * 6 / ballsLeft).toFixed(1)}` : ""}` : "Target reached"}</p>}
        <div className="cp-over" aria-label="This over"><span className="cp-note">{overBalls.length || balls === 0 ? "This over" : "Last over"}</span>{strip.map((d) => { const mark = ballMark(d); return <span key={d.id} className={`cp-ball ${mark.tone}`}>{mark.text}</span>; })}{(overBalls.length > 0 || balls === 0) && strip.filter((d) => d.legal).length < 6 && <span className="cp-ball next" aria-hidden="true">·</span>}</div>
      </div>

      <div className="cp-who">
        <button type="button" className={`cp-person on-strike${picking === "striker" ? " picking" : ""}`} aria-expanded={picking === "striker"} onClick={() => setPicking((current) => current === "striker" ? null : "striker")}><small>On strike</small><strong>{striker ? playerName(striker) : "Choose batter"}</strong>{striker && <span className="cp-note">{batterLine(striker)}</span>}</button>
        <button type="button" className={`cp-person${picking === "nonStriker" ? " picking" : ""}`} aria-expanded={picking === "nonStriker"} onClick={() => setPicking((current) => current === "nonStriker" ? null : "nonStriker")}><small>Non-striker</small><strong>{nonStriker ? playerName(nonStriker) : "Choose batter"}</strong>{nonStriker && <span className="cp-note">{batterLine(nonStriker)}</span>}</button>
        <button type="button" className={`cp-person${bowlerChange ? " needs" : ""}${picking === "bowler" ? " picking" : ""}`} aria-expanded={picking === "bowler"} onClick={() => setPicking((current) => current === "bowler" ? null : "bowler")}><small>Bowling · {sectionName(data, other(battingSide) === "a" ? match.sectionA : match.sectionB)}</small><strong>{bowlerChange ? "Choose next bowler" : bowler ? playerName(bowler) : "Choose bowler"}</strong>{bowler && !bowlerChange && <span className="cp-note">{bowlerLine(bowler)}</span>}</button>
        <button type="button" className="cp-swap" disabled={!striker || !nonStriker} onClick={() => { setStriker(nonStriker); setNonStriker(striker); }}>Swap strike</button>
      </div>
      {picking && <div className="cp-picker" role="listbox" aria-label={picking === "bowler" ? "Choose the bowler" : picking === "striker" ? "Choose the striker" : "Choose the non-striker"}>
        {pickerOptions.map((player) => <button key={player.id} type="button" role="option" aria-selected={(picking === "bowler" ? bowler : picking === "striker" ? striker : nonStriker) === player.id} onClick={() => { if (picking === "bowler") setBowler(player.id); else if (picking === "striker") setStriker(player.id); else setNonStriker(player.id); setPicking(null); }}>{player.name}<small>{picking === "bowler" ? bowlerLine(player.id) : batterLine(player.id)}</small></button>)}
        {!pickerOptions.length && <p className="cp-note">No one else is available.</p>}
        <button type="button" className="secondary-button" onClick={() => setPicking(null)}>Close</button>
      </div>}
      {blocker && <p className="cp-blocker" role="status">{blocker}</p>}

      {!wicketOpen && !extra && <>
        <div className="cp-runpad" role="group" aria-label="Runs off the bat">{[0, 1, 2, 3, 4, 6].map((value) => <button key={value} type="button" className={value >= 4 ? "boundary" : ""} disabled={!ready} aria-label={`${value} run${value === 1 ? "" : "s"}`} onClick={() => void deliver({ batRuns: value })}>{value}</button>)}</div>
        <div className="cp-extras" role="group" aria-label="Extras and wickets">{([["wide", "Wide"], ["no-ball", "No-ball"], ["bye", "Bye"], ["leg-bye", "Leg-bye"]] as const).map(([value, label]) => <button key={value} type="button" disabled={!ready} onClick={() => { setPicking(null); setExtra(value); }}>{label}</button>)}<button type="button" className="cp-wicket" disabled={!ready} onClick={openWicket}>Wicket</button></div>
      </>}

      {extra && <div className="cp-step" role="group" aria-label={`${extra} runs`}>
        <strong>{extra === "wide" ? "Wide · 1 run added. Any more runs?" : extra === "no-ball" ? "No-ball: 1 run is added. How many runs off the bat?" : extra === "bye" ? "Byes · how many run?" : "Leg-byes · how many run?"}</strong>
        <div className="cp-step-runs">{(extra === "wide" ? [0, 1, 2, 3, 4] : extra === "no-ball" ? [0, 1, 2, 3, 4, 6] : [1, 2, 3, 4]).map((value) => <button key={value} type="button" disabled={!ready} onClick={() => void deliver(extra === "no-ball" ? { extraType: "no-ball", batRuns: value } : { extraType: extra, extraRuns: value }).then((ok) => { if (ok) setExtra(null); })}>{extra === "wide" ? (value ? `wd +${value}` : "wd") : extra === "no-ball" ? (value ? `nb +${value}` : "nb") : value}</button>)}</div>
        <button type="button" className="secondary-button" onClick={() => setExtra(null)}>Cancel</button>
      </div>}

      {wicketOpen && <div className="cp-sheet" role="group" aria-label="Record a wicket">
        <strong className="cp-sheet-title">Wicket</strong>
        <span className="cp-field-label">How out</span>
        <div className="cp-chips" role="group" aria-label="How out">{DISMISSALS.map(([value, label]) => <button key={value} type="button" aria-pressed={how === value} onClick={() => { setHow(value); if (value !== "run-out" && value !== "retired-hurt") setOutId(striker); }}>{label}</button>)}</div>
        {(how === "run-out" || how === "retired-hurt") && <><span className="cp-field-label">Who&apos;s out</span><div className="cp-chips" role="group" aria-label="Who's out">{[striker, nonStriker].map((id) => <button key={id} type="button" aria-pressed={outId === id} onClick={() => setOutId(id)}>{playerName(id)}{id === striker ? " · striker" : ""}</button>)}</div></>}
        {how !== "run-out" && how !== "retired-hurt" && <p className="cp-note">Out: {playerName(striker)} (on strike)</p>}
        {["caught", "run-out", "stumped"].includes(how) && <label className="cp-field">{how === "caught" ? "Caught by" : how === "stumped" ? "Stumped by" : "Run out by"} · optional<select value={fielder} onChange={(change) => setFielder(change.target.value)}><option value="">Not recorded</option>{bowlers.map((player) => <option key={player.id} value={player.id}>{player.name}</option>)}</select></label>}
        {how === "run-out" && <><span className="cp-field-label">Runs completed before the run out</span><div className="cp-chips" role="group" aria-label="Runs completed">{[0, 1, 2, 3].map((value) => <button key={value} type="button" aria-pressed={runOutRuns === value} onClick={() => setRunOutRuns(value)}>{value}</button>)}</div></>}
        {endsInnings ? <p className="cp-note">This is wicket {wickets + 1} of {limits.wickets}: it ends the innings.</p>
          : <label className="cp-field">New batter<select value={newBatter} onChange={(change) => setNewBatter(change.target.value)}><option value="">Choose later</option>{available.map((player) => <option key={player.id} value={player.id}>{player.name}</option>)}</select></label>}
        <div className="cp-sheet-actions"><button type="button" className="secondary-button" onClick={() => setWicketOpen(false)}>Cancel</button><button type="button" className="confirm-button danger-fill" disabled={!ready || ((how === "run-out" || how === "retired-hurt") && !outId)} onClick={() => void recordWicket()}>Record wicket</button></div>
      </div>}
    </>}

    {match.status === "live" && innings && <div className="cp-footer">
      <span className="cp-note" role="status">{pending ? "Saving…" : lastBall ? `Last ball ${lastBall.over}.${lastBall.ball}: ${ballMark(lastBall).text} · saved` : "Saved · live"}</span>
      {lastBall && <InlineConfirm label="Undo last ball" buttonClass="text-button cp-undo" disabled={pending} title={`Undo ball ${lastBall.over}.${lastBall.ball} (${ballMark(lastBall).text}, ${playerName(lastBall.batterId)})?`} reasonLabel="Why undo the last ball?" placeholder="e.g. Recorded a wide; it was a no-ball" confirmLabel="Undo ball" onConfirm={(reason) => void score(match, { action: "cricket-correct-delivery", eventId: lastBall.id, correctionReason: reason })} />}
      {canScore && <InlineConfirm label="End innings" buttonClass="secondary-button" disabled={pending} title={`End ${inningsName(innings.number).toLowerCase()} at ${runs}/${wickets} (${oversText(balls)} overs)? Use this only if the innings is over early, for example a team short of batters.`} confirmLabel="End innings" onConfirm={() => void score(match, { action: "cricket-end-innings" })} />}
    </div>}
    {result && <p className="cricket-result" role="status">{result}</p>}
    {match.status === "live" && tie === "decided" && <div className="console-footer"><span role="status">Both innings complete. Submit the result to award the points.</span><ConfirmFinal data={data} match={match} disabled={pending} onConfirm={() => void score(match, { action: "submit" })} /></div>}
    <p className="scoring-rule-hint">Rulebook: {event?.scoringConfig?.oversPerInnings ?? 8} overs and {event?.scoringConfig?.wicketsPerInnings ?? 10} wickets a side. An over ends after 6 legal balls; wides and no-balls add a run and don&apos;t count. Level after both innings: a Super Over, then a bowl-out. On a keyboard, 0–4 and 6 record runs off the bat.</p>
    {history.map((item) => <CricketInningsDetails key={item.number} data={data} match={match} innings={item} />)}
  </div>;
}

function runsToBeatFor(history: CricketInnings[], number: number): number | undefined {
  return cricketRunsToBeat(history, { number });
}

function CricketReadOnlyScorecard({data,match}:{data:CompetitionData;match:Fixture}) {
  const card=match.scorecard?.cricket;
  if(!card?.innings.length)return <p className="empty-feed">The detailed cricket scorecard will appear when innings scoring begins.</p>;
  return <div className="cricket-public-card">{card.innings.map((innings)=><CricketInningsDetails key={innings.number} data={data} match={match} innings={innings}/>)}{cricketMatchResult(data,match)&&<p className="cricket-result" role="status">{cricketMatchResult(data,match)}</p>}</div>;
}

function cricketMatchResult(data:CompetitionData,match:Fixture):string {
  const innings=match.scorecard?.cricket?.innings.filter(item=>item.number<=2);
  if(!innings||innings.length<2||!innings.every(item=>item.completed))return "";
  const first=innings[0],second=innings[1],firstRuns=inningsRuns(first),secondRuns=inningsRuns(second);
  const firstSide=first.battingSide==="a"?match.sectionA:match.sectionB;
  const secondSide=second.battingSide==="a"?match.sectionA:match.sectionB;
  if(firstRuns===secondRuns){
    if(match.tieBreak)return `Scores level · ${sectionName(data,match.tieBreak.winner==="a"?match.sectionA:match.sectionB)} won the ${match.tieBreak.method==="bowl-out"?"bowl-out":"Super Over"}`;
    const state=cricketTieState(match);
    return state==="super-over-level"?"Scores are level after the Super Over too. A bowl-out decides.":state==="super-over"?"Scores level · Super Over in progress":"Scores level · Super Over to decide";
  }
  if(secondRuns>firstRuns){const battingWickets=second.deliveries.filter(d=>d.wicket&&d.wicket.kind!=="retired-hurt"&&!d.reversedAt).length;const limit=data.events.find(e=>e.id===match.eventId)?.scoringConfig?.wicketsPerInnings??10;return `${sectionName(data,secondSide)} won by ${Math.max(0,limit-battingWickets)} wicket${limit-battingWickets===1?"":"s"}`;}
  return `${sectionName(data,firstSide)} won by ${firstRuns-secondRuns} run${firstRuns-secondRuns===1?"":"s"}`;
}

function CricketInningsDetails({data,match,innings}:{data:CompetitionData;match:Fixture;innings:CricketInnings}) {
  const active=innings.deliveries.filter(d=>!d.reversedAt);
  const battingSection=innings.battingSide==="a"?match.sectionA:match.sectionB;
  const bowlingSection=innings.battingSide==="a"?match.sectionB:match.sectionA;
  const batters=data.entries.filter(e=>e.eventId===match.eventId&&e.sectionId===battingSection).flatMap(e=>data.participants.filter(p=>e.participantIds.includes(p.id)));
  const bowlers=data.entries.filter(e=>e.eventId===match.eventId&&e.sectionId===bowlingSection).flatMap(e=>data.participants.filter(p=>e.participantIds.includes(p.id)));
  const runs=active.reduce((n,d)=>n+d.batRuns+d.extraRuns+(d.extraType==="wide"||d.extraType==="no-ball"?1:0),0);
  const wickets=active.filter(d=>d.wicket&&d.wicket.kind!=="retired-hurt").length;
  const balls=active.filter(d=>d.legal).length;
  const extras=(type:string)=>active.filter(d=>d.extraType===type).reduce((n,d)=>n+d.extraRuns+(type==="wide"||type==="no-ball"?1:0),0);
  let cumulative=0;let wicketCount=0;
  const falls=active.flatMap(d=>{cumulative+=d.batRuns+d.extraRuns+(d.extraType==="wide"||d.extraType==="no-ball"?1:0);if(d.wicket){wicketCount++;return [`${cumulative}/${wicketCount} (${data.participants.find(p=>p.id===d.wicket!.playerOutId)?.name??"Batter"}, ${d.over}.${d.ball} ov)`]}return []});
  const lastWicket=active.findLastIndex(d=>d.wicket);
  const partnership=active.slice(lastWicket+1).reduce((n,d)=>n+d.batRuns+d.extraRuns+(d.extraType==="wide"||d.extraType==="no-ball"?1:0),0);
  const chasing=innings.number%2===0;
  const target=(cricketRunsToBeat(match.scorecard?.cricket?.innings??[],innings)??0)+1;
  const remainingBalls=Math.max(0,cricketInningsLimits(data.events.find(e=>e.id===match.eventId),innings).balls-balls);
  const runRate=balls?runs*6/balls:0;
  const requiredRate=chasing&&remainingBalls?Math.max(0,target-runs)*6/remainingBalls:0;
  const oversForBowler=(ds:typeof active)=>{const groups=new Map<number,typeof active>();for(const d of ds){const group=groups.get(d.over)??[];group.push(d);groups.set(d.over,group);}return groups;};
  return <section className="cricket-innings-card" aria-label={`Innings ${innings.number} scorecard`} aria-live="polite" aria-atomic="false"><h3>{innings.number>2?`Super Over ${innings.number-2}`:`Innings ${innings.number}`} · {sectionName(data,battingSection)} · {runs}/{wickets} ({Math.floor(balls/6)}.{balls%6} ov){innings.completed?` · ${innings.completionReason??"Complete"}`:" · LIVE"}</h3><p className="cricket-rate-line">CRR {runRate.toFixed(2)}{chasing&&!innings.completed?` · Target ${target} · Need ${Math.max(0,target-runs)} from ${remainingBalls} balls · RRR ${requiredRate.toFixed(2)}`:""}</p><div className="cricket-stat-tables"><table><caption>Batting</caption><thead><tr><th scope="col">Batter</th><th scope="col">R</th><th scope="col">B</th><th scope="col">4s</th><th scope="col">6s</th><th scope="col">Sr</th></tr></thead><tbody>{batters.map(p=>{const ds=active.filter(d=>d.batterId===p.id);const faced=ds.filter(d=>d.extraType!=="wide").length;const batterRuns=ds.reduce((n,d)=>n+d.batRuns,0);const dismissal=active.find(d=>d.wicket?.playerOutId===p.id)?.wicket?.kind;return <tr key={p.id}><th scope="row">{p.name}{innings.strikerId===p.id?" *":""}<small>{dismissal?` ${dismissal}`:" not out"}</small></th><td>{batterRuns}</td><td>{faced}</td><td>{ds.filter(d=>d.batRuns===4).length}</td><td>{ds.filter(d=>d.batRuns===6).length}</td><td>{faced?(batterRuns*100/faced).toFixed(1):"—"}</td></tr>})}</tbody></table><table><caption>Bowling</caption><thead><tr><th scope="col">Bowler</th><th scope="col">O</th><th scope="col">M</th><th scope="col">R</th><th scope="col">W</th><th scope="col">Econ</th><th scope="col">Wd</th><th scope="col">Nb</th></tr></thead><tbody>{bowlers.map(p=>{const ds=active.filter(d=>d.bowlerId===p.id);const legal=ds.filter(d=>d.legal).length;const conceded=ds.reduce((n,d)=>n+d.batRuns+(d.extraType==="wide"||d.extraType==="no-ball"?d.extraRuns+1:0),0);const overs=oversForBowler(ds);const maidens=[...overs.values()].filter(group=>group.filter(d=>d.legal).length===6&&group.every(d=>d.batRuns===0&&!(d.extraType==="wide"||d.extraType==="no-ball"))).length;const wicketsByBowler=ds.filter(d=>d.wicket&&["bowled","caught","lbw","stumped","hit-wicket"].includes(d.wicket.kind)).length;return <tr key={p.id}><th scope="row">{p.name}{innings.bowlerId===p.id?" *":""}</th><td>{Math.floor(legal/6)}.{legal%6}</td><td>{maidens}</td><td>{conceded}</td><td>{wicketsByBowler}</td><td>{legal?(conceded*6/legal).toFixed(2):"—"}</td><td>{ds.filter(d=>d.extraType==="wide").reduce((n,d)=>n+d.extraRuns+1,0)}</td><td>{ds.filter(d=>d.extraType==="no-ball").reduce((n,d)=>n+d.extraRuns+1,0)}</td></tr>})}</tbody></table></div><p className="cricket-extras"><strong>Extras</strong> {extras("wide")} wd · {extras("no-ball")} nb · {extras("bye")} b · {extras("leg-bye")} lb · {extras("penalty")} pen · {active.reduce((n,d)=>n+d.extraRuns+(d.extraType==="wide"||d.extraType==="no-ball"?1:0),0)} total</p><p className="cricket-extras"><strong>Fall of wickets</strong> {falls.join(" · ")||"—"}</p><p className="cricket-extras"><strong>Current partnership</strong> {partnership} runs</p><div className="cricket-delivery-list" aria-label="Recent ball-by-ball commentary">{active.slice(-18).map(d=><span key={d.id}>{d.over}.{d.ball} · {data.participants.find(p=>p.id===d.batterId)?.name??"Batter"} · {d.extraType!=="none"?`${d.extraType} `:""}{d.batRuns+d.extraRuns+(d.extraType==="wide"||d.extraType==="no-ball"?1:0)}{d.wicket?` · ${d.wicket.kind}`:""}</span>)}</div>{innings.deliveries.filter(d=>d.reversedAt).map(d=><p className="cricket-correction" key={`${d.id}-correction`}><strong>Corrected delivery {d.over}.{d.ball}</strong> · {d.correctionReason??"Reversed by scorer"}</p>)}</section>;
}

function MatchEventFeed({ data, match, score }: { data: CompetitionData; match: Fixture; score?: (match: Fixture, input: MatchScoreInput) => Promise<boolean> }) {
  const events = [...(match.scorecard?.events ?? [])].reverse().slice(0, 12);
  return <div className="match-event-feed"><strong>Recent match events</strong>{events.length ? events.map((item) => <div className={`match-event-row ${item.reversedAt ? "reversed" : ""}`} key={item.id}><span>{item.overBall ?? item.period}</span><span>{sectionName(data, item.side === "a" ? match.sectionA : match.sectionB)}</span><span>{item.playerName ?? data.participants.find((player) => player.id === item.playerId)?.name ?? "Team event"}</span><b>{item.label ?? item.kind}{item.points ? ` · ${item.points}` : ""}{item.detail ? ` · ${item.detail}` : ""}</b>{score && !item.reversedAt && !item.reversesEventId && match.status === "live" && <InlineConfirm label="Undo" buttonClass="feed-undo" reasonLabel="Why undo this?" placeholder="e.g. Point went to the wrong side" confirmLabel="Undo" onConfirm={(reason) => void score(match, { action: "reverse-event", eventId: item.id, correctionReason: reason })} />}</div>) : <span className="empty-feed">No scoring events yet.</span>}</div>;
}

function matchHeadlineScore(data: CompetitionData, fixture: Fixture, side: "a" | "b"): string {
  const event = data.events.find((item) => item.id === fixture.eventId);
  const sport = data.sports.find((item) => item.id === event?.sportId)?.id;
  if (sport === "cricket") return `${side === "a" ? fixture.scoreA : fixture.scoreB}/${side === "a" ? fixture.scorecard?.wicketsA ?? 0 : fixture.scorecard?.wicketsB ?? 0}`;
  if (["volleyball", "throwball", "badminton", "table-tennis", "lawn-tennis", "pickleball", "squash"].includes(sport ?? "")) return `${side === "a" ? fixture.scorecard?.setsA ?? 0 : fixture.scorecard?.setsB ?? 0}`;
  return String(side === "a" ? fixture.scoreA : fixture.scoreB);
}

function cricketFigure(playerId: string, events: NonNullable<Fixture["scorecard"]>["events"]): string {
  const active = events.filter((event) => !event.reversedAt);
  const batting = active.filter((event) => event.playerId === playerId);
  const bowling = active.filter((event) => event.secondaryPlayerId === playerId);
  const runs = batting.filter((event) => event.kind === "run").reduce((sum, event) => sum + event.points, 0);
  const fours = batting.filter((event) => event.kind === "run" && event.points === 4).length;
  const sixes = batting.filter((event) => event.kind === "run" && event.points === 6).length;
  const legalBalls = bowling.filter((event) => event.kind === "run" || event.kind === "wicket" || (event.kind === "extra" && !/wide|no.?ball/i.test(event.detail ?? ""))).length;
  const conceded = bowling.filter((event) => event.kind === "run" || (event.kind === "extra" && !/bye|leg.?bye/i.test(event.detail ?? ""))).reduce((sum, event) => sum + event.points, 0);
  const wickets = bowling.filter((event) => event.kind === "wicket" && !/run.?out|retired hurt|obstruct/i.test(event.detail ?? "")).length;
  return `${runs} runs · ${fours}×4 · ${sixes}×6 | ${Math.floor(legalBalls / 6)}.${legalBalls % 6} ov · ${conceded} conceded · ${wickets} wkts`;
}

function ScheduleView({ data, fixtures, role, filterSport, setFilterSport, filterSection, setFilterSection, filterDay, setFilterDay, filterVenue, setFilterVenue, filterStatus, setFilterStatus, refresh, toast }: { data: CompetitionData; fixtures: Fixture[]; role: Role; filterSport: string; setFilterSport: (value: string) => void; filterSection: string; setFilterSection: (value: string) => void; filterDay: string; setFilterDay: (value: string) => void; filterVenue: string; setFilterVenue: (value: string) => void; filterStatus: string; setFilterStatus: (value: string) => void; refresh: () => Promise<void>; toast: (message: string, error?: boolean) => void }) {
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<Fixture | null>(null);
  const [tool, setTool] = useState<"generate" | "shift" | "chit" | "import" | null>(null);
  const [layout, setLayout] = useState<"time" | "venue">("time");
  const canEdit = role === "scheduler" || role === "central-admin";
  const dayOptions = [...new Map(data.fixtures.map((fixture) => [formatDayKey(fixture.startsAt), formatFixtureDate(fixture.startsAt)])).entries()].map(([value, label]) => ({ value, label }));
  const venueOptions = [...new Set(data.fixtures.map((fixture) => fixture.venue).filter(Boolean))];
  return <div className="view-content"><div className="page-title-row"><div><p className="eyebrow">The run of show <span>·</span> Fixtures & venues</p><h1>Schedule</h1><p className="subtitle">One shared calendar for every sport, division, and venue.</p></div>{canEdit && <div className="schedule-actions"><ScheduleToolButtons active={tool === "chit" || tool === "import" ? null : tool} onChange={(next) => { setShowCreate(false); setEditing(null); setTool(next); }} /><button className="secondary-button" aria-pressed={tool === "chit"} onClick={() => { setShowCreate(false); setEditing(null); setTool(tool === "chit" ? null : "chit"); }}><Dices size={15} aria-hidden="true" /> Chit draw</button><button className="secondary-button" aria-pressed={tool === "import"} onClick={() => { setShowCreate(false); setEditing(null); setTool(tool === "import" ? null : "import"); }}><FileSpreadsheet size={15} aria-hidden="true" /> Import fixtures</button><button className="primary-button" onClick={() => { setEditing(null); setTool(null); setShowCreate((value) => !value); }}><Plus size={16} /> Add fixture</button></div>}</div>
    <NoticeBanner data={data} />
    {canEdit && tool === "generate" && <FixtureGenerator data={data} refresh={refresh} toast={toast} onClose={() => setTool(null)} />}
    {canEdit && tool === "shift" && <FixtureShifter data={data} refresh={refresh} toast={toast} onClose={() => setTool(null)} />}
    {canEdit && tool === "chit" && <ChitDrawTool data={data} refresh={refresh} toast={toast} onClose={() => setTool(null)} />}
    {canEdit && tool === "import" && <FixtureImportTool data={data} refresh={refresh} toast={toast} onClose={() => setTool(null)} />}
    <div className="filter-row"><label><span>Sport</span><select value={filterSport} onChange={(event) => setFilterSport(event.target.value)}><option value="all">All sports</option>{data.sports.map((sport) => <option value={sport.id} key={sport.id}>{sport.name}</option>)}</select></label><label><span>Division</span><select value={filterSection} onChange={(event) => setFilterSection(event.target.value)}><option value="all">All divisions</option>{data.sections.map((section) => <option value={section.id} key={section.id}>{section.name}</option>)}</select></label><label><span>Day</span><select value={filterDay} onChange={(event) => setFilterDay(event.target.value)}><option value="all">All days</option>{dayOptions.map((day) => <option value={day.value} key={day.value}>{day.label}</option>)}</select></label><label><span>Venue</span><select value={filterVenue} onChange={(event) => setFilterVenue(event.target.value)}><option value="all">All venues</option>{venueOptions.map((venue) => <option value={venue} key={venue}>{venue}</option>)}</select></label><label><span>Status</span><select value={filterStatus} onChange={(event) => setFilterStatus(event.target.value)}><option value="all">All statuses</option><option value="scheduled">Scheduled</option><option value="live">Live</option><option value="awaiting-confirmation">Legacy · policy needed</option><option value="completed">Final</option></select></label><span className="filter-result-count">{fixtures.length} {fixtures.length === 1 ? "fixture" : "fixtures"}</span></div><div className="event-tabs layout-toggle" role="group" aria-label="Layout"><button type="button" aria-pressed={layout === "time"} className={layout === "time" ? "on" : ""} onClick={() => setLayout("time")}>By time</button><button type="button" aria-pressed={layout === "venue"} className={layout === "venue" ? "on" : ""} onClick={() => setLayout("venue")}>By venue</button></div>
    {showCreate && canEdit && <FixtureForm data={data} refresh={refresh} toast={toast} onClose={() => setShowCreate(false)} />}
    {editing && canEdit && <FixtureForm data={data} initial={editing} refresh={refresh} toast={toast} onClose={() => setEditing(null)} />}
    {layout === "venue" ? <VenueBoard data={data} fixtures={fixtures} filterDay={filterDay} /> : <div className="schedule-list"><div className={`schedule-list-head${canEdit ? " editable" : ""}`}><span>Time</span><span>Event / match-up</span><span>Venue</span><span>Status</span>{canEdit && <span>Action</span>}</div>{fixtures.length ? fixtures.map((fixture) => <FixtureRow key={fixture.id} data={data} fixture={fixture} canEdit={canEdit} onEdit={() => { setShowCreate(false); setEditing(fixture); }} />) : <div className="empty-table">{data.fixtures.length ? <EmptyState title="No matches for these filters" body="Try another day, division or sport." action={{ label: "Clear filters", onClick: () => { setFilterSport("all"); setFilterSection("all"); setFilterDay("all"); setFilterVenue("all"); setFilterStatus("all"); } }} /> : <EmptyState title="Nothing scheduled yet" body={canEdit ? "Add the first fixture, or generate a round of fixtures from the tools above." : "Fixtures appear here as soon as the schedulers publish them."} />}</div>}</div>}</div>;
}

function FixtureForm({ data, initial, refresh, toast, onClose }: { data: CompetitionData; initial?: Fixture; refresh: () => Promise<void>; toast: (message: string, error?: boolean) => void; onClose: () => void }) {
  const [conflict, setConflict] = useState<string | null>(null);
  const [payload, setPayload] = useState<Record<string, unknown> | null>(null);
  const [busy, setBusy] = useState(false);
  const [sectionA, setSectionA] = useState<SectionId>(initial?.sectionA ?? data.sections[0]?.id ?? "s1");
  const endpoint = initial ? `/api/fixtures/${initial.id}` : "/api/fixtures";
  async function remove() {
    if (!initial) return;
    setBusy(true);
    try { await api(endpoint, "DELETE", {}); await refresh(); onClose(); toast("Fixture deleted from the schedule."); }
    catch (error) { toast(error instanceof Error ? error.message : "The fixture could not be deleted.", true); }
    finally { setBusy(false); }
  }
  async function submit(values: Record<string, unknown>, acknowledgeConflict = false) {
    setBusy(true);
    try {
      await api(endpoint, initial ? "PATCH" : "POST", { ...values, acknowledgeConflict });
      await refresh(); onClose(); toast(initial ? "Fixture updated and the schedule refreshed." : "Fixture added to the schedule.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Schedule update failed.";
      if (message.includes("overlaps")) { setPayload(values); setConflict(message); }
      else toast(message, true);
    } finally { setBusy(false); }
  }
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const dateValue = String(form.get("startsAt"));
    const date = new Date(dateValue);
    if (Number.isNaN(date.getTime())) { toast("Choose a valid date and time.", true); return; }
    void submit({ eventId: String(form.get("eventId")), sectionA: String(form.get("sectionA")), sectionB: String(form.get("sectionB")), startsAt: date.toISOString(), durationMinutes: Number(form.get("durationMinutes")), venue: String(form.get("venue")), stage: String(form.get("stage")), ...(form.get("group") ? { group: Number(form.get("group")) } : {}) });
  }
  return <form className="create-fixture" onSubmit={handleSubmit}><div className="create-fixture-title"><div><p className="eyebrow">Scheduling desk</p><h2>{initial ? "Change a fixture" : "Add a fixture"}</h2></div><button type="button" className="icon-button" aria-label="Close" onClick={onClose}><X size={18} /></button></div>{conflict && <div className="conflict-warning"><Shield size={17} /><span>{conflict} If this overlap is intentional, publish with acknowledgement.</span><button type="button" disabled={busy} onClick={() => payload && void submit(payload, true)}>Acknowledge & publish</button></div>}<div className="form-grid"><label>Sport / event<select name="eventId" defaultValue={initial?.eventId ?? data.events[0]?.id} required>{data.events.map((item) => <option value={item.id} key={item.id}>{eventSportName(data, item.id)}</option>)}</select></label><label>Division A<select name="sectionA" value={sectionA} onChange={(event) => setSectionA(event.target.value as SectionId)}>{data.sections.map((section) => <option value={section.id} key={section.id}>{section.name}</option>)}</select></label><label>Division B<select name="sectionB" defaultValue={initial?.sectionB ?? data.sections.find((section) => section.id !== sectionA)?.id}>{data.sections.filter((section) => section.id !== sectionA).map((section) => <option value={section.id} key={section.id}>{section.name}</option>)}</select></label><label>Tournament stage<select name="stage" defaultValue={initial?.stage ?? "league"}><option value="league">League / group match</option><option value="semifinal">Semifinal</option><option value="final">Final</option><option value="other">Other</option></select></label><label>Group · group-format events<select name="group" defaultValue={initial?.group ?? ""}><option value="">Not a group match</option><option value="1">Group 1 · each division's team 1</option><option value="2">Group 2 · each division's team 2</option></select></label><div className="schedule-date-field"><span className="form-field-label">DATE &amp; TIME</span><DateTimePicker defaultValue={initial ? localDateTime(initial.startsAt) : ""} /></div><label>Venue<input name="venue" defaultValue={initial?.venue ?? ""} placeholder="Court / field / hall" required /></label><label>Duration · min<input name="durationMinutes" type="number" min="1" defaultValue={initial?.durationMinutes ?? 45} required /></label></div><div className="form-actions"><span>Conflicts are flagged before publishing.</span>{initial && initial.status === "scheduled" && <InlineConfirm label="Delete fixture" buttonClass="secondary-button danger-button" disabled={busy} title={`Delete ${sideName(data, initial, "a")} v ${sideName(data, initial, "b")} on ${formatFixtureDate(initial.startsAt)}? It comes off the schedule for everyone.`} confirmLabel="Delete fixture" danger onConfirm={() => void remove()} />}<button className="primary-button" type="submit" disabled={busy}>{initial ? "Save changes" : "Save fixture"}</button></div></form>;
}

function DateTimePicker({ defaultValue }: { defaultValue: string }) {
  const [dateValue, setDateValue] = useState(defaultValue.slice(0, 10));
  const [timeValue, setTimeValue] = useState(defaultValue.slice(11, 16));
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [popoverPosition, setPopoverPosition] = useState<{ top: number; left: number }>();
  const [month, setMonth] = useState(() => {
    const selected = defaultValue ? new Date(defaultValue) : new Date();
    return new Date(selected.getFullYear(), selected.getMonth(), 1);
  });
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const firstWeekday = (new Date(year, monthIndex, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const today = new Date();
  const monthLabel = new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric" }).format(month);
  const selectedLabel = dateValue
    ? new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" }).format(new Date(`${dateValue}T00:00:00`))
    : "Choose a date";
  const dateTimeValue = dateValue && timeValue ? `${dateValue}T${timeValue}` : "";

  useEffect(() => {
    if (!open) return;
    const positionPopover = () => {
      const trigger = triggerRef.current;
      const popover = popoverRef.current;
      if (!trigger || !popover) return;
      const anchor = trigger.getBoundingClientRect();
      const width = Math.min(popover.offsetWidth, window.innerWidth - 24);
      const height = popover.offsetHeight;
      const left = Math.max(12, Math.min(anchor.left, window.innerWidth - width - 12));
      const below = window.innerHeight - anchor.bottom;
      const top = below >= height + 12 ? anchor.bottom + 8 : Math.max(12, anchor.top - height - 8);
      setPopoverPosition({ top, left });
    };
    positionPopover();
    window.addEventListener("resize", positionPopover);
    return () => window.removeEventListener("resize", positionPopover);
  }, [open, month]);

  return <div className="datetime-picker">
    <input type="hidden" name="startsAt" value={dateTimeValue} />
    <button ref={triggerRef} className={`datetime-trigger ${open ? "open" : ""}`} type="button" aria-expanded={open} aria-controls="fixture-calendar" onClick={() => { setPopoverPosition(undefined); setOpen((value) => !value); }}>
      <CalendarDays size={17} /><span><strong>{selectedLabel}</strong><small>{timeValue ? `at ${timeValue}` : "Select match start time"}</small></span><ChevronDown size={15} />
    </button>
    {open && <div ref={popoverRef} className="calendar-popover" id="fixture-calendar" style={popoverPosition ? { position: "fixed", top: popoverPosition.top, left: popoverPosition.left } : undefined}>
      <div className="calendar-head"><button type="button" className="icon-button" aria-label="Previous month" onClick={() => setMonth(new Date(year, monthIndex - 1, 1))}><ChevronLeft size={17} /></button><strong>{monthLabel}</strong><button type="button" className="icon-button" aria-label="Next month" onClick={() => setMonth(new Date(year, monthIndex + 1, 1))}><ChevronRight size={17} /></button></div>
      <div className="calendar-grid" role="grid" aria-label={monthLabel}>
        {["M", "T", "W", "T", "F", "S", "S"].map((day, index) => <span className="calendar-weekday" key={`${day}-${index}`} aria-hidden="true">{day}</span>)}
        {Array.from({ length: firstWeekday }, (_, index) => <span className="calendar-blank" key={`blank-${index}`} />)}
        {Array.from({ length: daysInMonth }, (_, index) => {
          const day = index + 1;
          const value = `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const isToday = today.getFullYear() === year && today.getMonth() === monthIndex && today.getDate() === day;
          return <button type="button" role="gridcell" aria-pressed={dateValue === value} aria-label={new Intl.DateTimeFormat("en-IN", { dateStyle: "full" }).format(new Date(year, monthIndex, day))} className={`calendar-day ${dateValue === value ? "selected" : ""} ${isToday ? "today" : ""}`} onClick={() => setDateValue(value)} key={value}>{day}</button>;
        })}
      </div>
      <div className="calendar-time-row"><label htmlFor="fixture-time">Start time</label><input id="fixture-time" type="time" value={timeValue} onChange={(event) => setTimeValue(event.target.value)} required /><button type="button" className="secondary-button" onClick={() => { setDateValue(formatDateField(today)); setMonth(new Date(today.getFullYear(), today.getMonth(), 1)); }}>Today</button></div>
      <div className="calendar-footer"><span>{dateValue && timeValue ? `${selectedLabel} · ${timeValue}` : "Choose a date and start time"}</span><button type="button" className="primary-button" disabled={!dateValue || !timeValue} onClick={() => setOpen(false)}>Done <Check size={14} /></button></div>
    </div>}
  </div>;
}

function FixtureRow({ data, fixture, canEdit, onEdit }: { data: CompetitionData; fixture: Fixture; canEdit?: boolean; onEdit?: () => void }) {
  const statusLabel: Record<string, string> = { live: "Live", scheduled: "Scheduled", "awaiting-confirmation": "Legacy · policy needed", completed: "Finalized" };
  return <div className={`schedule-row${canEdit ? " editable" : ""}`}><div className="schedule-time"><strong>{formatTime(fixture.startsAt)}</strong><small>{formatFixtureDate(fixture.startsAt)}</small></div><div className="schedule-match"><small>{eventSportName(data, fixture.eventId)}</small><strong className="matchup"><DivChip section={sectionOf(data, fixture.sectionA)} />{sideName(data, fixture, "a")} <span>v</span> <DivChip section={sectionOf(data, fixture.sectionB)} />{sideName(data, fixture, "b")}</strong></div><div className="schedule-venue">{fixture.venue}<small>{fixture.durationMinutes} min</small></div><span className={`schedule-status ${fixture.status}`}><i aria-hidden="true" />{statusLabel[fixture.status]}</span>{canEdit && <button className="text-button schedule-edit" onClick={onEdit}>Edit</button>}</div>;
}

function FixtureList({ data, fixtures }: { data: CompetitionData; fixtures: Fixture[] }) {
  return <div className="fixture-list">{fixtures.length ? fixtures.map((fixture) => <div className="fixture-row" key={fixture.id}><div className="fixture-date"><strong>{formatTime(fixture.startsAt)}</strong><small>{formatFixtureDateShort(fixture.startsAt)}</small></div><div className="fixture-detail"><strong className="matchup"><DivChip section={sectionOf(data, fixture.sectionA)} />{sideName(data, fixture, "a")} <span>v</span> <DivChip section={sectionOf(data, fixture.sectionB)} />{sideName(data, fixture, "b")}</strong><small>{eventSportName(data, fixture.eventId)} <i>·</i> {fixture.venue}</small></div><span className="fixture-format">{fixture.periodLabel}</span><button className="icon-button" aria-label="Open fixture details"><ArrowRight size={16} /></button></div>) : <EmptyState title="Nothing coming up" body="New fixtures appear here as soon as they are scheduled." />}</div>;
}

function AuditView({ data, score, openFixture }: { data: CompetitionData; score: (match: Fixture, input: MatchScoreInput) => Promise<boolean>; openFixture: (id: string) => void }) {
  const [date, setDate] = useState("");
  const [eventId, setEventId] = useState("all");
  const [action, setAction] = useState("all");
  const [actor, setActor] = useState("");
  const entries = (data.audit ?? []).filter((entry) => {
    const fixture = data.fixtures.find((item) => item.id === entry.entityId);
    return (!date || entry.at.slice(0, 10) === date) && (eventId === "all" || fixture?.eventId === eventId) && (action === "all" || entry.action === action) && (!actor || entry.actor.toLowerCase().includes(actor.toLowerCase()));
  });
  const legacyNeedsPolicy = data.fixtures.filter((fixture) => {
    const event = data.events.find((item) => item.id === fixture.eventId);
    return !!event && !event.pointsPolicy.published && (fixture.status === "awaiting-confirmation" || fixture.status === "completed" && fixture.resultConfirmed && (fixture.awardedPointsA == null || fixture.awardedPointsB == null));
  });
  return <div className="view-content"><div className="page-title-row"><div><p className="eyebrow">Central admin · traceable changes</p><h1>Scoring audit</h1><p className="subtitle">Every scoring change, final submission and correction, with who made it, when, and which match.</p></div><span className="ribbon-metric"><b>{entries.length}</b><span>records</span></span></div>
    {legacyNeedsPolicy.length > 0 && <section className="audit-policy-notice"><strong>{legacyNeedsPolicy.length} older result{legacyNeedsPolicy.length === 1 ? "" : "s"} need policy setup</strong><p>Publish an event's points to finalize its submitted results. Older results without points get them back.</p>{legacyNeedsPolicy.map((fixture) => <button key={fixture.id} className="text-button" onClick={() => openFixture(fixture.id)}>{eventName(data, fixture.eventId)} · {sideName(data, fixture, "a")} {fixture.scoreA}–{fixture.scoreB} {sideName(data, fixture, "b")} · OPEN MATCH</button>)}</section>}
    <div className="audit-filters"><label><span>Date</span><input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label><label><span>Event</span><select value={eventId} onChange={(event) => setEventId(event.target.value)}><option value="all">All events</option>{data.events.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label><label><span>Action</span><select value={action} onChange={(event) => setAction(event.target.value)}><option value="all">All actions</option>{[...new Set((data.audit ?? []).map((entry) => entry.action))].sort().map((item) => <option key={item} value={item}>{item.replaceAll("-", " ")}</option>)}</select></label><label><span>Actor email</span><input value={actor} onChange={(event) => setActor(event.target.value)} placeholder="Filter by email" /></label></div>
    <div className="audit-list">{entries.length ? entries.map((entry) => { const fixture = data.fixtures.find((item) => item.id === entry.entityId); return <article className="audit-item" key={entry.id}><div className="audit-item-marker"><ClipboardList size={16} /></div><div className="audit-item-body"><div className="audit-item-heading"><strong>{entry.action.replaceAll("-", " ")}</strong><time dateTime={entry.at}>{formatAuditTime(entry.at)}</time></div><p>{entry.detail}</p><small>{entry.actor} · {fixture ? `${eventName(data, fixture.eventId)} · ${sideName(data, fixture, "a")} vs ${sideName(data, fixture, "b")}` : `Record ${entry.entityId}`}</small></div>{fixture && <div className="audit-item-actions"><button className="text-button" onClick={() => openFixture(fixture.id)}>Open fixture</button>{fixture.status === "completed" && fixture.resultConfirmed && <InlineConfirm label="Reopen for correction" title="Reopening takes this result's points off the board until it's submitted again." reasonLabel="Why reopen it?" placeholder="e.g. Scorer entered 21–19 instead of 19–21" confirmLabel="Reopen result" onConfirm={(reviewNote) => void score(fixture, { action: "reopen", reviewNote })} />}</div>}</article>; }) : <div className="empty-inline">No audit entries match these filters.</div>}</div>
  </div>;
}

function eventName(data: CompetitionData, eventId: string): string { return data.events.find((event) => event.id === eventId)?.name ?? "Unknown event"; }
function fixtureStatusLabel(status: Fixture["status"]): string { return status === "awaiting-confirmation" ? "Legacy · policy needed" : status === "completed" ? "Finalized" : status === "live" ? "Live" : "Scheduled"; }
function formatAuditTime(value: string): string { const date = new Date(value); return Number.isNaN(date.valueOf()) ? value : date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }); }

function StandingsView({ data, role, refresh, toast }: { data: CompetitionData; role: Role; refresh: () => Promise<void>; toast: (message: string, error?: boolean) => void }) {
  const [board, setBoard] = useState("overall");
  const [formatEventId, setFormatEventId] = useState("all");
  const sports = data.sports.filter((sport) => sport.category === "sport");
  const finalized = finalizedFixturesForEvents(data.fixtures, new Set(data.events.map((event) => event.id)));
  const eventsOfBoard = board === "sports" ? data.events.filter((event) => sports.some((sport) => sport.id === event.sportId)) : board === "cultural" ? data.events.filter((event) => !sports.some((sport) => sport.id === event.sportId)) : data.events.filter((event) => event.sportId === board);
  const selectedEvents = formatEventId === "all" ? eventsOfBoard : eventsOfBoard.filter((event) => event.id === formatEventId);
  const includedFixtures = finalized.filter((fixture) => selectedEvents.some((event) => event.id === fixture.eventId));
  const aggregateBoard = (board === "sports" || board === "cultural") && formatEventId === "all";
  if (board !== "overall" || formatEventId !== "all") {
    const categoryEvents = aggregateBoard;
    const rows = data.sections.map((section) => {
      const fixtures = includedFixtures.filter((fixture) => !fixture.noResult && (fixture.sectionA === section.id || fixture.sectionB === section.id));
      const noResults = includedFixtures.filter((fixture) => fixture.noResult && (fixture.sectionA === section.id || fixture.sectionB === section.id)).length;
      // Walkovers count as wins but are left out of runs, goals, differences and net run rate.
      const played = fixtures.filter((fixture) => !fixture.walkoverWinner);
      const scored = played.reduce((sum, fixture) => sum + (fixture.sectionA === section.id ? fixture.scoreA : fixture.scoreB), 0);
      const conceded = played.reduce((sum, fixture) => sum + (fixture.sectionA === section.id ? fixture.scoreB : fixture.scoreA), 0);
      const wins = fixtures.filter((fixture) => fixtureOutcome(fixture) === (fixture.sectionA === section.id ? "a_win" : "b_win")).length;
      const draws = fixtures.filter((fixture) => fixtureOutcome(fixture) === "draw").length;
      const awards = fixtures.reduce((sum, fixture) => sum + (fixture.sectionA === section.id ? fixture.awardedPointsA ?? 0 : fixture.awardedPointsB ?? 0), bonusPointsFor(data, section.id, (eventId) => selectedEvents.some((event) => event.id === eventId)));
      const ballsFor = fixtures.reduce((sum, fixture) => sum + (fixture.sectionA === section.id ? fixture.scorecard?.legalBallsA ?? 0 : fixture.scorecard?.legalBallsB ?? 0), 0);
      const ballsAgainst = fixtures.reduce((sum, fixture) => sum + (fixture.sectionA === section.id ? fixture.scorecard?.legalBallsB ?? 0 : fixture.scorecard?.legalBallsA ?? 0), 0);
      const nrr = board === "cricket" && ballsFor > 0 && ballsAgainst > 0 ? scored * 6 / ballsFor - conceded * 6 / ballsAgainst : 0;
      return { section, fixtures, noResults, scored, conceded, wins, draws, awards, nrr, diff: scored - conceded };
    }).sort((a, b) => b.awards - a.awards || (selectedEvents.some((event) => data.sports.find((sport) => sport.id === event.sportId)?.id === "cricket") ? b.nrr - a.nrr : b.diff - a.diff) || b.scored - a.scored);
    const boardLabel = board === "overall" ? "Overall" : board === "sports" ? "Combined sports" : board === "cultural" ? "Combined cultural" : data.sports.find((sport) => sport.id === board)?.name ?? "Standings";
    const eventBoard = selectedEvents.length === 1 ? selectedEvents[0].sportId : board;
    return <div className="view-content"><h1>Standings</h1><p className="subtitle">Finalized results only. Event points rank first, then the sport's tie-break statistics.</p><div className="standings-selectors"><label><span>Board</span><select value={board} onChange={(event) => { setBoard(event.target.value); setFormatEventId("all"); }}><option value="overall">Overall</option><option value="sports">Combined sports</option><option value="cultural">Combined cultural</option>{sports.map((sport) => <option key={sport.id} value={sport.id}>{sport.name}</option>)}</select></label><label><span>Format / event</span><select aria-label="Filter standings by format or event" value={formatEventId} onChange={(event) => setFormatEventId(event.target.value)}><option value="all">All formats</option>{eventsOfBoard.map((event) => <option key={event.id} value={event.id}>{event.name}{event.format ? ` · ${event.format}` : ""}</option>)}</select></label></div>{categoryEvents && <div className="standings-table-wrap"><table className="standings-table"><thead><tr><th>Division</th><th>Total points</th>{eventsOfBoard.map((event)=><th key={event.id}>{event.name}</th>)}</tr></thead><tbody>{rows.map((row,index)=><tr key={row.section.id}><td><span className="table-section"><span className="rank-mark">{rows.filter(item=>item.awards===row.awards).length>1?"=":""}{rows.findIndex(item=>item.awards===row.awards)+1}</span><DivChip section={row.section} size="m" /><strong>{row.section.name}</strong></span></td><td>{row.awards}</td>{eventsOfBoard.map((event)=>{const match=finalized.find((fixture)=>fixture.eventId===event.id&&(fixture.sectionA===row.section.id||fixture.sectionB===row.section.id));const pts=match?(match.sectionA===row.section.id?match.awardedPointsA:match.awardedPointsB):undefined;return <td key={event.id}>{pts ?? "—"}</td>})}</tr>)}</tbody></table></div>}{!categoryEvents && <div className="standings-table-wrap"><table className="standings-table"><thead><tr><th>Rank / division</th><th>Played</th><th>W</th><th>L</th><th>NR</th><th>D</th><th>{eventBoard === "cricket" ? "Runs for" : "For"}</th><th>{eventBoard === "cricket" ? "Runs against" : "Against"}</th><th>{eventBoard === "cricket" ? "NRR" : "GD / diff"}</th><th>Points</th></tr></thead><tbody>{rows.map((row, index) => <tr key={row.section.id}><td><span className="table-section"><span className="rank-mark">{rows.filter((item) => item.awards === row.awards).length > 1 ? "=" : ""}{rows.findIndex((item) => item.awards === row.awards) + 1}</span><DivChip section={row.section} size="m" /><strong>{row.section.name}</strong></span></td><td>{row.fixtures.length + row.noResults}</td><td>{row.wins}</td><td>{row.fixtures.length - row.wins - row.draws}</td><td>{row.noResults}</td><td>{row.draws}</td><td>{row.scored}</td><td>{row.conceded}</td><td>{eventBoard === "cricket" ? row.nrr.toFixed(2) : row.diff}</td><td>{row.awards}</td></tr>)}</tbody></table></div>}{categoryEvents && <PointsRaceChart data={data} board={board as RaceBoard} />}</div>;
  }
  const inCategory = (eventId: string, category?: "sport" | "cultural") => {
    const event = data.events.find((item) => item.id === eventId);
    return !!event && (!category || data.sports.find((item) => item.id === event.sportId)?.category === category);
  };
  const pointsFor = (sectionId: SectionId, category?: "sport" | "cultural") => finalized.reduce((sum, fixture) => {
    if (!inCategory(fixture.eventId, category)) return sum;
    return sum + (fixture.sectionA === sectionId ? fixture.awardedPointsA ?? 0 : fixture.sectionB === sectionId ? fixture.awardedPointsB ?? 0 : 0);
  }, bonusPointsFor(data, sectionId, (eventId) => inCategory(eventId, category)));
  const overallRows = data.sections.map((section) => ({ section, sports: pointsFor(section.id, "sport"), cultural: pointsFor(section.id, "cultural"), total: pointsFor(section.id) })).sort((a,b) => b.total-a.total);
  return <div className="view-content"><div className="page-title-row"><div><p className="eyebrow">The division race <span>·</span> Finalized events</p><h1>Standings</h1><p className="subtitle">Event heads finalize submitted results; published points appear on the board immediately.</p></div></div><div className="standings-selectors"><label><span>Board</span><select value={board} onChange={(event) => { setBoard(event.target.value); setFormatEventId("all"); }}><option value="overall">Overall</option><option value="sports">Combined sports</option><option value="cultural">Combined cultural</option>{sports.map((sport) => <option key={sport.id} value={sport.id}>{sport.name}</option>)}</select></label><label><span>Format / event</span><select aria-label="Filter standings by format or event" value={formatEventId} onChange={(event) => setFormatEventId(event.target.value)}><option value="all">All formats</option>{eventsOfBoard.map((event) => <option key={event.id} value={event.id}>{event.name}{event.format ? ` · ${event.format}` : ""}</option>)}</select></label></div><div className="standings-ribbon"><span className="ribbon-orbit">DW</span><div><small>Overall</small><strong>{finalized.length} finalized results counted</strong></div><div className="ribbon-metric"><b>{data.sections.length}</b><span>divisions</span></div><div className="ribbon-metric"><b>{data.events.length}</b><span>events</span></div></div><div className="standings-table-wrap"><table className="standings-table"><thead><tr><th>Rank</th><th>Division</th><th>Sports pts</th><th>Cultural pts</th><th>Overall pts</th></tr></thead><tbody>{overallRows.map((row,index) => {const rank=index===0||row.total!==overallRows[index-1]?.total?index+1:overallRows.findIndex(item=>item.total===row.total)+1;return <tr key={row.section.id}><td><span className="rank-mark">{overallRows.filter(item=>item.total===row.total).length>1?"=":""}{rank}</span></td><td><span className="table-section"><DivChip section={row.section} size="m" /><strong>{row.section.name}</strong></span></td><td>{row.sports}</td><td>{row.cultural}</td><td className="table-points">{row.total}<small>Pts</small></td></tr>})}</tbody></table></div><PointsRaceChart data={data} board="overall" />{role === "central-admin" && <ChampionAnnouncePanel data={data} ranked={overallRows.map((row) => ({ id: row.section.id, total: row.total }))} refresh={refresh} toast={toast} />}</div>;
}

/**
 * Placings events (athletics, Stage events) are decided by finishing order, not head-to-head matches. The event's head
 * or a central admin ranks the divisions, checks the points on a confirm step, and records it once.
 */
function PlacingsPanel({ data, event, role, access, refresh, toast, manual = true }: { data: CompetitionData; event: EventDefinition; role: Role; access: UserAccess; refresh: () => Promise<void>; toast: (message: string, error?: boolean) => void; manual?: boolean }) {
  const places = event.pointsPolicy.places.slice(0, data.sections.length);
  const [order, setOrder] = useState<Array<SectionId | "">>(() => places.map(() => ""));
  const [note, setNote] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { setOrder(places.map(() => "")); setConfirming(false); setNote(""); setReason(""); }, [event.id, places.length]); // eslint-disable-line react-hooks/exhaustive-deps
  if (event.pointsPolicy.format !== "placings") return null;
  const recorded = (data.bonusAwards ?? []).filter((award) => award.eventId === event.id && award.kind === "placing").sort((a, b) => (a.place ?? 0) - (b.place ?? 0));
  const canRecord = role === "central-admin" || (role === "event-head" && canScoreEvent(access.assignments, event.id));
  // Quiz and treasure hunt record their placings from the live pad above; this panel then shows them (and the withdraw).
  if (!manual && !recorded.length) return null;
  const chosen = order.filter((id): id is SectionId => !!id);
  // Places fill from the top: no gaps, no division twice.
  const firstGap = order.findIndex((id) => !id);
  const valid = chosen.length > 0 && new Set(chosen).size === chosen.length && (firstGap === -1 || order.slice(firstGap).every((id) => !id));
  async function record() {
    setBusy(true);
    try { await api("/api/results/placings", "POST", { eventId: event.id, order: chosen, note }); await refresh(); toast(`${event.name} results recorded and points awarded.`); setConfirming(false); }
    catch (error) { toast(error instanceof Error ? error.message : "The results could not be recorded.", true); }
    finally { setBusy(false); }
  }
  async function withdraw() {
    setBusy(true);
    try { await api("/api/results/placings", "DELETE", { eventId: event.id, reason }); await refresh(); toast(`${event.name} results withdrawn. Record them again when they're corrected.`); setReason(""); }
    catch (error) { toast(error instanceof Error ? error.message : "The results could not be withdrawn.", true); }
    finally { setBusy(false); }
  }
  return <section className="event-editor placings-panel" aria-labelledby={`placings-${event.id}`}>
    <div className="event-editor-head"><div><p className="eyebrow">Results by placing</p><h2 id={`placings-${event.id}`}>{recorded.length ? "Final placings" : canRecord ? "Record the finishing order" : "Results not in yet"}</h2></div></div>
    {recorded.length ? <>
      <ol className="placings-list">{recorded.map((award) => { const section = data.sections.find((item) => item.id === award.sectionId); return <li key={award.id}><span className="placings-place">{award.place}</span><DivChip section={section} size="m" /><strong>{section?.name}</strong><b>+{award.points}</b></li>; })}</ol>
      {recorded[0]?.note && <p className="rule-note">{recorded[0].note}</p>}
      {role === "central-admin" && <div className="placings-withdraw"><label>Reason for withdrawing<input value={reason} onChange={(change) => setReason(change.target.value)} placeholder="e.g. Judges' sheet for 2nd and 3rd was swapped" /></label><button className="secondary-button" disabled={busy || !reason.trim()} onClick={() => void withdraw()}>Withdraw results</button></div>}
    </> : !canRecord ? <p className="rule-note">Points appear here once the event's head records the finishing order.</p>
      : confirming ? <div className="placings-confirm">
        <p>Check before recording. Points go on the board straight away, and only a central admin can withdraw them.</p>
        <ol className="placings-list">{chosen.map((id, index) => { const section = data.sections.find((item) => item.id === id); return <li key={id}><span className="placings-place">{index + 1}</span><DivChip section={section} size="m" /><strong>{section?.name}</strong><b>+{places[index]}</b></li>; })}</ol>
        <div className="placings-actions"><button className="secondary-button" disabled={busy} onClick={() => setConfirming(false)}>Back</button><button className="primary-button" disabled={busy} onClick={() => void record()}>{busy ? "Recording…" : "Record results"}</button></div>
      </div>
      : <div className="rule-form-grid">
        {places.map((points, index) => <label key={index}>{index + 1}{["st", "nd", "rd"][index] ?? "th"} place · {points} points<select value={order[index]} onChange={(change) => setOrder((current) => current.map((value, position) => position === index ? change.target.value as SectionId | "" : value))}><option value="">Not placed</option>{data.sections.map((section) => <option key={section.id} value={section.id} disabled={order.includes(section.id) && order[index] !== section.id}>{section.name}</option>)}</select></label>)}
        <label className="placings-note">Note · optional<input value={note} onChange={(change) => setNote(change.target.value)} placeholder="e.g. Photo finish for 2nd, judges' decision" /></label>
        <button className="primary-button" disabled={!valid} onClick={() => setConfirming(true)}>Review results</button>
        {!valid && chosen.length > 0 && <p className="rule-note">Fill places from first down, without gaps.</p>}
      </div>}
  </section>;
}

/**
 * Submitting a final result awards points, so it takes two taps: the first shows the final score and what it does,
 * the second records it. Left alone, the confirm folds back after six seconds.
 */
function ConfirmFinal({ data, match, disabled, onConfirm }: { data: CompetitionData; match: Fixture; disabled?: boolean; onConfirm: () => void }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => { if (!armed) return; const reset = window.setTimeout(() => setArmed(false), 6000); return () => window.clearTimeout(reset); }, [armed]);
  if (!armed) return <button className="confirm-button" disabled={disabled} onClick={() => setArmed(true)}>Submit final result</button>;
  return <span className="confirm-final" role="group" aria-label="Confirm final result">
    <span>Final: {sideName(data, match, "a")} {matchHeadlineScore(data, match, "a")}–{matchHeadlineScore(data, match, "b")} {sideName(data, match, "b")}. Points go on the board.</span>
    <button className="secondary-button" onClick={() => setArmed(false)}>Cancel</button>
    <button className="confirm-button" disabled={disabled} onClick={() => { setArmed(false); onConfirm(); }}>Confirm final</button>
  </span>;
}

/** The key to the two-letter event tiles, Arena and Stage apart. Collapsed by default; organizers learn it quickly. */
function SportCodeKey({ data }: { data: CompetitionData }) {
  const group = (category: "sport" | "cultural") => data.sports.filter((sport) => sport.category === category && data.events.some((event) => event.sportId === sport.id));
  return <details className="sport-code-key"><summary>Sport codes</summary>
    {([["sport", "Arena"], ["cultural", "Stage"]] as const).map(([category, label]) => <div key={category}><p className="eyebrow">{label}</p><ul>{group(category).map((sport) => <li key={sport.id}><span className="event-symbol">{sportCode(sport.id)}</span>{sport.name.replace(/^Esports: /, "")}</li>)}</ul></div>)}
  </details>;
}

/** Phone top bar: the page name and the division you follow; tapping either opens the menu sheet. */
function PhoneBar({ data, mySection, title, openMenu }: { data: CompetitionData; mySection: SectionId | null; title: string; openMenu: () => void }) {
  const followed = mySection ? data.sections.find((section) => section.id === mySection) : undefined;
  return <div className="phone-bar">
    <span className="phone-bar-title">{title}</span>
    <button type="button" className="phone-bar-follow" onClick={openMenu} aria-label={followed ? `Following ${followed.name}. Open menu` : "Open menu and pick a division"}>
      {followed ? <><DivChip section={followed} size="m" /><DivIcon section={followed} size={16} />{followed.name}</> : <>Pick a division</>}
    </button>
  </div>;
}

const PHONE_TABS: Array<{ id: View; label: string; icon: typeof LayoutDashboard }> = [
  { id: "overview", label: "Today", icon: LayoutDashboard }, { id: "live", label: "Live", icon: Radio },
  { id: "schedule", label: "Schedule", icon: CalendarDays }, { id: "standings", label: "Standings", icon: Trophy },
];

/** Phone tab bar: the four places spectators go, and More for everything else. */
function PhoneTabs({ view, setView, openMenu }: { view: View; setView: (view: View) => void; openMenu: () => void }) {
  const inMore = !PHONE_TABS.some((tab) => tab.id === view);
  return <nav className="phone-tabs" aria-label="Main">
    {PHONE_TABS.map((tab) => <button key={tab.id} type="button" className={view === tab.id ? "on" : ""} aria-current={view === tab.id ? "page" : undefined} onClick={() => { setView(tab.id); window.scrollTo(0, 0); }}><tab.icon size={22} strokeWidth={1.9} /><span>{tab.label}</span></button>)}
    <button type="button" className={inMore ? "on" : ""} onClick={openMenu}><MoreHorizontal size={22} strokeWidth={1.9} /><span>More</span></button>
  </nav>;
}

/** The phone menu sheet: the colour key (tap to follow), the other pages, theme, sign-in and organizer tools. */
function PhoneSheet({ data, mySection, setMySection, items, view, go, close, role, setRole, access, previewMode }: { data: CompetitionData; mySection: SectionId | null; setMySection: (id: SectionId | null) => void; items: Array<{ id: View; label: string; icon: typeof LayoutDashboard; group?: string }>; view: View; go: (view: View) => void; close: () => void; role: Role; setRole: (role: Role) => void; access: UserAccess; previewMode: boolean }) {
  useEffect(() => { const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") close(); }; window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey); }, [close]);
  const more = items.filter((item) => !PHONE_TABS.some((tab) => tab.id === item.id));
  const spectatorPages = more.filter((item) => item.id === "mine" || item.id === "players");
  const organizerPages = more.filter((item) => item.id !== "mine" && item.id !== "players");
  const roles = previewMode ? (Object.keys(roleNames) as Role[]) : [...new Set(access.assignments.map((item) => item.role))];
  const row = (item: { id: View; label: string; icon: typeof LayoutDashboard }) => <button key={item.id} type="button" className={`sheet-row${view === item.id ? " on" : ""}`} onClick={() => go(item.id)}><item.icon size={18} strokeWidth={1.9} /><span>{item.label}</span><ChevronRight size={16} /></button>;
  return <div className="phone-sheet-layer" onClick={close}>
    <div className="phone-sheet" role="dialog" aria-modal="true" aria-label="Menu" onClick={(event) => event.stopPropagation()}>
      <span className="sheet-grab" aria-hidden="true" />
      <DivisionKey data={data} mySection={mySection} setMySection={setMySection} />
      <p className="sheet-label">More</p>
      {spectatorPages.map(row)}
      <div className="sheet-row static"><span>Theme</span><ThemeToggle /></div>
      <a className="sheet-row" href="/tv" target="_blank" rel="noopener"><Tv size={18} strokeWidth={1.9} /><span>TV mode</span><ChevronRight size={16} /></a>
      {access.email === "guest@public.invalid" && <a className="sheet-row" href="/login"><span>Sign in with Google</span><ChevronRight size={16} /></a>}
      {organizerPages.length > 0 && <><p className="sheet-label">Organizers</p>{organizerPages.map(row)}</>}
      {roles.length > 1 && <label className="sheet-row static"><span>{previewMode ? "View as" : "Your role"}</span><select value={role} onChange={(event) => setRole(event.target.value as Role)}>{roles.map((item) => <option key={item} value={item}>{roleNames[item]}</option>)}</select></label>}
      {previewMode && <p className="sheet-note">Demo access: organizer preview is on, using this workspace&apos;s data.</p>}
      <button type="button" className="secondary-button sheet-close" onClick={close}>Close</button>
    </div>
  </div>;
}

/** Where an event stands, in one phrase: what's done, or what it needs next. */
function EventStatus({ data, event }: { data: CompetitionData; event: EventDefinition }) {
  const fixtures = data.fixtures.filter((fixture) => fixture.eventId === event.id);
  const placed = (data.bonusAwards ?? []).some((award) => award.eventId === event.id && award.kind === "placing");
  const [label, tone] = !event.pointsPolicy.published ? ["Points draft", "warn"]
    : event.minPlayers === null ? ["Needs roster size", "warn"]
    : event.pointsPolicy.format === "placings" ? (placed ? ["Results in", "ok"] : ["Results due", "todo"])
    : !fixtures.length ? ["No fixtures yet", "todo"]
    : fixtures.every((fixture) => fixture.status === "completed") ? ["Results in", "ok"]
    : fixtures.some((fixture) => fixture.status === "live") ? ["Live now", "live"]
    : ["Fixtures made", "ok"];
  return <span className={`event-status ${tone}`}>{label}</span>;
}

/**
 * Day one for central admins: the four things that have to happen before the competition runs, each with where to
 * do it. Disappears when everything is done, or when dismissed (remembered in this browser).
 */
function SetupChecklist({ data, go }: { data: CompetitionData; go: (view: View) => void }) {
  const [hidden, setHidden] = useState(false);
  useEffect(() => { try { setHidden(window.localStorage.getItem("dw.setupHidden") === "1"); } catch { /* ignore */ } }, []);
  const organizers = data.assignments.filter((item) => item.active && item.role !== "spectator" && item.role !== "central-admin").length;
  const ready = data.events.filter((event) => event.pointsPolicy.published && event.minPlayers !== null).length;
  const matchEvents = data.events.filter((event) => event.pointsPolicy.format !== "placings");
  const scheduled = matchEvents.filter((event) => data.fixtures.some((fixture) => fixture.eventId === event.id)).length;
  const divisionsIn = data.sections.filter((section) => data.entries.some((entry) => entry.sectionId === section.id && entry.status === "submitted")).length;
  const steps: Array<{ title: string; body: string; done: boolean; status: string; action: string; view: View }> = [
    { title: "Import the organizers", body: "Division admins, event heads and schedulers, from the spreadsheet.", done: organizers > 0, status: `${organizers} assigned`, action: "Open people & access", view: "access" },
    { title: "Publish event rules", body: "Roster size and points for every event.", done: ready === data.events.length, status: `${ready} of ${data.events.length}`, action: "Open sports & events", view: "events" },
    { title: "Add fixtures", body: `Generate a round, or add matches one by one.${matchEvents.length - scheduled ? ` ${matchEvents.length - scheduled} match events still have none.` : ""}`, done: scheduled === matchEvents.length, status: `${scheduled} of ${matchEvents.length}`, action: "Open schedule", view: "schedule" },
    { title: "Collect rosters", body: "Division admins submit each event's players.", done: divisionsIn === data.sections.length, status: `${divisionsIn} of ${data.sections.length} divisions`, action: "Open division entries", view: "entries" },
  ];
  const done = steps.filter((step) => step.done).length;
  if (hidden || done === steps.length) return null;
  const next = steps.findIndex((step) => !step.done);
  return <section className="setup-checklist" aria-labelledby="setup-title">
    <div className="setup-head"><div><p className="eyebrow">Getting ready · only organizers see this</p><h2 id="setup-title">{done} of {steps.length} done</h2></div><button type="button" className="text-button" onClick={() => { setHidden(true); try { window.localStorage.setItem("dw.setupHidden", "1"); } catch { /* ignore */ } }}>Hide</button></div>
    <div className="setup-progress" aria-hidden="true"><i style={{ width: `${(done / steps.length) * 100}%` }} /></div>
    <ol>{steps.map((step, index) => <li key={step.title} className={step.done ? "done" : ""}>
      <span className="setup-num" aria-hidden="true">{step.done ? <Check size={16} /> : index + 1}</span>
      <span className="setup-copy"><strong>{step.title}</strong><small>{step.body}</small></span>
      {step.done ? <span className="event-status ok">{step.status}</span> : <button type="button" className={index === next ? "primary-button" : "secondary-button"} onClick={() => go(step.view)}>{step.action}</button>}
    </li>)}</ol>
  </section>;
}

/** A side's mark on a match card: the division's own colour and letter, ringed so navy and black hold on the dark card. */
function TeamMark({ data, id }: { data: CompetitionData; id: SectionId }) {
  const section = data.sections.find((item) => item.id === id);
  return <span className="team-mark" style={{ background: section?.color ?? "#30364a" }} aria-hidden="true">{section?.code ?? "?"}</span>;
}

/** Closing ceremony: the central admin announces the champion, which plays the champion moment once for everyone. */
function ChampionAnnouncePanel({ data, ranked, refresh, toast }: { data: CompetitionData; ranked: Array<{ id: SectionId; total: number }>; refresh: () => Promise<void>; toast: (message: string, error?: boolean) => void }) {
  const top = ranked[0];
  const level = ranked.length > 1 && !!top && ranked[1].total === top.total;
  const suggested = top && !level && top.total > 0 ? top.id : undefined;
  const [sectionId, setSectionId] = useState<SectionId | "">(suggested ?? "");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { setSectionId((current) => current || (suggested ?? "")); }, [suggested]);
  const needsNote = !!sectionId && sectionId !== suggested;
  async function announce() {
    if (!sectionId) return;
    setBusy(true);
    try { await api("/api/admin/champion", "POST", { sectionId, note }); await refresh(); toast(`${sectionName(data, sectionId)} announced as champions.`); }
    catch (error) { toast(error instanceof Error ? error.message : "The champion could not be announced.", true); }
    finally { setBusy(false); }
  }
  async function withdraw(reason: string) {
    setBusy(true);
    try { await api("/api/admin/champion", "DELETE", { reason }); await refresh(); toast("Champion announcement withdrawn."); }
    catch (error) { toast(error instanceof Error ? error.message : "The announcement could not be withdrawn.", true); }
    finally { setBusy(false); }
  }
  return <section className="event-editor champion-admin"><div className="event-editor-head"><div><p className="eyebrow">Closing ceremony · central admin</p><h2>{data.champion ? `${sectionName(data, data.champion.sectionId)} announced as champions` : "Announce the champion"}</h2></div></div>
    {data.champion ? <div className="topper-awarded"><p>Announced {formatFixtureDate(data.champion.announcedAt)}{data.champion.note ? ` · ${data.champion.note}` : ""}.</p><InlineConfirm label="Withdraw" disabled={busy} reasonLabel="Why withdraw the announcement?" placeholder="e.g. Announced before the last result was final" confirmLabel="Withdraw" danger onConfirm={(reason) => void withdraw(reason)} /></div>
      : <><p>{suggested ? `${sectionName(data, suggested)} lead the overall standings.` : "No division is clear at the top. The committee decides; add their decision as a note."} Announce once every result is final: it plays the champion moment on every phone, laptop and TV.</p>
        <div className="rule-form-grid">
          <label>Division<select value={sectionId} onChange={(change) => setSectionId(change.target.value as SectionId)}><option value="">Choose</option>{data.sections.map((section) => <option key={section.id} value={section.id}>{section.name}</option>)}</select></label>
          <label>Note {needsNote || !suggested ? "· REQUIRED" : "· OPTIONAL"}<input value={note} onChange={(change) => setNote(change.target.value)} placeholder="e.g. Committee decision on the tie" /></label>
          <InlineConfirm label="Announce champion" buttonClass="primary-button" disabled={busy || !sectionId || ((needsNote || !suggested) && !note.trim())} title={sectionId ? `Announce ${sectionName(data, sectionId)} as champions? The champion moment plays on every phone, laptop and TV.` : undefined} confirmLabel="Announce" onConfirm={() => void announce()} />
        </div></>}
  </section>;
}

function EntriesView({ data, role, access, refresh, toast }: { data: CompetitionData; role: Role; access: UserAccess; refresh: () => Promise<void>; toast: (message: string, error?: boolean) => void }) {
  const accessibleSections = role === "central-admin" ? data.sections : data.sections.filter((section) => access.assignments.some((item) => item.role === "section-admin" && (item.scopeId === section.id || !item.scopeId)));
  const [sectionId, setSectionId] = useState<SectionId>(accessibleSections[0]?.id ?? data.sections[0]?.id ?? "s1");
  const [eventId, setEventId] = useState(data.events[0]?.id ?? "");
  const [entryNumber, setEntryNumber] = useState(1);
  const [players, setPlayers] = useState<Array<{ name: string; studentId: string; gender: ParticipantGender | "" }>>([{ name: "", studentId: "", gender: "" }]);
  const [busy, setBusy] = useState(false);
  const event = data.events.find((item) => item.id === eventId);
  const sport = data.sports.find((item) => item.id === event?.sportId);
  const section = data.sections.find((item) => item.id === sectionId);
  const entry = data.entries.find((item) => item.sectionId === sectionId && item.eventId === eventId && (item.entryNumber ?? 1) === entryNumber);
  const locked = entry?.status === "submitted" && role !== "central-admin";
  const canEdit = role === "central-admin" || role === "section-admin";
  const emptyPlayer = () => ({ name: "", studentId: "", gender: "" as const });

  async function save(submit: boolean) {
    setBusy(true);
    try {
      await api("/api/entries", "POST", { eventId, sectionId, entryNumber, participants: players, submit });
      await refresh();
      toast(submit ? "Entry submitted and locked for division admins." : "Entry draft saved.");
    } catch (error) { toast(error instanceof Error ? error.message : "Entry could not be saved.", true); }
    finally { setBusy(false); }
  }
  const roster = entry ? entry.participantIds.map((id) => data.participants.find((person) => person.id === id)).filter(Boolean) : [];
  useEffect(() => {
    if (entry) {
      setPlayers(entry.participantIds.map((id) => {
        const person = data.participants.find((candidate) => candidate.id === id);
        return { name: person?.name ?? "", studentId: person?.studentId ?? "", gender: person?.gender ?? "" };
      }));
    } else {
      setPlayers([emptyPlayer()]);
    }
  }, [entry?.id, entry?.updatedAt, data.participants]);
  const playerRange = event ? `${event.minPlayers ?? "Set"}${event.maxPlayers === null ? "+" : event.maxPlayers !== event.minPlayers ? `–${event.maxPlayers}` : ""}` : "—";
  return <div className="view-content"><div className="page-title-row"><div><p className="eyebrow">Rosters <span>·</span> Rulebook-based entry slots</p><h1>Division entries</h1><p className="subtitle">Roster sizes, gender eligibility, and sport limits follow the competition rules.</p></div></div>{event && event.minPlayers === null && <EmptyState title="Roster rules aren't published for this event yet" body="You can save a draft now. Submitting opens once a central admin publishes the event's roster size in Sports & events." />}<div className="entry-toolbar"><label>Division<select value={sectionId} onChange={(event) => { setSectionId(event.target.value as SectionId); setPlayers([emptyPlayer()]); }}><option disabled>Select division</option>{accessibleSections.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Sport / event<select value={eventId} onChange={(event) => { setEventId(event.target.value); setEntryNumber(1); setPlayers([emptyPlayer()]); }}><option disabled>Select event</option>{data.events.map((item) => <option value={item.id} key={item.id}>{eventSportName(data, item.id)}</option>)}</select></label>{(event?.entriesPerDivision ?? 1) > 1 && <label>Team entry<select value={entryNumber} onChange={(event) => setEntryNumber(Number(event.target.value))}>{Array.from({ length: event?.entriesPerDivision ?? 1 }, (_, index) => <option key={index + 1} value={index + 1}>Team {index + 1}</option>)}</select></label>}<span className={`entry-state ${entry?.status === "submitted" ? "locked" : "draft"}`}>{entry?.status === "submitted" ? <><LockKeyhole size={14} /> Submitted · LOCKED</> : "Draft"}</span></div><div className="entry-workspace"><div className="entry-rules"><div className="entry-rules-title"><Users size={17} /><strong>Entry requirements</strong></div><p>{event?.format ?? "Select an event to see its rules."}</p><div className="rule-row"><span>Players per entry</span><b>{playerRange}</b></div><div className="rule-row"><span>Entries per division</span><b>{event?.entriesPerDivision ?? "—"}</b></div><div className="rule-row"><span>Substitutes in roster</span><b>{event?.substitutePlayers ?? 0}</b></div><div className="rule-row"><span>Gender eligibility</span><b>{event?.genderEligibility ?? "—"}</b></div><div className="rule-row"><span>Participation cap</span><b>{sport?.category === "cultural" ? "No cultural-event cap" : sport?.countsTowardOverallSportsCap === false ? "Excluded from sports cap" : `${section?.maxSportsPerPlayer ?? 3} sports · ${sport?.maxFormatsPerPlayer ?? "unlimited"} formats per sport`}</b></div>{(event?.rosterRules ?? []).map((rule) => <p className="rule-note" key={rule}>{rule}</p>)}{(sport?.participationNotes ?? []).map((rule) => <p className="rule-note" key={rule}>{rule}</p>)}</div><div className="entry-editor"><div className="entry-editor-head"><div><p className="eyebrow">{event?.entriesPerDivision && event.entriesPerDivision > 1 ? `TEAM ${entryNumber}` : "Division entry"}</p><h2>{sectionName(data, sectionId)} <span>·</span> {eventSportName(data, eventId)}</h2></div>{locked && <span className="locked-label"><LockKeyhole size={13} /> Locked</span>}</div>{entry && !canEdit ? <div className="submitted-roster">{roster.map((person) => person && <div className="participant-row" key={person.id}><span className="participant-avatar">{initials(person.name)}</span><div><strong>{person.name}</strong><small>{person.gender ? `${person.gender} · ` : ""}ID · {person.studentId}</small></div><Check size={16} /></div>)}</div> : <>{players.map((person, index) => <div className="player-input-row" key={index}><span className="player-index">{String(index + 1).padStart(2, "0")}</span><label><span>Player name</span><input value={person.name} disabled={!canEdit || locked} onChange={(event) => setPlayers((list) => list.map((item, idx) => idx === index ? { ...item, name: event.target.value } : item))} placeholder="Full name" /></label><label><span>College ID</span><input value={person.studentId} disabled={!canEdit || locked} onChange={(event) => setPlayers((list) => list.map((item, idx) => idx === index ? { ...item, studentId: event.target.value } : item))} placeholder="Student ID" /></label><label><span>Gender</span><select value={person.gender} disabled={!canEdit || locked} onChange={(event) => setPlayers((list) => list.map((item, idx) => idx === index ? { ...item, gender: event.target.value as ParticipantGender | "" } : item))}><option value="">Choose</option><option value="male">Man</option><option value="female">Woman</option><option value="other">Other</option></select></label>{players.length > 1 && !locked && <button className="icon-button remove-player" onClick={() => setPlayers((list) => list.filter((_, idx) => idx !== index))} aria-label="Remove player"><X size={15} /></button>}</div>)}{canEdit && !locked && <button className="add-player" onClick={() => setPlayers((list) => [...list, emptyPlayer()])}><Plus size={15} /> Add player</button>}</>}{canEdit && <div className="entry-actions"><span>Player limits are checked when submitted.</span><div><button className="secondary-button" disabled={busy || locked} onClick={() => void save(false)}>Save draft</button><button className="primary-button" disabled={busy || locked} onClick={() => void save(true)}>Submit entry <ArrowRight size={14} /></button></div></div>}</div></div></div>;
}

function EventsView({ data, role, access, refresh, toast, openEventPage, initialEventId }: { data: CompetitionData; role: Role; access: UserAccess; refresh: () => Promise<void>; toast: (message: string, error?: boolean) => void; openEventPage?: (id: string) => void; initialEventId?: string | null }) {
  const [eventId, setEventId] = useState(initialEventId && data.events.some((item) => item.id === initialEventId) ? initialEventId : data.events[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const event = data.events.find((item) => item.id === eventId);
  const sport = data.sports.find((item) => item.id === event?.sportId);
  const canEdit = role === "central-admin";
  // Event heads and schedulers come here for results work (placings, semifinal draw), so they land on that tab.
  const [tab, setTab] = useState<"basics" | "roster" | "scoring" | "points" | "results">(role === "central-admin" && !initialEventId ? "basics" : "results");
  async function save(eventForm: FormEvent<HTMLFormElement>) {
    eventForm.preventDefault(); if (!event) return; setBusy(true);
    const form = new FormData(eventForm.currentTarget);
    const values = (name: string) => String(form.get(name) ?? "").split("\n").map((value) => value.trim()).filter(Boolean);
    const maxText = String(form.get("maxPlayers") ?? "").trim();
    const matchText = String(form.get("matchCount") ?? "").trim();
    const pointsFormat = String(form.get("pointsFormat") ?? "league") as PointsFormat;
    const outcomes = pointsFormat === "placings" ? {} : Object.fromEntries([...form.entries()].filter(([key]) => key.startsWith("outcome:")).map(([key, value]) => [key.slice("outcome:".length), Number(value)]).filter(([, value]) => Number.isFinite(value)));
    const points = pointsFormat === "placings" ? [1, 2, 3, 4, 5].map((place) => Number(form.get(`place:${place}`) ?? 0)).map((value) => Number.isFinite(value) ? value : 0) : [];
    const unitText = String(form.get("unit") ?? "").trim();
    const walkoverText = String(form.get("walkoverScore") ?? "").trim();
    const scoringConfig = Object.fromEntries(["inningsCount", "oversPerInnings", "wicketsPerInnings", "pointsToWin", "winBy", "setsToWin", "periods", "periodMinutes"].map((key) => [key, String(form.get(key) ?? "").trim() ? Number(form.get(key)) : undefined]));
    try { await api("/api/admin/events", "PUT", {
      eventId, name: form.get("name"), format: form.get("format"), minPlayers: Number(form.get("minPlayers")),
      maxPlayers: maxText ? Number(maxText) : null, entriesPerDivision: Number(form.get("entriesPerDivision")),
      substitutePlayers: Number(form.get("substitutePlayers")), genderEligibility: form.get("genderEligibility"),
      tournamentFormat: form.get("tournamentFormat"), matchCount: matchText ? Number(matchText) : null,
      rosterRules: values("rosterRules"), scoringRules: values("scoringRules"), scoringType: form.get("scoringType"),
      outcomePoints: outcomes, points, publishPoints: form.get("publishPoints") === "on",
      pointsFormat, unit: pointsFormat === "placings" || !unitText ? null : Number(unitText), walkoverScore: walkoverText ? Number(walkoverText) : null,
      scoringConfig,
    }); await refresh(); toast("Event rules saved."); }
    catch (error) { toast(error instanceof Error ? error.message : "Rules could not be saved.", true); }
    finally { setBusy(false); }
  }
  async function saveSport(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault(); if (!sport) return; setBusy(true);
    const form = new FormData(formEvent.currentTarget);
    try { await api("/api/admin/sports", "PUT", { sportId: sport.id, category: form.get("category"), countsTowardOverallSportsCap: form.get("countsTowardOverallSportsCap") === "on", maxFormatsPerPlayer: String(form.get("maxFormatsPerPlayer") ?? "").trim() ? Number(form.get("maxFormatsPerPlayer")) : null, participationNotes: String(form.get("participationNotes") ?? "").split("\n") }); await refresh(); toast("Sport participation rules saved."); }
    catch (error) { toast(error instanceof Error ? error.message : "Participation rules could not be saved.", true); }
    finally { setBusy(false); }
  }
  async function saveCaps(eventForm: FormEvent<HTMLFormElement>) {
    eventForm.preventDefault(); const form = new FormData(eventForm.currentTarget); setBusy(true);
    // One save for all five divisions; only the caps that changed are sent.
    const changed = data.sections.filter((section) => Number(form.get(`cap:${section.id}`)) !== section.maxSportsPerPlayer);
    try { for (const section of changed) await api("/api/admin/participation", "PUT", { sectionId: section.id, maxSportsPerPlayer: Number(form.get(`cap:${section.id}`)) }); await refresh(); toast(changed.length ? "Sports caps saved." : "No caps changed."); }
    catch (error) { toast(error instanceof Error ? error.message : "Division cap could not be saved.", true); }
    finally { setBusy(false); }
  }
  return <div className="view-content"><div className="page-title-row"><div><p className="eyebrow">Rulebook configuration <span>·</span> Central admin</p><h1>Sports & events</h1><p className="subtitle">Roster rules, formats, tournament structures, participation caps, and points are stored as editable competition data.</p></div>{canEdit && <span className="admin-badge"><Shield size={14} /> Central admin</span>}</div>
    {canEdit && <section className="event-editor" style={{ marginBottom: 20 }}><div className="event-editor-head"><div><p className="eyebrow">Division participation</p><h2>Sports per player</h2></div></div><form className="caps-form" onSubmit={(formEvent) => void saveCaps(formEvent)}><div className="caps-grid">{data.sections.map((section) => <label key={section.id}><span className="caps-name"><DivChip section={section} />{section.name}</span><input name={`cap:${section.id}`} type="number" min="1" max="20" defaultValue={section.maxSportsPerPlayer} aria-label={`${section.name}: most sports per player`} /></label>)}</div><div className="event-editor-footer"><span>Most sports one player can enter, per division.</span><button className="primary-button" type="submit" disabled={busy}>Save caps</button></div></form></section>}
    <SportCodeKey data={data} /><div className="event-layout"><div className="event-list">{([["sport", "Arena"], ["cultural", "Stage"]] as const).map(([category, label]) => { const group = data.events.filter((item) => (data.sports.find((sport) => sport.id === item.sportId)?.category ?? "sport") === category); return group.length ? <div key={category} className="event-group"><p className="event-group-label">{label} · {group.length} events</p>{group.map((item) => <button className={`event-list-item ${item.id === eventId ? "active" : ""}`} key={item.id} onClick={() => setEventId(item.id)}><span className="event-symbol" title={data.sports.find((sport) => sport.id === item.sportId)?.name}>{sportCode(item.sportId)}</span><span><strong>{eventSportName(data, item.id)}</strong><small>{item.format}</small></span><EventStatus data={data} event={item} /></button>)}</div> : null; })}</div>{event && <div className="event-editor-column"><form key={event.id} className="event-editor" onSubmit={(eventForm) => void save(eventForm)}><div className="event-editor-head"><div><p className="eyebrow">Event rules</p><h2>{eventSportName(data, event.id)}</h2></div><span className="event-editor-links">{openEventPage && <button type="button" className="text-button" onClick={() => openEventPage(event.id)}>Event page</button>}<EventStatus data={data} event={event} /></span></div>
      <div className="event-tabs" role="tablist" aria-label="Event settings">{([["basics", "Basics"], ["roster", "Roster"], ["scoring", "Scoring"], ["points", "Points"], ["results", "Results"]] as const).map(([value, label]) => <button key={value} type="button" role="tab" aria-selected={tab === value} className={tab === value ? "on" : ""} onClick={() => setTab(value)}>{label}</button>)}</div>
      <div className="rule-form-grid" hidden={tab !== "basics"}><label>Event name<input name="name" defaultValue={event.name} disabled={!canEdit} /></label><label>Entry / match format<input name="format" defaultValue={event.format} disabled={!canEdit} /></label></div><div className="rule-form-grid" hidden={tab !== "roster"}><label>Min players per team<input type="number" name="minPlayers" min="1" defaultValue={event.minPlayers ?? 1} disabled={!canEdit} /></label><label>Max players · blank = unlimited<input type="number" name="maxPlayers" min="1" defaultValue={event.maxPlayers ?? ""} disabled={!canEdit} /></label><label>Substitutes<input type="number" name="substitutePlayers" min="0" defaultValue={event.substitutePlayers} disabled={!canEdit} /></label></div><div className="rule-form-grid" hidden={tab !== "basics"}><label>Entries per division<input type="number" name="entriesPerDivision" min="1" defaultValue={event.entriesPerDivision} disabled={!canEdit} /></label><label>Gender eligibility<select name="genderEligibility" defaultValue={event.genderEligibility} disabled={!canEdit}><option value="men">Men</option><option value="women">Women</option><option value="mixed">Mixed</option><option value="open">Open</option></select></label></div><div className="rule-form-grid" hidden={tab !== "scoring"}><label>Scoring type<input name="scoringType" defaultValue={event.scoringType} disabled={!canEdit} /></label></div><div className="rule-form-grid" hidden={tab !== "basics"}><label>Tournament structure<input name="tournamentFormat" defaultValue={event.tournamentFormat} disabled={!canEdit} /></label><label>Match count · blank = variable<input name="matchCount" type="number" min="1" defaultValue={event.matchCount ?? ""} disabled={!canEdit} /></label></div><div className="rule-form-grid" hidden={tab !== "roster"}><label>Roster rules · one per line<textarea name="rosterRules" rows={5} defaultValue={event.rosterRules.join("\n")} disabled={!canEdit} /></label></div><div className="rule-form-grid" hidden={tab !== "scoring"}><label>Scoring rules · one per line<textarea name="scoringRules" rows={5} defaultValue={event.scoringRules.join("\n")} disabled={!canEdit} /></label></div><div hidden={tab !== "points"}><PointsRulesFields event={event} canEdit={canEdit} /><label className="publish-toggle"><input name="publishPoints" type="checkbox" defaultChecked={event.pointsPolicy.published} disabled={!canEdit} /><span>Publish this points policy</span></label></div>{canEdit && tab !== "results" && <div className="event-editor-footer"><span>One save covers every tab.</span><button className="primary-button" type="submit" disabled={busy}>Save event</button></div>}</form>{tab === "results" && <>{canEdit && <TopperBonusPanel data={data} event={event} refresh={refresh} toast={toast} />}{tallyKindFor(event) === "quiz" && <QuizPad data={data} event={event} canScore={role === "central-admin" || (role === "event-head" && canScoreEvent(access.assignments, event.id))} refresh={refresh} toast={toast} />}{tallyKindFor(event) === "hunt" && <HuntPad data={data} event={event} canScore={role === "central-admin" || (role === "event-head" && canScoreEvent(access.assignments, event.id))} refresh={refresh} toast={toast} />}{isJudgedEvent(data, event) ? (role === "central-admin" || (role === "event-head" && canScoreEvent(access.assignments, event.id)) ? <ResultsDesk data={data} event={event} central={role === "central-admin"} refresh={refresh} toast={toast} /> : <SealedResultsNote data={data} event={event} />) : <PlacingsPanel data={data} event={event} role={role} access={access} refresh={refresh} toast={toast} manual={!tallyKindFor(event)} />}{(canEdit || role === "scheduler") && <SemifinalDrawPanel data={data} event={event} refresh={refresh} toast={toast} />}{event.pointsPolicy.format !== "placings" && !canEdit && role !== "scheduler" && <EmptyState title="Results come from the matches" body="This event is decided by its fixtures. Score them from Live matches." />}</>}{canEdit && tab === "scoring" && <ScoringConfigForm event={event} refresh={refresh} toast={toast} />}{canEdit && sport && tab === "roster" && <form className="event-editor" onSubmit={(formEvent) => void saveSport(formEvent)}><div className="event-editor-head"><div><p className="eyebrow">Sport-wide participation · {sport.name}</p><h2>Cross-event limits</h2></div></div><div className="rule-form-grid"><label>Category<select name="category" defaultValue={sport.category}><option value="sport">Sport</option><option value="cultural">Cultural</option></select></label><label>Most formats per player (leave blank for no limit)<input name="maxFormatsPerPlayer" type="number" min="1" defaultValue={sport.maxFormatsPerPlayer ?? ""} /></label><label className="publish-toggle"><input name="countsTowardOverallSportsCap" type="checkbox" defaultChecked={sport.countsTowardOverallSportsCap} /><span>Counts toward division sports cap</span></label><label>Shared participation rules · one per line<textarea name="participationNotes" rows={5} defaultValue={sport.participationNotes.join("\n")} /></label></div><div className="event-editor-footer"><span>Cultural activities are excluded from the sports cap.</span><button className="primary-button" type="submit" disabled={busy}>Save sport rules</button></div></form>}</div>}</div></div>;
}

/** For a side that isn't ready 10 minutes after the scheduled start: records the rulebook walkover and finalizes the result. */
function WalkoverControl({ data, match, event, score, pending }: { data: CompetitionData; match: Fixture; event?: EventDefinition; score: (match: Fixture, input: MatchScoreInput) => Promise<boolean>; pending: boolean }) {
  if (match.status === "completed" || !event || event.pointsPolicy.format === "placings") return null;
  const walkover = event.scoringConfig?.walkoverScore ?? 0;
  const record = (winner: "a" | "b") => {
    const name = sectionName(data, winner === "a" ? match.sectionA : match.sectionB);
    const absent = sectionName(data, winner === "a" ? match.sectionB : match.sectionA);
    void score(match, { action: "walkover", walkoverWinner: winner });
  };
  return <details className="walkover-control"><summary>Team not ready 10 minutes after the start? Record a walkover</summary>
    <p className="scoring-rule-hint">{walkover ? `Recorded as ${walkover}–0 to the side that turned up.` : "Recorded as a win for the side that turned up."} Walkovers are left out of net run rate and score difference.</p>
    <div className="walkover-actions">{(["a", "b"] as const).map((side) => <InlineConfirm key={side} label={`${sideName(data, match, side)} turned up`} disabled={pending} title={`${sideName(data, match, side === "a" ? "b" : "a")} didn't turn up. Record a walkover win for ${sideName(data, match, side)}${walkover ? ` (${walkover}–0)` : ""} and finalize the result?`} confirmLabel="Record walkover" onConfirm={() => record(side)} />)}</div>
  </details>;
}

const pointsFormatLabels: Record<PointsFormat, string> = {
  league: "League · everyone plays everyone",
  "chit-ring": "Chit-ring · each plays two ring neighbours",
  "ring-group": "Ring-group · two teams per division, two groups",
  placings: "Placings · 1st to 5th (athletics, cultural)",
};
const outcomeLabels: Record<string, string> = {
  leagueWin: "League / ring match win", groupWin: "Group match win", leagueTopper: "Table-topper bonus",
  semifinalWin: "Semifinal win", semifinalLoss: "Semifinal loss", finalWin: "Final win", draw: "LEAGUE 1–1 · EACH SIDE GETS",
};

/** Structured points settings for one event. Rendered inside the central-admin event form; read-only for everyone else. */
function PointsRulesFields({ event, canEdit }: { event: EventDefinition; canEdit: boolean }) {
  const policy = event.pointsPolicy;
  const [format, setFormat] = useState<PointsFormat>(policy.format ?? (policy.places.length ? "placings" : "league"));
  const [unit, setUnit] = useState(String(policy.unit ?? policy.pointsByOutcome?.leagueWin ?? policy.pointsByOutcome?.groupWin ?? ""));
  const [splitDraw, setSplitDraw] = useState(policy.pointsByOutcome?.draw !== undefined);
  const [outcomes, setOutcomes] = useState<Record<string, number>>({ ...(policy.pointsByOutcome ?? {}) });
  const [places, setPlaces] = useState<number[]>(policy.places.length ? [...policy.places, 0, 0, 0, 0, 0].slice(0, 5) : [0, 0, 0, 0, 0]);
  const keys = format === "ring-group" ? ["groupWin", "semifinalWin", "semifinalLoss", "finalWin"] : ["leagueWin", "leagueTopper", "semifinalWin", "semifinalLoss", "finalWin"];
  const shownKeys = [...keys, ...(splitDraw ? ["draw"] : [])];
  const fromRulebook = () => setOutcomes(outcomePointsFor(format, Number(unit) || 0, { splitDraw }));
  return <fieldset className="points-rules" disabled={!canEdit}>
    <legend>Points rules {canEdit ? "· CENTRAL ADMIN ONLY" : "· READ ONLY"}</legend>
    <div className="rule-form-grid">
      <label>Points format<select name="pointsFormat" value={format} onChange={(change) => setFormat(change.target.value as PointsFormat)}>{(Object.keys(pointsFormatLabels) as PointsFormat[]).map((value) => <option key={value} value={value}>{pointsFormatLabels[value]}</option>)}</select></label>
      {format !== "placings" && <label>Win value X<input name="unit" type="number" min="0" step="0.5" value={unit} onChange={(change) => setUnit(change.target.value)} placeholder="e.g. 14" /></label>}
      <label>Walkover score · side that turned up<input name="walkoverScore" type="number" min="0" max="1000" defaultValue={event.scoringConfig?.walkoverScore ?? ""} placeholder="e.g. 3 for 3–0; 0 records the win only" /></label>
      {format === "placings" ? [1, 2, 3, 4, 5].map((place, index) => <label key={place}>{["1st", "2nd", "3rd", "4th", "5th"][index]} place<input name={`place:${place}`} type="number" min="0" value={places[index] ?? 0} onChange={(change) => setPlaces((list) => list.map((value, i) => i === index ? Number(change.target.value) : value))} /></label>)
        : shownKeys.map((key) => <label key={key}>{outcomeLabels[key]}<input name={`outcome:${key}`} type="number" min="0" step="0.5" value={outcomes[key] ?? ""} onChange={(change) => setOutcomes((current) => ({ ...current, [key]: Number(change.target.value) }))} /></label>)}
    </div>
    {format !== "placings" && <div className="points-rules-actions">
      <label className="publish-toggle"><input type="checkbox" checked={splitDraw} onChange={(change) => setSplitDraw(change.target.checked)} /><span>League matches can end level, like a 1–1 in chess. Each side gets half the points.</span></label>
      {canEdit && <button type="button" className="secondary-button" onClick={fromRulebook}>Fill from X: X · 1.5X · 0.5X · 2X</button>}
    </div>}
    <p className="rule-note">{format === "placings" ? "A division that doesn't take part is disqualified and gets no points, not 5th place." : format === "ring-group" ? "Ring-group events have no table-topper bonus. Points apply to results finalized after you save; earlier results keep the points they were awarded." : "The table-topper bonus is awarded from the panel below once every league match is final. Points apply to results finalized after you save."}</p>
  </fieldset>;
}

/** Shows the event's league table and lets the central admin award the table-topper bonus, with a note when the committee decides. */
function TopperBonusPanel({ data, event, refresh, toast }: { data: CompetitionData; event: EventDefinition; refresh: () => Promise<void>; toast: (message: string, error?: boolean) => void }) {
  const status = topperStatus(data, event);
  const [sectionId, setSectionId] = useState<SectionId | "">(status.suggested ?? "");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { setSectionId(status.suggested ?? ""); setNote(""); }, [event.id, status.suggested]);
  if (!status.eligible) return null;
  async function award() {
    if (!sectionId) return; setBusy(true);
    try { await api("/api/admin/bonus", "POST", { eventId: event.id, sectionId, note }); await refresh(); toast(`Table-topper bonus of ${status.bonus} awarded to ${sectionName(data, sectionId)}.`); }
    catch (error) { toast(error instanceof Error ? error.message : "The bonus could not be awarded.", true); }
    finally { setBusy(false); }
  }
  async function remove(reason: string) {
    setBusy(true);
    try { await api("/api/admin/bonus", "DELETE", { eventId: event.id, reason }); await refresh(); toast("Table-topper bonus removed."); }
    catch (error) { toast(error instanceof Error ? error.message : "The bonus could not be removed.", true); }
    finally { setBusy(false); }
  }
  const needsNote = !!sectionId && sectionId !== status.suggested;
  return <section className="event-editor topper-panel"><div className="event-editor-head"><div><p className="eyebrow">Table-topper bonus · {status.bonus} points</p><h2>{status.awarded ? `Awarded to ${sectionName(data, status.awarded.sectionId)}` : status.complete ? "Table complete" : `${status.played} of ${status.expected} league matches final`}</h2></div></div>
    {status.awarded ? <div className="topper-awarded"><p>{sectionName(data, status.awarded.sectionId)} received {status.awarded.points} on {formatFixtureDate(status.awarded.awardedAt)}{status.awarded.note ? ` · ${status.awarded.note}` : ""}.</p><InlineConfirm label="Remove bonus" disabled={busy} reasonLabel="Why remove the bonus?" placeholder="e.g. Awarded before the last league match was final" confirmLabel="Remove bonus" danger onConfirm={(reason) => void remove(reason)} /></div>
      : status.complete ? <div className="rule-form-grid">
        <p className="rule-note">{status.suggested ? `${sectionName(data, status.suggested)} tops the table on wins and the sport's tie-break.` : `Level at the top: ${status.contenders.map((id) => sectionName(data, id)).join(", ")}. Head-to-head or the committee decides; add their decision as a note.`}</p>
        <label>Division<select value={sectionId} onChange={(change) => setSectionId(change.target.value as SectionId)}><option value="">Choose</option>{data.sections.map((section) => <option key={section.id} value={section.id}>{section.name}</option>)}</select></label>
        <label>Note {needsNote || !status.suggested ? "· REQUIRED" : "· OPTIONAL"}<input value={note} onChange={(change) => setNote(change.target.value)} placeholder="e.g. Committee: head-to-head win over Division C" /></label>
        <button className="primary-button" disabled={busy || !sectionId || ((needsNote || !status.suggested) && !note.trim())} onClick={() => void award()}>Award bonus <ArrowRight size={14} /></button>
      </div> : <p className="rule-note">The bonus becomes available when every league match is final.</p>}
  </section>;
}

/**
 * Ring-group events: shows the top two of each group and the semifinals they lead to, with the same-division rule
 * applied (a division's two teams meet each other), and creates both semifinal fixtures. Scheduler or central admin.
 */
function SemifinalDrawPanel({ data, event, refresh, toast }: { data: CompetitionData; event: EventDefinition; refresh: () => Promise<void>; toast: (message: string, error?: boolean) => void }) {
  const draw = semifinalDraw(data, event);
  const existing = data.fixtures.filter((fixture) => fixture.eventId === event.id && fixture.stage === "semifinal");
  const [slots, setSlots] = useState([{ startsAt: "", venue: "" }, { startsAt: "", venue: "" }]);
  const [duration, setDuration] = useState(30);
  const [busy, setBusy] = useState(false);
  if (!draw.eligible) return null;
  const team = (t: { sectionId: SectionId; entry: number }) => teamName(data, t.sectionId, t.entry);
  async function create() {
    setBusy(true);
    try {
      await api("/api/fixtures/semifinals", "POST", { eventId: event.id, durationMinutes: duration, slots: slots.map((slot) => ({ startsAt: new Date(slot.startsAt).toISOString(), venue: slot.venue })) });
      await refresh(); toast("Both semifinals added to the schedule.");
    } catch (error) { toast(error instanceof Error ? error.message : "The semifinals could not be created.", true); }
    finally { setBusy(false); }
  }
  const ready = slots.every((slot) => slot.startsAt && slot.venue.trim()) && duration > 0;
  return <section className="event-editor topper-panel"><div className="event-editor-head"><div><p className="eyebrow">Group stage · semifinal draw</p><h2>{existing.length ? "Semifinals scheduled" : draw.complete ? "Groups complete" : `${draw.played} of ${draw.expected} group matches final`}</h2></div></div>
    {existing.length ? <ul className="semi-list">{existing.map((fixture) => <li key={fixture.id}>{sideName(data, fixture, "a")} v {sideName(data, fixture, "b")} · {formatFixtureDateTime(fixture.startsAt)} · {fixture.venue}</li>)}</ul>
      : !draw.complete ? <p className="rule-note">The semifinal draw appears when every group match is final. Mark each group match as Group 1 or Group 2 when you schedule it.</p>
      : draw.tiedAtCutoff ? <p className="rule-note">Teams are level for a semifinal place. Settle it as the sport's rulebook says, then add the semifinals by hand.</p>
      : <>
        <ul className="semi-list">{draw.semis.map(([a, b], index) => <li key={index}><strong>Semifinal {index + 1}</strong> · {team(a)} v {team(b)}</li>)}</ul>
        <p className="rule-note">{draw.sameDivision.length ? `Same-division rule: ${draw.sameDivision.map((id) => sectionName(data, id)).join(" and ")} has both teams in the semis, so they play each other and the final is between two different divisions.` : "Group 1 winner v Group 2 runner-up, and Group 2 winner v Group 1 runner-up."}</p>
        <div className="rule-form-grid">{slots.map((slot, index) => <div key={index} className="semi-slot"><label>Semifinal {index + 1} · DATE &amp; TIME<input type="datetime-local" value={slot.startsAt} onChange={(change) => setSlots((list) => list.map((item, i) => i === index ? { ...item, startsAt: change.target.value } : item))} /></label><label>Venue<input value={slot.venue} onChange={(change) => setSlots((list) => list.map((item, i) => i === index ? { ...item, venue: change.target.value } : item))} placeholder="e.g. Recreation Centre" /></label></div>)}<label>Match length · min<input type="number" min="1" value={duration} onChange={(change) => setDuration(Number(change.target.value))} /></label></div>
        <div className="event-editor-footer"><span>Points: semi win 1.5X, semi loss 0.5X.</span><button className="primary-button" disabled={busy || !ready} onClick={() => void create()}>Add both semifinals <ArrowRight size={14} /></button></div>
      </>}
  </section>;
}

function ScoringConfigForm({ event, refresh, toast }: { event: EventDefinition; refresh: () => Promise<void>; toast: (message: string, error?: boolean) => void }) {
  const fields = [["inningsCount", "Innings"], ["oversPerInnings", "Overs per innings"], ["wicketsPerInnings", "Wickets per innings"], ["pointsToWin", "Points to win a set"], ["winBy", "Win by"], ["setsToWin", "Sets to win the match"], ["periods", "Periods / halves"], ["periodMinutes", "Minutes per period"]] as const;
  const [busy, setBusy] = useState(false);
  async function save(eventForm: FormEvent<HTMLFormElement>) {
    eventForm.preventDefault(); const form = new FormData(eventForm.currentTarget); setBusy(true);
    const scoringConfig: Partial<NonNullable<EventDefinition["scoringConfig"]>> = Object.fromEntries(fields.map(([key]) => [key, String(form.get(key) ?? "").trim() ? Number(form.get(key)) : undefined]));
    scoringConfig.enabledActions = String(form.get("enabledActions") ?? "").split(",").map((value) => value.trim()).filter(Boolean) as NonNullable<EventDefinition["scoringConfig"]>["enabledActions"];
    try { await api("/api/admin/events/scoring-config", "PUT", { eventId: event.id, scoringConfig }); await refresh(); toast("Sport-specific scoring settings saved."); }
    catch (error) { toast(error instanceof Error ? error.message : "Scoring settings could not be saved.", true); }
    finally { setBusy(false); }
  }
  return <form className="event-editor" onSubmit={(formEvent) => void save(formEvent)}><div className="event-editor-head"><div><p className="eyebrow">Live scorecard rules</p><h2>Scoring format limits</h2></div></div><div className="rule-form-grid">{fields.map(([key, label]) => <label key={key}>{label}<input name={key} type="number" min="1" max="1000" defaultValue={event.scoringConfig?.[key] ?? ""} /></label>)}<label className="config-actions-field">Enabled actions · comma separated<input name="enabledActions" defaultValue={event.scoringConfig?.enabledActions?.join(", ") ?? ""} placeholder="Blank uses sport defaults" /></label></div><div className="event-editor-footer"><span>Leave blank to use the sport's standard settings.</span><button className="primary-button" type="submit" disabled={busy}>Save scorecard settings <ArrowRight size={14} /></button></div></form>;
}

function AccessView({ data, role, refresh, toast }: { data: CompetitionData; role: Role; refresh: () => Promise<void>; toast: (message: string, error?: boolean) => void }) {
  const [text, setText] = useState("email,role,scope\norganizer@spjimr.org,section admin,Section A\nscorekeeper@spjimr.org,event head,Cricket\nscheduler@spjimr.org,scheduler,");
  const [parsed, setParsed] = useState<Array<{ email: string; role: Role; scopeId?: string; scopeLabel?: string; active: boolean }> | null>(null);
  const [issues, setIssues] = useState<Array<{ row: number; message: string }>>([]);
  const [busy, setBusy] = useState(false);
  const canEdit = role === "central-admin";
  async function preview(formData?: FormData) {
    const body = formData ?? new FormData(); if (!formData) body.set("text", text);
    try { const response = await fetch("/api/admin/assignments/preview", { method: "POST", body }); const result = await response.json(); if (!response.ok) throw new Error(result.error); setParsed(result.assignments); setIssues(result.issues); }
    catch (error) { toast(error instanceof Error ? error.message : "Import could not be previewed.", true); }
  }
  async function removeAssignment(item: CompetitionData["assignments"][number]) {
    try {
      await api("/api/admin/assignments", "DELETE", { email: item.email, role: item.role, scopeId: item.scopeId });
      await refresh();
      toast(`Removed ${roleNames[item.role]} access for ${item.email}.`);
    } catch (error) { toast(error instanceof Error ? error.message : "Assignment could not be removed.", true); }
  }
  async function apply() {
    if (!parsed?.length || issues.length) return; setBusy(true);
    try { await api("/api/admin/assignments", "PUT", { assignments: parsed }); await refresh(); setParsed(null); toast(`${parsed.length} assignments applied.`); }
    catch (error) { toast(error instanceof Error ? error.message : "Assignments could not be saved.", true); }
    finally { setBusy(false); }
  }
  return <div className="view-content"><div className="page-title-row"><div><p className="eyebrow">People <span>·</span> Role assignments</p><h1>Access control</h1><p className="subtitle">SPJIMR accounts only. Organizers can change only the divisions or events assigned to them.</p></div>{canEdit && <span className="admin-badge"><Shield size={14} /> Central admin</span>}</div><div className="access-layout"><section className="role-overview">{canEdit && <div className="assignment-roster"><p className="eyebrow">Current access · {data.assignments.length}</p>{data.assignments.length ? data.assignments.map((item, index) => <div className="assignment-row" key={`${item.email}-${item.role}-${item.scopeId ?? "global"}-${index}`}><div><strong>{item.email}</strong><small>{roleNames[item.role]} · {item.scopeLabel ?? "All areas"} · {item.active ? "Active" : "Inactive"}</small></div><button className="text-button" disabled={!item.active} onClick={() => void removeAssignment(item)}>Remove</button></div>) : <EmptyState title="No one assigned yet" body="Import the organizer spreadsheet below. Division admins, event heads and schedulers get their tools as soon as they sign in." />}</div>}<h2>What each role can do</h2>{[["Spectator", "College sign-in · read competition"], ["Division admin", "Up to 3 per division · roster entries"], ["Event head", "Assigned sport / event · live scoring"], ["Scheduler", "Fixtures · dates · venues"], ["Judge", "Assigned Stage events · private marking pad"], ["Central admin", "All divisions · all operations"]].map(([name, detail]) => <div className="role-map-row" key={name}><span className="role-map-dot" /><div><strong>{name}</strong><small>{detail}</small></div><ChevronRight size={15} /></div>)}</section><section className="import-panel"><div className="import-panel-head"><div><p className="eyebrow">Bulk assignments</p><h2>Import your team</h2></div><span className="college-domain">@spjimr.org</span></div><p className="import-copy">Paste a list or upload an Excel workbook. Review every role and scope before saving.</p>{canEdit ? <><textarea value={text} onChange={(event) => { setText(event.target.value); setParsed(null); }} rows={5} aria-label="Assignment list" /><label className="upload-file"><input type="file" accept=".xlsx,.csv,.tsv,.txt" onChange={(event) => { const file = event.currentTarget.files?.[0]; if (!file) return; if (file.name.toLowerCase().endsWith(".xlsx")) { const form = new FormData(); form.set("file", file); void preview(form); } else { void file.text().then((content) => { setText(content); const form = new FormData(); form.set("text", content); return preview(form); }); } }} /><Plus size={14} /> Upload Excel / TEXT</label><div className="import-actions"><span>email, role, scope · section-admin, event-head, scheduler</span><button className="primary-button" onClick={() => void preview()}>Preview import <ArrowRight size={14} /></button></div>{issues.length > 0 && <div className="import-errors">{issues.map((issue) => <p key={`${issue.row}-${issue.message}`}>Row {issue.row}: {issue.message}</p>)}</div>}{parsed && <div className="import-preview"><div className="preview-title"><strong>Import preview</strong><span>{parsed.length} valid · {issues.length} issues</span></div><div className="preview-table">{parsed.map((item, index) => <div key={`${item.email}-${index}`}><strong>{item.email}</strong><span>{roleNames[item.role]}</span><span>{item.scopeLabel ?? "Global"}</span></div>)}</div><button className="primary-button" disabled={busy || issues.length > 0 || parsed.length === 0} onClick={() => void apply()}>Apply assignments <Check size={14} /></button></div>}</> : <div className="read-only-note"><LockKeyhole size={16} /> Central admin manages organizer assignments.</div>}</section></div><div className="access-footnote"><LockKeyhole size={15} /><span>Sign-in: Google Workspace · Restrict to <strong>@spjimr.org</strong> · Unassigned college accounts are spectators.</span></div></div>;
}

function eventSportName(data: CompetitionData, eventId: string) {
  const event = data.events.find((item) => item.id === eventId);
  const sport = data.sports.find((item) => item.id === event?.sportId)?.name ?? "Event";
  return event && event.name !== sport ? `${sport} · ${event.name}` : sport;
}
function sectionName(data: CompetitionData, id: string) { return data.sections.find((section) => section.id === id)?.name ?? id; }
/** A division's name, with its team number in group-format events ("Division A · Team 2"). */
function teamName(data: CompetitionData, id: string, entry?: number) { return entry ? `${sectionName(data, id)} · Team ${entry}` : sectionName(data, id); }
function sideName(data: CompetitionData, fixture: Fixture, side: "a" | "b") { return side === "a" ? teamName(data, fixture.sectionA, fixture.entryA) : teamName(data, fixture.sectionB, fixture.entryB); }
function sectionCode(data: CompetitionData, id: string) { return data.sections.find((section) => section.id === id)?.code ?? "—"; }
function formatDayKey(iso: string) { const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(iso)); const values = Object.fromEntries(parts.map((part) => [part.type, part.value])); return `${values.year}-${values.month}-${values.day}`; }
function formatFixtureDate(iso: string) { return new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", weekday: "short", day: "numeric", month: "short" }).format(new Date(iso)); }
function formatFixtureDateShort(iso: string) { return new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", weekday: "short", day: "numeric" }).format(new Date(iso)); }
function formatFixtureDateTime(iso: string) { return new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso)); }
function formatTime(iso: string) { return new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso)); }
function localDateTime(iso: string) { const date = new Date(iso); return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16); }
function formatDateField(date: Date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }
function initials(name: string) { return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "DW"; }
function scoringLabel(value: string) { return ({ innings: "Innings · runs & wickets", periods: "Periods · team points", sets: "Sets · rally scoring", halves: "Halves · goals", games: "Games · rally points", goals: "Goals · match target" } as Record<string, string>)[value] ?? "Sport score"; }



