// Reads the ledger. Turns raw numbers into ranks. Nothing else.

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

// 0 to 100. 100 is always better, whichever way the raw number goes.
//
// Ties count as half. Without that, a reading equal to every baseline
// reading scores zero, and a metric that simply never changes would look
// like your worst possible day, every day.
function rankOf(value, baseline, lowerIsBetter) {
  if (baseline.length === 0) return 50;
  const below = baseline.filter(b => b < value).length;
  const same = baseline.filter(b => b === value).length;
  const r = Math.round(((below + same / 2) / baseline.length) * 100);
  return lowerIsBetter ? 100 - r : r;
}

// Returns { metric: [{ day, value, rank }] }
// value is always the real reading. rank is the scored version.
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
      rank: rankOf(scored[i], base, lower)
    }));
  }
  return out;
}

const dayNum = d => Math.floor(Date.parse(d + 'T00:00:00Z') / 864e5);

// YOU is not a row. It is the average of every rank you own, per day.
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
      rank: Math.round(fresh.reduce((a, s) => a + s.rank, 0) / fresh.length)
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
// Two gates, and both of them refuse rather than guess:
//   1. Fewer than MIN_DAYS on either side and there is nothing to say.
//   2. An effect smaller than two standard errors is noise wearing a number.

const MIN_DAYS = 14;

const mean = xs => xs.reduce((a, b) => a + b, 0) / xs.length;

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

  const out = { during: during.length, before: before.length, clash };

  if (during.length < MIN_DAYS || before.length < MIN_DAYS) {
    out.verdict = 'not enough';
    out.why = `${during.length} days during, ${before.length} before. ` +
              `Needs ${MIN_DAYS} of each.`;
    return out;
  }

  const effect = mean(during) - mean(before);
  const se = Math.sqrt(standardError(during) ** 2 + standardError(before) ** 2);
  out.effect = Math.round(effect * 10) / 10;
  out.se = Math.round(se * 10) / 10;
  out.bar = Math.round(2 * se * 10) / 10;

  if (Math.abs(effect) < 2 * se) {
    out.verdict = 'no finding';
    out.why = `Moved ${out.effect} rank points. The bar was ${out.bar}. ` +
              `Too small to tell apart from noise.`;
    return out;
  }

  if (clash.length) {
    out.verdict = 'tangled';
    out.why = `Moved ${out.effect} rank points, which clears the bar of ${out.bar}. ` +
              `But ${clash.map(c => c.name).join(' and ')} ran at the same time, ` +
              `so this cannot be pulled apart.`;
    return out;
  }

  out.verdict = 'finding';
  out.why = `Moved ${out.effect} rank points against a bar of ${out.bar}, ` +
            `with nothing else running.`;
  return out;
}
