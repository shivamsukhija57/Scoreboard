"use client";

import { useEffect, useState } from "react";
import type { CompetitionData, EventDefinition, EventTally, HuntMilestone, QuizMarking, SectionId, TallyEntry } from "@/lib/domain";
import { activeEntries, compareRows, DEFAULT_HUNT_POINTS, DEFAULT_QUIZ_MARKING, huntArrivals, huntPointsFor, QUIZ_QUESTIONS, QUIZ_QUESTIONS_PER_SECTION, QUIZ_SECTIONS, tallyKindFor, tallyStandings, tieGroups, type TallyKind, type TallyRow } from "@/lib/tally";
import { DivChip, lineColor, sectionOf } from "./event-features";
import { InlineConfirm } from "./inline-confirm";

type Toast = (message: string, error?: boolean) => void;
interface PadProps { data: CompetitionData; event: EventDefinition; canScore: boolean; refresh: () => Promise<void>; toast: Toast }

const QUIZ_SECTION_NAMES = ["Section 1", "Section 2", "Section 3", "Section 4", "Section 5"];
const ordinal = (n: number) => `${n}${["st", "nd", "rd"][n - 1] ?? "th"}`;
const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : "0");

async function postTally(body: Record<string, unknown>): Promise<{ tally: EventTally; placings: boolean }> {
  let response: Response;
  try {
    response = await fetch("/api/results/tally", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  } catch {
    throw new Error("Couldn't reach Division Wars. Check your connection and try again; nothing was saved.");
  }
  const result = await response.json().catch(() => ({} as { error?: string }));
  if (!response.ok) {
    if (response.status === 401) throw new Error("You've been signed out. Sign in again, then retry.");
    if (response.status >= 500) throw new Error("The server had a problem and nothing was saved. Try again in a moment.");
    throw new Error((result as { error?: string }).error ?? "That didn't go through. Try again.");
  }
  return result as { tally: EventTally; placings: boolean };
}

/** The tally from the competition data, or the newer copy this pad just saved (the data refreshes every 30 s). */
function useTally(data: CompetitionData, event: EventDefinition, refresh: () => Promise<void>, toast: Toast) {
  const [saved, setSaved] = useState<EventTally | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => setSaved(null), [event.id]);
  const stored = data.tallies?.[event.id];
  const tally = saved && saved.eventId === event.id && (!stored || saved.updatedAt >= stored.updatedAt) ? saved : stored;
  async function send(body: Record<string, unknown>, success?: string): Promise<boolean> {
    if (busy) return false;
    setBusy(true);
    try {
      const result = await postTally({ eventId: event.id, ...body });
      setSaved(result.tally);
      if (result.placings) await refresh();
      if (success) toast(success);
      return true;
    } catch (error) { toast(error instanceof Error ? error.message : "That didn't save.", true); return false; }
    finally { setBusy(false); }
  }
  return { tally, busy, send };
}

function recordedPlacings(data: CompetitionData, eventId: string) {
  return (data.bonusAwards ?? []).filter((award) => award.eventId === eventId && award.kind === "placing");
}

/** Live standings: division, a bar against the leader, the total (and first places for the hunt). */
export function TallyStandings({ data, kind, rows, caption }: { data: CompetitionData; kind: TallyKind; rows: TallyRow[]; caption?: string }) {
  const top = Math.max(1, ...rows.map((row) => row.total));
  let place = 0;
  return <div className="tp-standings">
    {caption && <p className="tp-caption">{caption}</p>}
    <ol>{rows.map((row, index) => {
      if (index === 0 || compareRows(kind, rows[index - 1], row) !== 0) place = index + 1;
      const section = sectionOf(data, row.sectionId);
      return <li key={row.sectionId}>
        <span className="tp-place">{place}</span>
        <DivChip section={section} size="m" />
        <span className="tp-standing-name">{section?.name}{kind === "hunt" && <small>{row.firsts} first{row.firsts === 1 ? "" : "s"}</small>}</span>
        <span className="tp-bar" aria-hidden="true"><i style={{ width: `${Math.max(0, row.total) / top * 100}%`, background: lineColor(section) }} /></span>
        <b className={row.total < 0 ? "tp-negative" : ""}>{signed(row.total).replace("+", "")}</b>
      </li>;
    })}</ol>
  </div>;
}

/** Spectator card: the live quiz or hunt standings, shown while it's running (event page, Live matches). */
export function TallyLiveCard({ data, event, onOpen }: { data: CompetitionData; event: EventDefinition; onOpen?: () => void }) {
  const kind = tallyKindFor(event);
  const tally = data.tallies?.[event.id];
  if (!kind || !tally || !activeEntries(tally).length || recordedPlacings(data, event.id).length) return null;
  const rows = tallyStandings(tally, data.sections.map((section) => section.id));
  const status = kind === "quiz" ? `Question ${tally.question ?? 1} of ${QUIZ_QUESTIONS}` : `${(tally.milestones ?? []).filter((milestone) => huntArrivals(tally, milestone.id).length).length} of ${(tally.milestones ?? []).length} milestones reached`;
  return <section className="tp-live-card" aria-label={`${event.name} live standings`}>
    <div className="tp-live-head"><span className="tp-live-pill"><i />Live</span><div><strong>{event.name}</strong><small>{status}</small></div>{onOpen && <button type="button" className="secondary-button" onClick={onOpen}>Open scorer</button>}</div>
    <TallyStandings data={data} kind={kind} rows={rows} />
  </section>;
}

/** Finish and rank: the order by the rulebook, tied divisions put in order by the organizer with a note, then confirm. */
function FinishAndRank({ data, event, kind, rows, busy, send }: { data: CompetitionData; event: EventDefinition; kind: TallyKind; rows: TallyRow[]; busy: boolean; send: (body: Record<string, unknown>, success?: string) => Promise<boolean> }) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [order, setOrder] = useState<SectionId[]>([]);
  const [note, setNote] = useState("");
  const groups = tieGroups(kind, rows);
  const byId = new Map(rows.map((row) => [row.sectionId, row]));
  const places = event.pointsPolicy.places;
  const start = () => { setOrder(rows.map((row) => row.sectionId)); setNote(""); setConfirming(false); setOpen(true); };
  const move = (index: number, by: -1 | 1) => setOrder((current) => { const next = [...current]; [next[index], next[index + by]] = [next[index + by], next[index]]; return next; });
  const level = (a?: SectionId, b?: SectionId) => !!a && !!b && compareRows(kind, byId.get(a)!, byId.get(b)!) === 0;
  const needsNote = groups.length > 0;
  if (!open) return <div className="tp-finish-row"><button type="button" className="primary-button" disabled={busy || !rows.some((row) => row.entries > 0)} onClick={start}>Finish and rank</button><span className="tp-note">Ranks every division by {kind === "quiz" ? "total marks" : "total, then most first places"} and records the placings.</span></div>;
  return <section className="tp-finish" aria-label="Finish and rank">
    <strong className="tp-finish-title">{confirming ? "Check before recording" : "Final order"}</strong>
    {groups.length > 0 && !confirming && <p className="tp-tie-flag" role="status">{groups.map((group) => group.map((id) => sectionOf(data, id)?.name).join(" and ")).join("; ")} are level{kind === "hunt" ? " on points and first places" : ""}. {kind === "quiz" ? "Settle it with a tie-breaker question or sudden death" : "Settle it as the hunt coordinator decides"}, then put them in order and say how.</p>}
    <ol className="tp-order">{order.map((id, index) => { const section = sectionOf(data, id); const row = byId.get(id)!; const tiedUp = level(order[index - 1], id); const tiedDown = level(id, order[index + 1]); return <li key={id} className={tiedUp || tiedDown ? "tied" : ""}>
      <span className="tp-place">{index + 1}</span><DivChip section={section} size="m" /><span className="tp-standing-name">{section?.name}<small>{signed(row.total).replace("+", "")} {kind === "quiz" ? "marks" : `points · ${row.firsts} first${row.firsts === 1 ? "" : "s"}`}{tiedUp || tiedDown ? " · level" : ""}</small></span><b>+{places[index] ?? 0}</b>
      {!confirming && (tiedUp || tiedDown) && <span className="tp-move"><button type="button" className="secondary-button" disabled={!tiedUp} aria-label={`Move ${section?.name} up`} onClick={() => move(index, -1)}>Up</button><button type="button" className="secondary-button" disabled={!tiedDown} aria-label={`Move ${section?.name} down`} onClick={() => move(index, 1)}>Down</button></span>}
    </li>; })}</ol>
    {!confirming && <label className="tp-field">{needsNote ? "How the tie was settled" : "Note · optional"}<input value={note} maxLength={300} onChange={(change) => setNote(change.target.value)} placeholder={kind === "quiz" ? "e.g. Ares won the tie-breaker question" : "e.g. Coordinator's call on arrival photos"} /></label>}
    {confirming && <p className="tp-note">Points go on the board straight away, scoring closes, and only a central admin can withdraw them.{note.trim() ? ` Note: ${note.trim()}` : ""}</p>}
    <div className="tp-actions">
      <button type="button" className="secondary-button" disabled={busy} onClick={() => (confirming ? setConfirming(false) : setOpen(false))}>{confirming ? "Back" : "Cancel"}</button>
      {confirming
        ? <button type="button" className="primary-button" disabled={busy} onClick={() => void send({ action: "finish", order, note: note.trim() || undefined }, `${event.name} results recorded and points awarded.`).then((ok) => { if (ok) setOpen(false); })}>{busy ? "Recording…" : "Record results"}</button>
        : <button type="button" className="primary-button" disabled={needsNote && !note.trim()} onClick={() => setConfirming(true)}>Review results</button>}
    </div>
  </section>;
}

function RecordedBanner({ data, event }: { data: CompetitionData; event: EventDefinition }) {
  if (!recordedPlacings(data, event.id).length) return null;
  return <p className="tp-closed" role="status">Results recorded. Scoring is closed; the final placings are below.</p>;
}

function UndoLast({ entry, label, busy, send, describe }: { entry?: TallyEntry; label: string; busy: boolean; send: (body: Record<string, unknown>) => Promise<boolean>; describe: (entry: TallyEntry) => string }) {
  return <div className="tp-undo-row"><span className="tp-note" role="status">{busy ? "Saving…" : entry ? `Last: ${describe(entry)}` : "Saved · live"}</span>{entry && <InlineConfirm label={label} buttonClass="text-button tp-undo" disabled={busy} title={`Undo ${describe(entry)}?`} reasonLabel="Why undo it?" placeholder="e.g. Marked the wrong division" confirmLabel="Undo" onConfirm={(reason) => void send({ action: "undo", reason })} />}</div>;
}

/** Quiz: marks set before the start, then one row per division with a big button for each way to score. */
export function QuizPad({ data, event, canScore, refresh, toast }: PadProps) {
  const { tally, busy, send } = useTally(data, event, refresh, toast);
  const marking: QuizMarking = tally?.quiz ?? DEFAULT_QUIZ_MARKING;
  const question = tally?.question ?? 1;
  const active = activeEntries(tally);
  const rows = tallyStandings(tally ?? { kind: "quiz", entries: [] }, data.sections.map((section) => section.id));
  const closed = recordedPlacings(data, event.id).length > 0;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<QuizMarking>(marking);
  useEffect(() => { if (!editing) setDraft(marking); }, [editing, marking.direct, marking.bounce, marking.pounceRight, marking.pounceWrong]); // eslint-disable-line react-hooks/exhaustive-deps
  const sectionIndex = Math.ceil(question / QUIZ_QUESTIONS_PER_SECTION) - 1;
  const actions: Array<[string, string, number, string]> = [["direct", "Direct", marking.direct, "right"], ["bounce", "Bounce", marking.bounce, "right"], ["pounce-right", "Pounce right", marking.pounceRight, "pounce"], ["pounce-wrong", "Pounce wrong", marking.pounceWrong, "wrong"]];
  const name = (id: SectionId) => sectionOf(data, id)?.name ?? id;
  const describe = (entry: TallyEntry) => `${name(entry.sectionId)} ${actions.find(([kind]) => kind === entry.kind)?.[1].toLowerCase() ?? entry.kind} ${signed(entry.points)} (Q${entry.question ?? "?"})`;
  if (!canScore) return <section className="tally-pad"><div className="tp-head"><div><p className="eyebrow">Quiz · bounce and pounce</p><strong className="tp-title">Live standings</strong></div></div>{active.length ? <TallyStandings data={data} kind="quiz" rows={rows} /> : <p className="tp-note">The standings appear here once the quiz starts.</p>}</section>;
  return <section className="tally-pad" aria-label="Quiz scorer">
    <div className="tp-band" aria-hidden="true">{data.sections.map((section) => <i key={section.id} style={{ background: section.color }} />)}</div>
    <div className="tp-head"><div><p className="eyebrow">Quiz scorer · bounce and pounce</p><strong className="tp-title">Question {question} of {QUIZ_QUESTIONS}</strong></div><span className={`tp-status${busy ? " saving" : ""}`}>{busy ? "Saving" : closed ? "Closed" : "Saved"}</span></div>
    <RecordedBanner data={data} event={event} />
    <div className="tp-sections" role="group" aria-label="Quiz sections">{Array.from({ length: QUIZ_SECTIONS }, (_, index) => <span key={index} className={index === sectionIndex ? "on" : index < sectionIndex ? "done" : ""}>{QUIZ_SECTION_NAMES[index]}{index === sectionIndex ? ` · ${question - index * QUIZ_QUESTIONS_PER_SECTION}/${QUIZ_QUESTIONS_PER_SECTION}` : ""}</span>)}</div>
    {!closed && <div className="tp-question-nav"><button type="button" className="secondary-button" disabled={busy || question <= 1} onClick={() => void send({ action: "question", question: question - 1 })}>Previous question</button><button type="button" className="secondary-button" disabled={busy || question >= QUIZ_QUESTIONS} onClick={() => void send({ action: "question", question: question + 1 })}>Next question</button></div>}

    <div className="tp-marks">
      <div className="tp-marks-head"><strong>Marks for this quiz</strong>{!closed && (active.length ? <span className="tp-note">Locked once scoring starts</span> : !editing && <button type="button" className="text-button" onClick={() => setEditing(true)}>Change marks</button>)}</div>
      {editing ? <form className="tp-marks-form" onSubmit={(formEvent) => { formEvent.preventDefault(); void send({ action: "settings", marking: draft }, "Marks saved.").then((ok) => { if (ok) setEditing(false); }); }}>
        {([["direct", "Direct", 0, 100], ["bounce", "Bounce", 0, 100], ["pounceRight", "Pounce right", 0, 100], ["pounceWrong", "Pounce wrong", -100, 0]] as const).map(([key, label, min, max]) => <label key={key} className="tp-field">{label}<input type="number" inputMode="numeric" min={min} max={max} step={1} value={draft[key]} onChange={(change) => setDraft((current) => ({ ...current, [key]: Number(change.target.value) }))} /></label>)}
        <div className="tp-actions"><button type="button" className="secondary-button" onClick={() => setEditing(false)}>Cancel</button><button type="submit" className="primary-button" disabled={busy}>Save marks</button></div>
      </form> : <div className="tp-mark-tiles">{actions.map(([kind, label, points]) => <span key={kind}><b className={points < 0 ? "tp-negative" : ""}>{signed(points)}</b><small>{label}</small></span>)}</div>}
    </div>

    {!closed && <ol className="tp-rows">{data.sections.map((section) => { const row = rows.find((item) => item.sectionId === section.id); return <li key={section.id} className="tp-row">
      <div className="tp-row-head"><DivChip section={section} size="m" /><span className="tp-row-name">{section.name}</span><b className={`tp-row-total${(row?.total ?? 0) < 0 ? " tp-negative" : ""}`}>{signed(row?.total ?? 0).replace("+", "")}</b></div>
      <div className="tp-row-buttons">{actions.map(([kind, label, points, tone]) => <button key={kind} type="button" className={`tp-score ${tone}`} disabled={busy} aria-label={`${label} ${signed(points)} for ${section.name}`} onClick={() => void send({ action: "add", sectionId: section.id, kind })}><span>{label}</span><b>{signed(points)}</b></button>)}</div>
    </li>; })}</ol>}
    {!closed && <UndoLast entry={active.at(-1)} label="Undo last entry" busy={busy} send={send} describe={describe} />}
    <TallyStandings data={data} kind="quiz" rows={rows} caption="These totals show live on the Quiz event page. If divisions are level at the end, a tie-breaker question or sudden death decides." />
    {!closed && <FinishAndRank data={data} event={event} kind="quiz" rows={rows} busy={busy} send={send} />}
  </section>;
}

/** Treasure hunt: milestones and their points set before the start, then a volunteer checks teams in as they arrive. */
export function HuntPad({ data, event, canScore, refresh, toast }: PadProps) {
  const { tally, busy, send } = useTally(data, event, refresh, toast);
  const milestones = tally?.milestones ?? [{ id: "m1", name: "Milestone 1", points: DEFAULT_HUNT_POINTS.slice(0, data.sections.length) }];
  const active = activeEntries(tally);
  const rows = tallyStandings(tally ?? { kind: "hunt", entries: [] }, data.sections.map((section) => section.id));
  const closed = recordedPlacings(data, event.id).length > 0;
  const [milestoneId, setMilestoneId] = useState(milestones[0]?.id ?? "");
  const [present, setPresent] = useState<Record<string, boolean>>({});
  const [setup, setSetup] = useState(false);
  const [draft, setDraft] = useState<Array<HuntMilestone & { isNew?: boolean }>>(milestones);
  useEffect(() => { if (!milestones.some((item) => item.id === milestoneId)) setMilestoneId(milestones[0]?.id ?? ""); }, [milestones.map((item) => item.id).join()]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => setPresent({}), [milestoneId]);
  const milestone = milestones.find((item) => item.id === milestoneId);
  const arrivals = milestone && tally ? huntArrivals(tally, milestone.id) : [];
  const name = (id: SectionId) => sectionOf(data, id)?.name ?? id;
  const milestoneName = (id?: string) => milestones.find((item) => item.id === id)?.name ?? "milestone";
  const describe = (entry: TallyEntry) => `${name(entry.sectionId)} ${ordinal(entry.place ?? 0)} at ${milestoneName(entry.milestoneId)} ${signed(entry.points)}`;
  const locked = (id: string) => !!tally && huntArrivals(tally, id).length > 0;
  if (!canScore) return <section className="tally-pad"><div className="tp-head"><div><p className="eyebrow">Treasure hunt</p><strong className="tp-title">Live standings</strong></div></div>{active.length ? <TallyStandings data={data} kind="hunt" rows={rows} /> : <p className="tp-note">The standings appear here once the hunt starts.</p>}</section>;
  const openSetup = () => { setDraft(milestones.map((item) => ({ ...item, points: [...item.points] }))); setSetup(true); };
  return <section className="tally-pad" aria-label="Treasure hunt check-in">
    <div className="tp-band" aria-hidden="true">{data.sections.map((section) => <i key={section.id} style={{ background: section.color }} />)}</div>
    <div className="tp-head"><div><p className="eyebrow">Volunteer · milestone station</p><strong className="tp-title">{milestone?.name ?? "Set up milestones"}</strong></div><span className={`tp-status${busy ? " saving" : ""}`}>{busy ? "Saving" : closed ? "Closed" : "Saved"}</span></div>
    <RecordedBanner data={data} event={event} />

    {setup ? <form className="tp-setup" onSubmit={(formEvent) => { formEvent.preventDefault(); void send({ action: "settings", milestones: draft.map(({ id, name: label, points, isNew }) => ({ id: isNew ? undefined : id, name: label, points })) }, "Milestones saved.").then((ok) => { if (ok) setSetup(false); }); }}>
      <p className="tp-note">Announce these before the hunt. Points go to the 1st, 2nd, 3rd, 4th and 5th team to arrive with everyone together. A milestone's points lock at its first check-in.</p>
      {draft.map((item, index) => <fieldset key={item.id} className="tp-milestone-edit" disabled={busy}>
        <legend className="sr-only">Milestone {index + 1}</legend>
        <label className="tp-field">Milestone {index + 1}<input value={item.name} maxLength={60} required onChange={(change) => setDraft((current) => current.map((value, position) => position === index ? { ...value, name: change.target.value } : value))} /></label>
        <div className="tp-points-inputs">{item.points.map((points, place) => <label key={place} className="tp-field">{ordinal(place + 1)}<input type="number" inputMode="numeric" min={0} max={1000} step={1} value={points} disabled={locked(item.id)} onChange={(change) => setDraft((current) => current.map((value, position) => position === index ? { ...value, points: value.points.map((old, slot) => slot === place ? Number(change.target.value) : old) } : value))} /></label>)}</div>
        {locked(item.id) ? <span className="tp-note">Has check-ins · points locked</span> : draft.length > 1 && <button type="button" className="text-button" onClick={() => setDraft((current) => current.filter((_, position) => position !== index))}>Remove</button>}
      </fieldset>)}
      <div className="tp-actions"><button type="button" className="secondary-button" disabled={draft.length >= 30} onClick={() => setDraft((current) => [...current, { id: `new-${Date.now()}`, name: `Milestone ${current.length + 1}`, points: DEFAULT_HUNT_POINTS.slice(0, data.sections.length), isNew: true }])}>Add milestone</button><span className="tp-spacer" /><button type="button" className="secondary-button" onClick={() => setSetup(false)}>Cancel</button><button type="submit" className="primary-button" disabled={busy}>Save milestones</button></div>
    </form> : <>
      <div className="tp-milestone-pick"><label className="tp-field">Milestone<select value={milestoneId} onChange={(change) => setMilestoneId(change.target.value)}>{milestones.map((item) => <option key={item.id} value={item.id}>{item.name} · {tally ? huntArrivals(tally, item.id).length : 0} of {data.sections.length} in</option>)}</select></label>{!closed && <button type="button" className="secondary-button" onClick={openSetup}>Set up milestones</button>}</div>
      {milestone && <p className="tp-note">Points by arrival: {milestone.points.map((points, index) => `${ordinal(index + 1)} ${points}`).join(" · ")}. Mark a team only when all its members are here together.</p>}
      {milestone && <ol className="tp-arrivals">{arrivals.map((id, index) => <li key={id} className="tp-arrived"><DivChip section={sectionOf(data, id)} size="m" /><span className="tp-row-name">{name(id)}<small>Arrived {ordinal(index + 1)}</small></span><b>{signed(huntPointsFor(milestone, index + 1))}</b></li>)}
        {!closed && data.sections.filter((section) => !arrivals.includes(section.id)).map((section) => <li key={section.id} className="tp-waiting">
          <div className="tp-row-head"><DivChip section={section} size="m" /><span className="tp-row-name">{section.name}<small>Would arrive {ordinal(arrivals.length + 1)} · {signed(huntPointsFor(milestone, arrivals.length + 1))}</small></span></div>
          <div className="tp-checkin"><label className="tp-check"><input type="checkbox" checked={!!present[section.id]} onChange={(change) => setPresent((current) => ({ ...current, [section.id]: change.target.checked }))} />All members here</label><button type="button" className="tp-arrive" disabled={busy || !present[section.id]} onClick={() => void send({ action: "add", sectionId: section.id, milestoneId: milestone.id, allPresent: true }).then((ok) => { if (ok) setPresent((current) => ({ ...current, [section.id]: false })); })}>Arrived</button></div>
        </li>)}
      </ol>}
    </>}
    {!closed && !setup && <UndoLast entry={active.at(-1)} label="Undo last check-in" busy={busy} send={send} describe={describe} />}
    <TallyStandings data={data} kind="hunt" rows={rows} caption="Totals across all milestones. If two divisions are level, the one with more first-place finishes ranks higher." />
    {!closed && !setup && <FinishAndRank data={data} event={event} kind="hunt" rows={rows} busy={busy} send={send} />}
  </section>;
}
