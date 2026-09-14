const mean = xs => xs.reduce((a, b) => a + b, 0) / xs.length;

// A reading is good for this many days. After that the stock is stale
// and YOU refuses to draw, rather than guessing or quietly dropping it.
const STALE_DAYS = 7;

// Every metric you have ever recorded.
async function readMetrics(db) {
  const { data, error } = await db
    .from('day_metrics').select('metric').limit(20000);
  if (error) throw error;
  return [...new Set(data.map(r => r.metric))].sort();
}

// Rules live in the same ledger as everything else. They are events with a
// different event_type, so day_metrics never sees them. Latest rule per
// metric wins, and the older ones stay on the record.
async function readRules(db) {
  const { data, error } = await db
    .from('events')
    .select('metric, context, occurred_at')
    .eq('event_type', 'rule')
    .order('occurred_at', { ascending: true })
    .limit(20000);
  if (error) throw error;
  const out = {};
  for (const r of data) out[r.metric] = r.context;
  return out;
}

async function writeRule(db, metric, rule) {
  return db.from('events').insert({
    occurred_at: new Date().toISOString(),
    metric,
    event_type: 'rule',
    source: 'you',
    context: rule
  });
}

async function readDays(db, metrics) {
  const { data, error } = await db
    .from('day_metrics')
    .select('day, metric, mean')
    .in('metric', metrics)
    .order('day', { ascending: true })
    .limit(20000);
  if (error) throw error;
  return data;
}

// A band turns a value into how far outside the band it is.
// Inside the band is zero, and zero is as good as it gets.
// Over and under are equally wrong, which is the truth about sleep.
function distanceOf(value, rule) {
  if (rule.kind !== 'band') return value;
  if (value < rule.lo) return rule.lo - value;
  if (value > rule.hi) return value - rule.hi;
  return 0;
}

// The baseline is FROZEN: the first 30 readings ever, and it never moves.
// A rolling window would compare you to your recent self, which puts
// you at 50 forever no matter how much you improve.
function baselineOf(values) {
  return values.slice(0, 30);
}

// An index, not a rank. 100 is the person you were across your first
// thirty readings. There is no ceiling and no floor, so you can always
// keep improving, which a percentile never let you do.
//
// One point is a tenth of your own ordinary variation. So 137 does not
// mean "better than 37 percent of my past", it means "well clear of my
// normal", in the units of your own noise.
function spreadOf(baseline) {
  if (baseline.length < 2) return 0;
  const m = mean(baseline);
  const v = baseline.reduce((a, x) => a + (x - m) ** 2, 0) / (baseline.length - 1);
  return Math.sqrt(v);
}

function indexOf(value, baseline, lowerIsBetter) {
  if (!baseline.length) return 100;
  const m = mean(baseline);
  const sd = spreadOf(baseline);
  // A stock that never moved has no ordinary variation to measure against.
  // Fall back to one percent of its own size so it stays flat instead of
  // exploding.
  const unit = sd > 0 ? sd : Math.abs(m) * 0.01 || 1;
  const away = (value - m) / unit;
  return Math.round((100 + (lowerIsBetter ? -away : away) * 10) * 10) / 10;
}

// Returns { metric: [{ day, value, rank }] }
// value is always the real reading. rank is the index.
function rankSeries(rows, rules) {
  const out = {};
  for (const metric of Object.keys(rules)) {
    const rule = rules[metric];
    if (rule.kind === 'ignore') continue;
    const mine = rows.filter(r => r.metric === metric);
    if (!mine.length) continue;
    const values = mine.map(r => Number(r.mean));
    const scored = values.map(v => distanceOf(v, rule));
    const base = baselineOf(scored);
    const lower = rule.kind === 'down' || rule.kind === 'band';
    out[metric] = mine.map((r, i) => ({
      day: r.day,
      value: values[i],
      rank: indexOf(scored[i], base, lower)
    }));
  }
  return out;
}

const dayNum = d => Math.floor(Date.parse(d + 'T00:00:00Z') / 864e5);

// YOU is not a row. It is the average of every index you own, per day.
//
// A stock joins YOU on the day of its first reading. It cannot be stale
// before it existed, so adding a new stock never erases your history.
//
// After that, a stock that has not been read for STALE_DAYS is stale, and
// on a stale day YOU has no value at all. It never carries a number
// forward, because that invents a reading you did not take, and it never
// quietly drops a stock, because then skipping a bad one would raise
// your score.
function etfSeries(series, members) {
  const days = [...new Set(members.flatMap(m => (series[m] || []).map(p => p.day)))].sort();
  const byMetric = {}, born = {};
  for (const m of members) {
    const pts = series[m] || [];
    byMetric[m] = Object.fromEntries(pts.map(p => [p.day, p.rank]));
    born[m] = pts.length ? dayNum(pts[0].day) : Infinity;
  }
  const last = {};
  const out = [];
  for (const day of days) {
    const t = dayNum(day);
    for (const m of members) {
      if (byMetric[m][day] !== undefined) last[m] = { rank: byMetric[m][day], t };
    }
    const live = members.filter(m => born[m] <= t);
    const fresh = live.map(m => last[m]).filter(s => s && t - s.t <= STALE_DAYS);
    if (!live.length || fresh.length !== live.length) continue;   // silence, not a guess
    out.push({
      day,
      rank: Math.round(fresh.reduce((a, s) => a + s.rank, 0) / fresh.length * 10) / 10
    });
  }
  return out;
}

// How many days YOU could actually be worked out, and how many it skipped.
function coverage(series, members) {
  const days = [...new Set(members.flatMap(m => (series[m] || []).map(p => p.day)))];
  return { drawn: etfSeries(series, members).length, days: days.length };
}

// ---- commits: the other column ----
//
// A stock has a value every day. It is a noun.
// A commit has a start and an end. It is a verb.
// It has no line of its own. What it did shows up in everything else.

const slugCommit = s =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'commit';

async function readCommits(db) {
  const { data, error } = await db
    .from('events')
    .select('metric, context, event_type, occurred_at')
    .in('event_type', ['commit', 'commit_end'])
    .order('occurred_at', { ascending: true })
    .limit(20000);
  if (error) throw error;

  const byId = {};
  for (const r of data) {
    if (r.event_type === 'commit') {
      byId[r.metric] = { id: r.metric, name: r.context.name, from: r.context.from, to: null };
    } else if (byId[r.metric]) {
      byId[r.metric].to = r.context.to;          // latest end wins
    }
  }
  const today = new Date().toISOString().slice(0, 10);
  return Object.values(byId)
    .map(c => ({ ...c, days: dayNum(c.to || today) - dayNum(c.from) + 1 }))
    .sort((a, b) => b.from.localeCompare(a.from));
}

// ---- the test: did it work? ----
//
// Compare the days a commit was running against the same number of days
// straight before it. That is it. No model, no adjustment, no cleverness.
//
// The numbers are always shown. Only the verdict is gated, by two rules:
//   1. Fewer than MIN_DAYS on either side and it says too early.
//   2. An effect smaller than two standard errors is noise wearing a number.

const MIN_DAYS = 10;

// Spread of the average, not of the readings.
function standardError(xs) {
  if (xs.length < 2) return Infinity;
  const m = mean(xs);
  const v = xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1);
  return Math.sqrt(v / xs.length);
}

function ranksBetween(points, fromDay, toDay) {
  return points.filter(p => {
    const t = dayNum(p.day);
    return t >= fromDay && t <= toDay;
  }).map(p => p.rank);
}

// Any other commit that was running at the same time cannot be separated
// from this one. The system names the collision instead of picking a winner.
function collisionsWith(commit, commits, today) {
  const a0 = dayNum(commit.from), a1 = dayNum(commit.to || today);
  return commits.filter(c => {
    if (c.id === commit.id) return false;
    const b0 = dayNum(c.from), b1 = dayNum(c.to || today);
    return b0 <= a1 && b1 >= a0;
  });
}

function testCommit(points, commit, commits, todayStr) {
  const today = dayNum(todayStr);
  const start = dayNum(commit.from);
  const end = Math.min(dayNum(commit.to || todayStr), today);
  const length = end - start;

  const during = ranksBetween(points, start, end);
  const before = ranksBetween(points, start - length - 1, start - 1);
  const clash = collisionsWith(commit, commits, todayStr);

  const out = {
    during: during.length,
    before: before.length,
    clash,
    duringMean: during.length ? Math.round(mean(during)) : null,
    beforeMean: before.length ? Math.round(mean(before)) : null
  };

  // Nothing to compare against. Say so, and still show what is there.
  if (!before.length) {
    out.verdict = 'no before';
    out.why = `${during.length} days while it ran, and nothing before it. ` +
              `Your data starts after this began, so there is no version of ` +
              `you without it to compare against.`;
    return out;
  }

  // From here on the numbers are always shown. Only the verdict is gated.
  const effect = mean(during) - mean(before);
  const se = Math.sqrt(standardError(during) ** 2 + standardError(before) ** 2);
  out.effect = Math.round(effect * 10) / 10;
  out.bar = Math.round(2 * se * 10) / 10;
  const dir = effect > 0 ? 'up' : 'down';

  const short = Math.max(MIN_DAYS - during.length, MIN_DAYS - before.length);
  if (short > 0) {
    out.verdict = 'early';
    out.needs = short;
    out.why = `${dir === 'up' ? 'Up' : 'Down'} ${Math.abs(out.effect)} points so far. ` +
              `That is real movement, but it is ${short} day${short > 1 ? 's' : ''} ` +
              `short of being worth a verdict. Keep going.`;
    return out;
  }

  if (Math.abs(effect) < 2 * se) {
    out.verdict = 'no finding';
    out.why = `${dir === 'up' ? 'Up' : 'Down'} ${Math.abs(out.effect)} points. ` +
              `The bar was ${out.bar}. Too small to tell apart from an ordinary good week.`;
    return out;
  }

  if (clash.length) {
    out.verdict = 'tangled';
    out.why = `${dir === 'up' ? 'Up' : 'Down'} ${Math.abs(out.effect)} points, ` +
              `which clears the bar of ${out.bar}. But ` +
              `${clash.map(c => c.name).join(' and ')} ran at the same time, ` +
              `so this cannot be pulled apart.`;
    return out;
  }

  out.verdict = 'finding';
  out.why = `${dir === 'up' ? 'Up' : 'Down'} ${Math.abs(out.effect)} points ` +
            `against a bar of ${out.bar}, with nothing else running.`;
  return out;
}


// ---- goals: what the stocks are for ----
//
// A goal names the measures it is made of, and can name a target on one
// of them. It is an event like a rule: the latest row per goal wins and
// the older ones stay on the record. A goal has no readings of its own.
// Its line is YOU drawn over only its measures, by exactly the same rules.

async function readGoals(db) {
  const { data, error } = await db
    .from('events')
    .select('metric, context, occurred_at')
    .eq('event_type', 'goal')
    .order('occurred_at', { ascending: true })
    .limit(20000);
  if (error) throw error;
  const byId = new Map();                       // latest wins, first declared keeps its place
  for (const r of data) {
    const c = r.context || {};
    const t = c.target;
    byId.set(r.metric, {
      id: r.metric,
      name: typeof c.name === 'string' && c.name ? c.name : r.metric,
      target: t && typeof t.metric === 'string' ? t : null,
      measures: Array.isArray(c.measures) ? c.measures.filter(m => typeof m === 'string') : [],
      declared: r.occurred_at
    });
  }
  return [...byId.values()];
}

// target is optional: { metric, value } or { metric, lo, hi }.
async function writeGoal(db, name, measures, target) {
  const context = { name, measures };
  if (target) context.target = target;
  return db.from('events').insert({
    occurred_at: new Date().toISOString(),
    metric: slugCommit(name),
    event_type: 'goal',
    value: null,
    source: 'you',
    context
  });
}

// A goal's line is YOU over only its measures. The same silence rule holds:
// one stale measure and the goal has no value that day.
function goalSeries(goal, series) {
  return etfSeries(series, goal.measures);
}

// The measure with the lowest latest index. Where the goal is weakest now.
function weakPoint(goal, series) {
  let weak = null;
  for (const m of goal.measures) {
    const pts = series[m];
    if (!pts || !pts.length) continue;
    const p = pts[pts.length - 1];
    if (!weak || p.rank < weak.rank) weak = { metric: m, rank: p.rank, day: p.day };
  }
  return weak;
}
