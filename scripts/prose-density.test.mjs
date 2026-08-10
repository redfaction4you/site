/**
 * Whether a feature reads as a scoreboard.
 *
 * The fixture is real. A feature was commissioned about two players finally
 * sharing a side after twenty-four matches as opponents, and the middle of it
 * came back as both scoreboards read out line by line — every player, both
 * teams, frags, deaths, pickups, hold times. A reader said so: "2 paragraphs
 * are mostly just repeating the stats... it loses its entire plot."
 *
 * Measured, those paragraphs carry 29 and 22 figures. The opening paragraph of
 * the same piece, which is doing its job, carries 2, and a piece that argues
 * runs to about 1. The limit is 12, which is nowhere near either of them: this
 * is not a fine judgement about style, it is a table with sentences around it.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  FEATURE_FIGURE_LIMITS,
  countFigures,
  densityOf,
  scoreboardComplaint,
} from "../src/lib/ai/prose-density.ts";

/* --- the reported piece --------------------------------------------------- */

const SCOREBOARD_PARAGRAPH =
  "The first outing was Match 46 on Huna b8, which ended in a 2 to 0 victory " +
  "for Red over Blue. EasyOnMe opened the scoring for Red at 6:40 to make it " +
  "1-0, before Medeo secured the second capture at 7:19 to establish the 2-0 " +
  "result. Medeo held the flag for 83 seconds across 17 pickups and finished " +
  "with 30 frags and 49 deaths. ED ASSMASTER provided frontline support with " +
  "48 frags and 44 deaths, holding the flag for 10 seconds over 3 pickups with " +
  "a best streak of 7. EasyOnMe also registered 48 frags, 36 deaths, and 1 " +
  "capture, holding the flag for 5 seconds over 4 pickups. Blue was led in " +
  "frags by J!nX with 53 frags and 31 deaths, SiD with 45 frags and 42 deaths, " +
  "and Haze202 with 30 frags and 53 deaths.";

const OPENING_PARAGRAPH =
  "After facing each other 24 times as opponents, ED ASSMASTER and Medeo " +
  "finally shared the same side across 2 recorded matches. On a server where " +
  "top players are split to keep games balanced, pairing ED ASSMASTER, a " +
  "long-time defender, alongside Medeo, a dedicated flag carrier, created a " +
  "distinct lineup.";

test("the paragraph a reader objected to is well over the limit", () => {
  const figures = countFigures(SCOREBOARD_PARAGRAPH);
  assert.ok(
    figures > FEATURE_FIGURE_LIMITS.perParagraph * 2,
    `expected a scoreboard, got ${figures} figures`,
  );
});

test("the opening paragraph of the same piece is fine", () => {
  // It carries two numbers and both are the story: twenty-four matches as
  // opponents, two together. Numbers are not the problem.
  assert.ok(countFigures(OPENING_PARAGRAPH) <= FEATURE_FIGURE_LIMITS.perParagraph);
});

test("one scoreboard paragraph condemns the piece, however good the rest is", () => {
  const body = [OPENING_PARAGRAPH, SCOREBOARD_PARAGRAPH, OPENING_PARAGRAPH].join(
    "\n\n",
  );
  const complaint = scoreboardComplaint(body);
  assert.ok(complaint, "expected a complaint");
  assert.match(complaint, /scoreboard/);
});

test("a piece that argues passes", () => {
  const body = [
    "Twenty-four times these two lined up against each other before anybody " +
      "thought to put them on the same side. That is not an accident on this " +
      "server, where the strongest are split deliberately to keep a game worth " +
      "playing, and it is the reason the pairing kept not happening.",
    "Medeo spent 133 seconds holding a flag in one match, roughly three times " +
      "what he manages on an ordinary night, and he did it because ED ASSMASTER " +
      "was busy making the middle of Breach unusable. That is the argument for " +
      "the pairing, and it took two games to make it.",
    "Whether it means anything is another question. Two matches is two matches, " +
      "and both came against a Blue side missing its best player.",
  ].join("\n\n");

  assert.equal(scoreboardComplaint(body), null);
});

/* --- how figures are counted ---------------------------------------------- */

test("a clock and a scoreline each read as one figure, not two", () => {
  assert.equal(countFigures("capped at 6:40 to make it 2-0"), 2);
});

test("a decimal or a percentage is one figure", () => {
  assert.equal(countFigures("18.5% accuracy"), 1);
});

test("numbers written as words are not counted, because that is the writing working", () => {
  assert.equal(countFigures("twice his usual, across two dozen meetings"), 0);
});

test("the worst paragraph is reported, not the average", () => {
  // The failure is local: a good piece with one dump in the middle is exactly
  // the shape that was reported, and an average hides it.
  const body = ["No figures here at all.", SCOREBOARD_PARAGRAPH, "Nor here."].join(
    "\n\n",
  );
  const density = densityOf(body, FEATURE_FIGURE_LIMITS.perParagraph);
  assert.equal(density.offenders, 1);
  assert.ok(density.worstParagraph > 20);
});
