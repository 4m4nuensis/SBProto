/*
 * Data-driven listing renderer. Builds the live list, the prematch country→league
 * menu, and the prematch games list from window.VBET_DATA (data/catalog.js),
 * reproducing each page's existing card DOM so betslip-popup.js keeps working.
 *
 * Usage (per page, after catalog.js + sportbar.js):
 *   VBetList.live();   VBetList.menu();   VBetList.games();
 * Each reads the active sport from the rendered sport-bar and re-renders when a
 * sport chip is tapped.
 */
(function () {
  var D = window.VBET_DATA;
  if (!D) return;

  /* styles for the league switcher dropdown (prematch-games comp card) */
  (function injectCSS() {
    var s = document.createElement('style');
    s.textContent = `
.comp-card .league-name-wrap{position:relative}
.comp-card .league-pill{cursor:pointer}
.comp-card .league-pill .chev{transition:transform .18s ease}
.comp-card .league-pill.open .chev{transform:rotate(180deg)}
.league-dd{
  position:fixed;z-index:70;
  background:#0a1733;border:1px solid var(--w-12);border-radius:12px;padding:4px;
  max-height:300px;overflow-y:auto;box-shadow:0 12px 32px rgba(0,0,0,.5);display:none;
}
.league-dd.open{display:block}
.league-dd .ldopt{display:flex;align-items:center;gap:8px;padding:10px 12px;border-radius:8px;font-size:13px;line-height:16px;color:var(--w-80)}
.league-dd .ldopt:hover{background:var(--w-8)}
.league-dd .ldopt.sel{color:#fff;background:var(--w-8)}
.league-dd .ldot{width:6px;height:6px;border-radius:50%;background:var(--main);flex:none;opacity:0}
.league-dd .ldopt.sel .ldot{opacity:1}
.league-dd .ldname{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.league-dd .ldreg{font-size:11px;color:var(--w-48);white-space:nowrap}
`;
    document.head.appendChild(s);
  })();

  /* ── shared helpers ── */
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var TODAY = '2026-06-04';                 // the prototype's "today" (matches currentDate)
  function ymd(iso) { return iso.split('T')[0]; }
  function hm(iso) { return (iso.split('T')[1] || '').slice(0, 5); }
  function dayLabel(iso) {
    var d = ymd(iso);
    if (d === TODAY) return 'Today';
    var t = new Date(TODAY + 'T00:00'), n = new Date(d + 'T00:00');
    if ((n - t) === 86400000) return 'Tomorrow';
    var p = d.split('-'); return parseInt(p[2], 10) + ' ' + MON[+p[1] - 1];
  }
  function initials(name) {
    return name.replace(/[^A-Za-zÀ-ÿ0-9 ]/g, '').split(' ').filter(Boolean).map(function (w) { return w[0]; }).join('').slice(0, 3).toUpperCase();
  }
  function logoSmall(team) {
    return team.logo
      ? '<span class="logo"><img src="assets/' + team.logo + '" alt=""></span>'
      : '<span class="logo" style="background:var(--w-8);color:var(--w-72);font-size:9px;font-weight:600;display:flex;align-items:center;justify-content:center">' + initials(team.short) + '</span>';
  }
  function flagSpan(region, cls) {
    cls = cls || 'flag';
    var f = region.flag || {};
    if (f.img) return '<span class="' + cls + '"><img src="' + f.img + '" alt=""></span>';
    if (f.css) return '<span class="' + cls + ' ' + f.css + '"></span>';
    return '<span class="' + cls + '" style="background:#2b3550;color:#fff;font-size:9px;display:flex;align-items:center;justify-content:center">' + (f.code || '') + '</span>';
  }
  function oddsKeys(m) { return m.anchor.x !== undefined ? [['1', m.anchor['1']], ['X', m.anchor['x']], ['2', m.anchor['2']]] : [['1', m.anchor['1']], ['2', m.anchor['2']]]; }
  function fmt(o) { return (Math.round(o * 100) / 100).toFixed(2); }

  function activeSport() {
    var sel = document.querySelector('.sport-filter .sport-chip.selected');
    var wrap = sel && sel.closest('.sport-filter');
    return (wrap && wrap.dataset.sport) || (document.getElementById('sport-bar') && document.getElementById('sport-bar').dataset.active) || 'football';
  }
  function wireChips(rerender) {
    document.querySelectorAll('.sport-filter[data-sport]').forEach(function (el) {
      el.addEventListener('click', function () {
        document.querySelectorAll('.sport-filter .sport-chip').forEach(function (c) { c.classList.remove('selected'); });
        var chip = el.querySelector('.sport-chip');
        if (chip) chip.classList.add('selected');
        // restore the accent dot on now-unselected chips, hide on selected
        rerender();
      });
    });
  }

  /* ── LIVE LIST (live.html) ── */
  var FAV = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M8 2l1.9 4 4.4.6-3.2 3.1 1 4.3L8 11.7 3.9 14l1-4.3L1.7 6.6 6.1 6z"/></svg>';
  var VID = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><rect x="1.5" y="4" width="10" height="8" rx="1"/><path d="M11.5 7l3-2v6l-3-2z"/></svg>';
  var BELL = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M8 1.5a3.5 3.5 0 0 0-3.5 3.5v1.8l-1 1.7h9l-1-1.7V5A3.5 3.5 0 0 0 8 1.5zM6.5 12a1.5 1.5 0 0 0 3 0"/></svg>';
  var BARS = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M3 13V8M8 13V3M13 13V6"/></svg>';
  function periodShort(m) {
    var p = m.live.period;
    return { '1st Half': 'H1', '2nd Half': 'H2', 'Half-Time': 'HT' }[p] || p;
  }
  function liveCard(m) {
    var teams = '<div class="team">' + logoSmall(m.home) + '<span class="nm">' + m.home.short + '</span></div>' +
                '<div class="team">' + logoSmall(m.away) + '<span class="nm">' + m.away.short + '</span></div>';
    var odds = oddsKeys(m).map(function (k) { return '<button class="opt"><span class="l">' + k[0] + '</span><span class="o">' + fmt(k[1]) + '</span></button>'; }).join('');
    return '<a class="event-card" href="match.html?id=' + m.id + '">' +
      '<div class="ev-header"><div class="league-info">' +
        '<span class="live-dot"></span><span class="period">' + periodShort(m) + '</span><span class="time-text">' + m.live.clock + '</span>' +
        '<button class="vid-btn" aria-label="watch">' + VID + '</button></div>' +
        '<div class="icons"><span class="divider"></span>' +
        '<button class="ic-btn">' + BELL + '</button><button class="ic-btn">' + BARS + '</button></div></div>' +
      '<div class="ev-body"><div class="match-row">' +
        '<div class="team-info"><div class="fav-col"><button class="fav-btn">' + FAV + '</button><div class="fav-divider"></div></div>' +
        '<div class="teams">' + teams + '</div></div>' +
        '<div class="scores"><div class="score-col total"><span class="v">' + m.live.score[0] + '</span><span class="v">' + m.live.score[1] + '</span></div></div>' +
      '</div><div class="ev-odds">' + odds + '</div></div></a>';
  }
  function renderLive() {
    var host = document.querySelector('.events-list');
    if (!host) return;
    var sport = activeSport();
    var live = D.matches.filter(function (m) { return m.status === 'live' && m.sport === sport; });
    if (!live.length) { host.innerHTML = '<div class="placeholder-section">No live ' + (D.sports[sport] ? D.sports[sport].name : sport) + ' events right now.</div>'; return; }
    // group by league, in league declaration order
    var html = '';
    D.leaguesForSport(sport).forEach(function (lg) {
      var rows = live.filter(function (m) { return m.league === lg.key; });
      if (!rows.length) return;
      var region = D.regions[lg.region] || { name: '' };
      html += '<div style="padding:10px 8px 2px;font-size:12px;line-height:16px;letter-spacing:.4px;color:var(--w-56)">' + lg.name + ' · ' + region.name + '</div>';
      html += rows.map(liveCard).join('');
    });
    host.innerHTML = html;
  }

  /* ── PREMATCH MENU (prematch-menu.html) ── */
  var STAR_ON = '<svg viewBox="0 0 16 16" fill="rgba(255,255,255,.9)"><path d="M8 1.5l1.9 4.1 4.5.5-3.3 3.1.9 4.4L8 11.5 4 13.6l.9-4.4-3.3-3.1 4.5-.5z"/></svg>';
  var STAR_OFF = '<svg viewBox="0 0 16 16" fill="none" stroke="rgba(255,255,255,.64)" stroke-width="1.3"><path d="M8 1.8l1.9 4 4.4.5-3.3 3.1.9 4.3L8 11.6 4.1 13.7l.9-4.3-3.3-3.1 4.4-.5z"/></svg>';
  var CHEV_DOWN = '<svg viewBox="0 0 16 16" fill="none" stroke="rgba(255,255,255,.64)" stroke-width="1.3"><path d="M4 6l4 4 4-4"/></svg>';
  function renderMenu() {
    var host = document.querySelector('.country-list');
    if (!host) return;
    var sport = activeSport();
    // group leagues by region (declaration order), international always first
    var order = [], byRegion = {};
    D.leaguesForSport(sport).forEach(function (lg) {
      if (!byRegion[lg.region]) { byRegion[lg.region] = []; order.push(lg.region); }
      byRegion[lg.region].push(lg);
    });
    // hoist intl to the front
    var intlIdx = order.indexOf('intl');
    if (intlIdx > 0) { order.splice(intlIdx, 1); order.unshift('intl'); }
    if (!order.length) { host.innerHTML = '<div class="placeholder-section">No ' + (D.sports[sport] ? D.sports[sport].name : sport) + ' competitions listed.</div>'; return; }
    host.innerHTML = order.map(function (rk, i) {
      var region = D.regions[rk] || { name: rk };
      var open = i === 0;
      var leagues = byRegion[rk].map(function (lg, j) {
        return '<a class="league-item' + (open && j === 0 ? ' selected' : '') + '" href="prematch-games.html?league=' + lg.key + '">' +
          '<span class="star">' + (open && j === 0 ? STAR_ON : STAR_OFF) + '</span>' +
          '<span class="name">' + lg.name + '</span>' +
          '<span class="count">' + D.byLeague(lg.key).length + '</span></a>';
      }).join('');
      return '<div class="country-row' + (open ? ' open' : '') + '">' +
        '<button class="country-head' + (open ? '' : ' collapsed') + '">' +
          flagSpan(region) + '<span class="name">' + region.name + '</span>' +
          '<span class="chev">' + CHEV_DOWN + '</span></button>' +
        '<div class="league-list"' + (open ? '' : ' style="display:none"') + '><div class="inner">' + leagues + '</div></div></div>';
    }).join('');
    // collapse / expand
    host.querySelectorAll('.country-head').forEach(function (head) {
      head.addEventListener('click', function () {
        var row = head.closest('.country-row');
        var list = row.querySelector('.league-list');
        var open = row.classList.toggle('open');
        head.classList.toggle('collapsed', !open);
        if (list) list.style.display = open ? '' : 'none';
      });
    });
  }

  /* ── PREMATCH GAMES (prematch-games.html?league=key) ── */
  var STATS = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M3 13V8m4 5V5m4 8V9"/></svg>';
  var BELL2 = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M8 1.5a4 4 0 0 0-4 4v2L2.5 10h11L12 7.5v-2a4 4 0 0 0-4-4zM6 12.5a2 2 0 0 0 4 0"/></svg>';
  var STAR_BTN = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M8 1.8l1.9 4 4.4.5-3.3 3.1.9 4.3L8 11.6 4.1 13.7l.9-4.3-3.3-3.1 4.4-.5z"/></svg>';
  function matchCard(m) {
    var odds = oddsKeys(m).map(function (k) { return '<button class="opt"><span class="l">' + k[0] + '</span><span class="o">' + fmt(k[1]) + '</span></button>'; }).join('');
    return '<div class="match-card"><div class="head"><span class="time">' + hm(m.start) + '</span>' +
      '<div class="icons"><button class="icbtn">' + BELL2 + '</button><button class="icbtn">' + STATS + '</button></div></div>' +
      '<div class="body"><div class="teams-row"><div class="fav-col"><button class="fav-btn">' + STAR_BTN + '</button><div class="fav-divider"></div></div>' +
      '<a class="teams" href="match.html?id=' + m.id + '" style="text-decoration:none">' +
        '<div class="team">' + logoSmall(m.home) + '<span class="nm">' + m.home.full + '</span></div>' +
        '<div class="team">' + logoSmall(m.away) + '<span class="nm">' + m.away.full + '</span></div></a></div>' +
      '<div class="opts">' + odds + '</div></div></div>';
  }
  function renderGames() {
    var key = new URLSearchParams(location.search).get('league') || 'epl';
    var lg = D.leagues[key];
    var card = document.getElementById('pm-compcard');
    var list = document.getElementById('pm-matches');
    if (!lg) { if (card) card.innerHTML = '<div class="placeholder-section">Unknown league.</div>'; return; }
    var region = D.regions[lg.region] || { name: '' };
    var sport = D.sports[lg.sport] || { name: '' };
    // sync the sport bar highlight to this league's sport, and wire each chip:
    // tapping a different sport opens that sport's first league's games page.
    document.querySelectorAll('.sport-filter[data-sport]').forEach(function (el) {
      var chip = el.querySelector('.sport-chip');
      if (chip) chip.classList.toggle('selected', el.dataset.sport === lg.sport);
      el.addEventListener('click', function () {
        var sp = el.dataset.sport;
        if (sp === lg.sport) return;
        var first = (D.leaguesForSport(sp)[0] || {}).key;
        location.href = first ? ('prematch-games.html?league=' + first) : 'prematch-menu.html';
      });
    });
    if (card) {
      card.innerHTML =
        '<div class="header"><div class="league-info"><div class="crumb">' +
          '<a class="back-btn" href="prematch-menu.html" aria-label="back"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M10 4l-4 4 4 4"/></svg></a>' +
          '<span class="sport">' + sport.name + '</span><span class="sep">·</span><span class="country">' + region.name + '</span></div>' +
          '<div class="league-name-wrap"><div class="league-pill"><div class="left">' + flagSpan(region) +
          '<span class="name">' + lg.name + '</span></div><div class="chev"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M4 6l4 4 4-4"/></svg></div></div></div></div>' +
        (lg.logo ? '<div class="big-logo"><img src="' + lg.logo + '" alt=""></div>' : '') + '</div>' +
        '<div class="progress-row"><span class="lbl">Season Progress:</span><div class="bar"><div class="fill" style="width:' + (lg.seasonPct || 60) + '%"></div></div><span class="pct">' + (lg.seasonPct || 60) + '%</span></div>';

      // league switcher: the pill opens a dropdown of the sport's other leagues
      var pill = card.querySelector('.league-pill');
      var wrap = card.querySelector('.league-name-wrap');
      if (pill && wrap) {
        var dd = document.createElement('div');
        dd.className = 'league-dd';
        // only leagues in the same region (country or intl bracket)
        dd.innerHTML = D.leaguesForSport(lg.sport).filter(function (L) {
          return L.region === lg.region;
        }).map(function (L) {
          return '<a class="ldopt' + (L.key === key ? ' sel' : '') + '" href="prematch-games.html?league=' + L.key + '">' +
            '<span class="ldot"></span><span class="ldname">' + L.name + '</span></a>';
        }).join('');
        // fixed-position + appended to body so the comp-card's overflow:hidden
        // doesn't clip the menu; placed under the pill on open.
        document.body.appendChild(dd);
        function closeDD() { dd.classList.remove('open'); pill.classList.remove('open'); }
        pill.addEventListener('click', function (e) {
          e.stopPropagation();
          var open = dd.classList.toggle('open');
          pill.classList.toggle('open', open);
          if (open) {
            var r = pill.getBoundingClientRect();
            dd.style.left = r.left + 'px';
            dd.style.top = (r.bottom + 4) + 'px';
            dd.style.width = r.width + 'px';
          }
        });
        dd.addEventListener('click', function (e) {
          var a = e.target.closest('a.ldopt');
          if (a && a.classList.contains('sel')) { e.preventDefault(); closeDD(); }
        });
        document.addEventListener('click', closeDD);
        window.addEventListener('scroll', closeDD, { passive: true });
      }
    }
    if (list) {
      var rows = D.byLeague(key).filter(function (m) { return m.status === 'prematch'; })
        .sort(function (a, b) { return a.start < b.start ? -1 : 1; });
      if (!rows.length) { list.innerHTML = '<div class="placeholder-section">No upcoming fixtures.</div>'; return; }
      var groups = [], idx = {};
      rows.forEach(function (m) { var d = ymd(m.start); if (idx[d] === undefined) { idx[d] = groups.length; groups.push({ d: d, items: [] }); } groups[idx[d]].items.push(m); });
      list.innerHTML = groups.map(function (g, i) {
        return '<div class="day-header"' + (i ? ' style="margin-top:8px"' : '') + '><span class="name">' + dayLabel(g.d + 'T00:00') + '</span>' +
          '<span class="ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M6 9l6 6 6-6"/></svg></span></div>' +
          '<div class="matches">' + g.items.map(matchCard).join('') + '</div>';
      }).join('');
      // drop any static fallback day/match blocks left in the page markup
      Array.prototype.forEach.call(document.querySelectorAll('.day-header, .matches'), function (e) {
        if (!list.contains(e) && e !== list) e.remove();
      });
    }
    document.title = 'VBet — Prematch · ' + lg.name;
  }

  /* ── TOP COMPETITIONS chip row (index.html + prematch-menu.html) ──
   * toGames=true (inside the prematch menu) → drill into the league's games;
   * toGames=false (home lobby) → just open the prematch menu. */
  function renderComps(toGames) {
    var host = document.querySelector('.competitions');
    if (!host) return;
    var sport = activeSport();
    var leagues = D.leaguesForSport(sport);
    if (!leagues.length) { host.innerHTML = ''; return; }
    var fallbackIcon = (D.sports[sport] && D.sports[sport].icon) || '';
    host.innerHTML = leagues.map(function (lg) {
      var icon = lg.logo
        ? '<img src="' + lg.logo + '" alt="" style="position:absolute;top:15%;left:15%;width:70%;height:70%;object-fit:contain">'
        : '<img src="' + fallbackIcon + '" alt="" style="position:absolute;top:20%;left:20%;width:60%;height:60%;object-fit:contain">';
      var href = toGames ? ('prematch-games.html?league=' + lg.key) : 'prematch-menu.html';
      return '<a class="comp-chip" href="' + href + '">' +
        '<div class="glow"></div>' +
        '<div class="logo-wrap">' + icon + '</div>' +
        '<span class="name">' + lg.name + '</span></a>';
    }).join('');
  }

  window.VBetList = {
    live: function () { renderLive(); wireChips(renderLive); },
    menu: function () { var f = function () { renderMenu(); renderComps(true); }; f(); wireChips(f); },
    games: renderGames,
    comps: function () { renderComps(false); }
  };
})();
