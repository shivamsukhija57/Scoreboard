"use client";

import { signIn } from "next-auth/react";

export default function GoogleSignInButton() {
  return (
    <button className="google-button" type="button" onClick={() => void signIn("google", { callbackUrl: "/" })}>
      <GoogleMark /> Continue with Google <span>→</span>
    </button>
  );
}

function GoogleMark() {
  return <svg aria-hidden="true" viewBox="0 0 20 20" width="18" height="18"><path fill="#4285F4" d="M19.6 10.23c0-.68-.06-1.36-.18-2H10v3.8h5.4a4.6 4.6 0 0 1-2 3.02v2.5h3.24c1.9-1.75 2.96-4.33 2.96-7.32Z"/><path fill="#34A853" d="M10 20c2.7 0 4.96-.9 6.62-2.45l-3.24-2.5c-.9.6-2.04.95-3.38.95-2.6 0-4.8-1.75-5.59-4.1H1.06v2.58A10 10 0 0 0 10 20Z"/><path fill="#FBBC05" d="M4.41 11.9a6 6 0 0 1 0-3.8V5.52H1.06a10 10 0 0 0 0 8.96l3.35-2.58Z"/><path fill="#EA4335" d="M10 3.96c1.47 0 2.8.5 3.84 1.5l2.88-2.88A9.6 9.6 0 0 0 10 0a10 10 0 0 0-8.94 5.52l3.35 2.58C5.2 5.7 7.4 3.96 10 3.96Z"/></svg>;
}
