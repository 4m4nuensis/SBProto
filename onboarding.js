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
 * Steps:
 *   prefs / suggest  → onboarding-preferences.html  (owned by that page's UI)
 *   deposit          → index.html   full-screen welcome pop-up + "+" spotlight
 *   balance          → index.html   three tooltips on the balance pill / dropdown
 *   event            → picked match  match intro → 1X2 market → betslip → place
 *   openbets1        → picked match  tooltip on the open-bets clock
 *   openbets2        → open-bets.html  tooltip on the open bet → success screen
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
  const FALLBACK_MATCH = { id: '80201', href: 'prematch-match-80201.html', label: 'Man City vs Chelsea' };

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
    if (/-match-\d+\.html$/.test(file)) return 'match';
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
  //   'betslipOpen' — the floating betslip popup opened
  //   'placedBet'   — a bet was placed (BetslipStore count grew)
  // Copy may contain {home}/{away}, filled with the picked match's team names.
  const STEPS = [
    { id: 'prefs',    page: 'prefs',    screen: true },
    { id: 'suggest',  page: 'prefs',    screen: true },

    { id: 'deposit',  page: 'home', marks: [
      { id: 'welcome', fullscreen: true, trigger: 'cta',
        art: '🎁', badge: '+$5 FREEBET',
        title: 'Welcome bonus!',
        copy: "You've been awarded a welcome bonus. Deposit $5 and we'll match it with $5 in freebets to play with.",
        cta: 'Top up now' },
      { id: 'plus', target: '.bal-plus-btn', copy: 'Press the green + to top up your balance.',
        place: 'below', trigger: 'deposit', allowTargetClick: true },
    ] },

    { id: 'balance',  page: 'home', marks: [
      { target: '.bal-pill', copy: 'Tap to see your balance.',
        place: 'below', trigger: 'balancesOpen', allowTargetClick: true },
      { target: '[data-bal-cash]', copy: 'This is your cash balance.',
        place: 'below', trigger: 'next', requiresOpen: 'balances' },
      { target: '.bal-bottom-row', copy: 'Here you can see your bonuses and your total balance including bonus.',
        place: 'below', trigger: 'next', requiresOpen: 'balances', nextLabel: "Let's place a bet →" },
    ] },

    { id: 'event',    page: 'match', marks: [
      { id: 'intro', target: '.event-card', copy: "This is your match screen — here you'll find the teams, kick-off time and key stats.",
        place: 'below', trigger: 'next' },
      { id: 'market', target: '.market[data-market="match-result"] .title', copy: 'This is the Match Result market — pick who you think will win.',
        place: 'below', trigger: 'next' },
      { id: 'out1', target: '.market[data-market="match-result"] .opts .opt:nth-child(1)', copy: 'Tap here if you believe {home} wins.',
        place: 'below', trigger: 'next', allowTargetClick: true, jumpOnBetslip: true },
      { id: 'outX', target: '.market[data-market="match-result"] .opts .opt:nth-child(2)', copy: "Tap here if you think it'll be a draw.",
        place: 'below', trigger: 'next', allowTargetClick: true, jumpOnBetslip: true },
      { id: 'out2', target: '.market[data-market="match-result"] .opts .opt:nth-child(3)', copy: 'Tap here if you believe {away} wins — your first bet is on us!',
        place: 'below', trigger: 'betslipOpen', allowTargetClick: true },
      { id: 'betslip', target: '.bsp-card', copy: 'Input your stake here, then press Place Bet to place your bet.',
        place: 'above', trigger: 'placedBet', requiresOpen: 'betslip', allowTargetClick: true },
    ] },

    { id: 'openbets1', page: 'match', waitPopupClosed: true, marks: [
      { target: '.sln-clock[data-bs-clock]', copy: 'You can find your open bets here.',
        place: 'above', trigger: 'next', allowTargetClick: true, nextLabel: 'Show me →' },
    ] },

    { id: 'openbets2', page: 'openbets', marks: [
      { target: '.bo-card', copy: 'Here are your open bets — you can track them or cash out any time.',
        place: 'below', trigger: 'next', nextLabel: 'Finish' },
    ], finale: true },
  ];
  const stepIndexById = id => STEPS.findIndex(s => s.id === id);

  /* ──────────────── styles ──────────────── */
  const css = `
#ob-root{ position:fixed; inset:0; z-index:9000; pointer-events:none; }
#ob-root.ob-suppressed{ opacity:0 !important; pointer-events:none !important; }

.ob-spot{
  position:fixed; left:0; top:0; width:0; height:0; z-index:1;
  border-radius:12px; pointer-events:none;
  box-shadow:0 0 0 9999px rgba(1,12,35,.74), 0 0 0 2px rgba(216,13,131,.9),
             0 0 18px 4px rgba(216,13,131,.45);
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
.ob-tip[data-place="below"] .ob-arrow{ top:-7px; border-bottom:7px solid #0a1633; }
.ob-tip[data-place="above"] .ob-arrow{ bottom:-7px; border-top:7px solid #010c23; }

/* full-screen pop-up (welcome bonus) + finale share a base look */
.ob-screen, .ob-finale{
  position:fixed; inset:0; z-index:9100; pointer-events:auto;
  background:radial-gradient(130% 90% at 50% 0%, #2a0b3e 0%, #010c23 58%);
  display:flex; flex-direction:column; align-items:center; justify-content:center;
  text-align:center; padding:32px 28px;
  font-family:'Rubik',system-ui,sans-serif; color:#fff;
  opacity:0; transition:opacity .3s ease;
}
.ob-screen.ob-show, .ob-finale.ob-show{ opacity:1; }

.ob-screen-art{
  width:148px; height:148px; border-radius:50%; margin-bottom:6px;
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
.ob-screen-ttl{ font-size:30px; line-height:36px; font-weight:700; margin:12px 0 8px; }
.ob-screen-copy{ font-size:15px; line-height:22px; color:rgba(255,255,255,.78); max-width:300px; margin:0 0 28px; }
.ob-screen-cta, .ob-finale .ob-fin-cta{
  width:100%; max-width:320px; height:52px; border-radius:999px;
  background:var(--main,#d80d83); border:0; border-top:1px solid rgba(255,255,255,.24);
  color:#fff; font:inherit; font-weight:600; font-size:16px; cursor:pointer;
  box-shadow:0 12px 30px rgba(216,13,131,.45);
}
.ob-screen-cta:active{ transform:translateY(1px); }
.ob-screen-skip, .ob-finale .ob-fin-later{
  margin-top:14px; background:none; border:0; color:rgba(255,255,255,.5);
  font:inherit; font-size:13px; cursor:pointer;
}
.ob-screen-skip:hover, .ob-finale .ob-fin-later:hover{ color:rgba(255,255,255,.85); }

.ob-finale .ob-burst{ font-size:56px; line-height:1; margin-bottom:8px; }
.ob-finale h2{ font-size:24px; font-weight:700; margin:0 0 8px; }
.ob-finale p{ font-size:14px; line-height:20px; color:rgba(255,255,255,.72); margin:0 0 6px; max-width:300px; }
.ob-finale .ob-prize{
  margin:18px 0 24px; padding:14px 18px; border-radius:14px;
  background:rgba(255,255,255,.06); border-top:1px solid rgba(255,255,255,.16);
  display:flex; align-items:center; gap:10px; font-size:14px;
}
.ob-finale .ob-prize b{ color:#ffad29; }
`;

  /* ──────────────── overlay DOM ──────────────── */
  let root, spot, tip, tipCopy, tipArrow, skipBtn, nextBtn;
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
      '<div class="ob-copy"></div>' +
      '<div class="ob-row">' +
        '<button class="ob-skip" type="button">Skip tour</button>' +
        '<button class="ob-next" type="button">Next</button>' +
      '</div>';
    tipCopy  = tip.querySelector('.ob-copy');
    tipArrow = tip.querySelector('.ob-arrow');
    skipBtn  = tip.querySelector('.ob-skip');
    nextBtn  = tip.querySelector('.ob-next');

    root.appendChild(spot);
    root.appendChild(tip);
    document.body.appendChild(root);

    // Keep tooltip clicks from reaching the page — otherwise the balances
    // dropdown's own click-outside handler (balance.js) would close it the
    // moment the user presses Next.
    tip.addEventListener('click', e => e.stopPropagation());
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
    const mark = current.mark;
    // A real outcome tap during the explanatory market tooltips opens the
    // betslip — jump straight to the betslip/stake tooltip.
    if (mark.jumpOnBetslip && betslipOpen()) {
      const step = STEPS[current.step];
      const i = step.marks.findIndex(m => m.id === 'betslip');
      if (i >= 0) { mountMark(current.step, i); return; }
    }
    const t = mark.trigger;
    if (t === 'deposit' && num('vbet:balance') > current.baseCash) {
      creditFreebet();
      advance();
    } else if (t === 'balancesOpen' && balancesOpen()) {
      advance();
    } else if (t === 'betslipOpen' && betslipOpen()) {
      advance();
    } else if (t === 'placedBet' && betsCount() > current.baseBets) {
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

  // Reflect the "$5 in freebets" in the balances dropdown the user inspects next.
  function creditFreebet() {
    try {
      if (num('vbet:bonus') < 5) {
        localStorage.setItem('vbet:bonus', '5');
        // balance.js listens for this and repaints the bonus / total rows.
        window.dispatchEvent(new CustomEvent('vbet:balance-changed'));
      }
    } catch (_) {}
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
    // The welcome pop-up's CTA also opens the deposit flow straight away.
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

    // Next button visibility + label
    if (mark.trigger === 'next') {
      nextBtn.classList.remove('ob-hidden');
      nextBtn.textContent = mark.nextLabel || 'Next';
    } else {
      nextBtn.classList.add('ob-hidden');
    }
    tipCopy.textContent = fillCopy(mark.copy);

    if (mark.requiresOpen === 'balances') ensureBalancesOpen();

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
    if (step.finale) { showFinale(); return; }
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
    const path = (location.pathname || '').toLowerCase();
    return path.indexOf(picked.href.toLowerCase()) !== -1;
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
    removeScreen();
  }

  function endTour() {
    teardownVisuals();
    writeState({ active: false });
    const fin = document.querySelector('.ob-finale');
    if (fin) fin.remove();
  }

  /* ──────────────── finale ──────────────── */
  function showFinale() {
    teardownVisuals();
    if (document.querySelector('.ob-finale')) return;
    const el = document.createElement('div');
    el.className = 'ob-finale';
    el.innerHTML =
      '<div class="ob-burst">🎉</div>' +
      '<h2>Congratulations!</h2>' +
      '<p>Your first bet is placed on a freebet. You\'re all set.</p>' +
      '<div class="ob-prize">📺 Watch a quick video on navigating matches &amp; markets to earn another <b>$5 freebet</b>.</div>' +
      '<button class="ob-fin-cta" type="button">Watch the video</button>' +
      '<button class="ob-fin-later" type="button">Maybe later</button>';
    document.body.appendChild(el);
    setTimeout(() => el.classList.add('ob-show'), 20);
    const finish = () => { writeState({ active: false, done: true }); el.remove(); };
    el.querySelector('.ob-fin-cta').addEventListener('click', finish);
    el.querySelector('.ob-fin-later').addEventListener('click', finish);
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

    // If the user reached the open-bets page by tapping the clock icon (rather
    // than the tooltip's button), the step is still 'openbets1' — bump it so the
    // tour continues to the success screen right here.
    if (PAGE === 'openbets' && state.step === stepIndexById('openbets1')) {
      state = writeState({ step: stepIndexById('openbets2') });
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
    // Called by the suggestion popup: lock the picked match and jump to deposit.
    beginWalkthrough(pickedMatch) {
      writeState({ step: stepIndexById('deposit'), pickedMatch: pickedMatch || FALLBACK_MATCH });
      location.href = 'index.html';
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
})();
