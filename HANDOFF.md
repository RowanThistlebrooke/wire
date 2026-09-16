# RESUME HERE

**Working on:** The Wire — the void row kind (stop counting a reading, append only). Shipped.
**Next step:** Nothing in flight. Ask what to build next; for void follow-ups the tool is in `mcp/server.mjs`, the maths in `you-reader.js`.
**Waiting on you:** nothing, keep going.

-----

## Done so far

Void shipped as `86bff18`, pushed, Vercel deploy success, version 1.4.0 live on main and production.

- **Row:** `event_type 'void'`, `context { metric, day, voided }`. A day names one reading; no day means every reading of that metric up to the void row's own day. Latest row per metric+day wins, and a row naming the day beats a dayless one. A row that does not say `voided` stops nothing.
- **Maths:** a voided reading is in no series, no index, not YOU, no goal, no scan; the baseline rebuilds from what remains.
- **Tool:** `void(metric, day, voided?, confirm?)` prints the reading plus a phrase, and writes only when that exact phrase comes back — a yes is not enough. Rows signed `claude`.
- **Page:** the ledger tab lists voided readings struck through with their day; header says "latest 30" when there are more. The goal page is unchanged.
- Earlier, already committed: Whop one-time-purchase fix (`482d621`), lever scan tuning (`2dd2c82`), goal page layout (`b01de92`), day_of timezone work (`fb357ff`).

## Key files

- `you-reader.js` — readVoids, writeVoid, voidedOn, liveRows, readingOn; rankSeries filters through voidedOn.
- `mcp/server.mjs` — the `void` tool (14 tools total) and `load()` passing voids.
- `you.html` — the ledger tab's voided section in `drawLedger`, `.vd` CSS.
- `CLAUDE.md` — the void bullet under "The shape of the data".
- `scan.html`, `test.html` — pass voids into rankSeries.

## Watch out

- `node_modules` is gitignored and went missing once: run `npm install` here, or anything importing `api/*.mjs` dies with ERR_MODULE_NOT_FOUND.
- Test suites live in the session scratchpad, run from `mcptest/`; the in-process ones (`http.mjs`, `health.mjs`) need `node --import ./register.mjs <file>`.
- `history` refuses a metric with no rule — that is not a void bug.
- Bump `package.json` on every push; health compares a fork to main.
- Push: `git -c credential.helper= -c 'credential.helper=!f(){ echo username=RowanThistlebrooke; echo "password=$(gh auth token --user RowanThistlebrooke)"; }; f' push -q origin main`
