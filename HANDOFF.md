# RESUME HERE

Read this file, then open CLAUDE.md. The laws live only in CLAUDE.md.
AGENTS.md is a pointer, not another copy. Do not answer from remembered
repo state. This is ~/wire, not the earlier Life project or its database.

## Advisor role, agreed this session

This assistant reads, checks, challenges and keeps the record. Code changes
belong to the builder sessions in Codex and Claude Code. Maintaining this
handoff is explicitly requested; it does not authorize code changes.

Check current files or the ledger before answering. Distinguish a partial
read from a conclusion. Give the sample size with numerical findings; if
the value or sample cannot be read, say so. Do not invent, estimate, round,
fill or infer a personal number. Use only read tools for the ledger.

Keep replies short and plain, without headings or em dashes. Use a list
only for an actual list. Ask for one decision at a time and stop at that
choice. Challenge a direction with the user's data when it supports the
other side. State errors and their cause plainly.

The user performs commit, push, publish, send, spend and SQL execution.
The advisor may prepare a review, but does not press those buttons.
Rewrite this file at session end with waiting work, blockers, unresolved
decisions and deliberate non-declarations. The chat is not the record.

## Evidence boundary

Written 17 Sep, late, by the advisor session that watched tonight's work.
Verified by reading the files and by read-only calls to the wire connector:
git state, the contents of every file named below, `stocks`, `goals` and
`health`. Not verified: anything in a running browser, the deployed build,
or the database. Nothing below was confirmed by use.

Local main is `f03ca7d`, two commits ahead of `origin/main` at `d36bb15`.
Version is 1.36.0 in the working tree, not yet committed.

## What is waiting and what blocks it

- **`yt_views_live` has no rule, and cannot have one yet.** Writing a rule
  was refused: `no stock called yt_views_live`. A stock is born by its first
  reading and this one has none, because the reading is a subtraction: today's
  lifetime total minus the last one. One total exists, stamped 17 Sep 10:54.
  The second must land 20 to 28 hours later, so between 06:54 and 14:54 on
  18 Sep. Set the rule to `up` after that reading exists, not before.
- **A start row draws readings it cannot honestly score.** `yt_pct_viewed`
  reads 205.4 on 2025-09-29 and 403.9 on 2025-09-28, from a channel nobody
  watched, because a start moves only the baseline and leaves every earlier
  reading scored against it. The fall was the only half considered when that
  was built; the rise is drawn too and the rise is an artefact of a tiny
  audience. Decided but not built: a reading before a stock's start day
  should have no index at all, staying in the ledger as a raw value. The
  work spans rankSeries and every caller. Not started.
- **Nothing watches the doors.** `health` measures how old a door's newest
  row is against its promise. It cannot tell whether anything is scheduled
  to produce more. `com.wire.social` failed every run from 16 Sep 21:03 and
  reported `ontime` throughout, because hand-runs kept the data fresh. This
  is a design gap, not a bug. Nothing built.
- **`sql/sell_public_readonly.sql` has never been run.** A draft at contract
  4. Review deliberately. Never run it for a demo.
- **`sell.*` and `the-door.html` are untracked**, so the CHANGES entry about
  the public page was pulled back out (`7efba28`) until they exist on GitHub.
  Whether they join the repo is undecided.
- **Nothing tonight was verified in a running app.** The hold gesture, the
  per-stock panel, the refused duplicate call and the public page were
  checked by reading and by harness only.
- **Debt from the sweep is unchanged** and listed below.

## Settled tonight, so it is not re-litigated

- `start yt_pct_viewed` has been run. `yt_pct_viewed` reads 85.7, firm, on
  276 days. The connector-cache diagnosis is spent.
- `sell.js` could not read at all: its adapter implemented `limit()` while
  every shared reader had moved to `range()` paging. Fixed at 20:42 tonight,
  along with start rows, per-door freshness and a `metric_sources` map in
  the public snapshot. Contract moved 3 to 4.
- A later read of those same lines found them correct and concluded the
  original diagnosis had been wrong. It was not wrong; it had been fixed an
  hour earlier. A source read says what a file holds now, never when it
  started holding it. Check `git log` before calling a prior finding stale.

### The pullers, found 17 Sep late

- `pull/whoop.mjs` runs from `~/Library/LaunchAgents/com.wire.whoop.plist`
  at 07:45 Zurich, logging to `~/.wire/pull.log`, config `~/.wire/env`.
  Documented in README. Exit status 0.
- `pull/social.mjs` runs from `~/Library/LaunchAgents/com.wire.social.plist`
  at 07:50 Zurich. Installed 16 Sep 21:03 and failed every run with exit 78:
  the plist carried the literal text `$HOME` instead of the expanded path,
  because it was written with a quoted heredoc. launchd is not a shell and
  does not expand it, so the job could not be set up and node never started.
  Fixed 17 Sep, kickstarted under launchd, spawned and exited 0. No days
  were lost: the puller asks for the last 14 days each run, and one hand-run
  covered the single missed morning. That 14-day window is the exposure if
  it ever breaks again.
- Neither puller is a GitHub workflow, so a buyer who clones the repo gets
  both files and no way to run them. `.github/workflows/pull.yml` schedules
  only `pull/github.mjs`, at 05:17 UTC.

## Debt, from a full sweep of every caller

Duplication that produces correct output today and drifts later. This is
exactly how `health` came to print the opposite of the truth:

- `you.html` reimplements `readSources`, `readingOn` and `readFeeds`.
- `you.html` `span()` repeats `testCommit`'s comparison-window arithmetic
  with a different clamp for future starts.
- `pull/github.mjs` and `pull/social.mjs` both implement `momentOn`; social
  also hand-rolls two pagination loops `readAll` already does.
- `api/photo.mjs` duplicates `readDay`'s RPC without its date validation.
- `mcp/server.mjs` duplicates `landRows` insertion logic.

## Deliberately undeclared or left alone

- `yt_per_viewer`, `yt_shares`, `yt_stayed`: previously left without rules
  because no door fed them. Verify current inputs before revisiting.
- The previous handoff records the user's decision to leave the day-early
  CSV series `yt_views` and `yt_duration` ignored. Do not repair or remove
  those readings. Source-specific voiding remains a known limit, not work
  requested here.

## Raised, not decided

- Whether `sell.*` joins the repo. Split it: the page (`sell.html`,
  `sell.css`, `sell.js`) is work that would be lost to a stray `git clean`
  and cannot be described in CHANGES.md while untracked. The SQL
  (`sql/sell_public_readonly.sql`) is different in kind: it is the
  mechanism that makes a private ledger public, and shipping it in the
  template hands that to people who will not read it. Advice given:
  commit the page, hold the SQL until the public page has a job.
- Whether to track a video's retention at a fixed age rather than only
  channel readings per day.
- Whether a goal whose baseline has not formed belongs in YOU at full
  weight. Under goal-averaging `lean` would hold a quarter of YOU on two
  readings. Raised 17 Sep, not decided.

## Decided 17 Sep: YOU keeps every stock, and goal membership is fixed first

YOU averages stocks, so five Whoop stocks outvote two YouTube ones and the
weighting is decided by whichever API is chattiest, not by the user.

Averaging goals instead was proposed and rejected as it stands: four stocks
are in no goal (`whoop_hrv`, `whoop_rhr`, `whoop_sleep_perf`, `ig_reach`),
so switching today would take YOU from 93.4 to 99.0 by dropping them, and
three of the four are below 100 — including `whoop_sleep_perf` at 81.9, the
lowest stock there is. That is the law against quietly dropping a stock,
broken structurally instead of by accident.

The user chose the other order. Fix membership first, then compare:

1. `body` gains `whoop_hrv`, `whoop_rhr`, `whoop_sleep_perf`, giving it all
   five Whoop stocks. (`sleep_perf` is currently only a lever on `lean`,
   which counts toward nothing.)
2. `ig_reach` gets a goal of its own.

Then YOU as goals would be body 89.2, instagram 89.0, youtube 99.2,
lean 107.1 = **96.1**, against 93.4 today. Nothing dropped; the whole
difference is reweighting, which was the actual complaint.

Model confirmed against the live ledger before computing: `body` publishes
90.6 and (85.2 + 96) / 2 = 90.6 exactly.

No code until the two goal rows are written and both numbers have been
looked at side by side.

## Where to check next

### Artifact review still open

The advisor reviewed the rendered "Inside The Wire" artifact at
https://claude.ai/artifact/AZLPmJWkdccKNTieJ1wSze and targeted current source
functions. This is a separate review from the evening work recorded above.
No ledger tools, git commands or running Wire app were used for this review.
The artifact's displayed personal values and its live-data connection were
not verified. They must not be repeated as independently checked results.

Findings to resolve with the builder, without changing gates or laws here:

- The artifact and CLAUDE.md say missing values are never carried forward.
  `etfSeries` in you-reader.js retains `last[m]` and uses it on later days
  while within `staleBy(m)` (lines 769-782). This is an executable-code
  mismatch, not merely wording. When a required member expires, the whole
  aggregate day is omitted. Stocks without an index are separately excluded
  before this calculation. `staleAfter` uses door promise plus slack, not
  the promise alone. No remedy has been chosen or implemented here.
- The artifact says the baseline freezes forever and append-only prevents
  a finding from changing. `liveRows`, `readRules`, `baselineOf` and
  `rankSeries` apply current rules, corrections, voids and explicit starts;
  derived history can change while the original events remain. Baseline
  inputs are eligible daily means, not individual raw events. The artifact's
  description of start must say it changes the baseline for the whole
  series, rather than implying earlier readings disappear.
- `weakPoint` (you-reader.js:1381) picks the lowest latest eligible index.
  It does not itself align dates, check freshness, assess a goal's target,
  or establish which action helps. A weak point is not a demonstrated
  intervention. Goals can include targets and levers, which the artifact's
  "nothing more than a handful of stocks" account omits.
- The table is not the only irreplaceable data. `api/photo.mjs:84` uploads
  image files to private Storage, and the event stores their path. Supabase
  documents that database backups exclude Storage objects:
  https://supabase.com/docs/guides/platform/backups . Protecting only events
  cannot reconstruct the original pictures. No backup state was inspected.
- The artifact omits the measured-versus-estimated distinction. `estimate`
  in mcp/server.mjs records source photo, model identity, and `_est` metric
  names; uploading a photo alone supplies no measurement. Input sources
  cannot be called freely interchangeable without preserving measurement
  meaning, units and provenance. The schema's duplicate key includes source,
  so its protection is not a universal cross-door duplicate guarantee.
- Further source edge cases, not tested with data: `indexState` labels
  firmness by total series length even after a new start supplies a shorter
  baseline. `outgrownBy` returns no refusal for zero current spread. A fully
  frozen baseline with no spread is not unlocked merely by later varied
  readings. Keep these open rather than presenting the refusal list as an
  exhaustive guarantee.

No artifact, source code, SQL, settings or ledger rows changed in this
review. Only this record changed. Priority is resolving the carry-forward
contradiction before strengthening the public promise. Other sessions'
handoff updates were preserved.

### Source map

- `CLAUDE.md`: the sole laws. `CHANGES.md`: recorded changes.
  `mcp/MCP.md`: connector documentation, not a second authority for laws.
- `you-reader.js`: shared maths, gates, pagination, starts and `FED` door
  promises. Read it rather than copying formulas or retaining promise
  counts in this handoff.
- `mcp/server.mjs`, `api/mcp.mjs`, `mcp/wire.mjs`: connector implementation.
  Read the current descriptions; do not assume a remembered tool count.
- `pull/social.mjs`, `api/photo.mjs`, `api/at.mjs`, `mcp/token.mjs`: input
  paths and access checks.
- `you.html`, `import.html`, `test.html`, `scan.html`, `pad.html`,
  `commit.html`: application pages.

## Shared working tree

Builder sessions share this folder and git state. The previous handoff
records duplicate commits and CHANGES.md entries from concurrent work,
and requests fetching before git work. This advisor ran no git commands.
It also records a past `.git/*.lock` permission problem; inspect current
state before treating that historical problem as a current diagnosis.

Real YouTube Studio exports in ~/Downloads were designated for importer
checks in a scratch folder. They contain personal data and must not be
committed to the public repo.
