export type NavItem = {
  href: string;
  label: string;
  /** Shown as a muted tag until the phase that builds it ships. */
  phase?: number;
  /**
   * Kept out of the header and footer, but still a live page.
   *
   * Used for sections that exist and work but have nothing in them yet.
   * Advertising an empty shelf invites people to click it and find nothing,
   * which is a worse first impression than not offering it, but the route
   * still answers, so any link already shared keeps working. Delete the flag
   * to put it back; nothing else needs changing.
   */
  hidden?: boolean;
};

/**
 * The whole site.
 *
 * Deliberately only things you can download, read or watch. That rule is what
 * kept servers, trackers and match schedules out, and it should keep killing
 * things.
 */
export const NAV: NavItem[] = [
  // The catalogue sections are built now, so they carry no phase tag. They are
  // empty, but an empty shelf and an unbuilt shelf are different things and the
  // pages say which they are.
  // The catalogue is built but empty. Hidden until there is something on the
  // shelves; every page still answers, so shared links keep working.
  { href: "/maps", label: "Maps", hidden: true },
  { href: "/mods", label: "Mods", hidden: true },
  { href: "/models", label: "Models", hidden: true },
  { href: "/weapons", label: "Weapons", hidden: true },
  { href: "/tools", label: "Tools", hidden: true },
  { href: "/videos", label: "Videos", hidden: true },
  { href: "/guides", label: "Guides", hidden: true },

  // What actually has something behind it today.
  { href: "/news", label: "News" },
  { href: "/matches", label: "Matches" },
  { href: "/players", label: "Players" },
  // Sits next to Players deliberately: that page is who has played, this one is
  // what they are each good at.
  { href: "/stats", label: "Stats" },
  { href: "/server", label: "Server" },
  { href: "/events", label: "Events" },
];

/**
 * What the header and footer actually render.
 *
 * NAV stays the full list so the hidden sections are recorded rather than
 * forgotten, and so anything that needs the complete site map, a sitemap,
 * a search index, can still have it.
 */
export const VISIBLE_NAV: NavItem[] = NAV.filter((item) => !item.hidden);

/**
 * The archive's own pages, under the top level nav.
 *
 * The header carries six sections and stops there, which was right while each
 * section was one page and became wrong as the archive grew a second layer.
 * Pairings, the map pages and the stat boards are all reachable only by
 * stumbling on a link inside something else, which is no way to find out a site
 * has them.
 *
 * Every sports site solves this the same way, with a section strip under the
 * masthead: Scores, Schedule, Standings, Stats, Teams, Players. This is that
 * strip, and it appears on the pages it covers rather than site wide, because a
 * catalogue page has no business advertising the match archive's furniture.
 */
export const ARCHIVE_NAV: NavItem[] = [
  { href: "/matches", label: "Nights" },
  { href: "/matches/maps", label: "Maps" },
  { href: "/players", label: "Players" },
  { href: "/players/pairings", label: "Pairings" },
  { href: "/stats", label: "Stat boards" },
];

export const DISCORD_INVITE =
  process.env.NEXT_PUBLIC_DISCORD_INVITE ?? "https://discord.gg/";
