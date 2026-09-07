"use client";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <div className="shell explorer" role="alert">
    <h1 className="page-title">Data is temporarily unavailable</h1>
    <p className="page-sub">The latest records could not be loaded. This does not mean activity dropped to zero.</p>
    <button type="button" className="btn" onClick={reset}>Try again</button>
  </div>;
}
