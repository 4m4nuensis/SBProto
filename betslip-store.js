/*
 * Shared placed-bet store.
 * Persists single bets placed via the floating popup so they show up on
 * betslip.html and drive the nav/tab counters.
 *
 * Exposes window.BetslipStore:
 *   getBets()                  → array of bet objects (newest first)
 *   getCount()                 → number of placed bets
 *   addBet({selection, market, teams, odds, stake, date, time}) → bet
 *   removeBet(id)              → boolean
 *   clearAll()
 *   subscribe(fn)              → unsubscribe function
 *
 * Bet shape: { id, selection, market, teams, odds, stake, date, time, placedAt }
 *
 * Cross-page sync via the 'storage' event; same-page sync via a custom
 * 'vbet:bets-changed' event on window.
 */
(function () {
  if (window.BetslipStore) return;

  const KEY = 'vbet:bets';
  const EVT = 'vbet:bets-changed';
  const DRAFT_KEY = 'vbet:drafts';
  const DRAFT_EVT = 'vbet:drafts-changed';

  function readKey(key) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return [];
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch (_) {
      return [];
    }
  }
  function writeKey(key, evt, items) {
    try { localStorage.setItem(key, JSON.stringify(items)); }
    catch (_) { /* quota or disabled storage — ignore */ }
    window.dispatchEvent(new CustomEvent(evt, { detail: { items } }));
  }
  const read  = () => readKey(KEY);
  const write = (bets) => writeKey(KEY, EVT, bets);
  const readDrafts  = () => readKey(DRAFT_KEY);
  const writeDrafts = (d) => writeKey(DRAFT_KEY, DRAFT_EVT, d);

  function uid() {
    return 'b_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  }

  const BetslipStore = {
    getBets() {
      // newest first
      return read().slice().sort((a, b) => (b.placedAt || 0) - (a.placedAt || 0));
    },

    getCount() {
      return read().length;
    },

    addBet(bet) {
      const entry = {
        id: uid(),
        type: 'single',
        selection: String(bet.selection || '—'),
        market:    String(bet.market    || 'Match Result'),
        teams:     String(bet.teams     || ''),
        odds:      Number(bet.odds)  || 0,
        stake:     Number(bet.stake) || 0,
        date:      String(bet.date  || ''),
        time:      String(bet.time  || ''),
        placedAt:  Date.now(),
      };
      const bets = read();
      bets.push(entry);
      write(bets);
      return entry;
    },

    /* Add a multiple (accumulator) bet — one ticket, many legs. */
    addMultiBet(input) {
      const rawLegs = Array.isArray(input && input.legs) ? input.legs : [];
      const legs = rawLegs.map(l => ({
        selection: String(l.selection || '—'),
        market:    String(l.market    || 'Match Result'),
        teams:     String(l.teams     || ''),
        odds:      Number(l.odds) || 0,
        date:      String(l.date || ''),
        time:      String(l.time || ''),
      }));
      const totalOdds = legs.reduce((acc, l) => acc * (l.odds || 1), 1);
      const entry = {
        id: uid(),
        type: 'multi',
        legs,
        stake: Number(input && input.stake) || 0,
        totalOdds,
        placedAt: Date.now(),
      };
      const bets = read();
      bets.push(entry);
      write(bets);
      return entry;
    },

    removeBet(id) {
      const bets = read();
      const next = bets.filter(b => b.id !== id);
      if (next.length === bets.length) return false;
      write(next);
      return true;
    },

    clearAll() {
      write([]);
    },

    subscribe(fn) {
      if (typeof fn !== 'function') return function () {};
      const sameTab = () => fn(BetslipStore.getBets());
      const crossTab = (e) => { if (e.key === KEY) fn(BetslipStore.getBets()); };
      window.addEventListener(EVT, sameTab);
      window.addEventListener('storage', crossTab);
      return function () {
        window.removeEventListener(EVT, sameTab);
        window.removeEventListener('storage', crossTab);
      };
    },

    /* ─── drafts (betslip queue, not yet placed) ─────────────────────────── */
    getDrafts() {
      // oldest first — drafts are reviewed in tap order
      return readDrafts().slice().sort((a, b) => (a.queuedAt || 0) - (b.queuedAt || 0));
    },

    getDraftCount() {
      return readDrafts().length;
    },

    addDraft(bet) {
      const entry = {
        id: uid(),
        selection: String(bet.selection || '—'),
        market:    String(bet.market    || 'Match Result'),
        teams:     String(bet.teams     || ''),
        odds:      Number(bet.odds)  || 0,
        stake:     Number(bet.stake) || 0,
        date:      String(bet.date  || ''),
        time:      String(bet.time  || ''),
        queuedAt:  Date.now(),
      };
      const drafts = readDrafts();
      drafts.push(entry);
      writeDrafts(drafts);
      return entry;
    },

    removeDraft(id) {
      const drafts = readDrafts();
      const next = drafts.filter(d => d.id !== id);
      if (next.length === drafts.length) return false;
      writeDrafts(next);
      return true;
    },

    clearDrafts() {
      writeDrafts([]);
    },

    /* Confirm all drafts: move them to placed bets, clear drafts. */
    placeDrafts() {
      const drafts = readDrafts();
      if (!drafts.length) return [];
      const placed = read();
      const placedAt = Date.now();
      const moved = drafts.map(d => ({
        id: uid(),
        selection: d.selection,
        market:    d.market,
        teams:     d.teams,
        odds:      d.odds,
        stake:     d.stake,
        date:      d.date,
        time:      d.time,
        placedAt,
      }));
      write(placed.concat(moved));
      writeDrafts([]);
      return moved;
    },

    subscribeDrafts(fn) {
      if (typeof fn !== 'function') return function () {};
      const sameTab = () => fn(BetslipStore.getDrafts());
      const crossTab = (e) => { if (e.key === DRAFT_KEY) fn(BetslipStore.getDrafts()); };
      window.addEventListener(DRAFT_EVT, sameTab);
      window.addEventListener('storage', crossTab);
      return function () {
        window.removeEventListener(DRAFT_EVT, sameTab);
        window.removeEventListener('storage', crossTab);
      };
    },
  };

  window.BetslipStore = BetslipStore;
})();
