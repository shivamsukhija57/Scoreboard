"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

type ThemeChoice = "system" | "light" | "dark";
const KEY = "dw.theme";
const NEXT: Record<ThemeChoice, ThemeChoice> = { system: "light", light: "dark", dark: "system" };
const LABEL: Record<ThemeChoice, string> = { system: "Theme: match device", light: "Theme: light", dark: "Theme: dark" };

/** Applies a saved choice; "system" removes the attribute so the stylesheet follows the device setting. */
function apply(choice: ThemeChoice) {
  if (choice === "system") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = choice;
}

/**
 * Cycles device → light → dark. The choice is a per-person convenience kept in this browser; the layout's inline
 * script applies it before first paint so the page never flashes the wrong theme.
 */
export default function ThemeToggle() {
  const [choice, setChoice] = useState<ThemeChoice>("system");
  useEffect(() => {
    try { const saved = window.localStorage.getItem(KEY); if (saved === "light" || saved === "dark") setChoice(saved); } catch { /* storage blocked: follow the device */ }
  }, []);
  const next = () => {
    const value = NEXT[choice];
    setChoice(value);
    apply(value);
    try { if (value === "system") window.localStorage.removeItem(KEY); else window.localStorage.setItem(KEY, value); } catch { /* not remembered, still applied */ }
  };
  const Icon = choice === "light" ? Sun : choice === "dark" ? Moon : Monitor;
  return <button type="button" className="icon-button theme-toggle" onClick={next} aria-label={`${LABEL[choice]}. Change theme`} title={LABEL[choice]}><Icon size={18} aria-hidden="true" /></button>;
}

/** Runs before paint (inlined in the layout): applies a saved light/dark choice without a flash. */
// A TV or projector has no theme button, so it can be set in its address: /tv?theme=light or /tv?theme=dark.
export const themeBootScript = `try{var q=new URLSearchParams(location.search).get("theme");var t=q==="light"||q==="dark"?q:localStorage.getItem("${KEY}");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;
