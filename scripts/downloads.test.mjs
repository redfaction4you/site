/**
 * The downloads rules, tested against filenames the servers actually run.
 *
 * Every one of these fails silently in production if it goes wrong. A map filed
 * under the wrong game type sits on the wrong shelf forever and nothing about
 * the page looks broken; a bare `run` prefix quietly reclassifies every map
 * named "runway"; a sort value off a stranger's URL that is not handled throws
 * on a page that should simply show the default listing.
 *
 * The fixtures are real. They are taken from the live match rotation and the
 * Themed pack in `rf4u-match.toml` and `rf4u-dm.toml` on the VPS, because
 * invented filenames are tidy in exactly the ways real ones are not.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  ASSET_CATEGORIES,
  MAP_CATEGORIES,
  SECTIONS,
  SECTION_BY_KIND,
  categoryFromLevelName,
  categoryFromLevels,
  categoryOf,
  displayVersion,
  parseSort,
  sectionByRoute,
} from "../src/lib/downloads.ts";

/* --- one level's game type ------------------------------------------------ */

test("real CTF filenames read as CTF", () => {
  for (const name of [
    "ctfwlpro.rfl",
    "ctf-ankhb12.rfl",
    "ctf-HunaB8.rfl",
    "CTF-BTN-SGorge-Mini_v21.rfl",
    "ctfrelicseeker.rfl",
    "CTF_RailFight.rfl",
    "Ctf-WL-Rail.rfl",
    "ctfdarkwl.rfl",
  ]) {
    assert.equal(categoryFromLevelName(name), "ctf", name);
  }
});

test("real deathmatch filenames read as DM, whatever the punctuation", () => {
  for (const name of [
    "dm04.rfl",
    "dm-rfu2-finding-nemo.rfl",
    "DMFMStones.rfl",
    "DM-GreenHillZone.rfl",
    "dm_thelongestyard.rfl",
    "DM - Stargate.rfl",
    "dm DaC mario.rfl",
    "Dm-wolf3d.rfl",
  ]) {
    assert.equal(categoryFromLevelName(name), "dm", name);
  }
});

test("real Damage Control filenames read as DC", () => {
  for (const name of [
    "dc_FragglemoreIslands.rfl",
    "DC-Doomsdayb1.rfl",
    "dcBLERD_RERNERv1.rfl",
  ]) {
    assert.equal(categoryFromLevelName(name), "dc", name);
  }
});

test("the p-prefixed variants the game recognises are not a separate type", () => {
  assert.equal(categoryFromLevelName("pctf-something.rfl"), "ctf");
  assert.equal(categoryFromLevelName("pdm-something.rfl"), "dm");
});

test("koth is read", () => {
  assert.equal(categoryFromLevelName("koth-tower.rfl"), "koth");
  assert.equal(categoryFromLevelName("KOTH_Hill.rfl"), "koth");
});

/*
 * The case the whole rule exists for. Alpine resolves run levels from a known
 * list rather than a prefix, and these two names are why: both are ordinary
 * maps that a bare three-letter prefix files as movement courses.
 */
test("run needs a separator, so runway and runner are not movement courses", () => {
  assert.equal(categoryFromLevelName("run_canyon.rfl"), "run");
  assert.equal(categoryFromLevelName("run-jumps2.rfl"), "run");
  assert.equal(categoryFromLevelName("run2.rfl"), "run");
  assert.equal(categoryFromLevelName("runway.rfl"), null);
  assert.equal(categoryFromLevelName("runner-arena.rfl"), null);
});

test("a level with no game type prefix derives nothing", () => {
  assert.equal(categoryFromLevelName("glass_house.rfl"), null);
  assert.equal(categoryFromLevelName("L5S3.rfl"), null);
  assert.equal(categoryFromLevelName(""), null);
});

test("a level inside a zip is matched on its filename, not its path", () => {
  assert.equal(categoryFromLevelName("maps/CTF-Ankh_b12.rfl"), "ctf");
  assert.equal(categoryFromLevelName("pack\\levels\\dm04.rfl"), "dm");
  // A directory that looks like a prefix must not decide it.
  assert.equal(categoryFromLevelName("ctf/glass_house.rfl"), null);
});

/* --- a whole upload ------------------------------------------------------- */

test("the most common game type in a pack wins", () => {
  assert.equal(
    categoryFromLevels(["ctf01.rfl", "ctf02.rfl", "ctf03.rfl", "dm04.rfl"]),
    "ctf",
  );
});

test("a genuine tie is filed as other rather than decided by order", () => {
  assert.equal(categoryFromLevels(["ctf01.rfl", "dm04.rfl"]), "other");
  assert.equal(categoryFromLevels(["dm04.rfl", "ctf01.rfl"]), "other");
});

test("undeciderable and empty uploads are null, which is not the same as other", () => {
  assert.equal(categoryFromLevels([]), null);
  assert.equal(categoryFromLevels(["glass_house.rfl", "L5S3.rfl"]), null);
});

test("levels that derive nothing do not outvote the ones that do", () => {
  assert.equal(
    categoryFromLevels(["glass_house.rfl", "readme.rfl", "ctf01.rfl"]),
    "ctf",
  );
});

/* --- sections and categories --------------------------------------------- */

test("every section is reachable by its own route and kind", () => {
  for (const section of SECTIONS) {
    assert.equal(sectionByRoute(section.route)?.id, section.id);
    assert.equal(SECTION_BY_KIND[section.kind].id, section.id);
  }
  assert.equal(sectionByRoute("/matches/maps"), null, "the match index is not a shelf");
  assert.equal(sectionByRoute("/nope"), null);
});

test("category ids are unique within a section and stable as URL values", () => {
  for (const categories of [MAP_CATEGORIES, ASSET_CATEGORIES]) {
    const ids = categories.map((category) => category.id);
    assert.equal(new Set(ids).size, ids.length, "duplicate category id");
    for (const id of ids) {
      assert.match(id, /^[a-z][a-z0-9-]*$/, `${id} must be URL safe`);
    }
  }
});

test("the six map types asked for all exist", () => {
  const ids = MAP_CATEGORIES.map((category) => category.id);
  for (const wanted of ["ctf", "dm", "dc", "koth", "run", "sp"]) {
    assert.ok(ids.includes(wanted), `missing map type ${wanted}`);
  }
});

test("every derivable category is a real map category", () => {
  const ids = new Set(MAP_CATEGORIES.map((category) => category.id));
  for (const name of ["ctf01.rfl", "dm04.rfl", "dc-x.rfl", "koth-x.rfl", "run_x.rfl"]) {
    assert.ok(ids.has(categoryFromLevelName(name)), name);
  }
  assert.ok(ids.has("other"), "the tie-break answer must be a real category");
});

test("categoryOf tolerates anything a URL can carry", () => {
  const maps = SECTIONS.find((section) => section.id === "maps");
  assert.equal(categoryOf(maps, "ctf")?.label, "CTF");
  assert.equal(categoryOf(maps, "nonsense"), null);
  assert.equal(categoryOf(maps, null), null);
  assert.equal(categoryOf(maps, ""), null);
});

/* --- sorting and versions ------------------------------------------------- */

test("a sort off a stranger's URL always resolves", () => {
  assert.equal(parseSort("downloads"), "downloads");
  assert.equal(parseSort("name"), "name");
  assert.equal(parseSort("updated"), "updated");
  assert.equal(parseSort("new"), "new");
  assert.equal(parseSort(undefined), "new");
  assert.equal(parseSort(null), "new");
  assert.equal(parseSort("; drop table items"), "new");
});

test("a version is shown as written, and an absent one is absent", () => {
  assert.equal(displayVersion("a6a"), "a6a");
  assert.equal(displayVersion("  v2  "), "v2");
  assert.equal(displayVersion("2.0 FINAL"), "2.0 FINAL");
  assert.equal(displayVersion(""), null);
  assert.equal(displayVersion("   "), null);
  assert.equal(displayVersion(null), null);
  assert.equal(displayVersion(undefined), null);
  assert.equal(displayVersion("x".repeat(200))?.length, 24);
});
