/* config.js — STAT_CONFIG: the single declarative source of truth.
 *
 * The entire UI is driven from this object. Each group has a sprite `action`
 * and 5 stats. Each stat's KEY is the exact `leaderCategories` value the live
 * MLB Stats API expects (verified against the API at build time — note WHIP is
 * `walksAndHitsPerInningPitched`, and `fielding` returns `fieldingPercentage`).
 *
 * Per stat:
 *   name  — short display abbreviation (chip + stat label)
 *   full  — full display name
 *   inv   — true when LOWER is better (ERA, WHIP, Errors); inverts "elite"
 *   mean  — plain-English definition ("What it means")
 *   play  — caption for the field animation ("The play")
 *   elite — (row) => HTML string for "Rank & why elite"; row carries
 *           {rank, value, valueNum, gap, n} so framing adapts to real numbers
 *           and to however many qualified players exist (section 9).
 *   anim  — field animation key (see field.js)
 */
window.STAT_CONFIG = {
  hitting: {
    action: 'swing',
    stats: {
      battingAverage: {
        name: 'AVG', full: 'Batting Average',
        mean: 'Hits divided by at-bats — how often a batter gets a hit when they put the ball in play.',
        play: 'A line drive drops in; the runner reaches first safely.',
        elite: r => `#${r.rank} in MLB at <b>${r.value}</b>. Getting a hit ${(r.valueNum * 100).toFixed(1)}% of the time is rarefied air.`,
        anim: 'single',
      },
      homeRuns: {
        name: 'HR', full: 'Home Runs', cumulative: true,
        mean: 'The number of times a batter hits the ball over the fence in fair territory, scoring automatically.',
        play: 'The batter connects — the ball arcs over the wall and the runner trots around all four bases.',
        elite: r => `#${r.rank} in MLB with <b>${r.value} HR</b> — ${r.gap} more than #${r.n} on the leaderboard. Elite power.`,
        anim: 'hr',
      },
      onBasePercentage: {
        name: 'OBP', full: 'On-Base %',
        mean: 'How often a batter reaches base by any means — hits, walks, or hit-by-pitch.',
        play: 'Ball four — the batter jogs to first without swinging. Still a win.',
        elite: r => `#${r.rank} at <b>${r.value}</b>. Reaching base this often constantly creates run chances.`,
        anim: 'walk',
      },
      onBasePlusSlugging: {
        name: 'OPS', full: 'On-base Plus Slugging',
        mean: 'On-base percentage plus slugging — one number combining getting on base and hitting for power.',
        play: 'A gap double: on base AND extra bases, the two things OPS rewards.',
        elite: r => `#${r.rank} at <b>${r.value}</b>. A top-tier OPS means a complete, dangerous hitter.`,
        anim: 'double',
      },
      stolenBases: {
        name: 'SB', full: 'Stolen Bases', cumulative: true,
        mean: 'Bases advanced by the runner alone, without a hit — beating the throw on a steal.',
        play: "The runner takes off, slides into second ahead of the catcher's throw. Safe!",
        elite: r => `#${r.rank} with <b>${r.value} SB</b>. Game-changing speed on the basepaths.`,
        anim: 'steal',
      },
    },
  },

  pitching: {
    action: 'pitch',
    stats: {
      earnedRunAverage: {
        name: 'ERA', full: 'Earned Run Average', inv: true,
        mean: 'Earned runs allowed per nine innings — the lower, the better the pitcher.',
        play: 'The pitch paints the corner; the batter swings through it for strike three.',
        elite: r => `#${r.rank} with a <b>${r.value} ERA</b> (lower is better). Among the stingiest arms in baseball.`,
        anim: 'k',
      },
      strikeouts: {
        name: 'K', full: 'Strikeouts', cumulative: true,
        mean: "Batters retired on a third strike — the pitcher's most dominant out.",
        play: 'Three pitches, three strikes. The batter never had a chance.',
        elite: r => `#${r.rank} with <b>${r.value} K</b>. Overpowering hitters all season long.`,
        anim: 'k',
      },
      walksAndHitsPerInningPitched: {
        name: 'WHIP', full: 'Walks + Hits per Inning', inv: true,
        mean: 'Base-runners allowed per inning via walks and hits — lower means fewer threats.',
        play: 'A quiet inning: weak grounder, easy out, nobody aboard.',
        elite: r => `#${r.rank} at <b>${r.value} WHIP</b> (lower is better). Rarely lets anyone on base.`,
        anim: 'single',
      },
      wins: {
        name: 'W', full: 'Wins', cumulative: true,
        mean: 'Games credited to the pitcher when their team takes and holds the lead.',
        play: 'Six strong innings, lead handed to the bullpen — that’s a win.',
        elite: r => `#${r.rank} with <b>${r.value} W</b>. A reliable, durable front-line starter.`,
        anim: 'k',
      },
      saves: {
        name: 'SV', full: 'Saves', cumulative: true,
        mean: 'Late-game appearances where the closer protects a slim lead to finish the win.',
        play: 'Bottom of the ninth, tying run on deck — the closer slams the door.',
        elite: r => `#${r.rank} with <b>${r.value} SV</b>. Trusted with the game on the line.`,
        anim: 'k',
      },
    },
  },

  fielding: {
    action: 'field',
    stats: {
      rangeFactorPerGame: {
        name: 'RF/G', full: 'Range Factor / Game',
        mean: 'Putouts plus assists per game — how many plays a fielder actually makes, a proxy for the ground they cover.',
        play: 'A grounder deep in the hole — ranged to, backhanded, and thrown out. That’s extra range.',
        elite: r => `#${r.rank} at <b>${r.value}</b> plays per game — covers more ground than almost anyone out there.`,
        anim: 'grounder',
      },
      putOuts: {
        name: 'PO', full: 'Putouts', cumulative: true,
        mean: 'Outs a fielder records directly — catching a fly, tagging a runner, stepping on a bag.',
        play: 'Fly ball to center — tracked down and squeezed for the out.',
        elite: r => `#${r.rank} with <b>${r.value} PO</b>. Constantly in the middle of the action.`,
        anim: 'fly',
      },
      assists: {
        name: 'A', full: 'Assists', cumulative: true,
        mean: 'Throws that lead to an out recorded by a teammate.',
        play: 'Grounder to short, fired across the diamond — out at first.',
        elite: r => `#${r.rank} with <b>${r.value} A</b>. A cannon and great range.`,
        anim: 'grounder',
      },
      doublePlays: {
        name: 'DP', full: 'Double Plays', cumulative: true,
        mean: "Two outs recorded on one batted ball — the defense's biggest momentum swing.",
        play: 'Ground ball — flip to second, relay to first. Two down in a blink.',
        elite: r => `#${r.rank} with <b>${r.value} DP</b>. Turns two as well as anyone.`,
        anim: 'dp',
      },
      errors: {
        name: 'E', full: 'Errors', inv: true, cumulative: true,
        mean: 'Misplays that let a batter or runner advance — fewer is better.',
        play: 'The fielder bobbles it; the runner takes an extra base. That’s an error.',
        // Errors is the one inverted COUNTING stat: the live API ranks it
        // most-first, so the "leader" has the MOST errors. Frame it honestly
        // (the spec's "lower is better" note) rather than calling it elite.
        elite: r => `Leads MLB with <b>${r.value} errors</b>. Fielding rewards the fewest — so unlike the others, this is a list you'd rather <i>not</i> top.`,
        anim: 'error',
      },
    },
  },
};

/* Find a stat config by its key across all groups. */
window.findStat = function findStat(key) {
  const cfg = window.STAT_CONFIG;
  for (const g in cfg) if (cfg[g].stats[key]) return cfg[g].stats[key];
  return null;
};
