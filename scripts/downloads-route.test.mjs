/**
 * The pure half of `/api/download/[fileId]`.
 *
 * The route itself cannot be tested here: it reads a file row through Drizzle
 * and there is no database in `node --test`. What can be tested is the thing it
 * branches on, `publicUrl`, and that branch is the whole difference between an
 * honest 503 and a 302 pointing at a URL assembled from a missing base. Sending
 * somebody to `undefined/maps/ctfwlpro.zip` is the exact failure the guard
 * exists to prevent, and it would only ever show up on a machine that is not
 * the one running the tests.
 *
 * The join is worth pinning too. A stored key with a leading slash against a
 * base with a trailing one produces `//` in the middle of the path, which some
 * origins serve and R2 does not, so the download 404s for reasons nothing in
 * the page can explain. Both halves are normalised and both directions are
 * checked here.
 *
 * `storage.ts` reads the environment once at module load, which is why each
 * case imports it afresh with a distinct query string: a plain second import
 * would hand back the first module instance and quietly test nothing.
 */
import test from "node:test";
import assert from "node:assert/strict";

/* Imported before anything sets the variable, so this is the unconfigured one. */
delete process.env.NEXT_PUBLIC_R2_PUBLIC_BASE;
const unconfigured = await import("../src/lib/storage.ts?unconfigured");

process.env.NEXT_PUBLIC_R2_PUBLIC_BASE = "https://files.redfaction4you.com";
const configured = await import("../src/lib/storage.ts?configured");

process.env.NEXT_PUBLIC_R2_PUBLIC_BASE = "https://files.redfaction4you.com///";
const trailingSlashes = await import("../src/lib/storage.ts?trailing");

/* --- the 503 branch ------------------------------------------------------- */

test("with no bucket domain the route has nothing to redirect to", () => {
  assert.equal(unconfigured.storageConfigured, false);
  assert.equal(unconfigured.publicUrl("maps/ctfwlpro.zip"), null);
});

test("null rather than a string, so a caller cannot use it by accident", () => {
  /*
   * The type says `string | null` and TypeScript enforces the check, but this
   * file is the one place the runtime value is looked at directly. An empty
   * string would satisfy a truthiness test in the wrong direction on any code
   * path that ever loses its types, and `Location: ""` is a redirect to the
   * request's own URL, which loops.
   */
  const url = unconfigured.publicUrl("maps/ctfwlpro.zip");
  assert.equal(url, null);
  assert.notEqual(url, "");
});

/* --- the 302 branch ------------------------------------------------------- */

test("a configured base joins onto the key with exactly one slash", () => {
  assert.equal(configured.storageConfigured, true);
  assert.equal(
    configured.publicUrl("maps/ctf/ctfwlpro.zip"),
    "https://files.redfaction4you.com/maps/ctf/ctfwlpro.zip",
  );
});

test("a leading slash on the stored key does not double up", () => {
  assert.equal(
    configured.publicUrl("/maps/ctf/ctfwlpro.zip"),
    "https://files.redfaction4you.com/maps/ctf/ctfwlpro.zip",
  );
});

test("trailing slashes on the base do not double up either", () => {
  assert.equal(
    trailingSlashes.publicUrl("maps/ctf/ctfwlpro.zip"),
    "https://files.redfaction4you.com/maps/ctf/ctfwlpro.zip",
  );
  assert.equal(
    trailingSlashes.publicUrl("///maps/ctf/ctfwlpro.zip"),
    "https://files.redfaction4you.com/maps/ctf/ctfwlpro.zip",
  );
});

test("the result is a URL a browser can be sent to", () => {
  /*
   * `Location` on a 302 is parsed by the browser, so a value that is not a URL
   * fails in the one place nothing is watching. Parsing it here is the cheapest
   * possible check that the join produced an address rather than a string.
   */
  const url = new URL(configured.publicUrl("maps/ctf/ctf-HunaB8.zip"));
  assert.equal(url.protocol, "https:");
  assert.equal(url.hostname, "files.redfaction4you.com");
  assert.equal(url.pathname, "/maps/ctf/ctf-HunaB8.zip");
});

test("the key's case and punctuation survive the join", () => {
  /*
   * Real filenames from the match rotation. R2 keys are case sensitive, so a
   * join that lowercased or stripped anything would 404 on exactly the maps
   * people actually want, and only on those.
   */
  for (const key of [
    "maps/ctf/CTF-BTN-SGorge-Mini_v21.zip",
    "maps/ctf/Ctf-WL-Rail.zip",
    "assets/models/T1k}super.vpp",
  ]) {
    assert.equal(
      configured.publicUrl(key),
      `https://files.redfaction4you.com/${key}`,
      key,
    );
  }
});
