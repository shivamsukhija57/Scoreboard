import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Cross-site request forgery guard for every state-changing API call: scoring, entries, fixtures and admin routes all
 * act on the signed-in cookie, so a request must come from this site's own pages. next-auth's routes carry their own
 * CSRF token and are left alone. Authorization still happens in each route; this only rejects foreign origins.
 */
export function proxy(request: NextRequest) {
  if (SAFE_METHODS.has(request.method) || request.nextUrl.pathname.startsWith("/api/auth")) return NextResponse.next();
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") return forbidden();
  const origin = request.headers.get("origin");
  if (origin) {
    let originHost = "";
    try { originHost = new URL(origin).host; } catch { return forbidden(); }
    if (originHost !== request.headers.get("host")) return forbidden();
  } else if (!fetchSite) {
    // Neither header: not a browser we can vouch for (or a very old one). Refuse rather than guess.
    return forbidden();
  }
  return NextResponse.next();
}

function forbidden() {
  return NextResponse.json({ error: "This request didn't come from the Division Wars site, so it was blocked." }, { status: 403 });
}

export const config = { matcher: "/api/:path*" };
