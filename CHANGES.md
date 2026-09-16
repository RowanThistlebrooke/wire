# Changes

Template updates, newest first. Each one is a whole file: open it on
GitHub, copy all of it, paste over yours.

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
