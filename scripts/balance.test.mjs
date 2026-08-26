/**
 * Tests for the team balance measure.
 *
 *   npm test
 *
 * Two things here are correctness rather than presentation.
 *
 * A projection must be all or nothing. Rating a side of three on the two who
 * have history produces a confident number about a side that did not play, and
 * it would be printed with the same weight as a complete one.
 *
 * And a projection only counts as borne out when it pointed at the side that
 * actually dominated. Counting a lopsided match as predicted while the model
 * favoured the losing side is how a measure comes to look better than it is,
 * which is the failure this whole module was shaped around: the first measure
 * tried got the direction right 49% of the time.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  LOPSIDED_SHARE,
  MIN_MATCHES_FOR_PROJECTION,
  UNEVEN_ON_PAPER,
  assessMatch,
  assessNight,
  shareAsPercent,
} from "../src/lib/matches/balance.ts";

/** A match built from two frag counts, split evenly across three a side. */
function match({ redFrags = 90, blueFrags = 90, redScore = 3, blueScore = 2, red = 3, blue = 3 } = {}) {
  const players = [];
  for (let i = 0; i < red; i++) {
    players.push({ name: `red${i}`, team: "red", kills: redFrags / red, deaths: 30 });
  }
  for (let i = 0; i < blue; i++) {
    players.push({ name: `blue${i}`, team: "blue", kills: blueFrags / blue, deaths: 30 });
  }
  return {
    matchId: "m1",
    mapName: "Huna b8",
    redScore,
    blueScore,
    winner: redScore > blueScore ? "red" : "blue",
    players,
  };
}

/** Prior form for everybody named, at a given frags-per-death. */
function form(entries) {
  const map = new Map();
  for (const [name, rate, matches = 10] of entries) {
    map.set(name.toLocaleLowerCase("en-US"), { matches, kills: rate * 100, deaths: 100 });
  }
  return map;
}

const EVEN_SIDES = form([
  ["red0", 1], ["red1", 1], ["red2", 1],
  ["blue0", 1], ["blue1", 1], ["blue2", 1],
]);

/* --- what happened, which is arithmetic ---------------------------------- */

test("an even fight is even whatever the flag score said", () => {
  // The real shape from 11 August: frags 72-73, flags 2-6. The scoreline was a
  // thrashing and the fight was not, and the fight is what is being measured.
  const balance = assessMatch(match({ redFrags: 72, blueFrags: 73, redScore: 2, blueScore: 6 }));

  assert.equal(balance.oneSided, false);
  assert.equal(balance.verdict, "unknown", "no history, so no view on how it looked");
  assert.ok(balance.fragShare < 0.51);
});

test("a one-sided fight is one-sided whatever the flag score said", () => {
  // And the mirror, from 6 August: frags 128-63, flags 5-3. Won by two, but one
  // side took two thirds of the kills.
  const balance = assessMatch(match({ redFrags: 128, blueFrags: 63, redScore: 5, blueScore: 3 }));

  assert.equal(balance.oneSided, true);
  assert.equal(balance.strongerSide, "red");
  assert.ok(balance.fragShare > 0.66);
});

test("the share is of all frags, and reads as a split", () => {
  const balance = assessMatch(match({ redFrags: 120, blueFrags: 60 }));

  assert.equal(Math.round(balance.fragShare * 100), 67);
  assert.equal(shareAsPercent(balance), "67/33");
});

test("a shutout is recorded but is not by itself a blowout", () => {
  // 0-1 happens constantly here. Captures are scarce; being kept off the board
  // is not the same as being farmed.
  const balance = assessMatch(match({ redFrags: 88, blueFrags: 90, redScore: 0, blueScore: 1 }));

  assert.equal(balance.shutout, true);
  assert.equal(balance.oneSided, false);
});

test("unequal numbers are their own complaint", () => {
  const balance = assessMatch(match({ red: 3, blue: 2 }));

  assert.equal(balance.sidesUneven, true);
  assert.equal(balance.redCount, 3);
  assert.equal(balance.blueCount, 2);
});

test("a match nobody scored a frag in does not divide by zero", () => {
  const balance = assessMatch(match({ redFrags: 0, blueFrags: 0 }));

  assert.equal(balance.fragShare, 0.5);
  assert.equal(balance.strongerSide, null);
  assert.equal(balance.oneSided, false);
});

/* --- how it looked beforehand, which is a projection ---------------------- */

test("evenly matched sides do not look uneven", () => {
  const balance = assessMatch(match(), EVEN_SIDES);

  assert.equal(balance.lookedUneven, false);
  assert.equal(balance.projectedGap, 0);
  assert.equal(balance.verdict, "even");
});

test("a side stacked on paper is flagged before the result is looked at", () => {
  const stacked = form([
    ["red0", 2], ["red1", 2], ["red2", 2],
    ["blue0", 1], ["blue1", 1], ["blue2", 1],
  ]);
  // Deliberately a close game: the flag is about how it looked, not how it went.
  const balance = assessMatch(match({ redFrags: 90, blueFrags: 88 }), stacked);

  assert.equal(balance.lookedUneven, true);
  assert.equal(balance.projectedGap, 1);
  assert.equal(balance.verdict, "closer-than-it-looked");
});

test("uneven on paper and one-sided in play is the predictable case", () => {
  const stacked = form([
    ["red0", 2], ["red1", 2], ["red2", 2],
    ["blue0", 1], ["blue1", 1], ["blue2", 1],
  ]);
  const balance = assessMatch(match({ redFrags: 140, blueFrags: 60 }), stacked);

  assert.equal(balance.verdict, "predictable");
});

test("a lopsided match the projection pointed the wrong way is not predicted", () => {
  // The guard that stops the measure flattering itself. Blue was favoured and
  // red ran away with it, so this is an upset, not a successful call.
  const stacked = form([
    ["red0", 1], ["red1", 1], ["red2", 1],
    ["blue0", 2], ["blue1", 2], ["blue2", 2],
  ]);
  const balance = assessMatch(match({ redFrags: 140, blueFrags: 60 }), stacked);

  assert.equal(balance.lookedUneven, true);
  assert.equal(balance.oneSided, true);
  assert.equal(balance.verdict, "one-sided", "the favoured side lost, so nothing was foreseen");
});

test("a gap just under the bar is not remarked on", () => {
  const narrow = form([
    ["red0", 1 + UNEVEN_ON_PAPER - 0.01], ["red1", 1], ["red2", 1],
    ["blue0", 1], ["blue1", 1], ["blue2", 1],
  ]);
  // One player above by a shade under the bar, averaged over three, is well under.
  assert.equal(assessMatch(match(), narrow).lookedUneven, false);
});

/* --- the all-or-nothing rule --------------------------------------------- */

test("one unrated player withholds the whole projection", () => {
  const partial = form([
    ["red0", 2], ["red1", 2],
    ["blue0", 1], ["blue1", 1], ["blue2", 1],
  ]);
  // red2 is missing entirely.
  const balance = assessMatch(match(), partial);

  assert.equal(balance.projectedGap, null);
  assert.equal(balance.lookedUneven, false);
});

test("a player short of the qualifying bar counts as unrated", () => {
  const green = form([
    ["red0", 2], ["red1", 2], ["red2", 2, MIN_MATCHES_FOR_PROJECTION - 1],
    ["blue0", 1], ["blue1", 1], ["blue2", 1],
  ]);

  assert.equal(assessMatch(match(), green).projectedGap, null);
});

test("with no history at all there is no view, and the night is still measured", () => {
  const balance = assessMatch(match({ redFrags: 140, blueFrags: 60 }));

  assert.equal(balance.projectedGap, null);
  assert.equal(balance.oneSided, true, "what happened is still known");
  assert.equal(balance.verdict, "one-sided");
});

test("somebody who has never died is strong, not infinite", () => {
  const deathless = new Map([
    ["red0", { matches: 10, kills: 50, deaths: 0 }],
    ["red1", { matches: 10, kills: 100, deaths: 100 }],
    ["red2", { matches: 10, kills: 100, deaths: 100 }],
    ["blue0", { matches: 10, kills: 100, deaths: 100 }],
    ["blue1", { matches: 10, kills: 100, deaths: 100 }],
    ["blue2", { matches: 10, kills: 100, deaths: 100 }],
  ]);
  const gap = assessMatch(match(), deathless).projectedGap;

  assert.ok(Number.isFinite(gap), "a divide by zero must not reach a page");
});

/* --- the night ----------------------------------------------------------- */

test("a night counts what it was, and names the worst of it", () => {
  const night = assessNight([
    { ...match({ redFrags: 90, blueFrags: 88 }), matchId: "a", mapName: "Ankh b12" },
    { ...match({ redFrags: 140, blueFrags: 60 }), matchId: "b", mapName: "Huna b8" },
    { ...match({ redFrags: 130, blueFrags: 70 }), matchId: "c", mapName: "Relic Seeker" },
  ]);

  assert.equal(night.played, 3);
  assert.equal(night.oneSided, 2);
  assert.equal(night.worst.matchId, "b", "the most lopsided, not the first one found");
  assert.equal(night.worst.mapName, "Huna b8");
});

test("a night of good games says so rather than reaching for a worst", () => {
  const night = assessNight([
    match({ redFrags: 90, blueFrags: 88 }),
    match({ redFrags: 80, blueFrags: 84 }),
  ]);

  assert.equal(night.oneSided, 0);
  assert.equal(night.worst, null);
  assert.equal(night.predictable, 0);
});

test("an empty night is not an error", () => {
  const night = assessNight([]);

  assert.equal(night.played, 0);
  assert.equal(night.oneSided, 0);
  assert.equal(night.worst, null);
});

/* --- the bars themselves -------------------------------------------------- */

test("the bars are where the archive put them", () => {
  // Pinned so a later tweak has to be deliberate. The median winner takes 54%
  // of the frags and the worst on record is 67%, which is what makes 60 the
  // edge of ordinary rather than a round number somebody liked.
  assert.equal(LOPSIDED_SHARE, 0.6);
  assert.equal(UNEVEN_ON_PAPER, 0.25);
  assert.equal(MIN_MATCHES_FOR_PROJECTION, 5);
});

test("the bar is a floor, not a gap above it", () => {
  const exactly = assessMatch(match({ redFrags: 120, blueFrags: 80 }));

  assert.equal(exactly.fragShare, LOPSIDED_SHARE);
  assert.equal(exactly.oneSided, true);
});
