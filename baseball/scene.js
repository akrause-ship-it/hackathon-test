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
    wallGreen: '#27512c', wallGreenDk: '#1f4124',
    wall: '#14202e', board: '#0d1420', boardLit: '#ffd23f',
    cloud: '#ffffff', sun: '#ffe066',
    skin: '#ffc48a', ball: '#ffffff', hitBall: '#ffd23f',
    glove: '#7a4a1f', out: '#ff5a5a', cheer: '#ffd23f',
  };
  const TEAM = { hitting: '#ff5a5a', pitching: '#41c6ff', fielding: '#ffd23f' };

  // key spots (world units)
  const GROUND = 27;             // grass top / feet line
  const CAT_X = 6, PIT_X = 35, FENCE_X = 57, BAT_CENTER = 12;
  const MOUND_C = 36, MOUND_H = 0.9;   // pitcher's mound center + height (world units)
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
  const BQ = 3, BATTER_CXB = 11, BATTER_HB = 42;
  const SH_X = 11, SH_Y = 9, WST_X = 11, WST_Y = 19;   // shoulder + waist pivots
  const BAT_COL = { N: '#16224a', F: '#ffc88f', W: '#eef1f5', W2: '#c7ced9', T: '#1aa0a0', S: '#15161f' };

  // The batter is split into three parts so the swing is articulated, not a
  // rigid whole-body tilt: planted lower body, an upper body that coils a little,
  // and an arm+bat "lever" that swings through an arc around the shoulder.
  const BODY_LOWER = [
    ['W', 8, 19, 6, 3],                                // hips
    ['W', 8, 22, 2, 8], ['W', 6, 30, 2, 9], ['W2', 7, 30, 1, 9],   // back leg
    ['W', 12, 22, 2, 8], ['W', 14, 30, 2, 9], ['W2', 15, 30, 1, 9],// front leg
    ['W2', 9, 22, 1, 8], ['W2', 13, 22, 1, 8],         // thigh shadows
    ['T', 6, 38, 2, 1], ['T', 14, 38, 2, 1],           // socks
    ['S', 4, 39, 5, 3], ['S', 14, 39, 5, 3],           // shoes (spread wide)
  ];
  const BODY_UPPER = [                                 // cap, face, torso, belt
    ['N', 8, 2, 5, 1], ['N', 7, 3, 7, 1], ['N', 7, 4, 6, 1], ['N', 13, 4, 3, 1],
    ['F', 8, 5, 5, 2], ['F', 7, 5, 1, 1], ['F', 9, 7, 3, 1],
    ['W', 8, 8, 6, 1], ['W', 8, 9, 6, 9], ['W2', 12, 9, 1, 9], ['T', 9, 10, 1, 2], ['N', 8, 18, 6, 1],
  ];
  const ARMBAT = [                                     // sleeves + hands + bat
    ['W', 8, 8, 3, 2], ['W', 11, 8, 2, 1],
    ['F', 11, 6, 3, 1], ['F', 11, 7, 3, 1],
    ['N', 11, 0, 2, 1], ['N', 11, 1, 2, 1], ['N', 11, 2, 2, 1],
    ['N', 12, 3, 2, 1], ['N', 12, 4, 2, 1], ['N', 12, 5, 2, 1], ['N', 13, 6, 1, 1],
  ];

  const smooth = t => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
  function paintParts(list) {
    list.forEach(([c, x, y, w, h]) => {
      ctx.fillStyle = BAT_COL[c];
      ctx.fillRect((x - BATTER_CXB) * BQ, (y - BATTER_HB) * BQ, w * BQ, h * BQ);
    });
  }
  function pivotAt(px, py, ang, draw) {              // rotate `draw` about a bg-grid point
    const lx = (px - BATTER_CXB) * BQ, ly = (py - BATTER_HB) * BQ;
    ctx.save(); ctx.translate(lx, ly); ctx.rotate(ang); ctx.translate(-lx, -ly);
    draw(); ctx.restore();
  }

  // sp: 0 = loaded stance, 1 = full follow-through.
  function drawBatter(cxCell, sp) {
    const e = smooth(sp);
    const coil = -0.05 + 0.16 * e;     // upper body uncoils through the swing
    const swing = 2.45 * e;            // arm+bat lever sweeps down toward the pitcher
    ctx.save();
    ctx.translate(cxCell * RES, GROUND * RES);
    paintParts(BODY_LOWER);                               // planted
    pivotAt(WST_X, WST_Y, coil, () => {                   // upper body coils at the waist
      paintParts(BODY_UPPER);
      pivotAt(SH_X, SH_Y, swing, () => paintParts(ARMBAT)); // arms+bat swing at the shoulder
    });
    ctx.restore();
  }

  // ---- shared detailed player (pitcher / catcher / fielder / runner) ------
  // Same pixel-art build as the batter (cap, face, shaded uniform, socks,
  // shoes), drawn at the BQ grid in pose-specific limbs. `accent` (the passed
  // color) tints a small jersey stripe so roles still read; `face<0` mirrors
  // the figure to face left. Color keys: A = accent, G = glove, else BAT_COL.
  const PCX = 8, PHB = 40;
  const PBODY = [
    ['N', 6, 2, 5, 1], ['N', 5, 3, 7, 1], ['N', 11, 4, 3, 1],   // cap crown + brim
    ['F', 6, 5, 5, 2], ['F', 5, 5, 1, 1], ['F', 7, 7, 3, 1],     // face, ear, neck
    ['W', 5, 8, 7, 1], ['W', 5, 9, 7, 8], ['W2', 10, 9, 1, 8],   // torso + shaded side
    ['A', 7, 10, 1, 5], ['N', 5, 17, 7, 1], ['W', 5, 18, 7, 3],  // accent stripe, belt, hips
  ];
  const PLEGS = {
    idle: [
      ['W', 5, 21, 3, 9], ['W2', 7, 21, 1, 9], ['W', 9, 21, 3, 9], ['W2', 11, 21, 1, 9],
      ['W', 5, 30, 3, 7], ['W', 9, 30, 3, 7], ['T', 5, 36, 3, 1], ['T', 9, 36, 3, 1],
      ['S', 3, 37, 5, 3], ['S', 9, 37, 6, 3],
    ],
    windup: [
      ['W', 5, 21, 3, 10], ['W', 5, 31, 3, 6], ['T', 5, 37, 3, 1], ['S', 3, 38, 5, 3], // planted
      ['W', 9, 22, 3, 5], ['W', 11, 26, 3, 3], ['S', 13, 28, 4, 3],                     // lifted knee
    ],
    throw: [
      ['W', 4, 21, 3, 10], ['W', 2, 31, 3, 7], ['S', 0, 38, 5, 3],   // push leg
      ['W', 10, 21, 3, 9], ['W', 12, 30, 4, 7], ['S', 12, 37, 6, 3], ['T', 12, 36, 3, 1], // stride
    ],
    run1: [
      ['W', 4, 21, 3, 9], ['W', 2, 30, 3, 8], ['S', 0, 38, 5, 3],
      ['W', 10, 21, 3, 8], ['W', 12, 29, 3, 7], ['S', 12, 36, 6, 3],
    ],
    run2: [
      ['W', 6, 21, 3, 10], ['W', 6, 31, 3, 7], ['S', 4, 38, 5, 3],
      ['W', 9, 21, 3, 9], ['W', 10, 30, 3, 7], ['S', 10, 37, 6, 3],
    ],
  };
  PLEGS.reach = PLEGS.idle; PLEGS.scoop = PLEGS.idle;
  const PARMS = {
    idle: [['W', 3, 9, 2, 6], ['F', 3, 15, 2, 2], ['W', 12, 9, 2, 6], ['F', 12, 15, 2, 2]],
    windup: [['W', 5, 3, 4, 2], ['F', 6, 1, 3, 1]],                          // hands overhead
    throw: [['W', 11, 8, 4, 1], ['F', 14, 7, 2, 2], ['W', 3, 10, 2, 3], ['F', 3, 13, 2, 2]],
    reach: [['W', 11, 4, 2, 5], ['G', 12, 2, 3, 3], ['W', 4, 10, 2, 4], ['F', 4, 14, 2, 2]],
    scoop: [['W', 12, 12, 2, 6], ['G', 13, 17, 3, 3], ['W', 4, 11, 2, 3], ['F', 4, 14, 2, 2]],
    run1: [['W', 3, 9, 2, 4], ['F', 3, 13, 2, 2], ['W', 12, 11, 2, 4], ['F', 13, 14, 2, 2]],
    run2: [['W', 4, 11, 2, 4], ['F', 4, 15, 2, 2], ['W', 11, 9, 2, 4], ['F', 12, 13, 2, 2]],
  };
  // Catcher = the SAME full-scale player (PBODY sunk by CROUCH_DROP rows) with
  // deeply folded legs — a normal-sized body bending down, not a tiny round blob.
  const CROUCH_DROP = 13;
  const PCROUCH_LEGS = [
    ['W', 3, 31, 4, 3], ['W', 9, 31, 4, 3],            // splayed thighs off the (lowered) hips
    ['W', 2, 34, 3, 5], ['W', 12, 34, 3, 5],           // shins to a wide base
    ['S', 1, 38, 5, 2], ['S', 12, 38, 5, 2],           // feet
  ];
  const PCROUCH_ARMS = [
    ['W', 11, 22, 2, 3], ['G', 13, 22, 3, 3],          // glove arm forward (toward the pitch)
    ['W', 4, 23, 2, 4], ['F', 4, 27, 2, 2],            // throwing arm down
  ];

  function paintBG(list, accent, dy) {
    dy = dy || 0;
    list.forEach(([c, x, y, w, h]) => {
      ctx.fillStyle = c === 'A' ? accent : c === 'G' ? C.glove : BAT_COL[c];
      ctx.fillRect((x - PCX) * BQ, (y + dy - PHB) * BQ, w * BQ, h * BQ);
    });
  }
  function drawPlayer(cxCell, pose, accent, face) {
    ctx.save();
    ctx.translate(cxCell * RES, GROUND * RES);
    if (face < 0) ctx.scale(-1, 1);
    if (pose === 'crouch') {
      paintBG(PBODY, accent, CROUCH_DROP);   // full-size cap/face/torso, sunk into the crouch
      paintBG(PCROUCH_LEGS, accent);
      paintBG(PCROUCH_ARMS, accent);
      ctx.restore(); return;
    }
    paintBG(PBODY, accent);
    paintBG(PLEGS[pose] || PLEGS.idle, accent);
    paintBG(PARMS[pose] || PARMS.idle, accent);
    ctx.restore();
  }
  // keep the old call sites working (L = left world cell → center is L + 1.5)
  function figure(L, color, pose, face) { drawPlayer(L + 1.5, pose, color, face); }
  function figureAt(L, color, pose, face, dyUnits) {
    ctx.save(); ctx.translate(0, dyUnits * RES); drawPlayer(L + 1.5, pose, color, face); ctx.restore();
  }

  function ball(pos, color) { cell(pos[0], pos[1], 0.7, 0.7, color || C.ball); }

  // Play call-outs live low on the grass (world y~37) so they never overlap the
  // crowd; a dark shadow keeps them legible on the green.
  function label(text, color) {
    const x = (GW * RES) / 2, y = 37 * RES;
    ctx.font = `${RES * 1.5}px 'Press Start 2P', monospace`;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#0a1018'; ctx.fillText(text, x + 2, y + 2);
    ctx.fillStyle = color; ctx.fillText(text, x, y);
  }

  // ---- static backdrop: sky → full-width crowd → solid green wall → grass --
  const clouds = [[6, 2], [40, 3]];
  function backdrop() {
    const SKY = 6, WALL = 18;                          // world-y bands: wall top sits just above the players' heads (~y20)
    // sky strip
    const g = ctx.createLinearGradient(0, 0, 0, SKY * RES);
    g.addColorStop(0, C.skyTop); g.addColorStop(1, C.skyLow);
    ctx.fillStyle = g; ctx.fillRect(0, 0, GW * RES, SKY * RES);
    cell(3, 1, 4, 3, C.sun);
    const drift = (performance.now() / 1400) % (GW + 16);
    clouds.forEach((c, i) => {
      const x = (c[0] + drift * (i ? 0.6 : 1)) % (GW + 16) - 8;
      cell(x, c[1], 4, 1.4, C.cloud);
    });
    // stands + packed crowd — FULL WIDTH, filling all the way down to the wall top
    cell(0, SKY, GW, WALL - SKY, C.wall);            // dark seams behind the seats
    const HUES = ['#ff5a5a', '#41c6ff', '#ffd23f', '#8aa0bd', '#e8eef6', '#ff9f4a', '#7ee07e'];
    for (let r = 0; SKY + 0.4 + r * 1.2 < WALL; r++) {
      const yy = SKY + 0.4 + r * 1.2;
      for (let x = 0; x < GW; x += 1.4) {
        const hop = (state.cheer && (Math.floor(performance.now() / 200) + Math.round(x) + r) % 7 === 0) ? -0.4 : 0;
        cell(x, yy + hop, 0.8, 0.8, HUES[(Math.round(x) + r) % HUES.length]);
      }
    }
    // solid green outfield wall — FULL WIDTH backdrop for every player
    cell(0, WALL, GW, GROUND - WALL, C.wallGreen);
    cell(0, WALL, GW, 0.5, C.fenceCap);                // yellow cap atop the wall
    ctx.fillStyle = C.wallGreenDk;                     // faint vertical seams
    for (let x = 4; x < GW; x += 8)
      ctx.fillRect(Math.round(x * RES), Math.round(WALL * RES), Math.max(1, Math.round(0.18 * RES)), Math.round((GROUND - WALL) * RES));
    // scoreboard mounted on the outfield wall (center field)
    cell(40, 18.5, 18, 4.5, C.board);
    cell(41, 19.1, 16, 0.7, C.boardLit);
    for (let i = 0; i < 7; i++) cell(42 + i * 2, 20.6, 0.9, 1.4, (i % 3 === 0) ? C.boardLit : '#1f3047');
    // grass + dirt
    cell(0, GROUND, GW, GH - GROUND, C.grass);
    ctx.fillStyle = C.grassDk;
    for (let x = 0; x < GW; x += 6) ctx.fillRect(x * RES, GROUND * RES, 3 * RES, (GH - GROUND) * RES);
    cell(8, GROUND, 12, 1, C.dirt);                    // batter's box
    // pitcher's mound — a low hill that slopes down to field level on both sides
    cell(MOUND_C - 6, GROUND - MOUND_H * 0.5, 12, MOUND_H * 0.5 + 0.5, C.dirt);  // base (widest, to ground)
    cell(MOUND_C - 4, GROUND - MOUND_H * 0.8, 8, MOUND_H * 0.6, C.dirt);         // mid tier
    cell(MOUND_C - 2.5, GROUND - MOUND_H, 5, MOUND_H * 0.7, C.dirt);             // top tier
    cell(MOUND_C - 0.5, GROUND - MOUND_H, 1, 0.6, C.dirtDk);                     // rubber
    cell(13, GROUND, 1, 0.7, '#f4f1e8');               // home
    cell(26, GROUND, 1, 0.7, '#f4f1e8');               // first
    cell(59, GROUND, 1, 0.7, '#f4f1e8');               // second (mound at x36 is now the midpoint home↔second)
  }

  // ---- per-stat play timelines ------------------------------------------
  const ANIM = {
    hr:       { ball: [HAND, PLATE, CONTACT, [30, 8], [46, 3], [62, 2]], swing: 0.34, runner: [[13, GROUND - 9], [26, GROUND - 9], [59, GROUND - 9], [13, GROUND - 9]], cheer: 0.6, label: 'HOME RUN!' },
    single:   { ball: [HAND, PLATE, CONTACT, [28, 24], [40, 26]], swing: 0.4, runner: [[13, GROUND - 9], [26, GROUND - 9]], label: 'BASE HIT' },
    double:   { ball: [HAND, PLATE, CONTACT, [36, 17], [52, 22]], swing: 0.4, runner: [[13, GROUND - 9], [26, GROUND - 9], [59, GROUND - 9]], label: 'DOUBLE' },
    walk:     { ball: [HAND, [9, 26]], swing: -1, runner: [[13, GROUND - 9], [26, GROUND - 9]], label: 'BALL FOUR' },
    steal:    { ball: [[CAT_X + 1, 23], [59, GROUND - 1]], swing: -1, runner: [[26, GROUND - 9], [59, GROUND - 9]], label: 'STOLEN BASE' },
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

    // Action clock: pitch/swing/ball run at normal speed (pf), while the runner
    // and end labels use real p — and the play's dur is stretched — so only the
    // runner ends up at ~half speed.
    const af = state.actionFrac || 1;
    const pf = Math.min(1, p / af);

    // pitcher: windup -> throw across the first third
    let pitcherPose = 'idle';
    if (pf < 0.18) pitcherPose = 'windup';
    else if (pf < 0.36) pitcherPose = 'throw';
    figureAt(PIT_X, TEAM.pitching, pitcherPose, -1, -MOUND_H);  // standing on the mound

    figure(CAT_X, '#8aa0bd', 'crouch', 1);            // catcher

    // batter — articulated swing (sp: 0 = loaded, 1 = full follow-through).
    let sp = 0;
    if (a.swing >= 0 && pf >= a.swing) {
      sp = Math.min(1, (pf - a.swing) / 0.22);
      if (a.whiff && pf > a.swing + 0.30) sp = Math.max(0, 1 - (pf - a.swing - 0.30) / 0.22); // whiff recoils to load
    }
    // When the runner starts at home, the BATTER becomes that runner: he swings
    // (or takes ball four), then takes off — never both. Handoff is in action-clock
    // space; convert to real p for the (slower) runner.
    const becomesRunner = a.runner && Math.abs(a.runner[0][0] - 13) < 2;
    const runStart = (a.swing >= 0 ? a.swing + 0.20 : 0.5) * af;

    // fielder
    if (a.fielder != null) {
      const caught = pf > 0.7;
      const pose = a.high ? 'reach' : (a.bobble && pf > 0.72 ? 'idle' : 'scoop');
      const dy = a.high ? -6 : 0;
      figureAt(a.fielder, TEAM.fielding, caught && !a.high ? 'idle' : pose, -1, dy);
    }

    // runner — uses real p (over the stretched dur) so it travels at half the
    // old speed. becomesRunner appears after the takeoff; a steal shows throughout.
    if (a.runner) {
      const show = becomesRunner ? p >= runStart : true;
      if (show) {
        const prog = becomesRunner ? (p - runStart) / Math.max(0.001, 1 - runStart) : Math.min(1, p);
        const rp = along(a.runner, Math.min(1, Math.max(0, prog)));
        const stride = (Math.floor(performance.now() / 140) % 2) ? 'run1' : 'run2';
        figure(rp[0] - 1.5, '#e8eef6', prog < 1 ? stride : 'idle', 1);
      }
    }

    // batter — drawn unless he has already become the runner
    if (!(becomesRunner && p >= runStart)) drawBatter(BAT_CENTER, sp);

    // double-play relay
    if (a.relay && pf > 0.45) ball(along(a.relay, Math.min(1, (pf - 0.45) / 0.55)), C.ball);

    // primary ball (steal throw tracks the runner on real p; others on pf)
    let bpos;
    if (state.anim === 'steal') bpos = along(a.ball, Math.min(1, p * 1.1));
    else if (a.throw && pf > 0.62) bpos = along([a.ball[a.ball.length - 1], a.throw], Math.min(1, (pf - 0.62) / 0.38));
    else bpos = along(a.ball, pf);
    if (!(a.relay && pf > 0.45)) ball(bpos, (a.swing >= 0 && pf > a.swing) ? C.hitBall : C.ball);

    state.cheer = (a.cheer && pf > a.cheer) ? 1 : 0;

    // outs / labels at the end
    if (p >= 0.92) {
      if (a.outs) {
        const x = (GW * RES) / 2, y = 32.5 * RES;
        ctx.font = `${RES * 1.3}px 'Press Start 2P', monospace`;
        ctx.textAlign = 'center';
        ctx.fillStyle = '#0a1018'; ctx.fillText(a.outs === 2 ? 'TWO OUTS' : 'OUT', x + 2, y + 2);
        ctx.fillStyle = C.out; ctx.fillText(a.outs === 2 ? 'TWO OUTS' : 'OUT', x, y);
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
    const a = ANIM[state.anim];
    const base = state.anim === 'hr' ? 3000 : (state.anim === 'dp' ? 3200 : 2600);
    // Runner travels at ~half speed: stretch the play, but keep the pitch/swing/
    // ball at normal speed via the action clock (= actionFrac of the timeline).
    if (a.runner) {
      const homeRunner = Math.abs(a.runner[0][0] - 13) < 2;
      const runStartPf = a.swing >= 0 ? a.swing + 0.20 : 0.5;
      state.actionFrac = homeRunner ? 1 / (2 - runStartPf) : 0.5;
    } else {
      state.actionFrac = 1;
    }
    state.dur = Math.round(base / state.actionFrac);
    if (reduceMotion()) { state.playing = false; render(); return; }
    state.playing = true;
    state.t0 = performance.now();
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
