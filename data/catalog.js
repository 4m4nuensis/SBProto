/*
 * VBet prototype — match catalog (the "backend table").
 *
 * Single source of truth for sports → regions/leagues → matches. Consumed by:
 *   - match-render.js   (dynamic match detail page: match.html?id=…)
 *   - live.html, prematch-menu.html, prematch-games.html, index.html, onboarding-*
 *
 * Adding/editing a match = editing one row in `matches` below. No build step.
 *
 * Match row shape:
 *   { id, sport, league, status:'live'|'prematch',
 *     home:{short, full, logo|null}, away:{short, full, logo|null},
 *     start:'YYYY-MM-DDTHH:MM',                 // local kick-off
 *     live:{period, clock, score:[h,a]} ,       // present only when status==='live'
 *     anchor:{…},                               // primary line; shape depends on sport
 *     seed }                                    // stable RNG seed for derived markets
 *
 * `anchor` by sport:
 *   football / hockey : { '1':homeOdds, 'x':drawOdds, '2':awayOdds }   (3-way)
 *   basketball / tennis: { '1':homeOdds, '2':awayOdds }                (2-way, no draw)
 *
 * ID bands: 7xxxx = live-ish, 8xxxx = prematch-ish; thousands digit = sport
 *   football 70/80 · basketball 71/81 · tennis 72/82 · hockey 73/83
 *   (the `status` field is the real discriminator — bands are just for readability.)
 */
(function () {
  // Football crests that actually exist in assets/. Everything else → initials chip.
  var F = {
    arsenal:    { short: 'Arsenal',     full: 'Arsenal F. C.',           logo: 'team-arsenal.svg' },
    chelsea:    { short: 'Chelsea',     full: 'Chelsea F. C.',           logo: 'team-chelsea.svg' },
    liverpool:  { short: 'Liverpool',   full: 'Liverpool F. C.',         logo: 'team-liverpool.svg' },
    mancity:    { short: 'Man City',    full: 'Manchester City F. C.',   logo: 'team-mancity.svg' },
    manutd:     { short: 'Man United',  full: 'Manchester United F. C.', logo: 'team-manunited.svg' },
    newcastle:  { short: 'Newcastle',   full: 'Newcastle United F. C.',  logo: 'team-newcastle.svg' },
    astonvilla: { short: 'Aston Villa', full: 'Aston Villa F. C.',       logo: 'sew-aston-villa.png' },
    fulham:     { short: 'Fulham',      full: 'Fulham F. C.',            logo: 'sew-fulham.png' }
  };
  // Helper to declare a logo-less team inline.
  function t(short, full) { return { short: short, full: full || short, logo: null }; }

  window.VBET_DATA = {
    sports: {
      football:   { name: 'Football',   icon: 'assets/sf-soccer.png',    accent: '#109121', markets: 'football' },
      basketball: { name: 'Basketball', icon: 'assets/sf-basketball.png', accent: '#ff9d2b', markets: 'basketball' },
      tennis:     { name: 'Tennis',     icon: 'assets/sf-tennis.png',     accent: '#98943f', markets: 'tennis' },
      hockey:     { name: 'Ice Hockey', icon: 'assets/gw-ic-hockey.svg',  accent: '#3497bc', markets: 'hockey' },
      baseball:   { name: 'Baseball',   icon: 'assets/sf-baseball.png',   accent: '#2e646c', markets: 'baseball' },
      boxing:     { name: 'Boxing',     icon: 'assets/sf-boxing.png',     accent: '#006ec1', markets: 'boxing' },
      amfootball: { name: 'American Football', icon: 'assets/gw-ic-amfootball.svg', accent: '#ee5e56', markets: 'amfootball' }
    },

    // Regions = countries + international. flag: {img} | {css:<prematch-menu class>} | {code:'US'}
    regions: {
      england:   { name: 'England',       flag: { img: 'assets/gw-uk-flag.png' } },
      spain:     { name: 'Spain',         flag: { css: 'spain' } },
      germany:   { name: 'Germany',       flag: { css: 'germany' } },
      italy:     { name: 'Italy',         flag: { css: 'italy' } },
      usa:       { name: 'USA',           flag: { code: 'US' } },
      lithuania: { name: 'Lithuania',     flag: { code: 'LT' } },
      northam:   { name: 'North America', flag: { code: 'NA' } },
      sweden:    { name: 'Sweden',        flag: { code: 'SE' } },
      finland:   { name: 'Finland',       flag: { code: 'FI' } },
      japan:     { name: 'Japan',         flag: { code: 'JP' } },
      korea:     { name: 'South Korea',   flag: { code: 'KR' } },
      canada:    { name: 'Canada',        flag: { code: 'CA' } },
      intl:      { name: 'International',  flag: { css: 'europe' } }
    },

    // A league belongs to one sport + one region.
    leagues: {
      // ── Football ──────────────────────────────────────────────────────────
      epl:        { sport: 'football', region: 'england', name: 'Premier League', logo: 'assets/8ddde88a14c05073e82a89bb83d43439fc919b12.svg', seasonPct: 92 },
      facup:      { sport: 'football', region: 'england', name: 'FA Cup',          seasonPct: 80 },
      eflchamp:   { sport: 'football', region: 'england', name: 'EFL Championship', seasonPct: 90 },
      laliga:     { sport: 'football', region: 'spain',   name: 'LaLiga',          logo: 'assets/9c9abf6e522c806e7fddd46e7dbcbbb32e039ba7.svg', seasonPct: 91 },
      bundesliga: { sport: 'football', region: 'germany', name: 'Bundesliga',      logo: 'assets/6cfb141515b99fc022440cfb2472a0072ad85e7d.svg', seasonPct: 90 },
      seriea:     { sport: 'football', region: 'italy',   name: 'Serie A',         logo: 'assets/e32fe68a922b9aee1c912779df0b087583e9564d.svg', seasonPct: 91 },
      ucl:        { sport: 'football', region: 'intl',    name: 'UEFA Champions League', seasonPct: 88 },
      // ── Basketball ────────────────────────────────────────────────────────
      nba:        { sport: 'basketball', region: 'usa',       name: 'NBA',         seasonPct: 95 },
      acb:        { sport: 'basketball', region: 'spain',     name: 'Liga ACB',    seasonPct: 88 },
      euroleague: { sport: 'basketball', region: 'intl',      name: 'EuroLeague',  seasonPct: 90 },
      lkl:        { sport: 'basketball', region: 'lithuania', name: 'LKL',         seasonPct: 87 },
      // ── Tennis (tour / tournament hierarchy) ────────────────────────────────
      atp:        { sport: 'tennis', region: 'intl', name: 'ATP Tour',          seasonPct: 45 },
      wta:        { sport: 'tennis', region: 'intl', name: 'WTA Tour',          seasonPct: 45 },
      grandslam:  { sport: 'tennis', region: 'intl', name: 'Grand Slam',        seasonPct: 50 },
      masters:    { sport: 'tennis', region: 'intl', name: 'ATP Masters 1000',  seasonPct: 48 },
      // ── Ice Hockey ──────────────────────────────────────────────────────────
      nhl:        { sport: 'hockey', region: 'northam', name: 'NHL',   seasonPct: 96 },
      shl:        { sport: 'hockey', region: 'sweden',  name: 'SHL',   seasonPct: 89 },
      liiga:      { sport: 'hockey', region: 'finland', name: 'Liiga', seasonPct: 89 },
      khl:        { sport: 'hockey', region: 'intl',    name: 'KHL',   seasonPct: 90 },
      // ── Baseball ──────────────────────────────────────────────────────────
      mlb:        { sport: 'baseball', region: 'usa',   name: 'MLB',   seasonPct: 55 },
      npb:        { sport: 'baseball', region: 'japan', name: 'NPB',   seasonPct: 50 },
      kbo:        { sport: 'baseball', region: 'korea', name: 'KBO',   seasonPct: 52 },
      // ── Boxing (division "leagues", International) ───────────────────────────
      boxhw:      { sport: 'boxing', region: 'intl', name: 'Heavyweight',        seasonPct: 50 },
      boxsmw:     { sport: 'boxing', region: 'intl', name: 'Super Middleweight', seasonPct: 50 },
      boxlw:      { sport: 'boxing', region: 'intl', name: 'Lightweight',        seasonPct: 50 },
      boxww:      { sport: 'boxing', region: 'intl', name: 'Welterweight',       seasonPct: 50 },
      // ── American Football ───────────────────────────────────────────────────
      nfl:        { sport: 'amfootball', region: 'usa',    name: 'NFL',           seasonPct: 35 },
      ncaaf:      { sport: 'amfootball', region: 'usa',    name: 'NCAA Football', seasonPct: 30 },
      ufl:        { sport: 'amfootball', region: 'usa',    name: 'UFL',           seasonPct: 60 },
      cfl:        { sport: 'amfootball', region: 'canada', name: 'CFL',           seasonPct: 40 }
    },

    matches: [
      // ═══════════════ FOOTBALL ═══════════════
      // ── Premier League (England) ──
      { id: '70123', sport: 'football', league: 'epl', status: 'live',
        home: F.chelsea, away: F.astonvilla, start: '2026-06-04T15:00',
        live: { period: '2nd Half', clock: "73'", score: [3, 2] },
        anchor: { '1': 6.21, 'x': 3.12, '2': 1.88 }, seed: 70123 },
      { id: '70124', sport: 'football', league: 'epl', status: 'live',
        home: F.arsenal, away: F.liverpool, start: '2026-06-04T15:00',
        live: { period: '1st Half', clock: "13'", score: [0, 0] },
        anchor: { '1': 2.45, 'x': 3.20, '2': 2.95 }, seed: 70124 },
      { id: '70125', sport: 'football', league: 'epl', status: 'live',
        home: F.mancity, away: F.newcastle, start: '2026-06-04T15:00',
        live: { period: '2nd Half', clock: "86'", score: [3, 2] },
        anchor: { '1': 1.25, 'x': 8.50, '2': 12.40 }, seed: 70125 },
      { id: '70126', sport: 'football', league: 'epl', status: 'live',
        home: F.manutd, away: F.liverpool, start: '2026-06-04T15:00',
        live: { period: 'Half-Time', clock: "45'", score: [0, 2] },
        anchor: { '1': 4.75, 'x': 3.60, '2': 1.62 }, seed: 70126 },
      { id: '80201', sport: 'football', league: 'epl', status: 'prematch',
        home: F.mancity, away: F.chelsea, start: '2026-06-07T15:00',
        anchor: { '1': 1.25, 'x': 3.64, '2': 8.40 }, seed: 80201 },
      { id: '70127', sport: 'football', league: 'epl', status: 'live',
        home: F.fulham, away: F.astonvilla, start: '2026-06-04T15:00',
        live: { period: '2nd Half', clock: "65'", score: [2, 0] },
        anchor: { '1': 1.20, 'x': 6.50, '2': 15.00 }, seed: 70127 },
      { id: '70128', sport: 'football', league: 'epl', status: 'live',
        home: F.arsenal, away: F.chelsea, start: '2026-06-04T15:00',
        live: { period: '1st Half', clock: "42'", score: [1, 1] },
        anchor: { '1': 2.05, 'x': 3.40, '2': 3.25 }, seed: 70128 },
      { id: '70129', sport: 'football', league: 'epl', status: 'live',
        home: F.liverpool, away: F.mancity, start: '2026-06-04T15:00',
        live: { period: '1st Half', clock: "33'", score: [1, 0] },
        anchor: { '1': 2.10, 'x': 3.40, '2': 3.25 }, seed: 70129 },
      { id: '80202', sport: 'football', league: 'epl', status: 'prematch',
        home: F.astonvilla, away: F.liverpool, start: '2026-06-08T18:30',
        anchor: { '1': 3.60, 'x': 3.30, '2': 2.05 }, seed: 80202 },
      { id: '80203', sport: 'football', league: 'epl', status: 'prematch',
        home: F.arsenal, away: F.manutd, start: '2026-06-08T21:00',
        anchor: { '1': 2.10, 'x': 3.40, '2': 3.20 }, seed: 80203 },
      { id: '80204', sport: 'football', league: 'epl', status: 'prematch',
        home: F.fulham, away: F.newcastle, start: '2026-06-09T17:30',
        anchor: { '1': 1.85, 'x': 3.50, '2': 4.10 }, seed: 80204 },
      // ── FA Cup (England) ──
      { id: '80301', sport: 'football', league: 'facup', status: 'prematch',
        home: F.newcastle, away: F.fulham, start: '2026-06-06T16:00',
        anchor: { '1': 1.95, 'x': 3.40, '2': 3.80 }, seed: 80301 },
      { id: '80302', sport: 'football', league: 'facup', status: 'prematch',
        home: F.liverpool, away: F.arsenal, start: '2026-06-06T19:45',
        anchor: { '1': 2.20, 'x': 3.30, '2': 3.10 }, seed: 80302 },
      { id: '80303', sport: 'football', league: 'facup', status: 'prematch',
        home: F.chelsea, away: F.mancity, start: '2026-06-07T15:00',
        anchor: { '1': 4.20, 'x': 3.70, '2': 1.80 }, seed: 80303 },
      { id: '80304', sport: 'football', league: 'facup', status: 'prematch',
        home: F.manutd, away: F.astonvilla, start: '2026-06-07T17:30',
        anchor: { '1': 2.45, 'x': 3.35, '2': 2.80 }, seed: 80304 },
      // ── Championship (England) ──
      { id: '80401', sport: 'football', league: 'eflchamp', status: 'prematch',
        home: t('Leeds', 'Leeds United'), away: t('Leicester', 'Leicester City'), start: '2026-06-05T19:45',
        anchor: { '1': 2.30, 'x': 3.30, '2': 2.90 }, seed: 80401 },
      { id: '80402', sport: 'football', league: 'eflchamp', status: 'prematch',
        home: t('Southampton'), away: t('Norwich', 'Norwich City'), start: '2026-06-05T19:45',
        anchor: { '1': 1.90, 'x': 3.40, '2': 3.95 }, seed: 80402 },
      { id: '80403', sport: 'football', league: 'eflchamp', status: 'prematch',
        home: t('Sunderland'), away: t('Middlesbrough'), start: '2026-06-06T15:00',
        anchor: { '1': 2.05, 'x': 3.25, '2': 3.55 }, seed: 80403 },
      { id: '80404', sport: 'football', league: 'eflchamp', status: 'prematch',
        home: t('West Brom', 'West Bromwich Albion'), away: t('Coventry', 'Coventry City'), start: '2026-06-06T15:00',
        anchor: { '1': 2.50, 'x': 3.20, '2': 2.70 }, seed: 80404 },
      // ── LaLiga (Spain) ──
      { id: '70130', sport: 'football', league: 'laliga', status: 'live',
        home: t('Real Madrid', 'Real Madrid C. F.'), away: t('Barcelona', 'FC Barcelona'), start: '2026-06-04T20:00',
        live: { period: '2nd Half', clock: "68'", score: [2, 1] },
        anchor: { '1': 1.95, 'x': 3.60, '2': 3.90 }, seed: 70130 },
      { id: '80501', sport: 'football', league: 'laliga', status: 'prematch',
        home: t('Atlético', 'Atlético de Madrid'), away: t('Sevilla', 'Sevilla FC'), start: '2026-06-06T21:00',
        anchor: { '1': 1.70, 'x': 3.60, '2': 4.80 }, seed: 80501 },
      { id: '80502', sport: 'football', league: 'laliga', status: 'prematch',
        home: t('Real Sociedad'), away: t('Villarreal', 'Villarreal CF'), start: '2026-06-07T18:30',
        anchor: { '1': 2.40, 'x': 3.25, '2': 2.80 }, seed: 80502 },
      { id: '80503', sport: 'football', league: 'laliga', status: 'prematch',
        home: t('Valencia', 'Valencia CF'), away: t('Real Betis'), start: '2026-06-07T16:15',
        anchor: { '1': 2.65, 'x': 3.20, '2': 2.55 }, seed: 80503 },
      // ── Bundesliga (Germany) ──
      { id: '80601', sport: 'football', league: 'bundesliga', status: 'prematch',
        home: t('Bayern', 'FC Bayern München'), away: t('Dortmund', 'Borussia Dortmund'), start: '2026-06-06T18:30',
        anchor: { '1': 1.65, 'x': 4.00, '2': 4.50 }, seed: 80601 },
      { id: '80602', sport: 'football', league: 'bundesliga', status: 'prematch',
        home: t('Leverkusen', 'Bayer Leverkusen'), away: t('RB Leipzig'), start: '2026-06-06T15:30',
        anchor: { '1': 2.00, 'x': 3.70, '2': 3.40 }, seed: 80602 },
      { id: '80603', sport: 'football', league: 'bundesliga', status: 'prematch',
        home: t('Stuttgart', 'VfB Stuttgart'), away: t('Frankfurt', 'Eintracht Frankfurt'), start: '2026-06-07T17:30',
        anchor: { '1': 2.25, 'x': 3.50, '2': 2.95 }, seed: 80603 },
      { id: '80604', sport: 'football', league: 'bundesliga', status: 'prematch',
        home: t('Wolfsburg', 'VfL Wolfsburg'), away: t('Freiburg', 'SC Freiburg'), start: '2026-06-07T15:30',
        anchor: { '1': 2.55, 'x': 3.30, '2': 2.65 }, seed: 80604 },
      // ── Serie A (Italy) ──
      { id: '80701', sport: 'football', league: 'seriea', status: 'prematch',
        home: t('Inter', 'Inter Milan'), away: t('Juventus'), start: '2026-06-06T20:45',
        anchor: { '1': 2.10, 'x': 3.20, '2': 3.50 }, seed: 80701 },
      { id: '80702', sport: 'football', league: 'seriea', status: 'prematch',
        home: t('Milan', 'AC Milan'), away: t('Napoli', 'SSC Napoli'), start: '2026-06-07T18:00',
        anchor: { '1': 2.45, 'x': 3.25, '2': 2.80 }, seed: 80702 },
      { id: '80703', sport: 'football', league: 'seriea', status: 'prematch',
        home: t('Roma', 'AS Roma'), away: t('Lazio', 'SS Lazio'), start: '2026-06-07T20:45',
        anchor: { '1': 2.30, 'x': 3.10, '2': 3.20 }, seed: 80703 },
      { id: '80704', sport: 'football', league: 'seriea', status: 'prematch',
        home: t('Atalanta'), away: t('Fiorentina', 'ACF Fiorentina'), start: '2026-06-08T18:30',
        anchor: { '1': 1.80, 'x': 3.70, '2': 4.20 }, seed: 80704 },
      // ── UEFA Champions League (International) ──
      { id: '80801', sport: 'football', league: 'ucl', status: 'prematch',
        home: t('Real Madrid', 'Real Madrid C. F.'), away: t('Bayern', 'FC Bayern München'), start: '2026-06-09T21:00',
        anchor: { '1': 2.20, 'x': 3.50, '2': 3.05 }, seed: 80801 },
      { id: '80802', sport: 'football', league: 'ucl', status: 'prematch',
        home: F.mancity, away: t('PSG', 'Paris Saint-Germain'), start: '2026-06-09T21:00',
        anchor: { '1': 1.85, 'x': 3.80, '2': 3.90 }, seed: 80802 },
      { id: '80803', sport: 'football', league: 'ucl', status: 'prematch',
        home: t('Inter', 'Inter Milan'), away: F.arsenal, start: '2026-06-10T21:00',
        anchor: { '1': 2.75, 'x': 3.20, '2': 2.50 }, seed: 80803 },
      { id: '80804', sport: 'football', league: 'ucl', status: 'prematch',
        home: t('Barcelona', 'FC Barcelona'), away: F.liverpool, start: '2026-06-10T21:00',
        anchor: { '1': 2.40, 'x': 3.60, '2': 2.70 }, seed: 80804 },

      // ═══════════════ BASKETBALL ═══════════════
      // ── NBA (USA) ──
      { id: '71101', sport: 'basketball', league: 'nba', status: 'live',
        home: t('Lakers', 'Los Angeles Lakers'), away: t('Celtics', 'Boston Celtics'), start: '2026-06-04T02:30',
        live: { period: 'Q3', clock: '04:38', score: [71, 68] },
        anchor: { '1': 2.05, '2': 1.80 }, seed: 71101 },
      { id: '71102', sport: 'basketball', league: 'nba', status: 'live',
        home: t('Warriors', 'Golden State Warriors'), away: t('Nuggets', 'Denver Nuggets'), start: '2026-06-04T03:00',
        live: { period: 'Q2', clock: '07:12', score: [38, 41] },
        anchor: { '1': 1.72, '2': 2.15 }, seed: 71102 },
      { id: '81101', sport: 'basketball', league: 'nba', status: 'prematch',
        home: t('Bucks', 'Milwaukee Bucks'), away: t('Heat', 'Miami Heat'), start: '2026-06-05T01:00',
        anchor: { '1': 1.55, '2': 2.45 }, seed: 81101 },
      { id: '81102', sport: 'basketball', league: 'nba', status: 'prematch',
        home: t('Knicks', 'New York Knicks'), away: t('76ers', 'Philadelphia 76ers'), start: '2026-06-05T00:30',
        anchor: { '1': 1.90, '2': 1.95 }, seed: 81102 },
      { id: '81103', sport: 'basketball', league: 'nba', status: 'prematch',
        home: t('Suns', 'Phoenix Suns'), away: t('Mavericks', 'Dallas Mavericks'), start: '2026-06-05T03:30',
        anchor: { '1': 2.30, '2': 1.65 }, seed: 81103 },
      // ── Liga ACB (Spain) ──
      { id: '71201', sport: 'basketball', league: 'acb', status: 'live',
        home: t('Real Madrid'), away: t('Barça', 'FC Barcelona Bàsquet'), start: '2026-06-04T19:00',
        live: { period: 'Q4', clock: '02:05', score: [78, 80] },
        anchor: { '1': 1.85, '2': 2.00 }, seed: 71201 },
      { id: '81201', sport: 'basketball', league: 'acb', status: 'prematch',
        home: t('Baskonia'), away: t('Valencia', 'Valencia Basket'), start: '2026-06-06T18:00',
        anchor: { '1': 1.70, '2': 2.20 }, seed: 81201 },
      { id: '81202', sport: 'basketball', league: 'acb', status: 'prematch',
        home: t('Unicaja'), away: t('Gran Canaria'), start: '2026-06-06T20:30',
        anchor: { '1': 1.60, '2': 2.40 }, seed: 81202 },
      { id: '81203', sport: 'basketball', league: 'acb', status: 'prematch',
        home: t('Joventut', 'Joventut Badalona'), away: t('Tenerife', 'Lenovo Tenerife'), start: '2026-06-07T12:30',
        anchor: { '1': 2.50, '2': 1.58 }, seed: 81203 },
      // ── EuroLeague (International) ──
      { id: '71301', sport: 'basketball', league: 'euroleague', status: 'live',
        home: t('Olympiacos'), away: t('Panathinaikos'), start: '2026-06-04T19:15',
        live: { period: 'Q3', clock: '06:40', score: [52, 49] },
        anchor: { '1': 1.95, '2': 1.90 }, seed: 71301 },
      { id: '81301', sport: 'basketball', league: 'euroleague', status: 'prematch',
        home: t('Fenerbahçe'), away: t('Monaco', 'AS Monaco'), start: '2026-06-06T19:00',
        anchor: { '1': 1.75, '2': 2.10 }, seed: 81301 },
      { id: '81302', sport: 'basketball', league: 'euroleague', status: 'prematch',
        home: t('Real Madrid'), away: t('Maccabi', 'Maccabi Tel Aviv'), start: '2026-06-06T21:05',
        anchor: { '1': 1.50, '2': 2.60 }, seed: 81302 },
      { id: '81303', sport: 'basketball', league: 'euroleague', status: 'prematch',
        home: t('Žalgiris', 'Žalgiris Kaunas'), away: t('Barça', 'FC Barcelona Bàsquet'), start: '2026-06-07T18:00',
        anchor: { '1': 2.20, '2': 1.70 }, seed: 81303 },
      // ── LKL (Lithuania) ──
      { id: '81401', sport: 'basketball', league: 'lkl', status: 'prematch',
        home: t('Žalgiris', 'Žalgiris Kaunas'), away: t('Rytas', 'Rytas Vilnius'), start: '2026-06-06T17:00',
        anchor: { '1': 1.35, '2': 3.10 }, seed: 81401 },
      { id: '81402', sport: 'basketball', league: 'lkl', status: 'prematch',
        home: t('Neptūnas'), away: t('Lietkabelis'), start: '2026-06-06T19:30',
        anchor: { '1': 1.95, '2': 1.85 }, seed: 81402 },
      { id: '81403', sport: 'basketball', league: 'lkl', status: 'prematch',
        home: t('Šiauliai'), away: t('Jonava', 'CBet Jonava'), start: '2026-06-07T15:00',
        anchor: { '1': 2.10, '2': 1.72 }, seed: 81403 },

      // ═══════════════ TENNIS ═══════════════
      // ── ATP Tour ──
      { id: '72101', sport: 'tennis', league: 'atp', status: 'live',
        home: t('Alcaraz', 'Carlos Alcaraz'), away: t('Zverev', 'Alexander Zverev'), start: '2026-06-04T13:00',
        live: { period: 'Set 2', clock: '4-3', score: [1, 0] },
        anchor: { '1': 1.40, '2': 2.95 }, seed: 72101 },
      { id: '72102', sport: 'tennis', league: 'atp', status: 'live',
        home: t('Rune', 'Holger Rune'), away: t('Fritz', 'Taylor Fritz'), start: '2026-06-04T14:30',
        live: { period: 'Set 1', clock: '5-4', score: [0, 0] },
        anchor: { '1': 2.10, '2': 1.72 }, seed: 72102 },
      { id: '82101', sport: 'tennis', league: 'atp', status: 'prematch',
        home: t('Medvedev', 'Daniil Medvedev'), away: t('Rublev', 'Andrey Rublev'), start: '2026-06-06T12:00',
        anchor: { '1': 1.65, '2': 2.25 }, seed: 82101 },
      { id: '82102', sport: 'tennis', league: 'atp', status: 'prematch',
        home: t('De Minaur', 'Alex de Minaur'), away: t('Tsitsipas', 'Stefanos Tsitsipas'), start: '2026-06-06T14:00',
        anchor: { '1': 1.90, '2': 1.90 }, seed: 82102 },
      // ── WTA Tour ──
      { id: '72201', sport: 'tennis', league: 'wta', status: 'live',
        home: t('Świątek', 'Iga Świątek'), away: t('Gauff', 'Coco Gauff'), start: '2026-06-04T12:30',
        live: { period: 'Set 2', clock: '2-1', score: [1, 0] },
        anchor: { '1': 1.55, '2': 2.45 }, seed: 72201 },
      { id: '82201', sport: 'tennis', league: 'wta', status: 'prematch',
        home: t('Sabalenka', 'Aryna Sabalenka'), away: t('Rybakina', 'Elena Rybakina'), start: '2026-06-06T13:30',
        anchor: { '1': 1.70, '2': 2.15 }, seed: 82201 },
      { id: '82202', sport: 'tennis', league: 'wta', status: 'prematch',
        home: t('Pegula', 'Jessica Pegula'), away: t('Jabeur', 'Ons Jabeur'), start: '2026-06-06T15:30',
        anchor: { '1': 1.85, '2': 1.95 }, seed: 82202 },
      // ── Grand Slam ──
      { id: '72301', sport: 'tennis', league: 'grandslam', status: 'live',
        home: t('Sinner', 'Jannik Sinner'), away: t('Djokovic', 'Novak Djokovic'), start: '2026-06-04T15:00',
        live: { period: 'Set 3', clock: '3-2', score: [1, 1] },
        anchor: { '1': 1.50, '2': 2.60 }, seed: 72301 },
      { id: '82301', sport: 'tennis', league: 'grandslam', status: 'prematch',
        home: t('Alcaraz', 'Carlos Alcaraz'), away: t('Medvedev', 'Daniil Medvedev'), start: '2026-06-07T14:00',
        anchor: { '1': 1.45, '2': 2.75 }, seed: 82301 },
      { id: '82302', sport: 'tennis', league: 'grandslam', status: 'prematch',
        home: t('Świątek', 'Iga Świątek'), away: t('Sabalenka', 'Aryna Sabalenka'), start: '2026-06-07T16:00',
        anchor: { '1': 1.80, '2': 2.00 }, seed: 82302 },
      // ── ATP Masters 1000 ──
      { id: '82401', sport: 'tennis', league: 'masters', status: 'prematch',
        home: t('Zverev', 'Alexander Zverev'), away: t('Fritz', 'Taylor Fritz'), start: '2026-06-06T18:00',
        anchor: { '1': 1.75, '2': 2.10 }, seed: 82401 },
      { id: '82402', sport: 'tennis', league: 'masters', status: 'prematch',
        home: t('Rublev', 'Andrey Rublev'), away: t('Rune', 'Holger Rune'), start: '2026-06-06T20:00',
        anchor: { '1': 2.05, '2': 1.78 }, seed: 82402 },
      { id: '82403', sport: 'tennis', league: 'masters', status: 'prematch',
        home: t('Tsitsipas', 'Stefanos Tsitsipas'), away: t('Hurkacz', 'Hubert Hurkacz'), start: '2026-06-07T17:00',
        anchor: { '1': 1.68, '2': 2.20 }, seed: 82403 },

      // ═══════════════ ICE HOCKEY ═══════════════
      // ── NHL (North America) ──
      { id: '73101', sport: 'hockey', league: 'nhl', status: 'live',
        home: t('Maple Leafs', 'Toronto Maple Leafs'), away: t('Bruins', 'Boston Bruins'), start: '2026-06-04T00:00',
        live: { period: 'P2', clock: '08:24', score: [2, 1] },
        anchor: { '1': 2.20, 'x': 4.00, '2': 2.50 }, seed: 73101 },
      { id: '73102', sport: 'hockey', league: 'nhl', status: 'live',
        home: t('Oilers', 'Edmonton Oilers'), away: t('Avalanche', 'Colorado Avalanche'), start: '2026-06-04T01:30',
        live: { period: 'P1', clock: '12:10', score: [1, 0] },
        anchor: { '1': 2.05, 'x': 4.10, '2': 2.65 }, seed: 73102 },
      { id: '83101', sport: 'hockey', league: 'nhl', status: 'prematch',
        home: t('Rangers', 'New York Rangers'), away: t('Panthers', 'Florida Panthers'), start: '2026-06-05T00:00',
        anchor: { '1': 2.45, 'x': 4.05, '2': 2.25 }, seed: 83101 },
      { id: '83102', sport: 'hockey', league: 'nhl', status: 'prematch',
        home: t('Lightning', 'Tampa Bay Lightning'), away: t('Golden Knights', 'Vegas Golden Knights'), start: '2026-06-05T02:00',
        anchor: { '1': 2.15, 'x': 4.00, '2': 2.50 }, seed: 83102 },
      // ── SHL (Sweden) ──
      { id: '73201', sport: 'hockey', league: 'shl', status: 'live',
        home: t('Frölunda', 'Frölunda HC'), away: t('Färjestad', 'Färjestad BK'), start: '2026-06-04T18:00',
        live: { period: 'P3', clock: '05:55', score: [3, 2] },
        anchor: { '1': 2.10, 'x': 3.90, '2': 2.60 }, seed: 73201 },
      { id: '83201', sport: 'hockey', league: 'shl', status: 'prematch',
        home: t('Skellefteå', 'Skellefteå AIK'), away: t('Växjö', 'Växjö Lakers'), start: '2026-06-06T15:15',
        anchor: { '1': 1.95, 'x': 4.10, '2': 2.75 }, seed: 83201 },
      { id: '83202', sport: 'hockey', league: 'shl', status: 'prematch',
        home: t('Luleå', 'Luleå HF'), away: t('Rögle', 'Rögle BK'), start: '2026-06-06T15:15',
        anchor: { '1': 2.30, 'x': 3.95, '2': 2.35 }, seed: 83202 },
      // ── Liiga (Finland) ──
      { id: '83301', sport: 'hockey', league: 'liiga', status: 'prematch',
        home: t('Tappara'), away: t('Kärpät'), start: '2026-06-06T16:30',
        anchor: { '1': 1.90, 'x': 4.00, '2': 2.80 }, seed: 83301 },
      { id: '83302', sport: 'hockey', league: 'liiga', status: 'prematch',
        home: t('HIFK'), away: t('Ilves'), start: '2026-06-06T16:30',
        anchor: { '1': 2.25, 'x': 3.90, '2': 2.40 }, seed: 83302 },
      { id: '83303', sport: 'hockey', league: 'liiga', status: 'prematch',
        home: t('TPS'), away: t('Lukko'), start: '2026-06-07T15:00',
        anchor: { '1': 2.00, 'x': 3.95, '2': 2.65 }, seed: 83303 },
      // ── KHL (International) ──
      { id: '73401', sport: 'hockey', league: 'khl', status: 'live',
        home: t('CSKA', 'CSKA Moscow'), away: t('SKA', 'SKA Saint Petersburg'), start: '2026-06-04T16:30',
        live: { period: 'P2', clock: '14:02', score: [1, 1] },
        anchor: { '1': 2.15, 'x': 3.95, '2': 2.50 }, seed: 73401 },
      { id: '83401', sport: 'hockey', league: 'khl', status: 'prematch',
        home: t('Ak Bars', 'Ak Bars Kazan'), away: t('Metallurg', 'Metallurg Magnitogorsk'), start: '2026-06-06T14:00',
        anchor: { '1': 2.05, 'x': 3.90, '2': 2.60 }, seed: 83401 },
      { id: '83402', sport: 'hockey', league: 'khl', status: 'prematch',
        home: t('Dynamo', 'Dynamo Moscow'), away: t('Avangard', 'Avangard Omsk'), start: '2026-06-06T16:00',
        anchor: { '1': 2.35, 'x': 3.85, '2': 2.35 }, seed: 83402 },

      // ═══════════════ BASEBALL ═══════════════
      // ── MLB (USA) ──
      { id: '74101', sport: 'baseball', league: 'mlb', status: 'live',
        home: t('Yankees', 'New York Yankees'), away: t('Red Sox', 'Boston Red Sox'), start: '2026-06-04T00:05',
        live: { period: 'Top 6th', clock: '1 Out', score: [3, 2] },
        anchor: { '1': 1.85, '2': 2.05 }, seed: 74101 },
      { id: '74102', sport: 'baseball', league: 'mlb', status: 'live',
        home: t('Dodgers', 'Los Angeles Dodgers'), away: t('Giants', 'San Francisco Giants'), start: '2026-06-04T02:10',
        live: { period: 'Bot 4th', clock: '2 Out', score: [1, 1] },
        anchor: { '1': 1.65, '2': 2.30 }, seed: 74102 },
      { id: '84101', sport: 'baseball', league: 'mlb', status: 'prematch',
        home: t('Astros', 'Houston Astros'), away: t('Braves', 'Atlanta Braves'), start: '2026-06-05T00:10',
        anchor: { '1': 2.10, '2': 1.78 }, seed: 84101 },
      { id: '84102', sport: 'baseball', league: 'mlb', status: 'prematch',
        home: t('Cubs', 'Chicago Cubs'), away: t('Mets', 'New York Mets'), start: '2026-06-05T00:05',
        anchor: { '1': 1.95, '2': 1.92 }, seed: 84102 },
      { id: '84103', sport: 'baseball', league: 'mlb', status: 'prematch',
        home: t('Yankees', 'New York Yankees'), away: t('Dodgers', 'Los Angeles Dodgers'), start: '2026-06-06T23:05',
        anchor: { '1': 2.05, '2': 1.82 }, seed: 84103 },
      // ── NPB (Japan) ──
      { id: '74201', sport: 'baseball', league: 'npb', status: 'live',
        home: t('Yomiuri Giants'), away: t('Hanshin Tigers'), start: '2026-06-04T09:00',
        live: { period: 'Top 7th', clock: '0 Out', score: [2, 4] },
        anchor: { '1': 2.20, '2': 1.70 }, seed: 74201 },
      { id: '84201', sport: 'baseball', league: 'npb', status: 'prematch',
        home: t('SoftBank Hawks'), away: t('Yakult Swallows'), start: '2026-06-06T09:00',
        anchor: { '1': 1.75, '2': 2.15 }, seed: 84201 },
      { id: '84202', sport: 'baseball', league: 'npb', status: 'prematch',
        home: t('Hiroshima Carp'), away: t('Chunichi Dragons'), start: '2026-06-06T09:00',
        anchor: { '1': 1.95, '2': 1.90 }, seed: 84202 },
      // ── KBO (South Korea) ──
      { id: '74301', sport: 'baseball', league: 'kbo', status: 'live',
        home: t('KIA Tigers'), away: t('SSG Landers'), start: '2026-06-04T09:30',
        live: { period: 'Bot 5th', clock: '2 Out', score: [5, 3] },
        anchor: { '1': 1.60, '2': 2.40 }, seed: 74301 },
      { id: '84301', sport: 'baseball', league: 'kbo', status: 'prematch',
        home: t('LG Twins'), away: t('Doosan Bears'), start: '2026-06-06T09:30',
        anchor: { '1': 1.88, '2': 1.98 }, seed: 84301 },
      { id: '84302', sport: 'baseball', league: 'kbo', status: 'prematch',
        home: t('KT Wiz'), away: t('Samsung Lions'), start: '2026-06-06T09:30',
        anchor: { '1': 2.05, '2': 1.82 }, seed: 84302 },

      // ═══════════════ BOXING ═══════════════
      // ── Heavyweight ──
      { id: '75101', sport: 'boxing', league: 'boxhw', status: 'live',
        home: t('Usyk', 'Oleksandr Usyk'), away: t('Fury', 'Tyson Fury'), start: '2026-06-04T21:30',
        live: { period: 'Round 7', clock: '1:32', score: [0, 0] },
        anchor: { '1': 1.85, 'x': 18.0, '2': 2.00 }, seed: 75101 },
      { id: '85101', sport: 'boxing', league: 'boxhw', status: 'prematch',
        home: t('Joshua', 'Anthony Joshua'), away: t('Dubois', 'Daniel Dubois'), start: '2026-06-07T22:00',
        anchor: { '1': 1.55, 'x': 21.0, '2': 2.45 }, seed: 85101 },
      { id: '85102', sport: 'boxing', league: 'boxhw', status: 'prematch',
        home: t('Zhang', 'Zhilei Zhang'), away: t('Hrgović', 'Filip Hrgović'), start: '2026-06-08T21:00',
        anchor: { '1': 2.10, 'x': 19.0, '2': 1.78 }, seed: 85102 },
      // ── Super Middleweight ──
      { id: '85201', sport: 'boxing', league: 'boxsmw', status: 'prematch',
        home: t('Canelo', 'Canelo Álvarez'), away: t('Benavidez', 'David Benavidez'), start: '2026-06-07T23:00',
        anchor: { '1': 2.05, 'x': 20.0, '2': 1.80 }, seed: 85201 },
      { id: '85202', sport: 'boxing', league: 'boxsmw', status: 'prematch',
        home: t('Charlo', 'Jermall Charlo'), away: t('Plant', 'Caleb Plant'), start: '2026-06-08T23:00',
        anchor: { '1': 1.90, 'x': 18.0, '2': 1.95 }, seed: 85202 },
      // ── Lightweight ──
      { id: '75301', sport: 'boxing', league: 'boxlw', status: 'live',
        home: t('Davis', 'Gervonta Davis'), away: t('Haney', 'Devin Haney'), start: '2026-06-04T22:15',
        live: { period: 'Round 5', clock: '0:48', score: [0, 0] },
        anchor: { '1': 1.70, 'x': 17.0, '2': 2.20 }, seed: 75301 },
      { id: '85301', sport: 'boxing', league: 'boxlw', status: 'prematch',
        home: t('Stevenson', 'Shakur Stevenson'), away: t('Lomachenko', 'Vasiliy Lomachenko'), start: '2026-06-07T22:30',
        anchor: { '1': 1.80, 'x': 19.0, '2': 2.05 }, seed: 85301 },
      // ── Welterweight ──
      { id: '85401', sport: 'boxing', league: 'boxww', status: 'prematch',
        home: t('Crawford', 'Terence Crawford'), away: t('Ennis', 'Jaron Ennis'), start: '2026-06-08T22:00',
        anchor: { '1': 1.65, 'x': 20.0, '2': 2.30 }, seed: 85401 },
      { id: '85402', sport: 'boxing', league: 'boxww', status: 'prematch',
        home: t('Spence', 'Errol Spence Jr.'), away: t('Barrios', 'Mario Barrios'), start: '2026-06-08T22:45',
        anchor: { '1': 2.00, 'x': 18.0, '2': 1.85 }, seed: 85402 },

      // ═══════════════ AMERICAN FOOTBALL ═══════════════
      // ── NFL (USA) ──
      { id: '76101', sport: 'amfootball', league: 'nfl', status: 'live',
        home: t('Chiefs', 'Kansas City Chiefs'), away: t('Bills', 'Buffalo Bills'), start: '2026-06-04T01:20',
        live: { period: 'Q3', clock: '07:21', score: [21, 17] },
        anchor: { '1': 1.75, '2': 2.10 }, seed: 76101 },
      { id: '76102', sport: 'amfootball', league: 'nfl', status: 'live',
        home: t('Eagles', 'Philadelphia Eagles'), away: t('Cowboys', 'Dallas Cowboys'), start: '2026-06-04T00:15',
        live: { period: 'Q2', clock: '03:44', score: [10, 7] },
        anchor: { '1': 1.90, '2': 1.95 }, seed: 76102 },
      { id: '86101', sport: 'amfootball', league: 'nfl', status: 'prematch',
        home: t('49ers', 'San Francisco 49ers'), away: t('Lions', 'Detroit Lions'), start: '2026-06-06T01:20',
        anchor: { '1': 1.80, '2': 2.05 }, seed: 86101 },
      { id: '86102', sport: 'amfootball', league: 'nfl', status: 'prematch',
        home: t('Ravens', 'Baltimore Ravens'), away: t('Bengals', 'Cincinnati Bengals'), start: '2026-06-07T17:00',
        anchor: { '1': 1.95, '2': 1.90 }, seed: 86102 },
      // ── NCAA Football (USA) ──
      { id: '76201', sport: 'amfootball', league: 'ncaaf', status: 'live',
        home: t('Texas', 'Texas Longhorns'), away: t('Oklahoma', 'Oklahoma Sooners'), start: '2026-06-04T00:00',
        live: { period: 'Q4', clock: '05:12', score: [24, 21] },
        anchor: { '1': 1.55, '2': 2.45 }, seed: 76201 },
      { id: '86201', sport: 'amfootball', league: 'ncaaf', status: 'prematch',
        home: t('Georgia', 'Georgia Bulldogs'), away: t('Alabama', 'Alabama Crimson Tide'), start: '2026-06-06T20:00',
        anchor: { '1': 1.70, '2': 2.20 }, seed: 86201 },
      { id: '86202', sport: 'amfootball', league: 'ncaaf', status: 'prematch',
        home: t('Michigan', 'Michigan Wolverines'), away: t('Ohio State', 'Ohio State Buckeyes'), start: '2026-06-06T23:30',
        anchor: { '1': 2.05, '2': 1.80 }, seed: 86202 },
      // ── UFL (USA) ──
      { id: '86301', sport: 'amfootball', league: 'ufl', status: 'prematch',
        home: t('Stallions', 'Birmingham Stallions'), away: t('Panthers', 'Michigan Panthers'), start: '2026-06-06T22:00',
        anchor: { '1': 1.85, '2': 1.98 }, seed: 86301 },
      { id: '86302', sport: 'amfootball', league: 'ufl', status: 'prematch',
        home: t('Battlehawks', 'St. Louis Battlehawks'), away: t('Defenders', 'DC Defenders'), start: '2026-06-07T18:00',
        anchor: { '1': 1.92, '2': 1.92 }, seed: 86302 },
      // ── CFL (Canada) ──
      { id: '86401', sport: 'amfootball', league: 'cfl', status: 'prematch',
        home: t('Argonauts', 'Toronto Argonauts'), away: t('BC Lions'), start: '2026-06-06T23:00',
        anchor: { '1': 2.00, '2': 1.85 }, seed: 86401 },
      { id: '86402', sport: 'amfootball', league: 'cfl', status: 'prematch',
        home: t('Blue Bombers', 'Winnipeg Blue Bombers'), away: t('Alouettes', 'Montreal Alouettes'), start: '2026-06-07T20:00',
        anchor: { '1': 1.78, '2': 2.10 }, seed: 86402 }
    ]
  };

  /* ──────────── tiny lookup helpers shared by every consumer ──────────── */
  var D = window.VBET_DATA;
  D.getMatch    = function (id) { return D.matches.filter(function (m) { return m.id === id; })[0] || null; };
  D.getLeague   = function (key) { return D.leagues[key] || null; };
  D.getRegion   = function (key) { return D.regions[key] || null; };
  D.getSport    = function (key) { return D.sports[key] || null; };
  D.bySport     = function (sport) { return D.matches.filter(function (m) { return m.sport === sport; }); };
  D.byLeague    = function (key) { return D.matches.filter(function (m) { return m.league === key; }); };
  D.live        = function (sport) { return D.matches.filter(function (m) { return m.status === 'live' && (!sport || m.sport === sport); }); };
  D.prematch    = function (sport) { return D.matches.filter(function (m) { return m.status === 'prematch' && (!sport || m.sport === sport); }); };
  // Leagues for a sport, in declaration order, with their region resolved.
  D.leaguesForSport = function (sport) {
    return Object.keys(D.leagues)
      .filter(function (k) { return D.leagues[k].sport === sport; })
      .map(function (k) { return Object.assign({ key: k }, D.leagues[k]); });
  };
  D.countForLeague = function (key) { return D.byLeague(key).length; };
})();
