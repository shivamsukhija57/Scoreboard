import { ShieldCheck } from "lucide-react";
import GoogleSignInButton from "@/components/google-sign-in-button";
import { rulebookSections } from "@/lib/rulebook-data";

const hasGoogleCredentials = Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET && process.env.AUTH_SECRET);
const previewMode = process.env.NODE_ENV !== "production" && process.env.DEMO_MODE === "true";

// The five divisions as a lane race: the same chip, colour and name the app uses everywhere, so the key starts here.
const lanes = rulebookSections.map((section, index) => ({ section, reach: [88, 74, 62, 49, 38][index] ?? 40 }));

export default function LoginPage() {
  return (
    <main className="login-page">
      <section className="login-art" aria-label="The five divisions">
        <div className="login-brand"><span>Division Wars</span></div>
        <h2 className="login-headline">Ares, Bloodhounds, Cyappa, Dracarys and Eagles.</h2>
        <ol className="login-lanes" aria-label="Divisions">
          {lanes.map(({ section, reach }) => <li key={section.id}>
            <span className="login-lane-name">{section.name}</span>
            <span className="login-lane-track"><i style={{ width: `${reach}%`, background: `light-dark(${section.color}, ${section.line ?? section.color})` }} /><b style={{ left: `${reach}%`, background: section.color }}>{section.code}</b></span>
          </li>)}
        </ol>
        <p className="login-foot">Live scores, fixtures and standings for every Arena and Stage event.</p>
      </section>
      <section className="login-panel">
        <div className="login-panel-inner">
          <h1>Sign in</h1>
          <p className="login-copy">Use your SPJIMR Google account to follow live matches, your division and the standings.</p>
          {hasGoogleCredentials ? (
            <GoogleSignInButton />
          ) : (
            // Students never see setup instructions; this only tells them sign-in isn't open yet.
            <div className="setup-note"><ShieldCheck size={18} /><div><strong>Sign-in isn&apos;t open yet</strong><p>The organizers are still setting it up. Check back soon.</p></div></div>
          )}
          {previewMode && <a className="preview-link" href="/">Open the local preview</a>}
          <p className="login-privacy">SPJIMR accounts only. What you can change depends on your organizer role.</p>
        </div>
      </section>
    </main>
  );
}
