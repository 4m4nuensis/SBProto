(function () {
  /* ─── inject shared CSS ─────────────────────────────────────────────────── */
  const style = document.createElement('style');
  style.textContent = `
.bottom-fixed{
  position:fixed;left:50%;transform:translateX(-50%);bottom:0;
  width:100%;max-width:430px;background:linear-gradient(0.187deg,var(--bg) 89.121%,rgba(1,12,35,0) 99.246%);
  z-index:50;
}
.bottom-nav{
  display:flex;align-items:center;gap:2px;
  margin:8px;padding:0;border-radius:16px;
  background:var(--bg-60);backdrop-filter:blur(12px);
  border-top:1px solid var(--w-24);
}
.bn-item{
  flex:1;min-width:0;padding:6px 8px;
  display:flex;flex-direction:column;align-items:center;gap:4px;position:relative;
}
.bn-item .icon-pad{padding:4px 16px;display:flex;align-items:center}
.bn-item.active .icon-pad{padding:4px 12px;background:var(--w-8);border-radius:32px}
.bn-item .ic{width:24px;height:24px;overflow:hidden;position:relative}
.bn-item .ic img{width:auto;height:auto;display:block;position:absolute;inset:0;max-width:none}
.bn-item .lbl{font-size:12px;line-height:16px;color:var(--w-48);text-align:center;white-space:nowrap}
.bn-item.active .lbl{color:var(--w-100)}
.bn-item.active .glow{
  position:absolute;top:50%;left:50%;transform:translate(-50%,-50%) scaleY(-1) rotate(.18deg);
  width:60.477px;height:49.869px;pointer-events:none;
}
.bn-item.active .glow img{position:absolute;inset:-72.01% -59.31%;width:auto;height:auto;max-width:none}
.bn-center{padding:0 12px;display:flex;align-items:center;justify-content:center}
.bn-center .ball{
  width:44px;height:44px;border-radius:88px;display:flex;align-items:center;justify-content:center;
  background:radial-gradient(circle at 50% 50%,rgba(248,0,148,1) 50.481%,rgba(207,0,124,1) 100%);
  box-shadow:0 8px 24px rgba(216,13,131,.4);flex-shrink:0;
}
.bn-center .ball img{width:24px;height:24px;display:block;position:relative;z-index:1}
.home-indicator{height:34px;display:flex;align-items:center;justify-content:center;background:var(--bg)}
.home-indicator::after{content:"";width:134px;height:5px;border-radius:3px;background:#fff}
.sln-group{
  position:fixed;left:50%;transform:translateX(-50%);
  width:100%;max-width:430px;height:48px;bottom:122px;z-index:60;pointer-events:none;
}
.sln-clock{
  position:absolute;left:0;top:0;width:48px;height:48px;overflow:hidden;
  backdrop-filter:blur(20px);background:rgba(255,255,255,.08);
  border-top:1px solid rgba(255,255,255,0.14);
  border-radius:0 88px 88px 0;
  padding:8px;display:flex;align-items:center;justify-content:center;pointer-events:auto;
}
.sln-clock .ic{width:20px;height:20px;flex-shrink:0}
.sln-clock .ic img{width:100%;height:100%;display:block}
.sln-clock .badge{
  position:absolute;left:9px;top:7px;transform:translate(-50%,-50%);
  font-size:12px;font-weight:700;line-height:16px;color:#fff;white-space:nowrap;
}
.sln-nav{
  position:absolute;left:50%;transform:translateX(-50%);top:0;
  max-width:279px;overflow-x:auto;scrollbar-width:none;
  backdrop-filter:blur(20px);background:rgba(255,255,255,.08);
  border-top:1px solid rgba(255,255,255,0.14);
  border-radius:999px;padding:8px;
  display:flex;align-items:center;gap:0;pointer-events:auto;
}
.sln-nav::-webkit-scrollbar{display:none}
.sln-item{
  flex:none;
  display:flex;align-items:center;justify-content:center;
  padding:8px 10px;border-radius:8px;
  font-size:12px;line-height:16px;color:rgba(255,255,255,.8);
  white-space:nowrap;font-weight:400;
}
.sln-item.active{
  backdrop-filter:blur(12px);background:rgba(255,255,255,.12);
  border-radius:88px;color:#fff;font-weight:500;
}
.sln-dots{
  width:32px;height:32px;border-radius:999px;
  display:flex;align-items:center;justify-content:center;flex-shrink:0;
}
.sln-dots .ic{width:16px;height:16px}
.sln-dots .ic img{width:100%;height:100%;display:block}
.sln-ticket{
  position:absolute;right:0;top:0;width:48px;height:48px;overflow:hidden;
  backdrop-filter:blur(20px);background:rgba(255,255,255,.08);
  border-top:1px solid rgba(255,255,255,0.14);
  border-radius:88px 0 0 88px;
  padding:8px;display:flex;align-items:center;justify-content:center;pointer-events:auto;
}
.sln-ticket .ic{width:20px;height:20px;flex-shrink:0}
.sln-ticket .ic img{width:100%;height:100%;display:block}
.sln-ticket .badge{
  position:absolute;left:37.5px;top:7px;transform:translate(-50%,-50%);
  font-size:12px;font-weight:700;line-height:16px;color:#fff;white-space:nowrap;
  background:#d80d83; min-width:16px; height:16px; padding:0 4px; border-radius:999px;
  display:flex;align-items:center;justify-content:center;
  transform-origin:center; will-change:transform;
}
.sln-ticket .badge[hidden]{display:none}
/* attention bump: scale up + glow when a new draft arrives */
@keyframes sln-bump{
  0%   { transform:translate(-50%,-50%) scale(1);   box-shadow:0 0 0 0 rgba(216,13,131,.7); }
  35%  { transform:translate(-50%,-50%) scale(1.55); box-shadow:0 0 0 8px rgba(216,13,131,0); }
  70%  { transform:translate(-50%,-50%) scale(.92); }
  100% { transform:translate(-50%,-50%) scale(1); }
}
.sln-ticket .badge.bump{ animation:sln-bump .55s cubic-bezier(.22,.61,.36,1); }
.sln-ticket.flash{ animation:sln-ring .9s ease-out; }
@keyframes sln-ring{
  0%   { box-shadow:0 0 0 0 rgba(216,13,131,.0), inset 0 0 0 0 rgba(216,13,131,0); }
  20%  { box-shadow:0 0 18px 4px rgba(216,13,131,.55), inset 0 0 0 1px rgba(216,13,131,.8); }
  100% { box-shadow:0 0 0 0 rgba(216,13,131,0), inset 0 0 0 0 rgba(216,13,131,0); }
}
`;
  document.head.appendChild(style);

  /* ─── render nav ────────────────────────────────────────────────────────── */
  const placeholder = document.getElementById('app-nav');
  if (!placeholder) return;

  const page = placeholder.dataset.page || 'home'; // 'home' | 'live' | 'prematch' | 'betslip' | 'history'

  const initialCount = (window.BetslipStore && window.BetslipStore.getDraftCount()) || 0;
  const initialHref  = initialCount > 1 ? 'betslip-multiple.html' : 'betslip.html';

  function slnItem(label, href, key) {
    const active = page === key ? ' active' : '';
    if (active) return `<div class="sln-item${active}">${label}</div>`;
    return `<a class="sln-item" href="${href}">${label}</a>`;
  }

  placeholder.outerHTML = `
${page !== 'casino' ? `<div class="sln-group">
  <div class="sln-clock">
    <div class="ic"><img src="assets/st-clock.svg" alt=""></div>
    <span class="badge">4</span>
  </div>
  <div class="sln-nav">
    ${slnItem('Home',     'index.html',         'home')}
    ${slnItem('Live',     'live.html',          'live')}
    ${slnItem('Prematch', 'prematch-menu.html', 'prematch')}
    <div class="sln-dots">
      <div class="ic"><img src="assets/st-dots.svg" alt=""></div>
    </div>
  </div>
  <a class="sln-ticket" href="${initialHref}" aria-label="Open betslip" data-bs-ticket>
    <div class="ic"><img src="assets/st-ticket.svg" alt=""></div>
    <span class="badge" data-bs-badge${initialCount === 0 ? ' hidden' : ''}>${initialCount}</span>
  </a>
</div>` : ''}
<div class="bottom-fixed">
  <div class="bottom-nav">
    <a class="bn-item${page==='casino' ? '' : ' active'}" href="index.html">
      ${page!=='casino' ? '<div class="glow"><img src="assets/bn-sport-glow.svg" alt=""></div>' : ''}
      <div class="icon-pad">
        <div class="ic"><img src="assets/bn-sport-icon.svg" alt="" style="position:absolute;inset:12.5%;width:75%;height:75%"></div>
      </div>
      <span class="lbl">Sport</span>
    </a>
    <a class="bn-item${page==='casino' ? ' active' : ''}" href="home.html">
      ${page==='casino' ? '<div class="glow"><img src="assets/bn-sport-glow.svg" alt=""></div>' : ''}
      <div class="icon-pad">
        <div class="ic"><img src="assets/bn-casino-icon.svg" alt="" style="position:absolute;top:2px;left:2px;width:20px;height:20px"></div>
      </div>
      <span class="lbl">Casino</span>
    </a>
    <div class="bn-center">
      <div class="ball"><img src="assets/bn-grid-search.svg" alt=""></div>
    </div>
    <button class="bn-item">
      <div class="icon-pad">
        <div class="ic"><img src="assets/bn-live-casino-icon.svg" alt="" style="position:absolute;top:2px;left:2px;width:20px;height:20px"></div>
      </div>
      <span class="lbl">Live Casino</span>
    </button>
    <button class="bn-item">
      <div class="icon-pad">
        <div class="ic"><img src="assets/bn-games-icon.svg" alt="" style="position:absolute;inset:16.67% 5.06%;width:89.88%;height:66.66%"></div>
      </div>
      <span class="lbl">Games</span>
    </button>
  </div>
  <div class="home-indicator"></div>
</div>`;

  /* ─── live update badge when DRAFTS change ──────────────────────────────── */
  if (window.BetslipStore) {
    let lastDraftCount = window.BetslipStore.getDraftCount();
    const updateBadge = () => {
      const ticket = document.querySelector('.sln-ticket[data-bs-ticket]');
      const badge  = ticket && ticket.querySelector('[data-bs-badge]');
      if (!badge || !ticket) return;
      const n = window.BetslipStore.getDraftCount();
      const grew = n > lastDraftCount;
      lastDraftCount = n;
      badge.textContent = String(n);
      if (n === 0) badge.setAttribute('hidden', '');
      else badge.removeAttribute('hidden');
      ticket.setAttribute('href', n > 1 ? 'betslip-multiple.html' : 'betslip.html');
      if (grew) {
        badge.classList.remove('bump'); ticket.classList.remove('flash');
        // force reflow so the animation restarts even on consecutive bumps
        void badge.offsetWidth;
        badge.classList.add('bump');
        ticket.classList.add('flash');
      }
    };
    window.BetslipStore.subscribeDrafts(updateBadge);
  }
})();
