# Changes

Template updates, newest first. Each one is a whole file: open it on
GitHub, copy all of it, paste over yours.

- **17 Sep 2026, the pictures under the lean chart.** `you.html` now shows the
  photos `/api/photo` keeps, below the chart of the goal each photo names, which
  today is only lean. Newest day first, one a day: a second photo on a day stands
  in for the first on the page, latest wins as a correction does, and the first
  stays in the bucket and on the record. The day is under each and nothing else.
  The bucket is private, so the page signs every address it needs in one call,
  good for an hour, and asks again before the hour is out. A file that cannot be
  signed keeps its frame and its day, empty, rather than closing the gap. The
  rows are read through `readAll` like every other read that grows. None of it
  is in `you-reader.js`, so the public read-only page, which loads that file and
  not this one, cannot show a photo.

- **17 Sep 2026, YouTube today, from a total that only climbs.** The Analytics
  API is 48 to 72 hours behind and has no way to be faster, which is why the
  channel's numbers arrive on Thursday for Monday. The Data API is current, but
  what it gives is a running total, the views a channel has ever had, and a
  total that only climbs has no level to vary around and can never hold an
  index: the gate would refuse it, correctly. The difference between two
  readings of it can. So the puller now reads `channels.list` on every run,
  keeps the total on the record as `yt_views_total`, and writes the climb since
  the last reading as `yt_views_live`, which is a rate, has a level, and is
  today's rather than Thursday's. The climb is written only when the two
  readings are about a day apart, between twenty and twenty-eight hours: miss a
  run and the gap is two days of views wearing one day's name, so it writes
  nothing and says why. A total that fell, which happens when YouTube removes
  views, writes nothing either. It is not the Analytics `views` and never shares
  its name, because the Data API counts a view where Analytics counts an
  engaged view and the two are different sizes for the same day. Subscribers
  cannot be done this way at all: `subscriberCount` is rounded down to three
  significant figures, so the difference between two readings is zero most days
  and a jump of ten on the rest, which is not a reading.
- **17 Sep 2026, a door for a picture.** `/api/photo` takes one photo from the
  phone's share sheet, checked by the same `WIRE_TOKEN` in the same header as
  `/api/at` and `/api/mcp`, and keeps it in a private bucket beside a row that
  names where it went. A photo is not a reading: it carries no value, it is in
  no series, no index, no goal and no scan, and `day_metrics` never sees it,
  because that view takes only rows whose event_type is `measurement`. What the
  picture is worth as data still comes the way it always did, Claude reading it
  and writing what it read through `estimate` under a name ending `_est`. This
  keeps the picture itself, because for a body a series of photographs taken the
  same way is the better instrument, and a model reading one to a single decimal
  is not. The file lands under the ledger day and the moment, so a second photo
  on one day never lands on the first: nothing here replaces anything, as
  nothing in the table does. It signs in as the owner through the same
  publishable key and password every other door uses, so there is no
  service_role key anywhere and no new secret to keep. The bucket needs its own
  SQL once, and it carries the same two policies the table does: read your own,
  write your own, no update and no delete.
- **17 Sep 2026, connecting a source is a routine, and it ships.** Adding
  YouTube took a whole evening and cost two wrong turns that every copy of the
  Wire would have taken in the same order: a year of totals backfilled into a
  stock that could never hold an index again, and three stocks declared with a
  rule when only one of them had a door to feed it, which would have blanked
  YOU a week later. Neither was a bug. Both were the absence of a routine.
  MCP.md gains one: find the door's floor before anything and say it out loud,
  ask of every column whether it has a level or grows and track the rate the
  total hides, declare no rule for a stock no door feeds, schedule at the floor
  and say what now runs without you, and finish on `health` because a door not
  named in feed is not connected. The two that cost a page rather than an hour,
  the rate and the door, ship in the server's own instructions, so a copy of
  the Wire carries them whether or not anyone opens the file.
- **17 Sep 2026, a door's promise is one number, and YouTube's is three days.**
  The promise lived twice, as `FED` in you-reader.js and as `SETTLE` in
  pull/social.mjs, and two copies of one number drift the first time either
  moves: the puller would write on one schedule while the ledger held it to
  another, and a door keeping its word would read as a dead cable. The puller
  now reads `FED` out of you-reader.js, the same file the page and the MCP read
  it from. And YouTube's promise drops from six days to three, which is what
  Google's own documentation says the processing delay is: the Analytics API
  returns a day only once every metric of it is processed, so an unready day
  comes back missing rather than half counted, and the puller already skips
  what is missing. Channel readings now land three days sooner and their stale
  limit tightens from thirteen days to ten by itself, because the limit is
  built from the promise. There is no real time to be had beyond this: the
  Analytics API has no real time endpoint, and the numbers that are live are
  lifetime totals, which have no level and so no index.
- **16 Sep 2026, the unit is left behind in two directions.** This morning's
  gate refused a stock that varied far more than its baseline did and let one
  that varied far less go through, on the argument that a stock which went
  quiet still reads honestly. It does not. A channel whose first thirty days
  were a few people watching a whole video varies by twenty points of
  percentage; the same channel with thousands clicking varies by three, and an
  index drawn in the old unit then moves a seventh as much as it should. It
  sits still and reads as settled when nothing is settled, which is the same
  arithmetic as an index that explodes and is harder to notice. The gate now
  asks the ratio either way, eight times as much or eight times as little, and
  says which it is and by how much. The threshold is unchanged, and is not
  moved to catch a stock already looked at: a test chosen after its answer is
  known is not a test. CLAUDE.md law 9 says both halves and that too.
- **16 Sep 2026, a reading is stale when its own door cannot explain it.**
  Every stock went stale after seven days, whichever door fed it, and that is
  the wrong shape: whoop promises a reading a day, so six days old means the
  cable is dead, while youtube does not settle a day's numbers for six days,
  so six days old is youtube working normally. Held to one number, the honest
  door looked broken and the slow door looked fine, and `yt_watch_minutes` sat
  permanently one day inside the limit: a single missed morning and the stock
  went stale, and a stale stock means YOU has no value that day at all. The
  limit is now the door's own promise plus `STALE_DAYS` of slack, the same
  slack for every door, counted from when its data should have arrived: whoop
  eight days, instagram ten, youtube thirteen, and a stock with no door, a
  number you type or a picture you send, the seven it always had. A stock two
  doors write takes the slower promise, because either one arriving is the
  stock being fed. Nothing is made stricter and nothing doorless changes. The
  slack is never widened to quiet a door that has actually stopped: a whoop
  reading nine days old still silences YOU, as it should. CLAUDE.md law 3 says
  so, because this was always that law, only badly aimed.
- **16 Sep 2026, YouTube feeds a rate, and a day belongs to one door.** The
  YouTube puller asked for views, watch minutes and subscribers gained, all
  three totals that grow, so a year of them backfilled has no index and the
  channel had nothing the index could score. It now also asks for
  `averageViewPercentage` and writes it as `yt_pct_viewed`: a rate, with a
  level to vary around, so it keeps an index where a total does not. The
  Studio export carries the same number, so it is the first stock two doors
  can reach, and the write loop now leaves alone any day the ledger already
  holds for that stock from another door, and says how many it left: two
  doors on one day are averaged into a number neither of them read. Thumbnail
  click-through rate, unique viewers and stayed-to-watch are not in the
  Analytics API at all and never have been, so a stock made from those can
  only ever come from an export by hand, and a stock with no door goes stale
  and takes YOU with it.
- **16 Sep 2026, the ledger is read all of it, a page at a time.** Every read
  asked for twenty thousand rows, and Postgres handed back the thousand its
  settings allow, with no error and nothing to say it stopped. Under a thousand
  day rows nothing showed. Over a thousand, the day rows were read oldest
  first, so the rows quietly dropped were the newest ones: a year of history
  imported in one go, and today's weight, today's estimates and today's
  readings vanished from the page and from `stocks`, YOU fell back a day, and
  every stock lost a reading. Nothing was lost from the ledger and nothing was
  ever wrong in it; the ledger was being read in part and drawn as if in whole.
  Every read that grows with the ledger now goes through `readAll`, which asks
  for one page at a time until a page comes back short, and orders by something
  no two rows share, an event by its id and a day row by its day and its
  metric, so no row is handed over twice or skipped. An error on any page stops
  the read and is said, rather than returning a short answer that looks whole.
  The limit is not raised anywhere: a bigger number is the same bug further
  off. CLAUDE.md law 10 says so.
- **16 Sep 2026, a dropped CSV can name a stock that does not exist yet.** The
  drop on you.html offered a list of the stocks you already had and nothing
  else, so a file full of readings the ledger had never seen could be dropped,
  read, and then written nowhere: every column's only honest answer was the
  dot. The column's control is now a name you type, with the stocks you have
  offered under it. A name that is not one of them is a new stock, born by this
  file's first row the way any stock is born, and it reads teal so making one is
  never a slip of the eye. Nothing is written until go, and the table above it
  already shows every row under the name it would land under. A name ending
  `_est` is refused, as `record` refuses it: only a picture Claude read writes
  under an estimate's name. Two columns given one name still stop the write, as
  before. The name rule itself moves into csv-reader.js and both CSV doors read
  it there, so a name typed on the page and a name made from a column are one
  rule and not two.
- **16 Sep 2026, every reader of an index asks the gate.** A stock that
  has outgrown its baseline, or whose baseline never moved, had no index
  on the page, in the goals and in `stocks`, but four readers still read
  its ranks without asking. The commit test now answers `no index` with
  its reason and no effect, so `did_it_work`, the page's commit rows,
  test.html and the scan can no longer call growth a finding; scan.html
  names the stocks it left out. A lever's cell against such an outcome
  says `no index` instead of reading a lead off arithmetic. `history`
  returns the stock's readings without an index and says why. `health`
  gains an `index` check that goes red naming every stock that has
  outgrown its baseline, and by how much, so it is seen the week it
  happens; a young stock with no spread yet does not turn it red. The
  trigger is unchanged.
- **16 Sep 2026, a stock that has outgrown its baseline says so.** The index
  scores a reading in tenths of that stock's own ordinary variation, and a
  total that grows leaves that unit behind: a channel that did four watch
  minutes a day across its first thirty readings and does three hundred now
  varies by a hundred and fifty, not by two, so an ordinary day reads
  thousands of points from 100 and never moves again. Backfilling a year of
  totals is what produces it, and the number it produces looks like a
  reading. The gate now asks a second question beside the spread: does the
  unit still describe the stock. A stock that varies eight times as much now
  as across its first thirty readings has no index, in the page, the MCP and
  every goal alike, and says which stock, how many times, and what to do:
  track a rate, which has a level to vary around, or start the stock clean
  under a new name. The test reads the variation and never the level, so a
  stock that simply got better keeps its number and its index stays open at
  the top, which is the whole point of an index over a percentile. It is one
  sided: a stock that went quiet reads flat against its old unit, and that is
  true. The baseline itself is untouched and never rebuilt, because a
  baseline that moves to meet the reading measures nothing.
- **16 Sep 2026, a CSV is read row by row.** Every YouTube Studio export
  begins with a Total row, and a file is never refused because one line of
  it cannot be read. Both CSV doors read every row they can, skip the ones
  they cannot, and say how many were skipped and why, one reason at a
  time: a date cell that is not a date (Total), a time still to come, a
  line with more cells than the header, a cell that is not a number, a
  stock given two values at one time. A date that day_of cannot place
  skips only its own readings, where it used to stop the whole file, and a
  row the table refuses for what it holds is skipped and counted while the
  rest land; only a failure that is not about one row, the connection or
  the sign in, still stops a write. A number column is any column holding
  a number at all, so a column a real export leaves blank on most days,
  such as estimated revenue, is offered in the drop; import.html shows it
  unticked. A zip dropped whole is named as a zip. Tested against real
  Studio exports rather than invented files: the Date export lands every
  dated row and names its Total row; a breakdown's Chart data, with a row
  per video or source each day, gives every day two values, so it writes
  nothing and says so; a per-video Table data has no daily date to read.
- **16 Sep 2026, correct reaches a voided day, and costs a yes.** A stock
  whose only reading was voided dropped out of `stocks` and `history`, so
  the right number fell through to `record`, which skipped it on the key
  without saying why: the case `correct` was built for could not be
  reached. `correct` works off the day rows, and a voided row is still a
  row. `stocks` now lists such a stock under `uncounted`, beside any its
  rule ignores, and `history` answers with the same instead of saying the
  stock does not exist. `record` says when it skips a day that already
  holds a reading and points at `correct`. `correct` given a stock with no
  reading that day answers with every reading the day holds, so the right
  name can be found. Its friction drops to a yes: the first call writes
  nothing and answers with the row and the new value, and the call with
  `yes` true writes. A void takes a reading out of every count, so typing
  its number back proves the right one is in view; a correction supplies a
  new number, and a wrong one is corrected again, latest wins. Reading an
  estimate again is a correction too, so it is a yes as well, and can take
  several days in one call. `void`, counting a reading again, and
  `void_commit` keep their typed phrases, and a typed number still never
  corrects an `_est` reading: `record` now refuses a name ending `_est`
  too, as `/api/at` already did, so no typed number lands under an
  estimate's name. CLAUDE.md's law 7 says why: a typed phrase belongs on
  taking a reading out of the count or putting it back, never on supplying
  a number.
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
