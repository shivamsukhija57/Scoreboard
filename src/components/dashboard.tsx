"use client";

import {
  Activity, ArrowRight, Bell, CalendarDays, Check,
  ChevronDown, ChevronLeft, ChevronRight, CircleHelp, Clock3, Crown, Filter,
  Flag, Gauge, LayoutDashboard, LockKeyhole, Medal, MoreHorizontal, Plus,
  Radio, Search, Settings2, Shield, SlidersHorizontal, Sparkles, Trophy, Users,
  Volleyball, X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type { CompetitionData, EventDefinition, Fixture, ParticipantGender, Role, SectionId, UserAccess } from "@/lib/domain";

type View = "overview" | "live" | "schedule" | "standings" | "entries" | "events" | "access";
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

  useEffect(() => {
    const timer = window.setInterval(() => {
      void api<{ data: CompetitionData }>("/api/competition").then((response) => setData(response.data)).catch(() => undefined);
    }, 10_000);
    return () => window.clearInterval(timer);
  }, []);

  const selectedMatch = data.fixtures.find((match) => match.id === selectedMatchId) ?? data.fixtures[0];
  const navItems: Array<{ id: View; label: string; icon: typeof LayoutDashboard; group?: string }> = [
    { id: "overview", label: "Overview", icon: LayoutDashboard },
    { id: "live", label: "Live matches", icon: Radio, group: "COMPETITION" },
    { id: "schedule", label: "Schedule", icon: CalendarDays },
    { id: "standings", label: "Standings", icon: Trophy },
    { id: "entries", label: "Section entries", icon: Users, group: "OPERATIONS" },
    { id: "events", label: "Sports & events", icon: Volleyball },
    { id: "access", label: "People & access", icon: Shield, group: "ADMIN" },
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
    setData(response.data);
  }
  async function score(match: Fixture, action: string) {
    try {
      await api(`/api/matches/${match.id}`, "PATCH", { action });
      await refreshData();
      toast(action === "submit" ? "Result sent for confirmation." : "Live score updated.");
    } catch (error) { toast(error instanceof Error ? error.message : "Score update failed.", true); }
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
        {view === "live" && <LiveView data={data} role={role} selectedMatch={selectedMatch} setSelectedMatchId={setSelectedMatchId} score={score} />}
        {view === "schedule" && <ScheduleView data={data} fixtures={shownFixtures} role={role} filterSport={filterSport} setFilterSport={setFilterSport} filterSection={filterSection} setFilterSection={setFilterSection} filterDay={filterDay} setFilterDay={setFilterDay} filterVenue={filterVenue} setFilterVenue={setFilterVenue} filterStatus={filterStatus} setFilterStatus={setFilterStatus} refresh={refreshData} toast={toast} />}
        {view === "standings" && <StandingsView data={data} />}
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
  const points = data.sections.map(() => 0);
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
        <div className="ribbon-leader"><div className="leader-copy"><span className="leader-crown"><Crown size={15} /></span><div><small>THE BOARD IS READY</small><strong>Awaiting confirmed results</strong></div></div><div className="leader-score"><strong>—</strong><span>PTS</span></div><div className="leader-tick" /></div>
        <div className="mini-standings">{data.sections.map((section, index) => <div className="mini-rank" key={section.id}><span className="mini-rank-number">0{index + 1}</span><span className="section-color-dot" style={{ background: section.color }} /><strong>{section.name}</strong><div className="rank-track"><i style={{ width: "18%", background: section.color }} /></div><span className="mini-points">—</span><span className="rank-change flat">—</span></div>)}</div>
        <div className="points-note"><span>Standings appear after results are confirmed.</span><button onClick={() => setView("events")}><Settings2 size={13} /> POINTS RULES</button></div>
      </section>
    </div>

    <div className="lower-grid"><section className="next-panel"><div className="section-heading"><div><p className="eyebrow">THE RUN OF SHOW</p><h2>Next up on campus</h2></div><button className="subtle-button" onClick={() => setView("schedule")}>FULL SCHEDULE <ArrowRight size={14} /></button></div><FixtureList data={data} fixtures={upcoming.slice(0, 4)} /></section><section className="sports-panel"><div className="section-heading"><div><p className="eyebrow">EVENT CATALOG</p><h2>{data.events.length} events · {data.sections.length} sections</h2></div><button className="icon-button" aria-label="Browse all events" onClick={() => setView("events")}><ArrowRight size={17} /></button></div><div className="sport-grid">{data.events.slice(0, 8).map((event, index) => <button className="sport-chip" key={event.id} onClick={() => setView("events")}><span className={`sport-index s${index}`}>{String(index + 1).padStart(2, "0")}</span><span>{event.name}</span><ChevronRight size={14} /></button>)}</div></section></div>
    <footer className="footer-note"><span>DIVISION WARS <i>·</i> FIRST-YEAR EDITION</span><span>BUILT FOR THE MOMENT <span className="footer-live">●</span></span></footer>
  </div>;
}

function LiveView({ data, role, selectedMatch, setSelectedMatchId, score }: { data: CompetitionData; role: Role; selectedMatch?: Fixture; setSelectedMatchId: (id: string) => void; score: (match: Fixture, action: string) => Promise<void> }) {
  const canScore = role === "event-head" || role === "central-admin";
  const event = selectedMatch && data.events.find((item) => item.id === selectedMatch.eventId);
  return <div className="view-content"><div className="page-title-row"><div><p className="eyebrow">MATCH CENTER <span>·</span> {data.fixtures.filter((match) => match.status === "live").length} LIVE</p><h1>Live matches<span className="title-period">.</span></h1><p className="subtitle">Scores move here as the game moves. Select a fixture to follow it.</p></div><button className="filter-button"><Filter size={15} /> ALL SPORTS <ChevronDown size={14} /></button></div>
    <div className="live-layout"><div className="match-list">{data.fixtures.map((match) => <button key={match.id} className={`match-list-item ${selectedMatch?.id === match.id ? "active" : ""}`} onClick={() => setSelectedMatchId(match.id)}><div className="match-list-top"><span className={`status-dot ${match.status}`} />{match.status === "live" ? "LIVE NOW" : match.status === "scheduled" ? formatTime(match.startsAt) : match.status.replace("-", " ").toUpperCase()}<span>{eventSportName(data, match.eventId)}</span></div><div className="match-list-score"><span>{sectionName(data, match.sectionA)}</span><strong>{match.scoreA} — {match.scoreB}</strong><span>{sectionName(data, match.sectionB)}</span></div><small>{match.venue} · {match.periodLabel}</small></button>)}</div>
      <div className="selected-match">{selectedMatch ? <><div className="selected-match-head"><span className={`match-status-tag ${selectedMatch.status}`}><i />{selectedMatch.status.replaceAll("-", " ").toUpperCase()}</span><span>{event?.name}</span><button className="icon-button" aria-label="Match menu"><MoreHorizontal size={18} /></button></div><div className="scoreboard-large"><div className="score-side"><span className="team-mark lime">{sectionCode(data, selectedMatch.sectionA)}</span><small>{sectionName(data, selectedMatch.sectionA).toUpperCase()}</small><strong>{selectedMatch.scoreA}</strong><span className="score-side-name">Section {sectionCode(data, selectedMatch.sectionA)}</span></div><div className="versus"><span>VS</span><div className="clock-face">{selectedMatch.status === "scheduled" ? "UP NEXT" : selectedMatch.clockLabel}<small>{selectedMatch.periodLabel}</small></div></div><div className="score-side"><span className="team-mark coral">{sectionCode(data, selectedMatch.sectionB)}</span><small>{sectionName(data, selectedMatch.sectionB).toUpperCase()}</small><strong>{selectedMatch.scoreB}</strong><span className="score-side-name">Section {sectionCode(data, selectedMatch.sectionB)}</span></div></div><div className="scoreboard-meta"><span><Flag size={14} /> {selectedMatch.venue}</span><span><Clock3 size={14} /> {formatFixtureDateTime(selectedMatch.startsAt)}</span><span><Activity size={14} /> {selectedMatch.status === "live" ? "Updating live" : selectedMatch.status === "completed" ? "Result confirmed" : "Fixture scheduled"}</span></div>
        {canScore ? <div className="scoring-console"><div className="console-title"><div><p className="eyebrow">EVENT HEAD CONSOLE</p><strong>{event?.scoringType ? scoringLabel(event.scoringType) : "Score controls"}</strong></div><span className="console-access"><LockKeyhole size={13} /> ASSIGNED EVENT ONLY</span></div><div className="score-actions"><button onClick={() => void score(selectedMatch, "decrement-a")} aria-label="Remove point from first section">−</button><button className="score-add" onClick={() => void score(selectedMatch, "increment-a")}><Plus size={15} /> {event?.scoringType === "innings" ? "ADD RUN" : event?.scoringType === "goals" || event?.scoringType === "halves" ? "ADD SCORE" : "SECTION A +1"}</button><span className="score-action-divider">/</span><button className="score-add score-add-coral" onClick={() => void score(selectedMatch, "increment-b")}><Plus size={15} /> {event?.scoringType === "innings" ? "ADD RUN" : event?.scoringType === "goals" || event?.scoringType === "halves" ? "ADD SCORE" : "SECTION B +1"}</button><button onClick={() => void score(selectedMatch, "decrement-b")} aria-label="Remove point from second section">−</button></div><div className="console-footer"><span>Every update is attributed to your account.</span><button className="confirm-button" disabled={selectedMatch.status === "awaiting-confirmation" || selectedMatch.status === "completed"} onClick={() => void score(selectedMatch, "submit")}>SUBMIT RESULT <ArrowRight size={14} /></button></div></div> : <div className="read-only-note"><LockKeyhole size={16} /><span>Score entry is available to the assigned event head.</span></div>}</> : <div className="empty-state"><Radio /><strong>No fixture selected</strong><span>Choose a match from the list.</span></div>}</div></div>
    </div>;
}

function ScheduleView({ data, fixtures, role, filterSport, setFilterSport, filterSection, setFilterSection, filterDay, setFilterDay, filterVenue, setFilterVenue, filterStatus, setFilterStatus, refresh, toast }: { data: CompetitionData; fixtures: Fixture[]; role: Role; filterSport: string; setFilterSport: (value: string) => void; filterSection: string; setFilterSection: (value: string) => void; filterDay: string; setFilterDay: (value: string) => void; filterVenue: string; setFilterVenue: (value: string) => void; filterStatus: string; setFilterStatus: (value: string) => void; refresh: () => Promise<void>; toast: (message: string, error?: boolean) => void }) {
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<Fixture | null>(null);
  const canEdit = role === "scheduler" || role === "central-admin";
  const dayOptions = [...new Map(data.fixtures.map((fixture) => [formatDayKey(fixture.startsAt), formatFixtureDate(fixture.startsAt)])).entries()].map(([value, label]) => ({ value, label }));
  const venueOptions = [...new Set(data.fixtures.map((fixture) => fixture.venue).filter(Boolean))];
  return <div className="view-content"><div className="page-title-row"><div><p className="eyebrow">THE RUN OF SHOW <span>·</span> FIXTURES & VENUES</p><h1>Schedule<span className="title-period">.</span></h1><p className="subtitle">One shared calendar for every sport, section, and venue.</p></div>{canEdit && <button className="primary-button" onClick={() => { setEditing(null); setShowCreate((value) => !value); }}><Plus size={16} /> ADD FIXTURE</button>}</div>
    <div className="filter-row"><label><span>SPORT</span><select value={filterSport} onChange={(event) => setFilterSport(event.target.value)}><option value="all">All sports</option>{data.sports.map((sport) => <option value={sport.id} key={sport.id}>{sport.name}</option>)}</select></label><label><span>SECTION</span><select value={filterSection} onChange={(event) => setFilterSection(event.target.value)}><option value="all">All sections</option>{data.sections.map((section) => <option value={section.id} key={section.id}>{section.name}</option>)}</select></label><label><span>DAY</span><select value={filterDay} onChange={(event) => setFilterDay(event.target.value)}><option value="all">All days</option>{dayOptions.map((day) => <option value={day.value} key={day.value}>{day.label}</option>)}</select></label><label><span>VENUE</span><select value={filterVenue} onChange={(event) => setFilterVenue(event.target.value)}><option value="all">All venues</option>{venueOptions.map((venue) => <option value={venue} key={venue}>{venue}</option>)}</select></label><label><span>STATUS</span><select value={filterStatus} onChange={(event) => setFilterStatus(event.target.value)}><option value="all">All statuses</option><option value="scheduled">Scheduled</option><option value="live">Live</option><option value="awaiting-confirmation">Needs review</option><option value="completed">Final</option></select></label><span className="filter-result-count">{fixtures.length} FIXTURES</span></div>
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
    void submit({ eventId: String(form.get("eventId")), sectionA: String(form.get("sectionA")), sectionB: String(form.get("sectionB")), startsAt: date.toISOString(), durationMinutes: Number(form.get("durationMinutes")), venue: String(form.get("venue")) });
  }
  return <form className="create-fixture" onSubmit={handleSubmit}><div className="create-fixture-title"><div><p className="eyebrow">SCHEDULING DESK</p><h2>{initial ? "Change a fixture" : "Add a fixture"}</h2></div><button type="button" className="icon-button" aria-label="Close" onClick={onClose}><X size={18} /></button></div>{conflict && <div className="conflict-warning"><Shield size={17} /><span>{conflict} If this overlap is intentional, publish with acknowledgement.</span><button type="button" disabled={busy} onClick={() => payload && void submit(payload, true)}>ACKNOWLEDGE & PUBLISH</button></div>}<div className="form-grid"><label>SPORT / EVENT<select name="eventId" defaultValue={initial?.eventId ?? data.events[0]?.id} required>{data.events.map((item) => <option value={item.id} key={item.id}>{eventSportName(data, item.id)}</option>)}</select></label><label>SECTION A<select name="sectionA" value={sectionA} onChange={(event) => setSectionA(event.target.value as SectionId)}>{data.sections.map((section) => <option value={section.id} key={section.id}>{section.name}</option>)}</select></label><label>SECTION B<select name="sectionB" defaultValue={initial?.sectionB ?? data.sections.find((section) => section.id !== sectionA)?.id}>{data.sections.filter((section) => section.id !== sectionA).map((section) => <option value={section.id} key={section.id}>{section.name}</option>)}</select></label><div className="schedule-date-field"><span className="form-field-label">DATE &amp; TIME</span><DateTimePicker defaultValue={initial ? localDateTime(initial.startsAt) : ""} /></div><label>VENUE<input name="venue" defaultValue={initial?.venue ?? ""} placeholder="Court / field / hall" required /></label><label>DURATION · MIN<input name="durationMinutes" type="number" min="1" defaultValue={initial?.durationMinutes ?? 45} required /></label></div><div className="form-actions"><span>Conflicts are flagged before publishing.</span><button className="primary-button" type="submit" disabled={busy}>{initial ? "SAVE CHANGES" : "SAVE FIXTURE"} <ArrowRight size={14} /></button></div></form>;
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
  const statusLabel: Record<string, string> = { live: "Live", scheduled: "Scheduled", "awaiting-confirmation": "Needs review", completed: "Final" };
  return <div className="schedule-row"><div className="schedule-time"><strong>{formatTime(fixture.startsAt)}</strong><small>{formatFixtureDate(fixture.startsAt)}</small></div><div className="schedule-match"><small>{eventSportName(data, fixture.eventId)}</small><strong>{sectionName(data, fixture.sectionA)} <span>VS</span> {sectionName(data, fixture.sectionB)}</strong></div><div className="schedule-venue">{fixture.venue}<small>{fixture.durationMinutes} MIN</small></div><span className={`schedule-status ${fixture.status}`}><i />{statusLabel[fixture.status]}</span>{canEdit && <button className="text-button schedule-edit" onClick={onEdit}>EDIT</button>}</div>;
}

function FixtureList({ data, fixtures }: { data: CompetitionData; fixtures: Fixture[] }) {
  return <div className="fixture-list">{fixtures.length ? fixtures.map((fixture) => <div className="fixture-row" key={fixture.id}><div className="fixture-date"><strong>{formatTime(fixture.startsAt)}</strong><small>{formatFixtureDateShort(fixture.startsAt)}</small></div><div className="fixture-detail"><strong>{sectionName(data, fixture.sectionA)} <span>vs</span> {sectionName(data, fixture.sectionB)}</strong><small>{eventSportName(data, fixture.eventId)} <i>·</i> {fixture.venue}</small></div><span className="fixture-format">{fixture.periodLabel}</span><button className="icon-button" aria-label="Open fixture details"><ArrowRight size={16} /></button></div>) : <div className="empty-inline">No upcoming fixtures have been published.</div>}</div>;
}

function StandingsView({ data }: { data: CompetitionData }) {
  const points = data.sections.map(() => 0);
  return <div className="view-content"><div className="page-title-row"><div><p className="eyebrow">THE DIVISION RACE <span>·</span> AFTER CONFIRMED EVENTS</p><h1>Standings<span className="title-period">.</span></h1><p className="subtitle">The full table. Every point tied back to an event result.</p></div><button className="filter-button"><Medal size={15} /> ALL EVENTS <ChevronDown size={14} /></button></div><div className="standings-ribbon"><span className="ribbon-orbit">DW</span><div><small>FIRST-YEAR EDITION</small><strong>Points appear when event results are confirmed.</strong></div><div className="ribbon-metric"><b>{data.sections.length}</b><span>sections</span></div><div className="ribbon-metric"><b>{data.events.length}</b><span>events</span></div></div><div className="standings-table-wrap"><table className="standings-table"><thead><tr><th>SECTION</th><th>POINTS</th><th>EVENT WINS</th><th>RECENT FORM</th><th>MOVE</th></tr></thead><tbody>{data.sections.map((section, index) => <tr key={section.id}><td><span className="table-section"><i style={{ background: section.color }} /><strong>{section.name}</strong><small>FIRST YEAR</small></span></td><td className="table-points">{points[index]}<small>PTS</small></td><td>—</td><td><span className="form-dots">{[0,1,2,3,4].map((dot) => <i key={dot} className="pending" />)}</span></td><td><span className="movement">—</span></td></tr>)}</tbody></table></div><div className="standings-disclaimer"><CircleHelp size={15} /> No points are shown yet. Configure scoring and confirm event results to populate the board.</div></div>;
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
    try { await api("/api/admin/events", "PUT", {
      eventId, name: form.get("name"), format: form.get("format"), minPlayers: Number(form.get("minPlayers")),
      maxPlayers: maxText ? Number(maxText) : null, entriesPerDivision: Number(form.get("entriesPerDivision")),
      substitutePlayers: Number(form.get("substitutePlayers")), genderEligibility: form.get("genderEligibility"),
      tournamentFormat: form.get("tournamentFormat"), matchCount: matchText ? Number(matchText) : null,
      rosterRules: values("rosterRules"), scoringRules: values("scoringRules"), scoringType: form.get("scoringType"),
      outcomePoints: outcomes, points, publishPoints: form.get("publishPoints") === "on",
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
    <div className="event-layout"><div className="event-list">{data.events.map((item) => <button className={`event-list-item ${item.id === eventId ? "active" : ""}`} key={item.id} onClick={() => setEventId(item.id)}><span className="event-symbol">{item.sportId.slice(0, 2).toUpperCase()}</span><span><strong>{eventSportName(data, item.id)}</strong><small>{item.format}</small></span><span className={`config-state ${item.pointsPolicy.published ? "published" : "pending"}`}>{item.pointsPolicy.published ? "PUBLISHED" : "SETUP"}</span></button>)}</div>{event && <div className="event-editor-column"><form key={event.id} className="event-editor" onSubmit={(eventForm) => void save(eventForm)}><div className="event-editor-head"><div><p className="eyebrow">EVENT RULES</p><h2>{eventSportName(data, event.id)}</h2></div><span className={`policy-status ${event.pointsPolicy.published ? "published" : "pending"}`}>{event.pointsPolicy.published ? "POINTS PUBLISHED" : "POINTS DRAFT"}</span></div><div className="rule-form-grid"><label>EVENT NAME<input name="name" defaultValue={event.name} disabled={!canEdit} /></label><label>ENTRY / MATCH FORMAT<input name="format" defaultValue={event.format} disabled={!canEdit} /></label><label>MIN PLAYERS PER TEAM<input type="number" name="minPlayers" min="1" defaultValue={event.minPlayers ?? 1} disabled={!canEdit} /></label><label>MAX PLAYERS · BLANK = UNLIMITED<input type="number" name="maxPlayers" min="1" defaultValue={event.maxPlayers ?? ""} disabled={!canEdit} /></label><label>ENTRIES PER DIVISION<input type="number" name="entriesPerDivision" min="1" defaultValue={event.entriesPerDivision} disabled={!canEdit} /></label><label>SUBSTITUTES<input type="number" name="substitutePlayers" min="0" defaultValue={event.substitutePlayers} disabled={!canEdit} /></label><label>GENDER ELIGIBILITY<select name="genderEligibility" defaultValue={event.genderEligibility} disabled={!canEdit}><option value="men">Men</option><option value="women">Women</option><option value="mixed">Mixed</option><option value="open">Open</option></select></label><label>SCORING TYPE<input name="scoringType" defaultValue={event.scoringType} disabled={!canEdit} /></label><label>TOURNAMENT STRUCTURE<input name="tournamentFormat" defaultValue={event.tournamentFormat} disabled={!canEdit} /></label><label>MATCH COUNT · BLANK = VARIABLE<input name="matchCount" type="number" min="1" defaultValue={event.matchCount ?? ""} disabled={!canEdit} /></label><label>POINTS BY PLACE · COMMA SEPARATED<input name="points" defaultValue={event.pointsPolicy.places.join(", ")} disabled={!canEdit} placeholder="e.g. 10, 7, 5, 3, 1" /></label><label>POINTS BY OUTCOME · KEY=VALUE, ONE PER LINE<textarea name="outcomePoints" rows={5} defaultValue={Object.entries(event.pointsPolicy.pointsByOutcome ?? {}).map(([key, value]) => `${key}=${value}`).join("\n")} disabled={!canEdit} /></label><label>ROSTER RULES · ONE PER LINE<textarea name="rosterRules" rows={5} defaultValue={event.rosterRules.join("\n")} disabled={!canEdit} /></label><label>SCORING RULES · ONE PER LINE<textarea name="scoringRules" rows={5} defaultValue={event.scoringRules.join("\n")} disabled={!canEdit} /></label></div><div className="event-editor-footer"><label className="publish-toggle"><input name="publishPoints" type="checkbox" defaultChecked={event.pointsPolicy.published} disabled={!canEdit} /><span>Publish this points policy</span></label>{canEdit && <button className="primary-button" type="submit" disabled={busy}>SAVE EVENT RULES <ArrowRight size={14} /></button>}</div></form>{canEdit && sport && <form className="event-editor" onSubmit={(formEvent) => void saveSport(formEvent)}><div className="event-editor-head"><div><p className="eyebrow">SPORT-WIDE PARTICIPATION · {sport.name}</p><h2>Cross-event limits</h2></div></div><div className="rule-form-grid"><label>CATEGORY<select name="category" defaultValue={sport.category}><option value="sport">Sport</option><option value="cultural">Cultural</option></select></label><label>MAX FORMATS PER PLAYER · BLANK = UNLIMITED<input name="maxFormatsPerPlayer" type="number" min="1" defaultValue={sport.maxFormatsPerPlayer ?? ""} /></label><label className="publish-toggle"><input name="countsTowardOverallSportsCap" type="checkbox" defaultChecked={sport.countsTowardOverallSportsCap} /><span>Counts toward section sports cap</span></label><label>SHARED PARTICIPATION RULES · ONE PER LINE<textarea name="participationNotes" rows={5} defaultValue={sport.participationNotes.join("\n")} /></label></div><div className="event-editor-footer"><span>Cultural activities are excluded from the sports cap.</span><button className="primary-button" type="submit" disabled={busy}>SAVE SPORT RULES <ArrowRight size={14} /></button></div></form>}</div>}</div></div>;
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




