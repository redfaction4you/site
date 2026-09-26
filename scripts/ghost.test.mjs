/**
 * Tests for the server ghost's text rules.
 *
 *   npm test
 *
 * Everything the ghost says reaches a 2001 bitmap font in Red Faction's chat,
 * and the owner forbids em dashes in anything a player reads. A model that
 * answers with curly quotes, an em dash or an emoji must still produce a clean
 * ASCII line, and these are the rules that make it so.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { asciiLine, cleanReply, decide } from "../src/lib/ghost/speak.ts";
import { personaFor, promptFor } from "../src/lib/ghost/persona.ts";

test("curly quotes, em dashes, ellipses and emoji come out as plain ASCII", () => {
  assert.equal(
    asciiLine("\u201CHello\u201D \u2014 it\u2019s cold\u2026 \u{1F47B} ok"),
    "\"Hello\", it's cold... ok",
  );
});

test("a line never carries an em dash", () => {
  assert.doesNotMatch(asciiLine("boo\u2014and again \u2014 boo"), /\u2014/);
});

test("whitespace collapses to one line", () => {
  assert.equal(asciiLine("  two\n\nlines\there  "), "two lines here");
});

test("Halloween has a ghost and other servers do not yet", () => {
  assert.equal(personaFor("halloween")?.name, "Wisp");
  assert.equal(personaFor("themed"), null);
});

// A player on the Halloween server is called "ghost" (owner, 25 September 2026).
test("the ghost is not called ghost, and knows a player may be", () => {
  const persona = personaFor("halloween");
  assert.doesNotMatch(persona.name, /ghost/i);
  const system = persona.system({
    event: "chat", subject: "ghost", humans: ["ghost"], bots: [], transcript: [],
    playing: null, next: null, mapTitles: [],
  });
  assert.match(system, /A player may be called ghost/);
});

test("labels, bold, quotes, fences and stage directions never reach the chat", () => {
  const cases = [
    ["Wisp: hey there", "hey there"],
    ["You: hows it going?", "hows it going?"],
    ["*floats over* \"yo\"", "yo"],
    ["\"Wisp: hey sam\"", "hey sam"],
    ["**Wisp:** hey sam", "hey sam"],
    ["**Wisp: hey sam**", "hey sam"],
    ["**hey sam**", "hey sam"],
    ["wispy vibes: nice", "wispy vibes: nice"],
    // Review 2: half a stage direction, stray bold and curly quotes reached players.
    ["Wisp: *waves* hey sam", "hey sam"],
    ["You: *drifts over* hows it going?", "hows it going?"],
    ["**Boo!** hows it going?", "Boo! hows it going?"],
    ["hey **sam**, hows it going", "hey sam, hows it going"],
    ["“hey sam, hows it going?”", "hey sam, hows it going?"],
    ["“Wisp: hey sam”", "hey sam"],
    // Review 3: actions anywhere, italic labels, backticks, fences, labels on their own line.
    ["hey sam, hows it going? *waves*", "hey sam, hows it going?"],
    ["Hey Sam! *waves* How's it going?", "Hey Sam! How's it going?"],
    ["\"hey sam, hows it going?\" *waves*", "hey sam, hows it going?"],
    ["\"*waves* hey sam\"", "hey sam"],
    ["*waves* *grins* hey sam", "hey sam"],
    ["*waves* Wisp: hey", "hey"],
    ["that map is *really* good", "that map is really good"],
    ["*Wisp*: hey sam", "hey sam"],
    ["_You_: hey sam", "hey sam"],
    ["*You*: hows it going?", "hows it going?"],
    ["`hey sam`", "hey sam"],
    ["Wisp: `hey sam`", "hey sam"],
    ["*hey sam, hows it going?*", "hey sam, hows it going?"],
    ["*Wisp: hey sam*", "hey sam"],
    ["```\nhey sam\n```", "hey sam"],
    ["Wisp:\nhey sam, hows it going?", "hey sam, hows it going?"],
    ["*floats over*\nhey sam", "hey sam"],
    ["hey dark_lord_", "hey dark_lord_"],
  ];
  for (const [raw, said] of cases) assert.equal(cleanReply(raw, "Wisp"), said, raw);
});

// Review 1: "**SKIP**" was said in chat and "*SKIP*" became a canned line.
// Review 2: a SKIP behind a stage direction, an emoji or curly quotes was said.
// Review 3: a note to itself was said, and an action meaning silence was overruled.
test("a model's silence is silence, however it is dressed", () => {
  const skips = [
    "SKIP", "skip", "**SKIP**", "*SKIP*", "`SKIP`", "[SKIP]", "SKIP (for Alex)", "SKIP — for Alex",
    "Wisp: SKIP", "**Wisp**: SKIP", "*Wisp*: skip", "(silence)", "*stays quiet* SKIP", "*shrugs* skip",
    "\u{1F47B} SKIP", "“SKIP”", "Wisp: *floats by* SKIP", "Wisp:\nSKIP", "**Wisp:**\nSKIP",
    "(No response)", "(no response needed, Sam is talking to Alex)", "(nothing to say)", "(stays silent)",
    "No reply.", "N/A", "...", "*", "*stays quiet*", "Wisp: *says nothing*", "*chuckles*",
  ];
  for (const raw of skips) assert.deepEqual(decide(raw, "Wisp"), { skip: true, line: "" }, raw);
});

test("a real line is said, even one that mentions skipping", () => {
  const said = [
    "skip that map, its rough", "hows it going?", "skipping school?", "*waves* skip that map lol",
    "i cant SKIP maps, ask the admins on the RF4U Discord", "nah dont SKIP it, Backrooms is a classic",
    "hey SKIP, hows it going?", "SKIP_3r, welcome back", "nothing much, hbu?", "(jk) nice one",
  ];
  for (const raw of said) {
    const decided = decide(raw, "Wisp");
    assert.equal(decided.skip, false, raw);
    assert.notEqual(decided.line, "", raw);
  }
});

test("an empty reply is unusable, not silence, so the next model is asked", () => {
  assert.deepEqual(decide("", "Wisp"), { skip: false, line: "" });
  assert.deepEqual(decide("\n\n", "Wisp"), { skip: false, line: "" });
});

test("the answer to the hello is named as such, so the model asks how it's going", () => {
  const context = {
    event: "chat", subject: "Sam", firstAnswer: true, humans: ["Sam"], bots: [],
    transcript: [{ name: "Wisp", text: "hey Sam", ghost: true }, { name: "Sam", text: "yo" }],
    playing: null, next: null, mapTitles: [],
  };
  assert.match(promptFor(context), /first line since your hey/);
  assert.match(promptFor(context), /ask how it's going/);
  assert.doesNotMatch(promptFor(context), /SKIP/);
  assert.doesNotMatch(promptFor({ ...context, firstAnswer: false }), /first line since your hey/);
});

// Review 3: in a busy server the model was told a line to somebody else was the answer.
test("with others on, the answer to the hello can still be for somebody else", () => {
  const context = {
    event: "chat", subject: "Sam", firstAnswer: true, humans: ["Sam", "Alex"], bots: [],
    transcript: [{ name: "Wisp", text: "hey Sam", ghost: true }, { name: "Sam", text: "alex wait up" }],
    playing: null, next: null, mapTitles: [],
  };
  assert.match(promptFor(context), /clearly meant for another player, reply SKIP/);
});

test("the ghost is told the server's facts and never to talk to the bots", () => {
  const context = {
    event: "chat",
    subject: "Romortis",
    humans: ["Romortis"],
    bots: ["Dracula"],
    transcript: [
      { name: "Wisp", text: "hey Romortis", ghost: true },
      { name: "Romortis", text: "hi" },
    ],
    playing: "Backrooms",
    next: "RFU2 - Halloween",
    mapTitles: ["Backrooms", "RFU2 - Halloween"],
  };
  const system = personaFor("halloween").system(context);
  assert.match(system, /Playing now: Backrooms/);
  assert.match(system, /RedFaction4You\.com\/halloween/);
  assert.match(system, /never talk to them as if they were players/);
  assert.doesNotMatch(system, /\u2014/);
  const prompt = promptFor(context);
  // The owner's flow: "hey playername", then once they reply, "hows it going".
  assert.match(prompt, /You: hey Romortis\nRomortis: hi/);
  assert.match(promptFor({ ...context, firstAnswer: true }), /ask how it's going/);
  assert.match(system, /chill and relaxed/);
});
