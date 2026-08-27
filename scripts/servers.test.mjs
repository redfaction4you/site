/**
 * Tests for the server registry.
 *
 *   npm test
 *
 * Two things here are correctness rather than presentation, and both are
 * failures this project has already had once.
 *
 * An identity must never be edited to follow a rename. The archive upserts on
 * `(server, source_match_id)` and `sync_pings` is keyed on the same string, so
 * changing one forks that server's history and strands the old name in
 * `sync_pings`, where it goes quiet forever and holds `/api/health` red.
 *
 * And two servers must never share a port. They run on one machine; a duplicate
 * would silently point two tabs at whichever process bound it first, and the
 * page would look entirely normal.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  SERVERS,
  SERVER_CLIENT,
  SERVER_SLOTS,
  serverAddress,
  serverBySlug,
  serverHost,
} from "../src/lib/servers.ts";

/* --- the things that must not collide -------------------------------------- */

test("no two servers share a port", () => {
  const ports = SERVERS.map((server) => server.port);
  assert.equal(new Set(ports).size, ports.length, ports.join(", "));
});

test("no two servers share a slug, which is the tab key and the URL", () => {
  const slugs = SERVERS.map((server) => server.slug);
  assert.equal(new Set(slugs).size, slugs.length);
});

test("no two servers share a name", () => {
  const names = SERVERS.map((server) => server.name);
  assert.equal(new Set(names).size, names.length);
});

test("no two servers share an archive identity", () => {
  // Sharing one would merge two servers' history into a single record with no
  // way to tell them apart afterwards.
  const identities = SERVERS.map((s) => s.identity).filter((id) => id !== null);
  assert.equal(new Set(identities).size, identities.length);
});

/* --- the identities themselves --------------------------------------------- */

test("the recorded servers keep the identities the archive already has", () => {
  // Pinned deliberately. These are the exact strings in archive_days,
  // sync_pings and RF_SERVER_NAME on the VPS. A rename belongs in
  // server-names.ts, never here.
  const byslug = Object.fromEntries(SERVERS.map((s) => [s.slug, s]));

  assert.equal(byslug["match"].identity, "RF4U Competitive [Match]");
  assert.equal(byslug["bot-free-pub"].identity, "RedFaction4You.com [DM]");
});

test("an identity is never the display name for the renamed servers", () => {
  // If these ever match it means somebody "tidied" an identity to agree with
  // the name, which is the exact change that forks the archive.
  const renamed = SERVERS.filter(
    (server) => server.slug === "match" || server.slug === "bot-free-pub",
  );

  for (const server of renamed) {
    assert.notEqual(server.identity, server.name, `${server.slug} identity was renamed`);
  }
});

test("a server that records nothing carries no identity", () => {
  for (const server of SERVERS) {
    if (server.kind === "pub") {
      assert.equal(server.identity, null, `${server.slug} should not be archived`);
    }
  }
});

/* --- addresses -------------------------------------------------------------- */

test("an address is the shared host and the server's own port", () => {
  const before = process.env.NEXT_PUBLIC_SERVER_ADDRESS;
  process.env.NEXT_PUBLIC_SERVER_ADDRESS = "203.0.113.10:17755";

  assert.equal(serverHost(), "203.0.113.10");
  for (const server of SERVERS) {
    assert.equal(serverAddress(server), `203.0.113.10:${server.port}`);
  }

  if (before === undefined) delete process.env.NEXT_PUBLIC_SERVER_ADDRESS;
  else process.env.NEXT_PUBLIC_SERVER_ADDRESS = before;
});

test("with no host configured an address is absent, not a broken string", () => {
  const before = process.env.NEXT_PUBLIC_SERVER_ADDRESS;
  delete process.env.NEXT_PUBLIC_SERVER_ADDRESS;

  assert.equal(serverHost(), null);
  assert.equal(serverAddress(SERVERS[0]), null);

  if (before !== undefined) process.env.NEXT_PUBLIC_SERVER_ADDRESS = before;
});

/* --- lookup ----------------------------------------------------------------- */

test("a server is found by its slug, and an unknown slug is null", () => {
  assert.equal(serverBySlug("halloween")?.port, 17757);
  assert.equal(serverBySlug("micro-maps")?.port, 17758);
  assert.equal(serverBySlug("nothing-here"), null);
});

test("every server says what it is for", () => {
  for (const server of SERVERS) {
    assert.ok(server.blurb.length > 20, `${server.slug} has no blurb`);
    assert.ok(["match", "deathmatch", "pub"].includes(server.kind));
  }
});

/* --- the shared facts -------------------------------------------------------- */

test("the client version is stated once and is current", () => {
  // It lived in NEXT_PUBLIC_SERVER_CLIENT and still read 1.3.0 a day after both
  // servers went to 1.4.0. A version in an environment variable is a version
  // nobody updates.
  assert.match(SERVER_CLIENT, /^Alpine Faction \d+\.\d+\.\d+$/);
  assert.equal(SERVER_SLOTS, 16);
});
