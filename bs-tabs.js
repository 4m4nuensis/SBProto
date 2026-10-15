(function () {
  /* ─── inject CSS ─────────────────────────────────────────────────────────── */
  const style = document.createElement('style');
  style.textContent = `
.bs-top-tabs{
  display:flex;align-items:center;justify-content:center;
  width:100%;
}
.bs-top-tab{
  flex:1;height:40px;max-height:40px;min-height:40px;
  padding:6px 2px 8px;
  display:flex;align-items:center;justify-content:center;gap:8px;
  position:relative;cursor:pointer;
}
.bs-top-tab .lbl{
  font-size:14px;line-height:20px;font-weight:400;white-space:nowrap;
  color:var(--w-32);
}
.bs-top-tab.active .lbl{color:var(--w-100)}
.bs-top-tab .cnt{
  width:20px;height:20px;border-radius:16px;flex-shrink:0;
  display:flex;align-items:center;justify-content:center;
  font-size:12px;font-weight:600;line-height:16px;text-align:center;
  background:var(--bg-32);color:var(--w-48);
}
.bs-top-tab.active .cnt{background:var(--w-12);color:var(--w-100)}
/* curve for RIGHT inactive tab — overflows its left edge */
.bs-crv{
  position:absolute;left:-20.42px;top:0;
  width:207.918px;height:40px;pointer-events:none;
  max-width:none;
}
/* curve for LEFT inactive tab — mirrored, overflows its right edge */
.bs-crv-flip{
  position:absolute;right:-20.42px;top:0;
  width:207.918px;height:40px;pointer-events:none;
  transform:scaleX(-1);
  max-width:none;
}
`;
  document.head.appendChild(style);

  /* ─── render placeholder ─────────────────────────────────────────────────── */
  const el = document.querySelector('[data-bs-tabs]');
  if (!el) return;

  const active = el.dataset.bsTabs; // 'betslip' | 'openbets'
  const isBetslip = active === 'betslip';
  const bsCount = 0; // betslip drafts — not wired up in this prototype
  const obCount = (window.BetslipStore && window.BetslipStore.getCount()) || 0;

  el.outerHTML = isBetslip
    ? `<div class="bs-top-tabs">
        <div class="bs-top-tab active">
          <span class="lbl">Betslip</span>
          <span class="cnt">${bsCount}</span>
        </div>
        <a class="bs-top-tab" href="betslip-open-bets.html">
          <img class="bs-crv" src="assets/bs-curve-bg.svg" alt="">
          <span class="lbl">Open Bets</span>
          <span class="cnt" data-bs-count>${obCount}</span>
        </a>
      </div>`
    : `<div class="bs-top-tabs">
        <a class="bs-top-tab" href="betslip.html">
          <img class="bs-crv-flip" src="assets/bs-curve-bg.svg" alt="">
          <span class="lbl">Betslip</span>
          <span class="cnt">${bsCount}</span>
        </a>
        <div class="bs-top-tab active">
          <span class="lbl">Open Bets</span>
          <span class="cnt" data-bs-count>${obCount}</span>
        </div>
      </div>`;

  function refresh() {
    if (!window.BetslipStore) return;
    const tgt = document.querySelector('[data-bs-count]');
    if (tgt) tgt.textContent = String(window.BetslipStore.getCount());
  }

  // bs-tabs.js often runs before betslip-store.js loads. Re-read the count
  // once the page is fully parsed and subscribe for future updates.
  function wire() {
    refresh();
    if (window.BetslipStore) window.BetslipStore.subscribe(refresh);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wire, { once: true });
  } else {
    wire();
  }
})();
