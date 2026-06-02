"""
Generate per-match prematch detail pages from _prematch_template.html.

Each match in MATCHES gets its own file `prematch-match-<id>.html` with
correct team names, logos, kick-off time, and a full set of collapsible
markets with believable Poisson-priced odds.

Run from repo root:
    python3 scripts/gen_prematch_pages.py
"""
from __future__ import annotations
import os
import re
import math
import random

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TEMPLATE = os.path.join(ROOT, "scripts", "_prematch_template.html")

# Shared Poisson helpers (identical to gen_match_pages.py)
def poisson_pmf(k: int, lam: float) -> float:
    return math.exp(-lam) * (lam ** k) / math.factorial(k)

def poisson_tail(k: int, lam: float) -> float:
    if k <= 0: return 1.0
    return max(0.0, 1.0 - sum(poisson_pmf(i, lam) for i in range(k)))


# ───────────────────────────────────────────────────────────────────────────
# Match definitions
# ───────────────────────────────────────────────────────────────────────────
MATCHES = [
    {
        "id": "80201",
        "home": "Man City",   "home_full": "Manchester City F. C.", "home_logo": "team-mancity.svg",
        "away": "Chelsea",    "away_full": "Chelsea F. C.",          "away_logo": "team-chelsea.svg",
        "date": "25 MAY 2026","time": "15:00",
        "o_1": 1.25, "o_x": 3.64, "o_2": 8.40,
        "seed": 80201,
    },
    {
        "id": "80202",
        "home": "Aston Villa","home_full": "Aston Villa F. C.",     "home_logo": "sew-aston-villa.png",
        "away": "Liverpool",  "away_full": "Liverpool F. C.",        "away_logo": "team-liverpool.svg",
        "date": "26 MAY 2026","time": "18:30",
        "o_1": 3.60, "o_x": 3.30, "o_2": 2.05,
        "seed": 80202,
    },
    {
        "id": "80203",
        "home": "Arsenal",     "home_full": "Arsenal F. C.",           "home_logo": "team-arsenal.svg",
        "away": "Man United",  "away_full": "Manchester United F. C.", "away_logo": "team-manunited.svg",
        "date": "26 MAY 2026", "time": "21:00",
        "o_1": 2.10, "o_x": 3.40, "o_2": 3.20,
        "seed": 80203,
    },
    {
        "id": "80204",
        "home": "Fulham",       "home_full": "Fulham F. C.",          "home_logo": "sew-fulham.png",
        "away": "Newcastle",    "away_full": "Newcastle United F. C.","away_logo": "team-newcastle.svg",
        "date": "27 MAY 2026",  "time": "17:30",
        "o_1": 1.85, "o_x": 3.50, "o_2": 4.10,
        "seed": 80204,
    },
]


def fmt(o: float) -> str:
    return f"{o:.2f}"

def jitter(rng: random.Random, low: float, high: float) -> float:
    return round(rng.uniform(low, high), 2)

def fmtl(line: float) -> str:
    if line == 0: return "0"
    sign = "-" if line < 0 else "+"
    val = abs(line)
    return f"{sign}{int(val)}" if val == int(val) else f"{sign}{val:g}"

def fmttotal(line: float) -> str:
    return str(int(line)) if line == int(line) else f"{line:g}"


def derive_markets(match: dict) -> dict:
    rng = random.Random(match["seed"])
    p1 = 1 / match["o_1"]
    px = 1 / match["o_x"]
    p2 = 1 / match["o_2"]
    s = p1 + px + p2
    p1, px, p2 = p1/s, px/s, p2/s

    # Full match xG ≈ 2.7 goals for a typical PL game
    lam = 2.7

    # Double chance
    def dc(p): return round(1 / (p * 1.06), 2)
    dc_1x, dc_12, dc_x2 = dc(p1+px), dc(p1+p2), dc(px+p2)

    # Total Goals Over/Under (full match lines)
    base_lines = [0.5, 1.5, 2.5, 3.5, 4.5, 5.5]
    totals, totals_sel = [], -1
    for line in base_lines:
        need = int(math.ceil(line + 1e-9))
        p_over = max(0.005, min(0.995, poisson_tail(need, lam)))
        o_over = round(min(25.0, 1 / p_over * 1.06), 2)
        o_under = round(min(25.0, 1 / max(1-p_over, 0.005) * 1.06), 2)
        totals.append((line, o_over, o_under))
        if totals_sel == -1 and 0.35 <= p_over <= 0.60:
            totals_sel = len(totals) - 1
    if totals_sel == -1: totals_sel = 2  # default 2.5

    # BTTS
    p_btts = 0.52 + (p1 - p2) * 0.05
    btts_yes = round(1 / max(p_btts, 0.1) * 1.05, 2)
    btts_no = round(1 / max(1-p_btts, 0.1) * 1.05, 2)

    # Both Halves
    bh_yes = round(jitter(rng, 2.20, 2.85), 2)
    bh_no = round(1 / max(1 - 1/(bh_yes*1.05), 0.1) * 1.05, 2)

    # First / Last Team To Score
    ft_h = round(1 / (p1 * 0.98) * 1.05, 2)
    ft_a = round(1 / (p2 * 0.98) * 1.05, 2)
    ft_n = round(jitter(rng, 11.0, 18.0), 2)
    lt_h = round(ft_h * jitter(rng, 0.92, 1.08), 2)
    lt_a = round(ft_a * jitter(rng, 0.92, 1.08), 2)
    lt_n = round(jitter(rng, 11.0, 18.0), 2)

    # Goals Asian Handicap ladder (pre-match: symmetric around 0)
    ah_lines_h = [-2.75, -2.25, -1.75, -1.25, -0.75, -0.25, 0.25, 0.75]
    # shift centre based on favourite
    fav_adj = (p1 - p2) * 1.5
    asian, asian_sel = [], -1
    for i, lh in enumerate(ah_lines_h):
        adjusted_lh = lh - fav_adj
        ph = max(0.1, min(0.9, p1 + adjusted_lh * (-0.18)))
        oh = round(1 / ph * 1.05, 2)
        oa = round(1 / max(1-ph, 0.05) * 1.05, 2)
        asian.append((lh, oh, -lh, oa))
        if asian_sel == -1 and abs(oh - 1.9) < 0.3:
            asian_sel = i
    if asian_sel == -1: asian_sel = len(asian) // 2

    # Goals Handicap 3 Way
    h3w_lines = [-2, -1, 0, 1]
    h3w = []
    for lh in h3w_lines:
        ph = max(0.1, min(0.85, p1 - lh * 0.18))
        pa = max(0.05, 1 - ph - 0.20)
        pt = max(0.05, 1 - ph - pa)
        h3w.append((lh, round(1/ph*1.06, 2), round(1/pt*1.08, 2), round(1/pa*1.06, 2)))

    # Total Goals 3 Way
    t3w, t3w_sel = [], -1
    for i, line in enumerate([2, 3, 4, 5]):
        p_over = max(0.005, poisson_tail(line+1, lam))
        p_exact = max(0.005, poisson_pmf(line, lam))
        p_under = max(0.005, 1 - p_over - p_exact)
        t3w.append((line, round(1/p_over*1.07, 2), round(1/p_exact*1.10, 2), round(1/p_under*1.07, 2)))
        if t3w_sel == -1 and 0.35 <= p_over <= 0.6:
            t3w_sel = i
    if t3w_sel == -1: t3w_sel = 1

    # Correct Score - most likely scorelines
    # Simple model: Poisson home goals lam_h, away goals lam_a
    lam_h = lam * p1 * 1.4
    lam_a = lam * p2 * 1.4
    scores = []
    for h in range(5):
        for a in range(5):
            p = poisson_pmf(h, lam_h) * poisson_pmf(a, lam_a)
            scores.append((h, a, p))
    scores.sort(key=lambda x: -x[2])
    correct_scores = [(h, a, round(min(50.0, 1/max(p, 0.005) * 1.15), 2))
                      for h, a, p in scores[:12]]

    # Half Time / Full Time combo
    htft = [
        (f"1/1",  round(jitter(rng, 1.5*match["o_1"], 2.2*match["o_1"]), 2)),
        (f"1/X",  round(jitter(rng, 12, 20), 2)),
        (f"1/2",  round(jitter(rng, 30, 50), 2)),
        (f"X/1",  round(jitter(rng, 3.5, 5.5), 2)),
        (f"X/X",  round(jitter(rng, 4.5, 6.5), 2)),
        (f"X/2",  round(jitter(rng, 6.0, 10.0), 2)),
        (f"2/1",  round(jitter(rng, 15, 25), 2)),
        (f"2/X",  round(jitter(rng, 12, 18), 2)),
        (f"2/2",  round(jitter(rng, 2.5*match["o_2"], 3.5*match["o_2"]), 2)),
    ]

    # Result & BTTS
    r_btts = [
        (f"1 & Yes",  round(1/(p1*p_btts) * 1.08, 2)),
        (f"X & Yes",  round(1/(px*p_btts) * 1.08, 2)),
        (f"2 & Yes",  round(1/(p2*p_btts) * 1.08, 2)),
        (f"1 & No",   round(1/(p1*(1-p_btts)) * 1.08, 2)),
        (f"X & No",   round(1/(px*(1-p_btts)) * 1.08, 2)),
        (f"2 & No",   round(1/(p2*(1-p_btts)) * 1.08, 2)),
    ]

    return {
        "dc": (dc_1x, dc_12, dc_x2),
        "totals": totals, "totals_sel": totals_sel,
        "btts": (btts_yes, btts_no),
        "bh": (bh_yes, bh_no),
        "ft": (ft_h, ft_n, ft_a),
        "lt": (lt_h, lt_n, lt_a),
        "asian": asian, "asian_sel": asian_sel,
        "h3w": h3w,
        "t3w": t3w, "t3w_sel": t3w_sel,
        "correct_scores": correct_scores,
        "htft": htft,
        "r_btts": r_btts,
    }


PIN_SVG = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M4 2h8v6l-4 4-4-4z"/></svg>'
CHEV_SVG = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M4 10l4-4 4 4"/></svg>'

def market_open(title, key, badge=None, collapsed=True):
    cls = "market collapsed" if collapsed else "market"
    badge_html = f'<span class="badge">{badge}</span>' if badge else ""
    return f'''    <div class="{cls}" data-market="{key}">
      <div class="title-row">
        <div class="left">
          <button class="pin" aria-label="pin" onclick="event.stopPropagation()">{PIN_SVG}</button>
          <span class="title">{title}</span>{badge_html}
        </div>
        <button class="chev">{CHEV_SVG}</button>
      </div>
      <div class="body">
'''

def market_close():
    return '      </div>\n    </div>\n'


def build_markets(match, m):
    out = []
    home, away = match["home"], match["away"]

    # 1) Match Result — expanded by default
    out.append(market_open("Match Result", "match-result", collapsed=False))
    out.append(f'''        <div class="opts">
          <button class="opt"><span class="l">1</span><span class="o">{fmt(match["o_1"])}</span></button>
          <button class="opt"><span class="l">X</span><span class="o">{fmt(match["o_x"])}</span></button>
          <button class="opt"><span class="l">2</span><span class="o">{fmt(match["o_2"])}</span></button>
        </div>
''')
    out.append(market_close())

    # 2) Double Chance
    out.append(market_open("Double Chance", "double-chance"))
    dc_1x, dc_12, dc_x2 = m["dc"]
    out.append(f'''        <div class="opts">
          <button class="opt col"><span class="l">1X</span><span class="o">{fmt(dc_1x)}</span></button>
          <button class="opt col"><span class="l">12</span><span class="o">{fmt(dc_12)}</span></button>
          <button class="opt col"><span class="l">X2</span><span class="o">{fmt(dc_x2)}</span></button>
        </div>
''')
    out.append(market_close())

    # 3) Both Teams To Score
    out.append(market_open("Both Teams To Score", "btts"))
    btts_y, btts_n = m["btts"]
    out.append(f'''        <div class="opts">
          <button class="opt col"><span class="l">Yes</span><span class="o">{fmt(btts_y)}</span></button>
          <button class="opt col"><span class="l">No</span><span class="o">{fmt(btts_n)}</span></button>
        </div>
''')
    out.append(market_close())

    # 4) Total Goals
    out.append(market_open("Total Goals", "total-goals"))
    out.append('        <div class="otbl cols-3">\n')
    out.append('          <div class="lbl"></div><div class="h">Over</div><div class="h">Under</div>\n')
    for i, (line, o_o, o_u) in enumerate(m["totals"]):
        sel = ' selected' if i == m["totals_sel"] else ''
        out.append(f'          <div class="lbl">{fmttotal(line)}</div><button class="cell center{sel}">{fmt(o_o)}</button><button class="cell center">{fmt(o_u)}</button>\n')
    out.append('        </div>\n')
    out.append(market_close())

    # 5) Goals Asian Handicap
    out.append(market_open("Goals Asian Handicap", "asian-handicap"))
    out.append(f'        <div class="otbl cols-2">\n')
    out.append(f'          <div class="h">{home}</div><div class="h">{away}</div>\n')
    for i, (lh, oh, la, oa) in enumerate(m["asian"]):
        sel = ' selected' if i == m["asian_sel"] else ''
        out.append(f'          <button class="cell lr{sel}"><span class="lbl-inline">{fmtl(lh)}</span>{fmt(oh)}</button><button class="cell lr"><span class="lbl-inline">{fmtl(la)}</span>{fmt(oa)}</button>\n')
    out.append('        </div>\n')
    out.append(market_close())

    # 6) Goals Handicap 3 Way
    out.append(market_open("Goals Handicap 3 Way", "handicap-3way", badge="New"))
    out.append(f'        <div class="otbl cols-3w">\n')
    out.append(f'          <div class="h">{home}</div><div class="h">Tie: {away}</div><div class="h">{away}</div>\n')
    for lh, oh, ot, oa in m["h3w"]:
        out.append(f'          <button class="cell lr"><span class="lbl-inline">{fmtl(lh)}</span>{fmt(oh)}</button><button class="cell lr"><span class="lbl-inline">{fmtl(lh)}</span>{fmt(ot)}</button><button class="cell lr"><span class="lbl-inline">{fmtl(-lh)}</span>{fmt(oa)}</button>\n')
    out.append('        </div>\n')
    out.append(market_close())

    # 7) Total Goals 3 Way
    out.append(market_open("Total Goals 3 Way", "total-3way"))
    out.append('        <div class="otbl cols-4">\n')
    out.append('          <div class="lbl"></div><div class="h">Over</div><div class="h">Exactly</div><div class="h">Under</div>\n')
    for i, (line, oo, oe, ou) in enumerate(m["t3w"]):
        sel = ' selected' if i == m["t3w_sel"] else ''
        out.append(f'          <div class="lbl">{fmttotal(line)}</div><button class="cell center{sel}">{fmt(oo)}</button><button class="cell center">{fmt(oe)}</button><button class="cell center">{fmt(ou)}</button>\n')
    out.append('        </div>\n')
    out.append(market_close())

    # 8) Goals In Both Halves
    out.append(market_open("Goals In Both Halves", "both-halves", badge="New"))
    bh_y, bh_n = m["bh"]
    out.append(f'''        <div class="opts">
          <button class="opt col"><span class="l">Yes</span><span class="o">{fmt(bh_y)}</span></button>
          <button class="opt col"><span class="l">No</span><span class="o">{fmt(bh_n)}</span></button>
        </div>
''')
    out.append(market_close())

    # 9) First Team To Score
    out.append(market_open("First Team To Score", "first-score", badge="New"))
    ft_h, ft_n, ft_a = m["ft"]
    out.append(f'''        <div class="opts">
          <button class="opt col"><span class="l">{home}</span><span class="o">{fmt(ft_h)}</span></button>
          <button class="opt col"><span class="l">No Goal</span><span class="o">{fmt(ft_n)}</span></button>
          <button class="opt col"><span class="l">{away}</span><span class="o">{fmt(ft_a)}</span></button>
        </div>
''')
    out.append(market_close())

    # 10) Last Team To Score
    out.append(market_open("Last Team To Score", "last-score"))
    lt_h, lt_n, lt_a = m["lt"]
    out.append(f'''        <div class="opts">
          <button class="opt col"><span class="l">{home}</span><span class="o">{fmt(lt_h)}</span></button>
          <button class="opt col"><span class="l">No Goal</span><span class="o">{fmt(lt_n)}</span></button>
          <button class="opt col"><span class="l">{away}</span><span class="o">{fmt(lt_a)}</span></button>
        </div>
''')
    out.append(market_close())

    # 11) Correct Score
    out.append(market_open("Correct Score", "correct-score"))
    out.append('        <div class="otbl cols-2">\n')
    out.append(f'          <div class="h">{home} win</div><div class="h">{away} win / Draw</div>\n')
    # split: home wins left, draws + away wins right
    home_wins = [(f"{h}-{a}", o) for h,a,o in m["correct_scores"] if h > a]
    others = [(f"{h}-{a}", o) for h,a,o in m["correct_scores"] if h <= a]
    max_rows = max(len(home_wins), len(others))
    for i in range(max_rows):
        lbl_l, o_l = home_wins[i] if i < len(home_wins) else ("", "")
        lbl_r, o_r = others[i] if i < len(others) else ("", "")
        cl = f'<button class="cell lr"><span class="lbl-inline">{lbl_l}</span>{fmt(o_l)}</button>' if lbl_l else '<div class="lbl"></div>'
        cr = f'<button class="cell lr"><span class="lbl-inline">{lbl_r}</span>{fmt(o_r)}</button>' if lbl_r else '<div class="lbl"></div>'
        out.append(f'          {cl}{cr}\n')
    out.append('        </div>\n')
    out.append(market_close())

    # 12) Half Time / Full Time
    out.append(market_open("Half Time / Full Time", "htft"))
    out.append('        <div class="otbl cols-3w">\n')
    out.append('          <div class="h">HT/FT</div><div class="h">HT/FT</div><div class="h">HT/FT</div>\n')
    htft = m["htft"]
    for i in range(0, len(htft), 3):
        row = htft[i:i+3]
        while len(row) < 3:
            row.append(("", None))
        cells = ""
        for label, o in row:
            if o is not None:
                cells += f'<button class="cell lr"><span class="lbl-inline">{label}</span>{fmt(o)}</button>'
            else:
                cells += '<div class="lbl"></div>'
        out.append(f'          {cells}\n')
    out.append('        </div>\n')
    out.append(market_close())

    # 13) Result & Both Teams To Score
    out.append(market_open("Result &amp; Both Teams To Score", "result-btts"))
    out.append('        <div class="opts" style="flex-wrap:wrap;gap:6px">\n')
    for label, o in m["r_btts"]:
        out.append(f'          <button class="opt col" style="flex:1;min-width:100px"><span class="l">{label}</span><span class="o">{fmt(o)}</span></button>\n')
    out.append('        </div>\n')
    out.append(market_close())

    return ''.join(out)


CSS_ADDON = '''
/* ── market body/table styles shared with live pages ──────────────────── */
.market{display:flex;flex-direction:column;gap:12px}
.market.collapsed{gap:0;padding:10px 8px 10px 12px}
.market .title-row{cursor:pointer;user-select:none}
.market.collapsed .body{display:none}
.market.collapsed .chev{transform:rotate(180deg)}
.market .body{display:flex;flex-direction:column;gap:6px}
.market .chev{transition:transform .18s ease}
.market .opt{display:flex;align-items:center;justify-content:space-between;gap:8px}
.market .opt.col{flex-direction:column;align-items:center;justify-content:center;gap:6px;padding:10px 8px}
.market .opt.selected,.market .opt.col.selected{background:var(--main);border-color:var(--main)}
.market .opt.selected .l,.market .opt.selected .o{color:#fff}
.otbl{display:grid;width:100%;gap:4px;font-size:13px;line-height:16px}
.otbl.cols-2{grid-template-columns:1fr 1fr}
.otbl.cols-3{grid-template-columns:48px 1fr 1fr}
.otbl.cols-3w{grid-template-columns:1fr 1fr 1fr}
.otbl.cols-4{grid-template-columns:48px 1fr 1fr 1fr}
.otbl .h{padding:8px 4px;text-align:center;color:var(--w-56);background:var(--w-4);border-radius:4px}
.otbl .lbl{padding:10px 4px;text-align:center;color:var(--w-56);background:var(--w-4);border-radius:4px;display:flex;align-items:center;justify-content:center}
.otbl .cell{padding:10px 12px;background:var(--w-4);border:1px solid var(--w-4);border-radius:4px;display:flex;align-items:center;justify-content:flex-end;color:var(--odds);font-weight:500;font-size:14px;cursor:pointer}
.otbl .cell.center{justify-content:center}
.otbl .cell.lr{justify-content:space-between}
.otbl .cell.lr .lbl-inline{color:var(--w-56);font-size:12px;font-weight:400}
.otbl .cell.selected{background:var(--main);border-color:var(--main);color:#fff}
'''

COLLAPSE_JS = '''  <script>
    (function(){
      var root = document.getElementById('markets');
      if (!root) return;
      root.addEventListener('click', function(e){
        var row = e.target.closest('.title-row');
        if (!row || e.target.closest('.pin')) return;
        row.closest('.market').classList.toggle('collapsed');
      });
    })();
  </script>
'''


def build_page(template: str, match: dict) -> str:
    m = derive_markets(match)
    markets_html = build_markets(match, m)

    out = template

    # Title
    out = out.replace(
        "<title>VBet — Prematch · Manchester City vs Chelsea</title>",
        f'<title>VBet — Prematch · {match["home_full"]} vs {match["away_full"]}</title>',
    )

    # Team logos + names (via sentinels)
    out = (out
        .replace('src="assets/team-mancity.svg" alt="Manchester City"', 'src="assets/__HOME_LOGO__" alt="__HOME_SHORT__"')
        .replace('src="assets/team-chelsea.svg" alt="Chelsea"',         'src="assets/__AWAY_LOGO__" alt="__AWAY_SHORT__"')
        .replace('<p class="name">Manchester City</p>', '<p class="name">__HOME_NAME__</p>')
        .replace('<p class="name">Chelsea F. C.</p>',  '<p class="name">__AWAY_NAME__</p>')
        .replace('__HOME_LOGO__', match["home_logo"]).replace('__AWAY_LOGO__', match["away_logo"])
        .replace('__HOME_SHORT__', match["home"]).replace('__AWAY_SHORT__', match["away"])
        .replace('__HOME_NAME__', match["home_full"]).replace('__AWAY_NAME__', match["away_full"])
    )

    # Date & kick-off
    out = out.replace('<span class="date">08 JUN 2026</span>', f'<span class="date">{match["date"]}</span>')
    out = out.replace('<span class="kick-off">20:45</span>',   f'<span class="kick-off">{match["time"]}</span>')

    # Back button href
    out = out.replace('href="prematch-games.html"', 'href="prematch-games.html"')

    # Inject CSS addon before closing </style>
    out = out.replace('</style>', CSS_ADDON + '</style>', 1)

    # Replace markets block
    new_markets = (
        '  <!-- Markets List -->\n'
        '  <div class="markets" id="markets">\n'
        + markets_html
        + '  </div>\n\n'
        + COLLAPSE_JS
    )
    pattern = re.compile(r'  <div class="markets">.*?</div>\s*\n\n</div><!-- /\.app -->', re.DOTALL)
    if not pattern.search(out):
        raise SystemExit(f"Couldn't find markets block for match {match['id']}")
    out = pattern.sub(new_markets + '\n</div><!-- /.app -->', out, count=1)

    return out


def main():
    with open(TEMPLATE, "r", encoding="utf-8") as f:
        template = f.read()

    for match in MATCHES:
        page = build_page(template, match)
        target = os.path.join(ROOT, f"prematch-match-{match['id']}.html")
        with open(target, "w", encoding="utf-8") as f:
            f.write(page)
        print(f"wrote {target}")


if __name__ == "__main__":
    main()
