# Working on The Wire

You are helping someone build or extend a personal ledger called The Wire.
Read this before you touch anything. The rules below are not preferences,
they are the reason the system is worth trusting.

## What this is

One Postgres table called `events`, a handful of plain HTML pages, and one
file of maths. No framework, no build step, no npm in the website. Every
page is loaded with a script tag and every file is short enough to read
out loud. Keep it that way.

## Laws you must never break

1. **Append only.** `events` has a select policy and an insert policy and
   nothing else. Never add an update policy, a delete policy, or a tool
   that edits or removes a row. If the user asks for one, say plainly why
   the system does not have it and offer to record a correction as a new
   row instead.
2. **Never invent data.** Do not seed demo rows, sample data, fixtures, or
   filler to make a page look alive. The table cannot be cleaned
   afterwards, and a fake reading sits in the frozen baseline forever.
   An empty page is the correct output for an empty ledger.
3. **Never carry a number forward and never quietly drop a stock.** If a
   reading is missing, the answer is silence. Carrying yesterday forward
   invents a reading. Dropping the stock means skipping a bad number
   raises the score.
4. **Secrets.** The publishable key is safe in the browser because row
   level security protects the rows. The service_role key is not, and must
   never appear in this repo, in a page, in a log, or in a chat. Secrets
   go in GitHub repository secrets, in Vercel environment variables, or in
   a config file on the user's own machine.
5. **The gates stay.** Under `MIN_DAYS` on either side, or an effect
   smaller than two standard errors, the test says so. A scan across many
   stocks uses the raised bar and returns leads, never findings. Do not
   soften either one to make a page feel more useful.
   The test gates are day counts. The index gate is not. `MIN_DAYS`,
   `SCAN_BAR` and the two standard errors were derived for comparing two
   series; an index is gated by whether its own baseline has a spread and
   whether the stock has outgrown it (law 9), and
   marked as moving until that baseline freezes at thirty. Never carry a
   number from one into the other. Fourteen is a correlation threshold and
   it spent a while wrongly gating the index.
6. **The maths lives in one file.** `you-reader.js` is loaded by the
   website and read by the MCP server. Do not copy a formula into a second
   place. If a number needs changing, change it there.
7. **No AI writes a number it was not given.** Claude may write
   measurements, commits, rules and goals through the MCP. It must print
   the exact rows first and write only after the user says yes. Every row
   it writes carries `source = 'claude'`. It may only transcribe a value
   the user gave it in a message, a file or an image. It never estimates,
   rounds, fills a gap or infers a value. If it cannot read a number it
   says so. Notes keep their existing rule. The friction follows what a
   write does. Supplying a number, a correction or an estimate read again
   included, costs a yes: a wrong one is supplied again, latest wins. A
   typed phrase belongs on taking a reading out of the count or putting
   it back, a void or an unvoid, and never on supplying a number.
8. **An estimate is not a measurement.** A number Claude read out of a
   photo or a screenshot is written under source `photo`, with the model
   that read it in context, and its metric name ends `_est`. It never
   shares a name or a source with something that was measured. The
   instrument drifts between models and does not reproduce, so the row
   must say what produced it, or the series can never be untangled later.
   A wrong estimate is fixed by reading the picture again, never by a
   typed number: `estimate` puts the new reading in place of its own
   earlier one for that day as a correction row signed `photo`, with the
   model that read it, at a correction's friction, a yes. The earlier
   reading stays on the record with the model that produced it.
9. **A stock that grows has no level.** The index scores a reading against
   its own stock's ordinary variation, so it means something only while
   that variation still describes the stock. A total that grows does not
   settle around a level: measured against a baseline taken when it was
   small, an ordinary day reads thousands of points from 100, and the
   number is arithmetic and not a reading. When a stock varies many times
   as much now as across its first thirty readings, the system refuses the
   index and says why, the way it already refuses a baseline with no
   spread. Never fix this by moving the baseline. A baseline that moves to
   meet the reading measures nothing, and a rolling one puts you at 100
   forever. The test reads the variation and never the level, because a
   stock that simply got better must keep its number: there is no ceiling,
   and refusing a high index would take that away. The honest fix is the
   user's, not the code's: track a rate, which has a level, instead of a
   total, which does not, or start the stock clean under a new name.

## The shape of the data

- A **stock** is something measured. It has a value every day. It is born
  by its first row and cannot be created or deleted by hand.
- A **rule** says which way is better: `up`, `down`, `band` with a `lo`
  and a `hi`, or `ignore`. Rules are events with `event_type = 'rule'`,
  so the latest one wins and the old ones stay on the record.
- A **commit** is something done. It has a start and an end, not a value.
  `event_type = 'commit'`, ended by a `commit_end`.
- A **void** stops the maths counting a reading: `event_type = 'void'`,
  `context { metric, day, voided }`. The day names one reading; no day
  means every reading of that metric up to the void row's own day.
  `voided: false` counts it again. The latest row per metric and day wins,
  as rules do, and a row that names the day is the last word on that day.
  A voided reading is in no series, no index, not in YOU, in no goal and
  in no scan, and the baseline rebuilds from the readings that remain, so
  a stock can start clean without changing its name. A void adds a row and
  never removes one. That is the only reason the system can have it: law 1
  still holds, every reading is still there, and one more row brings it
  back.
- A void stops a **commit** the same way, by the same row under the same
  laws: `context { commit, name, from, voided }`, and the latest row per
  commit wins. A commit has no day and no value to name, so the row names
  the commit itself. A voided commit is in no test, in no scan and not in
  WHAT MOVES IT, and it collides with nothing, because a commit that is
  not counted cannot muddy one that is. It stays in the ledger struck
  through and its name stays taken. The friction matches: voiding a
  reading costs typing its number back, voiding a commit costs typing its
  name and its start.
- A **correction** puts the right number on a day a reading was mistyped:
  `event_type = 'correction'`, `context { metric, day, value, was,
  readings }`. It edits nothing and removes nothing. The latest correction
  per metric and day wins, as rules do: the day reads `value` in every
  series, index, YOU, goal and scan, `was` says what it read before, and
  `readings` how many readings the day held. A void alone leaves a
  mistyped day blank, because the same reading twice lands once and a
  reading on a voided day is voided too; a correction is how the day gets
  its number back. It is read with the voids, in the order they were
  written, so a correction after a void counts the day again, at its
  value, and a void naming the day after a correction stops it. A dayless
  void does not reach a day a correction names, as it never reached a day
  a void row names. A correction holds only while its day holds the
  readings it saw: if another reading lands on the day afterwards, the day
  reads nothing until it is corrected again, because which number to count
  would be a guess. The reading stays in the ledger, struck through beside
  the value the day reads now. Its friction is a yes, not void's typed
  phrase: a void takes a reading out of every count, so typing its number
  back proves the right one is in view, while a correction supplies a new
  number, and a wrong one is corrected again, latest wins. It works off
  the day rows, not the stock list, so a voided reading, even a stock's
  only one, is still correctable. An `_est` reading is never corrected by
  a typed number: `estimate` reads the picture again and writes the
  correction signed `photo`, with its model. A void and a correction name
  a stock and a day, never a source: that is a known limit, not a promise.
- **Notes** are rows with event_type 'note'. They never appear on a page and
  never enter the maths. A note you wrote on the pad (source 'you') always
  beats one the AI wrote (source 'claude'), whatever the date.
- **YOU** is not a row. It is the average of every index you own, per day,
  drawn only on days where every live stock is fresh.
- The **index** is 100 at the frozen baseline, which is the first thirty
  readings, and ten points is one standard deviation of that baseline. It
  has three states and `indexState` in `you-reader.js` is all of them:
  with no spread in its baseline there is no index and nothing is drawn,
  because there is nothing to measure a reading against; with a spread the
  index is drawn and marked as still moving, since a reading landing
  inside the baseline still changes what 100 means; at thirty the baseline
  freezes and it is drawn solid. A stock that has outgrown its baseline
  (law 9) has no index either, and `noIndexWhy` says which refusal it is.
  Everything that reads an index asks this gate first: a goal line and YOU
  count only the stocks that pass it, a commit test and a scan answer `no
  index` with its reason, a lever's cell against such an outcome says the
  same, and health names every stock that has outgrown its baseline. The
  page shows the state and never writes it in words.

## How to help someone build it

Work one file at a time and always hand over the **whole file**, never a
patch or a "find this line and change it". They are pasting into a browser
editor, not running a diff.

The order is: the table, then the door, then the chart, then the import,
then the rules, then commits, then the test, then the puller, then the
scan, then the MCP. Do not jump ahead. Each step has something they can
look at when it works.

If something is broken, ask for the console output or the error text
before guessing. Do not propose three possible causes. Find the one.

## What not to add

No React, no Next, no Tailwind, no bundler, no TypeScript, no ORM, no
state library. If a change needs one of those, the change is wrong for
this project. No analytics, no tracking, no telemetry. No AI that invents
rows. No "smart" defaults that guess what a metric means.
