/**
 * Tests for whether the sync is alive.
 *
 *   npm test
 *
 * This rule replaced one that had been quietly wrong for a day. Health answered
 * "is the VPS syncing" with `max(matches.ingested_at)`, which was the same
 * question until unchanged days stopped being rewritten on 6 August. After that
 * a quiet afternoon wrote nothing, so the newest timestamp sat still, so the
 * endpoint answered 503 and `vet-live` failed every six hours while the VPS
 * synced perfectly every fifteen minutes and said `unchanged` in its own log.
 *
 * The replacement has its own way of being wrong, and it is the one worth
 * testing: with two servers reporting, judging on the newest ping means either
 * one can cover for the other going dark.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { quietSince } from "../src/lib/sync-freshness.ts";

const NOW = new Date("2026-08-07T12:00:00.000Z").getTime();
const ago = (minutes) => new Date(NOW - minutes * 60_000);

const MATCH = "RF4U Competitive [Match]";
const DM = "RedFaction4You.com [DM]";

test("a server heard from recently is not reported", () => {
  const quiet = quietSince([{ server: MATCH, lastSeenAt: ago(4) }], 45, NOW);
  assert.deepEqual(quiet, []);
});

test("a server that has gone quiet is reported by name", () => {
  const quiet = quietSince([{ server: MATCH, lastSeenAt: ago(190) }], 45, NOW);
  assert.deepEqual(quiet, [{ server: MATCH, minutesAgo: 190 }]);
});

test("one server cannot cover for another going dark", () => {
  /*
   * The failure this rule exists for. Deathmatch syncing every fifteen minutes
   * while the match server has been silent for three hours is a broken archive,
   * and reading only the newest ping across both would call it healthy.
   */
  const quiet = quietSince(
    [
      { server: DM, lastSeenAt: ago(3) },
      { server: MATCH, lastSeenAt: ago(180) },
    ],
    45,
    NOW,
  );

  assert.equal(quiet.length, 1);
  assert.equal(quiet[0].server, MATCH);
});

test("the longest silence is reported first", () => {
  const quiet = quietSince(
    [
      { server: DM, lastSeenAt: ago(60) },
      { server: MATCH, lastSeenAt: ago(600) },
    ],
    45,
    NOW,
  );

  assert.deepEqual(
    quiet.map((entry) => entry.server),
    [MATCH, DM],
  );
});

test("nothing recorded reports nothing, rather than reporting a fault", () => {
  // A fresh deployment has never been synced, which is not the same as a sync
  // that has stopped. Health falls back to the old reading while this is empty.
  assert.deepEqual(quietSince([], 45, NOW), []);
});

test("the threshold is exclusive, so a sync exactly on it is still alive", () => {
  assert.deepEqual(quietSince([{ server: MATCH, lastSeenAt: ago(45) }], 45, NOW), []);
  assert.equal(quietSince([{ server: MATCH, lastSeenAt: ago(46) }], 45, NOW).length, 1);
});
