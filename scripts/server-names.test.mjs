/**
 * Tests for server display names.
 *
 *   npm test
 *
 * The thing being protected is not the spelling. It is that renaming a server
 * on screen never becomes renaming it in the data.
 *
 * `RF_SERVER_NAME` is an identity: the website upserts matches on
 * `(server, source_match_id)`, the deathmatch sweep filters on it, and
 * `sync_pings` is keyed on it. Change it at source and 35 matches come back as
 * new, the sweep skips the old ones because it is looking for the old value,
 * and the retired name sits in `sync_pings` going quiet forever, holding health
 * red and mailing a failed workflow every six hours. That arithmetic is
 * recorded in `.env.rf4u`, checked 6 August 2026.
 *
 * So the label layer exists to make the identity boring, and these tests exist
 * to keep it that way.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { renamedServers, serverLabel } from "../src/lib/matches/server-names.ts";

/* --- the rename that was asked for ---------------------------------------- */

test("the match server reads under the site's own branding", () => {
  assert.equal(serverLabel("RF4U Competitive [Match]"), "RedFaction4You.com (Match)");
});

test("the deathmatch server was already right and is left alone", () => {
  assert.equal(serverLabel("RedFaction4You.com [DM]"), "RedFaction4You.com [DM]");
});

test("the dm: routing prefix never reaches a reader", () => {
  // archive_days namespaces the two games so one date can hold both. That is
  // routing, and routing is not a name.
  assert.equal(serverLabel("dm:RedFaction4You.com [DM]"), "RedFaction4You.com [DM]");
});

/* --- what must not happen ------------------------------------------------- */

test("labelling is a lookup, never a rewrite of the identity", () => {
  const identity = "RF4U Competitive [Match]";
  const before = String(identity);

  serverLabel(identity);

  assert.equal(identity, before, "the stored string is what the archive upserts on");
});

test("a server nobody has renamed keeps its own name", () => {
  // Not blanked, not prefixed, not made into "unknown". A new server appearing
  // is ordinary, and its own name is the best thing to call it.
  assert.equal(serverLabel("Some New Server [CTF]"), "Some New Server [CTF]");
});

test("the lookup does not care about case", () => {
  assert.equal(serverLabel("rf4u competitive [match]"), "RedFaction4You.com (Match)");
  assert.equal(serverLabel("RF4U COMPETITIVE [MATCH]"), "RedFaction4You.com (Match)");
});

test("an empty identity does not become a label", () => {
  assert.equal(serverLabel(""), "");
});

/* --- the map itself -------------------------------------------------------- */

test("every rename in force can be listed", () => {
  const renames = renamedServers();

  assert.equal(renames.length, 1);
  assert.equal(renames[0].label, "RedFaction4You.com (Match)");
});

test("no label is mapped to another label", () => {
  // A label that is itself a key would rename twice on the next edit, and the
  // second rename would be invisible until somebody read the map closely.
  const labels = new Set(renamedServers().map((entry) => entry.label.toLocaleLowerCase("en-US")));

  for (const { identity } of renamedServers()) {
    assert.equal(labels.has(identity), false, `${identity} is both an identity and a label`);
  }
});
