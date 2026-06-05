/*
 * Balance + Deposit module.
 *
 * Replaces any .balance element in the header with:
 *   - a separate green "+" button (opens the full-screen deposit)
 *   - a balance pill ($ amount) that toggles a small drop-down with the
 *     three balances (Cash / Bonus / With Bonus).
 *
 * The Deposit screen is a full-screen overlay with a payment method picker
 * (Credit Card / Google Pay / Apple Pay), an amount input, and a Deposit
 * button that adds the amount to the cash balance. Cash balance is
 * persisted in localStorage so it survives navigation.
 */
(function () {
  if (window.__balance_loaded) return;
  window.__balance_loaded = true;

  const KEY_CASH  = 'vbet:balance';
  const KEY_BONUS = 'vbet:bonus';
  const EVT       = 'vbet:balance-changed';

  function readCash() {
    const v = parseFloat(localStorage.getItem(KEY_CASH));
    return isFinite(v) ? v : 0;
  }
  function writeCash(v) {
    localStorage.setItem(KEY_CASH, String(v));
    window.dispatchEvent(new CustomEvent(EVT));
  }
  function readBonus() {
    const v = parseFloat(localStorage.getItem(KEY_BONUS));
    return isFinite(v) ? v : 0;
  }
  function round2(x) { return Math.round((Number(x) || 0) * 100) / 100; }

  /* Public balance API. Placing a bet withdraws the stake — bonus (freebet)
   * funds are spent first, then cash. Amounts are clamped at zero so the
   * balance never goes negative in the prototype. */
  window.Balance = {
    cash: readCash,
    bonus: readBonus,
    total: function () { return round2(readCash() + readBonus()); },
    withdraw: function (amount) {
      const amt = Number(amount);
      if (!isFinite(amt) || amt <= 0) return { fromBonus: 0, fromCash: 0 };
      const bonus = readBonus();
      const fromBonus = Math.min(bonus, amt);
      const fromCash = Math.min(readCash(), amt - fromBonus);
      if (fromBonus > 0) localStorage.setItem(KEY_BONUS, String(round2(bonus - fromBonus)));
      // writeCash persists cash AND dispatches the change event → all displays
      // (pill, balances drop-down, deposit sheet) refresh, bonus included.
      writeCash(round2(readCash() - fromCash));
      return { fromBonus: round2(fromBonus), fromCash: round2(fromCash) };
    },
  };

  function fmtUSD(n) {
    if (!isFinite(n)) n = 0;
    const parts = n.toFixed(2).split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return '$' + parts.join('.');
  }

  /* ──────────────── styles ──────────────── */
  const css = `
.bal-mount{display:flex; align-items:center; gap:6px;}

/* + button — matches the .icon-btn-pink megaphone size (32×32), green */
.bal-plus-btn{
  width:32px; height:32px; border-radius:999px;
  background:var(--green,#249f58);
  display:flex; align-items:center; justify-content:center;
  border:0; padding:0; cursor:pointer;
  border-top:1px solid rgba(255,255,255,.24);
  overflow:hidden;
  transition:transform .1s ease, filter .12s ease;
}
.bal-plus-btn:active{ transform:scale(.94); }
.bal-plus-btn:hover{ filter:brightness(1.08); }
.bal-plus-btn svg{ width:16px; height:16px; color:#fff; }

.bal-pill{
  height:32px; border-radius:88px; background:rgba(255,255,255,.08);
  display:flex; align-items:center; gap:4px; padding:0 12px;
  cursor:pointer; border:0; font:inherit; color:#fff;
  transition:background .12s ease;
}
.bal-pill:hover{ background:rgba(255,255,255,.12); }
.bal-pill.open{ background:rgba(216,13,131,.18); box-shadow:0 0 0 1px rgba(216,13,131,.5) inset; }
.bal-pill .amt{
  font-size:12px; line-height:16px; color:#fff; font-weight:500;
  white-space:nowrap;
}
.bal-pill .chev{ width:10px; height:10px; color:rgba(255,255,255,.56); transition:transform .2s; }
.bal-pill.open .chev{ transform:rotate(180deg); color:#fff; }

/* ── balances drop-down ── */
.bal-pop-backdrop{
  position:fixed; inset:0; background:rgba(0,0,0,.32);
  opacity:0; transition:opacity .18s;
  pointer-events:none; z-index:89;
}
.bal-pop-backdrop.open{ opacity:1; pointer-events:auto; }

.bal-pop-host{
  position:fixed; left:50%; transform:translateX(-50%);
  top:92px; width:100%; max-width:440px; padding:0 8px;
  z-index:90; pointer-events:none;
}
.bal-pop-card{
  transform:translateY(-8px) scale(.97);
  transform-origin:top right;
  opacity:0;
  transition:transform .22s cubic-bezier(.22,.61,.36,1), opacity .18s;
  background:linear-gradient(0deg,rgba(255,255,255,.04),rgba(255,255,255,.04)),#010c23;
  border-top:1px solid rgba(255,255,255,.16);
  border-radius:16px; padding:12px;
  display:flex; flex-direction:column; gap:8px;
  box-shadow:0 16px 48px rgba(0,0,0,.55);
  /* When closed, let clicks fall through to whatever is underneath
   * (e.g. the back button on detail pages). The host is also
   * pointer-events:none, but the card sat on top and intercepted. */
  pointer-events:none;
}
.bal-pop-host.open .bal-pop-card{ transform:translateY(0) scale(1); opacity:1; pointer-events:auto; }

.bal-row{
  display:flex; flex-direction:column; gap:2px;
  padding:10px 12px; border-radius:10px;
  background:rgba(255,255,255,.06);
}
.bal-row .lbl{ font-size:11px; line-height:14px; color:rgba(255,255,255,.56); }
.bal-row .val{ font-size:18px; line-height:22px; font-weight:600; color:#fff; }

.bal-bottom-row{ display:grid; grid-template-columns:1fr 1fr; gap:8px; }
.bal-bottom-row .bal-row .val{ font-size:14px; line-height:18px; }

/* ── full-screen Deposit ── */
.bal-dep-scrim{
  position:fixed; inset:0; background:rgba(0,0,0,.5);
  opacity:0; transition:opacity .2s;
  pointer-events:none; z-index:99;
}
.bal-dep-scrim.open{ opacity:1; pointer-events:auto; }

.bal-dep-host{
  position:fixed; left:50%; transform:translateX(-50%);
  top:0; width:100%; max-width:440px;
  /* Use dynamic viewport height so the bottom Deposit button stays
   * visible when the browser address bar is shown. Fall back to 100vh
   * on browsers that don't support dvh. */
  height:100vh; height:100dvh;
  z-index:100; pointer-events:none;
  overflow:hidden;
}
.bal-dep-host.open{ pointer-events:auto; }

.bal-dep-screen{
  position:absolute; inset:0;
  background:var(--bg,#010c23);
  transform:translateX(100%);
  transition:transform .28s cubic-bezier(.22,.61,.36,1);
  display:flex; flex-direction:column;
}
.bal-dep-host.open .bal-dep-screen{ transform:translateX(0); }

.bal-dep-header{
  flex-shrink:0;
  display:flex; align-items:center; gap:8px;
  padding:8px 12px;
  background:linear-gradient(90deg,rgba(255,255,255,.08) 0%,rgba(255,255,255,.08) 100%),rgba(0,2,5,.6);
  backdrop-filter:blur(21px);
  border-bottom:1px solid rgba(255,255,255,.08);
}
.bal-dep-back{
  width:32px; height:32px; border-radius:999px;
  background:rgba(255,255,255,.08); border:0; padding:0; cursor:pointer;
  display:flex; align-items:center; justify-content:center;
  color:#fff;
}
.bal-dep-back svg{ width:16px; height:16px; }
.bal-dep-title{
  flex:1; font-size:16px; font-weight:500; color:#fff;
  margin:0;
}
.bal-dep-close{
  width:32px; height:32px; border-radius:999px;
  background:rgba(255,255,255,.08); border:0; padding:0; cursor:pointer;
  display:flex; align-items:center; justify-content:center;
  color:#fff;
}
.bal-dep-close svg{ width:14px; height:14px; }

.bal-dep-body{
  flex:1; min-height:0; overflow-y:auto;
  padding:16px; display:flex; flex-direction:column; gap:20px;
}

.bal-dep-cash{
  display:flex; flex-direction:column; gap:4px;
  padding:14px 16px; border-radius:12px;
  background:rgba(255,255,255,.06);
}
.bal-dep-cash .lbl{ font-size:12px; color:rgba(255,255,255,.56); }
.bal-dep-cash .val{ font-size:22px; font-weight:700; color:#fff; line-height:28px; }

.bal-dep-section-ttl{
  font-size:13px; font-weight:500; color:rgba(255,255,255,.72);
  letter-spacing:.2px; margin:0;
  text-transform:uppercase;
}

.bal-pays{ display:flex; gap:8px; }
.bal-pay{
  flex:1; height:56px; border-radius:12px;
  background:rgba(255,255,255,.08);
  border:1px solid transparent;
  display:flex; align-items:center; justify-content:center;
  cursor:pointer; color:#fff; font:inherit;
  transition:background .12s, border-color .12s;
  font-size:13px; font-weight:600;
}
.bal-pay:hover{ background:rgba(255,255,255,.12); }
.bal-pay.active{
  background:rgba(216,13,131,.18); border-color:#d80d83;
}
.bal-pay .pay-label{ display:flex; align-items:center; gap:6px; line-height:1; }
.bal-pay svg{ display:block; }

.bal-amt-row{
  height:56px; border-radius:12px; background:rgba(255,255,255,.08);
  display:flex; align-items:center; padding:0 16px; gap:8px;
}
.bal-amt-row .pre{ color:rgba(255,255,255,.56); font-size:18px; font-weight:500; }
.bal-amt-row input{
  flex:1; min-width:0; background:transparent; border:0; outline:0;
  font:inherit; color:#fff; font-size:18px; font-weight:600; line-height:24px;
}
.bal-amt-row input::placeholder{ color:rgba(255,255,255,.4); font-weight:500; }
.bal-minmax{
  display:flex; justify-content:space-between;
  font-size:12px; color:rgba(255,255,255,.4);
  padding:0 4px; margin-top:-12px;
}

.bal-quick{ display:flex; gap:8px; flex-wrap:wrap; }
.bal-quick button{
  flex:1; min-width:60px; height:36px; border-radius:999px;
  background:rgba(255,255,255,.06); border:0;
  color:rgba(255,255,255,.85); font:inherit; font-size:13px; font-weight:500;
  cursor:pointer; transition:background .12s, color .12s;
}
.bal-quick button:hover{ background:rgba(255,255,255,.12); color:#fff; }

.bal-dep-footer{
  flex-shrink:0;
  /* Extra bottom padding accounts for iOS home-indicator / Android gesture area */
  padding:12px 16px calc(24px + env(safe-area-inset-bottom, 0px));
  border-top:1px solid rgba(255,255,255,.08);
  background:var(--bg,#010c23);
}
.bal-deposit-btn{
  width:100%; height:48px; border-radius:999px; background:var(--main,#d80d83);
  border:0; border-top:1px solid rgba(255,255,255,.24);
  font:inherit; font-size:15px; font-weight:500; color:#fff;
  cursor:pointer; transition:background .15s, transform .1s, box-shadow .15s;
  box-shadow:0 6px 18px rgba(216,13,131,.32);
}
.bal-deposit-btn:active{ transform:translateY(1px); }
.bal-deposit-btn:disabled{
  background:rgba(255,255,255,.12); cursor:not-allowed;
  box-shadow:none; color:rgba(255,255,255,.4);
  border-top-color:transparent;
}
.bal-deposit-btn.success{
  background:#249f58; box-shadow:0 6px 18px rgba(36,159,88,.4);
}

body.bal-dep-open{ overflow:hidden; }
`;

  /* ──────────────── render ──────────────── */
  let popupHost, popBackdrop;
  let depHost, depScrim, amtInput, depositBtn, payBtns, depCashEl;
  let activePay = 'card';

  function pillMarkup() {
    return `
      <button class="bal-plus-btn" aria-label="Deposit" data-bal-action="deposit">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round">
          <path d="M12 5v14M5 12h14"/>
        </svg>
      </button>
      <button class="bal-pill" aria-label="Balance" data-bal-action="balance">
        <span class="amt">${fmtUSD(readCash())}</span>
        <svg class="chev" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round">
          <path d="M2 4l3 3 3-3"/>
        </svg>
      </button>
    `;
  }

  function replaceBalances() {
    document.querySelectorAll('.balance').forEach(el => {
      const wrap = document.createElement('div');
      wrap.className = 'bal-mount';
      wrap.innerHTML = pillMarkup();
      el.replaceWith(wrap);
    });
  }

  function createBalancesPopup() {
    popBackdrop = document.createElement('div');
    popBackdrop.className = 'bal-pop-backdrop';
    document.body.appendChild(popBackdrop);

    popupHost = document.createElement('div');
    popupHost.className = 'bal-pop-host';
    popupHost.innerHTML = `
      <div class="bal-pop-card" role="dialog" aria-label="Balances">
        <div class="bal-row">
          <span class="lbl">Cash Balance</span>
          <span class="val" data-bal-cash>$0.00</span>
        </div>
        <div class="bal-bottom-row">
          <div class="bal-row">
            <span class="lbl">Bonus Balance</span>
            <span class="val" data-bal-bonus>$0.00</span>
          </div>
          <div class="bal-row">
            <span class="lbl">Balance with Bonus</span>
            <span class="val" data-bal-total>$0.00</span>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(popupHost);
    popBackdrop.addEventListener('click', closeBalances);
  }

  function createDepositScreen() {
    depScrim = document.createElement('div');
    depScrim.className = 'bal-dep-scrim';
    document.body.appendChild(depScrim);

    depHost = document.createElement('div');
    depHost.className = 'bal-dep-host';
    depHost.innerHTML = `
      <div class="bal-dep-screen" role="dialog" aria-label="Deposit">
        <div class="bal-dep-header">
          <button class="bal-dep-back" aria-label="Back">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M10 3l-5 5 5 5"/>
            </svg>
          </button>
          <h2 class="bal-dep-title">Deposit</h2>
          <button class="bal-dep-close" aria-label="Close">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <path d="M4 4l8 8M12 4l-8 8"/>
            </svg>
          </button>
        </div>

        <div class="bal-dep-body">
          <div class="bal-dep-cash">
            <span class="lbl">Cash Balance</span>
            <span class="val" data-dep-cash>$0.00</span>
          </div>

          <p class="bal-dep-section-ttl">Payment method</p>
          <div class="bal-pays" role="radiogroup" aria-label="Payment method">
            <button class="bal-pay active" data-pay="card" role="radio" aria-checked="true">
              <span class="pay-label">
                <svg width="24" height="16" viewBox="0 0 24 16" fill="none">
                  <rect x="1" y="1" width="22" height="14" rx="2" stroke="currentColor" stroke-width="1.4"/>
                  <rect x="1" y="4" width="22" height="2.6" fill="currentColor"/>
                </svg>
                Card
              </span>
            </button>
            <button class="bal-pay" data-pay="gpay" role="radio" aria-checked="false">
              <span class="pay-label">
                <svg width="16" height="16" viewBox="0 0 14 14" fill="none">
                  <path d="M7 1a6 6 0 1 0 5.92 7H7V6h7.92A7 7 0 1 1 7 0v1z" fill="currentColor"/>
                </svg>
                G Pay
              </span>
            </button>
            <button class="bal-pay" data-pay="apay" role="radio" aria-checked="false">
              <span class="pay-label">
                <svg width="14" height="16" viewBox="0 0 12 14" fill="currentColor">
                  <path d="M9.3 7.5c0-1.7 1.4-2.5 1.5-2.6-.8-1.2-2.1-1.3-2.5-1.4-1.1-.1-2.1.6-2.6.6s-1.4-.6-2.3-.6c-1.2 0-2.3.7-2.9 1.8-1.2 2.1-.3 5.2 1 6.9.6.8 1.3 1.7 2.3 1.7.9 0 1.3-.6 2.4-.6s1.4.6 2.4.6c1 0 1.6-.8 2.2-1.6.7-.9 1-1.8 1-1.9 0 0-1.9-.7-1.9-2.9zM7.6 2.4c.5-.6.8-1.4.7-2.3-.7 0-1.6.5-2.1 1.1-.5.5-.9 1.4-.8 2.2.8.1 1.7-.4 2.2-1z"/>
                </svg>
                Pay
              </span>
            </button>
          </div>

          <p class="bal-dep-section-ttl">Amount</p>
          <div class="bal-amt-row">
            <span class="pre">$</span>
            <input type="text" inputmode="decimal" placeholder="0.00" aria-label="Deposit amount">
          </div>
          <div class="bal-minmax">
            <span>min $5.00</span>
            <span>max $100,000.00</span>
          </div>

          <div class="bal-quick">
            <button type="button" data-quick="25">+$25</button>
            <button type="button" data-quick="50">+$50</button>
            <button type="button" data-quick="100">+$100</button>
            <button type="button" data-quick="500">+$500</button>
          </div>
        </div>

        <div class="bal-dep-footer">
          <button class="bal-deposit-btn" disabled>Deposit</button>
        </div>
      </div>
    `;
    document.body.appendChild(depHost);

    amtInput   = depHost.querySelector('.bal-amt-row input');
    depositBtn = depHost.querySelector('.bal-deposit-btn');
    payBtns    = depHost.querySelectorAll('.bal-pay');
    depCashEl  = depHost.querySelector('[data-dep-cash]');

    payBtns.forEach(b => {
      b.addEventListener('click', () => {
        payBtns.forEach(x => { x.classList.remove('active'); x.setAttribute('aria-checked','false'); });
        b.classList.add('active');
        b.setAttribute('aria-checked','true');
        activePay = b.dataset.pay;
      });
    });

    depHost.querySelectorAll('.bal-quick button').forEach(b => {
      b.addEventListener('click', () => {
        const add = parseFloat(b.dataset.quick);
        const cur = parseAmount(amtInput.value);
        amtInput.value = String(cur + add);
        updateDepEnabled();
      });
    });

    amtInput.addEventListener('input', updateDepEnabled);
    amtInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !depositBtn.disabled) doDeposit();
    });

    depHost.querySelector('.bal-dep-back').addEventListener('click', closeDeposit);
    depHost.querySelector('.bal-dep-close').addEventListener('click', closeDeposit);
    depScrim.addEventListener('click', closeDeposit);

    depositBtn.addEventListener('click', doDeposit);
  }

  function updateDepEnabled() {
    depositBtn.disabled = parseAmount(amtInput.value) <= 0;
  }

  function parseAmount(s) {
    const n = parseFloat(String(s || '').replace(/[^\d.]/g, ''));
    return isFinite(n) && n > 0 ? n : 0;
  }

  function doDeposit() {
    const v = parseAmount(amtInput.value);
    if (v <= 0) return;
    amtInput.blur();          // dismiss the on-screen keyboard as soon as we deposit
    writeCash(readCash() + v);
    syncDisplays();
    depositBtn.textContent = 'Deposited ✓';
    depositBtn.classList.add('success');
    depositBtn.disabled = true;
    setTimeout(() => {
      amtInput.value = '';
      depositBtn.textContent = 'Deposit';
      depositBtn.classList.remove('success');
      closeDeposit();
    }, 900);
  }

  function openBalances() {
    syncDisplays();
    popupHost.classList.add('open');
    popBackdrop.classList.add('open');
    document.querySelectorAll('.bal-pill').forEach(el => el.classList.add('open'));
    if (window.ubOverlay) window.ubOverlay('balances');
  }
  function closeBalances() {
    popupHost.classList.remove('open');
    popBackdrop.classList.remove('open');
    document.querySelectorAll('.bal-pill').forEach(el => el.classList.remove('open'));
    if (window.ubOverlay) window.ubOverlay(null);
  }

  function openDeposit() {
    closeBalances();
    syncDisplays();
    depHost.classList.add('open');
    depScrim.classList.add('open');
    document.body.classList.add('bal-dep-open');
    fitToViewport();
    setTimeout(() => amtInput && amtInput.focus({preventScroll:true}), 280);
    if (window.ubOverlay) window.ubOverlay('top-up');
  }
  function closeDeposit() {
    depHost.classList.remove('open');
    depScrim.classList.remove('open');
    document.body.classList.remove('bal-dep-open');
    resetViewport();
    if (window.ubOverlay) window.ubOverlay(null);
  }

  /* Keep the sheet (and its pinned Deposit button) within the *visible* area so
   * the footer stays above the on-screen keyboard instead of behind it. */
  function fitToViewport() {
    const vv = window.visualViewport;
    if (!vv || !depHost.classList.contains('open')) return;
    depHost.style.height = vv.height + 'px';
    depHost.style.transform = 'translateX(-50%) translateY(' + vv.offsetTop + 'px)';
  }
  function resetViewport() {
    depHost.style.height = '';
    depHost.style.transform = '';
  }

  function syncDisplays() {
    const cash = readCash(), bonus = readBonus();
    document.querySelectorAll('.bal-pill .amt').forEach(el => {
      el.textContent = fmtUSD(cash);
    });
    if (popupHost) {
      popupHost.querySelector('[data-bal-cash]').textContent  = fmtUSD(cash);
      popupHost.querySelector('[data-bal-bonus]').textContent = fmtUSD(bonus);
      popupHost.querySelector('[data-bal-total]').textContent = fmtUSD(cash + bonus);
    }
    if (depCashEl) depCashEl.textContent = fmtUSD(cash);
  }

  /* ──────────────── boot ──────────────── */
  function init() {
    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);

    replaceBalances();
    createBalancesPopup();
    createDepositScreen();

    document.addEventListener('click', (e) => {
      const trig = e.target.closest('[data-bal-action]');
      if (trig) {
        e.preventDefault();
        e.stopPropagation();
        const action = trig.dataset.balAction;
        if (action === 'deposit') {
          openDeposit();
        } else if (action === 'balance') {
          if (popupHost.classList.contains('open')) closeBalances(); else openBalances();
        }
        return;
      }
      // Click-outside-to-close for the balances dropdown
      if (popupHost.classList.contains('open') && !popupHost.contains(e.target)) {
        closeBalances();
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      if (depHost.classList.contains('open')) closeDeposit();
      else if (popupHost.classList.contains('open')) closeBalances();
    });

    window.addEventListener('storage', (e) => {
      if (e.key === KEY_CASH || e.key === KEY_BONUS) syncDisplays();
    });
    window.addEventListener(EVT, syncDisplays);

    // Reflow the deposit sheet when the keyboard shows/hides (mobile).
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', fitToViewport);
      window.visualViewport.addEventListener('scroll', fitToViewport);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
