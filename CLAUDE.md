# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the project

```bash
node server.js        # serves on http://localhost:8000
```

No build step, no package manager, no dependencies. Open any `.html` file directly via the server (e.g. `http://localhost:8000/index.html`). The server adds `Cache-Control: no-cache` on all responses.

## Architecture overview

This is a **pure static prototype** of a mobile sportsbook app (375 px wide, dark theme). There is no framework, no bundler, and no separate CSS files — all styling is inline `<style>` blocks inside each HTML file.

### Pages and their roles

| File | View |
|---|---|
| `index.html` | Sports home / lobby |
| `home.html` | Casino home |
| `live.html` | Live betting list — cards rendered from the catalog by `catalog-render.js` |
| `match.html` | **Dynamic single-game detail for every sport.** Opened as `match.html?id=<matchId>`; `match-render.js` looks the match up in the catalog and builds the header + sport-appropriate markets client-side. One page for all matches — no per-match files. |
| `prematch-menu.html` | Pre-match country→league menu — tree rendered from the catalog by `catalog-render.js` |
| `prematch-games.html` | Pre-match games list — opened as `prematch-games.html?league=<leagueKey>`, rendered by `catalog-render.js` (the old `prematch-games-facup.html` is now a redirect to `?league=facup`) |
| `betslip.html` | Betslip (single/multiple tabs) |
| `betslip-multiple.html` | Multiple-bet betslip variant |
| `betslip-open-bets.html` | Open bets tab |

### Data catalog (the "backend")

`data/catalog.js` sets the global `window.VBET_DATA` — the single source of truth for **sports → regions/leagues → matches** (football, basketball, tennis, ice hockey, baseball, boxing, American football). Each match row carries an odds `anchor` (3-way `1`/`x`/`2` for football, hockey, boxing; 2-way `1`/`2` for basketball, tennis, baseball, American football) and a stable `seed`; every secondary market is **derived** from the anchor. Region→league hierarchy is country-based where it makes sense; tennis and boxing use International with tours / weight divisions as the "leagues". Lookup helpers hang off the object (`getMatch`, `byLeague`, `bySport`, `live`, `leaguesForSport`, …).

To add or edit a match, edit one row in `data/catalog.js` — no rebuild, no new files. IDs use bands `7xxxx` (live-ish) / `8xxxx` (prematch-ish) with the thousands digit per sport (football 70/80, basketball 71/81, tennis 72/82, hockey 73/83, baseball 74/84, boxing 75/85, American football 76/86); the `status` field is the real live/prematch discriminator.

Two renderers consume the catalog (both plain IIFEs, no deps):
- **`match-render.js`** — fills `match.html`'s mount points (`#event-main`, `#market-tabs`, `#markets`). Holds the per-sport market builders (Poisson-priced goals/points ladders, handicaps, set betting, etc.) ported from the old Python generators. Emits the exact `.market`/`.opt`/`.l`/`.o`/`.otbl` DOM the betslip popup expects, plus two hidden `.bnr-tn` spans so a market bet resolves the real team names. It also sets a per-sport hero banner on `.event-main` (`BANNERS` map): local `assets/ts-<sport>.png` art for football/basketball/tennis/hockey/boxing, and a generic remote keyword photo for baseball / American football (no bundled art) with the sport-accent gradient as a fallback layer.
- **`catalog-render.js`** — exposes `window.VBetList` with `live()`, `menu()`, `games()`, `comps()`, used by `live.html`, `prematch-menu.html`, `prematch-games.html`, `index.html`. Reproduces each page's existing card DOM and wires the sport chips to re-filter. On `prematch-games.html` the sport chips switch to that sport's first league, and the league pill is a dropdown switcher listing the current sport's leagues (each navigates to `?league=<key>`; the menu is appended to `<body>` with `position:fixed` so the comp-card's `overflow:hidden` doesn't clip it). `comps()` fills the `.competitions` "Top Competitions" chip row for the active sport — each chip is an `<a>` linking to `prematch-games.html?league=<key>`, and on `prematch-menu.html` it re-renders when the sport changes (so e.g. basketball never shows football leagues).

Load order on consuming pages: `data/catalog.js` → `sportbar.js` → the renderer → its bootstrap call.

### Shared JavaScript modules

Each JS file is an IIFE that injects its own CSS via `document.createElement('style')` and then replaces a placeholder element with rendered HTML. They are included via `<script src="...">` at the bottom of the pages that need them.

- **`nav.js`** — Injects the bottom navigation bar and sport-line subnav. Reads `#app-nav[data-page]` to set the active tab. Valid values: `home`, `live`, `prematch`, `betslip`, `history`, `casino`.
- **`sportbar.js`** — Injects the horizontal sport-filter chip row. Reads `#sport-bar[data-active]` to highlight the selected sport. Valid values: `football`, `basketball`, `baseball`, `boxing`, `amfootball`, `hockey`, `tabletennis`, `tennis`. Each chip gets a `data-sport` attribute (used by `catalog-render.js` to make chips filter the live/menu lists) and shows the live event count from `window.VBET_DATA` when the catalog is loaded.
- **`bs-tabs.js`** — Injects the Betslip / Open Bets tab switcher on betslip pages. Targets `[data-bs-tabs]` with value `betslip` or `openbets`.
- **`back-button.js`** — Styles `.back-btn` (32px ghost circle) and makes it step back through real history (href as fallback). On pages that have the "My Zone" subnav it also **hoists the back button into that row, at the far left (before the search button)**; pages without a subnav (e.g. `open-bets.html`) keep the back button in their own header.
- **`betslip-popup.js`** — Floating bet-placement popup. Activates on any click of `.bet-opt`, `.gw-bet-opt`, `.to-bet-opt`, or `.opt` that contains a child `.o` or `.to-bet-odds` element. Extracts team names and odds from the surrounding DOM using `CONTEXT_SELECTOR` and `ODD_SELECTOR` logic. Renders above the bottom nav at `z-index:80`. Hides the sport-line subnav (`body.bsp-open .sln-group`) while open.

### Design tokens

All pages declare identical CSS custom properties in `:root`. Key tokens:
- `--bg: #010c23` — primary background
- `--main: #d80d83` — brand pink (CTAs, active states)
- `--odds: #ffad29` — odds text colour
- `--green: #249f58` / `--red: #b4132b` — win/loss states
- White opacity scale: `--w-4` through `--w-100` (`rgba(255,255,255, N)`)
- Dark overlay scale: `--d-32` through `--d-80`

`prematch-menu.html` additionally defines per-sport accent colours (`--football`, `--basketball`, etc.), which match the `sportbar.js` accent dot colours.

### Asset naming

Assets in `assets/` fall into two categories:
- **Hash-named** (e.g. `8870c8992c4849c49f96ffb9b4eb1a7d18919ada.svg`) — referenced directly by SHA hash; treat as immutable.
- **Semantic-named** (e.g. `banner-arsenal-player.png`, `jk-ball-soccer.png`, `bn-sport-icon.svg`) — human-readable; safe to add new ones following the existing naming pattern.

### Bet option markup contract

`betslip-popup.js` relies on a specific DOM shape for 1X2 buttons:
```html
<div class="bet-opt">
  <span class="l">1</span>   <!-- label: "1", "x", "2" -->
  <span class="o">1.25</span> <!-- odds value -->
</div>
```
Outright options use class `to-bet-opt` with children `.to-bet-team` and `.to-bet-odds`. Breaking this structure will prevent the popup from parsing odds or identifying the selection.

On `match.html` the markets are a sibling of the event card, so the popup can't read team names from the surrounding DOM — `match-render.js` therefore appends two hidden `<span class="bnr-tn">` (home, away) which the popup's document-level fallback uses to label the bet. Keep emitting these when changing the match page.
