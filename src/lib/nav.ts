export type NavItem = {
  href: string;
  label: string;
  /** Shown as a muted tag until the phase that builds it ships. */
  phase?: number;
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
  { href: "/maps", label: "Maps" },
  { href: "/mods", label: "Mods" },
  { href: "/models", label: "Models" },
  { href: "/weapons", label: "Weapons" },
  { href: "/tools", label: "Tools" },
  { href: "/videos", label: "Videos" },
  { href: "/guides", label: "Guides" },
  { href: "/matches", label: "Matches" },
  { href: "/players", label: "Players" },
  { href: "/events", label: "Events", phase: 4 },
];

export const DISCORD_INVITE =
  process.env.NEXT_PUBLIC_DISCORD_INVITE ?? "https://discord.gg/";
