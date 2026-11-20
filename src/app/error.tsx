"use client";

/** A page failed to load (most often the scores store didn't answer). Says what happened and offers a retry. */
export default function Error({ retry }: { error: unknown; retry: () => void }) {
  return <main className="status-page">
    <h1>Scores didn&apos;t load</h1>
    <p>Division Wars couldn&apos;t reach the scores just now. Nothing you entered was lost. Try again in a moment.</p>
    <div className="status-actions"><button className="primary-button" onClick={() => retry()}>Try again</button><a className="secondary-button" href="/">Back to Today</a></div>
  </main>;
}
