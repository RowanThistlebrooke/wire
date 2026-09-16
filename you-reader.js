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
    .select('day, metric, mean, readings')
    .in('metric', metrics)
    .order('day', { ascending: true })
    .limit(20000);
  if (error) throw error;
  return data;
}

// The ledger's day for a moment, now unless another is given. The day is
// defined once, by day_of in the database: your timezone, ending at 6am.
// The pages and the MCP ask for it here and never work it out themselves.
async function readDay(db, ts = new Date().toISOString()) {
  const { data, error } = await db.rpc('day_of', { ts });
  if (error) throw error;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) throw new Error('day_of does not return a date');
  return data;
}

// ---- voids: stop counting, without removing anything ----
//
// A void is one more row. It says: do not count this reading. Nothing is
// deleted, law 1 is untouched, every reading stays in the ledger, and one
// more row brings it back.
//
// context { metric, day, voided }. The day names one reading. No day means
// every reading of that metric up to the void row's own day, which is the
// ledger's day and so comes from day_of, like every other day here. The
// latest row per metric and day wins, as rules and goals do, and a row that
// names the day is the last word on that day, so a dayless void can be
// undone one reading at a time.
//
// A ledger whose void rows all name a day never asks day_of at all, and one
// with several dayless rows asks for them at once, not a round trip each.
// The asker can be handed in: the MCP hands in its own, which names day_of
// and health when the day cannot be read.
const isDay = d => /^\d{4}-\d{2}-\d{2}$/.test(d || '');

async function readVoids(db, dayOf) {
  const { data, error } = await db
    .from('events')
    .select('metric, context, occurred_at')
    .eq('event_type', 'void')
    .order('occurred_at', { ascending: true })
    .limit(20000);
  if (error) throw error;
  const latest = new Map();
  // A row that does not say voided says nothing, and its readings keep counting. A
  // row that cannot be read must never be the reason a reading is dropped.
  for (const r of data) {
    const c = r.context || {};
    if (c.commit) continue;                  // a commit's void is not a reading's; commitVoided reads those
    const metric = typeof c.metric === 'string' ? c.metric : r.metric;
    const day = isDay(c.day) ? c.day : null;
    latest.set(metric + '|' + (day || ''), { metric, day, voided: !!c.voided, at: r.occurred_at });
  }
  const rows = [...latest.values()];
  const wide = rows.filter(r => !r.day && r.voided);          // the dayless rows still standing
  const at = dayOf || (ts => readDay(db, ts));
  const days = await Promise.all(wide.map(r => at(r.at)));    // the ledger's day of each of those rows
  const out = {};
  const of = m => out[m] || (out[m] = { days: {}, upTo: null });
  for (const r of rows) if (r.day) of(r.metric).days[r.day] = r.voided;
  wide.forEach((r, i) => { of(r.metric).upTo = days[i]; });
  return out;
}

async function writeVoid(db, metric, day, voided) {
  return db.from('events').insert({
    occurred_at: new Date().toISOString(),
    metric,
    event_type: 'void',
    value: null,
    source: 'you',
    context: { metric, day, voided }
  });
}

// The void's rule, written once and read by everything: a reading is not
// counted while a void row names its day, or a dayless void row sits on or
// after it. rankSeries reads its rows through this, and so does every other
// reader of the day rows, the lever scan included, so no two of them can
// drift apart.
function voidedOn(voids, metric, day) {
  const v = voids && voids[metric];
  if (!v) return false;
  if (day in v.days) return v.days[day];   // the row that names the day is the last word on it
  return !!v.upTo && day <= v.upTo;
}
function liveRows(rows, voids) { return voids && Object.keys(voids).length ? rows.filter(r => !voidedOn(voids, r.metric, r.day)) : rows; }

// The one reading a void names: the day row as day_metrics made it, or null
// when that metric has nothing on that day. Read, never guessed.
function readingOn(rows, metric, day) { return rows.find(r => r.metric === metric && r.day === day) || null; }

// A commit is voided the same way, by one more row, under the same laws. It
// has no day and no value to name, because it is one thing with a start, so
// the row names the commit itself: context { commit, name, from, voided },
// and the latest row per commit wins, as rules do.
//
// A voided commit is in no test, no scan, and not in WHAT MOVES IT. It cannot
// collide with another commit either: a commit that is not counted cannot
// muddy one that is. That is one filter, liveCommits, applied where the
// commits are read, so no two readers of them can drift apart.
//
// What it is not: it is not a delete. The rows stay, the commit stays in the
// ledger struck through, and its name stays taken, so nothing can quietly
// take its place. One more row counts it again.
async function readCommitVoids(db) {
  const { data, error } = await db
    .from('events')
    .select('context, occurred_at')
    .eq('event_type', 'void')
    .order('occurred_at', { ascending: true })
    .limit(20000);
  if (error) throw error;
  const out = {};
  // rows arrive oldest first, so the last one to name a commit is the one that stands
  for (const r of data) {
    const c = r.context || {};
    if (typeof c.commit === 'string') out[c.commit] = !!c.voided;
  }
  return out;
}

async function writeCommitVoid(db, commit, voided) {
  return db.from('events').insert({
    occurred_at: new Date().toISOString(),
    metric: commit.id,
    event_type: 'void',
    value: null,
    source: 'you',
    context: { commit: commit.id, name: commit.name, from: commit.from, voided }
  });
}

function commitVoided(cvoids, id) { return !!(cvoids && cvoids[id]); }
function liveCommits(commits, cvoids) {
  return cvoids && Object.keys(cvoids).length ? commits.filter(c => !commitVoided(cvoids, c.id)) : commits;
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
//
// A voided reading is in none of this: no series, so no index, and so
// nothing in YOU, in a goal or in the scan. The baseline rebuilds from the
// readings that remain, so a metric can start clean without changing its
// name, and voided away to nothing it has no series at all.
function rankSeries(rows, rules, voids = {}) {
  const out = {};
  for (const metric of Object.keys(rules)) {
    const rule = rules[metric];
    if (rule.kind === 'ignore') continue;
    const mine = rows.filter(r => r.metric === metric && !voidedOn(voids, metric, r.day));
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

// today is the ledger's day, from readDay: a running commit counts its days up to it. A start that is
// already today somewhere but not yet in the ledger's own day has run 0 days, never fewer.
async function readCommits(db, today) {
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
  return Object.values(byId)
    .map(c => ({ ...c, days: Math.max(0, dayNum(c.to || today) - dayNum(c.from) + 1) }))
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
// this: after the days the lever read above its usual, was the outcome's
// index different from after the days it read below?
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
//     is not a lever. A habit that starts, stops or moves to another day is
//     read inside its own stretches; blocks of work weeks, seasons and rotas
//     against the nearest weeks of the same weekday.
//   - A lever that moves with a whole busy week is read against the other
//     days of its week, and the outcome on the lever's own day and the day
//     before are taken out, so a busy week or an illness that moves both is
//     not taken for the lever.
//   - Each finished week is one block of the standard error, and every
//     reading comes from a finished week, so the week still running changes
//     nothing.
//   - The bar starts at SCAN_BAR and rises with every question the goals
//     have ever asked, and with how few weeks there are.
//   - The same reading runs against the outcome on the lever's own day, which
//     the lever could not have caused. If that is as large, the answer is
//     'before': the outcome already differed on the lever's day, so this
//     lever cannot be told apart from it.
//
// What no data can answer: a lever that reads the same on every one of its
// weekdays every week, like a drink on every single Saturday, is the week
// itself. Its verdict is 'fixed': change it for a few weeks as a commit,
// and testCommit can answer.

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

// Pair each lever day with the outcome `lag` days later. A pair counts only
// when its outcome is in a finished week, and every reading that levels it
// comes from a finished week too. A day with no reading is simply not there.
//
// The lever is read against its usual level for that weekday. When a
// weekday's reading tends to repeat the week before, something slower than
// the lever is moving it.
//
// If one or two changes of level on each weekday account for that (a habit
// that starts, stops, thins out or moves to another day) and most of the
// lever's movement is left inside the stretches between them, the lever is
// still read against its usual level, unless that reading comes out beyond
// the one inside the stretches by two standard errors: then the stretches
// are doing it, and each day is read only against its own stretch.
//
// Otherwise (blocks of work weeks, a season, a rota) each day is read only
// against the nearest readings of its own weekday, about two weeks either
// side, and a day where those readings sit on one side of the lever's middle
// and then switch to the other side and stay is a switch, not a week the
// lever moved, so it is left out.
//
// Each day is then read against the other days of its own week, leaving out
// the days next to its outcome, so a busy week that moves the lever and the
// outcome together cancels.
//
// The outcome is read against its weekday and the four weeks around it. When
// the lever is read against its usual level, the outcome on the lever's own
// day and the day before are taken out inside the estimate: whatever they
// explain is not the lever's.
//
// The effect is the outcome's change for each unit of the lever, times the
// lever's usual distance between a high and a low day. For a lever with two
// values it is the plain difference. Each finished week is one block of its
// standard error.
//
// When the lever read against its usual level moves on several days of the
// same week together, the effect is read once more with each day against
// only the other days of its week that the lever moves, each scaled to its
// weekday's own spread. If the first reading comes out beyond that one by two
// standard errors, the week is doing it, not the day: `apart`.
function crossSplit(leverRows, outcomeAt, lag, openWeek, adjust = lag ? [0, -1] : [], control = []) {
  const pairs = [];
  for (const r of leverRows) {
    const t = dayNum(r.day);
    if (weekOf(t + lag) >= openWeek) continue;
    const o = outcomeAt.get(t + lag);
    if (!o) continue;
    pairs.push({ day: r.day, next: o.day, t, value: Number(r.mean), rank: o.rank, side: null });
  }
  const L = new Map(), O = new Map();
  for (const r of leverRows) { const t = dayNum(r.day); if (weekOf(t) < openWeek) L.set(t, Number(r.mean)); }
  for (const [t, p] of outcomeAt) if (weekOf(t) < openWeek) O.set(t, p.rank);
  const level = m => {
    const s = [0, 0, 0, 0, 0, 0, 0], n = [0, 0, 0, 0, 0, 0, 0], d = new Map();
    for (const [t, v] of m) { s[weekdayOf(t)] += v; n[weekdayOf(t)]++; }
    for (const [t, v] of m) d.set(t, v - s[weekdayOf(t)] / n[weekdayOf(t)]);
    return d;
  };
  const ld = level(L), od = level(O), ol = new Map();
  for (const [t, v] of od) { let s = 0, n = 0; for (let k = -14; k <= 14; k++) if (od.has(t + k)) { s += od.get(t + k); n++; } ol.set(t, v - s / n); }

  // does a weekday's reading tend to repeat the week before?
  const repeats = dev => {
    let same = 0, all = 0;
    for (const [t, v] of dev) { all += v * v; if (dev.has(t + 7)) same += v * dev.get(t + 7); }
    return all > 0 && same / all > 0.15;
  };
  const local = repeats(ld);

  // each weekday split into at most three stretches, each read against its own mean
  let stretch = null;
  if (local) {
    const days = [[], [], [], [], [], [], []], dev = new Map();
    for (const t of [...L.keys()].sort((a, b) => a - b)) days[weekdayOf(t)].push(t);
    let inside = 0, whole = 0;
    for (const ts of days) {
      const n = ts.length;
      if (!n) continue;
      const c = [0], c2 = [0];
      for (const t of ts) { const x = L.get(t); c.push(c[c.length - 1] + x); c2.push(c2[c2.length - 1] + x * x); }
      const sse = (a, b) => Math.max(0, c2[b] - c2[a] - (c[b] - c[a]) ** 2 / (b - a));
      const score = (e, m) => n * Math.log(Math.max(e, 1e-9) / n) + 3 * m * Math.log(n);
      const all = sse(0, n);
      let best = all, cuts = [];
      if (all > 1e-9) {
        let s = score(all, 0);
        for (let i = 4; i <= n - 4; i++) {
          const e = sse(0, i) + sse(i, n);
          if (score(e, 1) < s) { s = score(e, 1); best = e; cuts = [i]; }
          for (let j = i + 4; j <= n - 4; j++) {
            const e2 = sse(0, i) + sse(i, j) + sse(j, n);
            if (score(e2, 2) < s) { s = score(e2, 2); best = e2; cuts = [i, j]; }
          }
        }
      }
      inside += best; whole += all;
      const bounds = [0, ...cuts, n];
      for (let k = 0; k + 1 < bounds.length; k++) {
        const a = bounds[k], b = bounds[k + 1], mu = (c[b] - c[a]) / (b - a);
        for (let i = a; i < b; i++) dev.set(ts[i], L.get(ts[i]) - mu);
      }
    }
    if (!repeats(dev) && inside >= 0.4 * whole) stretch = dev;
  }

  const sorted = [...L.values()].sort((a, b) => a - b), middle = sorted[sorted.length >> 1];
  const nearest = (t, want, far) => {
    const got = [[0, L.get(t)]];
    for (let j = 1; j <= far && got.length < want; j++) for (const d of [-j, j]) if (L.has(t + 7 * d)) got.push([d, L.get(t + 7 * d)]);
    return got.sort((a, b) => a[0] - b[0]).map(g => g[1]);
  };
  const near = t => {
    if (!L.has(t)) return undefined;
    const sides = nearest(t, 7, 7).map(v => Math.sign(v - middle));
    let turns = 0, at = 0;
    for (let i = 1; i < sides.length; i++) if (sides[i] !== sides[i - 1]) { turns++; at = i; }
    if (turns === 1 && at >= 2 && sides.length - at >= 2) return undefined;
    return L.get(t) - mean(nearest(t, 5, 6));
  };

  const dot = (x, y) => x.reduce((a, v, i) => a + v * y[i], 0);
  // the effect for an instrument zz over rows; res is what the outcome leaves once the effect is out
  const solve = (rows, zz, clean = v => v) => {
    const ls = rows.map(r => r.l), oc = rows.map(r => r.oc);
    const den = dot(zz, ls), beta = dot(zz, oc) / den, res = clean(oc.map((x, i) => x - beta * ls[i]));
    const lean = new Map(), far = new Map();
    rows.forEach((r, i) => { lean.set(r.w, (lean.get(r.w) || 0) + zz[i] * res[i] / den); far.set(r.w, (far.get(r.w) || 0) + Math.abs(zz[i])); });
    const weeks = [...far.values()].filter(x => x > 1e-9).length, spread = [...lean.values()].reduce((a, x) => a + x * x, 0);
    const se = weeks > 1 && den > 1e-9 && spread > 0 ? Math.sqrt(weeks / (weeks - 1) * spread) : Infinity;
    return { rows, beta, lean, weeks, se };
  };
  // the lever read one way, each day against the other days of its week, the days next to its outcome left out
  const read = (lever, adj) => {
    const rows = [];
    for (const p of pairs) {
      const z = lever(p.t), extra = adj.map(d => ol.get(p.t + d)).concat(control.map(d => lever(p.t + d)));
      if (z === undefined || extra.some(v => v === undefined)) continue;
      rows.push({ p, t: p.t, w: weekOf(p.t), z, l: ld.get(p.t), oc: ol.get(p.t + lag), extra });
    }
    const byWeek = new Map();
    for (const r of rows) { if (!byWeek.has(r.w)) byWeek.set(r.w, []); byWeek.get(r.w).push(r); }
    const inWeek = get => rows.map(r => {
      const xs = byWeek.get(r.w).filter(q => q.t !== r.t && (q.t < r.t + lag - 1 || q.t > r.t + lag + 1)).map(get);
      return get(r) - (xs.length ? mean(xs) : 0);
    });
    const basis = [];
    for (let j = 0; j < adj.length + control.length; j++) {
      let v = inWeek(r => r.extra[j]);
      for (const b of basis) { const c = dot(v, b) / dot(b, b); v = v.map((x, i) => x - c * b[i]); }
      if (dot(v, v) > 1e-9) basis.push(v);
    }
    const without = v => { for (const b of basis) { const c = dot(v, b) / dot(b, b); v = v.map((x, i) => x - c * b[i]); } return v; };
    return Object.assign(solve(rows, without(inWeek(r => r.z)), without), { byWeek });
  };
  // how far one reading's effect lies beyond another's, toward its own sign, in standard errors of the difference
  const beyond = (x, y) => {
    if (!Number.isFinite(x.se) || !Number.isFinite(y.se)) return 0;
    const ws = new Set([...x.lean.keys(), ...y.lean.keys()]);
    let s2 = 0;
    for (const w of ws) s2 += ((x.lean.get(w) || 0) - (y.lean.get(w) || 0)) ** 2;
    return s2 > 0 ? Math.sign(x.beta) * (x.beta - y.beta) / Math.sqrt(ws.size / (ws.size - 1) * s2) : 0;
  };

  let usual = !local || !!stretch;
  let e = usual ? read(t => ld.get(t), adjust) : read(near, []);
  if (stretch) { const w = read(t => stretch.get(t), []); if (beyond(e, w) >= 2) { e = w; usual = false; } }

  for (const r of e.rows) r.p.side = r.z > 1e-9 ? 'high' : r.z < -1e-9 ? 'low' : null;
  const high = e.rows.filter(r => r.p.side === 'high').length, low = e.rows.filter(r => r.p.side === 'low').length;

  // do the lever's days move together inside weeks? then read each day against only the other days of its week the lever moves
  let apart = false;
  if (usual) {
    const size = [0, 0, 0, 0, 0, 0, 0], n = [0, 0, 0, 0, 0, 0, 0];
    for (const r of e.rows) { size[weekdayOf(r.t)] += r.z * r.z; n[weekdayOf(r.t)]++; }
    for (let k = 0; k < 7; k++) size[k] = n[k] > 1 ? Math.sqrt(size[k] / n[k]) : 0;
    const moves = r => size[weekdayOf(r.t)] > 1e-9, scaled = r => r.z / size[weekdayOf(r.t)];
    let together = 0, alone = 0;
    for (const rs of e.byWeek.values()) {
      const xs = rs.filter(moves).map(scaled);
      if (xs.length < 2) continue;
      const s = xs.reduce((a, x) => a + x, 0), s2 = xs.reduce((a, x) => a + x * x, 0);
      together += s * s - s2; alone += (xs.length - 1) * s2;
    }
    if (alone > 0 && together >= 0.1 * alone) {
      const zw = e.rows.map(r => {
        if (!moves(r)) return 0;
        const xs = e.byWeek.get(r.w).filter(q => q.t !== r.t && (q.t < r.t + lag - 1 || q.t > r.t + lag) && moves(q)).map(scaled);
        return xs.length ? r.z - size[weekdayOf(r.t)] * mean(xs) : 0;
      });
      const w = solve(e.rows, zw);
      apart = w.se <= 2 * e.se && beyond(e, w) >= 2;
    }
  }

  const ls = e.rows.map(r => r.l);
  const k = 2 * dot(ls, ls) / ls.reduce((a, x) => a + Math.abs(x), 0);
  return { pairs, high, low, weeks: e.weeks, effect: k * e.beta, se: k * e.se, apart };
}

// One lever against one outcome. The effect is in the outcome's index
// points: + is better by its rule, - is worse.
function crossTest(leverRows, outcomePoints, lag, asked, todayStr) {
  const at = new Map(outcomePoints.map(p => [dayNum(p.day), p]));
  const open = weekOf(dayNum(todayStr));
  const s = crossSplit(leverRows, at, lag, open);
  const out = { lag, pairs: s.pairs, high: s.high, low: s.low, weeks: s.weeks };
  // fixed: on each of its weekdays the lever read the same every time, in at least three weeks each, and not the
  // same on all of them. The lever is the week itself, and nothing in these days can tell it from the week's rhythm.
  const fixedWeek = pairs => { const seen = {}, n = {}; for (const p of pairs) { const k = weekdayOf(p.t); n[k] = (n[k] || 0) + 1; if (!(k in seen)) seen[k] = p.value; else if (seen[k] !== p.value) return false; } return new Set(Object.values(seen)).size > 1 && Object.values(n).every(c => c >= 3); };
  if (fixedWeek(s.pairs)) { out.verdict = 'fixed'; return out; }
  if (!s.high || !s.low) { out.verdict = 'empty'; return out; }

  const e = Number.isFinite(s.effect) ? s.effect : 0;
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
  // the week moved the lever and the outcome, not the day
  if (s.apart) { out.verdict = 'no lead'; return out; }

  // The same reading against the outcome on the lever's own day, which the
  // lever could not have caused. If that is as large, less one standard
  // error, or still clears two standard errors once the lever's day before is
  // taken out, the outcome had already moved: 'before'.
  const b = crossSplit(leverRows, at, 0, open), c = crossSplit(leverRows, at, 0, open, [], [-1]);
  out.before = b.high && b.low && Number.isFinite(b.effect) ? Math.round(b.effect * 10) / 10 : null;
  const agrees = x => x.high >= MIN_DAYS && x.low >= MIN_DAYS && Number.isFinite(x.se) && x.se > 0 && Math.sign(x.effect) === Math.sign(e);
  const moved = (agrees(b) && Math.abs(b.effect) >= Math.abs(e) - s.se) || (agrees(c) && Math.abs(c.effect) >= 2 * c.se);
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
