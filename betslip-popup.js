/*
 * Floating betslip popup.
 * Attach by including <script src="betslip-popup.js"></script> on a page that
 * has odd buttons (.bet-opt / .gw-bet-opt / .to-bet-opt / .opt).
 * Clicking any odd button slides a single-bet betslip up above the bottom nav
 * with a Place Bet CTA. Click again on the same odd, or the X, to dismiss.
 */
(function () {
  if (window.__bsp_loaded) return;
  window.__bsp_loaded = true;

  /* ──────────────── styles ──────────────── */
  const css = `
.bsp-host{
  position:fixed; left:50%; transform:translateX(-50%);
  bottom:96px; width:375px; padding:0 8px;
  z-index:80; pointer-events:none;
}
.bsp-card{
  transform:translateY(160%); opacity:0;
  transition:transform .28s cubic-bezier(.22,.61,.36,1), opacity .18s;
  background:linear-gradient(0deg,rgba(255,255,255,.04),rgba(255,255,255,.04)),#010c23;
  border-top:1px solid rgba(255,255,255,.16);
  border-radius:12px; padding:8px;
  display:flex; flex-direction:column; gap:8px;
  box-shadow:0 -16px 48px rgba(0,0,0,.5);
  pointer-events:auto;
}
.bsp-host.open .bsp-card{ transform:translateY(0); opacity:1; }
.bsp-host.placing .bsp-card{
  border-color:rgba(36,159,88,.6);
  box-shadow:0 -16px 48px rgba(36,159,88,.4);
}

.bsp-ticket{
  background:rgba(255,255,255,.08); border-radius:6px;
  padding:4px 8px 8px; display:flex; flex-direction:column; gap:4px;
}
.bsp-ttl{
  display:flex; align-items:center; justify-content:space-between;
  border-bottom:1px dashed rgba(255,255,255,.12);
}
.bsp-date{
  flex:1; height:32px; display:flex; align-items:center; gap:6px;
  font-size:12px; line-height:16px; color:rgba(255,255,255,.56); letter-spacing:.4px;
  overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
}
.bsp-date .dot{
  width:3px; height:3px; border-radius:50%;
  background:rgba(255,255,255,.56); flex-shrink:0;
}
.bsp-close{
  width:24px; height:24px; border-radius:999px;
  display:flex; align-items:center; justify-content:center;
  color:rgba(255,255,255,.72); flex-shrink:0;
}
.bsp-close svg{ width:14px; height:14px; }

.bsp-sel{
  display:flex; align-items:center; justify-content:space-between; gap:8px;
}
.bsp-sel .name{
  flex:1; font-size:14px; line-height:20px; font-weight:500;
  color:rgba(255,255,255,.9);
  overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
}
.bsp-sel .odds{
  font-size:14px; line-height:20px; color:#ffad29; font-weight:500;
  white-space:nowrap; flex-shrink:0;
}

.bsp-mkt{ display:flex; flex-direction:column; gap:2px; font-size:12px; line-height:16px; }
.bsp-mkt .mkt{
  color:rgba(255,255,255,.72);
  overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
}
.bsp-mkt .teams{
  color:rgba(255,255,255,.9);
  overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
}

.bsp-stake-wrap{ display:flex; flex-direction:column; gap:8px; padding-top:4px; }
.bsp-stake{
  height:40px; border-radius:999px; background:rgba(255,255,255,.08);
  display:flex; align-items:center; gap:8px; padding:0 16px;
}
.bsp-stake input{
  flex:1; min-width:0; background:transparent; border:0; outline:0;
  font:inherit; color:rgba(255,255,255,.8); font-size:14px; line-height:20px;
}
.bsp-stake input::placeholder{ color:rgba(255,255,255,.56); }
.bsp-stake .max{
  font-size:14px; line-height:20px; color:rgba(255,255,255,.56);
  white-space:nowrap; flex-shrink:0;
}
.bsp-pw{
  display:flex; align-items:center; justify-content:space-between;
  padding:0 8px; font-size:12px; line-height:16px;
}
.bsp-pw .lbl{ color:rgba(255,255,255,.4); }
.bsp-pw .amt{ color:rgba(255,255,255,.64); }

.bsp-place{
  height:40px; border-radius:999px; background:#d80d83;
  border-top:1px solid rgba(255,255,255,.24);
  font:inherit; font-size:14px; font-weight:500; color:#fff;
  display:flex; align-items:center; justify-content:center;
  cursor:pointer; transition:background .15s, transform .1s;
  box-shadow:0 6px 18px rgba(216,13,131,.32);
}
.bsp-place:active{ transform:translateY(1px); }
.bsp-host.placing .bsp-place{ background:#249f58; box-shadow:0 6px 18px rgba(36,159,88,.4); }

/* Active state on the tapped odd */
.bsp-active-odd{
  background:rgba(216,13,131,.16) !important;
  border-color:#d80d83 !important;
  outline:1px solid #d80d83;
}

/* Hide overlapping subnav while popup is up */
body.bsp-open .sln-group{
  opacity:0; pointer-events:none;
  transition:opacity .2s;
}
.sln-group{ transition:opacity .2s; }

/* Flying chip that travels from a tapped odd to the ticket icon */
.bsp-fly{
  position:fixed; z-index:120; pointer-events:none;
  background:#d80d83; color:#fff;
  border-radius:999px; padding:4px 10px;
  font:600 12px/16px 'Rubik',system-ui,sans-serif;
  white-space:nowrap; box-shadow:0 8px 24px rgba(216,13,131,.5);
  transform:translate(-50%,-50%) scale(1);
  transition:transform .42s cubic-bezier(.45,.05,.55,.95), opacity .25s ease-out, left .42s cubic-bezier(.45,.05,.55,.95), top .42s cubic-bezier(.45,.05,.55,.95);
  will-change:left,top,transform,opacity;
}
.bsp-fly.gone{ opacity:0; transform:translate(-50%,-50%) scale(.35); }
`;
  const styleEl = document.createElement('style');
  styleEl.textContent = css;
  document.head.appendChild(styleEl);

  /* ──────────────── DOM ──────────────── */
  const host = document.createElement('div');
  host.className = 'bsp-host';
  host.innerHTML = `
    <div class="bsp-card" role="dialog" aria-label="Betslip">
      <div class="bsp-ticket">
        <div class="bsp-ttl">
          <div class="bsp-date">
            <span class="d-date">03.04.2026</span>
            <span class="dot"></span>
            <span class="d-time">19:00</span>
          </div>
          <button class="bsp-close" aria-label="Close">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round">
              <path d="M4 4l8 8M12 4l-8 8"/>
            </svg>
          </button>
        </div>
        <div class="bsp-sel">
          <p class="name">—</p>
          <p class="odds">—</p>
        </div>
        <div class="bsp-mkt">
          <p class="mkt">Match Result</p>
          <p class="teams">—</p>
        </div>
        <div class="bsp-stake-wrap">
          <div class="bsp-stake">
            <input type="text" inputmode="numeric" value="2 000" aria-label="Stake">
            <span class="max">MAX</span>
          </div>
          <div class="bsp-pw">
            <span class="lbl">Possible Win:</span>
            <span class="amt">$ 0.00</span>
          </div>
        </div>
      </div>
      <button class="bsp-place">Place Bet</button>
    </div>
  `;
  document.body.appendChild(host);

  const card    = host.querySelector('.bsp-card');
  const dateEl  = host.querySelector('.d-date');
  const timeEl  = host.querySelector('.d-time');
  const nameEl  = host.querySelector('.bsp-sel .name');
  const oddsEl  = host.querySelector('.bsp-sel .odds');
  const mktEl   = host.querySelector('.bsp-mkt .mkt');
  const teamsEl = host.querySelector('.bsp-mkt .teams');
  const stakeIn = host.querySelector('.bsp-stake input');
  const winEl   = host.querySelector('.bsp-pw .amt');
  const closeBtn= host.querySelector('.bsp-close');
  const placeBtn= host.querySelector('.bsp-place');

  let currentOdds = 0;
  let currentOddBtn = null;
  let placingTimer = null;

  /* ──────────────── helpers ──────────────── */
  const ODD_SELECTOR = '.bet-opt, .gw-bet-opt, .to-bet-opt, .opt';
  const CONTEXT_SELECTOR =
    '.event-card, .match-card, .gw-match-box, .gw-live-card, ' +
    '.banner-card, .to-card, .ev-body, .match-row, ' +
    '.sg-info, .game-info, .pg-event, .pg-card';

  function parseOdds(str) {
    if (!str) return 0;
    const n = parseFloat(String(str).replace(/[^\d.]/g, ''));
    return isFinite(n) ? n : 0;
  }

  function fmtMoney(n) {
    if (!isFinite(n) || n <= 0) return '$ 0.00';
    const parts = n.toFixed(2).split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    return '$ ' + parts.join('.');
  }

  function parseStake(v) {
    const n = parseFloat(String(v || '').replace(/[^\d.]/g, ''));
    return isFinite(n) ? n : 0;
  }

  function recalcWin() {
    winEl.textContent = fmtMoney(parseStake(stakeIn.value) * currentOdds);
  }

  // Extract teams + market + selection name from the surrounding DOM
  function extractContext(oddBtn) {
    const ctx = oddBtn.closest(CONTEXT_SELECTOR) || oddBtn.parentElement;

    // 1. Outright cards have team name baked into the option
    if (oddBtn.classList.contains('to-bet-opt')) {
      const teamSpan = oddBtn.querySelector('.to-bet-team');
      const oddsSpan = oddBtn.querySelector('.to-bet-odds');
      const ctxCard  = oddBtn.closest('.to-card');
      const league   = ctxCard?.querySelector('.to-league-name')?.textContent?.trim() || 'Outright Winner';
      const country  = ctxCard?.querySelector('.to-country-name')?.textContent?.trim() || '';
      return {
        selection: teamSpan?.textContent?.trim() || 'Selection',
        odds: parseOdds(oddsSpan?.textContent),
        market: 'Outright',
        teams: country ? `${league} · ${country}` : league,
      };
    }

    // 2. 1 / X / 2 style buttons — derive team1/team2/draw mapping
    const label = (oddBtn.querySelector('.l')?.textContent || '').trim();
    const oddsTxt = (oddBtn.querySelector('.o')?.textContent || '').trim();
    const odds = parseOdds(oddsTxt);

    // Pull all team name candidates inside the context
    let teamNames = [];
    if (ctx) {
      const candidates = ctx.querySelectorAll(
        '.team .nm, .gw-team-nm, .gw-tennis-name, .team-block .name, .bnr-tn, .teams .nm'
      );
      const seen = new Set();
      candidates.forEach(el => {
        const t = el.textContent.trim();
        if (t && !seen.has(t)) { seen.add(t); teamNames.push(t); }
      });
    }
    // Banner fallback
    if (teamNames.length < 2) {
      const fallback = (oddBtn.closest('.banner-card') || document)
        .querySelectorAll('.bnr-tn');
      const seen = new Set(teamNames);
      fallback.forEach(el => {
        const t = el.textContent.trim();
        if (t && !seen.has(t)) { seen.add(t); teamNames.push(t); }
      });
    }
    const home = teamNames[0] || 'Home';
    const away = teamNames[1] || 'Away';

    let selection;
    if (label === '1') selection = home;
    else if (label === '2') selection = away;
    else if (/^x$/i.test(label)) selection = 'Draw';
    else selection = label || 'Selection';

    return {
      selection,
      odds,
      market: 'Match Result',
      teams: `${home} - ${away}`,
    };
  }

  function open(ctx, oddBtn) {
    if (currentOddBtn && currentOddBtn !== oddBtn) {
      currentOddBtn.classList.remove('bsp-active-odd');
    }
    currentOddBtn = oddBtn;
    oddBtn.classList.add('bsp-active-odd');

    nameEl.textContent  = ctx.selection;
    oddsEl.textContent  = ctx.odds ? ctx.odds.toFixed(2) : '—';
    mktEl.textContent   = ctx.market;
    teamsEl.textContent = ctx.teams;
    currentOdds = ctx.odds;
    if (!stakeIn.value || parseStake(stakeIn.value) === 0) stakeIn.value = '2 000';
    recalcWin();

    host.classList.add('open');
    document.body.classList.add('bsp-open');
  }

  function close() {
    host.classList.remove('open');
    host.classList.remove('placing');
    document.body.classList.remove('bsp-open');
    if (currentOddBtn) currentOddBtn.classList.remove('bsp-active-odd');
    currentOddBtn = null;
    if (placingTimer) { clearTimeout(placingTimer); placingTimer = null; }
    placeBtn.textContent = 'Place Bet';
  }

  /* ──────────────── fly-to-icon animation ──────────────── */
  function getTicketTarget() {
    const el = document.querySelector('.sln-ticket[data-bs-ticket]');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }
  function flyToTicket(fromEl, label) {
    const target = getTicketTarget();
    if (!target || !fromEl) return Promise.resolve();
    const r = fromEl.getBoundingClientRect();
    const start = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    const chip = document.createElement('div');
    chip.className = 'bsp-fly';
    chip.textContent = label || '+1';
    chip.style.left = start.x + 'px';
    chip.style.top  = start.y + 'px';
    document.body.appendChild(chip);
    // next frame → animate to target
    return new Promise(resolve => {
      requestAnimationFrame(() => {
        chip.style.left = target.x + 'px';
        chip.style.top  = target.y + 'px';
        chip.classList.add('gone');
        setTimeout(() => { chip.remove(); resolve(); }, 460);
      });
    });
  }

  function popupBetSnapshot() {
    return {
      selection: nameEl.textContent,
      market:    mktEl.textContent,
      teams:     teamsEl.textContent,
      odds:      currentOdds,
      stake:     parseStake(stakeIn.value),
      date:      dateEl.textContent,
      time:      timeEl.textContent,
    };
  }
  function ctxToBet(ctx) {
    return {
      selection: ctx.selection,
      market:    ctx.market,
      teams:     ctx.teams,
      odds:      ctx.odds,
      stake:     0,
      date:      dateEl.textContent,
      time:      timeEl.textContent,
    };
  }

  function addDraftWithFly(bet, fromEl) {
    if (!window.BetslipStore) return;
    flyToTicket(fromEl, (Number(bet.odds) || 0).toFixed(2));
    // Add to store immediately; animation is decorative.
    window.BetslipStore.addDraft(bet);
  }

  /* ──────────────── wire events ──────────────── */
  document.addEventListener('click', function (e) {
    const oddBtn = e.target.closest(ODD_SELECTOR);
    if (!oddBtn) return;
    if (!oddBtn.querySelector('.o, .to-bet-odds')) return;
    e.preventDefault();
    e.stopPropagation();

    const ctx = extractContext(oddBtn);
    const store = window.BetslipStore;
    const draftCount = store ? store.getDraftCount() : 0;
    const popupOpen  = host.classList.contains('open');

    // 1. Tapping the same odd again toggles the popup off (single-bet mode only).
    if (popupOpen && currentOddBtn === oddBtn) { close(); return; }

    // 2. Already in multi-bet mode (drafts exist) → just queue directly.
    if (draftCount > 0 && !popupOpen) {
      addDraftWithFly(ctxToBet(ctx), oddBtn);
      return;
    }

    // 3. Popup open with bet #1, user tapped a different odd → enter multi-bet.
    //    Queue the popup's current bet and the new one, close popup.
    if (popupOpen && currentOddBtn !== oddBtn) {
      const firstBet  = popupBetSnapshot();
      const firstFrom = currentOddBtn || oddBtn;
      close();
      addDraftWithFly(firstBet, firstFrom);
      addDraftWithFly(ctxToBet(ctx), oddBtn);
      return;
    }

    // 4. Default: single-bet popup for the first tap.
    open(ctx, oddBtn);
  }, true); // capture phase to beat parent anchor navigation

  closeBtn.addEventListener('click', close);

  stakeIn.addEventListener('input', recalcWin);
  stakeIn.addEventListener('focus', () => stakeIn.select());

  placeBtn.addEventListener('click', function () {
    if (host.classList.contains('placing')) return;
    if (!currentOdds || currentOdds <= 0) return;

    if (window.BetslipStore) {
      window.BetslipStore.addBet({
        selection: nameEl.textContent,
        market:    mktEl.textContent,
        teams:     teamsEl.textContent,
        odds:      currentOdds,
        stake:     parseStake(stakeIn.value),
        date:      dateEl.textContent,
        time:      timeEl.textContent,
      });
    }

    host.classList.add('placing');
    placeBtn.textContent = 'Bet Placed ✓';
    placingTimer = setTimeout(close, 1100);
  });

  // ESC for keyboard
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && host.classList.contains('open')) close();
  });
})();
