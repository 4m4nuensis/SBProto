/*
 * Stage 1 onboarding — "smooth first bet" guided walkthrough.
 *
 * A self-gating coachmark engine. Include it (after betslip-popup.js) on every
 * page the tour touches; it is a complete no-op unless a tour is active, so the
 * extra <script> is harmless everywhere.
 *
 * The tour is a linear, cross-page state machine persisted in localStorage
 * under `vbet:onboarding`. Each page load calls resume(): it reads the current
 * step and, if that step's screen is the current page, mounts the relevant
 * coachmark(s); advancing a step may navigate to another page.
 *
 * Flow (revised 2026-06-03 — see onboarding-flow.md):
 *   prefs / suggest  → onboarding-preferences.html  (preference gallery + pop-up)
 *   event            → picked match  walkthrough FIRST (intro → 1X2 → odds summary)
 *   deposit          → picked match  tap-a-bet → top-up pop-up + balance tips → place
 *   openbets1        → picked match  tooltip on the open-bets clock
 *   openbets2        → open-bets.html  open-bet + cashout tooltips → missions screen
 *   missionsLater    → index.html   "At a later time" → profile-icon tooltip
 *
 * Launch: visit onboarding-preferences.html (or any page with ?onboarding=start).
 * Replay/reset: ?onboarding=reset, or OnboardingTour.reset() in the console.
 *
 * Integrates with existing modules via their public selectors / stores only —
 * no edits to balance.js, betslip-popup.js, nav.js, betslip-store.js, bs-tabs.js.
 */
(function () {
  if (window.__onboarding_loaded) return;
  window.__onboarding_loaded = true;

  const KEY = 'vbet:onboarding';
  const EVT = 'vbet:onboarding-changed';
  const FALLBACK_MATCH = { id: '80201', href: 'match.html?id=80201', label: 'Man City vs Chelsea' };
  // TODO: confirm with the team — the welcome offer is now $10 deposit → $10 freebet
  // (was $5/$5). This is the credited bonus value, not just copy.
  const FREEBET = 10;

  /* ──────────────── state ──────────────── */
  function readState() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return null;
      const s = JSON.parse(raw);
      return s && typeof s === 'object' ? s : null;
    } catch (_) { return null; }
  }
  function writeState(patch) {
    const cur = readState() || {};
    const next = Object.assign({}, cur, patch);
    try { localStorage.setItem(KEY, JSON.stringify(next)); }
    catch (_) { /* quota / disabled — degrade to a no-op */ }
    try { window.dispatchEvent(new CustomEvent(EVT, { detail: next })); } catch (_) {}
    return next;
  }
  function clearState() {
    try { localStorage.removeItem(KEY); } catch (_) {}
  }

  /* ──────────────── page detection ──────────────── */
  function pageKey() {
    const path = (location.pathname || '').toLowerCase();
    const file = path.slice(path.lastIndexOf('/') + 1) || 'index.html';
    if (file.indexOf('onboarding-preferences') === 0) return 'prefs';
    // both the 1-tab (open-bets.html) and 2-tab (betslip-open-bets.html) screens
    if (file.indexOf('open-bets') === 0 || file.indexOf('betslip-open-bets') === 0) return 'openbets';
    // the dynamic match detail page (match.html?id=…); plus the old per-match files
    if (file.indexOf('match.html') === 0 || /-match-\d+\.html$/.test(file)) return 'match';
    if (file === '' || file === 'index.html') return 'home';
    const nav = document.getElementById('app-nav');
    if (nav && nav.dataset.page === 'home') return 'home';
    return 'other';
  }
  const PAGE = pageKey();

  function urlForPage(key, state) {
    if (key === 'home') return 'index.html';
    if (key === 'openbets') return 'open-bets.html';   // the 1-tab screen the clock icon links to
    if (key === 'prefs') return 'onboarding-preferences.html';
    if (key === 'match') return ((state && state.pickedMatch) || FALLBACK_MATCH).href;
    return null;
  }

  /* ──────────────── step / mark config ──────────────── */
  // Marks describe one spotlight + tooltip (or a full-screen pop-up when
  // `fullscreen` is set). `trigger` controls how a coachmark advances:
  //   'next'        — a Next button (info marks the user reads)
  //   'cta'         — a full-screen pop-up's primary button
  //   'deposit'     — cash balance increased (a deposit completed)
  //   'balancesOpen'— the balances dropdown opened
  //   'placedBet'   — a bet was placed (BetslipStore count grew)
  //   (anything else / 'tapOutcome') — no Next; advances via a step-level rule
  // Copy may contain {home}/{away}, filled with the picked match's team names.
  const STEPS = [
    { id: 'prefs',    page: 'prefs',    screen: true },
    { id: 'suggest',  page: 'prefs',    screen: true },

    // The match page is walked through FIRST — no deposit before this.
    // Targets the first market generically (it's the result/money-line market
    // for every sport) so the walkthrough works whether it's a 3-way (1/X/2)
    // football game or a 2-way basketball/tennis match.
    { id: 'event',    page: 'match', onBetslipGoTo: 'deposit', marks: [
      { id: 'intro', target: '.event-card', copy: "This is your match screen — here you'll find the teams playing, kick-off time and key events that you can bet on.",
        place: 'below', trigger: 'next' },
      { id: 'market', target: '.market[data-market="match-result"] .title', copy: 'This is the Match Result market — pick who you think will win.',
        place: 'below', trigger: 'next' },
      { id: 'out1', target: '.market[data-market="match-result"] .opts .opt:nth-child(1)', copy: 'Tap here if you believe {home} wins.',
        place: 'below', trigger: 'next', allowTargetClick: true },
      { id: 'outX', target: '.market[data-market="match-result"] .opts .opt:nth-child(2):not(:last-child)', copy: "Tap here if you think it'll be a draw.",
        place: 'below', trigger: 'next', allowTargetClick: true, skipIfMissing: true },
      { id: 'out2', target: '.market[data-market="match-result"] .opts .opt:last-child', copy: 'Tap here if you believe {away} wins.',
        place: 'below', trigger: 'next', allowTargetClick: true },
      { id: 'oddsSummary', target: '.market[data-market="match-result"] .opts', copy: 'Select the match result you want to bet on.',
        place: 'below', trigger: 'tapOutcome', allowTargetClick: true },
    ] },

    // Top-up is triggered only once the user taps a bet; afterwards they go
    // straight to placing the bet. (Balance education moved to the very end.)
    { id: 'deposit',  page: 'match', marks: [
      // a large rich tooltip pointing at the "+" button (dims the rest of the
      // screen). No CTA — the user taps the spotlighted "+".
      { id: 'welcome', target: '.bal-plus-btn', place: 'below', trigger: 'deposit',
        allowTargetClick: true, rich: true, dim: true, scrollTop: true,
        art: '💰', badge: '+$' + FREEBET + ' FREEBET',
        title: "Let's top up your balance to place your bet",
        copy: 'Your first bet is on us! Deposit $' + FREEBET + ' and get $' + FREEBET + ' in freebets.' },
      { id: 'betslip', target: '.bsp-card', copy: 'Indicate your bet size here, then press Place Bet.',
        place: 'above', trigger: 'placedBet', requiresOpen: 'betslip', allowTargetClick: true },
    ] },

    { id: 'openbets1', page: 'match', waitPopupClosed: true, marks: [
      { target: '.sln-clock[data-bs-clock]', copy: 'You can find your open bets here.',
        place: 'above', trigger: 'next', allowTargetClick: true, nextLabel: 'Show me →' },
    ] },

    { id: 'openbets2', page: 'openbets', marks: [
      { id: 'openBet', target: '.bo-card', copy: 'Here are your open bets. Come back here when the match is over to see your result.',
        place: 'below', trigger: 'next' },
      { id: 'cashout', target: '.bo-cashout', copy: 'If you want to edit your bet you can cash out before the match starts and place a new bet.',
        place: 'above', trigger: 'next' },
      { id: 'back', target: '.back-btn', copy: 'Tap here to head back and check your balance.',
        place: 'below', trigger: 'next', allowTargetClick: true, nextLabel: 'Go back →' },
    ] },

    // Back on the match screen — the balance education now lives at the very
    // end, just before the success screen.
    { id: 'balanceCheck', page: 'match', marks: [
      { id: 'balPill', target: '.bal-pill', copy: 'Tap to see your balance.',
        place: 'below', trigger: 'balancesOpen', allowTargetClick: true, scrollTop: true },
      { id: 'balCash', target: '[data-bal-cash]', copy: 'This is your cash balance.',
        place: 'below', trigger: 'next', requiresOpen: 'balances' },
      { id: 'balTotal', target: '.bal-bottom-row', copy: 'Here you can see your bonuses and your total balance including bonus.',
        place: 'below', trigger: 'next', requiresOpen: 'balances', nextLabel: 'Finish' },
    ], finale: true },

    // Only entered via the missions screen's "At a later time" button.
    { id: 'missionsLater', page: 'home', marks: [
      { target: '.header-bar .icon-btn-ghost', copy: 'You can access it there.',
        place: 'below', trigger: 'next', nextLabel: 'Got it' },
    ] },
  ];
  const stepIndexById = id => STEPS.findIndex(s => s.id === id);

  /* ──────────────── styles ──────────────── */
  // NOTE: tooltips no longer dim the screen — the spotlight is just a glowing
  // ring around the target (no scrim), so the rest of the UI stays visible.
  const css = `
#ob-root{ position:fixed; inset:0; z-index:9000; pointer-events:none; }
#ob-root.ob-suppressed{ opacity:0 !important; pointer-events:none !important; }

/* Pulse ring on the deposit + button when the tooltip points at it */
@keyframes ob-pulse{
  0%   { box-shadow:0 0 0 0 rgba(36,159,88,.7); }
  60%  { box-shadow:0 0 0 10px rgba(36,159,88,0); }
  100% { box-shadow:0 0 0 0 rgba(36,159,88,0); }
}
.ob-pulse-target{ animation:ob-pulse 1.2s ease-out infinite !important; }

.ob-spot{
  position:fixed; left:0; top:0; width:0; height:0; z-index:1;
  border-radius:12px; pointer-events:none;
  box-shadow:0 0 0 2px rgba(216,13,131,.95), 0 0 22px 5px rgba(216,13,131,.55);
}
/* dim variant — darkens the rest of the screen around the target */
.ob-spot.ob-dim{
  box-shadow:0 0 0 9999px rgba(1,12,35,.8), 0 0 0 2px rgba(216,13,131,.95), 0 0 22px 5px rgba(216,13,131,.55);
}
.ob-spot.ob-hidden{ opacity:0; }

.ob-tip{
  position:fixed; left:0; top:0; z-index:3; max-width:300px; width:max-content;
  background:linear-gradient(0deg,rgba(216,13,131,.06),rgba(216,13,131,.06)),#010c23;
  border:1px solid rgba(216,13,131,.55);
  border-top:1px solid rgba(216,13,131,.8);
  border-radius:12px; padding:12px 14px 10px;
  box-shadow:0 16px 40px rgba(0,0,0,.55), 0 0 22px 2px rgba(216,13,131,.5);
  pointer-events:auto;
  font:400 13px/18px 'Rubik',system-ui,sans-serif; color:#fff;
}
.ob-tip.ob-hidden{ opacity:0; pointer-events:none; }
.ob-tip .ob-copy{ color:rgba(255,255,255,.92); }
.ob-tip .ob-row{
  display:flex; align-items:center; justify-content:space-between; gap:12px;
  margin-top:12px;
}
.ob-skip{
  background:none; border:0; padding:4px 2px; cursor:pointer; font:inherit;
  font-size:12px; color:rgba(255,255,255,.48);
}
.ob-skip:hover{ color:rgba(255,255,255,.8); }
.ob-next{
  background:var(--main,#d80d83); border:0; border-top:1px solid rgba(255,255,255,.24);
  color:#fff; font:inherit; font-weight:500; font-size:13px;
  padding:7px 16px; border-radius:999px; cursor:pointer;
  box-shadow:0 6px 16px rgba(216,13,131,.32);
}
.ob-next:active{ transform:translateY(1px); }
.ob-next.ob-hidden{ display:none; }
.ob-arrow{
  position:absolute; width:0; height:0; left:24px;
  border-left:7px solid transparent; border-right:7px solid transparent;
}
.ob-tip[data-place="below"] .ob-arrow{ top:-7px; border-bottom:7px solid #2a0b3e; }
.ob-tip[data-place="above"] .ob-arrow{ bottom:-7px; border-top:7px solid #010c23; }

/* large "rich" tooltip (deposit prompt): title header, then copy + art on right */
.ob-tip.ob-rich-mode{ max-width:330px; padding:14px 16px 10px; }
.ob-rich{ display:flex; flex-direction:column; gap:10px; }
.ob-rich-ttl{ font-size:16px; line-height:21px; font-weight:700; color:#fff; }
.ob-rich-body{ display:flex; align-items:center; gap:12px; }
.ob-rich-copy{ flex:1; font-size:13px; line-height:18px; color:rgba(255,255,255,.82); }
.ob-rich-art-wrap{ flex-shrink:0; display:flex; flex-direction:column; align-items:center; gap:6px; cursor:pointer; }
.ob-rich-art-wrap:active{ transform:scale(.96); }
.ob-rich-art{
  width:54px; height:54px; border-radius:50%;
  background:radial-gradient(circle at 50% 38%, rgba(216,13,131,.5), rgba(216,13,131,.05) 70%);
  display:flex; align-items:center; justify-content:center;
  box-shadow:0 0 22px rgba(216,13,131,.4);
}
.ob-rich-art .em{ font-size:28px; line-height:1; }
.ob-rich-badge{
  padding:4px 10px; border-radius:999px; background:var(--main,#d80d83);
  color:#fff; font-weight:700; font-size:11px; letter-spacing:.3px; white-space:nowrap;
  box-shadow:0 6px 14px rgba(216,13,131,.45);
}
.ob-tip.ob-rich-mode .ob-row{ justify-content:flex-start; margin-top:10px; }

/* full-screen pop-up (welcome / top-up) + missions screen share a base look */
.ob-screen, .ob-missions{
  position:fixed; inset:0; z-index:9100; pointer-events:auto;
  background:radial-gradient(130% 90% at 50% 0%, #2a0b3e 0%, #010c23 58%);
  display:flex; flex-direction:column; align-items:center; justify-content:center;
  text-align:center; padding:32px 28px;
  font-family:'Rubik',system-ui,sans-serif; color:#fff;
  opacity:0; transition:opacity .3s ease; overflow-y:auto;
}
.ob-screen.ob-show, .ob-missions.ob-show{ opacity:1; }

.ob-screen-art{
  width:148px; height:148px; border-radius:50%; margin-bottom:6px; flex-shrink:0;
  background:radial-gradient(circle at 50% 38%, rgba(216,13,131,.55), rgba(216,13,131,.06) 70%);
  display:flex; align-items:center; justify-content:center;
  box-shadow:0 0 70px rgba(216,13,131,.5);
  animation:ob-pop .5s cubic-bezier(.22,.61,.36,1);
}
.ob-screen-art .em{ font-size:80px; line-height:1; filter:drop-shadow(0 8px 16px rgba(0,0,0,.45)); }
@keyframes ob-pop{ 0%{ transform:scale(.6); opacity:0 } 100%{ transform:scale(1); opacity:1 } }
.ob-screen-badge{
  margin:8px 0 4px; padding:6px 16px; border-radius:999px;
  background:var(--main,#d80d83); color:#fff; font-weight:700; font-size:13px; letter-spacing:.6px;
  box-shadow:0 8px 22px rgba(216,13,131,.5);
}
.ob-screen-ttl{ font-size:26px; line-height:32px; font-weight:700; margin:12px 0 8px; max-width:320px; }
.ob-screen-copy{ font-size:15px; line-height:22px; color:rgba(255,255,255,.82); max-width:300px; margin:0 0 28px; }
.ob-cta-lg, .ob-screen-cta{
  width:100%; max-width:320px; height:52px; border-radius:999px;
  background:var(--main,#d80d83); border:0; border-top:1px solid rgba(255,255,255,.24);
  color:#fff; font:inherit; font-weight:600; font-size:16px; cursor:pointer;
  box-shadow:0 12px 30px rgba(216,13,131,.45);
}
.ob-cta-lg:active, .ob-screen-cta:active{ transform:translateY(1px); }
.ob-link-lg, .ob-screen-skip{
  margin-top:14px; background:none; border:0; color:rgba(255,255,255,.5);
  font:inherit; font-size:13px; cursor:pointer;
}
.ob-link-lg:hover, .ob-screen-skip:hover{ color:rgba(255,255,255,.85); }

/* missions screen */
.ob-missions{ justify-content:flex-start; padding-top:48px; }
.ob-ring{ width:128px; height:128px; flex-shrink:0; margin-bottom:14px; }
.ob-ring .ob-ring-label{ font:700 22px/1 'Rubik',sans-serif; fill:#fff; }
.ob-ring .ob-ring-sub{ font:500 11px/1 'Rubik',sans-serif; fill:rgba(255,255,255,.5); }
.ob-missions h2{ font-size:24px; font-weight:700; margin:0 0 6px; }
.ob-missions .ob-sub{ font-size:14px; line-height:20px; color:rgba(255,255,255,.72); margin:0 0 4px; max-width:320px; }
.ob-missions .ob-carrot{ font-size:13px; color:#ffad29; font-weight:600; margin:6px 0 18px; }
.ob-mission-list{ width:100%; max-width:340px; display:flex; flex-direction:column; gap:8px; margin-bottom:22px; }
.ob-mission{
  display:flex; align-items:center; gap:12px; text-align:left;
  padding:12px 14px; border-radius:12px;
  background:rgba(255,255,255,.06); border-top:1px solid rgba(255,255,255,.12);
}
.ob-mission .mi{ font-size:22px; line-height:1; flex-shrink:0; }
.ob-mission .mt{ flex:1; }
.ob-mission .mt b{ display:block; font-size:14px; font-weight:600; }
.ob-mission .mt span{ font-size:12px; color:rgba(255,255,255,.56); }
`;

  /* ──────────────── overlay DOM ──────────────── */
  let root, spot, tip, tipCopy, tipArrow, skipBtn, nextBtn;
  let richWrap, richArt, richBadge, richTtl, richCopy;
  let tickTimer = null;
  let current = null;     // { step, markIdx, mark, baseCash, baseBets }
  let mountToken = 0;     // invalidates async waits across (re)mounts

  function buildOverlay() {
    if (root) return;
    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);

    root = document.createElement('div');
    root.id = 'ob-root';

    spot = document.createElement('div');
    spot.className = 'ob-spot ob-hidden';

    tip = document.createElement('div');
    tip.className = 'ob-tip ob-hidden';
    tip.innerHTML =
      '<div class="ob-arrow"></div>' +
      '<div class="ob-rich" style="display:none">' +
        '<div class="ob-rich-ttl"></div>' +
        '<div class="ob-rich-body">' +
          '<div class="ob-rich-copy"></div>' +
          '<div class="ob-rich-art-wrap">' +
            '<div class="ob-rich-art"><span class="em"></span></div>' +
            '<div class="ob-rich-badge"></div>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="ob-copy"></div>' +
      '<div class="ob-row">' +
        '<button class="ob-skip" type="button">Skip tour</button>' +
        '<button class="ob-next" type="button">Next</button>' +
      '</div>';
    tipCopy  = tip.querySelector('.ob-copy');
    tipArrow = tip.querySelector('.ob-arrow');
    skipBtn  = tip.querySelector('.ob-skip');
    nextBtn  = tip.querySelector('.ob-next');
    richWrap = tip.querySelector('.ob-rich');
    richArt  = tip.querySelector('.ob-rich-art .em');
    richBadge= tip.querySelector('.ob-rich-badge');
    richTtl  = tip.querySelector('.ob-rich-ttl');
    richCopy = tip.querySelector('.ob-rich-copy');

    root.appendChild(spot);
    root.appendChild(tip);
    document.body.appendChild(root);

    // Keep tooltip clicks from reaching the page — otherwise the balances
    // dropdown's own click-outside handler (balance.js) would close it the
    // moment the user presses Next.
    tip.addEventListener('click', e => e.stopPropagation());
    // The rich tooltip's art + badge double as a CTA: on a deposit mark, tapping
    // them opens the top-up screen (same as tapping the spotlit "+" button).
    tip.querySelector('.ob-rich-art-wrap').addEventListener('click', () => {
      const m = current && current.mark;
      if (!m || (m.trigger !== 'deposit' && m.id !== 'welcome')) return;
      const plus = document.querySelector('.bal-plus-btn');
      if (plus) plus.click();
    });
    skipBtn.addEventListener('click', endTour);
    nextBtn.addEventListener('click', () => advance());
    window.addEventListener('resize', reposition, { passive: true });
    window.addEventListener('scroll', reposition, { passive: true, capture: true });
  }

  /* ──────────────── helpers ──────────────── */
  function num(key) {
    const v = parseFloat(localStorage.getItem(key));
    return isFinite(v) ? v : 0;
  }
  function depositModalOpen() { return !!document.querySelector('.bal-dep-host.open'); }
  function balancesOpen()     { return !!document.querySelector('.bal-pop-host.open'); }
  function betslipOpen()      { return !!document.querySelector('.bsp-host.open'); }
  function popupClosed()      { return !document.body.classList.contains('bsp-open'); }

  // Home / away names of the picked match, for {home}/{away} in tooltip copy.
  function teamNames() {
    const s = readState();
    const label = s && s.pickedMatch && s.pickedMatch.label;
    if (label && label.indexOf(' vs ') !== -1) {
      const p = label.split(' vs ');
      return { home: p[0].trim(), away: p[1].trim() };
    }
    const names = document.querySelectorAll('.teams-row .team-block .name');
    if (names.length >= 2) {
      return { home: names[0].textContent.trim(), away: names[1].textContent.trim() };
    }
    return { home: 'the home team', away: 'the away team' };
  }
  function fillCopy(s) {
    const t = teamNames();
    return String(s || '').replace(/\{home\}/g, t.home).replace(/\{away\}/g, t.away);
  }

  function resolveTarget(mark) {
    if (!mark) return null;
    let el = null;
    try { el = document.querySelector(mark.target); } catch (_) { return null; }
    if (!el) return null;
    if (mark.requiresOpen === 'balances' && !balancesOpen()) return null;
    if (mark.requiresOpen === 'betslip'  && !betslipOpen())  return null;
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return null;
    return el;
  }

  function ensureBalancesOpen() {
    if (balancesOpen()) return;
    const pill = document.querySelector('.bal-pill');
    if (pill) pill.click();
  }
  function closeBalances() {
    if (!balancesOpen()) return;
    const pill = document.querySelector('.bal-pill');
    if (pill) pill.click();
  }

  /* ──────────────── render / position ──────────────── */
  function reposition() {
    if (!current || !current.mark || current.mark.fullscreen) return;
    const el = resolveTarget(current.mark);
    if (!el) { spot.classList.add('ob-hidden'); tip.classList.add('ob-hidden'); return; }
    const r = el.getBoundingClientRect();
    const pad = 6;
    spot.style.left   = (r.left - pad) + 'px';
    spot.style.top    = (r.top - pad) + 'px';
    spot.style.width  = (r.width + pad * 2) + 'px';
    spot.style.height = (r.height + pad * 2) + 'px';
    spot.classList.remove('ob-hidden');

    // tip placement (clamped to the frame), with vertical flip on overflow
    tip.classList.remove('ob-hidden');
    let place = current.mark.place || 'below';
    const tipW = tip.offsetWidth, tipH = tip.offsetHeight;
    const gut = 8;
    const FRAME = Math.min(440, window.innerWidth);
    const frameLeft = Math.max(0, (window.innerWidth - FRAME) / 2);
    let top = place === 'above' ? r.top - tipH - 12 : r.bottom + 12;
    if (place === 'below' && top + tipH > window.innerHeight - 8) { place = 'above'; top = r.top - tipH - 12; }
    if (place === 'above' && top < 8) { place = 'below'; top = r.bottom + 12; }
    let left = r.left + r.width / 2 - tipW / 2;
    const minL = frameLeft + gut, maxL = frameLeft + FRAME - gut - tipW;
    left = Math.max(minL, Math.min(Math.max(minL, maxL), left));
    tip.style.top = top + 'px';
    tip.style.left = left + 'px';
    tip.setAttribute('data-place', place);
    let arrowX = r.left + r.width / 2 - left - 7;
    arrowX = Math.max(12, Math.min(tipW - 26, arrowX));
    tipArrow.style.left = arrowX + 'px';
  }

  function applyVisibility() {
    // Hide the spotlight overlay while the full-screen deposit modal is in use.
    if (depositModalOpen()) root.classList.add('ob-suppressed');
    else root.classList.remove('ob-suppressed');
  }

  function checkAutoAdvance() {
    if (!current || !current.mark) return;
    const step = STEPS[current.step];
    const mark = current.mark;
    // In the event walkthrough, tapping any outcome (the betslip opens) means
    // the user is ready to bet → jump to the top-up / deposit step.
    if (step.onBetslipGoTo && betslipOpen()) {
      goToStep(stepIndexById(step.onBetslipGoTo));
      return;
    }
    const t = mark.trigger;
    if (t === 'deposit' && num('vbet:balance') > current.baseCash) {
      creditFreebet();
      advance();
    } else if (t === 'balancesOpen' && balancesOpen()) {
      advance();
    } else if (t === 'placedBet' && betsCount() > current.baseBets) {
      consumeFreebet();
      writeState({ firstBetIsFreebet: false });
      advance();
    }
  }

  // Driven by setInterval rather than requestAnimationFrame: rAF is paused in
  // backgrounded/headless tabs, which would freeze positioning and the
  // action-based step advances. setInterval keeps firing (throttled, but alive).
  function tick() {
    if (!current) return;
    maintainOpen();
    applyVisibility();
    reposition();
    checkAutoAdvance();
  }
  function startTicking() {
    tick();
    if (tickTimer == null) tickTimer = setInterval(tick, 60);
  }

  // Keep the balances dropdown open while its tooltips are showing.
  function maintainOpen() {
    if (current && current.mark && current.mark.requiresOpen === 'balances'
        && !depositModalOpen() && !balancesOpen()) {
      ensureBalancesOpen();
    }
  }

  function betsCount() {
    return (window.BetslipStore && window.BetslipStore.getCount()) || 0;
  }

  // Reflect the freebet in the balances dropdown the user inspects next.
  function creditFreebet() {
    try {
      if (num('vbet:bonus') < FREEBET) {
        localStorage.setItem('vbet:bonus', String(FREEBET));
        // balance.js listens for this and repaints the bonus / total rows.
        window.dispatchEvent(new CustomEvent('vbet:balance-changed'));
      }
    } catch (_) {}
  }
  // The first bet is placed on the freebet — spend it so the balance actually
  // moves during onboarding (bonus first; chargeStake is otherwise a no-op
  // mid-tour). Only the freebet token is consumed, leaving deposited cash.
  function consumeFreebet() {
    const s = readState();
    if (!s || !s.firstBetIsFreebet) return;
    if (window.Balance && typeof window.Balance.withdraw === 'function') {
      window.Balance.withdraw(FREEBET);
    }
  }

  /* ──────────────── full-screen pop-up marks ──────────────── */
  function removeScreen() {
    const el = document.querySelector('.ob-screen');
    if (el) el.remove();
  }
  function renderScreen(mark) {
    removeScreen();
    const el = document.createElement('div');
    el.className = 'ob-screen';
    el.innerHTML =
      '<div class="ob-screen-art"><span class="em">' + (mark.art || '🎁') + '</span></div>' +
      (mark.badge ? '<div class="ob-screen-badge">' + mark.badge + '</div>' : '') +
      '<h2 class="ob-screen-ttl">' + (mark.title || '') + '</h2>' +
      '<p class="ob-screen-copy">' + fillCopy(mark.copy) + '</p>' +
      '<button class="ob-screen-cta" type="button">' + (mark.cta || 'Continue') + '</button>' +
      '<button class="ob-screen-skip" type="button">Skip tour</button>';
    document.body.appendChild(el);
    setTimeout(() => el.classList.add('ob-show'), 20);
    el.querySelector('.ob-screen-cta').addEventListener('click', onScreenCta);
    el.querySelector('.ob-screen-skip').addEventListener('click', endTour);
  }
  function onScreenCta() {
    const mark = current && current.mark;
    removeScreen();
    advance();
    // The top-up pop-up's CTA also opens the deposit sheet straight away.
    if (mark && mark.id === 'welcome') {
      const plus = document.querySelector('.bal-plus-btn');
      if (plus) plus.click();
    }
  }

  /* ──────────────── mount / advance ──────────────── */
  function mountMark(stepIdx, markIdx) {
    const step = STEPS[stepIdx];
    const mark = step.marks[markIdx];
    ++mountToken;
    current = {
      step: stepIdx, markIdx, mark,
      baseCash: num('vbet:balance'),
      baseBets: betsCount(),
    };

    if (mark.fullscreen) { renderScreen(mark); return; }

    // Skip marks whose target doesn't exist (e.g. draw button on 2-way markets).
    if (mark.skipIfMissing && !resolveTarget(mark)) { advance(); return; }

    // The target lives in the (non-sticky) header — jump to the top so the
    // tooltip isn't stranded off-screen if the user had scrolled down.
    if (mark.scrollTop) window.scrollTo(0, 0);

    // returning to the betslip — close the balances dropdown we opened earlier
    if (mark.requiresOpen === 'betslip') closeBalances();

    if (mark.rich) {
      // a large tooltip: title header, then copy (left) + art/badge (right)
      tip.classList.add('ob-rich-mode');
      richWrap.style.display = '';
      richArt.textContent = mark.art || '💰';
      richBadge.textContent = mark.badge || '';
      richBadge.style.display = mark.badge ? '' : 'none';
      richTtl.textContent = mark.title || '';
      richCopy.textContent = fillCopy(mark.copy);
      tipCopy.style.display = 'none';
      nextBtn.classList.add('ob-hidden');
    } else {
      tip.classList.remove('ob-rich-mode');
      richWrap.style.display = 'none';
      tipCopy.style.display = '';
      tipCopy.textContent = fillCopy(mark.copy);
      if (mark.trigger === 'next') {
        nextBtn.classList.remove('ob-hidden');
        nextBtn.textContent = mark.nextLabel || 'Next';
      } else {
        nextBtn.classList.add('ob-hidden');
      }
    }
    // dim the rest of the screen only for marks that ask for it
    spot.classList.toggle('ob-dim', !!mark.dim);

    if (mark.requiresOpen === 'balances') ensureBalancesOpen();

    // pulse the deposit + button while the welcome / deposit tooltip is pointing at it
    const plusBtn = document.querySelector('.bal-plus-btn');
    if (plusBtn) plusBtn.classList.toggle('ob-pulse-target', mark.id === 'welcome');

    spot.classList.add('ob-hidden');
    tip.classList.add('ob-hidden');
    startTicking();
  }

  function advance() {
    if (!current) return;
    const stepIdx = current.step;
    const step = STEPS[stepIdx];
    const nextMark = current.markIdx + 1;
    if (nextMark < step.marks.length) {
      mountMark(stepIdx, nextMark);
      return;
    }
    // step complete
    if (step.finale) { showMissions(); return; }
    goToStep(stepIdx + 1);
  }

  // Move to a step: persist it, then either mount here or navigate to its page.
  function goToStep(stepIdx) {
    const state = writeState({ step: stepIdx });
    const step = STEPS[stepIdx];
    if (!step) { endTour(); return; }
    if (step.page === PAGE && (step.page !== 'match' || onPickedMatch(state))) {
      teardownVisuals();
      beginStepOnThisPage(stepIdx);
    } else {
      const url = urlForPage(step.page, state);
      if (url) location.href = url;
    }
  }

  function onPickedMatch(state) {
    const picked = (state && state.pickedMatch) || FALLBACK_MATCH;
    // The dynamic page identifies the match by ?id=… , not by filename.
    const here = new URLSearchParams(location.search || '').get('id');
    if (here && picked.id) return String(here) === String(picked.id);
    // Legacy per-match file fallback.
    const path = (location.pathname || '').toLowerCase();
    return path.indexOf(picked.href.toLowerCase()) !== -1;
  }

  // Build a pickedMatch entry from a catalog id (used by "Let me explore" mode,
  // where the user picks the match themselves on the prematch pages).
  function matchEntryFromId(id) {
    if (!id) return null;
    const D = window.VBET_DATA;
    const m = (D && typeof D.getMatch === 'function') ? D.getMatch(String(id)) : null;
    if (!m) return null;
    return { id: String(id), href: 'match.html?id=' + id, label: m.home.short + ' vs ' + m.away.short };
  }

  function beginStepOnThisPage(stepIdx) {
    const step = STEPS[stepIdx];
    if (!step || step.screen) return;           // screen steps own their own UI
    if (step.waitPopupClosed) {
      // wait for the betslip popup to slide away (it hides the open-bets clock)
      const token = ++mountToken;
      const wait = () => {
        if (token !== mountToken) return;
        if (popupClosed() && resolveTarget(step.marks[0])) { mountMark(stepIdx, 0); }
        else setTimeout(wait, 80);
      };
      setTimeout(wait, 80);
    } else {
      mountMark(stepIdx, 0);
    }
  }

  function teardownVisuals() {
    current = null;
    if (tickTimer != null) { clearInterval(tickTimer); tickTimer = null; }
    if (spot) spot.classList.add('ob-hidden');
    if (tip) tip.classList.add('ob-hidden');
    const plusBtn = document.querySelector('.bal-plus-btn');
    if (plusBtn) plusBtn.classList.remove('ob-pulse-target');
    removeScreen();
  }

  function endTour() {
    teardownVisuals();
    writeState({ active: false });
    const m = document.querySelector('.ob-missions');
    if (m) m.remove();
  }

  /* ──────────────── missions / congrats screen ──────────────── */
  // Replaces the old video finale. 6-segment progress ring, 1 filled.
  function ringSVG() {
    // r=52, C≈326.73; 6 segments with 8u gaps → each segment ≈ 46.45u.
    const seg = 46.45, gap = 8, C = 326.73;
    return '<svg class="ob-ring" viewBox="0 0 128 128">' +
      '<circle cx="64" cy="64" r="52" fill="none" stroke="rgba(255,255,255,.14)" stroke-width="8" ' +
        'stroke-dasharray="' + seg + ' ' + gap + '" transform="rotate(-90 64 64)"/>' +
      '<circle cx="64" cy="64" r="52" fill="none" stroke="#d80d83" stroke-width="8" ' +
        'stroke-dasharray="' + seg + ' ' + (C - seg) + '" transform="rotate(-90 64 64)" ' +
        'style="filter:drop-shadow(0 0 6px rgba(216,13,131,.7))"/>' +
      '<text class="ob-ring-label" x="64" y="62" text-anchor="middle">1/6</text>' +
      '<text class="ob-ring-sub" x="64" y="80" text-anchor="middle">steps</text>' +
    '</svg>';
  }
  function showMissions() {
    teardownVisuals();
    if (document.querySelector('.ob-missions')) return;
    // Missions: 4 named below. The ring has 6 segments = 1 (first bet, filled)
    // + 5 missions, but only 4 are named here.
    // TODO: confirm the 5th mission (design doc suggests "Bet Builder") or
    // reduce the ring to 5 segments. Do not guess.
    const MISSIONS = [
      { i: '🧭', t: 'Navigation', s: 'Find your way around the app' },
      { i: '🎯', t: 'Markets', s: 'Read and choose betting markets' },
      { i: '🔴', t: 'Live vs. pre-match', s: 'Bet before or during the match' },
      { i: '🎲', t: 'Explore different types of bets', s: 'Singles, combos and more' },
    ];
    const el = document.createElement('div');
    el.className = 'ob-missions';
    el.innerHTML =
      ringSVG() +
      '<h2>Congratulations!</h2>' +
      '<p class="ob-sub">Your first bet is placed on a freebet. That\'s step 1 done — keep going to learn the ropes.</p>' +
      '<div class="ob-carrot">Complete all missions to earn an extra $' + FREEBET + ' bonus</div>' +
      '<div class="ob-mission-list">' +
        MISSIONS.map(m => '<div class="ob-mission"><span class="mi">' + m.i + '</span>' +
          '<span class="mt"><b>' + m.t + '</b><span>' + m.s + '</span></span></div>').join('') +
      '</div>' +
      '<button class="ob-cta-lg" type="button">Take me there</button>' +
      '<button class="ob-link-lg" type="button">At a later time</button>';
    document.body.appendChild(el);
    setTimeout(() => el.classList.add('ob-show'), 20);
    // "Take me there" — missions aren't built; end the tour and drop into the app.
    el.querySelector('.ob-cta-lg').addEventListener('click', () => {
      writeState({ active: false, done: true });
      el.remove();
      location.href = 'index.html';
    });
    // "At a later time" — go home and point at the profile icon.
    el.querySelector('.ob-link-lg').addEventListener('click', () => {
      writeState({ step: stepIndexById('missionsLater') });
      el.remove();
      location.href = 'index.html';
    });
  }

  /* ──────────────── boot ──────────────── */
  // Demo controls run synchronously at load (NOT on DOMContentLoaded) so a
  // ?onboarding=reset has already wiped state before the preferences page's
  // inline gallery script reads it — otherwise the reset races the gallery.
  let redirecting = false;
  function gotoPrefs() {
    // Defer the navigation: redirecting synchronously during initial parse can
    // abort the in-flight page load. The state reset stays synchronous.
    redirecting = true;
    setTimeout(function () { location.href = 'onboarding-preferences.html'; }, 0);
  }
  // A demo reset wipes the money/bet stores too, so a replay starts truly fresh
  // ($0 balance, no open bets). This differs from a mid-tour Skip, which leaves
  // the user's funds untouched.
  function clearDemoStores() {
    ['vbet:bonus', 'vbet:balance', 'vbet:bets', 'vbet:drafts'].forEach(function (k) {
      try { localStorage.removeItem(k); } catch (_) {}
    });
  }
  function handleDemoControls() {
    const q = (location.search || '');
    if (/[?&]onboarding=reset/.test(q)) {
      clearState();
      clearDemoStores();
      writeState({ active: true, step: 0, prefs: {}, firstBetIsFreebet: true, done: false });
      if (PAGE !== 'prefs') gotoPrefs();
    } else if (/[?&]onboarding=start/.test(q) && PAGE !== 'prefs') {
      gotoPrefs();
    }
  }
  handleDemoControls();

  function resume() {
    if (redirecting) return;
    let state = readState();
    if (!state || !state.active) return;        // self-gate: dormant
    if (PAGE === 'prefs') return;               // the prefs page drives steps 0–1

    // "Let me explore" mode: the user is browsing prematch on their own. The
    // moment they open any match, adopt it and kick off the walkthrough here.
    if (state.exploring && PAGE === 'match') {
      const pm = matchEntryFromId(new URLSearchParams(location.search || '').get('id'));
      if (pm) state = writeState({ exploring: false, pickedMatch: pm, step: stepIndexById('event') });
    }

    // If the user reached the open-bets page by tapping the clock icon (rather
    // than the tooltip's button), the step is still 'openbets1' — bump it so the
    // tour continues right here.
    if (PAGE === 'openbets' && state.step === stepIndexById('openbets1')) {
      state = writeState({ step: stepIndexById('openbets2') });
    }
    // "Go back" from the open-bets screen lands the user back on the match page;
    // continue with the balance check there.
    if (PAGE === 'match' && onPickedMatch(state) && state.step === stepIndexById('openbets2')) {
      state = writeState({ step: stepIndexById('balanceCheck') });
    }

    const step = STEPS[state.step];
    if (!step || step.screen) return;
    if (step.page !== PAGE) return;             // wrong screen — stay dormant
    if (step.page === 'match' && !onPickedMatch(state)) return;

    buildOverlay();
    beginStepOnThisPage(state.step);
  }

  /* ──────────────── public API ──────────────── */
  window.OnboardingTour = {
    // Begin / ensure an active session (used by the preferences page).
    start() {
      const s = readState();
      if (!s || !s.active) writeState({ active: true, step: 0, prefs: {}, firstBetIsFreebet: true, done: false });
      return readState();
    },
    getState: readState,
    update: writeState,
    // Called by the suggestion popup: lock the picked match and go to the match
    // page (the walkthrough now runs there first — no deposit beforehand).
    beginWalkthrough(pickedMatch) {
      const pm = pickedMatch || FALLBACK_MATCH;
      writeState({ step: stepIndexById('event'), pickedMatch: pm, exploring: false });
      location.href = pm.href;
    },
    // "Let me explore": send the user to the prematch pages to browse freely;
    // the walkthrough auto-starts on whichever match they open next.
    explore() {
      writeState({ step: stepIndexById('event'), exploring: true, pickedMatch: null });
      location.href = 'prematch-menu.html';
    },
    setStep(id) { writeState({ step: stepIndexById(id) }); },
    skip: endTour,
    reset() {
      clearState();
      clearDemoStores();
    },
    isActive() { const s = readState(); return !!(s && s.active); },
    STEP_IDS: STEPS.map(s => s.id),
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', resume);
  } else {
    resume();
  }
  // history-back can restore a page from the bfcache without re-firing
  // DOMContentLoaded — re-evaluate the tour so it picks up where it should.
  window.addEventListener('pageshow', function (e) {
    if (e.persisted) { teardownVisuals(); resume(); }
  });
})();
