"use client";

import {
  Activity, ArrowRight, Bell, CalendarDays, Check, ClipboardList,
  ChevronDown, ChevronLeft, ChevronRight, CircleHelp, Clock3, Crown, Filter,
  Flag, Gauge, LayoutDashboard, LockKeyhole, Medal, MoreHorizontal, Plus,
  Radio, Search, Settings2, Shield, SlidersHorizontal, Sparkles, Trophy, Users,
  Volleyball, X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type { AuditEntry, CompetitionData, CricketInnings, EventDefinition, Fixture, MatchEventKind, MatchScoreInput, ParticipantGender, Role, SectionId, UserAccess } from "@/lib/domain";
import { finalizedFixturesForEvents, mergeCompetitionData, projectScoreAction, retryDelayMs, shouldPollFixture } from "@/lib/live-scoring-utils";

type View = "overview" | "live" | "schedule" | "standings" | "entries" | "events" | "access" | "audit";
const roleNames: Record<Role, string> = {
  spectator: "Spectator",
  "section-admin": "Section admin",
  "event-head": "Event head",
  scheduler: "Scheduler",
  "central-admin": "Central admin",
};

async function api<T>(url: string, method = "GET", body?: unknown): Promise<T> {
  const response = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? "The request could not be completed.");
  return result as T;
}

export default function Dashboard({ data: initialData, access, previewMode }: { data: CompetitionData; access: UserAccess; previewMode: boolean }) {
  const [data, setData] = useState(initialData);
  const [view, setView] = useState<View>("overview");
  const [role, setRole] = useState<Role>(previewMode ? "central-admin" : access.assignments.find((item) => item.role !== "spectator")?.role ?? "spectator");
  const [notice, setNotice] = useState("");
  const [noticeError, setNoticeError] = useState(false);
  const [search, setSearch] = useState("");
  const [filterSport, setFilterSport] = useState("all");
  const [filterSection, setFilterSection] = useState("all");
  const [filterDay, setFilterDay] = useState("all");
  const [filterVenue, setFilterVenue] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [selectedMatchId, setSelectedMatchId] = useState(initialData.fixtures.find((item) => item.status === "live")?.id ?? initialData.fixtures[0]?.id ?? "");
  const [pendingMatches, setPendingMatches] = useState<string[]>([]);
  const pendingMatchIds = useRef(new Set<string>());
  const [connectionState, setConnectionState] = useState<"connected" | "reconnecting">("connected");
  const revisions = useRef(new Map(initialData.fixtures.map((fixture) => [fixture.id, fixture.updatedAt])));

  useEffect(() => {
    let failures = 0;
    let cancelled = false;
    const mergeCompetition = (incoming: CompetitionData) => setData((current) => mergeCompetitionData(current, incoming, selectedMatchId, revisions.current));
    const competitionTimer = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void api<{ data: CompetitionData }>("/api/competition").then(({ data: incoming }) => { failures = 0; setConnectionState("connected"); mergeCompetition(incoming); }).catch(() => { failures += 1; setConnectionState("reconnecting"); });
    }, 30_000);
    let liveTimer = 0;
    const refreshSelected = async () => {
      const match = data.fixtures.find((item) => item.id === selectedMatchId);
      if (!match || !shouldPollFixture(match.status, document.visibilityState === "visible")) return;
      const wait = retryDelayMs(failures);
      try {
        const headers = match.updatedAt ? { "If-None-Match": `"${match.updatedAt}"` } : undefined;
        const response = await fetch(`/api/matches/${match.id}`, { headers, cache: "no-store" });
        if (response.status === 304) { failures = 0; setConnectionState("connected"); return; }
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error ?? "Match refresh failed");
        const next = payload.match as Fixture;
        revisions.current.set(next.id, next.updatedAt);
        setData((current) => ({ ...current, fixtures: current.fixtures.map((fixture) => fixture.id === next.id ? next : fixture) }));
        failures = 0; setConnectionState("connected");
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
    { id: "live", label: "Live matches", icon: Radio, group: "COMPETITION" },
    { id: "schedule", label: "Schedule", icon: CalendarDays },
    { id: "standings", label: "Standings", icon: Trophy },
    { id: "entries", label: "Section entries", icon: Users, group: "OPERATIONS" },
    { id: "events", label: "Sports & events", icon: Volleyball },
    { id: "access", label: "People & access", icon: Shield, group: "ADMIN" },
    ...(role === "central-admin" ? [{ id: "audit" as View, label: "Scoring audit", icon: ClipboardList, group: "ADMIN" }] : []),
  ];

  const shownFixtures = useMemo(() => data.fixtures.filter((fixture) => {
    const event = data.events.find((item) => item.id === fixture.eventId);
    const sport = data.sports.find((item) => item.id === event?.sportId);
    const names = `${sport?.name ?? ""} ${fixture.venue} ${sectionName(data, fixture.sectionA)} ${sectionName(data, fixture.sectionB)}`.toLowerCase();
    const bySport = filterSport === "all" || event?.sportId === filterSport;
    const bySection = filterSection === "all" || fixture.sectionA === filterSection || fixture.sectionB === filterSection;
    const bySearch = !search || names.includes(search.toLowerCase());
    const day = formatDayKey(fixture.startsAt);
    const byDay = filterDay === "all" || day === filterDay;
    const byVenue = filterVenue === "all" || fixture.venue === filterVenue;
    const byStatus = filterStatus === "all" || fixture.status === filterStatus;
    return bySport && bySection && bySearch && byDay && byVenue && byStatus;
  }), [data, filterSport, filterSection, filterDay, filterVenue, filterStatus, search]);

  const dismissNotice = () => { setNotice(""); setNoticeError(false); };
  const toast = (message: string, error = false) => { setNotice(message); setNoticeError(error); window.setTimeout(() => setNotice(""), 5000); };
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
      toast(input.action === "submit" ? "Result finalized and event points awarded." : "Live score saved.");
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
        <a className="wordmark" href="/" aria-label="Division Wars home"><span className="wordmark-icon">DW</span><span>DIVISION <b>WARS</b></span></a>
        <div className="edition-tag"><span className="edition-dot" /> FIRST-YEAR EDITION</div>
        <nav aria-label="Main navigation" className="main-nav">
          {navItems.map((item) => <div key={item.id}>{item.group && <p className="nav-group">{item.group}</p>}<button className={`nav-link ${view === item.id ? "selected" : ""}`} onClick={() => setView(item.id)}><item.icon size={17} strokeWidth={1.8} /><span>{item.label}</span>{item.id === "live" && <i className="nav-live-dot" />}</button></div>)}
        </nav>
        <div className="sidebar-bottom">
          <div className="division-card"><div className="division-card-head"><Flag size={14} /><span>COMPETITION SETUP</span></div><strong>First year</strong><small>{data.events.length} events · {data.entries.filter((item) => item.status === "submitted").length} submitted entries</small><div className="division-streak"><span style={{ width: `${data.events.length ? Math.min(100, (data.entries.filter((item) => item.status === "submitted").length / (data.events.length * data.sections.length)) * 100) : 0}%` }} /></div><small className="rank-line">{data.sections.length} sections <span>{data.fixtures.length} fixtures</span></small></div>
          {(previewMode || access.assignments.length > 2) && <label className="preview-role"><span>{previewMode ? "VIEW AS" : "YOUR ROLE"}</span><select value={role} onChange={(event) => setRole(event.target.value as Role)} aria-label="Active workspace">{(previewMode ? Object.entries(roleNames).map(([id, name]) => [id as Role, name] as [Role, string]) : [...new Set(access.assignments.map((item) => item.role))].map((item) => [item, roleNames[item]] as [Role, string])).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>}
          <div className="profile-row"><span className="avatar">{initials(access.name)}</span><span className="profile-copy"><strong>{access.name}</strong><small>{roleNames[role]}</small></span><button className="icon-button" aria-label="Profile options"><MoreHorizontal size={18} /></button></div>
        </div>
      </aside>

      <section className="main-column">
        <header className="topbar">
          <div className="crumb"><span>DIVISION WARS</span><ChevronRight size={14} /><b>{navItems.find((item) => item.id === view)?.label.toUpperCase()}</b></div>
          <div className="topbar-actions">{access.email === "guest@public.invalid" && <a className="google-sign-in-link" href="/login">Google sign-in <ArrowRight size={13} /></a>}<label className="search-box"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search matches, sports…" aria-label="Search matches and sports" /><kbd>⌘ K</kbd></label><button className="icon-button notification-button" aria-label="Notifications"><Bell size={18} /><i /></button><span className="topbar-avatar">{initials(access.name)}</span></div>
        </header>
        {previewMode && <div className="preview-banner"><Sparkles size={14} /><span>DEMO ACCESS</span><p>Organizer preview access is enabled · displayed competition data comes from this workspace</p></div>}
        {notice && <div className={`toast ${noticeError ? "toast-error" : ""}`} role="status"><span>{noticeError ? <X size={16} /> : <Check size={16} />}</span>{notice}<button onClick={dismissNotice} aria-label="Dismiss message"><X size={15} /></button></div>}

        {view === "overview" && <Overview data={data} setView={setView} setSelectedMatchId={setSelectedMatchId} />}
        {view === "live" && <LiveView data={data} role={role} selectedMatch={selectedMatch} setSelectedMatchId={setSelectedMatchId} score={score} pending={pendingMatches.includes(selectedMatch?.id ?? "")} connectionState={connectionState} />}
        {view === "schedule" && <ScheduleView data={data} fixtures={shownFixtures} role={role} filterSport={filterSport} setFilterSport={setFilterSport} filterSection={filterSection} setFilterSection={setFilterSection} filterDay={filterDay} setFilterDay={setFilterDay} filterVenue={filterVenue} setFilterVenue={setFilterVenue} filterStatus={filterStatus} setFilterStatus={setFilterStatus} refresh={refreshData} toast={toast} />}
        {view === "standings" && <StandingsView data={data} />}
        {view === "audit" && role === "central-admin" && <AuditView data={data} score={score} openFixture={(id) => { setSelectedMatchId(id); setView("live"); }} />}
        {view === "entries" && <EntriesView data={data} role={role} access={access} refresh={refreshData} toast={toast} />}
        {view === "events" && <EventsView data={data} role={role} refresh={refreshData} toast={toast} />}
        {view === "access" && <AccessView data={data} role={role} refresh={refreshData} toast={toast} />}
      </section>
    </main>
  );
}

function Overview({ data, setView, setSelectedMatchId }: { data: CompetitionData; setView: (view: View) => void; setSelectedMatchId: (id: string) => void }) {
  const live = data.fixtures.filter((item) => item.status === "live");
  const upcoming = [...data.fixtures].filter((item) => item.status === "scheduled").sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const finalized = data.fixtures.filter((match) => match.status === "completed" && match.resultConfirmed);
  const award = (sectionId: SectionId, category?: "sport" | "cultural") => finalized.reduce((sum, match) => {
    const event = data.events.find((item) => item.id === match.eventId);
    const sport = data.sports.find((item) => item.id === event?.sportId);
    if (!event || (category && sport?.category !== category)) return sum;
    return sum + (match.sectionA === sectionId ? match.awardedPointsA ?? 0 : match.sectionB === sectionId ? match.awardedPointsB ?? 0 : 0);
  }, 0);
  const points = data.sections.map((section) => award(section.id));
  const rankedSections = [...data.sections].sort((a,b) => award(b.id)-award(a.id));
  const leader = rankedSections[0];
  return <div className="view-content">
    <div className="page-title-row"><div><p className="eyebrow">LIVE NOW <span>·</span> FIRST YEAR</p><h1>The race is on<span className="title-period">.</span></h1><p className="subtitle">Every point moves the board. Here’s what’s happening across campus.</p></div><button className="date-button"><CalendarDays size={16} /> TODAY · LIVE SCHEDULE <ChevronDown size={15} /></button></div>
    <div className="pulse-strip"><div className="pulse-label"><span className="live-pulse" /> LIVE ACROSS CAMPUS</div><div className="pulse-stat"><strong>{live.length}</strong><span>matches live</span></div><div className="pulse-stat"><strong>{upcoming.length}</strong><span>up next</span></div><div className="pulse-stat"><strong>{data.sports.filter((sport) => sport.category === "sport").length}</strong><span>sports</span></div><div className="pulse-right">RULEBOOK <strong>{data.events.length} EVENTS</strong></div></div>

    <div className="overview-grid">
      <section className="live-feature">
        <div className="feature-top"><div className="feature-live"><span className="live-pulse" /> ON COURT NOW</div><span className="feature-sport">{live[0] ? eventSportName(data, live[0].eventId) : "MATCH CENTER"} <span>·</span> {live[0]?.venue ?? "Awaiting schedule"}</span><button className="icon-button" aria-label="More match options"><MoreHorizontal size={18} /></button></div>
        {live[0] ? <div className="match-feature-main"><div className="team-lockup"><span className="team-mark lime">{sectionCode(data, live[0].sectionA)}</span><div><small>{sectionName(data, live[0].sectionA).toUpperCase()}</small><strong>Section {sectionCode(data, live[0].sectionA)}</strong></div></div><div className="scoreline"><div className="score-numbers"><strong>{live[0].scoreA}</strong><span>:</span><strong>{live[0].scoreB}</strong></div><div className="match-time"><span className="live-pill">LIVE</span><span>{live[0].periodLabel}</span><span className="time-separator">·</span><span>{live[0].clockLabel}</span></div></div><div className="team-lockup team-away"><span className="team-mark coral">{sectionCode(data, live[0].sectionB)}</span><div><small>{sectionName(data, live[0].sectionB).toUpperCase()}</small><strong>Section {sectionCode(data, live[0].sectionB)}</strong></div></div></div> : <div className="empty-live"><Radio size={22} /><strong>No live matches at this moment</strong><span>Check the schedule for the next fixture.</span></div>}
        <div className="feature-footer"><span><Activity size={14} /> SCORE UPDATES LIVE</span><button className="text-button" onClick={() => { if (live[0]) setSelectedMatchId(live[0].id); setView("live"); }}>OPEN MATCH CENTER <ArrowRight size={14} /></button></div>
      </section>
      <section className="race-panel">
        <div className="section-heading"><div><p className="eyebrow">THE DIVISION RACE</p><h2>Every point counts.</h2></div><button className="subtle-button" onClick={() => setView("standings")}>FULL BOARD <ArrowRight size={14} /></button></div>
        <div className="ribbon-leader"><div className="leader-copy"><span className="leader-crown"><Crown size={15} /></span><div><small>OVERALL LEADER</small><strong>{leader ? leader.name : "Awaiting finalized results"}</strong></div></div><div className="leader-score"><strong>{leader ? points[data.sections.findIndex((section) => section.id === leader.id)] : 0}</strong><span>PTS</span></div><div className="leader-tick" /></div>
        <div className="mini-standings">{rankedSections.map((section, index) => <div className="mini-rank" key={section.id}><span className="mini-rank-number">0{index + 1}</span><span className="section-color-dot" style={{ background: section.color }} /><strong>{section.name}</strong><div className="rank-track"><i style={{ width: `${Math.max(3, Math.round(award(section.id) / Math.max(1, points[0] ?? 0) * 100))}%`, background: section.color }} /></div><span className="mini-points">{award(section.id)} PTS</span><span className="rank-change flat">—</span></div>)}</div>
        <div className="points-note"><span>Sports {leader ? award(leader.id,"sport") : 0} · Cultural {leader ? award(leader.id,"cultural") : 0} · Combined {leader ? award(leader.id) : 0}</span><button onClick={() => setView("standings")}><Settings2 size={13} /> FULL BREAKDOWN</button></div>
      </section>
    </div>

    <div className="lower-grid"><section className="next-panel"><div className="section-heading"><div><p className="eyebrow">THE RUN OF SHOW</p><h2>Next up on campus</h2></div><button className="subtle-button" onClick={() => setView("schedule")}>FULL SCHEDULE <ArrowRight size={14} /></button></div><FixtureList data={data} fixtures={upcoming.slice(0, 4)} /></section><section className="sports-panel"><div className="section-heading"><div><p className="eyebrow">EVENT CATALOG</p><h2>{data.events.length} events · {data.sections.length} sections</h2></div><button className="icon-button" aria-label="Browse all events" onClick={() => setView("events")}><ArrowRight size={17} /></button></div><div className="sport-grid">{data.events.slice(0, 8).map((event, index) => <button className="sport-chip" key={event.id} onClick={() => setView("events")}><span className={`sport-index s${index}`}>{String(index + 1).padStart(2, "0")}</span><span>{event.name}</span><ChevronRight size={14} /></button>)}</div></section></div>
    <footer className="footer-note"><span>DIVISION WARS <i>·</i> FIRST-YEAR EDITION</span><span>BUILT FOR THE MOMENT <span className="footer-live">●</span></span></footer>
  </div>;
}

function LiveView({ data, role, selectedMatch, setSelectedMatchId, score, pending, connectionState }: { data: CompetitionData; role: Role; selectedMatch?: Fixture; setSelectedMatchId: (id: string) => void; score: (match: Fixture, input: MatchScoreInput) => Promise<boolean>; pending: boolean; connectionState: "connected" | "reconnecting" }) {
  const event = selectedMatch && data.events.find((item) => item.id === selectedMatch.eventId);
  const canScore = (role === "event-head" || role === "central-admin") && event?.sportId !== "athletics";
  return <div className="view-content"><div className="page-title-row"><div><p className="eyebrow">MATCH CENTER <span>·</span> {data.fixtures.filter((match) => match.status === "live").length} LIVE</p><h1>Live matches<span className="title-period">.</span></h1><p className="subtitle">Scores move here as the game moves. Select a fixture to follow it.</p></div><span role="status" className={`score-connection ${connectionState}`}>{connectionState === "connected" ? "● LIVE SYNC" : "● RECONNECTING · SHOWING LAST SAVED SCORE"}</span></div>
    <div className="live-layout"><div className="match-list">{data.fixtures.map((match) => <button key={match.id} className={`match-list-item ${selectedMatch?.id === match.id ? "active" : ""}`} onClick={() => setSelectedMatchId(match.id)}><div className="match-list-top"><span className={`status-dot ${match.status}`} />{match.status === "live" ? "LIVE NOW" : match.status === "scheduled" ? formatTime(match.startsAt) : fixtureStatusLabel(match.status)}<span>{eventSportName(data, match.eventId)}</span></div><div className="match-list-score"><span>{sectionName(data, match.sectionA)}</span><strong>{matchHeadlineScore(data, match, "a")} — {matchHeadlineScore(data, match, "b")}</strong><span>{sectionName(data, match.sectionB)}</span></div><small>{match.venue} · {match.periodLabel}</small></button>)}</div>
      <div className="selected-match">{selectedMatch ? <><div className="selected-match-head"><span className={`match-status-tag ${selectedMatch.status}`}><i />{fixtureStatusLabel(selectedMatch.status)}</span><span>{event?.name}</span><button className="icon-button" aria-label="Match menu"><MoreHorizontal size={18} /></button></div><div className="scoreboard-large"><div className="score-side"><span className="team-mark lime">{sectionCode(data, selectedMatch.sectionA)}</span><small>{sectionName(data, selectedMatch.sectionA).toUpperCase()}</small><strong>{matchHeadlineScore(data, selectedMatch, "a")}</strong><span className="score-side-name">Section {sectionCode(data, selectedMatch.sectionA)}</span></div><div className="versus"><span>VS</span><div className="clock-face">{selectedMatch.status === "scheduled" ? "UP NEXT" : selectedMatch.clockLabel}<small>{event?.sportId === "cricket" ? `${Math.floor((selectedMatch.scorecard?.legalBallsA ?? 0) / 6)}.${(selectedMatch.scorecard?.legalBallsA ?? 0) % 6} ov · ${Math.floor((selectedMatch.scorecard?.legalBallsB ?? 0) / 6)}.${(selectedMatch.scorecard?.legalBallsB ?? 0) % 6} ov` : selectedMatch.scorecard && ["volleyball", "throwball", "badminton", "table-tennis", "lawn-tennis", "pickleball", "squash"].includes(event?.sportId ?? "") ? `Points ${selectedMatch.scorecard.pointsA}-${selectedMatch.scorecard.pointsB} · ${selectedMatch.periodLabel}` : selectedMatch.periodLabel}</small></div></div><div className="score-side"><span className="team-mark coral">{sectionCode(data, selectedMatch.sectionB)}</span><small>{sectionName(data, selectedMatch.sectionB).toUpperCase()}</small><strong>{matchHeadlineScore(data, selectedMatch, "b")}</strong><span className="score-side-name">Section {sectionCode(data, selectedMatch.sectionB)}</span></div></div><div className="scoreboard-meta"><span><Flag size={14} /> {selectedMatch.venue}</span><span><Clock3 size={14} /> {formatFixtureDateTime(selectedMatch.startsAt)}</span><span><Activity size={14} /> {selectedMatch.status === "live" ? "Updating live" : selectedMatch.status === "completed" ? "Result finalized" : "Fixture scheduled"}</span></div>
        {canScore ? <SportScoreConsole data={data} match={selectedMatch} event={event} score={score} pending={pending} /> : <>{event?.sportId === "cricket" && <CricketReadOnlyScorecard data={data} match={selectedMatch} />}<MatchEventFeed data={data} match={selectedMatch} score={score} /><div className="read-only-note"><LockKeyhole size={16} /><span>Score entry is available to the assigned event head.</span></div></>}</> : <div className="empty-state"><Radio /><strong>No fixture selected</strong><span>Choose a match from the list.</span></div>}</div></div>
    </div>;
}

function SportScoreConsole({ data, match, event, score, pending }: { data: CompetitionData; match: Fixture; event?: EventDefinition; score: (match: Fixture, input: MatchScoreInput) => Promise<boolean>; pending: boolean }) {
  const sport = data.sports.find((item) => item.id === event?.sportId);
  const [side, setSide] = useState<"a" | "b">("a");
  const [playerId, setPlayerId] = useState("");
  const [secondaryPlayerId, setSecondaryPlayerId] = useState("");
  const [points, setPoints] = useState(1);
  const [kind, setKind] = useState("score");
  const [detail, setDetail] = useState("");
  const [cricketExtra, setCricketExtra] = useState("wide");
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
  if (sportId === "cricket") return <CricketScoreConsole data={data} match={match} event={event} score={score} pending={pending} />;
  return <div className="scoring-console"><div className="console-title"><div><p className="eyebrow">LIVE SCORECARD · {sport?.name ?? "MATCH"}</p><strong>{match.status === "scheduled" ? "Ready to start" : match.status === "live" ? "Record match event" : "Scoring closed"}</strong></div><span className="console-access"><LockKeyhole size={13} /> ASSIGNED EVENT ONLY</span></div>
    {match.status === "scheduled" && <button className="score-add" disabled={pending} onClick={() => void score(match, { action: "start" })}>{pending ? "SAVING…" : "START MATCH"}</button>}
    {match.status === "live" && <><div className="scorecard-controls"><label><span>SECTION</span><select value={side} onChange={(e) => { setSide(e.target.value as "a" | "b"); setPlayerId(""); }}><option value="a">{sectionName(data, match.sectionA)}</option><option value="b">{sectionName(data, match.sectionB)}</option></select></label><label><span>EVENT</span><select value={kind} onChange={(e) => setKind(e.target.value)}>{kinds.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label><span>PLAYER · OPTIONAL</span><select value={playerId} onChange={(e) => setPlayerId(e.target.value)}><option value="">Team-only / unattributed</option>{players.map((player) => <option key={player.id} value={player.id}>{player.name}</option>)}</select></label><label><span>{sportId === "cricket" ? "BOWLER / FIELDER · OPTIONAL" : sportId === "football" ? "ASSIST / SECOND PLAYER · OPTIONAL" : "SECOND PLAYER · OPTIONAL"}</span><select value={secondaryPlayerId} onChange={(e) => setSecondaryPlayerId(e.target.value)}><option value="">None</option>{(sportId === "cricket" ? opponentPlayers : players).map((player) => <option key={player.id} value={player.id}>{player.name}</option>)}</select></label>
      {kind === "extra" && sportId === "cricket" && <label><span>EXTRA TYPE</span><select value={cricketExtra} onChange={(e) => { setCricketExtra(e.target.value); setDetail(e.target.value); setPoints(1); }}><option value="wide">Wide</option><option value="no-ball">No-ball</option><option value="bye">Bye</option><option value="leg-bye">Leg bye</option><option value="penalty">Penalty</option></select></label>}
      {kind === "run" || kind === "extra" || kind === "basket" || kind === "free-throw" || kind === "rally-point" || kind === "set-point" || kind === "goal" || kind === "score" ? <label><span>{kind === "extra" && sportId === "cricket" ? "TOTAL RUNS · INCLUDES AUTOMATIC 1 FOR WIDE / NO-BALL" : "POINTS"}</span><select value={points} onChange={(e) => setPoints(Number(e.target.value))}>{(kind === "basket" ? [1, 2, 3] : kind === "run" ? [0, 1, 2, 3, 4, 6] : kind === "extra" && sportId === "cricket" ? (cricketExtra === "wide" || cricketExtra === "no-ball" ? [1, 2, 3, 4, 5, 6] : [0, 1, 2, 3, 4, 6]) : [1]).map((value) => <option value={value} key={value}>{value}</option>)}</select></label> : null}
      {(kind === "wicket" || kind === "extra" || kind === "yellow-card" || kind === "red-card" || kind === "foul" || kind === "substitution") && <label className="scorecard-detail"><span>DETAIL</span><input value={detail} onChange={(e) => setDetail(e.target.value)} placeholder={kind === "wicket" ? "Dismissal type (optional)" : "Optional note"} /></label>}
      {quickScoringKinds.has(kind) && <div className="quick-score-actions" aria-label="Quick score actions">{quickValues.map((value) => <button key={value} disabled={pending} onClick={() => void score(match, { action: "record-event", event: { kind: kind as MatchEventKind, side, points: value, playerId: playerId || undefined, label: kinds.find(([option]) => option === kind)?.[1] } })}><kbd>{value}</kbd> +{value} {sectionCode(data, side === "a" ? match.sectionA : match.sectionB)}</button>)}<span>{quickValues.length > 1 ? `Keys ${quickValues.join("/")} also add points` : "Press 1 for a quick score"}</span></div>}<button className="score-add scorecard-submit" disabled={pending} onClick={() => void score(match, { action: "record-event", event: { kind: kind as MatchEventKind, side, points: ["yellow-card", "red-card", "substitution", "foul", "wicket"].includes(kind) ? 0 : points, playerId: playerId || undefined, secondaryPlayerId: secondaryPlayerId || undefined, label: kind === "extra" && sportId === "cricket" ? `${cricketExtra === "no-ball" ? "No-ball" : cricketExtra === "leg-bye" ? "Leg bye" : cricketExtra[0].toUpperCase() + cricketExtra.slice(1)}` : kinds.find(([value]) => value === kind)?.[1], detail: kind === "extra" && sportId === "cricket" ? cricketExtra : detail || undefined } })}>{pending ? "SAVING…" : "ADD TO SCORECARD"}</button></div>
      <div className="console-footer"><span role="status">{pending ? "Saving score…" : "Score saved · updates are live"}</span><button className="confirm-button" disabled={pending} onClick={() => void score(match, { action: "submit" })}>SUBMIT FINAL RESULT <ArrowRight size={14} /></button></div></>}
    {sportId === "cricket" && <p className="scoring-rule-hint">Cricket settings: {event?.scoringConfig?.oversPerInnings ?? 8} overs per innings · {event?.scoringConfig?.wicketsPerInnings ?? 10} wickets. Wides/no-balls are marked in the detail field; add the extra runs in Points.</p>}
    {playerTotals.length > 0 && <div className="scorecard-player-totals"><strong>{sportId === "cricket" ? "BATTER / BOWLER FIGURES" : sportId === "basketball" ? "PLAYER POINTS / STATS" : "PLAYER MATCH STATS"}</strong>{playerTotals.map(({ player, score: total, actions }) => <span key={player.id}>{player.name}<small>{actions.map((action) => `${action.secondaryPlayerId === player.id ? "Bowling" : "Batting"}: ${action.label ?? action.kind}${action.points ? ` ${action.points}` : ""}`).join(" · ")}</small><b>{total}</b></span>)}</div>}
    {sportId === "cricket" && <div className="scorecard-player-totals"><strong>CRICKET BATTER & BOWLER CARD</strong>{data.participants.filter((player) => [...participantIds, ...opponentIds].includes(player.id)).map((player) => <span key={`cricket-${player.id}`}>{player.name}<small>{cricketFigure(player.id, match.scorecard?.events ?? [])}</small><b>FIGURES</b></span>)}</div>}
    <MatchEventFeed data={data} match={match} score={score} />
  </div>;
}

function CricketScoreConsole({ data, match, event, score, pending }: { data: CompetitionData; match: Fixture; event?: EventDefinition; score: (match: Fixture, input: MatchScoreInput) => Promise<boolean>; pending: boolean }) {
  const history = match.scorecard?.cricket?.innings ?? [];
  const innings = history.at(-1);
  const legalBallsInInnings=innings?.deliveries.filter(delivery=>delivery.legal&&!delivery.reversedAt).length??0;
  const needsBowlerChange=legalBallsInInnings>0&&legalBallsInInnings%6===0;
  const legacy = !match.scorecard?.cricket && (match.scorecard?.events.length ?? 0) > 0;
  const dismissedIds=new Set(innings?.deliveries.filter(delivery=>delivery.wicket&&delivery.wicket.kind!=="retired-hurt"&&!delivery.reversedAt).map(delivery=>delivery.wicket!.playerOutId)??[]);
  const canStart = !legacy && (!innings || innings.completed && innings.number === 1) && match.status === "live";
  const canScore = !!innings && !innings.completed && match.status === "live";
  const [firstBattingSide,setFirstBattingSide]=useState<"a"|"b">("a");
  const battingSide = innings && !innings.completed ? innings.battingSide : history.length === 1 ? (history[0].battingSide === "a" ? "b" : "a") : firstBattingSide;
  const batters = data.entries.filter((entry) => entry.eventId === match.eventId && entry.sectionId === (battingSide === "a" ? match.sectionA : match.sectionB)).flatMap((entry) => data.participants.filter((player) => entry.participantIds.includes(player.id)));
  const bowlers = data.entries.filter((entry) => entry.eventId === match.eventId && entry.sectionId === (battingSide === "a" ? match.sectionB : match.sectionA)).flatMap((entry) => data.participants.filter((player) => entry.participantIds.includes(player.id)));
  const [striker, setStriker] = useState(innings?.strikerId ?? batters[0]?.id ?? "");
  const [nonStriker, setNonStriker] = useState(innings?.nonStrikerId ?? batters[1]?.id ?? "");
  const [bowler, setBowler] = useState(innings?.bowlerId ?? bowlers[0]?.id ?? "");
  const [batRuns, setBatRuns] = useState(0);
  const [extraType, setExtraType] = useState<"none" | "wide" | "no-ball" | "bye" | "leg-bye" | "penalty">("none");
  const [extraRuns, setExtraRuns] = useState(0);
  const [wicket, setWicket] = useState(false);
  const [playerOut, setPlayerOut] = useState("");
  const [dismissal, setDismissal] = useState("bowled");
  useEffect(()=>{setStriker(innings?.strikerId??batters[0]?.id??"");setNonStriker(innings?.nonStrikerId??batters[1]?.id??"");setBowler(innings?.bowlerId??bowlers[0]?.id??"");},[match.id,innings?.number,innings?.completed,innings?.strikerId,innings?.nonStrikerId,innings?.bowlerId,battingSide]);
  const countRuns = (card: NonNullable<Fixture["scorecard"]>) => (card.cricket?.innings.flatMap((i) => i.deliveries).filter((d) => !d.reversedAt).reduce((n,d)=>n+d.batRuns+d.extraRuns+(d.extraType==="wide"||d.extraType==="no-ball"?1:0),0) ?? 0);
  const startInnings = () => void score(match, { action: "cricket-start-innings", cricketInnings: { battingSide, strikerId: striker, nonStrikerId: nonStriker, bowlerId: bowler } });
  const addBall = async () => { if (!innings || pending) return; const saved = await score(match, { action: "cricket-delivery", cricketDelivery: { battingSide, batterId: striker, nonStrikerId: nonStriker, bowlerId: bowler, batRuns, extraType, extraRuns, wicket: wicket && playerOut ? { kind: dismissal as NonNullable<MatchScoreInput["cricketDelivery"]>["wicket"] extends infer W ? W extends {kind: infer K} ? K : never : never, playerOutId: playerOut } : undefined } }); if (saved) { setWicket(false); setExtraType("none"); setExtraRuns(0); setBatRuns(0); } };
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (pending || !canScore || target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName))) return;
      if (/^[0-6]$/.test(event.key)) { setBatRuns(Number(event.key)); event.preventDefault(); }
      else if (event.key.toLowerCase() === "w") { setExtraType("wide"); event.preventDefault(); }
      else if (event.key.toLowerCase() === "n") { setExtraType("no-ball"); event.preventDefault(); }
      else if (event.code === "Space" && innings && striker && nonStriker && bowler) { event.preventDefault(); void addBall(); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [pending, innings, striker, nonStriker, bowler, batRuns, extraType, extraRuns, wicket, playerOut, dismissal, match.id, canScore]);
  return <div className="scoring-console cricket-console"><div className="console-title"><div><p className="eyebrow">CRICKET · {event?.name}</p><strong>{innings?.completed ? "Innings complete" : innings ? `Innings ${innings.number} · ${innings.completionReason ?? "LIVE"}` : match.status === "scheduled" ? "Ready to start" : "Set up innings"}</strong></div><span className="console-access"><LockKeyhole size={13}/> ASSIGNED EVENT</span></div><p className="keyboard-hint">Keyboard: 0–6 set bat runs · W wide · N no-ball · Space add delivery (focus the page first)</p>
    {legacy && <p className="scoring-rule-hint" role="status">This fixture has older generic cricket events without innings and player attribution. They are preserved as history. Create a fresh fixture to use detailed scoring.</p>}
    {match.status === "scheduled" && <button className="score-add" onClick={()=>void score(match,{action:"start"})}>START MATCH</button>}
    {canStart && <div className="scorecard-controls">{history.length===0&&<label><span>BAT FIRST</span><select value={firstBattingSide} onChange={(e)=>setFirstBattingSide(e.target.value as "a"|"b")}><option value="a">{sectionName(data,match.sectionA)}</option><option value="b">{sectionName(data,match.sectionB)}</option></select></label>}<label><span>STRIKER</span><select value={striker} onChange={(e)=>setStriker(e.target.value)}><option value="">Select batter</option>{batters.filter(p=>!dismissedIds.has(p.id)).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label><label><span>NON-STRIKER</span><select value={nonStriker} onChange={(e)=>setNonStriker(e.target.value)}><option value="">Select batter</option>{batters.filter(p=>p.id!==striker&&!dismissedIds.has(p.id)).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label><label><span>OPENING BOWLER</span><select value={bowler} onChange={(e)=>setBowler(e.target.value)}>{bowlers.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label><button className="score-add" onClick={startInnings}>START INNINGS</button></div>}
    {canScore && <><div className="scorecard-controls"><label><span>STRIKER</span><select value={striker} onChange={(e)=>setStriker(e.target.value)}><option value="">Select batter</option>{batters.filter(p=>!dismissedIds.has(p.id)).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label><label><span>NON-STRIKER</span><select value={nonStriker} onChange={(e)=>setNonStriker(e.target.value)}><option value="">Select batter</option>{batters.filter(p=>p.id!==striker&&!dismissedIds.has(p.id)).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label><label><span>{needsBowlerChange?"BOWLER · NEW OVER — CHANGE REQUIRED":"BOWLER"}</span><select value={bowler} onChange={(e)=>setBowler(e.target.value)}>{bowlers.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label><label><span>EXTRAS</span><select value={extraType} onChange={(e)=>setExtraType(e.target.value as typeof extraType)}><option value="none">None</option><option value="wide">Wide</option><option value="no-ball">No-ball</option><option value="bye">Bye</option><option value="leg-bye">Leg bye</option><option value="penalty">Penalty</option></select></label><label><span>BAT RUNS</span><select value={batRuns} onChange={(e)=>setBatRuns(Number(e.target.value))}>{[0,1,2,3,4,6].map(n=><option key={n} value={n}>{n}</option>)}</select></label><label><span>EXTRA RUNS · ADDITIONAL TO AUTOMATIC WIDE/NO-BALL RUN</span><select value={extraRuns} onChange={(e)=>setExtraRuns(Number(e.target.value))}>{[0,1,2,3,4,5,6].map(n=><option key={n} value={n}>{n}</option>)}</select></label><label><span>WICKET</span><select value={wicket?"yes":"no"} onChange={(e)=>setWicket(e.target.value==="yes")}><option value="no">No wicket</option><option value="yes">Wicket</option></select></label>{wicket && <><label><span>DISMISSAL</span><select value={dismissal} onChange={(e)=>setDismissal(e.target.value)}>{["bowled","caught","lbw","run-out","stumped","hit-wicket","retired-hurt","other"].map(x=><option key={x} value={x}>{x}</option>)}</select></label><label><span>BATTER OUT</span><select value={playerOut} onChange={(e)=>setPlayerOut(e.target.value)}>{[striker,nonStriker].map(id=>batters.find(p=>p.id===id)).filter(Boolean).map(p=><option key={p!.id} value={p!.id}>{p!.name}</option>)}</select></label></>}<button className="score-add scorecard-submit" disabled={!striker||!nonStriker||!bowler||pending} onClick={addBall}>{pending ? "SAVING DELIVERY…" : "ADD DELIVERY"}</button></div><div className="console-footer"><span role="status">{pending ? "Saving delivery…" : "Score saved · updates are live"}</span><button className="secondary-button" disabled={pending} onClick={()=>void score(match,{action:"cricket-end-innings"})}>END INNINGS</button></div></>}
    {match.scorecard?.cricket?.innings.map((inn)=><CricketInningsDetails key={inn.number} data={data} match={match} innings={inn}/>)}{cricketMatchResult(data,match)&&<p className="cricket-result" role="status">{cricketMatchResult(data,match)}</p>}
    {match.status==="live" && innings?.deliveries.length ? <button className="secondary-button" onClick={()=>{const d=[...innings.deliveries].reverse().find(item=>!item.reversedAt);const reason=window.prompt("Reason for correcting the last delivery?");if(d&&reason?.trim())void score(match,{action:"cricket-correct-delivery",eventId:d.id,correctionReason:reason});}}>UNDO LAST DELIVERY</button> : null}
    {match.status === "live" && match.scorecard?.cricket?.innings.length===2 && match.scorecard.cricket.innings.every(i=>i.completed) && <button className="confirm-button" onClick={()=>void score(match,{action:"submit"})}>SUBMIT RESULT</button>}
  </div>;
}

function CricketReadOnlyScorecard({data,match}:{data:CompetitionData;match:Fixture}) {
  const card=match.scorecard?.cricket;
  if(!card?.innings.length)return <p className="empty-feed">The detailed cricket scorecard will appear when innings scoring begins.</p>;
  return <div className="cricket-public-card">{card.innings.map((innings)=><CricketInningsDetails key={innings.number} data={data} match={match} innings={innings}/>)}{cricketMatchResult(data,match)&&<p className="cricket-result" role="status">{cricketMatchResult(data,match)}</p>}</div>;
}

function cricketMatchResult(data:CompetitionData,match:Fixture):string {
  const innings=match.scorecard?.cricket?.innings;
  if(!innings||innings.length<2||!innings.every(item=>item.completed))return "";
  const total=(item:CricketInnings)=>item.deliveries.filter(d=>!d.reversedAt).reduce((sum,d)=>sum+d.batRuns+d.extraRuns+(d.extraType==="wide"||d.extraType==="no-ball"?1:0),0);
  const first=innings[0],second=innings[1],firstRuns=total(first),secondRuns=total(second);
  const firstSide=first.battingSide==="a"?match.sectionA:match.sectionB;
  const secondSide=second.battingSide==="a"?match.sectionA:match.sectionB;
  if(firstRuns===secondRuns)return "Match tied";
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
  const firstRuns=match.scorecard?.cricket?.innings.find(item=>item.number===1)?.deliveries.filter(d=>!d.reversedAt).reduce((n,d)=>n+d.batRuns+d.extraRuns+(d.extraType==="wide"||d.extraType==="no-ball"?1:0),0)??0;
  const target=firstRuns+1;
  const remainingBalls=Math.max(0,(data.events.find(e=>e.id===match.eventId)?.scoringConfig?.oversPerInnings??8)*6-balls);
  const runRate=balls?runs*6/balls:0;
  const requiredRate=innings.number===2&&remainingBalls?Math.max(0,target-runs)*6/remainingBalls:0;
  const oversForBowler=(ds:typeof active)=>{const groups=new Map<number,typeof active>();for(const d of ds){const group=groups.get(d.over)??[];group.push(d);groups.set(d.over,group);}return groups;};
  return <section className="cricket-innings-card" aria-label={`Innings ${innings.number} scorecard`} aria-live="polite" aria-atomic="false"><h3>Innings {innings.number} · {sectionName(data,battingSection)} · {runs}/{wickets} ({Math.floor(balls/6)}.{balls%6} ov){innings.completed?` · ${innings.completionReason??"Complete"}`:" · LIVE"}</h3><p className="cricket-rate-line">CRR {runRate.toFixed(2)}{innings.number===2&&!innings.completed?` · Target ${target} · Need ${Math.max(0,target-runs)} from ${remainingBalls} balls · RRR ${requiredRate.toFixed(2)}`:""}</p><div className="cricket-stat-tables"><table><caption>Batting</caption><thead><tr><th scope="col">BATTER</th><th scope="col">R</th><th scope="col">B</th><th scope="col">4s</th><th scope="col">6s</th><th scope="col">SR</th></tr></thead><tbody>{batters.map(p=>{const ds=active.filter(d=>d.batterId===p.id);const faced=ds.filter(d=>d.extraType!=="wide").length;const batterRuns=ds.reduce((n,d)=>n+d.batRuns,0);const dismissal=active.find(d=>d.wicket?.playerOutId===p.id)?.wicket?.kind;return <tr key={p.id}><th scope="row">{p.name}{innings.strikerId===p.id?" *":""}<small>{dismissal?` ${dismissal}`:" not out"}</small></th><td>{batterRuns}</td><td>{faced}</td><td>{ds.filter(d=>d.batRuns===4).length}</td><td>{ds.filter(d=>d.batRuns===6).length}</td><td>{faced?(batterRuns*100/faced).toFixed(1):"—"}</td></tr>})}</tbody></table><table><caption>Bowling</caption><thead><tr><th scope="col">BOWLER</th><th scope="col">O</th><th scope="col">M</th><th scope="col">R</th><th scope="col">W</th><th scope="col">Econ</th><th scope="col">Wd</th><th scope="col">NB</th></tr></thead><tbody>{bowlers.map(p=>{const ds=active.filter(d=>d.bowlerId===p.id);const legal=ds.filter(d=>d.legal).length;const conceded=ds.reduce((n,d)=>n+d.batRuns+(d.extraType==="wide"||d.extraType==="no-ball"?d.extraRuns+1:0),0);const overs=oversForBowler(ds);const maidens=[...overs.values()].filter(group=>group.filter(d=>d.legal).length===6&&group.every(d=>d.batRuns===0&&!(d.extraType==="wide"||d.extraType==="no-ball"))).length;const wicketsByBowler=ds.filter(d=>d.wicket&&["bowled","caught","lbw","stumped","hit-wicket"].includes(d.wicket.kind)).length;return <tr key={p.id}><th scope="row">{p.name}{innings.bowlerId===p.id?" *":""}</th><td>{Math.floor(legal/6)}.{legal%6}</td><td>{maidens}</td><td>{conceded}</td><td>{wicketsByBowler}</td><td>{legal?(conceded*6/legal).toFixed(2):"—"}</td><td>{ds.filter(d=>d.extraType==="wide").reduce((n,d)=>n+d.extraRuns+1,0)}</td><td>{ds.filter(d=>d.extraType==="no-ball").reduce((n,d)=>n+d.extraRuns+1,0)}</td></tr>})}</tbody></table></div><p className="cricket-extras"><strong>Extras</strong> {extras("wide")} wd · {extras("no-ball")} nb · {extras("bye")} b · {extras("leg-bye")} lb · {extras("penalty")} pen · {active.reduce((n,d)=>n+d.extraRuns+(d.extraType==="wide"||d.extraType==="no-ball"?1:0),0)} total</p><p className="cricket-extras"><strong>Fall of wickets</strong> {falls.join(" · ")||"—"}</p><p className="cricket-extras"><strong>Current partnership</strong> {partnership} runs</p><div className="cricket-delivery-list" aria-label="Recent ball-by-ball commentary">{active.slice(-18).map(d=><span key={d.id}>{d.over}.{d.ball} · {data.participants.find(p=>p.id===d.batterId)?.name??"Batter"} · {d.extraType!=="none"?`${d.extraType} `:""}{d.batRuns+d.extraRuns+(d.extraType==="wide"||d.extraType==="no-ball"?1:0)}{d.wicket?` · ${d.wicket.kind}`:""}</span>)}</div>{innings.deliveries.filter(d=>d.reversedAt).map(d=><p className="cricket-correction" key={`${d.id}-correction`}><strong>Corrected delivery {d.over}.{d.ball}</strong> · {d.correctionReason??"Reversed by scorer"}</p>)}</section>;
}

function MatchEventFeed({ data, match, score }: { data: CompetitionData; match: Fixture; score?: (match: Fixture, input: MatchScoreInput) => Promise<boolean> }) {
  const events = [...(match.scorecard?.events ?? [])].reverse().slice(0, 12);
  return <div className="match-event-feed"><strong>RECENT MATCH EVENTS</strong>{events.length ? events.map((item) => <div className={`match-event-row ${item.reversedAt ? "reversed" : ""}`} key={item.id}><span>{item.overBall ?? item.period}</span><span>{sectionName(data, item.side === "a" ? match.sectionA : match.sectionB)}</span><span>{item.playerName ?? data.participants.find((player) => player.id === item.playerId)?.name ?? "Team event"}</span><b>{item.label ?? item.kind}{item.points ? ` · ${item.points}` : ""}{item.detail ? ` · ${item.detail}` : ""}</b>{score && !item.reversedAt && !item.reversesEventId && match.status === "live" && <button onClick={() => { const reason = window.prompt("Reason for correction?"); if (reason?.trim()) void score(match, { action: "reverse-event", eventId: item.id, correctionReason: reason }); }}>UNDO</button>}</div>) : <span className="empty-feed">No scoring events yet.</span>}</div>;
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
  const canEdit = role === "scheduler" || role === "central-admin";
  const dayOptions = [...new Map(data.fixtures.map((fixture) => [formatDayKey(fixture.startsAt), formatFixtureDate(fixture.startsAt)])).entries()].map(([value, label]) => ({ value, label }));
  const venueOptions = [...new Set(data.fixtures.map((fixture) => fixture.venue).filter(Boolean))];
  return <div className="view-content"><div className="page-title-row"><div><p className="eyebrow">THE RUN OF SHOW <span>·</span> FIXTURES & VENUES</p><h1>Schedule<span className="title-period">.</span></h1><p className="subtitle">One shared calendar for every sport, section, and venue.</p></div>{canEdit && <button className="primary-button" onClick={() => { setEditing(null); setShowCreate((value) => !value); }}><Plus size={16} /> ADD FIXTURE</button>}</div>
    <div className="filter-row"><label><span>SPORT</span><select value={filterSport} onChange={(event) => setFilterSport(event.target.value)}><option value="all">All sports</option>{data.sports.map((sport) => <option value={sport.id} key={sport.id}>{sport.name}</option>)}</select></label><label><span>SECTION</span><select value={filterSection} onChange={(event) => setFilterSection(event.target.value)}><option value="all">All sections</option>{data.sections.map((section) => <option value={section.id} key={section.id}>{section.name}</option>)}</select></label><label><span>DAY</span><select value={filterDay} onChange={(event) => setFilterDay(event.target.value)}><option value="all">All days</option>{dayOptions.map((day) => <option value={day.value} key={day.value}>{day.label}</option>)}</select></label><label><span>VENUE</span><select value={filterVenue} onChange={(event) => setFilterVenue(event.target.value)}><option value="all">All venues</option>{venueOptions.map((venue) => <option value={venue} key={venue}>{venue}</option>)}</select></label><label><span>STATUS</span><select value={filterStatus} onChange={(event) => setFilterStatus(event.target.value)}><option value="all">All statuses</option><option value="scheduled">Scheduled</option><option value="live">Live</option><option value="awaiting-confirmation">Legacy · policy needed</option><option value="completed">Final</option></select></label><span className="filter-result-count">{fixtures.length} FIXTURES</span></div>
    {showCreate && canEdit && <FixtureForm data={data} refresh={refresh} toast={toast} onClose={() => setShowCreate(false)} />}
    {editing && canEdit && <FixtureForm data={data} initial={editing} refresh={refresh} toast={toast} onClose={() => setEditing(null)} />}
    <div className="schedule-list"><div className="schedule-list-head"><span>TIME</span><span>EVENT / MATCH-UP</span><span>VENUE</span><span>STATUS</span>{canEdit && <span>ACTION</span>}</div>{fixtures.length ? fixtures.map((fixture) => <FixtureRow key={fixture.id} data={data} fixture={fixture} canEdit={canEdit} onEdit={() => { setShowCreate(false); setEditing(fixture); }} />) : <div className="empty-table">No fixtures match these filters. Try a different section or sport.</div>}</div></div>;
}

function FixtureForm({ data, initial, refresh, toast, onClose }: { data: CompetitionData; initial?: Fixture; refresh: () => Promise<void>; toast: (message: string, error?: boolean) => void; onClose: () => void }) {
  const [conflict, setConflict] = useState<string | null>(null);
  const [payload, setPayload] = useState<Record<string, unknown> | null>(null);
  const [busy, setBusy] = useState(false);
  const [sectionA, setSectionA] = useState<SectionId>(initial?.sectionA ?? data.sections[0]?.id ?? "s1");
  const endpoint = initial ? `/api/fixtures/${initial.id}` : "/api/fixtures";
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
    void submit({ eventId: String(form.get("eventId")), sectionA: String(form.get("sectionA")), sectionB: String(form.get("sectionB")), startsAt: date.toISOString(), durationMinutes: Number(form.get("durationMinutes")), venue: String(form.get("venue")), stage: String(form.get("stage")) });
  }
  return <form className="create-fixture" onSubmit={handleSubmit}><div className="create-fixture-title"><div><p className="eyebrow">SCHEDULING DESK</p><h2>{initial ? "Change a fixture" : "Add a fixture"}</h2></div><button type="button" className="icon-button" aria-label="Close" onClick={onClose}><X size={18} /></button></div>{conflict && <div className="conflict-warning"><Shield size={17} /><span>{conflict} If this overlap is intentional, publish with acknowledgement.</span><button type="button" disabled={busy} onClick={() => payload && void submit(payload, true)}>ACKNOWLEDGE & PUBLISH</button></div>}<div className="form-grid"><label>SPORT / EVENT<select name="eventId" defaultValue={initial?.eventId ?? data.events[0]?.id} required>{data.events.map((item) => <option value={item.id} key={item.id}>{eventSportName(data, item.id)}</option>)}</select></label><label>SECTION A<select name="sectionA" value={sectionA} onChange={(event) => setSectionA(event.target.value as SectionId)}>{data.sections.map((section) => <option value={section.id} key={section.id}>{section.name}</option>)}</select></label><label>SECTION B<select name="sectionB" defaultValue={initial?.sectionB ?? data.sections.find((section) => section.id !== sectionA)?.id}>{data.sections.filter((section) => section.id !== sectionA).map((section) => <option value={section.id} key={section.id}>{section.name}</option>)}</select></label><label>TOURNAMENT STAGE<select name="stage" defaultValue={initial?.stage ?? "league"}><option value="league">League / group match</option><option value="semifinal">Semifinal</option><option value="final">Final</option><option value="other">Other</option></select></label><div className="schedule-date-field"><span className="form-field-label">DATE &amp; TIME</span><DateTimePicker defaultValue={initial ? localDateTime(initial.startsAt) : ""} /></div><label>VENUE<input name="venue" defaultValue={initial?.venue ?? ""} placeholder="Court / field / hall" required /></label><label>DURATION · MIN<input name="durationMinutes" type="number" min="1" defaultValue={initial?.durationMinutes ?? 45} required /></label></div><div className="form-actions"><span>Conflicts are flagged before publishing.</span><button className="primary-button" type="submit" disabled={busy}>{initial ? "SAVE CHANGES" : "SAVE FIXTURE"} <ArrowRight size={14} /></button></div></form>;
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
      <div className="calendar-time-row"><label htmlFor="fixture-time">START TIME</label><input id="fixture-time" type="time" value={timeValue} onChange={(event) => setTimeValue(event.target.value)} required /><button type="button" className="secondary-button" onClick={() => { setDateValue(formatDateField(today)); setMonth(new Date(today.getFullYear(), today.getMonth(), 1)); }}>TODAY</button></div>
      <div className="calendar-footer"><span>{dateValue && timeValue ? `${selectedLabel} · ${timeValue}` : "Choose a date and start time"}</span><button type="button" className="primary-button" disabled={!dateValue || !timeValue} onClick={() => setOpen(false)}>DONE <Check size={14} /></button></div>
    </div>}
  </div>;
}

function FixtureRow({ data, fixture, canEdit, onEdit }: { data: CompetitionData; fixture: Fixture; canEdit?: boolean; onEdit?: () => void }) {
  const statusLabel: Record<string, string> = { live: "Live", scheduled: "Scheduled", "awaiting-confirmation": "Legacy · policy needed", completed: "Finalized" };
  return <div className="schedule-row"><div className="schedule-time"><strong>{formatTime(fixture.startsAt)}</strong><small>{formatFixtureDate(fixture.startsAt)}</small></div><div className="schedule-match"><small>{eventSportName(data, fixture.eventId)}</small><strong>{sectionName(data, fixture.sectionA)} <span>VS</span> {sectionName(data, fixture.sectionB)}</strong></div><div className="schedule-venue">{fixture.venue}<small>{fixture.durationMinutes} MIN</small></div><span className={`schedule-status ${fixture.status}`}><i />{statusLabel[fixture.status]}</span>{canEdit && <button className="text-button schedule-edit" onClick={onEdit}>EDIT</button>}</div>;
}

function FixtureList({ data, fixtures }: { data: CompetitionData; fixtures: Fixture[] }) {
  return <div className="fixture-list">{fixtures.length ? fixtures.map((fixture) => <div className="fixture-row" key={fixture.id}><div className="fixture-date"><strong>{formatTime(fixture.startsAt)}</strong><small>{formatFixtureDateShort(fixture.startsAt)}</small></div><div className="fixture-detail"><strong>{sectionName(data, fixture.sectionA)} <span>vs</span> {sectionName(data, fixture.sectionB)}</strong><small>{eventSportName(data, fixture.eventId)} <i>·</i> {fixture.venue}</small></div><span className="fixture-format">{fixture.periodLabel}</span><button className="icon-button" aria-label="Open fixture details"><ArrowRight size={16} /></button></div>) : <div className="empty-inline">No upcoming fixtures have been published.</div>}</div>;
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
  return <div className="view-content"><div className="page-title-row"><div><p className="eyebrow">CENTRAL ADMIN · TRACEABLE CHANGES</p><h1>Scoring audit<span className="title-period">.</span></h1><p className="subtitle">Every scoring change, final submission, and correction—with the actor, timestamp, and match context.</p></div><span className="ribbon-metric"><b>{entries.length}</b><span>records</span></span></div>
    {legacyNeedsPolicy.length > 0 && <section className="audit-policy-notice"><strong>{legacyNeedsPolicy.length} older result{legacyNeedsPolicy.length === 1 ? "" : "s"} need policy setup</strong><p>Publish each event’s points policy to finalize submitted results or restore missing legacy points automatically.</p>{legacyNeedsPolicy.map((fixture) => <button key={fixture.id} className="text-button" onClick={() => openFixture(fixture.id)}>{eventName(data, fixture.eventId)} · {sectionName(data, fixture.sectionA)} {fixture.scoreA}–{fixture.scoreB} {sectionName(data, fixture.sectionB)} · OPEN MATCH</button>)}</section>}
    <div className="audit-filters"><label><span>DATE</span><input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label><label><span>EVENT</span><select value={eventId} onChange={(event) => setEventId(event.target.value)}><option value="all">All events</option>{data.events.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label><label><span>ACTION</span><select value={action} onChange={(event) => setAction(event.target.value)}><option value="all">All actions</option>{[...new Set((data.audit ?? []).map((entry) => entry.action))].sort().map((item) => <option key={item} value={item}>{item.replaceAll("-", " ")}</option>)}</select></label><label><span>ACTOR EMAIL</span><input value={actor} onChange={(event) => setActor(event.target.value)} placeholder="Filter by email" /></label></div>
    <div className="audit-list">{entries.length ? entries.map((entry) => { const fixture = data.fixtures.find((item) => item.id === entry.entityId); return <article className="audit-item" key={entry.id}><div className="audit-item-marker"><ClipboardList size={16} /></div><div className="audit-item-body"><div className="audit-item-heading"><strong>{entry.action.replaceAll("-", " ")}</strong><time dateTime={entry.at}>{formatAuditTime(entry.at)}</time></div><p>{entry.detail}</p><small>{entry.actor} · {fixture ? `${eventName(data, fixture.eventId)} · ${sectionName(data, fixture.sectionA)} vs ${sectionName(data, fixture.sectionB)}` : `Record ${entry.entityId}`}</small></div>{fixture && <div className="audit-item-actions"><button className="text-button" onClick={() => openFixture(fixture.id)}>OPEN FIXTURE</button>{fixture.status === "completed" && fixture.resultConfirmed && <button className="secondary-button" onClick={() => { const reviewNote = window.prompt("Why are you reopening this finalized result?"); if (reviewNote?.trim()) void score(fixture, { action: "reopen", reviewNote }); }}>REOPEN FOR CORRECTION</button>}</div>}</article>; }) : <div className="empty-inline">No audit entries match these filters.</div>}</div>
  </div>;
}

function eventName(data: CompetitionData, eventId: string): string { return data.events.find((event) => event.id === eventId)?.name ?? "Unknown event"; }
function fixtureStatusLabel(status: Fixture["status"]): string { return status === "awaiting-confirmation" ? "LEGACY · POLICY NEEDED" : status === "completed" ? "FINALIZED" : status === "live" ? "LIVE" : "SCHEDULED"; }
function formatAuditTime(value: string): string { const date = new Date(value); return Number.isNaN(date.valueOf()) ? value : date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }); }

function StandingsView({ data }: { data: CompetitionData }) {
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
      const scored = fixtures.reduce((sum, fixture) => sum + (fixture.sectionA === section.id ? fixture.scoreA : fixture.scoreB), 0);
      const conceded = fixtures.reduce((sum, fixture) => sum + (fixture.sectionA === section.id ? fixture.scoreB : fixture.scoreA), 0);
      const wins = fixtures.filter((fixture) => fixture.sectionA === section.id ? fixture.scoreA > fixture.scoreB : fixture.scoreB > fixture.scoreA).length;
      const draws = fixtures.filter((fixture) => fixture.scoreA === fixture.scoreB).length;
      const awards = fixtures.reduce((sum, fixture) => sum + (fixture.sectionA === section.id ? fixture.awardedPointsA ?? 0 : fixture.awardedPointsB ?? 0), 0);
      const ballsFor = fixtures.reduce((sum, fixture) => sum + (fixture.sectionA === section.id ? fixture.scorecard?.legalBallsA ?? 0 : fixture.scorecard?.legalBallsB ?? 0), 0);
      const ballsAgainst = fixtures.reduce((sum, fixture) => sum + (fixture.sectionA === section.id ? fixture.scorecard?.legalBallsB ?? 0 : fixture.scorecard?.legalBallsA ?? 0), 0);
      const nrr = board === "cricket" && ballsFor > 0 && ballsAgainst > 0 ? scored * 6 / ballsFor - conceded * 6 / ballsAgainst : 0;
      return { section, fixtures, noResults, scored, conceded, wins, draws, awards, nrr, diff: scored - conceded };
    }).sort((a, b) => b.awards - a.awards || (selectedEvents.some((event) => data.sports.find((sport) => sport.id === event.sportId)?.id === "cricket") ? b.nrr - a.nrr : b.diff - a.diff) || b.scored - a.scored);
    const boardLabel = board === "overall" ? "Overall" : board === "sports" ? "Combined sports" : board === "cultural" ? "Combined cultural" : data.sports.find((sport) => sport.id === board)?.name ?? "Standings";
    const eventBoard = selectedEvents.length === 1 ? selectedEvents[0].sportId : board;
    return <div className="view-content"><h1>Standings<span className="title-period">.</span></h1><p className="subtitle">Finalized results only. Event points rank first, followed by the sport’s tie-break statistics.</p><div className="standings-selectors"><label><span>BOARD</span><select value={board} onChange={(event) => { setBoard(event.target.value); setFormatEventId("all"); }}><option value="overall">Overall</option><option value="sports">Combined sports</option><option value="cultural">Combined cultural</option>{sports.map((sport) => <option key={sport.id} value={sport.id}>{sport.name}</option>)}</select></label><label><span>FORMAT / EVENT</span><select aria-label="Filter standings by format or event" value={formatEventId} onChange={(event) => setFormatEventId(event.target.value)}><option value="all">All formats</option>{eventsOfBoard.map((event) => <option key={event.id} value={event.id}>{event.name}{event.format ? ` · ${event.format}` : ""}</option>)}</select></label></div>{categoryEvents && <div className="standings-table-wrap"><table className="standings-table"><thead><tr><th>SECTION</th><th>TOTAL POINTS</th>{eventsOfBoard.map((event)=><th key={event.id}>{event.name}</th>)}</tr></thead><tbody>{rows.map((row,index)=><tr key={row.section.id}><td>{index+1}. {row.section.name}</td><td>{row.awards}</td>{eventsOfBoard.map((event)=>{const match=finalized.find((fixture)=>fixture.eventId===event.id&&(fixture.sectionA===row.section.id||fixture.sectionB===row.section.id));const pts=match?(match.sectionA===row.section.id?match.awardedPointsA:match.awardedPointsB):undefined;return <td key={event.id}>{pts ?? "—"}</td>})}</tr>)}</tbody></table></div>}{!categoryEvents && <div className="standings-table-wrap"><table className="standings-table"><thead><tr><th>RANK / SECTION</th><th>PLAYED</th><th>W</th><th>L</th><th>NR</th><th>D</th><th>{eventBoard === "cricket" ? "RUNS FOR" : "FOR"}</th><th>{eventBoard === "cricket" ? "RUNS AGAINST" : "AGAINST"}</th><th>{eventBoard === "cricket" ? "NRR" : "GD / DIFF"}</th><th>POINTS</th></tr></thead><tbody>{rows.map((row, index) => <tr key={row.section.id}><td>{index + 1}. {row.section.name}</td><td>{row.fixtures.length + row.noResults}</td><td>{row.wins}</td><td>{row.fixtures.length - row.wins - row.draws}</td><td>{row.noResults}</td><td>{row.draws}</td><td>{row.scored}</td><td>{row.conceded}</td><td>{eventBoard === "cricket" ? row.nrr.toFixed(2) : row.diff}</td><td>{row.awards}</td></tr>)}</tbody></table></div>}</div>;
  }
  const pointsFor = (sectionId: SectionId, category?: "sport" | "cultural") => finalized.reduce((sum, fixture) => {
    const event = data.events.find((item) => item.id === fixture.eventId);
    const sport = data.sports.find((item) => item.id === event?.sportId);
    if (!event || (category && sport?.category !== category)) return sum;
    return sum + (fixture.sectionA === sectionId ? fixture.awardedPointsA ?? 0 : fixture.sectionB === sectionId ? fixture.awardedPointsB ?? 0 : 0);
  }, 0);
  const overallRows = data.sections.map((section) => ({ section, sports: pointsFor(section.id, "sport"), cultural: pointsFor(section.id, "cultural"), total: pointsFor(section.id) })).sort((a,b) => b.total-a.total);
  return <div className="view-content"><div className="page-title-row"><div><p className="eyebrow">THE DIVISION RACE <span>·</span> FINALIZED EVENTS</p><h1>Standings<span className="title-period">.</span></h1><p className="subtitle">Event heads finalize submitted results; published points appear on the board immediately.</p></div></div><div className="standings-selectors"><label><span>BOARD</span><select value={board} onChange={(event) => { setBoard(event.target.value); setFormatEventId("all"); }}><option value="overall">Overall</option><option value="sports">Combined sports</option><option value="cultural">Combined cultural</option>{sports.map((sport) => <option key={sport.id} value={sport.id}>{sport.name}</option>)}</select></label><label><span>FORMAT / EVENT</span><select aria-label="Filter standings by format or event" value={formatEventId} onChange={(event) => setFormatEventId(event.target.value)}><option value="all">All formats</option>{eventsOfBoard.map((event) => <option key={event.id} value={event.id}>{event.name}{event.format ? ` · ${event.format}` : ""}</option>)}</select></label></div><div className="standings-ribbon"><span className="ribbon-orbit">DW</span><div><small>FIRST-YEAR EDITION</small><strong>{finalized.length} finalized results counted</strong></div><div className="ribbon-metric"><b>{data.sections.length}</b><span>sections</span></div><div className="ribbon-metric"><b>{data.events.length}</b><span>events</span></div></div><div className="standings-table-wrap"><table className="standings-table"><thead><tr><th>RANK</th><th>SECTION</th><th>SPORTS PTS</th><th>CULTURAL PTS</th><th>OVERALL PTS</th></tr></thead><tbody>{overallRows.map((row,index) => {const rank=index===0||row.total!==overallRows[index-1]?.total?index+1:overallRows.findIndex(item=>item.total===row.total)+1;return <tr key={row.section.id}><td>{rank}</td><td><span className="table-section"><i style={{background:row.section.color}}/><strong>{row.section.name}</strong><small>FIRST YEAR</small></span></td><td>{row.sports}</td><td>{row.cultural}</td><td className="table-points">{row.total}<small>PTS</small></td></tr>})}</tbody></table></div></div>;
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
      toast(submit ? "Entry submitted and locked for section admins." : "Entry draft saved.");
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
  return <div className="view-content"><div className="page-title-row"><div><p className="eyebrow">ROSTERS <span>·</span> RULEBOOK-BASED ENTRY SLOTS</p><h1>Section entries<span className="title-period">.</span></h1><p className="subtitle">Roster sizes, gender eligibility, and sport limits follow the competition rules.</p></div></div><div className="entry-toolbar"><label>SECTION<select value={sectionId} onChange={(event) => { setSectionId(event.target.value as SectionId); setPlayers([emptyPlayer()]); }}><option disabled>Select section</option>{accessibleSections.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>SPORT / EVENT<select value={eventId} onChange={(event) => { setEventId(event.target.value); setEntryNumber(1); setPlayers([emptyPlayer()]); }}><option disabled>Select event</option>{data.events.map((item) => <option value={item.id} key={item.id}>{eventSportName(data, item.id)}</option>)}</select></label>{(event?.entriesPerDivision ?? 1) > 1 && <label>TEAM ENTRY<select value={entryNumber} onChange={(event) => setEntryNumber(Number(event.target.value))}>{Array.from({ length: event?.entriesPerDivision ?? 1 }, (_, index) => <option key={index + 1} value={index + 1}>Team {index + 1}</option>)}</select></label>}<span className={`entry-state ${entry?.status === "submitted" ? "locked" : "draft"}`}>{entry?.status === "submitted" ? <><LockKeyhole size={14} /> SUBMITTED · LOCKED</> : "DRAFT"}</span></div><div className="entry-workspace"><div className="entry-rules"><div className="entry-rules-title"><Users size={17} /><strong>Entry requirements</strong></div><p>{event?.format ?? "Select an event to see its rules."}</p><div className="rule-row"><span>Players per entry</span><b>{playerRange}</b></div><div className="rule-row"><span>Entries per division</span><b>{event?.entriesPerDivision ?? "—"}</b></div><div className="rule-row"><span>Substitutes in roster</span><b>{event?.substitutePlayers ?? 0}</b></div><div className="rule-row"><span>Gender eligibility</span><b>{event?.genderEligibility ?? "—"}</b></div><div className="rule-row"><span>Participation cap</span><b>{sport?.category === "cultural" ? "No cultural-event cap" : sport?.countsTowardOverallSportsCap === false ? "Excluded from sports cap" : `${section?.maxSportsPerPlayer ?? 3} sports · ${sport?.maxFormatsPerPlayer ?? "unlimited"} formats per sport`}</b></div>{(event?.rosterRules ?? []).map((rule) => <p className="rule-note" key={rule}>{rule}</p>)}{(sport?.participationNotes ?? []).map((rule) => <p className="rule-note" key={rule}>{rule}</p>)}</div><div className="entry-editor"><div className="entry-editor-head"><div><p className="eyebrow">{event?.entriesPerDivision && event.entriesPerDivision > 1 ? `TEAM ${entryNumber}` : "SECTION ENTRY"}</p><h2>{sectionName(data, sectionId)} <span>·</span> {eventSportName(data, eventId)}</h2></div>{locked && <span className="locked-label"><LockKeyhole size={13} /> LOCKED</span>}</div>{entry && !canEdit ? <div className="submitted-roster">{roster.map((person) => person && <div className="participant-row" key={person.id}><span className="participant-avatar">{initials(person.name)}</span><div><strong>{person.name}</strong><small>{person.gender ? `${person.gender} · ` : ""}ID · {person.studentId}</small></div><Check size={16} /></div>)}</div> : <>{players.map((person, index) => <div className="player-input-row" key={index}><span className="player-index">{String(index + 1).padStart(2, "0")}</span><label><span>PLAYER NAME</span><input value={person.name} disabled={!canEdit || locked} onChange={(event) => setPlayers((list) => list.map((item, idx) => idx === index ? { ...item, name: event.target.value } : item))} placeholder="Full name" /></label><label><span>COLLEGE ID</span><input value={person.studentId} disabled={!canEdit || locked} onChange={(event) => setPlayers((list) => list.map((item, idx) => idx === index ? { ...item, studentId: event.target.value } : item))} placeholder="Student ID" /></label><label><span>GENDER</span><select value={person.gender} disabled={!canEdit || locked} onChange={(event) => setPlayers((list) => list.map((item, idx) => idx === index ? { ...item, gender: event.target.value as ParticipantGender | "" } : item))}><option value="">Choose</option><option value="male">Man</option><option value="female">Woman</option><option value="other">Other</option></select></label>{players.length > 1 && !locked && <button className="icon-button remove-player" onClick={() => setPlayers((list) => list.filter((_, idx) => idx !== index))} aria-label="Remove player"><X size={15} /></button>}</div>)}{canEdit && !locked && <button className="add-player" onClick={() => setPlayers((list) => [...list, emptyPlayer()])}><Plus size={15} /> ADD PLAYER</button>}</>}{canEdit && <div className="entry-actions"><span>Player limits are checked when submitted.</span><div><button className="secondary-button" disabled={busy || locked} onClick={() => void save(false)}>SAVE DRAFT</button><button className="primary-button" disabled={busy || locked} onClick={() => void save(true)}>SUBMIT ENTRY <ArrowRight size={14} /></button></div></div>}</div></div></div>;
}

function EventsView({ data, role, refresh, toast }: { data: CompetitionData; role: Role; refresh: () => Promise<void>; toast: (message: string, error?: boolean) => void }) {
  const [eventId, setEventId] = useState(data.events[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const event = data.events.find((item) => item.id === eventId);
  const sport = data.sports.find((item) => item.id === event?.sportId);
  const canEdit = role === "central-admin";
  async function save(eventForm: FormEvent<HTMLFormElement>) {
    eventForm.preventDefault(); if (!event) return; setBusy(true);
    const form = new FormData(eventForm.currentTarget);
    const values = (name: string) => String(form.get(name) ?? "").split("\n").map((value) => value.trim()).filter(Boolean);
    const maxText = String(form.get("maxPlayers") ?? "").trim();
    const matchText = String(form.get("matchCount") ?? "").trim();
    const outcomes = Object.fromEntries(values("outcomePoints").map((row) => { const [key, value] = row.split("="); return [key?.trim(), Number(value)]; }).filter(([key, value]) => Boolean(key) && Number.isFinite(value)));
    const points = String(form.get("points") ?? "").split(",").map((value) => Number(value.trim())).filter(Number.isFinite);
    const scoringConfig = Object.fromEntries(["inningsCount", "oversPerInnings", "wicketsPerInnings", "pointsToWin", "winBy", "setsToWin", "periods", "periodMinutes"].map((key) => [key, String(form.get(key) ?? "").trim() ? Number(form.get(key)) : undefined]));
    try { await api("/api/admin/events", "PUT", {
      eventId, name: form.get("name"), format: form.get("format"), minPlayers: Number(form.get("minPlayers")),
      maxPlayers: maxText ? Number(maxText) : null, entriesPerDivision: Number(form.get("entriesPerDivision")),
      substitutePlayers: Number(form.get("substitutePlayers")), genderEligibility: form.get("genderEligibility"),
      tournamentFormat: form.get("tournamentFormat"), matchCount: matchText ? Number(matchText) : null,
      rosterRules: values("rosterRules"), scoringRules: values("scoringRules"), scoringType: form.get("scoringType"),
      outcomePoints: outcomes, points, publishPoints: form.get("publishPoints") === "on",
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
  async function saveCap(eventForm: FormEvent<HTMLFormElement>, sectionId: SectionId) {
    eventForm.preventDefault(); const form = new FormData(eventForm.currentTarget); setBusy(true);
    try { await api("/api/admin/participation", "PUT", { sectionId, maxSportsPerPlayer: Number(form.get("maxSportsPerPlayer")) }); await refresh(); toast("Section participation cap saved."); }
    catch (error) { toast(error instanceof Error ? error.message : "Section cap could not be saved.", true); }
    finally { setBusy(false); }
  }
  return <div className="view-content"><div className="page-title-row"><div><p className="eyebrow">RULEBOOK CONFIGURATION <span>·</span> CENTRAL ADMIN</p><h1>Sports & events<span className="title-period">.</span></h1><p className="subtitle">Roster rules, formats, tournament structures, participation caps, and points are stored as editable competition data.</p></div>{canEdit && <span className="admin-badge"><Shield size={14} /> CENTRAL ADMIN</span>}</div>
    {canEdit && <section className="event-editor" style={{ marginBottom: 20 }}><div className="event-editor-head"><div><p className="eyebrow">DIVISION PARTICIPATION</p><h2>Sports caps by section</h2></div></div><div className="rule-form-grid">{data.sections.map((section) => <form key={section.id} onSubmit={(formEvent) => void saveCap(formEvent, section.id)}><label>SECTION {section.code} · MAX SPORTS<input name="maxSportsPerPlayer" type="number" min="1" max="20" defaultValue={section.maxSportsPerPlayer} /></label><button className="secondary-button" type="submit" disabled={busy}>SAVE CAP</button></form>)}</div></section>}
    <div className="event-layout"><div className="event-list">{data.events.map((item) => <button className={`event-list-item ${item.id === eventId ? "active" : ""}`} key={item.id} onClick={() => setEventId(item.id)}><span className="event-symbol">{item.sportId.slice(0, 2).toUpperCase()}</span><span><strong>{eventSportName(data, item.id)}</strong><small>{item.format}</small></span><span className={`config-state ${item.pointsPolicy.published ? "published" : "pending"}`}>{item.pointsPolicy.published ? "PUBLISHED" : "SETUP"}</span></button>)}</div>{event && <div className="event-editor-column"><form key={event.id} className="event-editor" onSubmit={(eventForm) => void save(eventForm)}><div className="event-editor-head"><div><p className="eyebrow">EVENT RULES</p><h2>{eventSportName(data, event.id)}</h2></div><span className={`policy-status ${event.pointsPolicy.published ? "published" : "pending"}`}>{event.pointsPolicy.published ? "POINTS PUBLISHED" : "POINTS DRAFT"}</span></div><div className="rule-form-grid"><label>EVENT NAME<input name="name" defaultValue={event.name} disabled={!canEdit} /></label><label>ENTRY / MATCH FORMAT<input name="format" defaultValue={event.format} disabled={!canEdit} /></label><label>MIN PLAYERS PER TEAM<input type="number" name="minPlayers" min="1" defaultValue={event.minPlayers ?? 1} disabled={!canEdit} /></label><label>MAX PLAYERS · BLANK = UNLIMITED<input type="number" name="maxPlayers" min="1" defaultValue={event.maxPlayers ?? ""} disabled={!canEdit} /></label><label>ENTRIES PER DIVISION<input type="number" name="entriesPerDivision" min="1" defaultValue={event.entriesPerDivision} disabled={!canEdit} /></label><label>SUBSTITUTES<input type="number" name="substitutePlayers" min="0" defaultValue={event.substitutePlayers} disabled={!canEdit} /></label><label>GENDER ELIGIBILITY<select name="genderEligibility" defaultValue={event.genderEligibility} disabled={!canEdit}><option value="men">Men</option><option value="women">Women</option><option value="mixed">Mixed</option><option value="open">Open</option></select></label><label>SCORING TYPE<input name="scoringType" defaultValue={event.scoringType} disabled={!canEdit} /></label><label>TOURNAMENT STRUCTURE<input name="tournamentFormat" defaultValue={event.tournamentFormat} disabled={!canEdit} /></label><label>MATCH COUNT · BLANK = VARIABLE<input name="matchCount" type="number" min="1" defaultValue={event.matchCount ?? ""} disabled={!canEdit} /></label><label>POINTS BY PLACE · COMMA SEPARATED<input name="points" defaultValue={event.pointsPolicy.places.join(", ")} disabled={!canEdit} placeholder="e.g. 10, 7, 5, 3, 1" /></label><label>POINTS BY OUTCOME · KEY=VALUE, ONE PER LINE<textarea name="outcomePoints" rows={5} defaultValue={Object.entries(event.pointsPolicy.pointsByOutcome ?? {}).map(([key, value]) => `${key}=${value}`).join("\n")} disabled={!canEdit} /></label><label>ROSTER RULES · ONE PER LINE<textarea name="rosterRules" rows={5} defaultValue={event.rosterRules.join("\n")} disabled={!canEdit} /></label><label>SCORING RULES · ONE PER LINE<textarea name="scoringRules" rows={5} defaultValue={event.scoringRules.join("\n")} disabled={!canEdit} /></label></div><div className="event-editor-footer"><label className="publish-toggle"><input name="publishPoints" type="checkbox" defaultChecked={event.pointsPolicy.published} disabled={!canEdit} /><span>Publish this points policy</span></label>{canEdit && <button className="primary-button" type="submit" disabled={busy}>SAVE EVENT RULES <ArrowRight size={14} /></button>}</div></form>{canEdit && <ScoringConfigForm event={event} refresh={refresh} toast={toast} />}{canEdit && sport && <form className="event-editor" onSubmit={(formEvent) => void saveSport(formEvent)}><div className="event-editor-head"><div><p className="eyebrow">SPORT-WIDE PARTICIPATION · {sport.name}</p><h2>Cross-event limits</h2></div></div><div className="rule-form-grid"><label>CATEGORY<select name="category" defaultValue={sport.category}><option value="sport">Sport</option><option value="cultural">Cultural</option></select></label><label>MAX FORMATS PER PLAYER · BLANK = UNLIMITED<input name="maxFormatsPerPlayer" type="number" min="1" defaultValue={sport.maxFormatsPerPlayer ?? ""} /></label><label className="publish-toggle"><input name="countsTowardOverallSportsCap" type="checkbox" defaultChecked={sport.countsTowardOverallSportsCap} /><span>Counts toward section sports cap</span></label><label>SHARED PARTICIPATION RULES · ONE PER LINE<textarea name="participationNotes" rows={5} defaultValue={sport.participationNotes.join("\n")} /></label></div><div className="event-editor-footer"><span>Cultural activities are excluded from the sports cap.</span><button className="primary-button" type="submit" disabled={busy}>SAVE SPORT RULES <ArrowRight size={14} /></button></div></form>}</div>}</div></div>;
}

function ScoringConfigForm({ event, refresh, toast }: { event: EventDefinition; refresh: () => Promise<void>; toast: (message: string, error?: boolean) => void }) {
  const fields = [["inningsCount", "INNINGS"], ["oversPerInnings", "OVERS PER INNINGS"], ["wicketsPerInnings", "WICKETS PER INNINGS"], ["pointsToWin", "POINTS TO WIN A SET"], ["winBy", "WIN BY"], ["setsToWin", "SETS TO WIN MATCH"], ["periods", "PERIODS / HALVES"], ["periodMinutes", "MINUTES PER PERIOD"]] as const;
  const [busy, setBusy] = useState(false);
  async function save(eventForm: FormEvent<HTMLFormElement>) {
    eventForm.preventDefault(); const form = new FormData(eventForm.currentTarget); setBusy(true);
    const scoringConfig: Partial<NonNullable<EventDefinition["scoringConfig"]>> = Object.fromEntries(fields.map(([key]) => [key, String(form.get(key) ?? "").trim() ? Number(form.get(key)) : undefined]));
    scoringConfig.enabledActions = String(form.get("enabledActions") ?? "").split(",").map((value) => value.trim()).filter(Boolean) as NonNullable<EventDefinition["scoringConfig"]>["enabledActions"];
    try { await api("/api/admin/events/scoring-config", "PUT", { eventId: event.id, scoringConfig }); await refresh(); toast("Sport-specific scoring settings saved."); }
    catch (error) { toast(error instanceof Error ? error.message : "Scoring settings could not be saved.", true); }
    finally { setBusy(false); }
  }
  return <form className="event-editor" onSubmit={(formEvent) => void save(formEvent)}><div className="event-editor-head"><div><p className="eyebrow">LIVE SCORECARD RULES</p><h2>Scoring format limits</h2></div></div><div className="rule-form-grid">{fields.map(([key, label]) => <label key={key}>{label}<input name={key} type="number" min="1" max="1000" defaultValue={event.scoringConfig?.[key] ?? ""} /></label>)}<label className="config-actions-field">ENABLED ACTIONS · COMMA SEPARATED<input name="enabledActions" defaultValue={event.scoringConfig?.enabledActions?.join(", ") ?? ""} placeholder="Blank uses sport defaults" /></label></div><div className="event-editor-footer"><span>Blank values use the sport adapter defaults.</span><button className="primary-button" type="submit" disabled={busy}>SAVE SCORECARD SETTINGS <ArrowRight size={14} /></button></div></form>;
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
  return <div className="view-content"><div className="page-title-row"><div><p className="eyebrow">PEOPLE <span>·</span> ROLE ASSIGNMENTS</p><h1>Access control<span className="title-period">.</span></h1><p className="subtitle">College accounts only. Every role stays within its assigned scope.</p></div>{canEdit && <span className="admin-badge"><Shield size={14} /> CENTRAL ADMIN</span>}</div><div className="access-layout"><section className="role-overview">{canEdit && <div className="assignment-roster"><p className="eyebrow">CURRENT ACCESS · {data.assignments.length}</p>{data.assignments.length ? data.assignments.map((item, index) => <div className="assignment-row" key={`${item.email}-${item.role}-${item.scopeId ?? "global"}-${index}`}><div><strong>{item.email}</strong><small>{roleNames[item.role]} · {item.scopeLabel ?? "All areas"} · {item.active ? "Active" : "Inactive"}</small></div><button className="text-button" disabled={!item.active} onClick={() => void removeAssignment(item)}>REMOVE</button></div>) : <p className="empty-inline">No organizer assignments yet.</p>}</div>}<p className="eyebrow">ROLE MAP</p><p className="eyebrow">ROLE MAP</p><h2>One account.<br />The right access.</h2>{[["Spectator", "College sign-in · read competition"], ["Section admin", "Up to 3 per section · roster entries"], ["Event head", "Assigned sport / event · live scoring"], ["Scheduler", "Fixtures · dates · venues"], ["Central admin", "All sections · all operations"]].map(([name, detail]) => <div className="role-map-row" key={name}><span className="role-map-dot" /><div><strong>{name}</strong><small>{detail}</small></div><ChevronRight size={15} /></div>)}</section><section className="import-panel"><div className="import-panel-head"><div><p className="eyebrow">BULK ASSIGNMENTS</p><h2>Import your team</h2></div><span className="college-domain">@spjimr.org</span></div><p className="import-copy">Paste a list or upload an Excel workbook. Review every role and scope before saving.</p>{canEdit ? <><textarea value={text} onChange={(event) => { setText(event.target.value); setParsed(null); }} rows={5} aria-label="Assignment list" /><label className="upload-file"><input type="file" accept=".xlsx,.csv,.tsv,.txt" onChange={(event) => { const file = event.currentTarget.files?.[0]; if (!file) return; if (file.name.toLowerCase().endsWith(".xlsx")) { const form = new FormData(); form.set("file", file); void preview(form); } else { void file.text().then((content) => { setText(content); const form = new FormData(); form.set("text", content); return preview(form); }); } }} /><Plus size={14} /> UPLOAD EXCEL / TEXT</label><div className="import-actions"><span>email, role, scope · section-admin, event-head, scheduler</span><button className="primary-button" onClick={() => void preview()}>PREVIEW IMPORT <ArrowRight size={14} /></button></div>{issues.length > 0 && <div className="import-errors">{issues.map((issue) => <p key={`${issue.row}-${issue.message}`}>Row {issue.row}: {issue.message}</p>)}</div>}{parsed && <div className="import-preview"><div className="preview-title"><strong>IMPORT PREVIEW</strong><span>{parsed.length} valid · {issues.length} issues</span></div><div className="preview-table">{parsed.map((item, index) => <div key={`${item.email}-${index}`}><strong>{item.email}</strong><span>{roleNames[item.role]}</span><span>{item.scopeLabel ?? "Global"}</span></div>)}</div><button className="primary-button" disabled={busy || issues.length > 0 || parsed.length === 0} onClick={() => void apply()}>APPLY ASSIGNMENTS <Check size={14} /></button></div>}</> : <div className="read-only-note"><LockKeyhole size={16} /> Central admin manages organizer assignments.</div>}</section></div><div className="access-footnote"><LockKeyhole size={15} /><span>Sign-in: Google Workspace · Restrict to <strong>@spjimr.org</strong> · Unassigned college accounts are spectators.</span></div></div>;
}

function eventSportName(data: CompetitionData, eventId: string) {
  const event = data.events.find((item) => item.id === eventId);
  const sport = data.sports.find((item) => item.id === event?.sportId)?.name ?? "Event";
  return event && event.name !== sport ? `${sport} · ${event.name}` : sport;
}
function sectionName(data: CompetitionData, id: string) { return data.sections.find((section) => section.id === id)?.name ?? id; }
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



