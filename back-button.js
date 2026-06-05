/*
 * Shared <.back-btn> styling + behaviour.
 *
 * Drop this script on any page that uses a back button — markup is just:
 *
 *   <a class="back-btn" href="…parent.html" aria-label="back">
 *     <svg viewBox="0 0 16 16" fill="none" stroke="currentColor"
 *          stroke-width="1.5"><path d="M10 4l-4 4 4 4"/></svg>
 *   </a>
 *
 * Visual: 32×32 circle, w-8 background, w-16 top hairline border, 16px
 * chevron in w-90. Matches the icon-btn family used in other page chrome.
 *
 * Behaviour: a tap returns to the *actual* previous page via the browser
 * history (so a match opened from the home page goes back to home, not to
 * a hardcoded parent). The href is kept as a fallback for direct loads /
 * fresh tabs where there is no in-app history to step back through.
 */
(function () {
  if (window.__BACK_BUTTON_INSTALLED__) return;
  window.__BACK_BUTTON_INSTALLED__ = true;

  const style = document.createElement('style');
  style.textContent = `
.back-btn{
  width:32px;height:32px;border-radius:999px;
  background:var(--w-8);border-top:1px solid var(--w-16);
  display:flex;align-items:center;justify-content:center;
  color:var(--w-90);flex:none;
  cursor:pointer;-webkit-tap-highlight-color:transparent;
  transition:background .12s ease;
}
.back-btn:hover{background:var(--w-12)}
.back-btn:active{background:var(--w-16)}
.back-btn svg{width:16px;height:16px;display:block}
/* When the page has a "My Zone" row, the back button is hoisted into it at the
   far left (before the search button); let the My Zone pill shrink to fit. */
.subnav:has(> .back-btn) .my-zone{flex:1 1 auto;width:auto;min-width:0}
`;
  document.head.appendChild(style);

  /* Hoist the back button up to the top, immediately left of the search
   * button in the "My Zone" subnav, on any page that has that row. Pages
   * without a subnav (e.g. open-bets) keep the back button where it is. */
  function relocate() {
    var subnav = document.querySelector('.subnav');
    if (!subnav) return;
    var back = document.querySelector('.back-btn');
    if (!back || subnav.contains(back)) return;
    subnav.insertBefore(back, subnav.firstChild);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', relocate);
  else relocate();

  /* Prefer real browser-history back over the static href. We only step
   * back when the previous entry is same-origin (document.referrer) so we
   * never bounce the user off the site; otherwise the href fallback runs. */
  document.addEventListener('click', function (e) {
    const btn = e.target.closest('.back-btn');
    if (!btn) return;
    let sameOriginReferrer = false;
    try {
      sameOriginReferrer =
        !!document.referrer &&
        new URL(document.referrer).origin === window.location.origin;
    } catch (_) { /* malformed referrer — treat as none */ }
    if (window.history.length > 1 && sameOriginReferrer) {
      e.preventDefault();
      window.history.back();
    }
    // else: let the <a href> navigate to the static parent page
  });
})();
