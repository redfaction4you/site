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
   * and it fitted nine only by borrowing the last five pixels of its own
   * padding; it carries eight today with 52 pixels spare, which is one short
   * label rather than a free slot, so the measurement under `VISIBLE_NAV`
   * settles this and not the count. And a label has to be unique to a
   * reader: `/maps` here is the catalogue's maps, which are files to download,
   * while `/matches/maps` is the match record's maps, which are what has been
   * played on them. Both are hidden as of 9 September 2026, so the clash is
   * dormant rather than resolved: either can come back, and the catalogue's
   * keeps the longer label below so that the day one does, the menu does not
   * disagree with itself.
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
  /*
   * Hidden on 9 September 2026, because the owner asked for it.
   *
   * This is the match record's map index, what has been played on each level,
   * and it is not the downloads shelf. Sitting in the header under one word it
   * was read as the place to get a map, which is the confusion the catalogue's
   * own entry carries a longer label to avoid, and the shelves are reached
   * through `/downloads` rather than the row. Hidden rather than deleted: the
   * page is live, `/matches` and the map statistics link into it, the sitemap
   * still lists it, and every link already pasted anywhere keeps working. It
   * can come back by removing this one flag.
   */
  { href: "/matches/maps", label: "Maps", hidden: true },
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
 * **This list has a width budget**, and every figure below was read off a
 * browser at 1024 rather than reasoned about. The header switches to the full
 * row at `lg` because that is where the row measured out.
 *
 * It ran to nine when Downloads was added, and that was the tight case, worth
 * keeping on the record: the wordmark 109, the nine links and their gaps 661,
 * of which Downloads alone is 99, the search and the two menus 169, and the two
 * gaps between those three groups 45. That is 984 laid into the 979 the row has
 * between its own padding, the last five pixels coming out of its 15px of right
 * padding. Nothing overflowed, but nothing was spare either.
 *
 * Hiding the match record's Maps on 9 September 2026 took it back to eight and
 * the row was measured again the same way: wordmark 109, the eight links and
 * their gaps 605, the right-hand group 169, the two gaps 45, so 928 into 979
 * and **52 pixels of slack**. No horizontal scrollbar at 1024, and none at 820,
 * where the compact scroller takes over as it is meant to.
 *
 * That slack is one short label, not a free slot. Maps itself measured 54.33
 * and cost 56.20 with its gap, which is why putting it back lands on 984 again
 * and borrows the padding again. **A ninth entry any wider than that overflows,
 * and a tenth will not fit at all**, nor will renaming one of these to
 * something longer; each of those needs the breakpoint moved to `xl`, or the
 * link padding cut, or something taken out.
 * Measure it at 1024 and at 820 rather than trusting the arithmetic, because a
 * row that overflows here gives every page on the site a horizontal scrollbar,
 * which is the bug the `md` to `lg` change was fixing.
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
