// Reads day_metrics. Turns raw numbers into ranks. Nothing else.

async function readDays(db, metrics) {
  const { data, error } = await db
    .from('day_metrics')
    .select('day, metric, mean')
    .in('metric', metrics)
    .order('day', { ascending: true });
  if (error) throw error;
  return data;
}

// The baseline is FROZEN: the first 30 readings ever, and it never moves.
// A rolling window would compare you to your recent self, which puts
// you at 50 forever no matter how much you improve.
function baselineOf(values) {
  return values.slice(0, 30);
}

// 0 to 100. 100 is always better, whichever way the raw number goes.
function rankOf(value, baseline, direction) {
  if (baseline.length === 0) return 50;
  const below = baseline.filter(b => b < value).length;
  const r = Math.round((below / baseline.length) * 100);
  return direction === 'down' ? 100 - r : r;
}

// Returns { metric: [{ day, value, rank }] }
function rankSeries(rows, stocks) {
  const out = {};
  for (const metric of Object.keys(stocks)) {
    const mine = rows.filter(r => r.metric === metric);
    const values = mine.map(r => Number(r.mean));
    const base = baselineOf(values);
    const dir = stocks[metric].direction;
    out[metric] = mine.map((r, i) => ({
      day: r.day,
      value: values[i],
      rank: rankOf(values[i], base, dir)
    }));
  }
  return out;
}

// An ETF is not a row. It is the average of its members' ranks, per day.
function etfSeries(series, members) {
  const byDay = {};
  for (const m of members) {
    for (const p of (series[m] || [])) {
      (byDay[p.day] = byDay[p.day] || []).push(p.rank);
    }
  }
  return Object.keys(byDay).sort().map(day => ({
    day,
    rank: Math.round(byDay[day].reduce((a, b) => a + b, 0) / byDay[day].length)
  }));
}
