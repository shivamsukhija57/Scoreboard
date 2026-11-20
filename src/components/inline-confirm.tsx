"use client";

import { useState } from "react";

/**
 * In place of the browser's prompt and confirm boxes: the action opens right where it was tapped, says what it will
 * do, asks for a reason when the audit log needs one, and can be cancelled. Escape cancels, Enter confirms.
 */
export function InlineConfirm({ label, title, reasonLabel, placeholder, confirmLabel, onConfirm, buttonClass = "secondary-button", disabled, danger }: { label: string; title?: string; reasonLabel?: string; placeholder?: string; confirmLabel: string; onConfirm: (reason: string) => void; buttonClass?: string; disabled?: boolean; danger?: boolean }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const close = () => { setOpen(false); setReason(""); };
  const ready = !reasonLabel || reason.trim().length > 0;
  const confirm = () => { if (!ready) return; onConfirm(reason.trim()); close(); };
  if (!open) return <button type="button" className={buttonClass} disabled={disabled} onClick={() => setOpen(true)}>{label}</button>;
  return <span className="inline-confirm" role="group" aria-label={label} onKeyDown={(event) => { if (event.key === "Escape") close(); }}>
    {title && <span className="inline-confirm-text">{title}</span>}
    {reasonLabel && <label className="inline-confirm-reason">{reasonLabel}<input autoFocus maxLength={300} value={reason} placeholder={placeholder} onChange={(event) => setReason(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); confirm(); } }} /></label>}
    <span className="inline-confirm-actions"><button type="button" className="secondary-button" onClick={close} autoFocus={!reasonLabel}>Cancel</button><button type="button" className={danger ? "confirm-button danger-fill" : "confirm-button"} disabled={!ready || disabled} onClick={confirm}>{confirmLabel}</button></span>
  </span>;
}

