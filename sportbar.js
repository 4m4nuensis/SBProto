(function () {
  /* ─── inject shared CSS ─────────────────────────────────────────────────── */
  const style = document.createElement('style');
  style.textContent = `
.sport-bar{
  display:flex;align-items:center;gap:2px;
  padding:16px 8px 8px;
  overflow-x:auto;scrollbar-width:none;
  width:100%;
}
.sport-bar::-webkit-scrollbar{display:none}
.sport-filter{
  flex:none;width:72px;
  display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;
  background:transparent;
}
.sport-chip{
  position:relative;width:44px;height:44px;border-radius:999px;
  background:rgba(255,255,255,.08);
  display:flex;align-items:center;justify-content:center;
}
.sport-chip.selected{
  border:2px solid #109121;
  background:
    linear-gradient(-13.79deg, rgba(16,145,33,0.32) 11.9%, rgba(16,145,33,0) 88.5%),
    linear-gradient(90deg, rgba(255,255,255,.08), rgba(255,255,255,.08));
}
.sport-chip .ball{width:28px;height:28px;object-fit:contain;position:relative}
.sport-chip .count{
  position:absolute;top:-2px;left:28px;
  min-width:20px;height:16px;padding:0 3px;border-radius:70px;
  background:#010c23;
  display:flex;align-items:center;justify-content:center;
  font-family:'Rubik',system-ui,sans-serif;
  font-size:12px;line-height:16px;color:rgba(255,255,255,.8);
  z-index:2;
}
.sport-chip .accent{
  position:absolute;bottom:0;left:50%;transform:translateX(-50%);
  width:10px;height:2px;border-radius:20px;
}
.sport-chip .accent.football{background:#109121}
.sport-chip .accent.basketball{background:#ff9d2b}
.sport-chip .accent.baseball{background:#2e646c}
.sport-chip .accent.boxing{background:#006ec1}
.sport-chip .accent.amfootball{background:#ee5e56}
.sport-chip .accent.hockey{background:#3497bc}
.sport-chip .accent.tabletennis{background:#75932e}
.sport-chip .accent.tennis{background:#98943f}
.sport-filter .name{
  font-family:'Rubik',system-ui,sans-serif;
  font-size:12px;line-height:16px;letter-spacing:.4px;
  color:rgba(255,255,255,.64);text-align:center;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:72px;
}
`;
  document.head.appendChild(style);

  /* ─── render ────────────────────────────────────────────────────────────── */
  const placeholder = document.getElementById('sport-bar');
  if (!placeholder) return;

  const active = (placeholder.dataset.active || 'football').toLowerCase();

  const SPORTS = [
    { key: 'football',     name: 'Football',      ball: 'assets/sf-soccer.png' },
    { key: 'basketball',   name: 'Basketball',    ball: 'assets/sf-basketball.png' },
    { key: 'baseball',     name: 'Baseball',      ball: 'assets/gw-ic-baseball.svg' },
    { key: 'boxing',       name: 'Boxing',        ball: 'assets/gw-ic-boxing.svg' },
    { key: 'amfootball',   name: 'American Foot', ball: 'assets/gw-ic-amfootball.svg' },
    { key: 'hockey',       name: 'Ice Hockey',    ball: 'assets/gw-ic-hockey.svg' },
    { key: 'tabletennis',  name: 'Table Tennis',  ball: 'assets/sf-tabletennis.png' },
    { key: 'tennis',       name: 'Tennis',        ball: 'assets/sf-tennis.png' },
  ];

  // Live count per sport from the shared catalog when present; else placeholder.
  const D = window.VBET_DATA;
  function countFor(key) {
    return (D && D.sports && D.sports[key]) ? D.matches.filter(m => m.sport === key).length : 112;
  }

  function chip(s) {
    const isActive = s.key === active;
    const selected = isActive ? ' selected' : '';
    const accent = isActive ? '' : `<span class="accent ${s.key}"></span>`;
    return `
    <div class="sport-filter" data-sport="${s.key}">
      <div class="sport-chip${selected}">
        <img class="ball" src="${s.ball}" alt="">
        <span class="count">${countFor(s.key)}</span>
        ${accent}
      </div>
      <span class="name">${s.name}</span>
    </div>`;
  }

  placeholder.outerHTML = `
<div class="sport-bar">
  ${SPORTS.map(chip).join('')}
</div>`;
})();
