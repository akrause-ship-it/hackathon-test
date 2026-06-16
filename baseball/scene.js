/* scene.js — a unified side-view 8-bit ballpark on a <canvas>.
 *
 * Recreates the retro pixel-art baseball look (in the spirit of Fraser
 * Davidson's "8-bit Baseball") as ORIGINAL art: a side-on field with a pixel
 * batter, pitcher, catcher, outfield fence, crowd and scoreboard. The player
 * figure lives in-scene (the old separate sprite column is gone).
 *
 * Per-stat plays are reinterpreted side-on (HR arcs over the fence, K is a
 * swing-and-miss, SB is a baserunner dash, fielding plays show a fielder, etc.)
 * and are driven by the ANIM table below. play() runs a timeline then settles
 * on the play's end frame; prefers-reduced-motion draws a single static frame.
 *
 *   Layout math uses a 64x40 "world unit" grid (GW/GH). Drawing renders at RES
 *   canvas px per world unit, snapped to a Q-px art-pixel grid. Q is the single
 *   "chunkiness" dial — smaller Q = finer pixels + more fluid motion.
 *
 * Public surface (window.Scene):
 *   mount(canvas)            -> attach + draw the initial frame
 *   play({ group, anim })    -> run the play for that stat
 */
(function () {
  const GW = 64, GH = 40;        // world units (layout grid)
  const RES = 16;                // canvas px per world unit -> 1024x640
  const Q = 3;                   // art-pixel size in canvas px (the chunkiness dial)
  const reduceMotion = () =>
    window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // palette
  const C = {
    skyTop: '#9ad9ff', skyLow: '#cdeeff',
    grass: '#3d7a3d', grassDk: '#326632',
    dirt: '#c08a4a', dirtDk: '#a8753a',
    fence: '#21402b', fenceCap: '#ffd23f',
    wall: '#14202e', board: '#0d1420', boardLit: '#ffd23f',
    cloud: '#ffffff', sun: '#ffe066',
    skin: '#ffc48a', ball: '#ffffff', hitBall: '#ffd23f',
    glove: '#7a4a1f', out: '#ff5a5a', cheer: '#ffd23f',
  };
  const TEAM = { hitting: '#ff5a5a', pitching: '#41c6ff', fielding: '#ffd23f' };

  // key spots (world units)
  const GROUND = 27;             // grass top / feet line
  const CAT_X = 6, PIT_X = 35, FENCE_X = 57, BAT_CENTER = 12;
  const HAND = [33, 19], PLATE = [15, 23], CONTACT = [16, 22];

  let canvas, ctx;
  let state = { group: 'hitting', anim: 'hr', playing: false, t0: 0, dur: 0, raf: 0, settle: 0, cheer: 0 };

  // ---- helpers -----------------------------------------------------------
  const lerp = (a, b, t) => a + (b - a) * t;
  // fill a rect given in world units, snapped to the Q art-pixel grid
  function cell(x, y, w, h, color) {
    const X = Math.round(x * RES / Q) * Q, Y = Math.round(y * RES / Q) * Q;
    const W = Math.max(Q, Math.round(w * RES / Q) * Q), H = Math.max(Q, Math.round(h * RES / Q) * Q);
    ctx.fillStyle = color;
    ctx.fillRect(X, Y, W, H);
  }
  function along(pts, p) {        // walk a point along a polyline by progress p
    if (p <= 0) return pts[0];
    if (p >= 1) return pts[pts.length - 1];
    const segs = pts.length - 1, f = p * segs, i = Math.floor(f), t = f - i;
    return [lerp(pts[i][0], pts[i + 1][0], t), lerp(pts[i][1], pts[i + 1][1], t)];
  }

  // ---- batter (ORIGINAL pixel art, recreated — not the reference PNG) -----
  // Authored on its own fine grid (BQ px per batter-pixel) for smooth detail:
  // navy cap (brim toward the pitcher), white uniform, teal placket + socks,
  // bat cocked up over the shoulder. CXB/HB = body-center col & feet row.
  // Authored on a fine grid (BQ px/pixel) for a smooth silhouette. CXB = body
  // center col, HB = feet row. Facing right; bat cocked up over the shoulder.
  const BQ = 3, BATTER_CXB = 13, BATTER_HB = 45;
  const BAT_COL = { N: '#16224a', F: '#ffc88f', W: '#eef1f5', T: '#1aa0a0', S: '#15161f' };
  const BATTER = [
    // bat (up-left) tapering down into the hands, with a knob
    ['N', 1, 0, 3, 1], ['N', 1, 1, 3, 1], ['N', 2, 2, 3, 1], ['N', 2, 3, 3, 1],
    ['N', 3, 4, 3, 1], ['N', 4, 5, 3, 1], ['N', 5, 6, 3, 1], ['N', 5, 7, 3, 1],
    ['N', 6, 8, 2, 1],                                // knob
    ['F', 6, 8, 3, 2], ['F', 7, 10, 3, 1],            // hands
    ['W', 8, 9, 3, 2], ['W', 9, 11, 3, 2], ['W', 10, 12, 2, 2], // arms to shoulder
    // cap (rounded crown + brim to the right) + face
    ['N', 9, 1, 6, 1], ['N', 8, 2, 8, 1], ['N', 8, 3, 8, 1],
    ['N', 8, 4, 7, 1], ['N', 15, 4, 4, 1],            // cap base + brim
    ['F', 9, 5, 6, 3], ['F', 8, 6, 1, 1], ['F', 10, 8, 4, 1],   // face + chin
    ['F', 11, 9, 3, 1],                               // neck
    // torso (shoulders -> tapered waist) with teal placket + navy belt
    ['W', 8, 10, 9, 1], ['W', 8, 11, 10, 1], ['W', 8, 12, 10, 7],
    ['W', 9, 19, 9, 2], ['T', 12, 11, 2, 8], ['N', 9, 21, 9, 1],
    // hips + legs (stance apart, front leg toward the pitcher)
    ['W', 9, 22, 9, 4], ['W', 9, 26, 4, 13], ['W', 14, 26, 4, 13],
    ['W', 10, 38, 3, 3], ['W', 14, 38, 3, 3],         // shin taper
    ['T', 10, 40, 3, 2], ['T', 14, 40, 3, 2],         // socks
    ['S', 8, 42, 6, 3], ['S', 14, 42, 8, 3],          // shoes (longer toe to the right)
  ];
  function drawBatter(cxCell, angle) {
    ctx.save();
    ctx.translate(cxCell * RES, GROUND * RES);        // pivot at the feet
    ctx.rotate(angle);
    BATTER.forEach(([c, x, y, w, h]) => {
      ctx.fillStyle = BAT_COL[c];
      ctx.fillRect((x - BATTER_CXB) * BQ, (y - BATTER_HB) * BQ, w * BQ, h * BQ);
    });
    ctx.restore();
  }

  // ---- procedural figures (pitcher / catcher / fielder / runner) ---------
  // L = left world cell, color, pose, face (+1 right / -1 left). Slimmer,
  // sub-unit proportions so they read at the finer art-pixel size.
  function figure(L, color, pose, face) {
    const F = GROUND, cx = L + 1.5;

    if (pose === 'crouch') {                          // compact catcher
      cell(cx - 0.6, F - 5.4, 1.2, 1.4, color);
      cell(cx - 0.75, F - 4, 1.5, 2.4, color);
      cell(cx - 0.7, F - 1.6, 1.6, 1.6, color);
      cell(cx + face * 0.9, F - 3.4, 0.9, 0.9, C.glove);
      return;
    }

    const bob = pose === 'idle' ? Math.sin(performance.now() / 300) * 0.12 : 0;
    cell(cx - 0.6, F - 9 + bob, 1.2, 1.5, color);     // head
    cell(cx - 0.75, F - 7.3 + bob, 1.5, 3.8, color);  // torso

    if (pose === 'windup') {
      cell(cx - 0.7, F - 3.6, 0.6, 3.6, color);
      cell(cx + 0.25, F - 3.6, 0.6, 2.1, color);      // lifted knee
      cell(cx - 0.5, F - 10.3 + bob, 1.1, 1.3, color);// hands overhead
    } else if (pose === 'throw') {
      const ax = face > 0 ? cx + 0.5 : cx - 2.1;
      cell(ax, F - 7.3, 1.6, 0.5, color);             // extended arm
      cell(ax + (face > 0 ? 1.4 : 0), F - 7.7, 0.5, 1, color);
      cell(cx - 0.95, F - 3.6, 0.6, 3.6, color);
      cell(cx + 0.55, F - 3.6, 0.6, 3.6, color);      // stride
    } else if (pose === 'reach') {                    // high catch
      cell(cx + face * 0.8, F - 9.4 + bob, 0.55, 1.7, color);
      cell(cx + face * 1.0, F - 9.9, 0.95, 0.95, C.glove);
      cell(cx - face * 0.95, F - 7, 0.5, 2.4, color);
      cell(cx - 0.7, F - 3.6, 0.6, 3.6, color); cell(cx + 0.1, F - 3.6, 0.6, 3.6, color);
    } else if (pose === 'scoop') {                    // ground ball
      cell(cx + face * 0.7, F - 3.4, 0.5, 3, color);
      cell(cx + face * 1.15, F - 1.2, 0.95, 0.95, C.glove);
      cell(cx - face * 0.9, F - 7, 0.5, 2.4, color);
      cell(cx - 0.7, F - 3.6, 0.6, 3.6, color); cell(cx + 0.1, F - 3.6, 0.6, 3.6, color);
    } else if (pose === 'run1' || pose === 'run2') {
      const s = pose === 'run1' ? 1 : -1;
      cell(cx - 1.0, F - 3.6, 0.6, 3.4 + s * 0.2, color);   // trailing leg
      cell(cx + 0.55, F - 3.6, 0.6, 3.4 - s * 0.2, color);  // leading leg
      cell(cx - 1.2, F - 6.6, 0.5, 1.9, color);
      cell(cx + 0.8, F - 6.8, 0.5, 1.9, color);             // pumping arms
    } else {                                          // idle
      cell(cx - 0.7, F - 3.6, 0.6, 3.6, color); cell(cx + 0.1, F - 3.6, 0.6, 3.6, color);
      cell(cx - 1.15, F - 7 + bob, 0.5, 3, color); cell(cx + 0.65, F - 7 + bob, 0.5, 3, color);
    }
  }

  // figure() at a vertical offset (world units) — for the high/ground fielder
  function figureAt(L, color, pose, face, dyUnits) {
    ctx.save();
    ctx.translate(0, dyUnits * RES);
    figure(L, color, pose, face);
    ctx.restore();
  }

  function ball(pos, color) { cell(pos[0], pos[1], 0.7, 0.7, color || C.ball); }

  function label(text, color) {
    ctx.fillStyle = color;
    ctx.font = `${RES * 1.5}px 'Press Start 2P', monospace`;
    ctx.textAlign = 'center';
    ctx.fillText(text, (GW * RES) / 2, 7 * RES);
  }

  // ---- static backdrop ---------------------------------------------------
  const clouds = [[6, 5], [40, 8]];
  function backdrop() {
    const g = ctx.createLinearGradient(0, 0, 0, GROUND * RES);
    g.addColorStop(0, C.skyTop); g.addColorStop(1, C.skyLow);
    ctx.fillStyle = g; ctx.fillRect(0, 0, GW * RES, GROUND * RES);
    cell(3, 3, 4, 4, C.sun);
    const drift = (performance.now() / 1400) % (GW + 16);
    clouds.forEach((c, i) => {
      const x = (c[0] + drift * (i ? 0.6 : 1)) % (GW + 16) - 8;
      cell(x, c[1], 4, 2, C.cloud); cell(x + 1, c[1] - 1, 3, 1, C.cloud);
    });
    // crowd + back wall
    cell(38, 9, 26, 6, C.wall);
    for (let r = 0; r < 5; r++) for (let x = 38; x < 64; x += 1.5) {
      const hop = ((Math.floor(performance.now() / 200) + Math.round(x) + r) % 7 === 0) ? -0.6 : 0;
      const hue = ['#ff5a5a', '#41c6ff', '#ffd23f', '#8aa0bd', '#e8eef6'][(Math.round(x) + r) % 5];
      cell(x, 9 + r * 1.2 + (state.cheer ? hop : 0), 0.8, 0.8, hue);
    }
    // scoreboard
    cell(44, 2, 18, 6, C.board);
    cell(45, 3, 16, 1, C.boardLit);
    for (let i = 0; i < 7; i++) cell(46 + i * 2, 5, 1, 2, (i % 3 === 0) ? C.boardLit : '#1f3047');
    // outfield fence
    cell(FENCE_X, 14, 2, GROUND - 14, C.fence);
    cell(FENCE_X, 13, 2, 1, C.fenceCap);
    // grass + dirt
    cell(0, GROUND, GW, GH - GROUND, C.grass);
    ctx.fillStyle = C.grassDk;
    for (let x = 0; x < GW; x += 6) ctx.fillRect(x * RES, GROUND * RES, 3 * RES, (GH - GROUND) * RES);
    cell(8, GROUND, 12, 1, C.dirt);                   // batter's box
    cell(32, GROUND - 1, 8, 2, C.dirt);               // mound
    cell(36, GROUND - 1, 1, 1, C.dirtDk);
    cell(26, GROUND, 1, 0.7, '#f4f1e8');              // bases
    cell(40, GROUND, 1, 0.7, '#f4f1e8');
    cell(13, GROUND, 1, 0.7, '#f4f1e8');
  }

  // ---- per-stat play timelines ------------------------------------------
  const ANIM = {
    hr:       { ball: [HAND, PLATE, CONTACT, [30, 8], [46, 3], [62, 2]], swing: 0.34, runner: [[13, GROUND - 9], [26, GROUND - 9], [40, GROUND - 9], [13, GROUND - 9]], cheer: 0.6, label: 'HOME RUN!' },
    single:   { ball: [HAND, PLATE, CONTACT, [28, 24], [40, 26]], swing: 0.4, runner: [[13, GROUND - 9], [26, GROUND - 9]], label: 'BASE HIT' },
    double:   { ball: [HAND, PLATE, CONTACT, [36, 17], [52, 22]], swing: 0.4, runner: [[13, GROUND - 9], [26, GROUND - 9], [40, GROUND - 9]], label: 'DOUBLE' },
    walk:     { ball: [HAND, [9, 26]], swing: -1, runner: [[13, GROUND - 9], [26, GROUND - 9]], label: 'BALL FOUR' },
    steal:    { ball: [[CAT_X + 1, 23], [26, GROUND - 1]], swing: -1, runner: [[26, GROUND - 9], [40, GROUND - 9]], label: 'STOLEN BASE' },
    k:        { ball: [HAND, PLATE, [CAT_X + 1, 25]], swing: 0.55, whiff: true, label: 'STRIKE 3!' },
    grounder: { ball: [HAND, PLATE, CONTACT, [30, 27], [42, GROUND - 1]], swing: 0.38, fielder: 43, throw: [26, GROUND - 4], outs: 1, label: 'OUT AT 1ST' },
    fly:      { ball: [HAND, PLATE, CONTACT, [34, 14], [48, 16]], swing: 0.38, fielder: 48, high: true, outs: 1, label: 'CAUGHT!' },
    dp:       { ball: [HAND, PLATE, CONTACT, [30, 27], [40, GROUND - 1]], swing: 0.34, fielder: 41, relay: [[40, GROUND - 4], [30, GROUND - 4], [26, GROUND - 4]], outs: 2, label: 'TWO!' },
    error:    { ball: [HAND, PLATE, CONTACT, [30, 27], [43, GROUND - 1], [50, GROUND]], swing: 0.38, fielder: 42, bobble: true, label: 'E — SAFE' },
  };

  // ---- frame composition -------------------------------------------------
  function frame(p) {
    backdrop();
    const a = ANIM[state.anim] || ANIM.single;

    // pitcher: windup -> throw across the first third
    let pitcherPose = 'idle';
    if (p < 0.18) pitcherPose = 'windup';
    else if (p < 0.36) pitcherPose = 'throw';
    figure(PIT_X, TEAM.pitching, pitcherPose, -1);

    figure(CAT_X, '#8aa0bd', 'crouch', 1);            // catcher

    // batter — rotate around feet to swing toward the pitcher; trot on a walk
    let swingAngle = 0, batShift = 0;
    if (a.swing >= 0 && p >= a.swing) {
      const sw = Math.min(1, (p - a.swing) / 0.18);
      swingAngle = (a.whiff ? 0.9 : 1.15) * Math.sin(sw * Math.PI);
      if (!a.whiff && p > a.swing + 0.18) swingAngle = 0.25;
    } else if (state.anim === 'walk' && p > 0.6) {
      batShift = ((p - 0.6) / 0.4) * 12;
    }
    drawBatter(BAT_CENTER + batShift, swingAngle);

    // fielder
    if (a.fielder != null) {
      const caught = p > 0.7;
      const pose = a.high ? 'reach' : (a.bobble && p > 0.72 ? 'idle' : 'scoop');
      const dy = a.high ? -6 : 0;
      figureAt(a.fielder, TEAM.fielding, caught && !a.high ? 'idle' : pose, -1, dy);
    }

    // runner
    if (a.runner) {
      const rp = along(a.runner, Math.min(1, p));
      const stride = (Math.floor(performance.now() / 140) % 2) ? 'run1' : 'run2';
      figure(rp[0] - 1.5, '#e8eef6', p < 1 ? stride : 'idle', 1);
    }

    // double-play relay
    if (a.relay && p > 0.45) ball(along(a.relay, Math.min(1, (p - 0.45) / 0.55)), C.ball);

    // primary ball
    let bpos;
    if (state.anim === 'steal') bpos = along(a.ball, Math.min(1, p * 1.1));
    else if (a.throw && p > 0.62) bpos = along([a.ball[a.ball.length - 1], a.throw], Math.min(1, (p - 0.62) / 0.38));
    else bpos = along(a.ball, p);
    if (!(a.relay && p > 0.45)) ball(bpos, (a.swing >= 0 && p > a.swing) ? C.hitBall : C.ball);

    state.cheer = (a.cheer && p > a.cheer) ? 1 : 0;

    // outs / labels at the end
    if (p >= 0.92) {
      if (a.outs) {
        ctx.fillStyle = C.out; ctx.font = `${RES * 1.3}px 'Press Start 2P', monospace`;
        ctx.textAlign = 'center';
        ctx.fillText(a.outs === 2 ? 'x2' : 'OUT', (GW * RES) * 0.62, 20 * RES);
      }
      if (a.label) label(a.label, (a.outs || a.whiff) ? C.out : C.cheer);
    }
  }

  // ---- render loop (runs only while a play animates) ---------------------
  let running = false;
  function render() {
    if (!ctx) return;
    ctx.clearRect(0, 0, GW * RES, GH * RES);
    let p = 1;
    if (state.playing) {
      p = (performance.now() - state.t0) / state.dur;
      if (p >= 1) { p = 1; state.playing = false; }
    }
    frame(p);
  }
  function loop() {
    render();
    if (state.playing && !reduceMotion()) state.raf = requestAnimationFrame(loop);
    else { running = false; state.raf = 0; }
  }
  function startLoop() { if (running) return; running = true; state.raf = requestAnimationFrame(loop); }

  // ---- public ------------------------------------------------------------
  function mount(el) {
    canvas = el;
    canvas.width = GW * RES; canvas.height = GH * RES;
    ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    render();
  }

  function play({ group, anim }) {
    state.group = group;
    state.anim = ANIM[anim] ? anim : 'single';
    if (reduceMotion()) { state.playing = false; render(); return; }
    state.playing = true;
    state.t0 = performance.now();
    state.dur = state.anim === 'hr' ? 3000 : (state.anim === 'dp' ? 3200 : 2600);
    startLoop();
    // settle even if rAF is throttled (backgrounded tab)
    clearTimeout(state.settle);
    state.settle = setTimeout(() => {
      if (state.playing) { state.playing = false; render(); }
      if (state.raf) { cancelAnimationFrame(state.raf); state.raf = 0; }
      running = false;
    }, state.dur + 80);
  }

  window.Scene = { mount, play };
})();
