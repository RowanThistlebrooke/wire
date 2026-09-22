# RESUME HERE

- **Working on:** the `/you` product. Next piece: grey outline of the two landing-page animations (the data tree; the `/you` walkthrough) in a new `landing.html`, sketch mode, no harness.
- **Next step:** on "go", write `~/wire/landing.html`: plain SVG + CSS, one file, no library, no numbers anywhere. (1) Tree: `you` root → branches body / social media / business → leaves whoop, garmin, manual, mcp / instagram, youtube, mcp / your sales, a date ticking, leaves pulse, slow loop. (2) `/you`: split panel, left a chat where `/you` is typed and nine steps tick in one by one, right GitHub → Vercel → Supabase → connector → first leaf → history → phone → goal, ending in a small tree. Grey boxes and straight lines first. Then serve it: `cd ~/wire && python3 -m http.server 8795 --bind 127.0.0.1` and give the user `http://localhost:8795/landing.html`. Screenshot once, kill the server.
- **Waiting on you:** "go" for the grey tree. Also, only you can: (a) rotate the Whop API key and set the new one in Vercel as `WHOP_API_KEY`, redeploy; (b) in Whop → Software → The Wire → Download, set the Web App link to `https://<your site>/start.html`; (c) say "push" for local commit `f0a0f74`.

-----

## Done so far

- Pushed `d9bf9fa` (v1.44.0): context table, cross-reference tab, two-level sidebar, row lines and arrows, and the setup `done` fix.
- Local only, not pushed: `f0a0f74` "/you: nine steps, one prompt, any AI". `api/setup.mjs` now has nine steps (phone, first goal added), step 5 covers claude.ai / Claude Code / Codex / any MCP AI, and a `you` prompt via `registerPrompt`. `start.html` is the buyer landing page from Whop. README row and CHANGES entry written. **Bump `package.json` to 1.45.0 before pushing.**
- Tested with the scratchpad script `scratchpad/setup-test.mjs` (drives the connector over HTTP with Whop's fetch faked): bad key refused, `/you` listed, steps 0–9 in order, step 10 refused.
- Reel script settled (60 words, under 22 s). Landing page plan agreed: fold = the user's live YOU page read-only (`sell.html` + `sql/sell_public_readonly.*` draft, not activated), then intro video, step map, price. Whop is checkout + delivery only.
- Design work still queued after the animations: step 2 pillars in the top bar (auto-sort by source door), step 3 YOU page redesign (Best / Worst / Weak point top right, stocks by pillar, photos, minimal).

## Key files

- `api/setup.mjs`: the walkthrough. `STEPS`, `EASE`, `step(done, site, tz)`, `registerPrompt('you', …)`. `done` max is `STEPS.length`.
- `start.html`: what the Whop Download button should open. Fills its own `location.origin`.
- `you.html`: the dashboard (3,700+ lines). Sidebar in `drawAreas`/`navGoal`/`navVal`; later `<style>` blocks override earlier ones, use `#area-rail.area-rail …` to win.
- `CHANGES.md`: one entry per change, newest first, `- **22 Sep 2026, …**`, wrapped at 74 columns.
- Untracked, never add or commit: `the-door.html`, `sell.html`, `sell.js`, `sell.css`, `sql/sell_public_readonly.*`, `episode-1.html`.

## Watch out

- Before any push: grep the diff `origin/main..HEAD` for the user's three account names (not written here on purpose; the session summary and the old notes have them) and the count must be 0. Push with `git -c credential.helper= -c 'credential.helper=!f(){ echo username=RowanThistlebrooke; echo "password=$(gh auth token --user RowanThistlebrooke)"; }; f' push -q origin main`. Commits end with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- The user pasted a Whop API key into chat once; told them to rotate it. Never use it, never ask for keys, never write one anywhere.
- The permission classifier blocks probing the live connector with a key. Test locally with the scratchpad script instead.
- The user's `localhost:8794` server hands out a fixed list of pages; new files 404 there. Use a second port.
- Playwright can only save screenshots under `~/wire/.playwright-mcp/` (git-ignored). Delete after reading.
- Fake-data pages get `<title>STUB</title>` and magenta/violet accents. The landing animations carry no numbers, so they need no mark.
- Working style: one step at a time, short turns. "sketch" = no harness. Commit and CHANGES once per push, not per step. Say up front if a build needs more than one turn.
- The old 1,513-line working notes this file replaced are at `/tmp/HANDOFF.local.keep`. They contain account names; never commit that version.
- Every reply ends with a blank line, `---`, then the credit-saver footer line the hook supplies.
