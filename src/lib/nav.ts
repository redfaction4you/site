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
  /*
   * The catalogue's own Maps, which is the page for downloading a map file
   * rather than the page for what has been played on it. Hidden, and when it
   * ships the two will need telling apart in the header: this one is the files.
   */
  { href: "/maps", label: "Maps", hidden: true },
  { href: "/mods", label: "Mods", hidden: true },
  { href: "/models", label: "Models", hidden: true },
  { href: "/weapons", label: "Weapons", hidden: true },
  { href: "/tools", label: "Tools", hidden: true },
  { href: "/videos", label: "Videos", hidden: true },
  { href: "/guides", label: "Guides", hidden: true },

  // What actually has something behind it today.
  //
  // Maps and Pairings were in a second navigation strip under this one, along
  // with three entries that were the same routes as Matches, Players and Stats
  // wearing different words. A reader asked what the second menu was for, having
  // noticed that clicking Players in either one landed in the same place. The
  // answer was two unique pages and three duplicates, so the two came up here
  // and the strip is gone.
  //
  // Each sits beside the page it belongs to: what has been played on a map next
  // to the matches, who plays with whom next to the players.
  { href: "/news", label: "News" },
  { href: "/matches", label: "Matches" },
  { href: "/matches/maps", label: "Maps" },
  { href: "/players", label: "Players" },
  { href: "/players/pairings", label: "Pairings" },
  // Sits next to Players deliberately: that page is who has played, this one is
  // what they are each good at.
  { href: "/stats", label: "Stats" },
  { href: "/servers", label: "Servers" },
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

/*
 * There is deliberately no second navigation strip.
 *
 * There was one, carrying Archive, Maps, Players, Pairings and Stat boards. It
 * was added because the archive had grown pages the header did not reach, which
 * was a real problem, and it solved it by repeating three entries the header
 * already had under different words: Archive was Matches, Stat boards was Stats,
 * and Players was Players, the same route in both menus, one line apart. A
 * reader asked what the second menu was for. Two menus that disagree about what
 * a section is called are worse than one menu missing two links, and the fix for
 * the missing links was to add them.
 */

export const DISCORD_INVITE =
  process.env.NEXT_PUBLIC_DISCORD_INVITE ?? "https://discord.gg/";
