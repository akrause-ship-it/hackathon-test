/* app.js — state + wiring. Drives the whole UI from STAT_CONFIG and live data.
 *
 * Flow: group tab -> loads that group's 5 stat chips + swaps sprite action.
 *       stat chip  -> fetches live top-10 leaders, auto-selects #1.
 *       player row -> re-renders explainer/sprite value + replays the field demo.
 * Default on load: Offense -> Home Runs -> #1 leader.
 */
(function () {
  const $ = id => document.getElementById(id);

  // ---- state ----
  let G = 'hitting';     // active group
  let S = 'homeRuns';    // active stat (default per spec section 8)
  let P = 0;             // selected player index
  let rows = [];         // current leaders
  let prevRef = null;    // previous-season leader benchmark { season, hi, lo }
  let paceFrac = 1;      // how far into the shown season we are (for "last year's pace")
  let loadToken = 0;     // guards against out-of-order async loads

  // Rough fraction of the MLB regular season elapsed (≈ late Mar → end Sep),
  // used to prorate last year's cumulative totals to "today's" pace.
  function seasonFraction() {
    const now = new Date(), yr = now.getFullYear();
    const start = new Date(yr, 2, 20), end = new Date(yr, 8, 30);
    return Math.max(0.05, Math.min(1, (now - start) / (end - start)));
  }

  // ---------------------------------------------------------------- chips
  function renderChips() {
    // prominent full-name title for the active stat (spell out the acronym)
    const active = window.STAT_CONFIG[G].stats[S];
    $('st-abbr').textContent = active.name;
    $('st-full').textContent = active.full;

    const box = $('chips');
    box.innerHTML = '';
    Object.entries(window.STAT_CONFIG[G].stats).forEach(([key, cfg]) => {
      const b = document.createElement('button');
      b.className = 'chip' + (key === S ? ' on' : '');
      b.textContent = cfg.name;
      b.title = cfg.full;
      b.type = 'button';
      b.onclick = () => { if (key === S) return; S = key; P = 0; load(); };
      box.appendChild(b);
    });
  }

  // ---------------------------------------------------------------- picker
  function renderList() {
    const l = $('plist');
    l.innerHTML = '';
    rows.forEach((r, i) => {
      const d = document.createElement('div');
      d.className = 'prow' + (i === P ? ' on' : '');
      d.setAttribute('role', 'option');
      d.setAttribute('aria-selected', String(i === P));
      d.tabIndex = 0;
      d.innerHTML =
        `<span class="rank">${String(r.rank).padStart(2, '0')}</span>
         <span class="who"><span class="nm">${r.name}</span><span class="tm">${r.team}</span></span>
         <span class="vl">${r.value}</span>`;
      const pick = () => { P = i; renderList(); renderPlayer(); playDemo(); };
      d.onclick = pick;
      d.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } };
      l.appendChild(d);
    });
    renderChart();
  }

  // ------------------------------------------------------------ explainer
  function renderPlayer() {
    const cfg = window.STAT_CONFIG[G].stats[S];
    const r = rows[P];
    if (!r) return;
    $('pname').textContent = r.name;
    $('pteam').textContent = r.team;
    $('pstat').childNodes[0].nodeValue = r.value;
    $('pstatlab').textContent = cfg.full;
    $('ex-mean').textContent = cfg.mean;
    $('ex-play').textContent = cfg.play;
    $('ex-elite').innerHTML = cfg.elite(r);
    renderPrev();
  }

  // last-season benchmark line for the elite block (set asynchronously in load)
  function renderPrev() {
    const el = $('ex-prev');
    if (!el) return;
    if (prevRef) {
      el.textContent = `For reference — ${prevRef.season} top 10 ranged from ${prevRef.hi.value} (#1, ${prevRef.hi.name}) to ${prevRef.lo.value} (#${prevRef.lo.rank}).`;
    } else {
      el.textContent = '';
    }
  }

  // -------------------------------------------------------------- bar chart
  const decimalsOf = s => { const i = String(s).indexOf('.'); return i < 0 ? 0 : String(s).length - i - 1; };
  const fmtNum = v => v.toFixed(rows.length ? decimalsOf(rows[0].value) : 0);

  function renderChart() {
    const host = $('chart');
    if (!host) return;
    if (!rows.length) { host.innerHTML = ''; return; }

    const W = 320, H = 176, padL = 6, padR = 56, padT = 18, padB = 22;
    const plotW = W - padL - padR, plotH = H - padT - padB;
    const cfg = window.STAT_CONFIG[G].stats[S];
    const vals = rows.map(r => r.valueNum);

    // last-year reference marks: prorated to today's pace for cumulative stats,
    // actual final value for rate stats. Folded into the domain so they show.
    const marks = [];
    if (prevRef) {
      const f = cfg.cumulative ? paceFrac : 1;
      const sfx = cfg.cumulative ? ' pace' : '';
      const yr = `'${String(prevRef.season).slice(2)}`;
      marks.push({ tag: `${yr} #1${sfx}`, v: Number(prevRef.hi.value) * f });
      marks.push({ tag: `${yr} #${prevRef.lo.rank}${sfx}`, v: Number(prevRef.lo.value) * f });
    }

    const domainVals = vals.concat(marks.map(m => m.v));
    let dmin = Math.min(...domainVals), dmax = Math.max(...domainVals);
    let range = dmax - dmin; if (range <= 0) range = dmax || 1;
    const lo = Math.max(0, dmin - range * 0.14), hi = dmax + range * 0.12;
    const span = (hi - lo) || 1;
    const y = v => padT + plotH * (1 - (v - lo) / span);
    const n = rows.length, slot = plotW / n, bw = Math.min(slot * 0.62, 24);

    let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Top ${n} values">`;
    s += `<line x1="${padL}" y1="${padT + plotH}" x2="${padL + plotW}" y2="${padT + plotH}" stroke="var(--line)"/>`;
    s += `<text x="${padL + plotW + 5}" y="${padT + 4}" class="cax">${fmtNum(hi)}</text>`;
    s += `<text x="${padL + plotW + 5}" y="${padT + plotH}" class="cax">${fmtNum(lo)}</text>`;

    // last-year reference lines (pace-adjusted for cumulative stats)
    marks.forEach(m => {
      if (m.v >= lo && m.v <= hi) {
        const yy = y(m.v).toFixed(1);
        s += `<line x1="${padL}" y1="${yy}" x2="${padL + plotW}" y2="${yy}" stroke="var(--accent)" stroke-dasharray="3 3" opacity="0.65"/>`;
        s += `<text x="${padL + plotW + 5}" y="${(+yy + 3).toFixed(1)}" class="cref">${m.tag}</text>`;
      }
    });

    rows.forEach((r, i) => {
      const x = padL + slot * i + (slot - bw) / 2;
      const yy = y(r.valueNum), bh = padT + plotH - yy, on = i === P;
      s += `<rect class="cbar${on ? ' on' : ''}" data-i="${i}" x="${x.toFixed(1)}" y="${yy.toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(1, bh).toFixed(1)}" rx="2"><title>${r.name} — ${r.value}</title></rect>`;
      s += `<text x="${(x + bw / 2).toFixed(1)}" y="${(yy - 3).toFixed(1)}" class="cval${on ? ' on' : ''}">${r.value}</text>`;
      s += `<text x="${(x + bw / 2).toFixed(1)}" y="${padT + plotH + 11}" class="crank">${r.rank}</text>`;
    });
    s += `</svg>`;

    let cap = cfg.inv ? '↓ lower is better' : '↑ higher is better';
    if (prevRef) cap += cfg.cumulative
      ? ` · dashed = '${String(prevRef.season).slice(2)} pace (~${Math.round(paceFrac * 100)}% through season)`
      : ` · dashed = '${String(prevRef.season).slice(2)} actual`;
    s += `<p class="chart-cap">${cap}</p>`;
    host.innerHTML = s;
  }

  // -------------------------------------------------------------- visuals
  function playDemo() {
    window.Scene.play({ group: G, anim: window.STAT_CONFIG[G].stats[S].anim });
  }

  // ------------------------------------------------------ notice helpers
  function showNotice(html, withRetry) {
    const n = $('notice');
    n.hidden = false;
    n.className = 'notice' + (withRetry ? ' error' : '');
    n.innerHTML = html + (withRetry ? ' <button type="button" id="retry" class="retrybtn">Retry</button>' : '');
    if (withRetry) $('retry').onclick = load;
  }
  function clearNotice() { const n = $('notice'); n.hidden = true; n.innerHTML = ''; }

  // --------------------------------------------------------------- load
  async function load() {
    const token = ++loadToken;
    renderChips();                          // the ballpark scene self-renders via rAF

    // loading state
    clearNotice();
    showNotice('Loading live leaders…', false);
    $('plist').innerHTML = '';

    try {
      const { rows: data, season, fellBack, requestedSeason } = await window.MLB.getLeaders(G, S);
      if (token !== loadToken) return;       // a newer load superseded this one

      rows = data;
      P = 0;
      // a completed (fallen-back) season is 100% done; the live year is prorated
      paceFrac = (season < window.MLB.currentSeason()) ? 1 : seasonFraction();

      // header + picker season labels
      $('season-label').textContent = `${season} Season`;
      $('picker-season').textContent = `${season} season`;

      if (!rows.length) {
        showNotice(`No ${requestedSeason} leaders for this stat yet.`, false);
        $('feed-note').textContent = 'live · statsapi.mlb.com';
        return;
      }

      if (fellBack) {
        showNotice(`No ${requestedSeason} leaders yet. Showing ${season}.`, false);
        $('feed-note').textContent = `live · showing ${season}`;
      } else {
        clearNotice();
        $('feed-note').textContent = 'live · statsapi.mlb.com';
      }

      prevRef = null;                         // reset; filled in async below
      renderList();
      renderPlayer();
      playDemo();

      // Best-effort: pull the previous season's leader for this stat as a benchmark.
      const refSeason = season - 1;
      window.MLB.seasonLeaders(G, S, refSeason)
        .then(prev => {
          if (token !== loadToken) return;    // stat/group changed meanwhile
          if (prev && prev.length) {
            const last = prev[prev.length - 1];
            prevRef = {
              season: refSeason,
              hi: { value: prev[0].value, name: prev[0].name },
              lo: { value: last.value, name: last.name, rank: last.rank },
            };
          } else { prevRef = null; }
          renderPrev();
          renderChart();                       // overlay last-year marks if on scale
        })
        .catch(() => { if (token === loadToken) { prevRef = null; renderPrev(); renderChart(); } });
    } catch (err) {
      if (token !== loadToken) return;
      $('feed-note').textContent = 'offline';
      showNotice("Couldn't reach the MLB stat feed. Check your connection and retry.", true);
    }
  }

  // --------------------------------------------------------------- events
  $('tabs').onclick = e => {
    const b = e.target.closest('.tab');
    if (!b) return;
    document.querySelectorAll('.tab').forEach(t => {
      t.classList.remove('on'); t.setAttribute('aria-selected', 'false');
    });
    b.classList.add('on'); b.setAttribute('aria-selected', 'true');
    G = b.dataset.g;
    S = Object.keys(window.STAT_CONFIG[G].stats)[0];   // first stat of the group
    P = 0;
    load();
  };

  $('run').onclick = () => { if (rows.length) playDemo(); };

  // select a player by clicking their bar in the chart
  $('chart').addEventListener('click', e => {
    const bar = e.target.closest('.cbar');
    if (!bar) return;
    P = +bar.dataset.i;
    renderList(); renderPlayer(); playDemo();
  });

  // boot
  window.Scene.mount($('scene'));
  load();
})();
