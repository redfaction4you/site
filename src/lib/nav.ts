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
  { href: "/maps", label: "Maps", phase: 2 },
  { href: "/mods", label: "Mods", phase: 2 },
  { href: "/models", label: "Models", phase: 2 },
  { href: "/weapons", label: "Weapons", phase: 2 },
  { href: "/tools", label: "Tools", phase: 2 },
  { href: "/videos", label: "Videos" },
  { href: "/guides", label: "Guides", phase: 2 },
  { href: "/events", label: "Events", phase: 4 },
];

export const DISCORD_INVITE =
  process.env.NEXT_PUBLIC_DISCORD_INVITE ?? "https://discord.gg/";
