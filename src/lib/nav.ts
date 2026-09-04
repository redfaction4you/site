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
   * **Deleting the flag is not free**, whatever this comment used to say. Two
   * things have to be checked first. The header row is fitted by measurement
   * and is full at nine entries, so a tenth needs the measurement under
   * `VISIBLE_NAV` taken again rather than trusted. And a label has to be unique to a
   * reader: `/maps` here is the catalogue's maps, which are files to download,
   * while `/matches/maps` is the match record's maps, which are what has been
   * played on them. Two header entries both reading Maps would be a menu that
   * disagrees with itself, which is why the catalogue's carries a longer label
   * below.
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
  /*
   * The four downloads shelves, reached through `/downloads` rather than each
   * having a slot of its own.
   *
   * Maps, assets, mods and tools are one catalogue with four shelves, and
   * giving each a header entry would spend half the row on a section most
   * readers arrive at once and then browse within. They stay listed here
   * because they are real pages with real URLs that get pasted into Discord.
   * The sitemap builds itself from the catalogue rather than from this list, so
   * nothing here needs unhiding for them to be found.
   */
  // The catalogue's own Maps, which is the page for downloading a map file
  // rather than the page for what has been played on it. Labelled for the day
  // somebody unhides it: "Maps" is taken, by `/matches/maps` further down.
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
  /*
   * Second, not last and not first.
   *
   * The record is five entries that belong beside each other, Matches through
   * Stats, and dropping Downloads into the middle of them would break a run a
   * reader can already scan. Behind News rather than in front of it because the
   * front page is a news page and that is the door most people come through,
   * and ahead of everything else because a catalogue of files is a section of
   * this site rather than a footnote to the match archive.
   */
  { href: "/downloads", label: "Downloads" },
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
 *
 * **This list has a width budget and Downloads spent the last of it.** The
 * header switches to the full row at `lg` because that is where the row
 * measured out, and the working is written up in
 * `src/components/site-header.tsx` against the eight links there were then.
 * Downloads is the ninth, so the row was measured again in a browser at 1024
 * rather than reasoned about: the wordmark is 109, the nine links and their
 * gaps are 661, of which Downloads alone is 99, the search and the two menus
 * are 169, and the two gaps between those three groups are 45. That is 984 laid
 * into the 979 the row has between its own padding.
 *
 * Nothing overflows. The five pixels come out of the row's own 15px of right
 * padding, so there is no horizontal scrollbar at 1024, and none at 820 either,
 * where the compact scroller takes over as it is meant to. But the slack is
 * spent. **A tenth entry will not fit**, and neither will renaming one of these
 * to something longer; either needs the breakpoint moved to `xl`, or the link
 * padding cut, or something taken out. Measure it in a browser at 1024 and at
 * 820 rather than trusting the arithmetic, because a row that overflows here
 * gives every page on the site a horizontal scrollbar, which is the bug the
 * `md` to `lg` change was fixing.
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
