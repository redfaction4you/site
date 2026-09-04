/**
 * Maps an RFL format version to the clients that can actually load it.
 *
 * This is the table behind every compatibility badge on the site, so it says
 * plainly where it came from and how far it is actually known. Where we are
 * inferring rather than citing, the entry says so and `confidence` is not
 * "known", a badge that is confidently wrong is worse than one that admits
 * uncertainty.
 *
 * Verified 28 July 2026 against:
 *   - rafalh/rf-reversed, `rfl.ksy`: "0xC8 is the last supported version in
 *     RF 1.2, standard PC levels use version 0xB4, PS2 levels use versions
 *     0xAE and 0xAF"
 *   - Red Faction Wiki, Alpine Faction Help: "Support for levels utilizing AF
 *     features (RFL version 300+)"
 *   - Red Faction Wiki, RF Client Versions (client list and support status)
 *
 * Re-check this when Alpine ships a format bump.
 *
 * FIRST REAL FILES, 3 September 2026. Until this date nothing here had ever
 * seen a Red Faction file that was not a fixture we wrote ourselves. Three
 * `.vpp` packfiles pulled off the live game server were read with
 * `npm run rfl`, and all three parsed correctly:
 *
 *   "DM-Combat Arena.vpp"  28 KB, level "Combat Arena",   saved 2005-01-06, 17 sections
 *   "dm_space.vpp"         20 KB, level "Empty Space",    saved 2002-07-17, 15 sections
 *   "kma Dm s7.vpp"        14 KB, level "KmA & [S7] Map", saved 2013-07-22, 16 sections
 *
 * Every one is RFL version 200 and resolved to every client, which is what the
 * `>= 0xb0` branch below says version 200 should do. It also confirms the
 * per-file 2048-byte alignment in `vpp.ts`, which that file names as the
 * assumption most likely to be wrong, at least as far as one entry per pack
 * goes.
 *
 * What that does not cover is most of this table, and three files is not a
 * corpus. Nothing above version 200 has been read here, so the Alpine branch,
 * the 201 to 299 gap and the PS2 versions are still sourced rather than seen.
 * No zip from the wild has been opened. And the three packs hold a single
 * level each, so a real multi-level pack remains untested. Do not read "tested
 * against real files" as more than it says.
 */

export const RFL_TABLE_VERIFIED_ON = "2026-07-28";

/** The clients we label for. Matches `plays_on` in map_meta. */
export type RfClient = "vanilla" | "pure" | "dash" | "alpine";

export const ALL_CLIENTS: readonly RfClient[] = ["vanilla", "pure", "dash", "alpine"];

export const CLIENT_LABELS: Record<RfClient, string> = {
  vanilla: "Red Faction 1.20/1.21",
  pure: "Pure Faction",
  dash: "Dash Faction",
  alpine: "Alpine Faction",
};

/** Highest version the original engine loads. Everything below is vanilla-era. */
export const RFL_VERSION_VANILLA_MAX = 0xc8; // 200

/** Lowest version that requires Alpine Faction features. */
export const RFL_VERSION_ALPINE_MIN = 300;

/** Version the stock editor writes for PC levels. */
export const RFL_VERSION_STOCK_PC = 0xb4; // 180

/** PlayStation 2 level versions. Not loadable by any PC client. */
const PS2_VERSIONS = new Set([0xae, 0xaf]); // 174, 175

export type Compatibility = {
  /** Clients that can load this level. Empty means nothing we label for. */
  playsOn: RfClient[];
  /**
   * "known"  , the version sits in a documented range.
   * "unknown", the version is real but falls in a gap we have no source for.
   *             Show it, do not guess at it, and flag it for a human.
   */
  confidence: "known" | "unknown";
  /** One sentence for the map page, written for a player, not a developer. */
  note: string;
};

/**
 * Pure and Dash patch the original engine rather than replacing its level
 * loader, so they are treated as loading exactly what vanilla loads. That is an
 * inference from what those projects are, not a cited claim, and reading real
 * files has not touched it: the three packs of 3 September 2026 are version 200,
 * where this branch claims every client, and nothing was loaded in an actual
 * client to see whether it does. Verifying it means launching Pure and Dash.
 */
export function compatibilityForRflVersion(version: number): Compatibility {
  if (PS2_VERSIONS.has(version)) {
    return {
      playsOn: [],
      confidence: "known",
      note: `Version ${version} is a PlayStation 2 level. No PC client loads it.`,
    };
  }

  if (version >= RFL_VERSION_ALPINE_MIN) {
    return {
      playsOn: ["alpine"],
      confidence: "known",
      note:
        `Version ${version} uses Alpine Faction features. Older clients read the ` +
        `version, see a format they do not understand, and decline to load it.`,
    };
  }

  if (version > RFL_VERSION_VANILLA_MAX) {
    return {
      playsOn: [],
      confidence: "unknown",
      note:
        `Version ${version} is above the last version the original engine supports ` +
        `(${RFL_VERSION_VANILLA_MAX}) but below the Alpine range (${RFL_VERSION_ALPINE_MIN}). ` +
        `We have no source for this version and will not guess. Needs checking by hand.`,
    };
  }

  if (version >= 0xb0) {
    return {
      playsOn: [...ALL_CLIENTS],
      confidence: "known",
      note: `Version ${version} is the original level format. Every client loads it.`,
    };
  }

  return {
    playsOn: [],
    confidence: "unknown",
    note:
      `Version ${version} predates the documented PC range. Likely a pre-release or ` +
      `console level. Needs checking by hand.`,
  };
}

/**
 * A pack plays on a client only if *every* level inside it does. One Alpine-only
 * map in a ten-map pack makes the pack Alpine-only, and saying otherwise would
 * send someone away with a download that half works.
 */
export function intersectClients(sets: RfClient[][]): RfClient[] {
  if (sets.length === 0) return [];
  return ALL_CLIENTS.filter((client) => sets.every((set) => set.includes(client)));
}
