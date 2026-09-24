// /youscan: read the user's own numbers off a page they are signed into, and show which of them can go in.
// One text, read twice by mcp/server.mjs: as the MCP prompt "youscan", which Claude Code shows as
// /mcp__wire__youscan, and inside the server's instructions, meant for a chat where prompts are not commands,
// the Claude app among them, so typing /youscan runs the same scan there; that route is not yet tested. The
// prompt carries every rule the scan needs, the Chrome door's own rules included (page text only and never a
// screenshot, never signing in, stopping when blocked, exact numbers only, writing on one yes), because Claude
// Code keeps only the first 2048 characters of a server's instructions and the door's rules sit past them.
// It writes only through record_page, on one yes, and it analyses nothing into the ledger.
//
// What it cannot stop yet: record_page checks none of the "can't go in" reasons. A rounded number (4.7K), a
// window (last 7 days), a relative date (4d ago), a day not over yet (today so far), a converted 2:41, or a number
// read off a chart, handed over as a plain number and date, is refused only by these words. The code guard inside
// record_page comes after 27 Sep 2026.

// Which of the user's sites the Wire can feed without a scan: only what a buyer can set up today, and a file
// dropped by hand is not called automatic. The social and WHOOP pullers in pull/ run on the maker's own Mac with
// his own files, so they are not offered.
const automatic = page => 'GitHub can: a puller runs on GitHub itself (pull.yml), once its repository secrets are set. '
  + `YouTube Studio cannot yet, but its export, the CSV from inside the zip Studio gives, dropped on ${page}, brings its history in by hand. `
  + 'Anything else has no automatic door yet: scan it again when you ask.';

// target is the site or link the prompt was given, null when it was given nothing, and left out by the server's
// instructions, which cannot know which and so carry both.
const ASK = 'In one message, ask three things and nothing else: who they are, in one line; what they want to get better; '
  + 'which accounts they have (YouTube, TikTok, Instagram, X, LinkedIn...). Then offer to scan those accounts\' pages, one at a time, and keep '
  + 'the answers in this chat unless they ask you to remember them.';

export function youscan(target, site) {
  const page = site ? `${site}/import.html` : 'their site\'s import.html';
  const start = target === undefined ? 'If a site or link came with it, scan that. If nothing came with it: ' + ASK
    : target ? `Scan this: ${target}.` : 'Nothing was named. ' + ASK;
  return start + ' '
    + 'To scan a site or a link: with the browser tool this chat has, open the exact link they gave, or for a site name their own page on '
    + 'that site, never someone else\'s profile; if you are not sure which page is theirs, ask. No browser tool: say so; for YouTube Studio '
    + `offer its export instead, the CSV from inside the zip Studio gives, dropped on ${page}. Not signed in: stop, say which site, and never `
    + 'sign in for them. Only their own numbers, and only exact numbers, as the page shows them: never estimated, rounded, filled or worked out. '
    + 'Read only: never type, log in, accept, or click anything that changes the page, and stop and say so if a site blocks automation. '
    + 'Read the page\'s text only, never a screenshot. Sort every number into two lists, "goes in" and "can\'t go in", each "can\'t" with its '
    + 'reason: rounded (4.7K, or 3.2 hours shown to a tenth), a window (last 7 days, or an average with no period named), a relative date (4d ago), a day not over '
    + 'yet (today so far, even when the page puts a date on it, because the site\'s today can be their yesterday, or a day the site says is still being processed), not one plain number (2:41, never converted), only in a chart. A number only in a chart or a picture is '
    + 'never written, not even as _est: reading it would need a screenshot, and _est is only for photos the user sends. A total that only grows goes in through record_page with total true. '
    + 'Before naming a number, call stocks and reuse the name of a stock that already carries that fact in the same unit; a new name is a cost. '
    + 'Call record_page without yes and show its full table, the "can\'t go in" list under it, then one line: the biggest issue these numbers '
    + 'show. That analysis stays in this chat and never goes in the ledger. Write only on one yes, by calling record_page again with yes true. '
    + 'End with whether that site can be made automatic, from these: ' + automatic(page);
}
