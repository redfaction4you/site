export type NavItem = {
  href: string;
  label: string;
  /** Shown as a muted tag until the phase that builds it ships. */
  phase?: number;
  /**
   * Kept out of the header and footer, but still a live page.
   *
   * Used for sections that exist and work but have nothing in them yet, and for
   * the four downloads shelves, which are reached through `/downloads` rather
   * than each having a slot of their own. Advertising an empty shelf invites
   * people to click it and find nothing, which is a worse first impression than
   * not offering it, but the route still answers, so any link already shared
   * keeps working.
   *
   * **Deleting the flag is not free.** The header row is fitted by
   * measurement; see the note under `VISIBLE_NAV`. And a label has to be unique
   * to a reader: the catalogue's maps keep the longer label "Map downloads" so
   * that they can never be mistaken for the maps a server runs, which live on
   * the server pages.
   */
  hidden?: boolean;
};

/**
 * The whole site.
 *
 * The three servers, the files to play on them, and the events. Since
 * 25 September 2026 the servers lead: RF4U stopped recording stats that day,
 * and the match archive, the players, the stat boards and the analyst's news
 * all went with it.
 */
export const NAV: NavItem[] = [
  /*
   * First, because it is what the site is for now. One entry for the three:
   * `/servers` lands on the first and the tabs there reach the others, so three
   * entries here would be the same page three times over.
   */
  { href: "/servers", label: "Servers" },
  { href: "/downloads", label: "Downloads" },
  { href: "/events", label: "Events" },

  /*
   * The four downloads shelves, reached through `/downloads` rather than each
   * having a slot of its own.
   *
   * Maps, assets, mods and tools are one catalogue with four shelves, and
   * giving each a header entry would spend the row on a section most readers
   * arrive at once and then browse within. They stay listed here because they
   * are real pages with real URLs that get pasted into Discord. The sitemap
   * builds itself from the catalogue rather than from this list, so nothing
   * here needs unhiding for them to be found.
   */
  { href: "/maps", label: "Map downloads", hidden: true },
  { href: "/assets", label: "Assets", hidden: true },
  { href: "/mods", label: "Mods", hidden: true },
  { href: "/tools", label: "Tools", hidden: true },
  // Models and Weapons are gone as sections. They are facets of Assets now
  // (`/assets?type=model`, `/assets?type=weapon`) and their old routes redirect
  // there permanently, which is handled in `next.config.ts`. An entry here
  // would be this file advertising a URL that only ever answers 308.

  // The other kind of hidden: built, empty, and nothing pointing at them until
  // there is something to point at.
  { href: "/videos", label: "Videos", hidden: true },
  { href: "/guides", label: "Guides", hidden: true },
];

/**
 * What the header and footer actually render.
 *
 * NAV stays the full list so the hidden sections are recorded rather than
 * forgotten, and so anything that needs the complete site map can still have
 * it.
 *
 * Three entries leave the header row far inside its width. It carried nine at
 * one point and was measured at 1024 to within five pixels of overflowing, so
 * if it grows past five or six again, measure it at 1024 and at 820 rather than
 * trusting the arithmetic: a row that overflows gives every page on the site a
 * horizontal scrollbar.
 */
export const VISIBLE_NAV: NavItem[] = NAV.filter((item) => !item.hidden);

/*
 * There is deliberately no second navigation strip.
 *
 * There was one, and it repeated entries the header already had under
 * different words. A reader asked what the second menu was for. Two menus that
 * disagree about what a section is called are worse than one menu missing two
 * links, and the fix for missing links is to add them to this one.
 */

export const DISCORD_INVITE =
  process.env.NEXT_PUBLIC_DISCORD_INVITE ?? "https://discord.gg/";
