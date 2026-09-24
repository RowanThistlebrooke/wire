// What a buyer can do once their Wire is up, in the words the walkthrough ends with and the Wire's own
// connector answers with. One text, read by both, so the two can never say different things. It is text and
// nothing else: api/setup.mjs imports it, and api/setup.mjs has no door to any ledger.
//
// A new way in joins this list only once it has shipped. /youscan shipped in 1.67.0.

export function flow(site) {
  const page = site ? `${site}/import.html` : 'your site\'s import.html';
  return 'Start your data flow. In any chat with wire on, say:\n'
    + '- "my weight today is 81.4 kg" (any number you measured)\n'
    + '- "how am I doing?" (reads everything you have)\n'
    + `Or drop a file: open ${page} and drop an export. YouTube Studio works, WHOOP does not yet.\n`
    + 'Or scan a site: type /youscan and a site or a link (in Claude Code: /mcp__wire__youscan), in a chat whose AI has a browser. It reads your numbers off a page you are signed into and shows what can go in.';
}
