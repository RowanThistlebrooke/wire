const mean = xs => xs.reduce((a, b) => a + b, 0) / xs.length;

// A reading is good for this many days. After that the stock is stale
// and YOU refuses to draw, rather than guessing or quietly dropping it.
const STALE_DAYS = 7;

// ---- reading all of it, and never some of it ----
//
// A query's page size belongs to the database, not to us: ask for twenty
// thousand rows and Postgres hands back the thousand its settings allow, with
// no error and nothing to say it stopped. Every read below grows with the
// ledger, so every one of them is cut short sooner or later, and a page drawn
// from some of the rows looks exactly like a page drawn from all of them. A
// silent half answer is the one failure this ledger must not have.
//
// So a read asks for one page at a time and keeps asking until a page comes
// back short. Each page must land in the same order as the one before it, or a
// row is handed over twice or skipped, so every read orders by something no
// two rows share: an event by its id, a day row by its day and its metric.
const PAGE = 1000;
async function readAll(make) {
  const all = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await make().range(from, from + PAGE - 1);
    if (error) throw error;
    all.push(...data);
    if (data.length < PAGE) return all;
  }
}

// ---- the doors: is the ledger being fed? ----
//
// Every row carries the source that wrote it, so the ledger already knows who
// fed it. What it does not know by itself is the promise: how far behind a
// door is allowed to be before something is wrong. Without that, "last wrote
// on the 10th" says nothing, because for youtube it is on time and for whoop
// it is a dead cable.
//
// The number is how many days behind a door's newest row is allowed to be,
// read on occurred_at, the day the reading belongs to and not the moment it
// landed. YouTube keeps trimming a day for about five days and Instagram for
// two, so their rows are written that far back on purpose: the promise is
// that lag, not slowness in the puller.
//
// null is a door you open yourself. The pad, an import, a shortcut and Claude
// through the MCP write when you ask and never on their own, so they are never
// late.
const FED = {
  github: 1,
  whoop: 1,
  youtube: 6,
  instagram: 3,
  tiktok: 1,
  claude: null,
  photo: null,
  pad: null,
  you: null,
  csv: null,
  shortcut: null
};

// A reading is stale when it is older than its own door can explain.
//
// One number for every stock was the wrong shape. A whoop reading six days old
// means the cable is dead; a youtube reading six days old is youtube working
// normally, because youtube does not settle a day's numbers faster than that.
// Held to one limit, the honest door looks broken and the slow door looks
// fine, and a stock that is perfectly fed falls out of YOU on the door's
// ordinary lateness.
//
// So the limit is the door's own promise plus STALE_DAYS of slack. A stock two
// doors write takes the slower promise, because either one arriving is the
// stock being fed. A door that promises nothing, a number you type or a
// picture you send, gets the slack alone, which is where every stock started.
//
// It never loosens the rule, it aims it: whoop is still stale a day after its
// promise is twice broken, and youtube is no longer stale while it is on time.
function staleAfter(sources) {
  let promise = 0;
  for (const s of sources || []) { const p = FED[s]; if (Number.isFinite(p) && p > promise) promise = p; }
  return STALE_DAYS + promise;
}

// Which doors have written each stock. day_metrics keeps no source, so the
// day rows cannot answer this and the events have to be asked.
async function readSources(db) {
  const data = await readAll(() => db
    .from('events')
    .select('metric, source')
    .eq('event_type', 'measurement')
    .order('occurred_at', { ascending: false })
    .order('id', { ascending: false }));
  const out = {};
  for (const r of data) {
    if (!r.source) continue;
    const list = out[r.metric] || (out[r.metric] = []);
    if (!list.includes(r.source)) list.push(r.source);
  }
  return out;
}

// metric -> how many days old a reading of it may be. Built once from the
// doors each stock has, and handed to every reader that asks about silence.
const staleBounds = sources => {
  const by = {};
  for (const m of Object.keys(sources || {})) by[m] = staleAfter(sources[m]);
  return m => (m in by ? by[m] : STALE_DAYS);
};

// The newest row each source has written. Newest first, so the first row seen
// for a source is its last one. Every event_type counts: a rule, a goal or a
// void is Claude feeding the ledger as much as a reading is.
async function readFeeds(db) {
  const data = await readAll(() => db
    .from('events')
    .select('source, occurred_at')
    .order('occurred_at', { ascending: false })
    .order('id', { ascending: false }));
  const last = {};
  for (const r of data) if (r.source && !(r.source in last)) last[r.source] = r.occurred_at;
  return last;
}

// One answer per door: when it last wrote, how many days ago, and which of
// three states that is. Days are whole days elapsed, not calendar days, so no
// row has to be put through day_of: a promise is about how long ago, not about
// which day the ledger is on.
//
// The promise is its own grace. On time up to it, drifting up to twice it,
// stale past that, so a door one day late reads differently from one that has
// stopped. A door with no promise is none of the three, because it cannot be
// late. A source the ledger has that this map does not is listed the same way,
// so a new door shows up the day it first writes and never claims a promise
// nobody made.
function feedOf(last, now = Date.now()) {
  const seen = last || {};
  return [...new Set([...Object.keys(FED), ...Object.keys(seen)])].sort().map(source => {
    const at = seen[source] || null;
    const promise = source in FED ? FED[source] : null;
    const days = at ? Math.max(0, Math.floor((now - Date.parse(at)) / 864e5)) : null;
    const state = promise == null || days == null ? 'none'
                : days <= promise ? 'ontime'
                : days <= promise * 2 ? 'drifting'
                : 'stale';
    return { source, promise, last: at, days, state };
  });
}

// Every metric you have ever recorded.
async function readMetrics(db) {
  const data = await readAll(() => db
    .from('day_metrics').select('day, metric')
    .order('day', { ascending: true }).order('metric', { ascending: true }));
  return [...new Set(data.map(r => r.metric))].sort();
}

// Rules live in the same ledger as everything else. They are events with a
// different event_type, so day_metrics never sees them. Latest rule per
// metric wins, and the older ones stay on the record.
async function readRules(db) {
  const data = await readAll(() => db
    .from('events')
    .select('metric, context, occurred_at')
    .eq('event_type', 'rule')
    .order('occurred_at', { ascending: true })
    .order('id', { ascending: true }));
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
  return readAll(() => db
    .from('day_metrics')
    .select('day, metric, mean, readings')
    .in('metric', metrics)
    .order('day', { ascending: true })
    .order('metric', { ascending: true }));
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

// When a reading happened, as it was written down. A date is its own day. A timestamp must say its
// zone, because a bare clock time would be a guess at one, and its date must be one the calendar has,
// or Date.parse would quietly roll 30 February into March. A date past today everywhere on Earth, or
// a moment more than five minutes ahead, has not happened yet. The MCP's record, you.html's drop and
// import.html all read a reading's time through here, so they put the same reading on the same day.
const isDate = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) &&
  Number.isFinite(Date.parse(s + 'T00:00:00Z')) && new Date(s + 'T00:00:00Z').toISOString().slice(0, 10) === s;
const isStamp = s => typeof s === 'string' && isDate(s.slice(0, 10)) && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/.test(s) && Number.isFinite(Date.parse(s));
// the latest date that is today somewhere on Earth: the date at UTC+14, the zone furthest ahead
const lastDay = (now = Date.now()) => new Date(now + 14 * 3600e3).toISOString().slice(0, 10);
function readWhen(s, now = Date.now()) {
  if (isDate(s)) return s > lastDay(now) ? { why: 'in the future' } : { date: s };
  if (isStamp(s)) return Date.parse(s) > now + 5 * 60e3 ? { why: 'in the future' } : { stamp: new Date(Date.parse(s)).toISOString() };
  return { why: 'not a date or a timestamp with a zone' };
}

// A moment day_of puts on this date, or null. Noon UTC, as commits are, unless the ledger's day there is
// another date, as it is west of UTC-6, where noon UTC is still before 6am: then 8pm UTC if noon was the
// day before, 4am UTC if it was the day after. day_of confirms the one it gives. The asker can be handed
// in, as readVoids takes one.
async function momentOn(db, date, dayOf = ts => readDay(db, ts)) {
  const at = h => new Date(Date.parse(date + 'T00:00:00Z') + h * 3600e3).toISOString();
  const noon = at(12), d = await dayOf(noon);
  if (d === date) return noon;
  const other = at(d < date ? 20 : 4);
  return (await dayOf(other)) === date ? other : null;
}

// Every date at a moment day_of puts on it, eight at a time, for a door bringing many. at maps each date
// to its moment, or to null where it has none; why says for each of those why not: no moment tried is on
// that date, or day_of could not be asked about it. One date that cannot be placed never stops the others:
// its rows are skipped and counted, and the rest land. tick is told how many dates have been tried.
async function momentsOn(db, dates, tick = () => {}) {
  const at = new Map(), why = new Map();
  for (let i = 0; i < dates.length; i += 8) {
    await Promise.all(dates.slice(i, i + 8).map(async d => {
      let m = null;
      try { m = await momentOn(db, d); if (!m) why.set(d, 'day_of puts none of the moments tried on its date'); }
      catch (e) { why.set(d, 'day_of could not be asked about its date: ' + ((e && e.message) || e)); }
      at.set(d, m);
    }));
    tick(at.size);
  }
  return { at, why };
}

// ---- a reading, once: the same reading twice lands once, whichever door brings it ----
//
// A reading's key is its stock and a time, joined by a colon, and it is the row's source_id. A file keys
// a reading by the time as the file wrote it: steps:2026-09-14 for a date, and for a timestamp the moment
// it names, steps:2026-09-14T05:30:00.000Z, so one moment written two ways is one reading. The key names
// neither the file nor the row, so an export brought again to the same stocks, renamed or with rows
// added, through import.html or onto you.html, lands none of its readings twice. The stock is part of
// the key: a file sent to other stocks, as import.html does when a new file name changes the prefix it
// fills in, is other readings. record and the shortcut key by the ledger day, so a date is keyed the
// same way by every door. events_once holds the key with the source and the stock.
const readingKey = (metric, time) => {
  const t = String(time).trim();
  return metric + ':' + (isStamp(t) ? new Date(Date.parse(t)).toISOString() : t);
};

// Rows into events, each key once. Rows that share a source, a key and a stock land once when they carry
// one value, and not at all when they carry two, because picking one would be a guess. What is in already
// is asked a hundred keys at a time, so a file brought twice costs a few questions and not a write per row,
// and events_once has the last word: a batch it refuses goes in a row at a time, and a row it refuses was
// already there. A row's extra copies count as already there once that row has landed or been found. A row
// the table refuses for what it holds, a value it cannot take, is skipped and said, and the rest land;
// an error that is not about one row, the connection or the sign in, stops it and says how far it got.
// tick is told the share of the work done.
async function landRows(db, rows, tick = () => {}) {
  const id = r => r.source + '|' + r.source_id + '|' + r.metric, values = new Map(), once = new Map(), copies = new Map();
  for (const r of rows) values.set(id(r), (values.get(id(r)) || new Set()).add(r.value));
  let landed = 0, there = 0, clashed = 0, done = 0;
  const skipped = [], ofRow = e => /^2[23]/.test(String(e && e.code || '')) && e.code !== '23505';   // a data or constraint error names one row
  for (const r of rows) { const k = id(r); if (values.get(k).size > 1) clashed++; else if (once.has(k)) copies.set(k, (copies.get(k) || 0) + 1); else once.set(k, r); }
  const also = r => copies.get(id(r)) || 0;
  const out = [...once.values()], steps = Math.ceil(out.length / 100) + Math.ceil(out.length / 500), step = () => tick(Math.min(1, ++done / steps));
  // every key quoted and escaped, so a date cell holding a comma, a quote or a bracket is asked for exactly
  const inList = ids => '(' + ids.map(v => '"' + String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"').join(',') + ')';
  try {
    const have = new Set();
    for (let i = 0; i < out.length; i += 100) {
      const chunk = out.slice(i, i + 100);
      for (const source of new Set(chunk.map(r => r.source))) {
        const { data, error } = await db.from('events').select('source, source_id, metric').eq('source', source)
          .filter('source_id', 'in', inList(chunk.filter(r => r.source === source).map(r => r.source_id))).limit(1000);
        if (error) throw error;
        for (const h of data) have.add(id(h));
      }
      step();
    }
    const fresh = out.filter(r => !have.has(id(r)));
    for (const r of out) if (have.has(id(r))) there += 1 + also(r);
    for (let i = 0; i < fresh.length; i += 500) {
      const batch = fresh.slice(i, i + 500), { error } = await db.from('events').insert(batch);
      if (!error) for (const r of batch) { landed++; there += also(r); }
      else if (error.code !== '23505' && !ofRow(error)) throw error;
      else for (const r of batch) {
        const { error: e } = await db.from('events').insert(r);
        if (!e) { landed++; there += also(r); }
        else if (e.code === '23505') there += 1 + also(r);
        else if (ofRow(e)) skipped.push({ metric: r.metric, source_id: r.source_id, why: e.message });
        else throw e;
      }
      step();
    }
  } catch (error) { return { landed, there, clashed, skipped, error }; }
  tick(1);
  return { landed, there, clashed, skipped };
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
//
// ---- corrections: the right number on a day, without editing anything ----
//
// A void stops a reading counting, and on its own it leaves the day blank:
// the reading that was mistyped cannot be written again, because the same
// reading twice lands once. A correction is one more row that puts the right
// number on the day instead. context { metric, day, value, was, readings }:
// the stock, the day, the value the day reads from now on, the value it read
// when the correction was written, and how many readings the day held then.
// Nothing is edited and nothing is removed. The reading stays in the ledger,
// and the latest correction per stock and day wins, as rules and goals do.
//
// A correction names its day, so it is read here beside the voids, in the
// order they were written: a correction later than a void on that day counts
// the day again, at the corrected value, and a void naming the day later than
// a correction stops it counting, until one more row counts it again, still
// corrected. A dayless void does not reach a day a correction names, as it
// never reached a day a void row names. A row that cannot be read, a day that
// is not a date or a value that is not a number, changes nothing.
//
// A correction holds only while its day holds the readings it saw. Readings
// are never removed, so a different count means one landed after the
// correction, and which of the two numbers the day should read would be a
// guess: the day reads nothing until it is corrected again.
const isDay = d => /^\d{4}-\d{2}-\d{2}$/.test(d || '');

async function readVoids(db, dayOf) {
  const data = await readAll(() => db
    .from('events')
    .select('metric, event_type, context, occurred_at')
    .in('event_type', ['void', 'correction'])
    .order('occurred_at', { ascending: true })
    .order('id', { ascending: true }));
  const latest = new Map(), values = new Map();
  // A row that does not say voided says nothing, and its readings keep counting. A
  // row that cannot be read must never be the reason a reading is dropped.
  for (const r of data) {
    const c = r.context || {};
    if (c.commit) continue;                  // a commit's void is not a reading's; commitVoided reads those
    const metric = typeof c.metric === 'string' ? c.metric : r.metric;
    const day = isDay(c.day) ? c.day : null;
    if (r.event_type === 'correction') {
      if (!day || typeof c.value !== 'number' || !Number.isFinite(c.value)) continue;
      values.set(metric + '|' + day, { metric, day, value: c.value, seen: Number.isInteger(c.readings) && c.readings > 0 ? c.readings : null });
      latest.set(metric + '|' + day, { metric, day, voided: false, at: r.occurred_at });   // a correction counts its day
      continue;
    }
    latest.set(metric + '|' + (day || ''), { metric, day, voided: !!c.voided, at: r.occurred_at });
  }
  const rows = [...latest.values()];
  const wide = rows.filter(r => !r.day && r.voided);          // the dayless rows still standing
  const at = dayOf || (ts => readDay(db, ts));
  const days = await Promise.all(wide.map(r => at(r.at)));    // the ledger's day of each of those rows
  const out = {};
  const of = m => out[m] || (out[m] = { days: {}, upTo: null, values: {}, seen: {} });
  for (const r of rows) if (r.day) of(r.metric).days[r.day] = r.voided;
  wide.forEach((r, i) => { of(r.metric).upTo = days[i]; });
  for (const v of values.values()) { of(v.metric).values[v.day] = v.value; if (v.seen) of(v.metric).seen[v.day] = v.seen; }
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
// The correction's rule, beside it: the value a corrected day reads, or undefined for a day never corrected.
function correctedOn(voids, metric, day) {
  const v = voids && voids[metric];
  return v && v.values && day in v.values ? v.values[day] : undefined;
}
// A corrected day whose readings changed after its correction: it reads nothing until corrected again.
function staleOn(voids, metric, day, readings) {
  const v = voids && voids[metric];
  return correctedOn(voids, metric, day) !== undefined && !!v.seen && day in v.seen && Number(readings) !== v.seen[day];
}
// The day rows that count, each at the value it reads: a voided or stale day left out, a corrected day at its
// corrected value, with the value day_metrics made kept beside it as was. Every reader of the day rows
// that counts anything reads them through here.
function liveRows(rows, voids) {
  if (!voids || !Object.keys(voids).length) return rows;
  const out = [];
  for (const r of rows) {
    if (voidedOn(voids, r.metric, r.day) || staleOn(voids, r.metric, r.day, r.readings)) continue;
    const c = correctedOn(voids, r.metric, r.day);
    out.push(c === undefined ? r : { ...r, mean: c, was: r.mean });
  }
  return out;
}

// extra rides in the context beside them: a picture read again names the model that read it and what it read
async function writeCorrection(db, metric, day, value, was, readings, extra = {}) {
  return db.from('events').insert({
    occurred_at: new Date().toISOString(),
    metric,
    event_type: 'correction',
    value: null,
    source: 'you',
    context: { metric, day, value, was, readings, ...extra }
  });
}

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
  const data = await readAll(() => db
    .from('events')
    .select('context, occurred_at')
    .eq('event_type', 'void')
    .order('occurred_at', { ascending: true })
    .order('id', { ascending: true }));
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

// The baseline is FROZEN: the first BASELINE readings ever, and it never
// moves. A rolling window would compare you to your recent self, which puts
// you at 50 forever no matter how much you improve.
//
// An index exists when its baseline has a spread. spreadOf is 0 under two
// readings, and 0 for a baseline that never moved, and either way there is
// nothing to measure a reading against: the index would stand on a unit this
// file invented. So the honest answer is no index at all, and that is the
// only real floor there is.
//
// It is not a day count. MIN_DAYS and the two standard errors gate the tests,
// which ask whether one series moved another; this asks whether one series
// can be scored against its own past. Different questions, so a number
// derived for one of them was never derived for the other.
//
// Until the baseline is full the index still moves, because a reading landing
// inside it changes what 100 means. At BASELINE it freezes.
//
// The gate lives here, once, because it is the same question everywhere: the
// page draws it, the MCP reports it, and a goal line counts only the stocks
// that pass it. Three states and nothing else.
const BASELINE = 30;

// A stock can also outgrow its baseline, and then the baseline is intact and
// the index is still nonsense. One point is a tenth of the stock's own
// ordinary variation, so that unit has to still describe the stock. A channel
// that did four watch minutes a day across its first thirty readings and does
// three hundred now no longer varies by two minutes, it varies by a hundred
// and fifty, and an ordinary day reads thousands of points from 100. That
// number is arithmetic, not a reading.
//
// The test is the variation and never the level. A stock that simply got
// better sits far from its baseline mean and still varies by about what it
// used to: that is the case the index was built for, and it keeps its number,
// because there is no ceiling. A stock whose variation is OUTGROWN times what
// it was has lost the unit itself, and there is nothing honest left to draw.
// Reading the level instead would put a ceiling back on, and refuse the
// improvement the index exists to show.
//
// It is one sided. A stock that went quiet reads flat against an old wide
// unit, and that is true: you are where you were, and you no longer vary.
//
// A baseline is never rebuilt to fix this, because a baseline that moves to
// meet the reading measures nothing. A total that grows has no level to
// measure around: track a rate, which does, or start the stock clean under a
// new name.
// The unit is left behind in two directions, not one.
//
// A stock that grew leaves it above: four watch minutes a day becomes three
// hundred, it varies by a hundred and fifty and not by two, and an ordinary
// day reads thousands of points from 100.
//
// A stock that shrank leaves it below, and does it quietly. A channel whose
// first thirty days were four people watching a whole video varies by twenty
// points of percentage; the same channel with strangers clicking varies by
// three. The index is then drawn in a unit seven times too big: it barely
// moves whatever happens, and reads as settled when nothing is settled. That
// is not the safer failure. It is the same arithmetic, and it is harder to
// see, because a number that sits still looks like a number that is telling
// you something.
//
// So the test is the ratio either way, OUTGROWN times as much or OUTGROWN
// times as little, and in both the honest answer is no index and a reason.
const OUTGROWN = 8;

// How many times its baseline's variation the stock varies by now, over the
// readings past the frozen baseline. 0 where the question cannot be asked.
function outgrownBy(pts) {
  const p = pts || [];
  if (!(p.spread > 0) || !(p.spreadNow > 0)) return 0;
  return p.spreadNow / p.spread;
}

// How many times off the unit is, whichever way it went: 0 while it still fits.
function offScaleBy(pts) {
  const by = outgrownBy(pts);
  if (!by) return 0;
  if (by >= OUTGROWN) return by;
  if (by <= 1 / OUTGROWN) return 1 / by;
  return 0;
}

function indexState(pts) {
  const p = pts || [];
  if (!(p.spread > 0)) return 'none';
  if (offScaleBy(p)) return 'none';
  return p.length < BASELINE ? 'moving' : 'firm';
}

// Why there is no index, in the stock's own terms, for every door that says
// so. The gate lives in one place and so does its reason.
function noIndexWhy(pts) {
  const p = pts || [];
  if (!(p.spread > 0)) return 'this stock\'s baseline never moved, so there is nothing to score a reading against';
  const by = outgrownBy(p), off = offScaleBy(p);
  if (off && by >= OUTGROWN) return `this stock has outgrown its baseline: it varies about ${Math.round(off)} times as much now as across its first ${BASELINE} readings, so an index drawn in the old unit would be arithmetic and not a reading. A total that grows has no level to measure around: track a rate, or start the stock clean under a new name`;
  if (off) return `this stock no longer varies the way its baseline did: it varies about ${Math.round(off)} times as little now as across its first ${BASELINE} readings, so an index drawn in the old unit would barely move whatever happened, and would read as settled when nothing is. Its first thirty readings describe something this stock is not any more: take those readings out of the count, or start the stock clean under a new name`;
  return '';
}

function baselineOf(values) {
  return values.slice(0, BASELINE);
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

// Returns { metric: [{ day, value, rank }] }, each series carrying the spread
// of its own baseline, which is what decides whether it has an index at all.
// value is always the real reading. rank is the index.
//
// A voided reading is in none of this: no series, so no index, and so
// nothing in YOU, in a goal or in the scan. The baseline rebuilds from the
// readings that remain, so a metric can start clean without changing its
// name, and voided away to nothing it has no series at all.
function rankSeries(rows, rules, voids = {}) {
  const out = {}, live = liveRows(rows, voids);   // a voided day left out, a corrected day at its corrected value
  for (const metric of Object.keys(rules)) {
    const rule = rules[metric];
    if (rule.kind === 'ignore') continue;
    const mine = live.filter(r => r.metric === metric);
    if (!mine.length) continue;
    const values = mine.map(r => Number(r.mean));
    const scored = values.map(v => distanceOf(v, rule));
    const base = baselineOf(scored);
    const lower = rule.kind === 'down' || rule.kind === 'band';
    const pts = mine.map((r, i) => ({
      day: r.day,
      value: values[i],
      rank: indexOf(scored[i], base, lower)
    }));
    // The baseline's spread rides with the series, because only here is the
    // baseline still in hand: a band rule scores a reading by its distance
    // from the band, so nothing downstream could work it out from the points.
    // It belongs to the series and not to a point, so it does not repeat on
    // every one of them and never reaches the wire as data.
    pts.spread = spreadOf(base);
    // And what it varies by now: the readings past the frozen baseline, at
    // most thirty of them, so a stock that has outgrown its baseline can be
    // told from one that has simply got better. Under two such readings there
    // is nothing to ask, and spreadOf answers 0.
    pts.spreadNow = spreadOf(scored.slice(BASELINE).slice(-BASELINE));
    out[metric] = pts;
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
function etfSeries(series, members, staleBy = () => STALE_DAYS) {
  // A stock with no index of its own cannot lend one to a line. The gate is
  // the one indexState names, so a goal, YOU and the MCP all count the same
  // stocks, and a young stock joins the line on the day it earns an index.
  members = members.filter(m => indexState(series[m]) !== 'none');
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
    // each stock against its own door's limit, not one number for all of them
    const fresh = live.map(m => last[m] && t - last[m].t <= staleBy(m) ? last[m] : null).filter(Boolean);
    if (!live.length || fresh.length !== live.length) continue;   // silence, not a guess
    out.push({
      day,
      rank: Math.round(fresh.reduce((a, s) => a + s.rank, 0) / fresh.length * 10) / 10
    });
  }
  // A line is an index too and is gated the same way: with one day or none, or
  // a line that has never moved, there is no spread to read a day against.
  out.spread = spreadOf(out.map(p => p.rank));
  return out;
}

// How many days YOU could actually be worked out, and how many it skipped.
function coverage(series, members, staleBy = () => STALE_DAYS) {
  // both halves speak of the same stocks: the ones the line is actually drawn from
  const counted = members.filter(m => indexState(series[m]) !== 'none');
  const days = [...new Set(counted.flatMap(m => (series[m] || []).map(p => p.day)))];
  return { drawn: etfSeries(series, counted, staleBy).length, days: days.length };
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
  const data = await readAll(() => db
    .from('events')
    .select('metric, context, event_type, occurred_at')
    .in('event_type', ['commit', 'commit_end'])
    .order('occurred_at', { ascending: true })
    .order('id', { ascending: true }));

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

  // A series the gate gives no index has no ranks to test: its baseline never moved, or the stock has
  // outgrown it. Say why, and draw no number in a unit that is not there.
  if (points && points.length && indexState(points) === 'none') {
    return { during: during.length, before: before.length, clash, duringMean: null, beforeMean: null,
             verdict: 'no index', why: noIndexWhy(points) || 'this line has no spread, so there is nothing to score a day against' };
  }

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
      // an outcome the gate gives no index has no ranks to read a lever against: the cell says so and why
      cells: Object.fromEntries(g.measures.filter(o => series[o])
        .map(o => [o, indexState(series[o]) === 'none'
          ? { lag: l.lag, verdict: 'no index', why: noIndexWhy(series[o]), pairs: [], high: 0, low: 0, weeks: 0 }
          : crossTest(byMetric[l.metric] || [], series[o], l.lag, asked, todayStr)]))
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
  const data = await readAll(() => db
    .from('events')
    .select('metric, context, occurred_at')
    .eq('event_type', 'goal')
    .order('occurred_at', { ascending: true })
    .order('id', { ascending: true }));
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
function goalSeries(goal, series, staleBy = () => STALE_DAYS) {
  return etfSeries(series, goal.measures, staleBy);
}

// The measure with the lowest latest index. Where the goal is weakest now.
function weakPoint(goal, series) {
  let weak = null;
  for (const m of goal.measures) {
    const pts = series[m];
    if (!pts || !pts.length) continue;
    if (indexState(pts) === 'none') continue;   // no index yet, so it cannot be the weakest
    const p = pts[pts.length - 1];
    if (!weak || p.rank < weak.rank) weak = { metric: m, rank: p.rank, day: p.day };
  }
  return weak;
}
