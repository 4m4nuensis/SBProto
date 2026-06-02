/*
 * Shared <.back-btn> styling.
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
`;
  document.head.appendChild(style);
})();
