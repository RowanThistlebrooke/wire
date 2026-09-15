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
| `api/config.mjs` | hands the pages your Supabase address and publishable key, from Vercel's environment |
| `pull/github.mjs` | pulls your commit count every morning |
| `mcp/server.mjs` | the tools your AI uses; `mcp/wire.mjs` runs them for Claude Desktop, `api/mcp.mjs` over the web |

## Set it up

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FRowanThistlebrooke%2Fwire&project-name=wire&repository-name=wire&stores=%5B%7B%22type%22%3A%22integration%22%2C%22integrationSlug%22%3A%22supabase%22%2C%22productSlug%22%3A%22supabase%22%2C%22protocol%22%3A%22storage%22%7D%5D)

1. **Click the button.** Vercel copies this repo to your GitHub, creates a
   Supabase project for it, puts that project's address and publishable
   key into your Vercel project, and deploys. You type nothing.
2. **Make the table and your login.** In Vercel, open your project,
   Storage, Supabase, Open in Supabase. In the SQL editor run
   `sql/01_the_table.sql`. Then Authentication, Users, Add user, and tick
   auto confirm.
3. **Add your first reading.** Open your site, sign in as that user, and
   type a number on the pad.

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

**For the automatic puller**, add five repository secrets on GitHub under
Settings, Secrets and variables, Actions: `WIRE_URL`, `WIRE_KEY`,
`WIRE_EMAIL`, `WIRE_PASSWORD`, `GH_TOKEN`. GitHub cannot see Vercel's
variables, so these are typed again here.

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
