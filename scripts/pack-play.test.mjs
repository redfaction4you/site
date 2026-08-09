/**
 * A map pack against what the deathmatch server actually recorded.
 *
 * The case worth guarding is the accusation. The server drops a rotation map it
 * cannot download and says nothing, so a pack entry with no play against it is
 * the only signal there is — and it is also exactly what a pack switched on ten
 * minutes ago looks like. Getting that wrong puts "the server may have dropped
 * this" under every map on a page that is working perfectly.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { packPlay, playKey } from "../src/lib/dm/pack-play.ts";

const played = (rounds) => ({
  rounds,
  secondsPlayed: rounds * 300,
  kills: rounds * 40,
  players: 3,
  lastPlayed: "2026-08-09",
});

const RECORDED = new Map([
  ["badlands", played(1)],
  ["glass house", played(1)],
  ["the lobby", played(2)],
]);

test("an entry is matched on its title, not its filename", () => {
  const [entry] = packPlay([{ filename: "dm04.rfl", title: "Badlands" }], RECORDED);
  assert.equal(entry.play?.rounds, 1);
  assert.equal(entry.missing, false);
});

test("the filename alone matches nothing, and is never accused", () => {
  // Enough rounds that a titled entry with nothing on it would be flagged, so
  // this is testing the untitled exemption rather than the round threshold.
  const [entry] = packPlay(
    [{ filename: "the_lobby.rfl" }, { filename: "c.rfl", title: "The Lobby" }],
    RECORDED,
  );
  assert.equal(entry.play, null);
  // Untitled is unknown, not missing: dm_rounds never holds a filename, so
  // flagging it would accuse every such entry the moment a sibling was played.
  assert.equal(entry.missing, false);
});

test("an unplayed map is flagged once the rotation has had the chance to reach it", () => {
  const results = packPlay(
    [
      { filename: "c.rfl", title: "The Lobby" }, // 2 rounds, so 2 for a 2-map pack
      { filename: "dm07.rfl", title: "High Rise" },
    ],
    RECORDED,
  );
  assert.equal(results[0].missing, false);
  assert.equal(results[1].play, null);
  assert.equal(results[1].missing, true);
});

test("one round does not accuse the rest of the pack", () => {
  // The real case, 9 August: Stock Favourites had been on for an evening and
  // exactly one round had been recorded, on one of its three maps. The other
  // two are unplayed, not missing, and saying otherwise trains a reader to
  // ignore the warning by the time it means something.
  const results = packPlay(
    [
      { filename: "dm04.rfl", title: "Badlands" },
      { filename: "dm07.rfl", title: "High Rise" },
      { filename: "glass_house.rfl", title: "Glass House" },
    ],
    new Map([["glass house", played(1)]]),
  );
  assert.deepEqual(
    results.map((r) => r.missing),
    [false, false, false],
  );
});

test("a pack nobody has played yet accuses nothing", () => {
  const results = packPlay(
    [
      { filename: "a.rfl", title: "Untouched" },
      { filename: "b.rfl", title: "Also Untouched" },
    ],
    new Map(),
  );
  assert.deepEqual(
    results.map((r) => r.missing),
    [false, false],
  );
});

test("a recorded map with zero rounds counts as no play", () => {
  const results = packPlay(
    [
      { filename: "c.rfl", title: "The Lobby" },
      { filename: "b.rfl", title: "Empty" },
    ],
    new Map([...RECORDED, ["empty", played(0)]]),
  );
  assert.equal(results[1].missing, true);
});

test("case and inner spacing do not decide whether a map was played", () => {
  assert.equal(playKey("  Glass   House "), "glass house");
  const [entry] = packPlay([{ filename: "gh.rfl", title: "GLASS  HOUSE" }], RECORDED);
  assert.equal(entry.play?.rounds, 1);
});

test("results come back in the pack's own order", () => {
  const results = packPlay(
    [
      { filename: "c.rfl", title: "The Lobby" },
      { filename: "a.rfl", title: "Badlands" },
    ],
    RECORDED,
  );
  assert.deepEqual(
    results.map((r) => r.play?.rounds),
    [2, 1],
  );
});
