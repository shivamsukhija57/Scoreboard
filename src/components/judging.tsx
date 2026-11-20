"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { CompetitionData, EventDefinition, EventJudging, JudgingCombine, JudgingMethod, JudgingPenaltyKind, SectionId, UserAccess } from "@/lib/domain";
import { announceBlocker, canJudgeEvent, criteriaLocked, criteriaTotal, isJudgedEvent, judgesIn, judgingFor, maxScore, MAX_CRITERIA, MAX_ITEMS, MAX_JUDGES, penaltyPresets, penaltyText, rankedRows, round2, scoreRows, scoreTies, type ScoreRow } from "@/lib/judging";
import { DivChip, formatTime, sectionOf } from "./event-features";
import { InlineConfirm } from "./inline-confirm";
import { StageResult } from "./results-reveal";

type Toast = (message: string, error?: boolean) => void;
const ordinal = (n: number) => `${n}${["st", "nd", "rd"][n - 1] ?? "th"}`;
const fmt = (value: number | null | undefined) => (value === null || value === undefined ? "–" : String(round2(value)));

class OfflineError extends Error {}

async function postJudging(body: Record<string, unknown>): Promise<{ judging: EventJudging; announced: boolean }> {
  let response: Response;
  try {
    response = await fetch("/api/results/judging", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  } catch {
    throw new OfflineError("Couldn't reach Division Wars. Check your connection and try again; nothing was saved.");
  }
  const result = await response.json().catch(() => ({} as { error?: string }));
  if (!response.ok) {
    if (response.status === 401) throw new Error("You've been signed out. Sign in again, then retry.");
    if (response.status >= 500) throw new Error("The server had a problem and nothing was saved. Try again in a moment.");
    throw new Error((result as { error?: string }).error ?? "That didn't go through. Try again.");
  }
  return result as { judging: EventJudging; announced: boolean };
}

/** The judging from the competition data, or the newer copy just saved here (the data refreshes every 30 s). */
function useJudging(data: CompetitionData, event: EventDefinition, refresh: () => Promise<void>, toast: Toast) {
  const [saved, setSaved] = useState<EventJudging | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => setSaved(null), [event.id]);
  const stored = judgingFor(data, event);
  const judging = saved && saved.eventId === event.id && saved.updatedAt >= stored.updatedAt ? saved : stored;
  async function send(body: Record<string, unknown>, success?: string): Promise<boolean> {
    if (busy) return false;
    setBusy(true);
    try {
      const result = await postJudging({ eventId: event.id, ...body });
      setSaved(result.judging);
      if (result.announced) await refresh();
      if (success) toast(success);
      return true;
    } catch (error) { toast(error instanceof Error ? error.message : "That didn't save.", true); return false; }
    finally { setBusy(false); }
  }
  return { judging, busy, send, setSaved };
}

// ---------- the judge's marking pad ----------

const DRAFT = (eventId: string, sectionId: string) => `dw.judgeDraft.${eventId}.${sectionId}`;
const PENDING = "dw.judgePending";
interface Pending { eventId: string; sectionId: SectionId; scores: number[][]; comment: string; at: string }
function readJson<T>(key: string): T | null { try { const raw = window.localStorage.getItem(key); return raw ? (JSON.parse(raw) as T) : null; } catch { return null; } }
function writeJson(key: string, value: unknown) { try { if (value === null) window.localStorage.removeItem(key); else window.localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode */ } }

const clamp = (value: number, max: number) => Math.max(0, Math.min(max, Math.round(value * 2) / 2));

/**
 * Phone-first: one division at a time in performance order, each criterion with its maximum, a running total, a
 * private note, and Submit (which locks). Marks are kept on this phone as they're typed; if a submit can't reach the
 * server it waits on the phone and sends itself when the connection is back. No other judge's marks, no totals.
 */
export function JudgePad({ data, event, access, refresh, toast }: { data: CompetitionData; event: EventDefinition; access: UserAccess; refresh: () => Promise<void>; toast: Toast }) {
  const { judging, setSaved } = useJudging(data, event, refresh, toast);
  const me = access.email;
  const order = judging.order.length === data.sections.length ? judging.order : data.sections.map((section) => section.id);
  const mine = judging.sheets.filter((sheet) => sheet.judge === me);
  const [pending, setPending] = useState<Pending[]>([]);
  const [sending, setSending] = useState(false);
  const submittedIds = new Set(mine.map((sheet) => sheet.sectionId));
  const waitingIds = new Set(pending.filter((item) => item.eventId === event.id).map((item) => item.sectionId));
  const firstOpen = order.find((id) => !submittedIds.has(id) && !waitingIds.has(id)) ?? order[0];
  const [current, setCurrent] = useState<SectionId>(firstOpen);
  useEffect(() => setCurrent(firstOpen), [event.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const blank = useCallback(() => Array.from({ length: judging.items }, () => judging.criteria.map(() => 0)), [judging.items, judging.criteria]);
  const [scores, setScores] = useState<number[][]>(blank);
  const [comment, setComment] = useState("");
  const shapeKey = `${judging.items}x${judging.criteria.map((item) => item.max).join(",")}`;
  // Load this division's draft from the phone when switching division (or when the criteria change).
  useEffect(() => {
    const draft = readJson<{ scores: number[][]; comment: string }>(DRAFT(event.id, current));
    const fits = draft && draft.scores.length === judging.items && draft.scores.every((row) => row.length === judging.criteria.length);
    setScores(fits ? draft.scores.map((row) => row.map((value, c) => clamp(value, judging.criteria[c].max))) : blank());
    setComment(fits ? draft.comment : "");
  }, [event.id, current, shapeKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => setPending(readJson<Pending[]>(PENDING) ?? []), []);

  const flush = useCallback(async () => {
    const queue = readJson<Pending[]>(PENDING) ?? [];
    if (!queue.length || sending) return;
    setSending(true);
    let left = [...queue];
    for (const item of queue) {
      try {
        const result = await postJudging({ eventId: item.eventId, action: "submit", sectionId: item.sectionId, scores: item.scores, comment: item.comment });
        if (item.eventId === event.id) setSaved(result.judging);
        left = left.filter((entry) => entry !== item);
        writeJson(DRAFT(item.eventId, item.sectionId), null);
        toast(`Marks for ${sectionOf(data, item.sectionId)?.name ?? "the division"} sent.`);
      } catch (error) {
        if (error instanceof OfflineError) break;
        // The server refused (already submitted, results announced…): it won't succeed by retrying.
        left = left.filter((entry) => entry !== item);
        toast(error instanceof Error ? error.message : "Those marks couldn't be sent.", true);
      }
    }
    writeJson(PENDING, left.length ? left : null);
    setPending(left);
    setSending(false);
  }, [sending, event.id, data, toast, setSaved]);
  useEffect(() => {
    const online = () => void flush();
    window.addEventListener("online", online);
    const timer = window.setInterval(() => { if (navigator.onLine) void flush(); }, 20_000);
    void flush();
    return () => { window.removeEventListener("online", online); window.clearInterval(timer); };
  }, [flush]);

  const announced = !!judging.announced;
  const section = sectionOf(data, current);
  const sheet = mine.find((item) => item.sectionId === current);
  const waiting = pending.find((item) => item.eventId === event.id && item.sectionId === current);
  const shown = sheet?.scores ?? waiting?.scores ?? scores;
  const locked = !!sheet || !!waiting || announced;
  const total = shown.reduce((sum, row) => sum + row.reduce((a, b) => a + b, 0), 0);
  const outOf = criteriaTotal(judging) * judging.items;
  const slot = judging.judges.indexOf(me) + 1 || Math.min(judging.judges.length + 1, judging.judgeCount);
  const full = !judging.judges.includes(me) && judging.judges.length >= judging.judgeCount;
  const update = (item: number, c: number, value: number) => {
    const next = scores.map((row, i) => row.map((old, k) => (i === item && k === c ? clamp(value, judging.criteria[c].max) : old)));
    setScores(next);
    writeJson(DRAFT(event.id, current), { scores: next, comment });
  };

  async function submit() {
    const body: Pending = { eventId: event.id, sectionId: current, scores, comment: comment.trim(), at: new Date().toISOString() };
    setSending(true);
    try {
      const result = await postJudging({ eventId: event.id, action: "submit", sectionId: current, scores, comment: comment.trim() });
      setSaved(result.judging);
      writeJson(DRAFT(event.id, current), null);
      toast(`Marks for ${section?.name} submitted.`);
      const next = order.find((id) => id !== current && !result.judging.sheets.some((item) => item.judge === me && item.sectionId === id));
      if (next) setCurrent(next);
    } catch (error) {
      if (error instanceof OfflineError) {
        const queue = [...(readJson<Pending[]>(PENDING) ?? []).filter((item) => !(item.eventId === event.id && item.sectionId === current)), body];
        writeJson(PENDING, queue);
        setPending(queue);
      } else toast(error instanceof Error ? error.message : "Your marks didn't submit.", true);
    } finally { setSending(false); }
  }

  const stateOf = (id: SectionId) => submittedIds.has(id) ? "Submitted" : waitingIds.has(id) ? "On phone" : id === current ? "Marking" : "To mark";
  const status = waiting ? "Saved on this phone" : sending ? "Sending" : sheet ? "Submitted" : "Saved on this phone";

  if (judging.method !== "judges") return <section className="tally-pad jp-pad"><p className="eyebrow">{event.name}</p><strong className="tp-title">Nothing to mark here</strong><p className="tp-note">The coordinator is entering this event&apos;s scores from the judges&apos; sheets.</p></section>;

  return <section className="tally-pad jp-pad" aria-label={`Marking pad for ${event.name}`}>
    <div className="tp-band" aria-hidden="true">{data.sections.map((item) => <i key={item.id} style={{ background: item.color }} />)}</div>
    <div className="tp-head"><div><p className="eyebrow">Judge {slot} of {judging.judgeCount} · The Stage</p><strong className="tp-title">{event.name}</strong></div><span className={`tp-status${sending || waiting ? " saving" : ""}`}>{status}</span></div>
    {pending.some((item) => item.eventId === event.id) && <p className="jp-offline" role="status">Saved on this phone, sending when connected. Keep this page open; nothing is lost if you close it.</p>}
    {announced ? <p className="tp-closed" role="status">Results are announced. Marking is closed.</p>
      : full ? <p className="tp-closed" role="status">This event already has {judging.judgeCount} judges marking. Ask a central admin to raise the judge count if you&apos;re one of them.</p>
      : <p className="jp-private">Your marks are private: other judges and the divisions can&apos;t see them.</p>}

    <div className="jp-order" role="tablist" aria-label="Performance order">{order.map((id, index) => { const item = sectionOf(data, id); const state = stateOf(id); return <button key={id} type="button" role="tab" aria-selected={id === current} className={`jp-tile${id === current ? " on" : ""}${state === "Submitted" ? " done" : ""}`} onClick={() => setCurrent(id)} aria-label={`${ordinal(index + 1)} to perform: ${item?.name}, ${state.toLowerCase()}`}>
      <DivChip section={item} size="m" /><small>{state}</small>
    </button>; })}</div>

    {!full && <div className="jp-card">
      <div className="jp-card-head">
        <span className="jp-who"><DivChip section={section} size="l" /><span><strong>{section?.name}</strong><small>{ordinal(order.indexOf(current) + 1)} to perform</small></span></span>
        <span className="jp-total" aria-live="polite"><b>{round2(total)}</b><small>of {outOf}</small></span>
      </div>
      {shown.map((row, item) => <div key={item} className="jp-item">
        {judging.items > 1 && <p className="jp-item-label">{judging.itemLabel ?? "Entry"} {item + 1}<span>{round2(row.reduce((a, b) => a + b, 0))} of {criteriaTotal(judging)}</span></p>}
        <ul className="jp-criteria">{judging.criteria.map((criterion, c) => { const value = row[c] ?? 0; const label = `${criterion.name}${judging.items > 1 ? `, ${(judging.itemLabel ?? "entry").toLowerCase()} ${item + 1}` : ""}`; return <li key={criterion.id}>
          <div className="jp-criterion-head"><span>{criterion.name}</span><small>out of {criterion.max}</small></div>
          <div className="jp-stepper">
            <button type="button" disabled={locked || value <= 0} aria-label={`One mark less for ${label}`} onClick={() => update(item, c, value - 1)}>−</button>
            <label className="jp-value"><span className="sr-only">{label}, out of {criterion.max}</span><input type="number" inputMode="decimal" min={0} max={criterion.max} step={0.5} value={value} disabled={locked} onChange={(change) => update(item, c, Number(change.target.value) || 0)} onFocus={(focus) => focus.target.select()} /></label>
            <button type="button" disabled={locked || value >= criterion.max} aria-label={`One mark more for ${label}`} onClick={() => update(item, c, value + 1)}>+</button>
          </div>
          <span className="jp-bar" aria-hidden="true"><i style={{ width: `${(value / criterion.max) * 100}%` }} /></span>
        </li>; })}</ul>
      </div>)}
      <label className="tp-field jp-note">Private note (only you and the coordinator)<textarea rows={2} maxLength={500} value={sheet?.comment ?? waiting?.comment ?? comment} disabled={locked} onChange={(change) => { setComment(change.target.value); writeJson(DRAFT(event.id, current), { scores, comment: change.target.value }); }} placeholder="e.g. Strong harmonies; second song ran long" /></label>
    </div>}

    {!full && !announced && <div className="jp-submit">
      {sheet ? <p className="tp-note" role="status">Submitted at {formatTime(sheet.submittedAt)}. Your marks are locked; only the coordinator can reopen them.</p>
        : waiting ? <p className="tp-note" role="status">These marks are saved on this phone and will send when you&apos;re connected.</p>
        : <InlineConfirm label={`Submit marks for ${section?.name}`} buttonClass="primary-button jp-submit-button" title={`Submit ${round2(total)} of ${outOf} for ${section?.name}? Your marks lock after you submit.`} confirmLabel="Submit marks" disabled={sending} onConfirm={() => void submit()} />}
      {!sheet && !waiting && <p className="tp-note">After you submit, your marks lock. Only the event coordinator can reopen them.</p>}
    </div>}
    <div className="jp-cant-see"><strong>What you can&apos;t see</strong><span>Other judges&apos; marks, totals and rankings. Results stay sealed until the coordinator announces them.</span></div>
  </section>;
}

/** The judge's page: the events they're assigned to judge (in the demo, every judged event). */
export function JudgingView({ data, access, previewMode, refresh, toast }: { data: CompetitionData; access: UserAccess; previewMode: boolean; refresh: () => Promise<void>; toast: Toast }) {
  const events = data.events.filter((event) => isJudgedEvent(data, event) && (previewMode || canJudgeEvent(access.assignments, event.id)));
  const [eventId, setEventId] = useState<string | null>(events.length === 1 ? events[0].id : null);
  const event = events.find((item) => item.id === eventId);
  return <div className="view-content jp-view">
    {!event && <div className="page-title-row"><div><p className="eyebrow">Judging</p><h1>Your events</h1><p className="subtitle">The Stage events you&apos;re judging. Mark each division after it performs; your marks stay private until the results are announced.</p></div></div>}
    {event ? <>{events.length > 1 && <button type="button" className="text-button jp-back" onClick={() => setEventId(null)}>All your events</button>}<JudgePad key={event.id} data={data} event={event} access={access} refresh={refresh} toast={toast} /></>
      : events.length ? <ul className="jp-events">{events.map((item) => { const judging = judgingFor(data, item); const done = judging.sheets.filter((sheet) => sheet.judge === access.email).length; return <li key={item.id}><button type="button" onClick={() => setEventId(item.id)}><strong>{item.name}</strong><small>{judging.announced ? "Results announced" : judging.method !== "judges" ? "Scores entered by the coordinator" : `${done} of ${data.sections.length} divisions marked`}</small></button></li>; })}</ul>
      : <div className="empty-state"><strong>No events to judge yet</strong><p>A central admin assigns judges to Stage events in People and access. Your events appear here once you&apos;re assigned.</p></div>}
  </div>;
}

// ---------- the coordinator's results desk ----------

/** Central admins: method, judges, criteria and how marks combine. Criteria lock once a judge submits. */
function JudgingSettings({ data, event, judging, busy, send }: { data: CompetitionData; event: EventDefinition; judging: EventJudging; busy: boolean; send: (body: Record<string, unknown>, success?: string) => Promise<boolean> }) {
  const [open, setOpen] = useState(false);
  const [method, setMethod] = useState<JudgingMethod>(judging.method);
  const [reason, setReason] = useState("");
  const [judgeCount, setJudgeCount] = useState(judging.judgeCount);
  const [combine, setCombine] = useState<JudgingCombine>(judging.combine);
  const [items, setItems] = useState(judging.items);
  const [criteria, setCriteria] = useState(judging.criteria.map((item) => ({ name: item.name, max: item.max })));
  const reset = () => { setMethod(judging.method); setReason(""); setJudgeCount(judging.judgeCount); setCombine(judging.combine); setItems(judging.items); setCriteria(judging.criteria.map((item) => ({ name: item.name, max: item.max }))); };
  useEffect(() => { if (!open) reset(); }, [open, judging.updatedAt]); // eslint-disable-line react-hooks/exhaustive-deps
  const locked = criteriaLocked(judging);
  const shapeChanged = items !== judging.items || criteria.length !== judging.criteria.length || criteria.some((item, index) => item.name.trim() !== judging.criteria[index]?.name || item.max !== judging.criteria[index]?.max);
  const body = () => ({ action: "settings", ...(method !== judging.method ? { method } : {}), judgeCount, combine, items, criteria: criteria.map((item) => ({ name: item.name.trim(), max: item.max })), ...(reason.trim() ? { reason: reason.trim() } : {}) });
  const save = (force?: string) => void send({ ...body(), ...(force ? { force: true, reason: force } : {}) }, "Judging settings saved.").then((ok) => { if (ok) setOpen(false); });
  const summary = `${judging.method === "judges" ? `Judges mark in the app (${judging.judgeCount})` : "Scores entered by the coordinator"}. ${judging.criteria.map((item) => `${item.name} ${item.max}`).join(", ")}${judging.items > 1 ? `, for each of ${judging.items} ${(judging.itemLabel ?? "entries").toLowerCase()}s` : ""}. Marks ${judging.combine === "average" ? "averaged across the judges who submit" : "added across judges"}.`;
  if (!open) return <div className="rd-settings-summary"><p><strong>Judging</strong> {summary}</p><button type="button" className="secondary-button" onClick={() => setOpen(true)}>Change judging</button></div>;
  return <form className="rd-settings" onSubmit={(submit) => { submit.preventDefault(); if (!(locked && shapeChanged)) save(); }}>
    <fieldset className="rd-method"><legend>How this event is judged</legend>
      <label className="rd-radio"><input type="radio" name="method" checked={method === "judges"} onChange={() => setMethod("judges")} /><span><strong>Judges mark in the app</strong><small>Each judge marks on their own phone; marks stay sealed until you announce.</small></span></label>
      <label className="rd-radio"><input type="radio" name="method" checked={method === "entry"} onChange={() => setMethod("entry")} /><span><strong>Scores entered by the coordinator</strong><small>The coordinator types each division&apos;s total from the judges&apos; sheets.</small></span></label>
    </fieldset>
    {method !== judging.method && <label className="tp-field">Reason for switching (logged)<input value={reason} maxLength={300} onChange={(change) => setReason(change.target.value)} placeholder="e.g. Judges are marking on paper" />{judging.sheets.length > 0 && <small>{judging.sheets.length} submitted mark sheet{judging.sheets.length === 1 ? " is" : "s are"} kept for the record.</small>}</label>}
    <div className="rd-settings-grid">
      <label className="tp-field">Judges<input type="number" inputMode="numeric" min={Math.max(1, judging.judges.length)} max={MAX_JUDGES} value={judgeCount} onChange={(change) => setJudgeCount(Number(change.target.value))} /></label>
      <label className="tp-field">Marks combine<select value={combine} onChange={(change) => setCombine(change.target.value as JudgingCombine)}><option value="average">Average of the judges who submit</option><option value="sum">Added across judges</option></select></label>
      <label className="tp-field">{judging.itemLabel ? `${judging.itemLabel}s per division` : "Marked per division"}<input type="number" inputMode="numeric" min={1} max={MAX_ITEMS} value={items} onChange={(change) => setItems(Number(change.target.value))} /></label>
    </div>
    <div className="rd-criteria"><p className="rd-sub">Criteria and maximums{locked && <span className="rd-lock"> · locked: judges have submitted marks</span>}</p>
      {criteria.map((item, index) => <div key={index} className="rd-criterion">
        <label className="tp-field"><span className="sr-only">Criterion {index + 1}</span><input value={item.name} maxLength={60} aria-label={`Criterion ${index + 1} name`} onChange={(change) => setCriteria((current) => current.map((value, position) => position === index ? { ...value, name: change.target.value } : value))} /></label>
        <label className="tp-field rd-max"><span className="sr-only">Maximum for criterion {index + 1}</span><input type="number" inputMode="numeric" min={1} max={1000} aria-label={`Maximum for ${item.name || `criterion ${index + 1}`}`} value={item.max} onChange={(change) => setCriteria((current) => current.map((value, position) => position === index ? { ...value, max: Number(change.target.value) } : value))} /></label>
        <button type="button" className="text-button" disabled={criteria.length <= 1} onClick={() => setCriteria((current) => current.filter((_, position) => position !== index))}>Remove</button>
      </div>)}
      <p className="tp-note">Out of {criteria.reduce((sum, item) => sum + (Number.isFinite(item.max) ? item.max : 0), 0)}{items > 1 ? ` for each of ${items}, so ${criteria.reduce((sum, item) => sum + item.max, 0) * items} in all` : ""}.</p>
      <button type="button" className="secondary-button" disabled={criteria.length >= MAX_CRITERIA} onClick={() => setCriteria((current) => [...current, { name: `Criterion ${current.length + 1}`, max: 10 }])}>Add criterion</button>
    </div>
    <div className="tp-actions">
      <button type="button" className="secondary-button" onClick={() => setOpen(false)}>Cancel</button>
      {locked && shapeChanged
        ? <InlineConfirm label="Edit anyway" buttonClass="primary-button" danger title={`Judges have submitted marks for ${event.name}. Changing the criteria clears all submitted marks; the judges must mark again.`} reasonLabel="Why change them now? (logged)" placeholder="e.g. Committee corrected the maximums" confirmLabel="Clear marks and save" disabled={busy || (method !== judging.method && !reason.trim())} onConfirm={(why) => save(why)} />
        : <button type="submit" className="primary-button" disabled={busy || (method !== judging.method && !reason.trim())}>Save judging</button>}
    </div>
    <p className="tp-note">{data.sections.length} divisions. Judges can change until results are announced.</p>
  </form>;
}

function PerformanceOrder({ data, judging, busy, send }: { data: CompetitionData; judging: EventJudging; busy: boolean; send: (body: Record<string, unknown>, success?: string) => Promise<boolean> }) {
  const saved = judging.order.length === data.sections.length ? judging.order : data.sections.map((section) => section.id);
  const [order, setOrder] = useState(saved);
  useEffect(() => setOrder(saved), [saved.join()]); // eslint-disable-line react-hooks/exhaustive-deps
  const move = (index: number, by: -1 | 1) => setOrder((current) => { const next = [...current]; [next[index], next[index + by]] = [next[index + by], next[index]]; return next; });
  const changed = order.join() !== saved.join();
  return <section className="rd-card" aria-labelledby="rd-order"><h3 id="rd-order">Performance order</h3><p className="tp-note">Judges mark in this order.</p>
    <ol className="tp-order">{order.map((id, index) => { const section = sectionOf(data, id); return <li key={id}><span className="tp-place">{index + 1}</span><DivChip section={section} size="m" /><span className="tp-standing-name">{section?.name}</span><span className="tp-move"><button type="button" className="secondary-button" disabled={index === 0} aria-label={`Move ${section?.name} earlier`} onClick={() => move(index, -1)}>Earlier</button><button type="button" className="secondary-button" disabled={index === order.length - 1} aria-label={`Move ${section?.name} later`} onClick={() => move(index, 1)}>Later</button></span></li>; })}</ol>
    {changed && <div className="tp-actions"><button type="button" className="secondary-button" onClick={() => setOrder(saved)}>Undo changes</button><button type="button" className="primary-button" disabled={busy} onClick={() => void send({ action: "order", order }, "Performance order saved.")}>Save order</button></div>}
  </section>;
}

function JudgesStatus({ data, judging, central, busy, send }: { data: CompetitionData; judging: EventJudging; central: boolean; busy: boolean; send: (body: Record<string, unknown>, success?: string) => Promise<boolean> }) {
  const order = judging.order.length === data.sections.length ? judging.order : data.sections.map((section) => section.id);
  const inCount = judgesIn(judging).length;
  const slots = Array.from({ length: Math.max(judging.judgeCount, judging.judges.length) }, (_, index) => judging.judges[index]);
  return <section className="rd-card" aria-labelledby="rd-judges">
    <div className="rd-card-head"><h3 id="rd-judges">Judges&apos; marks</h3><span className="rd-pill">{inCount} of {judging.judgeCount} judges in</span></div>
    <p className="tp-note">Each judge marks on their own phone. You see who has submitted, not their marks.</p>
    <div className="rd-table-wrap"><table className="rd-judges">
      <thead><tr><th scope="col">Judge</th>{order.map((id) => <th key={id} scope="col"><DivChip section={sectionOf(data, id)} size="s" /><span className="sr-only">{sectionOf(data, id)?.name}</span></th>)}</tr></thead>
      <tbody>{slots.map((judge, index) => { const done = order.filter((id) => judging.sheets.some((sheet) => sheet.judge === judge && sheet.sectionId === id)).length; return <tr key={index}>
        <th scope="row"><strong>Judge {index + 1}</strong><small>{judge ? `${central ? `${judge}, ` : ""}${done === order.length ? "all submitted" : `${done} of ${order.length} submitted`}` : "Not started"}</small></th>
        {order.map((id) => { const marked = !!judge && judging.sheets.some((sheet) => sheet.judge === judge && sheet.sectionId === id); return <td key={id}><span className={`rd-cell${marked ? " in" : ""}`} aria-label={marked ? "Submitted" : "Pending"}>{marked ? "✓" : "–"}</span></td>; })}
      </tr>; })}</tbody>
    </table></div>
    {judging.sheets.some((sheet) => sheet.comment) && <details className="rd-notes"><summary>Judges&apos; private notes ({judging.sheets.filter((sheet) => sheet.comment).length})</summary><ul>{judging.sheets.filter((sheet) => sheet.comment).map((sheet, index) => <li key={index}><DivChip section={sectionOf(data, sheet.sectionId)} size="s" /><span><strong>{/^Judge \d+$/.test(sheet.judge) ? sheet.judge : `Judge ${judging.judges.indexOf(sheet.judge) + 1}`} on {sectionOf(data, sheet.sectionId)?.name}</strong>{sheet.comment}</span></li>)}</ul></details>}
    {judging.judges.length > 0 && <div className="rd-unlock">{judging.judges.map((judge, index) => judging.sheets.some((sheet) => sheet.judge === judge) && <InlineConfirm key={index} label={`Reopen Judge ${index + 1}'s marks`} buttonClass="text-button" title={`Reopen every mark Judge ${index + 1} has submitted? They mark those divisions again.`} reasonLabel="Reason (logged)" placeholder="e.g. Typed 4 instead of 14 for Ares" confirmLabel="Reopen marks" disabled={busy} onConfirm={(reason) => void send({ action: "unlock", judge: index + 1, reason }, `Judge ${index + 1}'s marks reopened.`)} />)}</div>}
  </section>;
}

function ScoreEntry({ data, judging, busy, send }: { data: CompetitionData; judging: EventJudging; busy: boolean; send: (body: Record<string, unknown>, success?: string) => Promise<boolean> }) {
  const order = judging.order.length === data.sections.length ? judging.order : data.sections.map((section) => section.id);
  const toText = (value?: number) => (value === undefined ? "" : String(value));
  const initial = () => Object.fromEntries(order.map((id) => [id, { total: toText(judging.entered?.[id]?.total), criteria: judging.criteria.map((_, c) => toText(judging.entered?.[id]?.criteria?.[c])) }]));
  const [values, setValues] = useState<Record<string, { total: string; criteria: string[] }>>(initial);
  const [detail, setDetail] = useState(() => order.some((id) => judging.entered?.[id]?.criteria));
  useEffect(() => setValues(initial()), [judging.updatedAt]); // eslint-disable-line react-hooks/exhaustive-deps
  const top = maxScore(judging);
  const save = () => {
    const entries = order.flatMap((id) => {
      const row = values[id];
      const criteria = detail && row.criteria.every((value) => value.trim() !== "") ? row.criteria.map(Number) : undefined;
      const total = criteria ? round2(criteria.reduce((a, b) => a + b, 0)) : row.total.trim() === "" ? null : Number(row.total);
      if (total === null && !judging.entered?.[id]) return [];
      return [{ sectionId: id, total, ...(criteria ? { criteria } : {}) }];
    });
    if (!entries.length) return;
    void send({ action: "enter", entries }, "Totals saved.");
  };
  return <section className="rd-card" aria-labelledby="rd-entry">
    <h3 id="rd-entry">Final totals</h3>
    <p className="tp-note">Type each division&apos;s judges&apos; total out of {top}, before penalties. Penalties go below.</p>
    <label className="tp-check"><input type="checkbox" checked={detail} onChange={(change) => setDetail(change.target.checked)} />Also enter totals per criterion</label>
    <ul className="rd-entry">{order.map((id) => { const section = sectionOf(data, id); const row = values[id] ?? { total: "", criteria: [] }; const sum = row.criteria.reduce((a, b) => a + (Number(b) || 0), 0); return <li key={id}>
      <span className="rd-entry-who"><DivChip section={section} size="m" /><strong>{section?.name}</strong></span>
      {detail ? <div className="rd-entry-criteria">{judging.criteria.map((criterion, c) => <label key={criterion.id} className="tp-field">{criterion.name}<input type="number" inputMode="decimal" min={0} step={0.01} value={row.criteria[c] ?? ""} onChange={(change) => setValues((current) => ({ ...current, [id]: { ...row, criteria: row.criteria.map((value, k) => (k === c ? change.target.value : value)) } }))} /></label>)}<span className="rd-entry-sum">Total {round2(sum)}</span></div>
        : <label className="tp-field rd-entry-total"><span className="sr-only">Total for {section?.name}</span><input type="number" inputMode="decimal" min={0} max={top} step={0.01} aria-label={`Total for ${section?.name}`} value={row.total} onChange={(change) => setValues((current) => ({ ...current, [id]: { ...row, total: change.target.value } }))} placeholder={`out of ${top}`} /></label>}
    </li>; })}</ul>
    <div className="tp-actions"><button type="button" className="primary-button" disabled={busy} onClick={save}>Save totals</button></div>
  </section>;
}

function Penalties({ data, event, judging, busy, send }: { data: CompetitionData; event: EventDefinition; judging: EventJudging; busy: boolean; send: (body: Record<string, unknown>, success?: string) => Promise<boolean> }) {
  const presets = penaltyPresets(event);
  const [sectionId, setSectionId] = useState<SectionId | "">("");
  const [choice, setChoice] = useState("0");
  const [kind, setKind] = useState<JudgingPenaltyKind>("marks");
  const [value, setValue] = useState("10");
  const [reason, setReason] = useState("");
  const preset = choice.startsWith("custom") ? null : presets[Number(choice)];
  const effectiveKind = preset ? preset.kind : kind;
  const effectiveValue = preset ? preset.value : Number(value);
  const effectiveReason = preset ? (reason.trim() ? `${preset.label}: ${reason.trim()}` : preset.label) : reason.trim();
  const ready = !!sectionId && !!effectiveReason && (effectiveKind === "disqualify" || effectiveValue > 0);
  const add = () => void send({ action: "penalty-add", sectionId, kind: effectiveKind, value: effectiveKind === "disqualify" ? 0 : effectiveValue, reason: effectiveReason.slice(0, 200) }, "Penalty added.").then((ok) => { if (ok) { setReason(""); setSectionId(""); } });
  return <section className="rd-card" aria-labelledby="rd-pen">
    <h3 id="rd-pen">Penalties and conduct</h3>
    <p className="tp-note">Marks off, a percentage off the judges&apos; score, or disqualification. A division that doesn&apos;t take part is disqualified and gets no points, not 5th place. Each one is logged.</p>
    {judging.penalties.length > 0 && <ul className="rd-penalties">{judging.penalties.map((penalty) => { const section = sectionOf(data, penalty.sectionId); return <li key={penalty.id} className={penalty.kind === "disqualify" ? "dq" : ""}>
      <DivChip section={section} size="m" /><span><strong>{section?.name}: {penalty.reason}</strong><small>Added at {formatTime(penalty.at)}</small></span><b>{penaltyText(penalty)}</b>
      <InlineConfirm label="Remove" buttonClass="text-button" title={`Remove ${penaltyText(penalty)} for ${section?.name}?`} reasonLabel="Reason (logged)" placeholder="e.g. Timer was wrong" confirmLabel="Remove penalty" disabled={busy} onConfirm={(why) => void send({ action: "penalty-remove", penaltyId: penalty.id, reason: why }, "Penalty removed.")} />
    </li>; })}</ul>}
    <div className="rd-penalty-form">
      <label className="tp-field">Division<select value={sectionId} onChange={(change) => setSectionId(change.target.value as SectionId)}><option value="">Choose a division</option>{data.sections.map((section) => <option key={section.id} value={section.id}>{section.name}</option>)}</select></label>
      <label className="tp-field rd-penalty-pick">Penalty<select value={choice} onChange={(change) => setChoice(change.target.value)}>{presets.map((item, index) => <option key={index} value={String(index)}>{item.label} ({penaltyText(item)})</option>)}<option value="custom">Other penalty</option></select></label>
      {!preset && <><label className="tp-field">Type<select value={kind} onChange={(change) => setKind(change.target.value as JudgingPenaltyKind)}><option value="marks">Marks off</option><option value="percent">Percent off</option><option value="disqualify">Disqualify</option></select></label>
        {kind !== "disqualify" && <label className="tp-field">{kind === "marks" ? "Marks off" : "Percent off"}<input type="number" inputMode="decimal" min={kind === "marks" ? 0.5 : 1} max={kind === "marks" ? 1000 : 100} step={kind === "marks" ? 0.5 : 1} value={value} onChange={(change) => setValue(change.target.value)} /></label>}</>}
      <label className="tp-field rd-penalty-reason">{preset ? "Detail · optional" : "What it's for"}<input value={reason} maxLength={150} onChange={(change) => setReason(change.target.value)} placeholder={preset ? "e.g. Stage timer showed 7:21" : "e.g. Used a prop that wasn't cleared"} /></label>
      <button type="button" className="secondary-button" disabled={busy || !ready} onClick={add}>Add penalty</button>
    </div>
  </section>;
}

function PreviewAndAnnounce({ data, event, judging, busy, send }: { data: CompetitionData; event: EventDefinition; judging: EventJudging; busy: boolean; send: (body: Record<string, unknown>, success?: string) => Promise<boolean> }) {
  const order = judging.order.length === data.sections.length ? judging.order : data.sections.map((section) => section.id);
  const rows = scoreRows(judging, order);
  const ranked = rankedRows(rows);
  const ties = scoreTies(ranked);
  const places = event.pointsPolicy.places;
  const [final, setFinal] = useState<SectionId[]>(ranked.map((row) => row.sectionId));
  const [note, setNote] = useState("");
  const rankedKey = ranked.map((row) => `${row.sectionId}:${row.final}`).join();
  useEffect(() => setFinal(ranked.map((row) => row.sectionId)), [rankedKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const byId = new Map(rows.map((row) => [row.sectionId, row]));
  const level = (a?: SectionId, b?: SectionId) => !!a && !!b && Math.abs((byId.get(a)?.final ?? 0) - (byId.get(b)?.final ?? 0)) < 1e-6;
  const move = (index: number, by: -1 | 1) => setFinal((current) => { const next = [...current]; [next[index], next[index + by]] = [next[index + by], next[index]]; return next; });
  const blocker = announceBlocker(judging, rows);
  const outRows = rows.filter((row) => row.disqualified);
  const missing = rows.filter((row) => !row.disqualified && row.final === null);
  const describe = (row: ScoreRow) => [row.marksOff ? `−${row.marksOff} marks` : "", row.percentOff ? `−${row.percentOff}%` : ""].filter(Boolean).join(", ");
  const inCount = judgesIn(judging).length;
  return <section className="rd-card rd-preview" aria-labelledby="rd-prev">
    <div className="rd-card-head"><h3 id="rd-prev">Preview and announce</h3><span className="rd-private">Only you can see this until you announce</span></div>
    <div className="rd-table-wrap"><table className="rd-rank">
      <thead><tr><th scope="col">Place</th><th scope="col">Division</th><th scope="col">{judging.method === "judges" ? "Judges' score" : "Total"}</th><th scope="col">Penalties</th><th scope="col">Final</th><th scope="col">Points</th></tr></thead>
      <tbody>
        {final.map((id, index) => { const row = byId.get(id)!; const section = sectionOf(data, id); const tiedUp = level(final[index - 1], id); const tiedDown = level(id, final[index + 1]); return <tr key={id} className={tiedUp || tiedDown ? "tied" : ""}>
          <td><b className="rd-place">{index + 1}</b></td>
          <td><span className="rd-div"><DivChip section={section} size="m" /><span>{section?.name}{judging.method === "judges" && <small>{row.judges} of {judging.judgeCount} judges</small>}</span></span></td>
          <td>{fmt(row.score)}</td><td className={describe(row) ? "rd-pen-cell" : ""}>{describe(row) || "None"}</td><td><strong>{fmt(row.final)}</strong>{(tiedUp || tiedDown) && <small className="rd-level">Level</small>}</td><td>+{places[index] ?? 0}</td>
        </tr>; })}
        {missing.map((row) => { const section = sectionOf(data, row.sectionId); return <tr key={row.sectionId} className="missing"><td>–</td><td><span className="rd-div"><DivChip section={section} size="m" /><span>{section?.name}</span></span></td><td colSpan={4}>{judging.method === "judges" ? "No judge has submitted marks yet" : "No total entered yet"}</td></tr>; })}
        {outRows.map((row) => { const section = sectionOf(data, row.sectionId); return <tr key={row.sectionId} className="dq"><td>–</td><td><span className="rd-div"><DivChip section={section} size="m" /><span>{section?.name}</span></span></td><td>{fmt(row.score)}</td><td className="rd-pen-cell">Disqualified</td><td>–</td><td>No points</td></tr>; })}
      </tbody>
    </table></div>
    {ties.length > 0 && <p className="tp-tie-flag" role="status">{ties.map((group) => group.map((id) => sectionOf(data, id)?.name).join(" and ")).join("; ")} are level. The committee decides the order: move them with Earlier and Later, then add its note.</p>}
    {ties.length > 0 && <ol className="tp-order rd-tie-order">{final.map((id, index) => { if (!(level(final[index - 1], id) || level(id, final[index + 1]))) return null; const section = sectionOf(data, id); return <li key={id} className="tied"><span className="tp-place">{index + 1}</span><DivChip section={section} size="m" /><span className="tp-standing-name">{section?.name}</span><span className="tp-move"><button type="button" className="secondary-button" disabled={!level(final[index - 1], id)} aria-label={`Move ${section?.name} earlier`} onClick={() => move(index, -1)}>Earlier</button><button type="button" className="secondary-button" disabled={!level(id, final[index + 1])} aria-label={`Move ${section?.name} later`} onClick={() => move(index, 1)}>Later</button></span></li>; })}</ol>}
    <label className="tp-field">{ties.length ? "Committee note on the tie (required)" : "Note · optional"}<input value={note} maxLength={300} onChange={(change) => setNote(change.target.value)} placeholder={ties.length ? `e.g. Committee placed ${sectionOf(data, ties[0][0])?.name} above ${sectionOf(data, ties[0][1])?.name} on technique` : "e.g. Judges' sheets checked by the committee"} /></label>
    {blocker ? <p className="tp-note" role="status">{blocker}</p> : <div className="rd-announce">
      <InlineConfirm label="Announce results" buttonClass="primary-button" title={`Announce ${event.name}? Points go on the board, the reveal plays on the TV and phones, and only a central admin can withdraw them.${judging.method === "judges" && inCount < judging.judgeCount ? ` ${inCount} of ${judging.judgeCount} judges have submitted everything; scores use the marks that are in.` : ""}`} confirmLabel="Announce" disabled={busy || (ties.length > 0 && !note.trim())} onConfirm={() => void send({ action: "announce", order: final, note: note.trim() || undefined }, `${event.name} results announced.`)} />
      {ties.length > 0 && !note.trim() && <span className="tp-note">Add the committee&apos;s note to announce.</span>}
    </div>}
  </section>;
}

function AnnouncedDesk({ data, event, judging, central, refresh, toast }: { data: CompetitionData; event: EventDefinition; judging: EventJudging; central: boolean; refresh: () => Promise<void>; toast: Toast }) {
  const [busy, setBusy] = useState(false);
  async function withdraw(reason: string) {
    setBusy(true);
    try {
      const response = await fetch("/api/results/placings", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ eventId: event.id, reason }) }).catch(() => null);
      if (!response) throw new Error("Couldn't reach Division Wars. Check your connection and try again; nothing was saved.");
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error((result as { error?: string }).error ?? "The results could not be withdrawn.");
      await refresh();
      toast(`${event.name} results withdrawn. The desk is open again with the marks as they were.`);
    } catch (error) { toast(error instanceof Error ? error.message : "The results could not be withdrawn.", true); }
    finally { setBusy(false); }
  }
  return <section className="rd-card" aria-labelledby="rd-done">
    <h3 id="rd-done">Announced results</h3>
    <StageResult data={data} event={event} />
    {judging.method === "judges" && <p className="tp-note">{judgesIn(judging).length} of {judging.judgeCount} judges had submitted all their marks.</p>}
    {central && <InlineConfirm label="Withdraw results" title="Withdraw these results? Points come off the board and the desk reopens with the marks and penalties as they were." reasonLabel="Reason for withdrawing (logged)" placeholder="e.g. Judge 2's sheet for Ares was entered wrong" confirmLabel="Withdraw results" danger disabled={busy} onConfirm={(reason) => void withdraw(reason)} />}
  </section>;
}

/**
 * The results desk for a judged Stage event (the event's head, or a central admin): settings, performance order,
 * who has marked, penalties, a private preview ranking with ties, then Announce. Nobody else sees any of it.
 */
export function ResultsDesk({ data, event, central, refresh, toast }: { data: CompetitionData; event: EventDefinition; central: boolean; refresh: () => Promise<void>; toast: Toast }) {
  const { judging, busy, send } = useJudging(data, event, refresh, toast);
  const recorded = (data.bonusAwards ?? []).some((award) => award.eventId === event.id && award.kind === "placing");
  const announcedAt = judging.announced?.at;
  // Judges submit from their phones: keep "who's in" current while the results are sealed.
  useEffect(() => {
    if (recorded) return;
    void refresh().catch(() => undefined);
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void refresh().catch(() => undefined); }, 10_000);
    return () => window.clearInterval(timer);
  }, [event.id, recorded]); // eslint-disable-line react-hooks/exhaustive-deps
  const meta = useMemo(() => `${judging.method === "judges" ? `${judging.judgeCount} judges` : "Scores entered by the coordinator"}. Points by place: ${event.pointsPolicy.places.join(" / ")}.`, [judging.method, judging.judgeCount, event.pointsPolicy.places]);
  return <section className="tally-pad rd-desk" aria-label={`Results desk for ${event.name}`}>
    <div className="tp-band" aria-hidden="true">{data.sections.map((section) => <i key={section.id} style={{ background: section.color }} />)}</div>
    <div className="tp-head"><div><p className="eyebrow">Results desk · coordinator and central admin only</p><strong className="tp-title">{event.name}</strong><p className="tp-note">{meta}</p></div><span className={`rd-status${recorded ? " done" : ""}`}>{recorded && announcedAt ? `Announced ${formatTime(announcedAt)}` : recorded ? "Recorded" : "Results sealed"}</span></div>
    {recorded ? <AnnouncedDesk data={data} event={event} judging={judging} central={central} refresh={refresh} toast={toast} /> : <>
      {central ? <JudgingSettings data={data} event={event} judging={judging} busy={busy} send={send} /> : <p className="tp-note rd-settings-summary">Judging: {judging.criteria.map((item) => `${item.name} ${item.max}`).join(", ")}{judging.items > 1 ? `, for each of ${judging.items} ${(judging.itemLabel ?? "entries").toLowerCase()}s` : ""}. A central admin can change these.</p>}
      <PerformanceOrder data={data} judging={judging} busy={busy} send={send} />
      {judging.method === "judges" ? <JudgesStatus data={data} judging={judging} central={central} busy={busy} send={send} /> : <ScoreEntry data={data} judging={judging} busy={busy} send={send} />}
      <Penalties data={data} event={event} judging={judging} busy={busy} send={send} />
      <PreviewAndAnnounce data={data} event={event} judging={judging} busy={busy} send={send} />
    </>}
  </section>;
}

/** Non-coordinators on the Results tab of a judged event: sealed, or the announced result. */
export function SealedResultsNote({ data, event }: { data: CompetitionData; event: EventDefinition }) {
  return <section className="event-editor"><div className="event-editor-head"><div><p className="eyebrow">The Stage · judged</p><h2>{data.judging?.[event.id]?.announced ? "Results" : "Results are sealed"}</h2></div></div><StageResult data={data} event={event} /></section>;
}
