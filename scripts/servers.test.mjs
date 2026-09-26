/**
 * Tests for the server registry.
 *
 *   npm test
 *
 * Two servers must never share a port. They run on one machine; a duplicate
 * would silently point two tabs at whichever process bound it first, and the
 * page would look entirely normal.
 *
 * And every server must run a pack. A server page is its rotation and the map
 * playing now; a server with no pack is a page with nothing on it, and the
 * first server in the list is where `/servers` lands.
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

/* --- rotations ---------------------------------------------------------------- */

test("every server runs a pack", () => {
  for (const server of SERVERS) {
    assert.equal(typeof server.packSlug, "string", `${server.slug} has no pack`);
    assert.ok(server.packSlug.length > 0, `${server.slug} has an empty pack slug`);
  }
});

test("the server /servers lands on has a rotation to show", () => {
  // The Match server led this list and ran no pack, so the landing tab was the
  // one page with no map list on it. It was switched off on 25 September 2026;
  // this keeps anything like it from coming back as the first tab.
  assert.ok(SERVERS.length > 0);
  assert.ok(SERVERS[0].packSlug, `${SERVERS[0].slug} leads but runs no pack`);
});

test("the Match server is gone from the list, not hidden in it", () => {
  assert.equal(serverBySlug("match"), null);
  assert.ok(!SERVERS.some((server) => server.port === 17755));
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
  assert.equal(serverBySlug("novelty")?.port, 17757);
  assert.equal(serverBySlug("themed")?.port, 17756);
  assert.equal(serverBySlug("halloween")?.port, 17758);
  assert.equal(serverBySlug("nothing-here"), null);
});

test("every server says what it is for", () => {
  for (const server of SERVERS) {
    assert.ok(server.blurb.length > 20, `${server.slug} has no blurb`);
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

/* --- the welcome messages ---------------------------------------------------- */

/**
 * The link each message ends on.
 *
 * Only the first path segment is captured, which is all that decides where
 * somebody lands.
 */
const WELCOME_LINK = /RedFaction4You\.com\/([a-z]+)/;

/**
 * Servers whose welcome deliberately carries no link.
 *
 * Halloween's is the owner's seasonal text, stored in `map_packs` and mirrored
 * in `servers.ts` character for character so that `apply:welcome` never
 * overwrites it. Anything added here should be as deliberate, because a
 * welcome with no link is one a newcomer cannot follow anywhere.
 */
const NO_LINK = new Set(["halloween"]);

test("every server tells a newcomer where to find it", () => {
  for (const server of SERVERS) {
    if (NO_LINK.has(server.slug)) continue;
    assert.match(server.welcome, WELCOME_LINK, `${server.slug} carries no link`);
  }
});

test("a welcome with a link sends people to that server's own page", () => {
  /*
   * This is the failure, not a hypothetical one.
   *
   * The Novelty and Halloween configs were built by copying the Themed one,
   * and both went live announcing the Themed server's map count. A message is
   * the one thing here nothing else can contradict: the page is right, the
   * rotation is right, and the server still says the wrong thing to everybody
   * who joins it.
   */
  for (const server of SERVERS) {
    const landing = server.welcome.match(WELCOME_LINK)?.[1];
    if (!landing) continue;
    assert.equal(landing, server.slug, `${server.slug} sends people to /${landing}`);
  }
});

test("no welcome promises stats any more", () => {
  // RF4U stopped recording on 25 September 2026. A server telling everybody
  // who joins that their play is recorded and ranked would be untrue on arrival.
  for (const server of SERVERS) {
    assert.doesNotMatch(server.welcome, /record|ranked|standings|stats/i, server.slug);
  }
});

test("a welcome is one line the 2001 font can draw", () => {
  for (const server of SERVERS) {
    // Printable ASCII only. This is also what catches an em dash or a curly
    // quote arriving from a browser: asciiForGame would drop them on the way
    // to the server, so the message stored here would stop matching the one
    // people read.
    assert.match(server.welcome, /^[\x20-\x7e]+$/, server.slug);
    assert.ok(server.welcome.length <= 200, `${server.slug} is too long`);
  }
});
