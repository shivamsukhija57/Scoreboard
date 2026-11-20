/** Shown while a page's competition data loads: the shape of the page, not a spinner. */
export default function Loading() {
  return <main className="page-skeleton" role="status" aria-label="Loading Division Wars">
    <div className="skeleton-block title" />
    <div className="skeleton-block line" />
    <div className="page-skeleton-grid">
      <div className="skeleton-block card" />
      <div className="skeleton-block card" />
    </div>
    <div className="skeleton-block wide" />
  </main>;
}
