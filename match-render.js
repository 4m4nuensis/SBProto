/*
 * Dynamic match detail renderer.
 *
 * Reads ?id=<matchId> from the URL, looks the match up in window.VBET_DATA
 * (data/catalog.js), and fills match.html's mount points:
 *   #event-main   — team logos / names / score-pill (+ football live stats)
 *   #market-tabs  — sport-appropriate decorative tab labels
 *   #markets      — the full collapsible market list, priced per sport
 *
 * The market DOM matches the former live/prematch templates
 * (.market / .title-row / .body / .opts / .opt / .l / .o and .otbl grids), so
 * betslip-popup.js keeps working unchanged. Two hidden .bnr-tn spans carry the
 * team names so a market-result bet resolves the real teams in the betslip.
 *
 * The Poisson/odds logic was ported from the project's former Python match
 * generators, with new market builders added for basketball / tennis / hockey.
 */
(function () {
  var D = window.VBET_DATA;
  if (!D) { return; }

  /* ───────────────────────── math helpers ───────────────────────── */
  function r2(x) { return Math.round(x * 100) / 100; }
  function fmt(o) { return (Math.round(o * 100) / 100).toFixed(2); }
  function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }
  function odd(p, margin) { return clamp(1 / Math.max(p, 0.0001) * (margin || 1.05), 1.01, 25); }

  // Deterministic per-match RNG so a page looks the same on every load.
  function rng(seed) {
    var s = seed >>> 0;
    return function () {
      s |= 0; s = (s + 0x6D2B79F5) | 0;
      var t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function jit(rand, lo, hi) { return r2(lo + rand() * (hi - lo)); }

  function fact(n) { var f = 1; for (var i = 2; i <= n; i++) f *= i; return f; }
  function poissonPmf(k, lam) { return Math.exp(-lam) * Math.pow(lam, k) / fact(k); }
  function poissonTail(k, lam) { // P(X >= k)
    if (k <= 0) return 1;
    var s = 0; for (var i = 0; i < k; i++) s += poissonPmf(i, lam);
    return Math.max(0, 1 - s);
  }
  function erf(x) {
    var t = 1 / (1 + 0.3275911 * Math.abs(x));
    var y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
    return x >= 0 ? y : -y;
  }
  function normCdf(z) { return 0.5 * (1 + erf(z / Math.SQRT2)); }

  function fmtl(line) { // handicap line: -0.75, +1, 0
    if (line === 0) return '0';
    var sign = line < 0 ? '-' : '+';
    var v = Math.abs(line);
    return v === Math.floor(v) ? sign + v : sign + v;
  }
  function fmtTotal(line) { return line === Math.floor(line) ? String(line) : String(line); }

  // normalise a sport's probability anchor into implied (vig-free) probabilities
  function probs3(a) {
    var p1 = 1 / a['1'], px = 1 / a['x'], p2 = 1 / a['2'], s = p1 + px + p2;
    return { p1: p1 / s, px: px / s, p2: p2 / s };
  }
  function probs2(a) {
    var p1 = 1 / a['1'], p2 = 1 / a['2'], s = p1 + p2;
    return { p1: p1 / s, p2: p2 / s };
  }

  /* ───────────────────────── market spec → HTML ─────────────────────────
   * spec = { title, key, badge?, body }
   *   body = { type:'opts', col, opts:[{l,o,sel}] }
   *        | { type:'otbl', cols, header:[{text}|{empty}], rows:[[ item ]] }
   *            item = { lbl } | { o, center?, lr?, line?, sel? }
   */
  var PIN = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M4 2h8v6l-4 4-4-4z"/></svg>';
  var CHEV = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M4 10l4-4 4 4"/></svg>';

  function renderOpts(b) {
    return '<div class="opts">' + b.opts.map(function (op) {
      return '<button class="opt' + (b.col ? ' col' : '') + (op.sel ? ' selected' : '') + '">' +
        '<span class="l">' + op.l + '</span><span class="o">' + fmt(op.o) + '</span></button>';
    }).join('') + '</div>';
  }
  function renderOtbl(b) {
    var h = '<div class="otbl ' + b.cols + '">';
    b.header.forEach(function (c) { h += c.empty ? '<div class="lbl"></div>' : '<div class="h">' + c.text + '</div>'; });
    b.rows.forEach(function (row) {
      row.forEach(function (it) {
        if (it.lbl !== undefined) { h += '<div class="lbl">' + it.lbl + '</div>'; return; }
        var cls = 'cell' + (it.center ? ' center' : '') + (it.lr ? ' lr' : '') + (it.sel ? ' selected' : '');
        var inner = (it.lr && it.line != null)
          ? '<span class="lbl-inline l">' + it.line + '</span><span class="o">' + fmt(it.o) + '</span>'
          : '<span class="o">' + fmt(it.o) + '</span>';
        h += '<button class="' + cls + '">' + inner + '</button>';
      });
    });
    return h + '</div>';
  }
  function renderMarket(spec, collapsed) {
    var badge = spec.badge ? '<span class="badge">' + spec.badge + '</span>' : '';
    var body = spec.body.type === 'opts' ? renderOpts(spec.body) : renderOtbl(spec.body);
    return '<div class="market' + (collapsed ? ' collapsed' : '') + '" data-market="' + spec.key + '">' +
      '<div class="title-row"><div class="left">' +
      '<button class="pin" aria-label="pin" onclick="event.stopPropagation()">' + PIN + '</button>' +
      '<span class="title">' + spec.title + '</span>' + badge + '</div>' +
      '<button class="chev">' + CHEV + '</button></div>' +
      '<div class="body">' + body + '</div></div>';
  }

  // shared shapes
  function optsRow(opts, col) { return { type: 'opts', col: !!col, opts: opts }; }
  function ouLadder(lines, headerL, headerR, priceOver, selIdx) {
    // generic Over/Under table (cols-3): label col + Over + Under
    var rows = lines.map(function (line, i) {
      var po = priceOver(line);
      return [
        { lbl: fmtTotal(line) },
        { o: odd(po, 1.05), center: true, sel: i === selIdx },
        { o: odd(1 - po, 1.05), center: true }
      ];
    });
    return { type: 'otbl', cols: 'cols-3', header: [{ empty: true }, { text: headerL }, { text: headerR }], rows: rows };
  }

  /* ═══════════════════════ FOOTBALL ═══════════════════════ */
  function buildFootball(m) {
    var rand = rng(m.seed), pr = probs3(m.anchor), p1 = pr.p1, px = pr.px, p2 = pr.p2;
    var live = m.status === 'live' && m.live;
    var goals = live ? (m.live.score[0] + m.live.score[1]) : 0;
    var minute = live ? (parseInt((m.live.clock || '').replace(/\D/g, ''), 10) || 45) : 0;
    var remaining = Math.max(0, (90 - Math.min(minute, 90)) / 90);
    var lam = live ? Math.max(0.05, 2.7 * remaining) : 2.7;
    var diff = live ? (m.live.score[0] - m.live.score[1]) : 0;
    var home = m.home.short, away = m.away.short;
    var out = [];

    // 1) Match Result
    out.push({ title: 'Match Result', key: 'match-result',
      body: optsRow([{ l: '1', o: m.anchor['1'] }, { l: 'X', o: m.anchor['x'] }, { l: '2', o: m.anchor['2'] }]) });

    // 2) Double Chance
    out.push({ title: 'Double Chance', key: 'double-chance',
      body: optsRow([
        { l: '1X', o: r2(1 / ((p1 + px) * 1.06)) },
        { l: '12', o: r2(1 / ((p1 + p2) * 1.06)) },
        { l: 'X2', o: r2(1 / ((px + p2) * 1.06)) }
      ], true) });

    // 3) Total Goals O/U
    var baseLines = [0.5, 1.5, 2.5, 3.5, 4.5, 5.5], selT = -1;
    var totals = baseLines.map(function (line, i) {
      var po;
      if (live && line < goals) { po = 0.99; }
      else { var need = Math.max(1, Math.ceil(line - goals - 1e-9)); po = clamp(poissonTail(need, lam), 0.005, 0.995); }
      if (selT === -1 && po <= 0.6 && po >= 0.35) selT = i;
      return { line: line, po: po };
    });
    if (selT === -1) selT = 2;
    out.push({ title: 'Total Goals', key: 'total-goals',
      body: ouLadder(baseLines, 'Over', 'Under', function (line) {
        var t = totals[baseLines.indexOf(line)]; return t.po;
      }, selT) });

    // 4) Goals Asian Handicap
    var centre = -diff - 0.25 - (p1 - p2) * 1.5;
    var hl = [], seen = {};
    [-1.25, -0.75, -0.25, 0.25, 0.75, 1.25].forEach(function (off) {
      var lh = Math.round((centre + off) * 4) / 4;
      if (!seen[lh] && Math.abs(lh) <= 3) { seen[lh] = 1; hl.push(lh); }
    });
    hl.sort(function (a, b) { return b - a; });
    var ahSel = -1;
    var ahRows = hl.map(function (lh, i) {
      var ph = clamp(p1 + (centre - lh) * 0.18, 0.1, 0.9);
      if (ahSel === -1 && lh <= centre) ahSel = i;
      return [
        { o: odd(ph, 1.05), lr: true, line: fmtl(lh), sel: i === ahSel },
        { o: odd(1 - ph + 0.02, 1.05), lr: true, line: fmtl(-lh) }
      ];
    });
    out.push({ title: 'Goals Asian Handicap', key: 'asian-handicap',
      body: { type: 'otbl', cols: 'cols-2', header: [{ text: home }, { text: away }], rows: ahRows } });

    // 5) Total Goals 3 Way
    var t3wLines = live ? [Math.max(goals + 1, 2), Math.max(goals + 2, 3), Math.max(goals + 3, 4), Math.max(goals + 4, 5)] : [2, 3, 4, 5];
    var t3wSel = -1;
    var t3wRows = t3wLines.map(function (line, i) {
      var need = line - goals, po, pe;
      if (need <= 0) { po = 0.93; pe = 0.04; } else { pe = poissonPmf(need, lam); po = poissonTail(need + 1, lam); }
      var pu = Math.max(0.005, 1 - po - pe);
      if (t3wSel === -1 && po >= 0.35 && po <= 0.6) t3wSel = i;
      return [
        { lbl: fmtTotal(line) },
        { o: odd(po, 1.07), center: true, sel: i === t3wSel },
        { o: odd(pe, 1.10), center: true },
        { o: odd(pu, 1.07), center: true }
      ];
    });
    out.push({ title: 'Total Goals 3 Way', key: 'total-3way',
      body: { type: 'otbl', cols: 'cols-4', header: [{ empty: true }, { text: 'Over' }, { text: 'Exactly' }, { text: 'Under' }], rows: t3wRows } });

    // 6) Both Teams To Score
    var pBtts;
    if (live && m.live.score[0] >= 1 && m.live.score[1] >= 1) { pBtts = 0.985; }
    else if (live) { pBtts = 0.45 + remaining * 0.2; } else { pBtts = 0.52 + (p1 - p2) * 0.05; }
    out.push({ title: 'Both Teams To Score', key: 'btts',
      body: optsRow([{ l: 'Yes', o: odd(pBtts, 1.05) }, { l: 'No', o: odd(1 - pBtts, 1.05) }], true) });

    // 7) prematch-only: Correct Score
    if (!live) {
      var lamH = lam * p1 * 1.4, lamA = lam * p2 * 1.4, scores = [];
      for (var hh = 0; hh < 5; hh++) for (var aa = 0; aa < 5; aa++) scores.push([hh, aa, poissonPmf(hh, lamH) * poissonPmf(aa, lamA)]);
      scores.sort(function (a, b) { return b[2] - a[2]; });
      var top = scores.slice(0, 12);
      var hw = top.filter(function (s) { return s[0] > s[1]; });
      var ot = top.filter(function (s) { return s[0] <= s[1]; });
      var n = Math.max(hw.length, ot.length), csRows = [];
      for (var i = 0; i < n; i++) {
        var L = hw[i], R = ot[i], row = [];
        row.push(L ? { o: clamp(1 / Math.max(L[2], 0.005) * 1.15, 1.01, 50), lr: true, line: L[0] + '-' + L[1] } : { lbl: '' });
        row.push(R ? { o: clamp(1 / Math.max(R[2], 0.005) * 1.15, 1.01, 50), lr: true, line: R[0] + '-' + R[1] } : { lbl: '' });
        csRows.push(row);
      }
      out.push({ title: 'Correct Score', key: 'correct-score',
        body: { type: 'otbl', cols: 'cols-2', header: [{ text: home + ' win' }, { text: away + ' / Draw' }], rows: csRows } });

      // 8) Half Time / Full Time
      var htft = [
        ['1/1', jit(rand, 1.5 * m.anchor['1'], 2.2 * m.anchor['1'])], ['1/X', jit(rand, 12, 20)], ['1/2', jit(rand, 30, 50)],
        ['X/1', jit(rand, 3.5, 5.5)], ['X/X', jit(rand, 4.5, 6.5)], ['X/2', jit(rand, 6, 10)],
        ['2/1', jit(rand, 15, 25)], ['2/X', jit(rand, 12, 18)], ['2/2', jit(rand, 2.5 * m.anchor['2'], 3.5 * m.anchor['2'])]
      ];
      var htftRows = [];
      for (var k = 0; k < htft.length; k += 3) {
        htftRows.push(htft.slice(k, k + 3).map(function (e) { return { o: e[1], lr: true, line: e[0] }; }));
      }
      out.push({ title: 'Half Time / Full Time', key: 'htft',
        body: { type: 'otbl', cols: 'cols-3w', header: [{ text: 'HT/FT' }, { text: 'HT/FT' }, { text: 'HT/FT' }], rows: htftRows } });
    }

    // 9) First Team To Score
    var ftH, ftA, ftN;
    if (goals === 0) { ftH = odd(p1 * 0.95, 1.05); ftA = odd(p2 * 0.95, 1.05); ftN = jit(rand, 11, 18); }
    else { ftH = jit(rand, 1.01, 1.05); ftA = jit(rand, 8, 15); ftN = jit(rand, 15, 25); }
    out.push({ title: 'First Team To Score', key: 'first-score', badge: 'New',
      body: optsRow([{ l: home, o: ftH }, { l: 'No Goal', o: ftN }, { l: away, o: ftA }], true) });

    // 10) Goals In Both Halves
    var bhY = live && minute >= 45 ? jit(rand, 4, 7) : jit(rand, 1.65, 1.95);
    out.push({ title: 'Goals In Both Halves', key: 'both-halves', badge: 'New',
      body: optsRow([{ l: 'Yes', o: bhY }, { l: 'No', o: r2(1 / Math.max(1 - 1 / (bhY * 1.05), 0.1) * 1.05) }], true) });

    // 11) live-only: Goal Time Intervals
    if (live) {
      var intervals = [], cur = Math.max(minute, 1);
      while (cur < 90 && intervals.length < 3) {
        var end = Math.min(90, cur + 7);
        intervals.push([cur + "'-" + end + "'", jit(rand, 1.95, 2.85)]);
        cur = end + 1;
      }
      intervals.push(['No more goals', jit(rand, 1.95, 4.5)]);
      out.push({ title: 'Goal Time Intervals', key: 'goal-intervals',
        body: { type: 'otbl', cols: 'cols-2', header: [{ text: 'Interval' }, { text: 'Odds' }],
          rows: intervals.map(function (e) { return [{ lbl: e[0] }, { o: e[1], center: true }]; }) } });
    }
    return out;
  }

  /* ═══════════════════════ BASKETBALL ═══════════════════════ */
  function buildBasketball(m) {
    var rand = rng(m.seed), pr = probs2(m.anchor), p1 = pr.p1, p2 = pr.p2;
    var home = m.home.short, away = m.away.short;
    // league-specific scoring level
    var muT = m.league === 'nba' ? 224 : (m.league === 'lkl' ? 168 : 162);
    var sdT = muT > 200 ? 18 : 14;
    var mu = (p1 - p2) * 24;              // expected home margin
    var sdM = 13;
    var out = [];

    // 1) Match Result
    out.push({ title: 'Match Result', key: 'match-result',
      body: optsRow([{ l: home, o: m.anchor['1'] }, { l: away, o: m.anchor['2'] }], true) });

    // 2) Handicap (point spread)
    var centre = Math.round(-mu * 2) / 2, hSel = -1;
    var spRows = [-3, -1.5, 0, 1.5, 3].map(function (off, i) {
      var lh = centre + off; // home gives |lh|
      var ph = clamp(normCdf((mu + lh) / sdM), 0.05, 0.95);
      if (hSel === -1 && lh <= centre) hSel = i;
      return [{ o: odd(ph, 1.05), lr: true, line: fmtl(lh), sel: i === hSel },
              { o: odd(1 - ph, 1.05), lr: true, line: fmtl(-lh) }];
    });
    out.push({ title: 'Handicap', key: 'handicap',
      body: { type: 'otbl', cols: 'cols-2', header: [{ text: home }, { text: away }], rows: spRows } });

    // 3) Total Points
    var tLines = [muT - 8.5, muT - 4.5, muT - 0.5, muT + 3.5, muT + 7.5], tSel = 2;
    out.push({ title: 'Total Points', key: 'total-points',
      body: ouLadder(tLines, 'Over', 'Under', function (line) { return 1 - normCdf((line - muT) / sdT); }, tSel) });

    // 4) 1st Half Money Line (regressed toward even)
    var h1 = clamp(0.5 + (p1 - 0.5) * 0.85, 0.05, 0.95);
    out.push({ title: '1st Half - Money Line', key: 'h1-money',
      body: optsRow([{ l: home, o: odd(h1, 1.06) }, { l: away, o: odd(1 - h1, 1.06) }], true) });

    // 5) Total Points (1st Half)
    var muH = Math.round((muT / 2) * 2) / 2;
    out.push({ title: '1st Half - Total Points', key: 'h1-total',
      body: ouLadder([muH - 4.5, muH - 0.5, muH + 3.5], 'Over', 'Under', function (line) { return 1 - normCdf((line - muH) / (sdT * 0.72)); }, 1) });

    // 6) Highest Scoring Half
    out.push({ title: 'Highest Scoring Half', key: 'high-half',
      body: optsRow([{ l: '1st Half', o: jit(rand, 1.95, 2.15) }, { l: '2nd Half', o: jit(rand, 1.80, 1.95) }, { l: 'Equal', o: jit(rand, 12, 18) }], true) });

    // 7) Total Points Odd/Even
    out.push({ title: 'Total Points Odd/Even', key: 'odd-even',
      body: optsRow([{ l: 'Odd', o: jit(rand, 1.90, 1.95) }, { l: 'Even', o: jit(rand, 1.90, 1.95) }], true) });

    // 8) Race to 20 points
    out.push({ title: 'Race to 20 Points', key: 'race-20', badge: 'New',
      body: optsRow([{ l: home, o: odd(clamp(0.5 + (p1 - 0.5) * 0.8, 0.05, 0.95), 1.06) }, { l: away, o: odd(clamp(0.5 + (p2 - 0.5) * 0.8, 0.05, 0.95), 1.06) }], true) });
    return out;
  }

  /* ═══════════════════════ TENNIS (Bo3) ═══════════════════════ */
  function solveSetProb(pMatch) { // invert P(win Bo3)=q^2(3-2q)
    var lo = 0.001, hi = 0.999;
    for (var i = 0; i < 40; i++) { var q = (lo + hi) / 2; (q * q * (3 - 2 * q) < pMatch) ? (lo = q) : (hi = q); }
    return (lo + hi) / 2;
  }
  function buildTennis(m) {
    var rand = rng(m.seed), pr = probs2(m.anchor), p1 = pr.p1, p2 = pr.p2;
    var P1 = m.home.short, P2 = m.away.short;
    var q = solveSetProb(p1);                       // P(home wins a set)
    var p20 = q * q, p21 = 2 * q * q * (1 - q), p02 = (1 - q) * (1 - q), p12 = 2 * (1 - q) * (1 - q) * q;
    var p3sets = p21 + p12;                          // match goes the distance
    var out = [];

    // 1) Match Result
    out.push({ title: 'Match Result', key: 'match-result',
      body: optsRow([{ l: P1, o: m.anchor['1'] }, { l: P2, o: m.anchor['2'] }], true) });

    // 2) Set Betting
    out.push({ title: 'Set Betting', key: 'set-betting',
      body: { type: 'otbl', cols: 'cols-2', header: [{ text: P1 }, { text: P2 }], rows: [
        [{ o: odd(p20, 1.08), lr: true, line: '2-0' }, { o: odd(p02, 1.08), lr: true, line: '0-2' }],
        [{ o: odd(p21, 1.08), lr: true, line: '2-1' }, { o: odd(p12, 1.08), lr: true, line: '1-2' }]
      ] } });

    // 3) Total Games
    var muG = clamp(20.5 + (1 - Math.abs(p1 - p2)) * 3.5, 20.5, 24.5), sdG = 4;
    var gLines = [muG - 2, muG - 1, muG, muG + 1, muG + 2].map(function (x) { return Math.round(x) + 0.5; });
    out.push({ title: 'Total Games', key: 'total-games',
      body: ouLadder(gLines, 'Over', 'Under', function (line) { return 1 - normCdf((line - muG) / sdG); }, 2) });

    // 4) Games Handicap
    var cg = Math.round(-(p1 - p2) * 8) + 0.5 * (p1 >= p2 ? -1 : 1);
    var gh = [cg - 2, cg, cg + 2].map(function (x) { return Math.round(x * 2) / 2; });
    var ghSel = -1;
    var ghRows = gh.map(function (lh, i) {
      var ph = clamp(0.5 + (p1 - 0.5) - lh * 0.05, 0.08, 0.92);
      if (ghSel === -1 && ph <= 0.55) ghSel = i;
      return [{ o: odd(ph, 1.06), lr: true, line: fmtl(lh), sel: i === ghSel }, { o: odd(1 - ph, 1.06), lr: true, line: fmtl(-lh) }];
    });
    out.push({ title: 'Games Handicap', key: 'games-handicap',
      body: { type: 'otbl', cols: 'cols-2', header: [{ text: P1 }, { text: P2 }], rows: ghRows } });

    // 5) Total Sets (Over/Under 2.5 == will there be a 3rd set)
    out.push({ title: 'Total Sets', key: 'total-sets',
      body: optsRow([{ l: 'Over 2.5', o: odd(p3sets, 1.06) }, { l: 'Under 2.5', o: odd(1 - p3sets, 1.06) }], true) });

    // 6) First Set Winner (closer to even than match)
    var fs = clamp(0.5 + (p1 - 0.5) * 0.9, 0.08, 0.92);
    out.push({ title: 'First Set Winner', key: 'first-set',
      body: optsRow([{ l: P1, o: odd(fs, 1.05) }, { l: P2, o: odd(1 - fs, 1.05) }], true) });
    return out;
  }

  /* ═══════════════════════ ICE HOCKEY ═══════════════════════ */
  function buildHockey(m) {
    var rand = rng(m.seed), pr = probs3(m.anchor), p1 = pr.p1, px = pr.px, p2 = pr.p2;
    var live = m.status === 'live' && m.live;
    var goals = live ? (m.live.score[0] + m.live.score[1]) : 0;
    var lam = 5.6;                                   // full-game total goals
    var home = m.home.short, away = m.away.short;
    var out = [];

    // 1) Match Result (3-Way, regulation)
    out.push({ title: 'Match Result', key: 'match-result',
      body: optsRow([{ l: '1', o: m.anchor['1'] }, { l: 'X', o: m.anchor['x'] }, { l: '2', o: m.anchor['2'] }]) });

    // 2) Money Line (incl. OT) — split the draw
    var mlH = clamp(p1 + px * 0.5, 0.05, 0.95);
    out.push({ title: 'Money Line (incl. OT)', key: 'money-line',
      body: optsRow([{ l: home, o: odd(mlH, 1.05) }, { l: away, o: odd(1 - mlH, 1.05) }], true) });

    // 3) Puck Line ±1.5
    var pHm15 = clamp(mlH - 0.22, 0.05, 0.9);        // home wins by 2+
    out.push({ title: 'Puck Line', key: 'puck-line',
      body: { type: 'otbl', cols: 'cols-2', header: [{ text: home }, { text: away }], rows: [
        [{ o: odd(pHm15, 1.06), lr: true, line: '-1.5', sel: true }, { o: odd(1 - pHm15, 1.06), lr: true, line: '+1.5' }],
        [{ o: odd(clamp(mlH + 0.22, 0.1, 0.95), 1.06), lr: true, line: '+1.5' }, { o: odd(clamp(1 - mlH - 0.22, 0.05, 0.9), 1.06), lr: true, line: '-1.5' }]
      ] } });

    // 4) Total Goals O/U
    var tLines = [3.5, 4.5, 5.5, 6.5, 7.5], tSel = -1;
    var rem = live ? Math.max(goals, 0) : 0;
    out.push({ title: 'Total Goals', key: 'total-goals',
      body: ouLadder(tLines, 'Over', 'Under', function (line) {
        var need = Math.max(1, Math.ceil(line - rem - 1e-9));
        var po = clamp(poissonTail(need, Math.max(0.2, lam - (live ? rem * 0.4 : 0))), 0.02, 0.98);
        if (tSel === -1 && po <= 0.6 && po >= 0.4) tSel = tLines.indexOf(line);
        return po;
      }, 2) });

    // 5) Both Teams To Score
    out.push({ title: 'Both Teams To Score', key: 'btts',
      body: optsRow([{ l: 'Yes', o: jit(rand, 1.30, 1.45) }, { l: 'No', o: jit(rand, 2.70, 3.20) }], true) });

    // 6) Total Goals 3 Way
    var t3wRows = [4, 5, 6, 7].map(function (line, i) {
      var pe = poissonPmf(line, lam), po = poissonTail(line + 1, lam), pu = Math.max(0.005, 1 - po - pe);
      return [{ lbl: fmtTotal(line) }, { o: odd(po, 1.07), center: true, sel: i === 1 }, { o: odd(pe, 1.10), center: true }, { o: odd(pu, 1.07), center: true }];
    });
    out.push({ title: 'Total Goals 3 Way', key: 'total-3way',
      body: { type: 'otbl', cols: 'cols-4', header: [{ empty: true }, { text: 'Over' }, { text: 'Exactly' }, { text: 'Under' }], rows: t3wRows } });

    // 7) 1st Period Result (draw heavily favoured)
    out.push({ title: '1st Period Result', key: 'p1-result', badge: 'New',
      body: optsRow([{ l: '1', o: jit(rand, 3.4, 4.2) }, { l: 'X', o: jit(rand, 2.1, 2.5) }, { l: '2', o: jit(rand, 3.6, 4.4) }], true) });
    return out;
  }

  /* ═══════════════════════ BASEBALL ═══════════════════════ */
  function buildBaseball(m) {
    var rand = rng(m.seed), pr = probs2(m.anchor), p1 = pr.p1, p2 = pr.p2;
    var home = m.home.short, away = m.away.short;
    var muR = 8.5, sdR = 3.0;
    var out = [];

    // 1) Match Result
    out.push({ title: 'Match Result', key: 'match-result',
      body: optsRow([{ l: home, o: m.anchor['1'] }, { l: away, o: m.anchor['2'] }], true) });

    // 2) Run Line ±1.5
    var pHm15 = clamp(p1 - 0.20, 0.05, 0.9);          // home wins by 2+
    out.push({ title: 'Run Line', key: 'run-line',
      body: { type: 'otbl', cols: 'cols-2', header: [{ text: home }, { text: away }], rows: [
        [{ o: odd(pHm15, 1.06), lr: true, line: '-1.5', sel: true }, { o: odd(1 - pHm15, 1.06), lr: true, line: '+1.5' }],
        [{ o: odd(clamp(p1 + 0.20, 0.1, 0.95), 1.06), lr: true, line: '+1.5' }, { o: odd(clamp(1 - p1 - 0.20, 0.05, 0.9), 1.06), lr: true, line: '-1.5' }]
      ] } });

    // 3) Total Runs
    out.push({ title: 'Total Runs', key: 'total-runs',
      body: ouLadder([7.5, 8.5, 9.5, 10.5], 'Over', 'Under', function (line) { return 1 - normCdf((line - muR) / sdR); }, 1) });

    // 4) 1st 5 Innings - Money Line
    var f5 = clamp(0.5 + (p1 - 0.5) * 0.9, 0.05, 0.95);
    out.push({ title: '1st 5 Innings - Money Line', key: 'f5-ml',
      body: optsRow([{ l: home, o: odd(f5, 1.06) }, { l: away, o: odd(1 - f5, 1.06) }], true) });

    // 5) Total Runs Odd/Even
    out.push({ title: 'Total Runs Odd/Even', key: 'runs-oe',
      body: optsRow([{ l: 'Odd', o: jit(rand, 1.90, 1.95) }, { l: 'Even', o: jit(rand, 1.90, 1.95) }], true) });
    return out;
  }

  /* ═══════════════════════ AMERICAN FOOTBALL ═══════════════════════ */
  function buildAmFootball(m) {
    var rand = rng(m.seed), pr = probs2(m.anchor), p1 = pr.p1, p2 = pr.p2;
    var home = m.home.short, away = m.away.short;
    var muT = 44, sdT = 11, mu = (p1 - p2) * 16, sdM = 11;
    var out = [];

    // 1) Match Result
    out.push({ title: 'Match Result', key: 'match-result',
      body: optsRow([{ l: home, o: m.anchor['1'] }, { l: away, o: m.anchor['2'] }], true) });

    // 2) Handicap (point spread)
    var centre = Math.round(-mu * 2) / 2, hSel = -1;
    var spRows = [-7, -3.5, 0, 3.5, 7].map(function (off, i) {
      var lh = centre + off;
      var ph = clamp(normCdf((mu + lh) / sdM), 0.05, 0.95);
      if (hSel === -1 && lh <= centre) hSel = i;
      return [{ o: odd(ph, 1.05), lr: true, line: fmtl(lh), sel: i === hSel },
              { o: odd(1 - ph, 1.05), lr: true, line: fmtl(-lh) }];
    });
    out.push({ title: 'Handicap', key: 'handicap',
      body: { type: 'otbl', cols: 'cols-2', header: [{ text: home }, { text: away }], rows: spRows } });

    // 3) Total Points
    out.push({ title: 'Total Points', key: 'total-points',
      body: ouLadder([muT - 7.5, muT - 3.5, muT + 0.5, muT + 4.5, muT + 8.5], 'Over', 'Under', function (line) { return 1 - normCdf((line - muT) / sdT); }, 2) });

    // 4) 1st Half - Money Line
    var h1 = clamp(0.5 + (p1 - 0.5) * 0.88, 0.05, 0.95);
    out.push({ title: '1st Half - Money Line', key: 'h1-money',
      body: optsRow([{ l: home, o: odd(h1, 1.06) }, { l: away, o: odd(1 - h1, 1.06) }], true) });

    // 5) 1st Half - Total Points
    var muH = Math.round((muT / 2) * 2) / 2;
    out.push({ title: '1st Half - Total Points', key: 'h1-total',
      body: ouLadder([muH - 3.5, muH + 0.5, muH + 4.5], 'Over', 'Under', function (line) { return 1 - normCdf((line - muH) / (sdT * 0.72)); }, 1) });

    // 6) Highest Scoring Half
    out.push({ title: 'Highest Scoring Half', key: 'high-half',
      body: optsRow([{ l: '1st Half', o: jit(rand, 1.95, 2.15) }, { l: '2nd Half', o: jit(rand, 1.80, 1.95) }, { l: 'Equal', o: jit(rand, 13, 19) }], true) });

    // 7) Total Points Odd/Even
    out.push({ title: 'Total Points Odd/Even', key: 'odd-even',
      body: optsRow([{ l: 'Odd', o: jit(rand, 1.90, 1.95) }, { l: 'Even', o: jit(rand, 1.90, 1.95) }], true) });
    return out;
  }

  /* ═══════════════════════ BOXING ═══════════════════════ */
  function buildBoxing(m) {
    var rand = rng(m.seed), pr = probs3(m.anchor), p1 = pr.p1, p2 = pr.p2;
    var A = m.home.short, B = m.away.short;
    var out = [];

    // 1) Match Result (3-way: incl. Draw)
    out.push({ title: 'Match Result', key: 'match-result',
      body: optsRow([{ l: '1', o: m.anchor['1'] }, { l: 'X', o: m.anchor['x'] }, { l: '2', o: m.anchor['2'] }]) });

    // 2) Method of Victory
    out.push({ title: 'Method of Victory', key: 'method', badge: 'New',
      body: { type: 'otbl', cols: 'cols-2', header: [{ text: A }, { text: B }], rows: [
        [{ o: odd(p1 * 0.55, 1.10), lr: true, line: 'KO/TKO' }, { o: odd(p2 * 0.55, 1.10), lr: true, line: 'KO/TKO' }],
        [{ o: odd(p1 * 0.45, 1.10), lr: true, line: 'Decision' }, { o: odd(p2 * 0.45, 1.10), lr: true, line: 'Decision' }]
      ] } });

    // 3) Total Rounds (scheduled ≈ 12)
    out.push({ title: 'Total Rounds', key: 'total-rounds',
      body: ouLadder([6.5, 8.5, 9.5, 10.5], 'Over', 'Under', function (line) { return 1 - normCdf((line - 8.5) / 2.5); }, 1) });

    // 4) To Go The Distance
    var pDist = clamp(0.42 + (1 - Math.abs(p1 - p2)) * 0.16, 0.2, 0.8);
    out.push({ title: 'To Go The Distance', key: 'distance',
      body: optsRow([{ l: 'Yes', o: odd(pDist, 1.06) }, { l: 'No', o: odd(1 - pDist, 1.06) }], true) });

    // 5) Round Group (when does it end)
    out.push({ title: 'Grouped Round Betting', key: 'round-group',
      body: { type: 'otbl', cols: 'cols-2', header: [{ text: 'Rounds' }, { text: 'Odds' }], rows: [
        [{ lbl: 'Rounds 1-3' }, { o: jit(rand, 5.0, 8.0), center: true }],
        [{ lbl: 'Rounds 4-6' }, { o: jit(rand, 4.0, 6.5), center: true }],
        [{ lbl: 'Rounds 7-9' }, { o: jit(rand, 4.0, 6.5), center: true }],
        [{ lbl: 'Rounds 10-12' }, { o: jit(rand, 4.5, 7.0), center: true }],
        [{ lbl: 'Points Decision' }, { o: jit(rand, 2.2, 3.2), center: true }]
      ] } });
    return out;
  }

  var BUILDERS = {
    football: buildFootball, basketball: buildBasketball, tennis: buildTennis, hockey: buildHockey,
    baseball: buildBaseball, amfootball: buildAmFootball, boxing: buildBoxing
  };

  /* ───────────────────────── header / chrome ───────────────────────── */
  var TABS = {
    football: ['1', '1H', '2nd', 'Goal', 'Corner', 'Cards', 'Player'],
    basketball: ['Full', '1H', 'Q1', 'Q2', 'Q3', 'Q4', 'Player'],
    tennis: ['Match', 'Set 1', 'Set 2', 'Set 3', 'Games'],
    hockey: ['Full', 'P1', 'P2', 'P3', 'Player'],
    baseball: ['Game', '1st 5 Inn', 'Runs', 'Innings', 'Player'],
    amfootball: ['Full', '1H', 'Q1', 'Q2', 'Q3', 'Q4', 'Player'],
    boxing: ['Fight', 'Method', 'Rounds']
  };

  // Per-sport hero banner behind the teams. Local "ts-*" art where it exists;
  // baseball / American football have no bundled art, so use a generic keyword
  // photo with the sport's accent gradient as a graceful fallback.
  var BANNERS = {
    football:   'assets/ts-football.png',
    basketball: 'assets/ts-basketball.png',
    tennis:     'assets/ts-tennis.png',
    hockey:     'assets/ts-hockey.png',
    boxing:     'assets/ts-box.png',
    baseball:   'https://loremflickr.com/640/260/baseball,stadium/all?lock=11',
    amfootball: 'https://loremflickr.com/640/260/american,football,nfl/all?lock=5'
  };

  function monthName(i) { return ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][i]; }
  function fmtDate(iso) { var d = iso.split('T')[0].split('-'); return d[2] + ' ' + monthName(+d[1] - 1) + ' ' + d[0]; }
  function fmtTime(iso) { return (iso.split('T')[1] || '').slice(0, 5); }

  function teamLogo(team) {
    if (team.logo) return '<div class="logo"><img src="assets/' + team.logo + '" alt=""></div>';
    var ini = team.short.replace(/[^A-Za-zÀ-ÿ0-9 ]/g, '').split(' ').map(function (w) { return w[0]; }).join('').slice(0, 3).toUpperCase();
    return '<div class="logo ph">' + ini + '</div>';
  }

  function scorePill(m) {
    var timeText, scoreText;
    if (m.status === 'live') {
      var lv = m.live;
      if (m.sport === 'football' || m.sport === 'hockey') { timeText = lv.period + ' | ' + lv.clock; scoreText = lv.score[0] + ' : ' + lv.score[1]; }
      else if (m.sport === 'boxing') { timeText = lv.period + ' · ' + lv.clock; scoreText = 'LIVE'; }
      else if (m.sport === 'baseball') { timeText = lv.clock ? lv.period + ' · ' + lv.clock : lv.period; scoreText = lv.score[0] + ' : ' + lv.score[1]; }
      else { timeText = lv.period + ' · ' + lv.clock; scoreText = lv.score[0] + ' : ' + lv.score[1]; }
    } else {
      timeText = fmtDate(m.start); scoreText = fmtTime(m.start);
    }
    return '<div class="score-pill"><div class="inner"><span class="time">' + timeText + '</span><span class="score">' + scoreText + '</span></div></div>';
  }

  // Decorative football live stats footer (cards/shirts) — football live only.
  function footballStats() {
    return '<div class="event-stats">' +
      '<div class="stats-left">' +
      '<div class="stats-line"><div class="stat-cell"><div class="ico"><div class="card outline"></div></div><span class="num">2</span></div>' +
      '<div class="stat-cell"><div class="ico"><div class="card yellow"></div></div><span class="num">2</span></div>' +
      '<div class="stat-cell"><div class="ico"><div class="card red"></div></div><span class="num">3</span></div></div>' +
      '<div class="stats-line"><div class="stat-cell"><div class="ico"><div class="card outline"></div></div><span class="num">1</span></div>' +
      '<div class="stat-cell"><div class="ico"><div class="card yellow"></div></div><span class="num">1</span></div>' +
      '<div class="stat-cell"><div class="ico"><div class="card red"></div></div><span class="num">2</span></div></div></div>' +
      '<div class="shirts"><div class="shirt"><svg viewBox="0 0 12 12" fill="currentColor"><path d="M2 3l2-1h4l2 1v1l-1 1v5H3V5L2 4z"/></svg></div>' +
      '<div class="shirt"><svg viewBox="0 0 12 12" fill="currentColor"><path d="M2 3l2-1h4l2 1v1l-1 1v5H3V5L2 4z"/></svg></div></div>' +
      '<div class="stats-right"><div class="scores-cells"><div class="col"><span>0</span><span>1</span></div>' +
      '<div class="col"><span>1</span><span>1</span></div><div class="col active"><span>2</span><span>1</span></div></div></div></div>';
  }

  function favSvg() { return '<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.2"><path d="M6 1.5l1.4 3 3.3.4-2.5 2.3.7 3.2L6 8.7 3.1 10.4l.7-3.2L1.3 4.9l3.3-.4z"/></svg>'; }

  function renderHeader(m) {
    return '<div class="teams-row">' +
      '<div class="team-block left"><button class="fav" aria-label="favorite">' + favSvg() + '</button>' +
      teamLogo(m.home) + '<p class="name">' + m.home.full + '</p></div>' +
      scorePill(m) +
      '<div class="team-block right"><button class="fav" aria-label="favorite">' + favSvg() + '</button>' +
      teamLogo(m.away) + '<p class="name">' + m.away.full + '</p></div></div>' +
      (m.sport === 'football' && m.status === 'live' ? footballStats() : '');
  }

  /* ───────────────────────── bootstrap ───────────────────────── */
  function el(id) { return document.getElementById(id); }
  var id = new URLSearchParams(location.search).get('id');
  var m = (id && D.getMatch(id)) || D.matches[0];
  if (!m) return;
  var league = D.getLeague(m.league) || { name: '' };
  var region = D.getRegion(league.region) || { name: '' };
  var sport = D.getSport(m.sport) || { name: '' };

  // title
  document.title = 'VBet — ' + (m.status === 'live' ? 'Live' : 'Prematch') + ' · ' + m.home.full + ' vs ' + m.away.full;

  // header
  var em = el('event-main');
  if (em) {
    em.innerHTML = renderHeader(m);
    var banner = BANNERS[m.sport];
    if (banner) {
      var accent = (sport && sport.accent) || '#0a1c3a';
      em.style.backgroundImage = "url('" + banner + "'), linear-gradient(120deg, " + accent + ", #06122e)";
      em.style.backgroundSize = 'cover, cover';
      em.style.backgroundPosition = 'center, center';
      em.style.backgroundRepeat = 'no-repeat, no-repeat';
    }
  }

  // hidden team-name carriers so betslip-popup resolves the real teams
  var bnr = document.createElement('div');
  bnr.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;clip:rect(0 0 0 0)';
  bnr.innerHTML = '<span class="bnr-tn">' + m.home.short + '</span><span class="bnr-tn">' + m.away.short + '</span>';
  document.body.appendChild(bnr);

  // market tabs
  if (el('market-tabs')) {
    el('market-tabs').innerHTML = (TABS[m.sport] || TABS.football).map(function (t, i) {
      return '<button class="market-tab' + (i === 0 ? ' active' : '') + '">' + t + '</button>';
    }).join('');
  }

  // markets
  var specs = (BUILDERS[m.sport] || buildFootball)(m);
  if (el('markets')) {
    el('markets').innerHTML = specs.map(function (s, i) { return renderMarket(s, i !== 0); }).join('');
  }

  // breadcrumb / back target / event-top label
  var crumb = el('event-crumb');
  if (crumb) crumb.textContent = sport.name + ' · ' + region.name + ' · ' + league.name;
  var back = document.querySelector('.event-top .back-btn');
  if (back) back.setAttribute('href', m.status === 'live' ? 'live.html' : ('prematch-games.html?league=' + m.league));

  // bottom nav active tab
  var nav = el('app-nav');
  if (nav) nav.setAttribute('data-page', m.status === 'live' ? 'live' : 'prematch');

  // collapse toggling (same behaviour as the old static template)
  var root = el('markets');
  if (root) {
    root.addEventListener('click', function (e) {
      var titleRow = e.target.closest('.title-row');
      if (!titleRow || e.target.closest('.pin')) return;
      var mk = titleRow.closest('.market');
      if (mk) mk.classList.toggle('collapsed');
    });
  }
})();
