# Changes

Template updates, newest first. Each one is a whole file: open it on
GitHub, copy all of it, paste over yours.

- **16 Sep 2026, a wrong estimate is read again.** `correct` refuses an
  `_est` reading, because a typed number is not the instrument that read
  the picture, and that left a wrong estimate with only a void, which
  blanks the day. Now `estimate` can put a new reading in place of its own
  earlier one for that day. Read the picture again and call `estimate` as
  usual: a day that already held an estimate reading another value, or a
  voided or stale one, writes nothing and comes back under `read_again`,
  with the value the day reads, the model that read it when a picture made
  that value, and the phrase that carries the new value, `re-estimate
  weight_est 81.2 on 2026-09-16`. Sent back exactly, it writes one
  correction row signed `photo`, naming the model that read it again and
  what it read. Latest wins, as with every correction, so the day keeps
  its place in every series, index, goal and scan, and the earlier reading
  stays in the ledger with the model that produced it. A typed number
  still never corrects an estimate. `readingsOf` in mcp/server.mjs is the
  part of writing that keys a reading and finds its day without writing
  it, so reading again keys the day exactly as `estimate` wrote it.
- **16 Sep 2026, a correction puts the right number on a day.** A void
  stops a mistyped reading counting, and on its own it left the day blank:
  the right number could not be written, because the same reading twice
  lands once, and a reading on a voided day is voided too. The MCP's new
  `correct` tool writes one more row, `event_type` correction, context `{
  metric, day, value, was, readings }`. Nothing is edited and nothing is
  removed: the latest correction per stock and day wins, as rules do, and
  the old reading stays in the ledger, struck through on the ledger tab
  beside the value the day reads now. From then on the day reads the new
  value in every series, index, goal and scan. Corrections are read with
  the voids in the order they were written, so a correction after a void
  counts the day again, and a void naming the day after a correction stops
  it; a dayless void does not reach a corrected day, as it never reached a
  day a void row names. A correction holds while its day holds the
  readings it saw: if another reading lands on that day later, the day
  reads nothing until it is corrected again, and `correct` says so,
  because which number to count would be a guess. The friction is void's:
  `correct` answers first with the reading it would replace and the
  phrase, `correct weight 156.1 on 2026-09-16`, and writes only when that
  exact phrase comes back, the new value being the number that has to be
  typed. `void` now types back the value a corrected day reads. An `_est`
  reading is not corrected by a typed number. Known limit: a void and a
  correction name a stock and a day, never a source, so on a day two doors
  both wrote one stock, neither can reach one door's reading without the
  other's. Readings import.html wrote a day early before this stay where
  they landed.
- **16 Sep 2026, import.html writes a date on its own day.** import.html
  wrote a date cell like 2026-09-14 as midnight UTC, and the ledger's day,
  which ends at 6am in your timezone, put that on the day before wherever
  your timezone is less than six hours ahead of UTC: Europe, Africa, the
  Americas, India and the Gulf. A date written any other way, 9/14/2026
  among them, was read as midnight in the browser's timezone and landed a
  day early there too. None of it said anything. It now reads a time the
  way the MCP and a drop on you.html read it, with readWhen: a date lands
  at a moment day_of puts on that date, and a timestamp must be written
  the ISO way and say its zone, 2026-09-14T08:00:00Z or with an offset
  such as +02:00. Any other cell is not written, and the message counts
  those rows by reason, so every door reads a time one way. If a date
  cannot be placed, nothing is written. Dates imported before this stay
  where they landed; look at a day before you void it, because a
  2026-09-14 row is already on the 14th if your timezone is six or more
  hours ahead of UTC, and a void names a stock and a day, not a source, so
  voiding one also stops any other reading of that stock on that day.
- **16 Sep 2026, /api/at, and one key for a reading.** An iOS Shortcut can
  write one reading: POST to `/api/at` with `WIRE_TOKEN` in the
  Authorization header, checked by the same function `/api/mcp` uses, and
  a JSON body of exactly `metric`, `value` and `unit`. The token is read
  from the header only; one put in the address is refused, because an
  address ends up in logs. A value that is not a JSON number is refused.
  The row goes through the body `record` uses, signed `shortcut`, at the
  moment it arrives, keyed by the stock and the ledger day, so a second
  tap the same day lands nothing, two taps at once land one row and both
  answer with it, and it never takes an estimate's `_est` name. A
  reading's key is now one rule in you-reader.js, `readingKey`: the stock
  and a time joined by a colon, a date as written and a timestamp as the
  moment it names. import.html and a drop on you.html both key and land
  their rows through it and `landRows`, so a file brought a second time to
  the same stocks lands zero rows, whichever of the two it comes through
  and whatever the file is called. import.html fills its prefix in from
  the file's name, so a renamed file there lands under new stocks unless
  the prefix is typed back. import.html used to key by the file's name and
  row, and its check of what was in read at most a thousand rows. Rows
  import.html wrote before this keep their old keys, so a file imported
  before lands once more, on the right days, beside the rows it wrote a
  day early. MCP.md gains law 4, before anything: asked to track something
  new, read the ledger and say whether a stock already carries it. It
  ships in the session instructions with the writing laws, which are now
  12 to 15.
- **16 Sep 2026, a CSV dropped on you.html imports itself.** Drop a file
  anywhere on the page and it is read, shown, and written only after a go.
  Nothing names a metric for you: every number column is written nowhere
  until you pick a stock for it, from the stocks of the goal the file was
  dropped on, or from every stock anywhere else. Every row it would write
  is printed first. A cell on a day that stock already has a reading is
  amber; a date, a number, a line with more cells than the header, or a
  clash it cannot read is shown red and not written, and the same stock at
  the same moment twice with two values writes neither. A date lands on
  its own ledger day and a timestamp must say its zone, the rule the MCP's
  record already used, now in you-reader.js as `readWhen` and `momentOn`
  so both doors read time one way. A timestamp on a date the calendar does
  not have, 30 February, is refused there too, where Date.parse used to
  roll it quietly into March. Rows are source `csv`, source_id the stock
  and its date or moment, so the same file dropped twice under any name
  lands once, and the page says how many landed and how many were already
  there. Those ids are not the ones import.html writes, which name the
  file and the row, so a file already imported there lands again here, and
  not on the same days: import.html still writes a date as midnight UTC,
  which the ledger's day puts on the day before. The parser moves out of
  import.html into `csv-reader.js`, which both pages load; import.html
  behaves as it did.
- **16 Sep 2026, you.html only reads, and goal takes levers.** The bottom
  of the page held a reading line, a commit line and a goal line with its
  two chip rows; under the chart a picked stock had rule chips, and a
  picked commit an end button. Writing now happens through the MCP, which
  prints every row and waits for a yes, so all of them are gone. A picked
  stock's rule still shows under the chart, as plain text, because it is
  state: up, down, band lo–hi or ignore. The one thing only the page could
  write was a goal's levers, so the goal tool takes them directly, each a
  stock and a lag, printed in the goal before the yes. A lever named
  twice, at a lag the scan does not read, or also one of the goal's own
  measures is refused, because readGoals would otherwise drop it without a
  word. Declaring a goal again replaces its levers with the ones named,
  and any it had that are no longer named come back in the answer.
  pad.html and commit.html are unchanged and still open at their own
  addresses.
- **16 Sep 2026, estimate: a number Claude read is not one you measured.**
  record wrote source claude under whatever metric name it was handed, so
  a number read out of a photo landed looking exactly like a number you
  measured. There is a second door now. estimate writes source `photo`,
  never claude, takes only metric names ending `_est`, and keeps the model
  that read it in context. Everything else behaves like a measurement: an
  `_est` stock takes a rule, an index and a place in a goal like any
  other. The point is only that if the instrument turns out to be noise it
  can be filtered out by source or by name without touching anything else,
  because an AI reading drifts between models, does not reproduce, and the
  table has no delete.
- **16 Sep 2026, the index gate is a spread, not a day count.** Fourteen
  was a correlation number, derived for comparing two series: the first n
  where a relationship can clear 2/sqrt(n), and the first n holding two of
  every weekday. It was never derived for scoring one stock against its
  own past, and it had been gating the index anyway. An index exists when
  its baseline has a spread, and that is the only real floor: under two
  readings, or on a baseline that never moved, there is nothing to measure
  a reading against. The three states, the channels and the silence are
  unchanged. MIN_DAYS, SCAN_BAR and the two standard errors are untouched,
  so fourteen stays exactly where it was derived, on the correlation and
  commit tests.
- **16 Sep 2026, the doors, and whether they are still feeding.** Nine
  doors write into the ledger, and every row already carried the source
  that wrote it. What was missing was the promise: youtube is six days
  behind by design, instagram three, whoop and github one, and the pad,
  an import and Claude are never late because you open them yourself.
  Without that, "last wrote on the 10th" says nothing, because for
  youtube it is on time and for whoop it is a dead cable. `FED` and one
  function in you-reader.js hold it, the ledger tab draws a line per door
  with its state in the colour of the bar and no word for it, and health
  gains a fourth section beside code, table and keys: those three say
  whether this copy is built correctly, this one says whether anything is
  still coming in.
- **16 Sep 2026, AGENTS.md points at CLAUDE.md.** It was a second copy of
  the laws and it had drifted: no void, no index gate, and a shorter list
  of where a secret may live. Two files disagreed about the same law, and
  whichever one an agent opened decided what it believed. CLAUDE.md is
  the source; AGENTS.md now says so and says nothing else.
- **16 Sep 2026, the MCP's laws ship.** `mcp/MCP.md` was a file in a repo
  that no other copy's Claude ever read, because the server set no
  instructions at all. `wireServer` now sends the writing laws at the
  start of every session: the table is append only, print every row
  before writing it and wait for a yes, transcribe only and never
  estimate, round, fill or infer, silence over a guess, and voiding costs
  the phrase typed back. Short on purpose, because it is sent every time.
- **16 Sep 2026, the ledger tab follows the gate.** The raw reading is the
  record and always shows. Everything drawn from the index follows the
  gate instead: the word, the tone and the small line. A stock under the
  gate shows its readings and no index, and one whose baseline is still
  filling is drawn faded there too, the same fade the chart uses.
- **16 Sep 2026, the index gate, in one file.** The gate was a literal 14
  in the MCP, twice and nowhere else, so the page indexed a stock from its
  first reading while the MCP refused under fourteen. `indexState` in
  you-reader.js is now the whole of it, and the page and the MCP read the
  same one. Under fourteen readings there is no index and nothing is
  drawn; fourteen to twenty-nine is drawn faded, because the baseline is
  still filling and the number will move; at thirty it freezes and is
  drawn solid. A goal line counts only the stocks that pass it. The page
  shows which of the three it is and never writes it in words.
- **16 Sep 2026, void reaches commits.** A test commit written while
  building the commit page can stop counting, the way a reading already
  could. One more void row names the commit instead of a day, and a
  voided commit is in no test, in no scan, not in WHAT MOVES IT, and it
  collides with nothing. It stays in the ledger struck through and its
  name stays taken. Voiding one costs typing its name and start back, as
  voiding a reading costs typing its number.
- **16 Sep 2026, pull/whoop.mjs.** Your Whoop readings land by themselves
  every morning: recovery, HRV, resting heart rate, sleep performance,
  sleep debt and strain, each written at the moment Whoop recorded it. It
  runs on your own Mac and not on GitHub, because a Whoop refresh token is
  single use and the live one lives in a file here. It shares the Whoop MCP
  server's login and the lock beside it, so the two never spend each
  other's token. Nothing is carried forward, and a number Whoop has not
  scored is not written at all.
- **13 Sep 2026, six files, one skin.** you, pad, import, commit, test
  and scan share the thin skin: light type, hairlines, one accent. On a
  phone you.html sends you to the pad and the pad is the whole app.
  import keeps the paged "already in" check, so a file over 1000 rows
  dropped twice still lands once.
- **13 Sep 2026, you.html.** Layout only, same maths and same functions.
  Pages move to a top bar with words. One big number and its word. The
  day read moves under the chart as cards. Commits are pills you can
  read. The now column is capped so the chart is always on screen.
- **13 Sep 2026, import.html.** The face skin. Same import underneath.
  Checking what a file already added now reads every earlier row, not
  just the first thousand, so the same file twice still lands once. If
  that check fails, nothing is written.
