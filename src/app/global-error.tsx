"use client";

/**
 * Last resort when even the root layout fails. It renders its own document, so the app's stylesheet and theme don't
 * reach it: the styles are inline and follow the device's light or dark setting.
 */
export default function GlobalError({ retry }: { error: unknown; retry: () => void }) {
  return <html lang="en">
    <body style={{ margin: 0, minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif", colorScheme: "light dark" }}>
      <title>Division Wars</title>
      <main style={{ maxWidth: 420, textAlign: "center" }}>
        <h1 style={{ fontSize: 28, margin: "0 0 8px" }}>Division Wars is having trouble</h1>
        <p style={{ opacity: 0.75, lineHeight: 1.5 }}>Something went wrong loading the app. Nothing you entered was lost.</p>
        <button onClick={() => retry()} style={{ marginTop: 12, minHeight: 44, padding: "0 22px", border: 0, borderRadius: 999, background: "#0A84FF", color: "#fff", font: "600 15px system-ui", cursor: "pointer" }}>Try again</button>
      </main>
    </body>
  </html>;
}
