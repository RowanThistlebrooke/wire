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
| `you.html` | your stocks, your index, your commits underneath |
| `commit.html` | start and stop the things you do |
| `test.html` | did one commit move one stock |
| `scan.html` | that commit against everything, at a raised bar |
| `you-reader.js` | all the maths, in one file |
| `nav.js` | the links between pages |
| `config.js` | your two Supabase values, and the only personal file |
| `pull/github.mjs` | pulls your commit count every morning |
| `mcp/wire.mjs` | lets your AI read the ledger, and only read it |

## Set it up

1. Make a Supabase project. Run `sql/01_the_table.sql` in the SQL editor.
2. Authentication, Users, Add user. Tick auto confirm.
3. Copy `config.example.js` to `config.js` and paste your Project URL and
   your **publishable** key. Never the service_role key.
4. Import this repo on Vercel. No framework preset, no build command.
5. Open the site, sign in, and add a reading.

For the automatic puller, add five repository secrets under Settings,
Secrets and variables, Actions: `WIRE_URL`, `WIRE_KEY`, `WIRE_EMAIL`,
`WIRE_PASSWORD`, `GH_TOKEN`.

## Rules this project does not break

- No delete and no update on `events`, ever.
- No invented data. Not for demos, not for tests, not to make a chart
  look better. The table cannot be cleaned afterwards.
- The service_role key never appears in this repo, in a page, or in a
  chat. Secrets live in GitHub Settings or in a config file on your own
  machine.
- When it cannot know, it says nothing. Silence is a feature and it is
  the reason any of the numbers are worth reading.

## The course

Eleven episodes, in order. The build is the point: a system you assembled
yourself is one you can change, and every file here is short enough to
read out loud.
