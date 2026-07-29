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

export const DISCORD_INVITE =
  process.env.NEXT_PUBLIC_DISCORD_INVITE ?? "https://discord.gg/";
