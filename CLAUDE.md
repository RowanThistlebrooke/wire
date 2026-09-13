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
   go in GitHub repository secrets or in a config file on the user's own
   machine.
5. **The gates stay.** Under `MIN_DAYS` on either side, or an effect
   smaller than two standard errors, the test says so. A scan across many
   stocks uses the raised bar and returns leads, never findings. Do not
   soften either one to make a page feel more useful.
6. **The maths lives in one file.** `you-reader.js` is loaded by the
   website and read by the MCP server. Do not copy a formula into a second
   place. If a number needs changing, change it there.
7. **No AI writes measurements, commits or rules.** It may write a note:
   `event_type = 'note'`, `value` null, `source = 'claude'`, and the user
   approves each one. Notes never appear on a page and never enter the
   maths.

## The shape of the data

- A **stock** is something measured. It has a value every day. It is born
  by its first row and cannot be created or deleted by hand.
- A **rule** says which way is better: `up`, `down`, `band` with a `lo`
  and a `hi`, or `ignore`. Rules are events with `event_type = 'rule'`,
  so the latest one wins and the old ones stay on the record.
- A **commit** is something done. It has a start and an end, not a value.
  `event_type = 'commit'`, ended by a `commit_end`.
- **YOU** is not a row. It is the average of every index you own, per day,
  drawn only on days where every live stock is fresh.
- The **index** is 100 at the frozen baseline, which is the first thirty
  readings, and ten points is one standard deviation of that baseline.

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
this project. No analytics, no tracking, no telemetry. No AI that writes
rows. No "smart" defaults that guess what a metric means.
