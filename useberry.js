/* useberry.js — screen tracking for in-app overlays that don't change the URL.
 *
 * Useberry builds click maps and drop-off funnels per-URL. Bottom sheets, pop-ups
 * and dropdowns that appear without changing the URL are invisible to it (their own
 * docs flag this). We reflect each such "screen" into the URL as ?ub=<id> using
 * history.replaceState — no reload, and no new history entry, so back-button
 * behaviour is unchanged. Useberry's MutationObserver only re-reads location.href
 * from inside addedNodes, so after changing the URL we append (then remove) a
 * throwaway node to trigger detection.
 *
 * Two entry points:
 *   ubScreen(id)  — always reflect (used by the onboarding tour, which owns the URL).
 *   ubOverlay(id) — reflect only when the onboarding tour is NOT active, so an open
 *                   overlay can't clobber the tour's own ?ub= ids mid-walkthrough.
 * Pass a falsy id to clear ?ub= (e.g. on close, returning to the underlying page).
 */
(function () {
  function ubScreen(id) {
    try {
      var u = new URL(location.href);
      if (id) u.searchParams.set('ub', id); else u.searchParams.delete('ub');
      var next = u.pathname + u.search + u.hash;
      if (next !== location.pathname + location.search + location.hash) {
        history.replaceState(history.state, '', next);
      }
      var n = document.createElement('span');
      n.setAttribute('data-ub-nudge', 'true');
      n.setAttribute('aria-hidden', 'true');
      n.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none';
      document.body.appendChild(n);
      setTimeout(function () { if (n.parentNode) n.parentNode.removeChild(n); }, 0);
    } catch (e) {}
  }

  function ubOverlay(id) {
    var t = window.OnboardingTour;
    if (t && typeof t.isActive === 'function' && t.isActive()) return;
    ubScreen(id);
  }

  window.ubScreen = ubScreen;
  window.ubOverlay = ubOverlay;
})();
