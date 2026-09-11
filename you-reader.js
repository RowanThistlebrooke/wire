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
function rankOf(value, baseline, lowerIsBetter) {
  if (baseline.length === 0) return 50;
  const below = baseline.filter(b => b < value).length;
  const r = Math.round((below / baseline.length) * 100);
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
