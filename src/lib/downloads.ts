/**
 * What the downloads section is made of, as pure data and pure rules.
 *
 * Deliberately imports nothing. `catalogue.ts` next door talks to the database
 * and cannot be loaded by `node --test`; everything here can, which is why the
 * rules that are easy to get quietly wrong live on this side of the line:
 * a category derived from the wrong prefix files a map under the wrong game
 * type forever, and nothing about the page would look broken.
 *
 * A section is a shelf you browse (Maps, Assets). A category is the facet
 * within it (CTF, DM, character models, textures). The section maps one to one
 * onto `items.kind` so a query can never mix two shelves; the category is a
 * column on the row and is only ever meaningful inside its own section.
 */

/** Storage discriminator. One value per shelf. */
export const ITEM_KINDS = ["map", "asset", "mod", "tool"] as const;
export type ItemKind = (typeof ITEM_KINDS)[number];

export type Category = {
  /** URL value: `/maps?type=ctf`. Stored in `items.category`. */
  id: string;
  /** What a reader sees on the filter chip and in the sidebar. */
  label: string;
  /** One line under the heading when this category is the current filter. */
  blurb: string;
};

/**
 * Map types, in the order they are offered.
 *
 * CTF first because it is what this community plays; the rest follow by how
 * much of the archive they are likely to account for. `other` is last and is
 * not a failure state: a map that is a race track or a jump course is a real
 * thing and filing it under a game type it does not play would be worse than
 * saying so.
 */
export const MAP_CATEGORIES: Category[] = [
  { id: "ctf", label: "CTF", blurb: "Capture the Flag levels." },
  { id: "dm", label: "DM", blurb: "Deathmatch levels, free-for-all and team." },
  { id: "dc", label: "DC", blurb: "Damage Control levels." },
  { id: "koth", label: "KOTH", blurb: "King of the Hill levels." },
  { id: "run", label: "RUN", blurb: "Movement and jump courses." },
  { id: "sp", label: "Singleplayer", blurb: "Single player levels and campaigns." },
  { id: "other", label: "Other", blurb: "Levels that do not sit under one game type." },
];

/**
 * Asset types.
 *
 * `red` is the level editor's own material: prefabs, brush libraries, editor
 * configuration. It is grouped with the art rather than with Tools because a
 * tool is a program you run and these are files you load into one.
 */
export const ASSET_CATEGORIES: Category[] = [
  { id: "model", label: "Character models", blurb: "Player models and character skins." },
  { id: "texture", label: "Textures", blurb: "Texture sets and material packs." },
  { id: "weapon", label: "Weapons", blurb: "Custom weapons and reskins." },
  { id: "red", label: "RED assets", blurb: "Prefabs and libraries for the level editor." },
  { id: "sound", label: "Sounds", blurb: "Sound effects and music." },
  { id: "other", label: "Other", blurb: "Everything else that loads into the game." },
];

export type Section = {
  /** URL segment and the key used in code. */
  id: string;
  kind: ItemKind;
  route: string;
  /** Page heading and the label in navigation. */
  title: string;
  /**
   * The small red label above the heading, rendered with `.eyebrow`.
   *
   * Every section page on this site has one and there are 44 of them, so a
   * shelf without one reads as a page from a different site. It says
   * "Downloads" rather than the section's own name, because it is there to
   * place the page within the site rather than to repeat the heading under it.
   */
  eyebrow: string;
  /** Singular noun for prose: "3 maps", "1 asset". */
  noun: string;
  pluralNoun: string;
  /** The lead paragraph. Plain and non-promotional, per the house style. */
  intro: string;
  /** Shown on the hub card. One line. */
  tagline: string;
  emptyHeading: string;
  emptyBody: string;
  /** Facets offered. Empty means the section has none. */
  categories: Category[];
  /** Whether items here can carry level compatibility data from the inspector. */
  hasLevels: boolean;
};

export const SECTIONS: Section[] = [
  {
    id: "maps",
    kind: "map",
    route: "/maps",
    title: "Maps",
    eyebrow: "Downloads",
    noun: "map",
    pluralNoun: "maps",
    intro:
      "Custom Red Faction levels, hosted here permanently. Every upload is read at the byte level for the client features it needs, so you know what will load a map before you download it.",
    tagline: "Levels for every game type, from CTF to single player.",
    emptyHeading: "No maps published yet",
    emptyBody:
      "The shelf is built and empty. It is being filled from archives of maps scattered across dead forums and expired hosts, which is slower than scraping but means every entry is a file we actually hold.",
    categories: MAP_CATEGORIES,
    hasLevels: true,
  },
  {
    id: "assets",
    kind: "asset",
    route: "/assets",
    title: "Assets",
    eyebrow: "Downloads",
    noun: "asset",
    pluralNoun: "assets",
    intro:
      "The pieces things are built from: character models, textures, weapons and material for the level editor. Useful on their own, and the raw stock for anyone making something new.",
    tagline: "Models, textures, weapons and editor material.",
    emptyHeading: "No assets published yet",
    emptyBody:
      "Nothing here so far. If you made models, skins or texture sets back in the day and still have the files, they are exactly what this shelf is for.",
    categories: ASSET_CATEGORIES,
    hasLevels: false,
  },
  {
    id: "mods",
    kind: "mod",
    route: "/mods",
    title: "Mods",
    eyebrow: "Downloads",
    noun: "mod",
    pluralNoun: "mods",
    intro:
      "Total conversions and gameplay overhauls, from small rule changes to whole new campaigns.",
    tagline: "Overhauls and total conversions.",
    emptyHeading: "No mods published yet",
    emptyBody:
      "Nothing here so far. Mods tend to be larger and more scattered than maps, so they take longer to track down and verify.",
    categories: [],
    hasLevels: true,
  },
  {
    id: "tools",
    kind: "tool",
    route: "/tools",
    title: "Tools",
    eyebrow: "Downloads",
    noun: "tool",
    pluralNoun: "tools",
    intro:
      "The editors and utilities for making things: RED, the Official RF Toolkit, VPP Builder and the rest. Each one with a guide, because a tool nobody can start is not much use.",
    tagline: "Editors and utilities, with guides.",
    emptyHeading: "No tools published yet",
    emptyBody:
      "Nothing here so far. Tools are the highest priority to archive: they are the oldest downloads and the ones most likely to have vanished already.",
    categories: [],
    hasLevels: false,
  },
];

export const SECTION_BY_KIND: Record<ItemKind, Section> = Object.fromEntries(
  SECTIONS.map((section) => [section.kind, section]),
) as Record<ItemKind, Section>;

export function sectionByRoute(route: string): Section | null {
  return SECTIONS.find((section) => section.route === route) ?? null;
}

/** The category record for a stored id, or null. Never throws on bad input. */
export function categoryOf(section: Section, id: string | null): Category | null {
  if (!id) return null;
  return section.categories.find((category) => category.id === id) ?? null;
}

/* --- sorting -------------------------------------------------------------- */

export const SORTS = ["new", "updated", "downloads", "name"] as const;
export type Sort = (typeof SORTS)[number];

export const SORT_LABELS: Record<Sort, string> = {
  new: "Newest",
  updated: "Recently updated",
  downloads: "Most downloaded",
  name: "Name",
};

export const DEFAULT_SORT: Sort = "new";

/**
 * A sort from a query string.
 *
 * Anything unrecognised falls back rather than throwing, because this value
 * comes off a URL a stranger can type. A bad `?sort=` should show the default
 * listing, not an error page.
 */
export function parseSort(value: string | undefined | null): Sort {
  return SORTS.includes(value as Sort) ? (value as Sort) : DEFAULT_SORT;
}

/* --- deriving a map's game type ------------------------------------------- */

/**
 * Red Faction encodes a level's game type in its filename, and this is the
 * game's own rule rather than a guess at it.
 *
 * Taken from `multi_level_name_matches_any_mp_prefix` in Alpine Faction's
 * `game_patch/multi/multi.cpp`, which is what a server uses to decide whether a
 * level can be voted for a given game type. Keeping the two in step matters: a
 * map filed here as CTF that no server would accept as CTF is a listing that
 * lies about the file it is offering.
 *
 * `rev` and `esc` are real Alpine prefixes with no shelf of their own here, so
 * they land in `other` rather than being forced into a neighbouring type.
 */
const PREFIX_TYPES: { prefix: string; category: string }[] = [
  { prefix: "pctf", category: "ctf" },
  { prefix: "ctf", category: "ctf" },
  { prefix: "pdm", category: "dm" },
  { prefix: "dm", category: "dm" },
  { prefix: "koth", category: "koth" },
  { prefix: "dc", category: "dc" },
];

/**
 * The filename as the game would see it: no directory, no extension, lowercase.
 *
 * A download is usually a zip, so a level arrives as `maps/CTF-Ankh_b12.rfl`
 * and matching the prefix against the whole path would match nothing at all.
 */
function levelKey(path: string): string {
  const base = path.split(/[\\/]/).pop() ?? "";
  return base.replace(/\.rfl$/i, "").toLowerCase();
}

/**
 * The game type one level filename implies, or null when it implies none.
 *
 * `run` is deliberately not a bare prefix. Alpine resolves run levels from a
 * known list rather than by prefix precisely because the three letters are
 * ambiguous, and "runway" or "runner" are perfectly ordinary map names that a
 * bare prefix would file as movement courses. A separator or a digit after
 * `run` is the cheap approximation of that list, and it errs towards `other`,
 * which is the safe direction: unfiled is recoverable, misfiled is not noticed.
 *
 * Single player has no prefix convention at all and is never derived. It is set
 * by a person or not at all.
 */
export function categoryFromLevelName(path: string): string | null {
  const name = levelKey(path);
  if (!name) return null;

  if (/^run[-_ 0-9]/.test(name)) return "run";

  for (const { prefix, category } of PREFIX_TYPES) {
    if (name.startsWith(prefix)) return category;
  }

  return null;
}

/**
 * The category to file a whole upload under, given every level inside it.
 *
 * An upload can hold more than one level and they do not have to agree: a pack
 * of eight CTF maps with a deathmatch bonus level is a CTF pack. The most
 * common answer wins, and a genuine tie is `other` rather than whichever
 * happened to be read first, because a coin toss between two game types is
 * exactly the kind of wrong answer nobody goes back and checks.
 *
 * Returns null when nothing could be derived, so a caller can tell "no opinion"
 * apart from a positive reading of `other`. Both mean a person should look, but
 * only one of them is the parser having read something.
 */
export function categoryFromLevels(paths: string[]): string | null {
  const counts = new Map<string, number>();

  for (const path of paths) {
    const category = categoryFromLevelName(path);
    if (category) counts.set(category, (counts.get(category) ?? 0) + 1);
  }

  if (counts.size === 0) return null;

  let best: string | null = null;
  let bestCount = 0;
  let tied = false;

  // Iterated in insertion order, so a tie is decided by `tied` rather than by
  // which level the zip happened to list first.
  for (const [category, count] of counts) {
    if (count > bestCount) {
      best = category;
      bestCount = count;
      tied = false;
    } else if (count === bestCount) {
      tied = true;
    }
  }

  return tied ? "other" : best;
}

/* --- versions ------------------------------------------------------------- */

/**
 * A version as it is shown beside a title: `Dainer a6a`.
 *
 * Trimmed and length-capped, and empty becomes null so a caller can simply not
 * render the element. Nothing is parsed or ordered: Red Faction versioning is
 * whatever the author wrote, `a5a` and `b12` and `ver1` and `2.0 FINAL` all
 * being real, and imposing a scheme on that would only ever be wrong.
 */
export function displayVersion(version: string | null | undefined): string | null {
  const trimmed = (version ?? "").trim().slice(0, 24);
  return trimmed.length > 0 ? trimmed : null;
}
