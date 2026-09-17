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

- **Nothing is pushed.** Two commits ahead, plus an evening in the working
  tree: `mcp/health.mjs`, `mcp/server.mjs`, `pull/github.mjs`, `scan.html`,
  `test.html`, `CHANGES.md`, `package.json`, `HANDOFF.md`, and untracked
  `sell.*`, `sql/sell_public_readonly.*`, `the-door.html`. Six CHANGES
  entries and the version bump are drafted and waiting. The user pushes.
- **`yt_views_live` has no rule.** `health` showed the door on time and
  writing the same morning. The stock cannot be scored until it has `up`.
  That is a ledger write and belongs to the user.
- **`sql/sell_public_readonly.sql` has never been run.** Still a draft, now
  at contract 4. Review it deliberately. Never run it for a demo.
- **`sell.*` and `the-door.html` are untracked.** The user cleared editing
  `sell.*` this session. Whether they join the repo is undecided.
- **Nothing tonight was verified in a running app.** The hold gesture, the
  per-stock panel, the refused duplicate call and the public page were
  checked by reading and by harness only.

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

- Whether YOU should average goals instead of stocks. The prior concern
  was that a domain with more stocks contributes more. Current membership
  and numerical influence have not been checked this session.
- Whether to track a video's retention at a fixed age rather than only
  channel readings per day.
- Which builder session owns further landing work.

## Where to check next

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
