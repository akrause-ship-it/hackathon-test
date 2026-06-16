/* data.js — live MLB Stats API access (no key required) + caching.
 *
 * Public surface (all on window.MLB):
 *   currentSeason()                         -> calendar year (number)
 *   getLeaders(group, statKey)              -> Promise<{rows, season, fellBack, requestedSeason}>
 *
 * `getLeaders` resolves the right season automatically: it tries the current
 * season, and if there are no qualified leaders yet (early/offseason) it falls
 * back to the last completed season and flags `fellBack`. Responses are cached
 * per (group, stat, season) for the session. Network failures reject with a
 * tagged error so app.js can show the retry state.
 */
(function () {
  const BASE = 'https://statsapi.mlb.com/api/v1';

  const leaderCache = new Map();   // key: `${group}|${stat}|${season}` -> rows
  let teamMap = null;              // teamId -> abbreviation
  let teamMapPromise = null;

  const currentSeason = () => new Date().getFullYear();

  async function fetchJSON(url) {
    let res;
    try {
      res = await fetch(url, { headers: { accept: 'application/json' } });
    } catch (e) {
      const err = new Error('network'); err.kind = 'network'; throw err;
    }
    if (!res.ok) { const err = new Error('http'); err.kind = 'http'; err.status = res.status; throw err; }
    return res.json();
  }

  /* Build (once) a teamId -> abbreviation map so rows can show "HOU" etc.
   * The leaders endpoint only returns team id + name, not abbreviation. */
  async function getTeamMap() {
    if (teamMap) return teamMap;
    if (teamMapPromise) return teamMapPromise;
    teamMapPromise = fetchJSON(`${BASE}/teams?sportId=1`)
      .then(data => {
        teamMap = {};
        (data.teams || []).forEach(t => { if (t.id) teamMap[t.id] = t.abbreviation || t.teamCode || ''; });
        return teamMap;
      })
      .catch(() => ({}));   // abbreviation is cosmetic — fall back to team name
    return teamMapPromise;
  }

  /* Count decimal places in the leading value so gap formatting matches
   * (e.g. ".339" -> 3, "1.34" -> 2, "24" -> 0). */
  function decimalsOf(str) {
    const i = String(str).indexOf('.');
    return i === -1 ? 0 : String(str).length - i - 1;
  }

  /* Normalize the API's leaders[] into the row shape the UI consumes.
   * Cap to 10: the API returns ALL players tied at the cutoff (e.g. dozens at
   * a 1.000 fielding %), ignoring limit — the spec wants a top-10 list. */
  async function normalize(rawLeaders) {
    const leaders = rawLeaders.slice(0, 10);
    const teams = await getTeamMap();
    const dec = leaders.length ? decimalsOf(leaders[0].value) : 0;
    const firstNum = leaders.length ? Number(leaders[0].value) : 0;
    const lastNum = leaders.length ? Number(leaders[leaders.length - 1].value) : 0;
    const gap = Math.abs(firstNum - lastNum).toFixed(dec);
    const n = leaders.length;

    return leaders.map(l => ({
      rank: l.rank,
      name: l.person ? l.person.fullName : '—',
      personId: l.person ? l.person.id : null,
      team: (l.team && teams[l.team.id]) || (l.team && l.team.name) || '—',
      value: l.value,            // keep the API string for faithful display
      valueNum: Number(l.value),
      gap,
      n,
    }));
  }

  // opts: { apiKey } overrides the leaderCategories key (so two stats can share
  // one API category, e.g. putOuts), { position } filters by fielding position.
  async function fetchSeason(group, statKey, season, opts) {
    opts = opts || {};
    const apiKey = opts.apiKey || statKey;
    const pos = opts.position || '';
    const cacheKey = `${group}|${statKey}|${season}|${pos}`;
    if (leaderCache.has(cacheKey)) return leaderCache.get(cacheKey);

    let url = `${BASE}/stats/leaders?leaderCategories=${encodeURIComponent(apiKey)}`
      + `&season=${season}&sportId=1&limit=10&statGroup=${group}`;
    if (pos) url += `&position=${encodeURIComponent(pos)}`;
    const data = await fetchJSON(url);
    const block = (data.leagueLeaders || []).find(b => (b.leaders || []).length) || (data.leagueLeaders || [])[0];
    const rows = await normalize((block && block.leaders) || []);
    leaderCache.set(cacheKey, rows);
    return rows;
  }

  async function getLeaders(group, statKey, opts) {
    const season = currentSeason();
    let rows = await fetchSeason(group, statKey, season, opts);

    if (rows.length) return { rows, season, fellBack: false, requestedSeason: season };

    // Early/offseason: nothing yet this year — fall back to last completed season.
    const prev = season - 1;
    rows = await fetchSeason(group, statKey, prev, opts);
    return { rows, season: prev, fellBack: true, requestedSeason: season };
  }

  // Leaders for one specific season (cached). Used for the "last year" benchmark.
  function seasonLeaders(group, statKey, season, opts) { return fetchSeason(group, statKey, season, opts); }

  window.MLB = { currentSeason, getLeaders, seasonLeaders };
})();
