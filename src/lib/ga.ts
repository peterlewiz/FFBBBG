// Thin wrapper around the gtag.js loaded in index.html. Kept separate from
// that script so route-change tracking lives in one typed, testable place
// instead of scattered `window.gtag` calls.

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

/**
 * Sends a page_view for the given SPA route. Call this on every route
 * change (including the first), since gtag.js's automatic page_view is
 * disabled in index.html - without this, GA would only ever see one view
 * per visit no matter how many tabs someone clicks through, which would
 * make "top pages" and per-page engagement time meaningless.
 */
export function trackPageView(path: string, title: string): void {
  if (typeof window === "undefined" || !window.gtag) return;
  window.gtag("event", "page_view", {
    page_path: path,
    page_title: title,
    page_location: window.location.href,
  });
}
