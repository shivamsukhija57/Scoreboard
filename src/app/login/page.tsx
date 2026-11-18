import { ShieldCheck, Radio } from "lucide-react";
import GoogleSignInButton from "@/components/google-sign-in-button";

const hasGoogleCredentials = Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET && process.env.AUTH_SECRET);
const previewMode = process.env.NODE_ENV !== "production" && process.env.DEMO_MODE === "true";

export default function LoginPage() {
  return (
    <main className="login-page">
      <section className="login-art" aria-label="Division Wars live competition preview">
        <div className="login-brand"><span className="brand-mark">DW</span><span>DIVISION WARS</span></div>
        <div className="login-live"><span className="live-dot" /> LIVE · FIRST-YEAR EDITION</div>
        <div className="login-headline"><span>FIVE SECTIONS.</span><br /><span className="lime-text">ONE TOP SPOT.</span></div>
        <div className="mini-scoreboard">
          <div className="mini-score-head"><span>ILLUSTRATIVE MATCH</span><span>BASKETBALL · Q3</span></div>
          <div className="mini-score-row"><span>SECTION A</span><strong>42</strong><span>06:18</span><strong>38</strong><span>SECTION C</span></div>
          <div className="mini-race"><span>THE SECTION RACE</span><div><i style={{ width: "88%" }} /><i style={{ width: "74%" }} /><i style={{ width: "62%" }} /><i style={{ width: "49%" }} /><i style={{ width: "38%" }} /></div></div>
        </div>
        <p className="login-foot">LIVE SCORES · EVERY SPORT · EVERY SECTION</p>
      </section>
      <section className="login-panel">
        <div className="login-panel-inner">
          <div className="login-symbol"><Radio size={19} strokeWidth={2.2} /></div>
          <p className="eyebrow">YOUR CAMPUS. YOUR RACE.</p>
          <h1>Get in the game.</h1>
          <p className="login-copy">Sign in with your SPJIMR Google Workspace account to follow live matches and Division Wars updates.</p>
          {hasGoogleCredentials ? (
            <GoogleSignInButton />
          ) : (
            <div className="setup-note"><ShieldCheck size={18} /><div><strong>Google sign-in is configured for @spjimr.org</strong><p>Add the OAuth client ID, client secret, and auth secret from <code>.env.example</code> to enable sign-in.</p></div></div>
          )}
          {previewMode && <a className="preview-link" href="/">Open local preview with illustrative data <span>→</span></a>}
          <p className="login-privacy">College accounts only <span>·</span> Access follows your competition assignment</p>
        </div>
        <div className="login-bottom"><span>DIVISION WARS</span><span>FIRST-YEAR EDITION</span></div>
      </section>
    </main>
  );
}

