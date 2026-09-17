# The Wire

A personal ledger that scores you against your own past, records what you
actually did, and tells you whether the two are connected. Built from
scratch across eleven short episodes, with no framework, no build step,
and nothing to pay.

It runs on GitHub, Vercel and Supabase. All three are free at this size
and will stay that way.

## What it does

- **One table.** Everything you ever measure goes in `events`. Not a sleep
  table and a weight table and a spending table. One.
- **Append only.** There is no update policy and no delete policy. You can
  add to your history. You cannot edit it or erase it.
- **An index, not a rank.** 100 is the person you were across your first
  thirty readings. Ten points is one step of your own ordinary variation,
  and there is no ceiling, so improving always shows.
- **You say what better means.** Up, down, or best between two numbers.
  That is the one thing a machine cannot work out, and you decide it once.
- **Two columns.** What happened to you, and what you did. A stock has a
  value every day. A commit has a start and an end.
- **It refuses.** Under ten days either side of a commit, or an effect
  smaller than two standard errors, it says so instead of guessing. If
  two commits overlapped it names the collision rather than picking a
  winner.

## The pages

| file | what it is |
|---|---|
| `index.html` | sign in |
| `pad.html` | type one reading |
| `import.html` | drop a CSV, every numeric column becomes a metric |
| `you.html` | your stocks, your index, your commits underneath; drop a CSV on it to import one |
| `commit.html` | start and stop the things you do |
| `test.html` | did one commit move one stock |
| `scan.html` | that commit against everything, at a raised bar |
| `you-reader.js` | all the maths, in one file |
| `csv-reader.js` | reads a CSV, for `import.html` and `you.html` |
| `api/config.mjs` | hands the pages your Supabase address and publishable key, from Vercel's environment |
| `pull/github.mjs` | pulls your commit count every morning |
| `pull/whoop.mjs` | pulls your Whoop readings every morning, from your own Mac |
| `pull/social.mjs` | local social puller; Instagram candidate metrics have a read-only preview |
| `mcp/server.mjs` | the tools your AI uses; `mcp/wire.mjs` runs them for Claude Desktop, `api/mcp.mjs` over the web |
| `api/at.mjs` | one reading from an iOS Shortcut, behind `WIRE_TOKEN` |
| `mcp/health.mjs` | the `health` tool: is your copy behind, is your table the right shape, which settings are missing |
| `api/setup.mjs` | a walkthrough for Claude, one step at a time, for Whop license holders; it has no door to any ledger |

## Set it up

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FRowanThistlebrooke%2Fwire&project-name=wire&repository-name=wire&stores=%5B%7B%22type%22%3A%22integration%22%2C%22integrationSlug%22%3A%22supabase%22%2C%22productSlug%22%3A%22supabase%22%2C%22protocol%22%3A%22storage%22%7D%5D)

1. **Click the button.** Vercel copies this repo to your GitHub, creates a
   Supabase project for it, puts that project's address and publishable
   key into your Vercel project, and deploys. You type nothing.
2. **Make the table and your login.** In Vercel, open your project,
   Storage, Supabase, Open in Supabase. In the SQL editor run
   `sql/01_the_table.sql`. Then Authentication, Users, Add user, and tick
   auto confirm.
3. **Add your first reading.** Open your site, sign in as that user, then
   open `pad.html` and type a number.

The button cannot run the SQL, cannot make your login, and cannot make up
a secret for you. Those stay with you on purpose.

**Already have a Supabase project?** Skip the Supabase step on Vercel and
add `WIRE_URL` (the project URL) and `WIRE_KEY` (the **publishable** key,
never the secret or service_role key) under Settings, Environment
Variables, then redeploy. The site refuses to hand out any key that is not
a publishable key.

**To let Claude use it**, add three more under Settings, Environment
Variables, and redeploy: `WIRE_EMAIL` and `WIRE_PASSWORD` (the user you
made in step 2) and `WIRE_TOKEN` (a long random string you make, for
example with `openssl rand -hex 32`). In claude.ai, add a custom connector
at `https://<your site>/api/mcp`, choose No sign-in, and add the header
`authorization` with the value `Bearer ` followed by your token.

**For an iOS Shortcut**, which writes one reading from your phone, add a
Get Contents of URL action: `https://<your site>/api/at`, method POST, a
header `Authorization` with the value `Bearer ` followed by your
`WIRE_TOKEN`, and a JSON request body with `metric` (Text), `value`
(Number) and `unit` (Text). The token goes in the header and never in the
address, because an address ends up in logs; a request with the token in
the address is refused. The reading lands at the moment it arrives, once
per stock per day: a second tap on the same day lands nothing.

**For the automatic puller**, add five repository secrets on GitHub under
Settings, Secrets and variables, Actions: `WIRE_URL`, `WIRE_KEY`,
`WIRE_EMAIL`, `WIRE_PASSWORD`, `GH_TOKEN`. GitHub cannot see Vercel's
variables, so these are typed again here.

**For the Whoop puller**, which runs on your own Mac and not on GitHub,
because the refresh token lives here and never leaves. Put your settings in
`~/.wire/env`:

```sh
mkdir -p ~/.wire && chmod 700 ~/.wire
cat > ~/.wire/env <<'EOF'
WIRE_URL=https://yourproject.supabase.co
WIRE_KEY=your_publishable_key
WIRE_EMAIL=you@example.com
WIRE_PASSWORD=your_password
WHOOP_CLIENT_ID=your_whoop_client_id
WHOOP_CLIENT_SECRET=your_whoop_client_secret
EOF
chmod 600 ~/.wire/env
```

It shares the Whoop MCP server's login rather than keeping a second one. A
Whoop refresh token is single use, so only one copy can be the live one: the
token stays in `.whoop_refresh` beside that server, and both this puller and
the server take the lock next to it before refreshing, so neither spends the
other's token. If that folder is not at `~/Desktop/los/whoop`, add
`WHOOP_REFRESH_FILE` to the file above.

Try it with `node pull/whoop.mjs --dry`, which writes nothing. Then have it
run each morning:

```sh
cat > ~/Library/LaunchAgents/com.wire.whoop.plist <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.wire.whoop</string>
  <key>ProgramArguments</key>
  <array>
    <string>$(which node)</string>
    <string>$HOME/wire/pull/whoop.mjs</string>
  </array>
  <key>WorkingDirectory</key><string>$HOME/wire</string>
  <key>StartCalendarInterval</key>
  <dict><key>Hour</key><integer>7</integer><key>Minute</key><integer>45</integer></dict>
  <key>RunAtLoad</key><false/>
  <key>StandardOutPath</key><string>$HOME/.wire/pull.log</string>
  <key>StandardErrorPath</key><string>$HOME/.wire/pull.log</string>
</dict>
</plist>
EOF
launchctl load ~/Library/LaunchAgents/com.wire.whoop.plist
```

It writes what it did to `~/.wire/pull.log`. A morning the Mac is asleep is
a morning it does not run; the next run asks for the last fourteen days, so
a missed day lands late rather than never.

## Instagram preview

The current Instagram importer keeps daily reach and profile views, plus
the follower total when read. Account views, saves and shares can be checked
separately:

```sh
node pull/social.mjs --instagram-preview
```

This reads the existing Instagram token from
`~/Documents/channel-analytics/.env.local`. It makes only Instagram Graph
GET requests. It does not connect to the ledger, run another platform,
refresh tokens or write anything. No `--dry` flag is needed.

The printed dates are candidates: each query uses the existing Pacific-day
window and must match the daily reach control. That control alone does not
prove the date attribution of views, saves or shares. Match them against
dated Instagram Insights before enabling imports. Missing values print
`missing`; they are never replaced with zero. These metrics remain outside
normal and scheduled writes. Reel lifetime totals are not daily readings
and are not part of this preview.

## Rules this project does not break

- No delete and no update on `events`, ever.
- No invented data. Not for demos, not for tests, not to make a chart
  look better. The table cannot be cleaned afterwards.
- The service_role key never appears in this repo, in a page, or in a
  chat. Secrets live in GitHub Settings, in Vercel's environment
  variables, or in a config file on your own machine.
- When it cannot know, it says nothing. Silence is a feature and it is
  the reason any of the numbers are worth reading.

## The course

Eleven episodes, in order. The build is the point: a system you assembled
yourself is one you can change, and every file here is short enough to
read out loud.
