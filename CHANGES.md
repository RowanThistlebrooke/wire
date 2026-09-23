# Changes

Template updates, newest first. Each one is a whole file: open it on
GitHub, copy all of it, paste over yours.

- **23 Sep 2026, one token, and it lives in Vercel.** `token.html` kept
  its token for one tab, and the walkthrough says to open it in a new
  one, so a buyer who came back to it at step three got a new token that
  Vercel had never seen, and a 401. It now keeps the token in the
  browser, so it shows the same one in any tab until the buyer asks for
  another, and asking warns that a new one will not connect until it is
  in Vercel too. Step three says the token is the WIRE_TOKEN in Vercel,
  with the reveal icon, and not a new one from the token page. Vercel
  marks WIRE_TOKEN and WIRE_PASSWORD Needs Attention because they are
  not Sensitive. The walkthrough relies on reading them back, and a
  Sensitive value can never be shown again, so the help for steps one
  and three says to leave them.

- **23 Sep 2026, the connector address is not a link.** The address a
  buyer's AI talks to, `<site>/api/mcp`, showed as a link in the chat,
  and opened in a browser it is a blank page, which reads as broken. It
  is now written as code everywhere the walkthrough gives it, the whole
  Claude Code command and the Codex lines too, and the connector is
  told to leave anything in backticks as code. The help for steps three
  and four says it is not a web page, and the closing message says so
  beside it.

- **23 Sep 2026, when the name wire is taken.** A buyer who already has
  an MCP server called wire cannot add a second one under that name;
  Claude Code says "MCP server wire already exists in local config". The
  help for step three now says so, and to pick another name, like
  mywire, and use it everywhere after.

- **23 Sep 2026, the token is still there at step three.** Step three
  asks for the WIRE_TOKEN made in step one, by which time the buyer had
  typed it into Vercel and closed the page that made it. Step three now
  says where it is: the token tab if it is still open, or Vercel, the
  project, Settings, Environment Variables, WIRE_TOKEN, the reveal icon.
  `token.html` keeps its token for the tab, so a reload shows the same
  one instead of a new one, says to keep the tab open until step three,
  and asks before making another. It is still made and kept in the
  browser only, and never goes near the chat.

- **23 Sep 2026, the doing, and the explaining on demand.** Every step
  of the `/you` walkthrough is cut to what to do. Step one is two lines
  and a closing one: open the Deploy link and sign in with GitHub; add
  the Supabase database, fill the three boxes with the token from the
  token page, press Deploy; say done with the site address and the
  timezone. What each line means, and what to do when it does not go as
  written, sits in the step's own help: the buyer's AI passes their
  question as `help` and gets it for the step they are on, and a
  question about paying or Free being unavailable gets the Supabase
  fix. The region, the prefix and Free, what the three boxes are and
  where the token comes from are also written on the Deploy page itself,
  beside the boxes.

- **22 Sep 2026, no step before its answers.** The connector step asked
  which AI the buyer uses, but nothing held the next step back until it
  was answered, and the question was not tied to its step, so an AI
  counted the answer as a done and went from the question to step four:
  the buyer's own Wire was never added, and their first reading would
  have landed in whichever Wire they already had connected. Now every
  step after the connector needs the site address, the confirmed
  timezone and the AI before it is given out, and any question the tool
  asks on its own is shown under the step it belongs to, so the count
  cannot drift past that step. `done` is the N of the "Step N of 7" the
  buyer said done to, and answering a question is not done. Step four
  names the buyer's own connector by its address, so a buyer with more
  than one Wire turns on the right one.

- **22 Sep 2026, an example that cannot be real.** The example site
  address in step one, `my-wire.vercel.app`, became a real site the
  moment someone deployed with the default name, so an AI reading a
  pasted address that matched it stopped to ask whether the buyer had
  copied the example. It is `my-wire-xxxx.vercel.app` now, which no
  deploy produces.

- **22 Sep 2026, when Supabase asks for money.** The steps no longer
  warn about the free limit up front. When a buyer says Supabase wants
  them to pay, or that Free is unavailable, their AI calls setup with
  `stuck` and gets the fix in one message: the free account already
  holds two active projects, so pause one that is not in use (Settings,
  General, Pause project; a paused one does not count) and pick Free;
  or, if all are in use, put the Wire in a project they already have
  through `/deploy-existing`, the same Deploy link without the Supabase
  store, which asks for `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` as
  well. Never Pro. A shared project can already hold the Wire's names,
  so `sql/01_the_table.sql` now checks first and stops, saying which of
  `events`, `day_of` or `day_metrics` is taken, before it makes or
  replaces anything; a `create or replace` would otherwise have
  overwritten another project's function or view in silence. Step two
  opens the project either way, from Vercel or at supabase.com. The
  timezone goes into that SQL and decides which day every reading
  belongs to, and an AI that knows its user filled it in from memory
  instead of asking; the tool now shows the timezone back with what it
  means, and the SQL waits for the buyer's yes. The GitHub sign-up line
  comes before the Deploy link.

- **22 Sep 2026, one message per step.** A line per turn was too many
  turns: the first reply had no link in it, and a buyer said done to
  reach one. The `/you` walkthrough is back to one message per step,
  every line of the step in it, the link first, and "say done when"
  last. The opening line, seven steps, one message each, is folded into
  step one, so the first reply already carries the Deploy link. What a
  later step needs is asked for in the closing line of the step before:
  the site address and timezone with step one's done, the buyer's AI
  with step two's, and each is asked for on its own if it is still
  missing when a step needs it. `done` counts steps again.

- **22 Sep 2026, a fresh deploy says what it is missing.** Before the
  table has been run, `you.html` said "Connection failed" and "The
  ledger revision could not be read". A HEAD count on a table that is
  not there answers 404 with no body, and postgrest-js reports that as
  status 204 with no error and no count, so the reader could not tell
  it from a broken connection. `readLedgerRevision` in `you-reader.js`
  now recognises that shape, and the error a select gives for a missing
  table, and says: the events table is not there yet, run the table,
  step two of the setup. The page shows "No table yet". The chart drew
  before anything had loaded, with day zero as its first day, so its
  axis read 1970-01-01 and 1969-12-31; it now draws nothing until the
  ledger has loaded, and an empty ledger shows no dates. The Deploy link
  is long enough to read as spam in a chat, so it lives once, as the
  `/deploy` redirect in `vercel.json`, and the walkthrough and
  `start.html` hand out the short address. Step one starts with where
  to make a GitHub account for a buyer who has none.

- **22 Sep 2026, one line at a time.** The `/you` walkthrough is seven
  steps, and every turn is one line: the buyer reads it, does it, says
  done, gets the next. `done` counts lines and has no ceiling in the
  tool's schema, so an AI holding an old copy of the tool can no longer
  cap the walk. The old first three steps, fork, deploy and env vars,
  are one Vercel Deploy link: it copies the repo into the buyer's own
  GitHub (a copy, not a fork, so the owner can walk it too), adds the
  Supabase store from the Marketplace, asks for WIRE_EMAIL,
  WIRE_PASSWORD and WIRE_TOKEN in a form, and deploys. The lines name
  what the Vercel screens actually show: Add Products, Accept and
  Create, the region, the prefix, and Free, with what to do when Free
  is unavailable and never Pro. A buyer with no terminal gets their
  token from the new `token.html`, made in the browser, never pasted
  into the chat. The iPhone Shortcut setup is gone from the phone step;
  the Claude app on the phone already has the connector. The connector
  asks which AI the buyer is using and hands over only that AI's
  connector line. The connector's instructions now say to show the line
  and nothing else, no commentary. `start.html` carries the same Deploy
  link and the seven steps.

- **22 Sep 2026, /you.** The setup walkthrough is nine steps and one
  prompt. The connector now publishes a prompt called `you`: an AI that
  turns a connector's prompts into commands shows it as `/you`, and any
  other is handed the same words. Step five names every place a connector
  can be added, claude.ai, Claude Code, Codex and any AI that speaks MCP,
  with the token typed into a settings page or a terminal and never into
  the chat. Two steps follow the history import: the phone, where the
  Claude app already has the connector and a Shortcut lands one reading a
  tap, and the first goal, with what measures it, what moves it, and which
  way is better. The closing message says what to expect: an index once a
  stock's readings have a spread, frozen at thirty, and a commit's answer
  after ten days each side. `start.html` is the page a buyer lands on
  from Whop: the three connect lines, the one thing to say, the nine
  steps. It fills in the site's own address and reads nothing.
- **22 Sep 2026, the setup walkthrough reaches its last word.** When the
  seventh step was added, the `done` count the setup tool accepts stayed
  at six, so a buyer who finished bringing their history in was refused
  instead of shown the closing message with their connector address. The
  limit is now the number of steps, wherever that goes next.
- **21 Sep 2026, a line and an arrow on every sidebar row.** Each row now
  reads name, its recent line, an arrow and the number. The line is strong
  beside the name and fades out before the number, always there, and drawn
  in once from the left when the pointer is on the row. The arrow is the
  one the Outcomes legend already uses: up and green above your baseline,
  down and red below it, a quiet dash at it or with no index. How much of
  today is in stays on hover. The sidebar is 20px wider so a platform's
  mark, name, line and number fit on one row.
- **21 Sep 2026, the sidebar is two levels.** Areas and accounts were full
  rows beside the goals under them, every row carried two lines, and three
  more rows trailed at the bottom, so the list read as noise. An area or
  an account that holds something is now a small grey heading, still a
  button, and the goals under it carry one number each. How much of today
  is in, and a source that has stopped, are a small dot beside the number
  with the words on hover. Unplaced stocks, empty areas and Yourself are
  one quiet line at the foot, the first two opening a short list above it.
  Everything starts on one left edge. A goal placed in Social media under
  no account keeps the area's own heading, where it used to be left off
  the rail.
- **21 Sep 2026, the ledger shows what is tested against what.** A new
  Cross-reference tab draws every goal that names a lever as a map: levers
  on the left with the days later each is read, outcomes on the right, a
  wire for every pair, and the verdict in the wire. A lead is coloured and
  moves, before is amber, no lead is plain, early is dashed, fixed is
  dotted, and a pair with nothing to read is faint. Under each map every
  pair has its row: high days, low days, weeks, the plain average after
  each, the effect, the raised bar and the verdict, and only a lead is
  coloured. Five short steps say how a pair is read, with the real count
  of questions asked, because that count raises the bar. Below, every
  commit is set against YOU and every goal's complete line; a whole grid
  is a scan, so a cell says lead at the raised bar and never finding. It
  draws crossGrid, testCommit and scanLead as they are and works nothing
  out.
- **21 Sep 2026, the ledger shows what your assistant reads.** The System
  & MCP tab gains the MCP's context as one block: a table with a row for
  every calendar day, newest first, and a column for every stock, each
  column naming the door it reads from and its unit. A cell is the value
  that day reads, to the hundredth: corrected where it was corrected,
  struck where it was voided, a dot where nothing was logged, and coloured
  by that day's index against 100 where the stock has one. Nothing is
  filled in, so a gap shows as a gap. Chips narrow it to one goal's stocks
  or to the unplaced ones, and older days load thirty at a time. Below it
  sit your goals with their outcomes, levers and targets, your commits,
  and what the assistant was told to remember, the current note per
  subject with yours beating its own.
- **21 Sep 2026, a progress photo shows wherever its readings are used.**
  A photo showed only on the goal it names, or on goals sharing the body
  area with it, so a goal outside an area never showed one. A goal now
  also shows a photo when it counts a stock the photo door writes for the
  goal the photo names, a body fat estimate say, so the same pictures sit
  under the graph of every goal built on them and under none that is not.
  YOU counts them all, so it holds every picture, folded to one `Progress
  photos` line that opens on a click.
- **21 Sep 2026, the sidebar is the overview, and the goal page reads top
  to bottom.** Opening a goal used to collapse the sidebar to that one
  goal, and only the open area showed what was in it, so you could never
  see everything you own at once. Every area, account and goal that holds
  something now stays listed whatever is open, each with the index it
  reads now and, only when today is not all in, how much of it is: `5 of 6
  in`. Doors arrive late by their own promise, so today is rarely whole,
  and the row says so where the page used to just look empty. A red dot
  marks a goal whose source has actually stopped. What holds nothing is
  left out: empty areas fold into one `Empty areas` row, an account with
  no goal behind it is not listed, and stocks no goal names yet are
  counted in an `Unplaced` row from their first reading. The goal page now
  runs graph, what you are testing folded to one line that opens against
  the chart, progress photos, then outcomes; photos had been switched off
  on the overview. Accounts are no longer written into the page: each
  section you name under Social media is an account, saved in your browser
  with the rest of your organization, so the template ships with none.
- **18 Sep 2026, Instagram account metrics can land with their date evidence.**
  `pull/social.mjs` adds daily account views, saves and shares beside reach
  and profile views. Every field must agree between the normal query and
  a narrow window across the dated reach boundary; mismatches abort the
  batch, missing values are skipped, and both windows are stored with new
  daily rows. `--instagram` isolates the importer; add `--dry` to see only
  new rows without writing. The API-only preview remains available. Normal
  scheduled pulls include the new fields. These checks establish API-bucket
  consistency, not an independent comparison to the Instagram app. Reel
  lifetime metrics stay separate. The dashboard adds **Best between** with
  explicit lower and upper bounds, validation, and the existing confirmation
  flow. Imports do not choose a direction or change comparison thresholds.

- **18 Sep 2026, Instagram's extra metrics wait for their date check.**
  `pull/social.mjs --instagram-preview` reads account views, saves and
  shares in the existing reach-matched query windows. It prints candidate
  dates, exact query boundaries and missing fields without connecting to
  the ledger, refreshing tokens or running another platform. The added
  fields cannot enter normal or scheduled writes. A matching reach control
  is evidence about the window, not independent confirmation of each new
  metric's date; a dated Insights comparison is still required. Incomplete
  account lists, repeated metric records and non-daily responses refuse
  the read. The shared reader and comparison gates are unchanged.

- **17 Sep 2026, a reading before a stock's start day has no index.** The
  start row shipped this morning moved only the baseline and left every
  earlier reading in the series, scored against a baseline taken years
  later, on the argument that taking them out would hide the fall. That was
  half the thought. It keeps the fall, and it draws the rise: `yt_pct_viewed`
  read 205.4 on 2025-09-29 and 403.9 on 2025-09-28, from a channel two
  people a day watched. Percentage viewed goes up when almost nobody clicks,
  because the few who do are the ones who already wanted to, so the metric
  really was higher and the channel was not better. Both of those numbers
  are arithmetic against a unit those days never lived in, and the system
  already has a rule for that: when it cannot score a reading honestly it
  returns nothing and says why. It was applying that rule in one direction
  and not the other. So a reading before the start day now has no index at
  all. It stays in the ledger, it stays readable as a raw value, and it
  comes back with the reason naming the stock's start day instead of a rank.
  The fall does not go anywhere: sixty-nine percent to fourteen is in the
  readings, and that is a truer picture than a line drawn in a unit that did
  not exist yet. A stock joins YOU at its start day, or at its first reading
  if that is later, and after joining, a missing or unscored reading leaves
  a gap rather than dropping the stock or carrying a number forward.
- **17 Sep 2026, the health check said the opposite of what happened.**
  `health` names every stock that has outgrown its baseline, and the gate it
  reports catches both directions: a stock varying eight times as much as it
  did across its first thirty readings, and one varying an eighth as much,
  because either way the unit those thirty readings set has stopped measuring
  anything. The sentence `health` printed only ever knew one of those. A stock
  whose variation had collapsed was reported as varying eight times more.
  The tool you run to ask whether your wire can still be trusted was telling
  you the reverse of the truth, and it was telling you it confidently. The
  cause is the same one every time: it wrote its own sentence instead of
  reading the one the maths file already hands it, so when the gate learned
  the second direction the sentence stayed where it was. It reads that
  sentence now. The maths lives in one file is not a tidiness rule. This is
  the thing it prevents.
- **17 Sep 2026, two numbers for one day, and one of them disappeared.** Send
  the same stock and the same day twice in one call with two different numbers
  and the ledger kept the first, put the second in a list called skipped, and
  answered as though nothing had happened. In a table that cannot be edited
  the second number is then gone, with no row anywhere saying it was ever
  offered, which is exactly the thing the design exists to make impossible. It
  was not deciding anything. It was picking whichever arrived first. A call
  carrying the same number twice still lands once, as it always did, because
  that is a repeat and not a disagreement. A call carrying two different
  numbers for one day now refuses before a single row is written, and names
  the stock, the day and every number it was handed, so the person whose
  ledger it is decides which one is true. Silence over a guess covers guessing
  which of two things you meant.
- **17 Sep 2026, a read that gave up at twenty thousand.** The puller that
  fetches commits reads back what the ledger already holds so it never writes
  the same day twice. It asked for twenty thousand rows and it dropped the
  error. Two ways for that to end badly, and neither is loud. A read that
  failed came back empty, so every day looked new, and the write was refused
  whole by the database. And past twenty thousand rows the read is short
  forever, which is not a bad day, it is a puller that has stopped working and
  will never say so. The shared pager has existed since a silent cap made a
  day of readings vanish off the page in September, and this file was written
  before it. It uses it now, ordered by something that cannot repeat, and a
  page that fails throws instead of handing back a shorter truth.
- **17 Sep 2026, a stock is stale by its own door, everywhere.** Doors carry
  promises: a video platform trimming a number for three days is on time, and
  a wrist strap silent for three days is a dead cable, so a reading is only
  out of date once it is past its own door's promise. That landed, and then
  only one page actually asked. YOU was built from the flat seven days on
  every page including the one it was built for, because the per-door limits
  were worked out twelve lines after YOU was made: the first load used the
  fallback and every load after it used the limits from the load before.
  Always one step behind, quietly, and only on the one number the whole page
  is about, while every goal underneath it was already correct. The scan, the
  test and the target on a goal never asked at all. Every page asks the same
  way now, and every page gets the same answer, which was the point of having
  one file of maths.
- **17 Sep 2026, every stock opens its whole record.** Hold the background of
  the page for two seconds and it turns over: the screen fades the whole time
  it is held, so it says what is coming before it happens, and holding again
  brings you back. Letting go early, dragging or scrolling returns it with
  nothing changed, and buttons, stocks, photos, the chart and anything with
  words to select keep the clicks they already had. Underneath that, clicking
  a stock used to jump to its line on the chart. It now opens that stock's
  whole record in place: its latest reading and the day it was read, how many
  days it holds and the first of them, its index or the reason it has none,
  its rule, which doors write it and how far behind each one is, and every day
  it has ever read, newest first. A voided day is struck through and a
  corrected day shows what it read before beside what it reads now. The chart
  is one press away on the button beside its name.
- **17 Sep 2026, the setup ends with your history, not your first row.** Six
  steps built the thing and stopped at one reading, which is a ledger that says
  nothing, while everyone arrives with years of readings already sitting in an
  app they pay for. There is a seventh step now: open your own you.html, export
  from anything with an export button, drag the CSV on, name the columns you
  want and leave the rest blank. It carries the one rule that saves a wasted
  evening, take the rates and leave the totals, because a total that only climbs
  leaves its own baseline behind and can never hold an index while a rate has a
  level to vary around. And the walkthrough now ends by saying what a copy of
  the Wire actually has: two doors, saying a reading to Claude and dropping an
  export on the page, which between them cover most of it; and a third kind,
  the puller that fetches every morning without you, which is not open, because
  each one needs that service's keys and a schedule on a machine that stays on.
  Until someone sets one up, every reading arrives because it was sent. Better
  said in the setup than discovered in the second week.
- **17 Sep 2026, a start moves the baseline and nothing else.** As it shipped
  an hour ago, a start row took the readings before its day out of the series
  altogether, and another Claude reading the same ledger said the obvious thing
  about that: it would hide the fall. It would have. A channel that ran sixty
  percent viewed and now runs fifteen has genuinely fallen, and cutting the
  first hundred and forty days off the chart would have removed the evidence
  while claiming to fix the number. Two things were being conflated. The fall is
  true and belongs in the picture; the unit today is drawn in is not, because a
  stock's first thirty readings decide how big one index point is and those
  thirty came from six viewers a day. So a start now moves only where the
  baseline is taken from. Every reading stays in the series and on the chart,
  the early ones scored against the later baseline. The fall does not go: it
  gets plainer. Against the old baseline the decline read 96 to 79, seventeen
  points, because the unit was five times too big to show it; against a real one
  it reads 173 to 86, which is its true size. Removing readings to fix a unit
  was the worse trade, and it took someone else's objection to see it.
- **17 Sep 2026, a stock can say which day it begins on.** One name can carry two
  different things. A channel four people a day watched and the same channel
  with thousands share a column, a unit and nothing else, and because the
  baseline is the first thirty readings, the second is scored in a unit the
  first invented: a percentage that swings twenty points because one viewer
  finished a video sets the size of an index point forever. Law 9 said the fix
  was the user's, to take those readings out of the count or start the stock
  clean under a new name, and gave no way to do either. Voiding is the wrong
  tool: a void says one reading should not count, and its friction, typing the
  number back, is about being on the right row, where here there is no wrong row
  but a hundred right ones belonging to something else. So there is a `start`
  row: `event_type` `start`, the stock's name, and the day its series begins.
  Latest wins as a rule does, the readings before it stay in the ledger in no
  series and no count, and the baseline, the spread and the gate are all rebuilt
  from that day. A day before the stock's first reading gives it its whole self
  back, so nothing here goes one way only. Its friction is the size of the act:
  the phrase carries how many readings leave the count, and the answer shows
  what the index is now and what it would become, before anything is written.
- **17 Sep 2026, the full view had taken a name the page was already using.**
  The picture's full view was given the class `big`, which the page has used
  since the beginning for the headline number, the weak point's number and one
  more besides. Its rules are written for a panel that covers the screen, so
  every one of those became a panel that covers the screen: the whole page went
  black with one index number in the middle of it. Nothing was wrong with the
  data and nothing was lost; a name was taken twice. The full view is `full`
  now. A class is a name, and a name in one file has to be looked for before it
  is used.
- **17 Sep 2026, a picture and what it was read for, and two of them against
  each other.** The strip moves to the foot of the goal page, and under each
  picture stands what that day read: the goal's own measures and every estimate,
  because an estimate is what was read off that picture. A day a stock was not
  read shows nothing for it, never a zero and never the day before's. A picture
  opens full, and takes a second day beside it: both days' readings and the
  difference between them, the newer minus the older whichever was clicked
  first. A stock only one of the two days read is left out of the difference
  rather than counted from one end. The difference is arithmetic on two readings
  already in the ledger, shown and never written. Escape or a click outside
  closes it. The point of keeping the picture at all is that the eye and the
  instrument can disagree, and they can only disagree where they can be seen
  together: the estimate read 13 on two days running while the scale moved 1.8
  pounds, and only the picture can say which of them was looking at something.
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
