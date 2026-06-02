"""
Generate per-match live game pages from live-single-game.html as a template.

Each match defined in MATCHES gets its own file `live-match-<id>.html` with
team names, logos, score, time, and a complete fresh set of believable odds
across all 12 markets.

Run from repo root:
    python3 scripts/gen_match_pages.py
"""
from __future__ import annotations
import os
import re
import math
import random


# ───────────────────────────────────────────────────────────────────────────
# Poisson tail — used to price Over/Under lines from an expected goal mean.
# ───────────────────────────────────────────────────────────────────────────
def poisson_pmf(k: int, lam: float) -> float:
    return math.exp(-lam) * (lam ** k) / math.factorial(k)

def poisson_tail(k: int, lam: float) -> float:
    """P(X >= k) for X ~ Poisson(lam)."""
    if k <= 0:
        return 1.0
    return max(0.0, 1.0 - sum(poisson_pmf(i, lam) for i in range(k)))

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TEMPLATE = os.path.join(ROOT, "scripts", "_match_template.html")


# ───────────────────────────────────────────────────────────────────────────
# Match definitions. The 1X2 odds anchor each match's "shape"; the rest of
# the markets are derived from them with small randomised wiggles so each
# page has a different but coherent feel.
# ───────────────────────────────────────────────────────────────────────────
MATCHES = [
    {
        "id": "70123",
        "home": "Chelsea",      "home_full": "Chelsea F. C.",     "home_logo": "team-chelsea.svg",
        "away": "Aston Villa",  "away_full": "Aston Villa F. C.", "away_logo": "team-astonvilla.svg",
        "score_h": 3, "score_a": 2,
        "period_text": "2nd Half | 73'",
        "o_1": 6.21, "o_x": 3.12, "o_2": 1.88,
        # current minute drives where the Total Goals "live line" is
        "minute": 73, "seed": 70123,
    },
    {
        "id": "70124",
        "home": "Arsenal",  "home_full": "Arsenal F. C.",   "home_logo": "team-arsenal.svg",
        "away": "Liverpool","away_full": "Liverpool F. C.", "away_logo": "team-liverpool.svg",
        "score_h": 0, "score_a": 0,
        "period_text": "1st Half | 13'",
        "o_1": 2.45, "o_x": 3.20, "o_2": 2.95,
        "minute": 13, "seed": 70124,
    },
    {
        "id": "70125",
        "home": "Man City", "home_full": "Manchester City F. C.", "home_logo": "team-mancity.svg",
        "away": "Newcastle","away_full": "Newcastle United F. C.","away_logo": "team-newcastle.svg",
        "score_h": 3, "score_a": 2,
        "period_text": "2nd Half | 86'",
        "o_1": 1.25, "o_x": 8.50, "o_2": 12.40,
        "minute": 86, "seed": 70125,
    },
    {
        "id": "70126",
        "home": "Man United","home_full": "Manchester United F. C.", "home_logo": "team-manunited.svg",
        "away": "Liverpool", "away_full": "Liverpool F. C.",          "away_logo": "team-liverpool.svg",
        "score_h": 0, "score_a": 2,
        "period_text": "Half-Time | 45'",
        "o_1": 4.75, "o_x": 3.60, "o_2": 1.62,
        "minute": 45, "seed": 70126,
    },
    # ── Home-page "Top Events" cards ──────────────────────────────────────────
    {
        "id": "70127",
        "home": "Fulham",      "home_full": "Fulham F. C.",         "home_logo": "sew-fulham.png",
        "away": "Aston Villa", "away_full": "Aston Villa F. C.",    "away_logo": "sew-aston-villa.png",
        "score_h": 2, "score_a": 0,
        "period_text": "2nd Half | 65'",
        "o_1": 1.20, "o_x": 6.50, "o_2": 15.00,
        "minute": 65, "seed": 70127,
    },
    {
        "id": "70128",
        "home": "Arsenal", "home_full": "Arsenal F. C.", "home_logo": "team-arsenal.svg",
        "away": "Chelsea", "away_full": "Chelsea F. C.", "away_logo": "team-chelsea.svg",
        "score_h": 1, "score_a": 1,
        "period_text": "1st Half | 42'",
        "o_1": 2.05, "o_x": 3.40, "o_2": 3.25,
        "minute": 42, "seed": 70128,
    },
    # ── Home-page "Top Live Events" cards ─────────────────────────────────────
    {
        "id": "70129",
        "home": "Liverpool", "home_full": "Liverpool F. C.",          "home_logo": "team-liverpool.svg",
        "away": "Man City",  "away_full": "Manchester City F. C.",    "away_logo": "team-mancity.svg",
        "score_h": 1, "score_a": 0,
        "period_text": "1st Half | 33'",
        "o_1": 2.10, "o_x": 3.40, "o_2": 3.25,
        "minute": 33, "seed": 70129,
    },
    {
        "id": "70130",
        # No bundled crest for these two — generator renders an empty logo chip.
        "home": "Real Madrid", "home_full": "Real Madrid C. F.", "home_logo": None,
        "away": "Barcelona",   "away_full": "FC Barcelona",      "away_logo": None,
        "score_h": 2, "score_a": 1,
        "period_text": "2nd Half | 68'",
        "o_1": 1.95, "o_x": 3.60, "o_2": 3.90,
        "minute": 68, "seed": 70130,
    },
]


# ───────────────────────────────────────────────────────────────────────────
# Odds helpers — derive plausible secondary markets from the 1X2 line.
# ───────────────────────────────────────────────────────────────────────────
def fmt(o: float) -> str:
    """Format an odd like the rest of the site: 2 decimals, no trailing zero stripping."""
    return f"{o:.2f}"


def jitter(rng: random.Random, low: float, high: float) -> float:
    return round(rng.uniform(low, high), 2)


def derive_markets(m: dict) -> dict:
    rng = random.Random(m["seed"])
    p1 = 1 / m["o_1"]
    px = 1 / m["o_x"]
    p2 = 1 / m["o_2"]
    # normalise out the overround so we're working with implied probs
    s = p1 + px + p2
    p1, px, p2 = p1 / s, px / s, p2 / s

    # Double chance — implied prob + 6% house edge
    def dc(p):
        return round(1 / (p * 1.06), 2)
    dc_1x = dc(p1 + px)
    dc_12 = dc(p1 + p2)
    dc_x2 = dc(px + p2)

    # Current goals so far
    goals = m["score_h"] + m["score_a"]
    minute = m["minute"]
    # Expected remaining goals — assume base xG/match ≈ 2.7
    remaining_share = max(0.0, (90 - min(minute, 90)) / 90)
    exp_remaining = 2.7 * remaining_share
    exp_total = goals + exp_remaining

    # Over/Under ladder for Total Goals. We price each line using a Poisson
    # tail on the *remaining* goals: line L is Over if remaining > L - goals,
    # i.e. we need P(X >= max(1, ceil(L - goals + 1e-9))) at the expected
    # remaining-goals mean. Lines already passed by current score price as
    # very short on Over and very long on Under.
    lam = max(0.05, exp_remaining)
    base_lines = [0.5, 1.5, 2.5, 3.5, 4.5, 5.5]
    totals = []
    selected_total_idx = -1
    for line in base_lines:
        if line < goals:
            # already settled — over is sure thing, under is dead
            o_over = round(jitter(rng, 1.01, 1.04), 2)
            o_under = round(jitter(rng, 14.0, 22.0), 2)
            p_over = 0.99
        else:
            # number of additional goals needed to push total > line
            need = int(math.ceil(line - goals + 1e-9))
            need = max(1, need)
            p_over = max(0.005, min(0.995, poisson_tail(need, lam)))
            margin = 1.05  # bookmaker overround
            o_over = round(min(25.0, 1 / p_over * margin), 2)
            o_under = round(min(25.0, 1 / max(1 - p_over, 0.005) * margin), 2)
        totals.append((line, o_over, o_under))
        # highlight the line nearest to a fair coin-flip (p_over ≈ 0.5)
        if selected_total_idx == -1 and p_over <= 0.55 and p_over >= 0.30:
            selected_total_idx = len(totals) - 1
    if selected_total_idx == -1:
        # fall back to the line just above expected total
        for i, (line, _, _) in enumerate(totals):
            if line >= exp_total:
                selected_total_idx = i
                break
        if selected_total_idx == -1:
            selected_total_idx = len(totals) - 1

    # Both Teams To Score
    if m["score_h"] >= 1 and m["score_a"] >= 1:
        btts_yes = round(jitter(rng, 1.01, 1.03), 2)
        btts_no = round(jitter(rng, 15.0, 25.0), 2)
    else:
        # base on remaining time + favourites
        base = 0.55 + (remaining_share * 0.20)
        btts_yes = round(1 / base * 1.05, 2)
        btts_no = round(1 / (1 - base + 0.02) * 1.05, 2)

    # Goals In Both Halves — yes/no based on whether HT or beyond
    if minute < 45:
        bh_yes = round(jitter(rng, 1.65, 1.95), 2)
        bh_no = round(jitter(rng, 1.85, 2.20), 2)
    else:
        # if already a goal in 1H, depends on remaining time
        had_h1 = goals > 0  # treat as approx
        if had_h1 and remaining_share > 0.1:
            bh_yes = round(jitter(rng, 1.45, 1.75), 2)
            bh_no = round(jitter(rng, 2.20, 2.80), 2)
        else:
            bh_yes = round(jitter(rng, 4.00, 7.00), 2)
            bh_no = round(jitter(rng, 1.10, 1.25), 2)

    # First Team To Score
    if goals == 0:
        ft_h = round(1 / (p1 * 0.95) * 1.05, 2)
        ft_a = round(1 / (p2 * 0.95) * 1.05, 2)
        ft_n = round(jitter(rng, 10.0, 20.0), 2)
    else:
        ft_h = round(jitter(rng, 1.01, 1.05), 2)  # settled
        ft_a = round(jitter(rng, 8.0, 15.0), 2)
        ft_n = round(jitter(rng, 15.0, 25.0), 2)
    # Last Team To Score is still up for grabs
    if remaining_share > 0.1:
        lt_h = round(1 / max(0.45 * (1 - p2 * 0.5), 0.1) * 1.05, 2)
        lt_a = round(1 / max(0.45 * (1 - p1 * 0.5), 0.1) * 1.05, 2)
        lt_n = round(jitter(rng, 5.0, 12.0), 2)
    else:
        lt_h = round(jitter(rng, 2.0, 3.5), 2)
        lt_a = round(jitter(rng, 2.0, 3.5), 2)
        lt_n = round(jitter(rng, 1.5, 2.5), 2)

    # Goals Asian Handicap — ladder centered on goal-diff
    diff = m["score_h"] - m["score_a"]
    # Make the home line revolve around -(diff + 0.75) so the next goal flips it
    centre = -(diff) - 0.25  # home line for ~even bet (-0.25 if leading by 0)
    ah_lines = []
    for offset in [-2.5, -2.0, -1.5, -1.0, -0.5, 0.0, 0.5, 1.0]:
        line_h = centre + offset
        # snap to nearest 0.25
        line_h = round(line_h * 4) / 4
        # convert -X.0 → -X.00 string (Asian uses .25/.75/.5)
        ah_lines.append(line_h)
    # de-dup and trim
    seen = set()
    uniq = []
    for l in ah_lines:
        if l not in seen and abs(l) <= 3.0:
            seen.add(l)
            uniq.append(l)
    # pick odd lines around centre for richer ladder
    if len(uniq) < 6:
        for extra in [-2.75, -2.25, -1.75, -1.25, -0.75, -0.25, 0.25, 0.75]:
            cand = round((centre + extra) * 4) / 4
            if cand not in seen and abs(cand) <= 3.0:
                seen.add(cand)
                uniq.append(cand)
            if len(uniq) >= 8:
                break
    uniq.sort(reverse=True)  # most home-favouring first

    asian = []
    asian_selected_idx = -1
    for i, lh in enumerate(uniq):
        la = -lh
        # rough odds — closer to fair the closer to centre
        dist = abs(lh - centre)
        base = 1.85 - dist * 0.05  # placeholder
        # implied home prob roughly p1 + adjustment
        adjust = (centre - lh) * 0.18
        ph = max(0.1, min(0.9, p1 + adjust))
        oh = round(1 / ph * 1.05, 2)
        oa = round(1 / (1 - ph + 0.02) * 1.05, 2)
        asian.append((lh, oh, la, oa))
        if asian_selected_idx == -1 and lh <= centre:
            asian_selected_idx = i

    if asian_selected_idx == -1:
        asian_selected_idx = len(asian) // 2

    # Goals Handicap 3 Way — only at integer lines
    h3w_lines = []
    for offset in [-2, -1, 0, 1]:
        lh = -diff + offset
        h3w_lines.append(lh)
    # de-dup
    h3w_lines = sorted(set(h3w_lines), reverse=True)[:3]
    h3w = []
    for lh in h3w_lines:
        # 3-way: home covers, exact tie, away covers
        ph = max(0.1, min(0.85, p1 + (centre - lh) * 0.20))
        pa = max(0.05, 1 - ph - 0.20)
        pt = max(0.05, 1 - ph - pa)
        oh = round(1 / ph * 1.06, 2)
        ot = round(1 / pt * 1.08, 2)
        oa = round(1 / pa * 1.06, 2)
        h3w.append((lh, oh, ot, oa))

    # Total Goals 3 Way — for whole goal counts (Over k, Exactly k, Under k)
    t3w_lines = sorted({max(goals + 1, 2), max(goals + 2, 3), max(goals + 3, 4), max(goals + 4, 5)})[:4]
    t3w = []
    t3w_selected = -1
    for i, line in enumerate(t3w_lines):
        need_exact = line - goals
        if need_exact <= 0:
            # line already exceeded by current score — only over is alive
            p_over = max(0.005, 1 - jitter(rng, 0.05, 0.10))
            p_exact = jitter(rng, 0.02, 0.05)
            p_under = max(0.005, 1 - p_over - p_exact)
        else:
            p_exact = max(0.005, poisson_pmf(int(round(need_exact)), lam))
            p_over = max(0.005, poisson_tail(int(round(need_exact)) + 1, lam))
            p_under = max(0.005, 1 - p_over - p_exact)
        o_over = round(min(25.0, 1 / p_over * 1.07), 2)
        o_ex = round(min(25.0, 1 / p_exact * 1.10), 2)
        o_un = round(min(25.0, 1 / p_under * 1.07), 2)
        t3w.append((line, o_over, o_ex, o_un))
        if t3w_selected == -1 and 0.35 <= p_over <= 0.6:
            t3w_selected = i
    if t3w_selected == -1:
        for i, (line, _, _, _) in enumerate(t3w):
            if line >= exp_total:
                t3w_selected = i
                break
        if t3w_selected == -1:
            t3w_selected = 0

    # Goal Time Intervals — only meaningful while live
    intervals = []
    cur = max(minute, 1)
    while cur < 90:
        end = min(90, cur + 7)
        intervals.append((f"{cur}'-{end}'", round(jitter(rng, 1.95, 2.85), 2)))
        cur = end + 1
        if len(intervals) >= 4:
            break
    intervals.append(("No more goals", round(jitter(rng, 1.95, 4.50), 2)))

    return {
        "dc": (dc_1x, dc_12, dc_x2),
        "totals": totals, "totals_sel": selected_total_idx,
        "btts": (btts_yes, btts_no),
        "bh": (bh_yes, bh_no),
        "ft": (ft_h, ft_n, ft_a),
        "lt": (lt_h, lt_n, lt_a),
        "asian": asian, "asian_sel": asian_selected_idx,
        "h3w": h3w,
        "t3w": t3w, "t3w_sel": t3w_selected,
        "intervals": intervals,
    }


def fmtl(line: float) -> str:
    """Format handicap line like -0.75, +0.25, 0."""
    if line == 0:
        return "0"
    sign = "-" if line < 0 else "+"
    val = abs(line)
    if val == int(val):
        return f"{sign}{int(val)}"
    return f"{sign}{val:g}"


def fmttotal(line: float) -> str:
    """Format total line like 0.5, 2.5."""
    if line == int(line):
        return str(int(line))
    return f"{line:g}"


# ───────────────────────────────────────────────────────────────────────────
# Build the .markets block fresh for each match.
# ───────────────────────────────────────────────────────────────────────────
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
    home = match["home"]
    away = match["away"]

    # 1) Match Result — 1X2, default expanded
    out.append(market_open("Match Result", "match-result", collapsed=False))
    out.append(f'''        <div class="opts">
          <button class="opt"><span class="l">1</span><span class="o">{fmt(match["o_1"])}</span></button>
          <button class="opt"><span class="l">X</span><span class="o">{fmt(match["o_x"])}</span></button>
          <button class="opt"><span class="l">2</span><span class="o">{fmt(match["o_2"])}</span></button>
        </div>
''')
    out.append(market_close())

    # 2) Result (Early Payout)
    # cheaper than 1X2 (early-payout discount)
    epo_1 = round(match["o_1"] * 0.95, 2)
    epo_x = round(match["o_x"] * 0.95, 2)
    epo_2 = round(match["o_2"] * 0.95, 2)
    out.append(market_open("Result (Early Payout)", "early-payout"))
    out.append(f'''        <div class="opts">
          <button class="opt col"><span class="l">{home}</span><span class="o">{fmt(epo_1)}</span></button>
          <button class="opt col"><span class="l">Draw</span><span class="o">{fmt(epo_x)}</span></button>
          <button class="opt col"><span class="l">{away}</span><span class="o">{fmt(epo_2)}</span></button>
        </div>
''')
    out.append(market_close())

    # 3) Double Chance
    out.append(market_open("Double Chance", "double-chance"))
    dc_1x, dc_12, dc_x2 = m["dc"]
    out.append(f'''        <div class="opts">
          <button class="opt col"><span class="l">1X</span><span class="o">{fmt(dc_1x)}</span></button>
          <button class="opt col"><span class="l">12</span><span class="o">{fmt(dc_12)}</span></button>
          <button class="opt col"><span class="l">X2</span><span class="o">{fmt(dc_x2)}</span></button>
        </div>
''')
    out.append(market_close())

    # 4) Total Goals — Over/Under ladder
    out.append(market_open("Total Goals", "total-goals"))
    out.append('        <div class="otbl cols-3">\n')
    out.append('          <div class="lbl"></div><div class="h">Over</div><div class="h">Under</div>\n')
    for i, (line, o_o, o_u) in enumerate(m["totals"]):
        sel_o = ' selected' if i == m["totals_sel"] else ''
        out.append(f'          <div class="lbl">{fmttotal(line)}</div><button class="cell center{sel_o}">{fmt(o_o)}</button><button class="cell center">{fmt(o_u)}</button>\n')
    out.append('        </div>\n')
    out.append(market_close())

    # 5) Goals Asian Handicap
    out.append(market_open("Goals Asian Handicap", "asian-handicap"))
    out.append(f'        <div class="otbl cols-2">\n')
    out.append(f'          <div class="h">{home}</div><div class="h">{away}</div>\n')
    for i, (lh, oh, la, oa) in enumerate(m["asian"]):
        sel_h = ' selected' if i == m["asian_sel"] else ''
        out.append(f'          <button class="cell lr{sel_h}"><span class="lbl-inline">{fmtl(lh)}</span>{fmt(oh)}</button><button class="cell lr"><span class="lbl-inline">{fmtl(la)}</span>{fmt(oa)}</button>\n')
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

    # 11) Goal Time Intervals
    out.append(market_open("Goal Time Intervals", "goal-intervals"))
    out.append('        <div class="otbl cols-2">\n')
    out.append('          <div class="h">Interval</div><div class="h">Odds</div>\n')
    for label, o in m["intervals"]:
        out.append(f'          <div class="lbl">{label}</div><button class="cell center">{fmt(o)}</button>\n')
    out.append('        </div>\n')
    out.append(market_close())

    # 12) Both Teams To Score
    out.append(market_open("Both Teams To Score", "btts"))
    btts_y, btts_n = m["btts"]
    out.append(f'''        <div class="opts">
          <button class="opt col"><span class="l">Yes</span><span class="o">{fmt(btts_y)}</span></button>
          <button class="opt col"><span class="l">No</span><span class="o">{fmt(btts_n)}</span></button>
        </div>
''')
    out.append(market_close())

    return ''.join(out)


# ───────────────────────────────────────────────────────────────────────────
# Generate each page.
# ───────────────────────────────────────────────────────────────────────────
def build_page(template: str, match: dict) -> str:
    m = derive_markets(match)
    markets_html = build_markets(match, m)

    # 1) Title
    out = template.replace(
        "<title>VBet — Live · Manchester City vs Chelsea</title>",
        f'<title>VBet — Live · {match["home_full"]} vs {match["away_full"]}</title>',
    )
    # 2) Logos & names in event card header.
    # Replace the whole logo div so teams without a bundled crest (home_logo
    # is None) render an empty .logo chip rather than a broken <img>.
    def logo_div(logo):
        return f'<div class="logo"><img src="assets/{logo}" alt=""></div>' if logo else '<div class="logo"></div>'
    out = (out
        .replace('<div class="logo"><img src="assets/team-mancity.svg" alt=""></div>', '__HOME_LOGO_DIV__')
        .replace('<div class="logo"><img src="assets/team-chelsea.svg" alt=""></div>', '__AWAY_LOGO_DIV__')
        .replace('<p class="name">Manchester City</p>', '<p class="name">__HOME_NAME__</p>')
        .replace('<p class="name">Chelsea F. C.</p>',   '<p class="name">__AWAY_NAME__</p>')
        .replace('__HOME_LOGO_DIV__', logo_div(match["home_logo"]))
        .replace('__AWAY_LOGO_DIV__', logo_div(match["away_logo"]))
        .replace('__HOME_NAME__', match["home_full"])
        .replace('__AWAY_NAME__', match["away_full"])
    )
    # 3) Period & score
    out = out.replace("2nd Half | 68'", match["period_text"])
    out = out.replace("<span class=\"score\">2 : 1</span>", f'<span class="score">{match["score_h"]} : {match["score_a"]}</span>')

    # 4) Replace entire markets section (and inline script) with our generated one
    new_markets = (
        '  <!-- Markets List -->\n'
        '  <div class="markets" id="markets">\n'
        + markets_html
        + '  </div>\n\n'
        '  <script>\n'
        '    /* Click anywhere on the market header (or the row when collapsed)\n'
        '     * toggles .collapsed. Bet-option clicks bubble up through the popup\n'
        '     * handler in betslip-popup.js — no need to intercept them here. */\n'
        '    (function(){\n'
        '      const root = document.getElementById(\'markets\');\n'
        '      if (!root) return;\n'
        '      root.addEventListener(\'click\', function(e){\n'
        '        const titleRow = e.target.closest(\'.title-row\');\n'
        '        if (!titleRow) return;\n'
        '        if (e.target.closest(\'.pin\')) return;\n'
        '        const m = titleRow.closest(\'.market\');\n'
        '        if (m) m.classList.toggle(\'collapsed\');\n'
        '      });\n'
        '    })();\n'
        '  </script>\n'
    )

    # Match the existing markets block from "<!-- Markets List -->" through the closing </script> tag,
    # then up to the placeholder section (which begins with `<div class="placeholder-section"`).
    pattern = re.compile(
        r'  <!-- Markets List -->.*?</script>\s*\n',
        re.DOTALL,
    )
    if not pattern.search(out):
        raise SystemExit("Couldn't find markets block in template — anchors changed?")
    out = pattern.sub(new_markets, out, count=1)

    return out


def main():
    with open(TEMPLATE, "r", encoding="utf-8") as f:
        template = f.read()

    for match in MATCHES:
        page = build_page(template, match)
        target = os.path.join(ROOT, f"live-match-{match['id']}.html")
        with open(target, "w", encoding="utf-8") as f:
            f.write(page)
        print(f"wrote {target}")


if __name__ == "__main__":
    main()
