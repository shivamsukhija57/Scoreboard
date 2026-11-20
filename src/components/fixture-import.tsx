"use client";

import { ClipboardPaste, Download, FileSpreadsheet, TriangleAlert, X } from "lucide-react";
import { useRef, useState } from "react";
import type { CompetitionData } from "@/lib/domain";
import { formatIst, type ImportRow, type ImportSummary, type RawRow } from "@/lib/fixture-import";
import { InlineConfirm } from "./inline-confirm";
import { DivChip, sectionOf } from "./event-features";

type Toast = (message: string, error?: boolean) => void;
interface Preview { source: string; raw: RawRow[]; rows: ImportRow[]; summary: ImportSummary }

const TEMPLATE = "/templates/division-wars-fixtures-template.xlsx";
const STATUS_LABEL: Record<ImportRow["status"], string> = { new: "New", changed: "Changed", unchanged: "Unchanged", started: "Already started", error: "Error" };

async function send(url: string, body: FormData | unknown) {
  let response: Response;
  try {
    response = await fetch(url, body instanceof FormData ? { method: "POST", body, cache: "no-store" } : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), cache: "no-store" });
  } catch {
    throw Object.assign(new Error("Couldn't reach Division Wars. Check your connection and try again; nothing was saved."), { status: 0, payload: {} });
  }
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) {
    const message = response.status === 401 ? "You've been signed out. Sign in again, then retry." : response.status >= 500 ? "The server had a problem and nothing was saved. Try again in a moment." : String(payload.error ?? "That didn't go through. Try again.");
    throw Object.assign(new Error(message), { status: response.status, payload });
  }
  return payload;
}

const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

/** Schedule tool: upload the fixtures template (or paste rows), check every row, then publish in one go. */
export function FixtureImportTool({ data, refresh, toast, onClose }: { data: CompetitionData; refresh: () => Promise<void>; toast: Toast; onClose: () => void }) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pasting, setPasting] = useState(false);
  const [text, setText] = useState("");
  const [problemsOnly, setProblemsOnly] = useState(false);
  const [skipErrors, setSkipErrors] = useState(false);
  const [ackClashes, setAckClashes] = useState(false);
  const [message, setMessage] = useState<{ text: string; tone: "error" | "ok" } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  function show(result: Record<string, unknown>, source?: string) {
    setPreview({ source: String(result.source ?? source ?? ""), raw: result.raw as RawRow[], rows: result.rows as ImportRow[], summary: result.summary as ImportSummary });
    setSkipErrors(false); setAckClashes(false); setProblemsOnly(false);
  }

  async function check(form: FormData) {
    setLoading(true); setMessage(null);
    try { show(await send("/api/fixtures/import/preview", form)); }
    catch (error) { setPreview(null); setMessage({ text: error instanceof Error ? error.message : "The sheet couldn't be read.", tone: "error" }); }
    finally { setLoading(false); if (fileInput.current) fileInput.current.value = ""; }
  }

  function upload(file: File | undefined) {
    if (!file) return;
    if (file.size > 1_000_000) { setMessage({ text: "That file is over 1 MB. Remove extra sheets or images, or split it into two files.", tone: "error" }); return; }
    const form = new FormData(); form.set("file", file); void check(form);
  }

  function checkPasted() {
    const form = new FormData(); form.set("text", text); void check(form);
  }

  async function publish() {
    if (!preview) return;
    setBusy(true); setMessage(null);
    try {
      const result = await send("/api/fixtures/import", { rows: preview.raw, acknowledgeClashes: ackClashes, skipErrors, source: preview.source });
      const created = Number(result.created ?? 0), updated = Number(result.updated ?? 0);
      const done = [created ? `Added ${plural(created, "fixture")}` : "", updated ? `${created ? "updated" : "Updated"} ${plural(updated, "fixture")}` : ""].filter(Boolean).join(" and ");
      await refresh();
      toast(`${done}.`);
      // Check the same rows again, so the table shows the schedule as it is now.
      const again = await send("/api/fixtures/import/preview", { rows: preview.raw, source: preview.source });
      show({ ...again, source: preview.source });
      setMessage({ text: `${done}. The rows below are checked again against the schedule.`, tone: "ok" });
    } catch (error) {
      const payload = (error as { payload?: Record<string, unknown> }).payload;
      if (payload?.rows && payload.summary) setPreview({ ...preview, rows: payload.rows as ImportRow[], summary: payload.summary as ImportSummary });
      setMessage({ text: error instanceof Error ? error.message : "The fixtures couldn't be published.", tone: "error" });
    } finally { setBusy(false); }
  }

  const summary = preview?.summary;
  const toPublish = summary ? summary.new + summary.changed : 0;
  const blocked = !summary || !toPublish || (summary.errors > 0 && !skipErrors) || (summary.clashes > 0 && !ackClashes);
  const problem = (row: ImportRow) => row.status === "error" || row.status === "started" || row.clashes.length > 0;
  const problems = preview?.rows.filter(problem).length ?? 0;
  const shown = preview ? (problemsOnly ? preview.rows.filter(problem) : preview.rows) : [];
  const confirmTitle = summary ? `${summary.new && summary.changed ? `Add ${plural(summary.new, "fixture")} and update ${summary.changed}?` : summary.new ? `Add ${plural(summary.new, "fixture")}?` : `Update ${plural(summary.changed, "fixture")}?`}${summary.errors && skipErrors ? ` ${plural(summary.errors, "row")} with errors ${summary.errors === 1 ? "is" : "are"} left out.` : ""}` : "";

  return <section className="tool-panel fi-tool" aria-labelledby="fi-title">
    <div className="create-fixture-title"><div><p className="eyebrow">Scheduling desk <span>·</span> Spreadsheet</p><h2 id="fi-title">Import fixtures</h2></div><button type="button" className="icon-button" aria-label="Close" onClick={onClose}><X size={18} /></button></div>
    <ol className="fi-steps">
      <li><strong>Download the template</strong><span>One row per match, for any number of events.</span></li>
      <li><strong>Fill in the Fixtures sheet</strong><span>Times are India time. Rows marked EXAMPLE are ignored.</span></li>
      <li><strong>Upload it and check the preview</strong><span>Nothing is published until you say so.</span></li>
    </ol>
    <div className="fi-actions">
      <a className="secondary-button" href={TEMPLATE} download><Download size={15} aria-hidden="true" /> Download template</a>
      <label className={`primary-button fi-upload${loading ? " busy" : ""}`}><input ref={fileInput} type="file" accept=".xlsx,.csv,.tsv,.txt" disabled={loading} onChange={(event) => upload(event.currentTarget.files?.[0])} /><FileSpreadsheet size={15} aria-hidden="true" /> {loading ? "Checking…" : preview ? "Upload again" : "Upload filled sheet"}</label>
      <button type="button" className="text-button" aria-expanded={pasting} onClick={() => setPasting((value) => !value)}><ClipboardPaste size={15} aria-hidden="true" /> {pasting ? "Hide pasted rows" : "Paste rows instead"}</button>
    </div>
    {pasting && <div className="fi-paste">
      <label htmlFor="fi-paste-text">Rows copied from the sheet, or CSV with the same columns</label>
      <textarea id="fi-paste-text" rows={5} value={text} maxLength={1_000_000} placeholder={"Event\tDate\tStart time\tDuration (min)\tVenue\tDivision A\tDivision B\tStage\tGroup\nThrowball · Women's Throwball\t21-Nov-2026\t17:30\t45\tSPCE court\tAres\tCyappa\tLeague"} onChange={(event) => setText(event.target.value)} />
      <button type="button" className="secondary-button" disabled={loading || !text.trim()} onClick={checkPasted}>Check rows</button>
    </div>}
    {message && <p className={`fi-message ${message.tone}`} role={message.tone === "error" ? "alert" : "status"}>{message.tone === "error" && <TriangleAlert size={15} aria-hidden="true" />}{message.text}</p>}

    {preview && summary && <div className="fi-preview">
      <div className="fi-summary" aria-label="Import summary">
        <span className="fi-count new"><b>{summary.new}</b> new</span>
        <span className="fi-count changed"><b>{summary.changed}</b> changed</span>
        <span className="fi-count unchanged"><b>{summary.unchanged}</b> unchanged</span>
        {summary.started > 0 && <span className="fi-count started"><b>{summary.started}</b> already started</span>}
        <span className={`fi-count error${summary.errors ? " on" : ""}`}><b>{summary.errors}</b> {summary.errors === 1 ? "error" : "errors"}</span>
        <span className={`fi-count clash${summary.clashes ? " on" : ""}`}><b>{summary.clashes}</b> {summary.clashes === 1 ? "clash" : "clashes"}</span>
      </div>
      <p className="fine-print fi-source">{preview.source ? `${preview.source}: ` : ""}{plural(summary.rows, "row")} read{summary.examples ? `, ${plural(summary.examples, "example row")} ignored` : ""}. Unchanged rows aren&apos;t added again. Fixtures that aren&apos;t in the sheet stay on the schedule; the import never deletes anything.</p>
      <div className="event-tabs fi-filter" role="group" aria-label="Rows to show">
        <button type="button" aria-pressed={!problemsOnly} className={!problemsOnly ? "on" : ""} onClick={() => setProblemsOnly(false)}>All rows ({summary.rows})</button>
        <button type="button" aria-pressed={problemsOnly} className={problemsOnly ? "on" : ""} onClick={() => setProblemsOnly(true)} disabled={!problems}>Problems ({problems})</button>
      </div>
      <div className="fi-table-wrap" tabIndex={0} role="region" aria-label="Rows in the sheet">
        <table className="fi-table">
          <thead><tr><th scope="col">Row</th><th scope="col">Status</th><th scope="col">Event</th><th scope="col">Match</th><th scope="col">When</th><th scope="col">Venue</th><th scope="col">Details</th></tr></thead>
          <tbody>{shown.map((row) => <tr key={row.row} className={`fi-row ${row.status}${row.clashes.length ? " has-clash" : ""}`}>
            <td className="fi-rownum">{row.row}</td>
            <td><span className={`fi-chip ${row.status}`}>{STATUS_LABEL[row.status]}</span>{row.clashes.length > 0 && <span className="fi-chip clash">Clash</span>}</td>
            <td className="fi-event">{row.eventLabel || "No event"}{row.stage && row.stage !== "league" && <small>{row.stage === "semifinal" ? "Semifinal" : row.stage === "final" ? "Final" : "Other"}</small>}{row.group && <small>Group {row.group}</small>}</td>
            <td className="fi-match"><span className="matchup"><Side data={data} id={row.sectionA} text={row.divisionAText} entry={row.entryA} /> <span>v</span> <Side data={data} id={row.sectionB} text={row.divisionBText} entry={row.entryB} /></span></td>
            <td className="fi-when">{row.startsAt ? formatIst(row.startsAt) : "—"}{row.durationMinutes && <small>{row.durationMinutes} min</small>}</td>
            <td>{row.venue ?? "—"}</td>
            <td className="fi-details">
              {row.errors.map((text) => <p key={text} className="fi-error">{text}</p>)}
              {row.status === "started" && <p className="fi-warn">Can&apos;t change it: this match has already started. The sheet&apos;s changes are skipped.</p>}
              {row.changes.map((text) => <p key={text} className={row.status === "started" ? "fi-muted" : "fi-change"}>{text}</p>)}
              {row.clashes.map((text) => <p key={text} className="fi-warn">{text}</p>)}
              {row.status === "new" && !row.clashes.length && <p className="fi-muted">Added as a new fixture</p>}
              {row.status === "unchanged" && <p className="fi-muted">Already on the schedule</p>}
            </td>
          </tr>)}</tbody>
        </table>
      </div>
      <div className="fi-publish">
        {summary.errors > 0 && <label className="fi-check"><input type="checkbox" checked={skipErrors} onChange={(event) => setSkipErrors(event.target.checked)} /><span>Leave out the {plural(summary.errors, "row")} with errors and publish the rest. Fix them in the sheet and upload it again later.</span></label>}
        {summary.clashes > 0 && <label className="fi-check"><input type="checkbox" checked={ackClashes} onChange={(event) => setAckClashes(event.target.checked)} /><span>I&apos;ve checked the {plural(summary.clashes, "clash", "clashes")}. Publish them anyway.</span></label>}
        <div className="form-actions">
          <span>{!toPublish ? "Nothing to publish. Every valid row is already on the schedule." : summary.errors && !skipErrors ? `Fix the ${plural(summary.errors, "row")} with errors, or leave them out.` : summary.clashes && !ackClashes ? "Check the clashes before publishing." : `Ready: ${plural(summary.new, "new fixture")}${summary.changed ? `, ${plural(summary.changed, "change")}` : ""}.`}</span>
          <InlineConfirm label="Publish fixtures" buttonClass="primary-button" disabled={blocked || busy} title={confirmTitle} confirmLabel={busy ? "Publishing…" : "Publish"} onConfirm={() => void publish()} />
        </div>
      </div>
    </div>}
  </section>;
}

function Side({ data, id, text, entry }: { data: CompetitionData; id?: string; text: string; entry?: number }) {
  const section = id ? sectionOf(data, id) : undefined;
  if (!section) return <span className="fi-unknown">{text || "—"}</span>;
  return <><DivChip section={section} />{section.name}{entry ? ` team ${entry}` : ""}</>;
}
