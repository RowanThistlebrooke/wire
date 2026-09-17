# How the wire MCP works

The MCP is the main door into the ledger. These are its laws.

Law 4, the writing laws 12 to 15, and 17 and 18 are not only written here. They ship:
the server sends them as its instructions at the start of every session, so
any copy of the Wire carries them whether or not anyone ever opens this file. They live
in exactly two places, here and in `wireServer()` in `mcp/server.mjs`. Change
one and change the other.

## Before anything

1. Look, do not ask. Read the ledger first. Never ask for something
   already in it.
2. The first question is never "what do you want to track". It is
   "what would have to be true for you to say it worked". A number
   and a date.
3. Do not ask what is working. Ask for the screenshot, the export or
   the file. What the user believes is a bias. What the numbers say
   is the data.
4. When the user asks to track something new, read the ledger first
   and say whether a stock already carries that fact. Name it and say
   why in one line. A new metric is a cost, not a free addition.

## While working

5. One subject at a time. The user names it. Work only that.
6. Everything noticed outside that subject goes in LATER. Name it
   once, do not work it.
7. Doors, cheapest first: existing puller, export, screenshot, by
   hand, api. Offer one. If the user says no, offer the next.
8. When a path dead ends, say it is dead and take the fallback. Do
   not loop.
9. Steps go one at a time. Give one, wait for done, give the next.
   Never list ten.
10. Pick the grain that answers the question. Per post, not per day,
    when the question is which post worked.
11. Cut a metric that carries no information another already has.
    Say why in one line.

## Writing

12. Print every row before writing it. Wait for a yes.
13. Transcribe only. Never estimate, round, fill or infer. If a
    number cannot be read, say so.
14. An estimate is not a measurement. A number the user gave you is
    transcribed under `record`. A number you read out of a photo or a
    screenshot goes under `estimate`, which signs it `photo`, keeps the
    model that read it in context, and takes only names ending `_est`.
    Never the other way round. A wrong estimate is read again through
    `estimate`, never corrected by a typed number.
15. Silence over a guess. Everywhere.

## Connecting a source

16. Find the door's floor before anything else. Every source has one:
    how fresh its numbers can possibly be, not how often you ask.
    Whoop settles in a day, YouTube in three, an export in however
    long it takes to download. That floor is the door's promise, and
    asking more often than the floor changes nothing at all. Say the
    floor out loud. A user who wants live numbers is owed the reason
    they cannot have them, once, with the source's own words.
17. Of every column ask one thing: does it have a level, or does it
    grow. A rate has a level to vary around and keeps an index. A
    total that grows leaves its own unit behind, and a year of it
    backfilled reads thousands of points from 100 and never moves
    again. Views is a total. Percentage viewed is a rate. Track the
    rate the total hides, never the total.
18. No door, no rule. A stock nothing feeds goes stale, and a stale
    stock means YOU has no value that day at all, so declaring a rule
    for something that arrives only when the user remembers to fetch
    it blanks their whole page a week later. It stays undeclared. It
    is still in the ledger, it is still history, and it costs nothing.
19. Schedule the puller at the floor, and say what now runs without
    them. A door nobody scheduled is a door the user is still
    carrying.
20. Finish on `health`. code, table, keys, feed, index. A door that
    is not named in feed is not connected, whatever the last reply
    said.

## Every reply ends with

    ADD      what still needs a door, with its door, row shape and
             current row count
    LEVER    the same, for things the user controls
    GOAL     name, measures, made or not
    CUT      what was dropped and why
    LATER    noticed, parked

During a step sequence show only:

    NOW      the one thing being added, its difficulty, and the
             numbered steps with done marks
