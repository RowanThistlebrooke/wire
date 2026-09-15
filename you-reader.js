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


// ---- the scan: one commit against everything ----
//
// The declared test asks one question at the ordinary bar, and its answer
// is a finding. The scan asks every question you own at once, and its
// answers are only leads.
//
// The bar has to go up. Check fifteen stocks at two standard errors and
// roughly one of them clears it by pure chance. At 3.3 the chance of any
// single false alarm across a normal ledger drops to about one in twenty,
// which is the same protection the declared test had to begin with.
const SCAN_BAR = 3.3;

// A testCommit result read at the raised bar. A stock that never varies has
// a bar of zero, and zero clears zero: no movement is not a lead. unconfident
// is the pages' word for an effect of at least one standard error.
function scanLead(r) {
  if (r.effect === undefined || r.bar == null) return { raised: null, lead: false, unconfident: false };
  const raised = Math.round(SCAN_BAR * (r.bar / 2) * 10) / 10;   // bar was 2 standard errors
  return { raised, lead: r.verdict !== 'early' && raised > 0 && Math.abs(r.effect) > 0 && Math.abs(r.effect) >= raised,
           unconfident: Math.abs(r.effect) > 0 && Math.abs(r.effect) >= r.bar / 2 };
}

function scanCommit(seriesByMetric, commit, commits, todayStr) {
  const rows = [];
  for (const metric of Object.keys(seriesByMetric)) {
    const r = testCommit(seriesByMetric[metric], commit, commits, todayStr);
    if (r.effect === undefined) { rows.push({ metric, ...r, lead: false }); continue; }
    const { raised, lead } = scanLead(r);
    rows.push({ metric, ...r, raised, lead });
  }
  return rows.sort((a, b) => Math.abs(b.effect || 0) - Math.abs(a.effect || 0));
}


// ---- levers against outcomes: a scan too ----
//
// A goal names its outcomes, the stocks it is made of, and can name levers:
// stocks you move, each read a declared 1 or 2 days later. Every lever is
// read against every outcome of its own goal, and the question is only
// this: after the days the lever read above its usual for that weekday, was
// the outcome's index different from after the days it read below?
//
// It is a scan, so the answer is a lead, never a finding. A lead becomes a
// finding the one way the Wire has: make it a commit and let testCommit judge.
// So it is set to miss few real links and let a few coincidences through: a
// false lead costs one commit and dies at that gate, a missed link is never
// tested at all.
//
// What keeps a coincidence from reading as a lead:
//   - Weekdays are levelled first and each outcome is read against the four
//     weeks around it, so a Monday rhythm or a channel that grows for months
//     is not a lever. A day after seven days of the same reading says nothing.
//   - Each finished week is one block of the standard error, and every
//     outcome read comes from a finished week, so the week still running
//     changes nothing.
//   - The bar starts at SCAN_BAR and rises with every question the goals
//     have ever asked, and with how few weeks there are.
//   - Inside the weeks, the days the lever read above its own seven days
//     before must differ from the days it read below, the same way, by two
//     standard errors.
//   - The same test runs against the outcome on the lever's own day, a
//     reading the lever could not have caused. If that clears the bar the
//     same way, the answer is 'before': the outcome already differed on the
//     lever's day, so this lever cannot be told apart from it.
//
// What it cannot see: a habit that always falls on the same weekdays, like
// both weekend nights every week, is all weekday once weekdays are levelled,
// so it never reads as a lead.

const LAGS = [1, 2];

// Two-sided tail of Student's t, exact for whole degrees of freedom.
function tTail(t, df) {
  const th = Math.atan(Math.abs(t) / Math.sqrt(df)), c2 = Math.cos(th) ** 2, s = Math.sin(th);
  if (df === 1) return 1 - 2 * th / Math.PI;
  let term, sum;
  if (df % 2) {
    term = sum = Math.cos(th);
    for (let k = 3; k <= df - 2; k += 2) { term *= c2 * (k - 1) / k; sum += term; }
    return 1 - 2 / Math.PI * (th + s * sum);
  }
  term = sum = 1;
  for (let k = 2; k <= df - 2; k += 2) { term *= c2 * (k - 1) / k; sum += term; }
  return 1 - s * sum;
}

// The bar for `asked` questions at df: the chance of any false lead among
// all of them stays at one in twenty. Never below SCAN_BAR.
function crossBar(asked, df) {
  const p = 1 / (20 * Math.max(1, asked));
  let z = SCAN_BAR;
  while (df >= 1 && tTail(z, df) > p) z = Math.round((z + 0.1) * 10) / 10;
  return z;
}

const weekOf = t => Math.floor((t + 3) / 7);       // Monday to Sunday
const weekdayOf = t => (t + 3) % 7;

// Pair each lever day with the outcome `lag` days later and level both by
// weekday. A pair counts only when its outcome is in a finished week. A day
// with no reading on either side is simply not in the test.
//
// A day is high when the lever read above its usual level for that weekday,
// low when below, and it counts by how far: a day far above weighs more than
// a day just above. A day that follows seven days of exactly the same
// reading says nothing: nobody was moving the lever. Each outcome is read
// against the four weeks around it, so a slow drift is not taken for the lever.
//
// Two differences come out. The first is every high day against every low
// day, weighted by distance, with each finished week as one block of its
// standard error. For a lever with two values it is the plain difference.
// The second stays inside each week and reads high and low against the
// lever's own seven days before, on weekdays the lever ever moved.
function crossSplit(leverRows, outcomeAt, lag, openWeek) {
  const pairs = [];
  for (const r of leverRows) {
    const t = dayNum(r.day);
    if (weekOf(t + lag) >= openWeek) continue;
    const o = outcomeAt.get(t + lag);
    if (!o) continue;
    pairs.push({ day: r.day, next: o.day, t, value: Number(r.mean), rank: o.rank, side: null });
  }
  const level = val => {
    const sum = {}, n = {};
    for (const p of pairs) { const k = weekdayOf(p.t); sum[k] = (sum[k] || 0) + val(p); n[k] = (n[k] || 0) + 1; }
    return p => val(p) - sum[weekdayOf(p.t)] / n[weekdayOf(p.t)];
  };
  const lv = level(p => p.value), ov = level(p => p.rank);
  const byDay = new Map(pairs.map(p => [p.t, p]));
  const first = {}, moved = {};
  for (const p of pairs) {
    p.lv = lv(p); p.ov = ov(p);
    const k = weekdayOf(p.t);
    if (!(k in first)) first[k] = p.value; else if (p.value !== first[k]) moved[k] = true;
  }
  const weeks = new Map();
  let high = 0, low = 0;
  for (const p of pairs) {
    let same = true, before = 0, nb = 0, around = 0, na = 0;
    for (let k = 1; k <= 7; k++) { const q = byDay.get(p.t - k); if (!q || q.value !== p.value) same = false; if (q) { before += q.lv; nb++; } }
    if (same) continue;
    for (let k = -14; k <= 14; k++) { const q = byDay.get(p.t + k); if (q) { around += q.ov; na++; } }
    const oc = p.ov - around / na, d = moved[weekdayOf(p.t)] && nb ? p.lv - before / nb : 0;
    p.side = p.lv > 1e-9 ? 'high' : p.lv < -1e-9 ? 'low' : null;
    const inWeek = d > 1e-9 ? 'high' : d < -1e-9 ? 'low' : null;
    if (!p.side && !inWeek) continue;
    const w = weekOf(p.t);
    if (!weeks.has(w)) weeks.set(w, { lean: 0, far: 0, inHigh: [], inLow: [] });
    const wk = weeks.get(w);
    if (p.side) { wk.lean += 2 * p.lv * oc; wk.far += Math.abs(p.lv); if (p.side === 'high') high++; else low++; }
    if (inWeek === 'high') wk.inHigh.push(oc);
    if (inWeek === 'low') wk.inLow.push(oc);
  }
  const sum = xs => xs.reduce((a, x) => a + x, 0);
  const all = [...weeks.values()].filter(w => w.far > 0);
  const effect = sum(all.map(w => w.lean)) / sum(all.map(w => w.far)), far = sum(all.map(w => w.far));
  const n = all.length, parts = all.map(w => (w.lean - effect * w.far) / far);
  const se = n > 1 ? Math.sqrt(n / (n - 1) * sum(parts.map(x => x * x))) : Infinity;
  const inWeek = [...weeks.values()].filter(w => w.inHigh.length && w.inLow.length).map(w => mean(w.inHigh) - mean(w.inLow));
  return { pairs, high, low, weeks: n, effect, se, inWeek };
}

// One lever against one outcome. The effect is in the outcome's index
// points: + is better by its rule, - is worse.
function crossTest(leverRows, outcomePoints, lag, asked, todayStr) {
  const at = new Map(outcomePoints.map(p => [dayNum(p.day), p]));
  const open = weekOf(dayNum(todayStr));
  const s = crossSplit(leverRows, at, lag, open);
  const out = { lag, pairs: s.pairs, high: s.high, low: s.low, weeks: s.weeks };
  if (!s.high || !s.low) { out.verdict = 'empty'; return out; }

  const e = s.effect;
  out.effect = Math.round(e * 10) / 10;
  // the plain average outcome after the high days and after the low days, for drawing; the effect decides
  const avg = side => { const r = s.pairs.filter(p => p.side === side).map(p => p.rank); return r.length ? Math.round(mean(r) * 10) / 10 : null; };
  out.highMean = avg('high');
  out.lowMean = avg('low');

  // The numbers are always shown. Only the verdict is gated.
  if (s.high < MIN_DAYS || s.low < MIN_DAYS) { out.verdict = 'early'; return out; }

  out.z = crossBar(asked, s.weeks - 1);
  out.raised = Number.isFinite(s.se) ? Math.round(out.z * s.se * 10) / 10 : null;
  // decided on the unrounded numbers; the rounded ones are only for showing
  if (!(Number.isFinite(s.se) && s.se > 0 && Math.abs(e) >= out.z * s.se)) { out.verdict = 'no lead'; return out; }
  // inside the weeks the lever moved, high days must differ from low days the same way, by two standard errors
  const me = mean(s.inWeek), mse = standardError(s.inWeek);
  if (!(Number.isFinite(mse) && Math.sign(me) === Math.sign(e) && Math.abs(me) >= 2 * mse)) { out.verdict = 'no lead'; return out; }

  const b = crossSplit(leverRows, at, 0, open);                // the outcome on the lever's own day
  out.before = b.high && b.low ? Math.round(b.effect * 10) / 10 : null;
  const moved = b.high >= MIN_DAYS && b.low >= MIN_DAYS && Number.isFinite(b.se) && b.se > 0 &&
                Math.sign(b.effect) === Math.sign(e) && Math.abs(b.effect) >= crossBar(asked, b.weeks - 1) * b.se;
  out.verdict = moved ? 'before' : 'lead';
  return out;
}

// Every lever of every goal against that goal's outcomes. Every question a
// goal has ever asked counts toward the bar, even after it was changed, so
// trying lags until something lights up is paid for.
function crossGrid(goals, rows, series, todayStr) {
  const asked = goals.reduce((n, g) => n + g.asked.length, 0);
  const byMetric = {};
  for (const r of rows) {
    if (!byMetric[r.metric]) byMetric[r.metric] = [];
    byMetric[r.metric].push(r);
  }
  const blocks = goals.filter(g => g.levers.length).map(g => ({
    id: g.id, name: g.name, outcomes: g.measures,
    levers: g.levers.map(l => ({
      metric: l.metric, lag: l.lag,
      cells: Object.fromEntries(g.measures.filter(o => series[o])
        .map(o => [o, crossTest(byMetric[l.metric] || [], series[o], l.lag, asked, todayStr)]))
    }))
  }));
  const leads = blocks.reduce((n, b) => n + b.levers.reduce((k, l) =>
    k + Object.values(l.cells).filter(c => c.verdict === 'lead').length, 0), 0);
  return { asked, leads, blocks };
}


// ---- goals: what the stocks are for ----
//
// A goal names the measures it is made of, and can name a target on one
// of them. It is an event like a rule: the latest row per goal wins and
// the older ones stay on the record. A goal has no readings of its own.
// Its line is YOU drawn over only its measures, by exactly the same rules.
// It can also name levers, stocks you move, which are read against its
// measures by crossGrid and never enter its line.

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
    const measures = Array.isArray(c.measures) ? c.measures.filter(m => typeof m === 'string') : [];
    // a lever is a stock and a lag, not one of this goal's own measures, named once
    const levers = [];
    for (const l of Array.isArray(c.levers) ? c.levers : [])
      if (l && typeof l.metric === 'string' && LAGS.includes(l.lag) &&
          !measures.includes(l.metric) && !levers.some(x => x.metric === l.metric))
        levers.push({ metric: l.metric, lag: l.lag });
    // every question this goal has ever asked, kept after it changes
    const asked = byId.has(r.metric) ? byId.get(r.metric).asked : [];
    for (const l of levers) for (const m of measures)
      if (!asked.some(a => a.metric === l.metric && a.lag === l.lag && a.outcome === m))
        asked.push({ metric: l.metric, lag: l.lag, outcome: m });
    byId.set(r.metric, {
      id: r.metric,
      name: typeof c.name === 'string' && c.name ? c.name : r.metric,
      target: t && typeof t.metric === 'string' ? t : null,
      measures,
      levers,
      asked,
      declared: r.occurred_at
    });
  }
  return [...byId.values()];
}

// target is optional: { metric, value } or { metric, lo, hi }.
// levers is optional: [{ metric, lag }], stocks you move, read lag days later.
async function writeGoal(db, name, measures, target, levers) {
  const context = { name, measures };
  if (target) context.target = target;
  if (levers && levers.length) context.levers = levers.map(l => ({ metric: l.metric, lag: l.lag }));
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
