import type { MetadataRoute } from "next";

import {
  listDays,
  listMapNames,
  listMatchesForDay,
  listColumns,
} from "@/lib/matches/queries";
import { absoluteUrl } from "@/lib/site";

/**
 * Every page worth a crawler's time, which is not every page that answers.
 *
 * Two things are deliberately absent.
 *
 * **Anything marked `noindex`.** `/players`, a player's own page, the pairings
 * table, a stat board's own page and `/search` all carry the tag, for the reason
 * written out on `/players`: aggregation and permanence are fine, searchability
 * of somebody's handle is the part that actually feels invasive. Listing them
 * here would be this file arguing with those pages, and a sitemap that
 * contradicts a meta tag is a bug waiting to be resolved in whichever direction
 * the crawler happens to pick.
 *
 * **The catalogue sections.** `/maps`, `/mods`, `/models`, `/weapons`, `/tools`,
 * `/videos` and `/guides` are built, empty and hidden from the navigation. They
 * answer so shared links keep working, which is not the same as being worth
 * finding. They belong here the day they have something on them, and the `hidden`
 * flag in `nav.ts` is what will say so.
 *
 * Everything else is the archive proper: the nights, the matches in them, the
 * maps they were played on, and the writing about them.
 */
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [days, maps, columns] = await Promise.all([
    listDays(),
    listMapNames(),
    listColumns(),
  ]);

  /*
   * Every match, fetched a night at a time.
   *
   * `listMatchesForDay` is the query the night pages use, so a match reachable
   * from a night page is a match in here and the two cannot disagree about what
   * exists. One query per night is a few dozen at present and this route is not
   * on anybody's critical path.
   */
  const nights = await Promise.all(
    days.map(async (day) => ({
      archiveDay: day.archiveDay,
      matches: await listMatchesForDay(day.archiveDay),
    })),
  );

  const newest = days[0]?.archiveDay;
  const lastModified = newest ? new Date(`${newest}T12:00:00Z`) : new Date();

  const entries: MetadataRoute.Sitemap = [
    { url: absoluteUrl("/"), lastModified, changeFrequency: "daily", priority: 1 },
    { url: absoluteUrl("/matches"), lastModified, changeFrequency: "daily", priority: 0.9 },
    { url: absoluteUrl("/news"), lastModified, changeFrequency: "daily", priority: 0.9 },
    { url: absoluteUrl("/stats"), lastModified, changeFrequency: "daily", priority: 0.8 },
    { url: absoluteUrl("/matches/maps"), lastModified, changeFrequency: "weekly", priority: 0.7 },
    { url: absoluteUrl("/analyst"), lastModified, changeFrequency: "weekly", priority: 0.6 },
    { url: absoluteUrl("/server"), changeFrequency: "monthly", priority: 0.5 },
    { url: absoluteUrl("/events"), changeFrequency: "monthly", priority: 0.5 },
    { url: absoluteUrl("/discord"), changeFrequency: "monthly", priority: 0.4 },
  ];

  for (const night of nights) {
    // The date at midday UTC rather than midnight: the archive's days are
    // Pacific, so midnight UTC on the stated day is the previous evening there.
    const modified = new Date(`${night.archiveDay}T12:00:00Z`);

    entries.push({
      url: absoluteUrl(`/matches/${night.archiveDay}`),
      lastModified: modified,
      changeFrequency: "monthly",
      priority: 0.7,
    });

    for (const match of night.matches) {
      entries.push({
        url: absoluteUrl(`/matches/${night.archiveDay}/${match.sourceMatchId}`),
        lastModified: modified,
        changeFrequency: "monthly",
        priority: 0.6,
      });
    }
  }

  for (const column of columns) {
    entries.push({
      url: absoluteUrl(`/news/${column.archiveDay}`),
      lastModified: column.generatedAt ?? undefined,
      changeFrequency: "monthly",
      priority: 0.7,
    });
  }

  for (const map of maps) {
    entries.push({
      url: absoluteUrl(`/matches/map/${encodeURIComponent(map.mapName)}`),
      lastModified,
      changeFrequency: "weekly",
      priority: 0.6,
    });
  }

  return entries;
}
