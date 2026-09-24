// /youscan: read the user's own numbers off a page they are signed into, and put every one worth keeping in
// the box. One text, read twice by mcp/server.mjs: as the MCP prompt "youscan", which Claude Code shows as
// /mcp__wire__youscan, and inside the server's instructions, meant for a chat where prompts are not commands,
// the Claude app among them, so typing /youscan runs the same scan there; that route is not yet tested. The
// prompt carries the page rules itself (text only, never signing in or clicking, stopping when blocked),
// because Claude Code keeps only the first 2048 characters of a server's instructions.
//
// Nothing true is left out: an exact number for one day is a reading, and a window or a rounded number is a
// snapshot, kept exactly as shown and never scored; a number that is not one plain number (2:41) goes the same
// way, never converted. take writes them, on one yes; the analysis stays in the chat. Not yet in code, after
// 27 Sep 2026: take and record_page do not refuse a count for a day not over yet; until that guard lands it
// is kept out by their words.

// Which of the user's sites the Wire can feed without a scan: only what a buyer can set up today, and a file
// dropped by hand is not called automatic. The social and WHOOP pullers in pull/ run on the maker's own Mac with
// his own files, so they are not offered.
const automatic = page => 'GitHub can: a puller runs on GitHub itself (pull.yml), once its repository secrets are set. '
  + `YouTube Studio cannot yet, but its export, the CSV from inside the zip Studio gives, dropped on ${page}, brings its history in by hand. `
  + 'Anything else has no automatic door yet: scan it again when you ask.';

// target is the site or link the prompt was given, null when it was given nothing, and left out by the server's
// instructions, which cannot know which and so carry both.
const ASK = 'In one message, ask three things and nothing else: who they are, in one line; what they want to get better; '
  + 'which accounts they have (YouTube, TikTok, Instagram, X, LinkedIn...). Then offer to scan those accounts\' pages, one at a time.';

export function youscan(target, site) {
  const page = site ? `${site}/import.html` : 'their site\'s import.html';
  const start = target === undefined ? 'If a site or link came with it, scan that. If nothing came with it: ' + ASK
    : target ? `Scan this: ${target}.` : 'Nothing was named. ' + ASK;
  return start + ' '
    + 'Open the exact link, or their own page on a named site and never someone else\'s, with this chat\'s browser tool; if unsure which page '
    + `is theirs, ask. No browser tool: say so, and for YouTube Studio offer its export, the CSV inside the zip, dropped on ${page}. `
    + 'Not signed in: stop and name the site; never sign in for them. Read only: never type, log in, accept or click anything that changes '
    + 'the page, and stop and say so if it blocks automation. Read the page\'s text, never a screenshot. '
    + 'Put every number of theirs worth keeping in take, from page: an exact number for one day as a reading; a window or a rounded number '
    + '(last 28 days, 38.1K, today so far, 4d ago) as a snapshot, exactly as shown with its window, and one that is not one plain number '
    + '(2:41) the same, never converted; '
    + 'a running total as a reading with total true. Give each an area. Call take without confirm and show its table, then one line in '
    + 'italics: the biggest issue these numbers show, which stays in this chat. Write on one yes, with the code. '
    + 'End with whether that site can be made automatic: ' + automatic(page);
}
