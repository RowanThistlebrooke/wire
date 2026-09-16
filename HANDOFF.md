# RESUME HERE

**Working on:** The Wire — index gate threaded through every reader (shipped as `41f0dc7`, pushed, Vercel deployed, v1.20.0).
**Next step:** Optional: rerun the verification that was stopped to save usage — confirm every MCP tool and page matches `6a9a1b2` on a ledger where nothing is gated, and sweep for any reader still using ranks without `indexState` (you.html spark/drawHead/flow, test.html YOU column, scan.html YOU row).
**Waiting on you:** nothing, keep going. The user was at 92% usage; ask before any large workflow.

-----

## Done so far (all pushed to origin/main)

- `4ef62cd` you.html read-only (rule shown as text); `goal` takes levers.
- `8bbc0be` CSV drop on you.html; parser in `csv-reader.js`; `readWhen`/`momentOn` in you-reader.js.
- `5cdb72a` `/api/at` (iOS Shortcut door, token in header only); `readingKey` + `landRows` shared by both CSV doors; MCP.md law 4 ships in session instructions.
- `1c31573` import.html dates land on their own ledger day (`momentsOn`).
- `dbdabb9` correction row (`event_type correction`, read with voids in `readVoids`, applied in `liveRows`, stale rule via `readings`).
- `1c8b0ef` estimate reads a day again (photo correction). `2c9053e` correct works off rows, costs a yes; `stocks` `uncounted`; record refuses `_est`; CLAUDE.md law 7 friction rule.
- `6a9a1b2` (user's commit) outgrown gate `OUTGROWN=8`, `outgrownBy`, `pts.spreadNow`, `noIndexWhy`, law 9; CSV row-by-row tolerance (skips counted by reason).
- `41f0dc7` gate threaded: `testCommit` → `no index`; `crossGrid` no-index cell; scan.html names gated stocks; `history` omits ranks for gated stocks; health `index` check.

## Key files

- `you-reader.js` — all maths: gate (`indexState`, `noIndexWhy`), `readVoids`/`liveRows`/`correctedOn`/`staleOn`, `readWhen`/`momentsOn`, `readingKey`/`landRows`, `testCommit`, `crossGrid`.
- `mcp/server.mjs` — tools (`record`, `estimate` + yes re-read, `correct` + yes, `void` phrase, `history`, `stocks`, `health`), `writeReadings`/`readingsOf`.
- `mcp/health.mjs` — `feed()`, `index()` checks. `mcp/token.mjs` — shared token check. `api/at.mjs` — shortcut door.
- `you.html` (drop import, ledger tab corrected lane), `import.html`, `csv-reader.js`, `test.html`, `scan.html`.
- `CLAUDE.md` laws 1–9, `mcp/MCP.md` laws (writing laws 12–15), `CHANGES.md`.

## Watch out

- Untracked `sell.*`, `the-door.html`, `sql/sell_public_readonly.*` belong to someone else: never add or commit them.
- Push: `git -c credential.helper= -c 'credential.helper=!f(){ echo username=RowanThistlebrooke; echo "password=$(gh auth token --user RowanThistlebrooke)"; }; f' push -q origin main`. Bump `package.json` each push.
- Test harnesses live in the session scratchpad (gone after this session): loader-hook fake supabase + MCP Client over InMemoryTransport; marked STUB pages. Any fake-data page must be titled STUB with magenta/violet accent (memory `stub-pages-marked`).
- Test file importers against the real YouTube Studio zips in ~/Downloads (copy to scratchpad, never commit — public repo). Memory `test-with-real-exports`.
- Never call wire-connector write tools; read-only `health`/`stocks`/`history` only when needed.
- Real ledger has day-early csv rows (yt_views, yt_duration, ignored) — user said leave them; void-by-source is a known limit, not to be built.
