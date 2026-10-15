/*
 * Shared VBet brand logo — single source of truth for the wordmark.
 *
 * Drop a placeholder where the logo should go and include this script:
 *   <span data-app-logo></span>        inside a header .logo-wrap (page CSS sizes it)
 *   <span data-app-logo="lg"></span>   standalone / larger (e.g. onboarding)
 *
 * The placeholder is replaced by <img class="vbet" ...>, so existing
 * `.header-bar .vbet` rules keep applying and headers look identical; the
 * "lg" variant falls back to this module's sizing.
 */
(function () {
  if (window.__logo_loaded) return;
  window.__logo_loaded = true;

  var SRC = 'assets/c7ee4cb442a696c4b22400e87d4d4564d77ee63d.svg';

  var style = document.createElement('style');
  // Same proportions as the header logo (.header-bar .vbet is 56×16), scaled up
  // 1.5× for hero/standalone use.
  style.textContent = '.vbet.app-logo-lg{width:84px;height:24px}';
  document.head.appendChild(style);

  function render(el) {
    var img = document.createElement('img');
    img.className = 'vbet' + (el.getAttribute('data-app-logo') === 'lg' ? ' app-logo-lg' : '');
    img.src = SRC;
    img.alt = 'VBet';
    el.replaceWith(img);
  }

  function init() {
    var nodes = document.querySelectorAll('[data-app-logo]');
    for (var i = 0; i < nodes.length; i++) render(nodes[i]);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
