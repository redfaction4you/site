import type { MetadataRoute } from "next";

import { listSlugs } from "@/lib/catalogue";
import { SECTIONS } from "@/lib/downloads";
import {
  listColumns,
  listDays,
  listMapNames,
  listMatchLinks,
} from "@/lib/matches/queries";
import { mapSlug } from "@/lib/matches/maps";
import { absoluteUrl } from "@/lib/site";

/**
 * Every page worth a crawler's time, which is not every page that answers.
 *
 * Three things are deliberately absent, and one that used to be is here now.
 *
 * **Anything marked `noindex`.** `/players`, a player's own page, the pairings
 * table, a stat board's own page and `/search` all carry the tag, for the reason
 * written out on `/players`: aggregation and permanence are fine, searchability
 * of somebody's handle is the part that actually feels invasive. Listing them
 * here would be this file arguing with those pages, and a sitemap that
 * contradicts a meta tag is a bug waiting to be resolved in whichever direction
 * the crawler happens to pick.
 *
 * **`/videos` and `/guides`.** Built, empty and hidden from the navigation. They
 * answer so shared links keep working, which is not the same as being worth
 * finding. They belong here the day they have something on them.
 *
 * The downloads are here now, which is the change. `/downloads`, the four
 * shelves and every published item, taken from the catalogue rather than from
 * `nav.ts`: the shelves are hidden in the navigation because they are reached
 * through the hub, and that is a decision about a menu rather than about what a
 * crawler should find. **Every item goes through the published filter**, which
 * is `listSlugs`'s own where clause, because a draft in here is a URL that
 * answers 404 to the one visitor guaranteed to try it.
 *
 * Faceted URLs are deliberately absent. `/maps?type=ctf` and `/maps?sort=name`
 * are the same shelf in a different order, so listing them offers a crawler
 * seven near-identical pages per section and asks it to work out which is
 * canonical. The bare listing is the page; the facets are a way to read it.
 *
 * Everything else is the archive proper: the nights, the matches in them, the
 * maps they were played on, and the writing about them.
 */
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [days, maps, columns, shelves] = await Promise.all([
    listDays(),
    listMapNames(),
    listColumns(),
    /*
     * One query per shelf, in parallel with everything else rather than after
     * it. Four queries for the whole catalogue is the same shape as
     * `listMatchLinks` below: the count is fixed by the number of sections,
     * not by how much has been uploaded.
     */
    Promise.all(
      SECTIONS.map(async (section) => ({
        section,
        slugs: await listSlugs(section.kind),
      })),
    ),
  ]);

  /*
   * Every match, in one query rather than one per night.
   *
   * This used to call `listMatchesForDay` in a loop, which is a query per night
   * and, worse, a second query inside each of those for the participants that a
   * sitemap has no use for. Six nights made it thirteen round trips to build a
   * list of URLs. It is the wrong shape rather than a present cost: the number
   * of queries grew with the archive, and the archive is the thing that grows.
   *
   * `listMatchLinks` asks for the three columns a URL needs and nothing else.
   */
  const nights = await listMatchLinks();

  const newest = days[0]?.archiveDay;
  const lastModified = newest ? new Date(`${newest}T12:00:00Z`) : new Date();

  const entries: MetadataRoute.Sitemap = [
    { url: absoluteUrl("/"), lastModified, changeFrequency: "daily", priority: 1 },
    { url: absoluteUrl("/matches"), lastModified, changeFrequency: "daily", priority: 0.9 },
    { url: absoluteUrl("/news"), lastModified, changeFrequency: "daily", priority: 0.9 },
    { url: absoluteUrl("/stats"), lastModified, changeFrequency: "daily", priority: 0.8 },
    { url: absoluteUrl("/matches/maps"), lastModified, changeFrequency: "weekly", priority: 0.7 },
    // The way in to the files, and the only downloads URL with a priority
    // above the shelves themselves: it is the page that names all four.
    { url: absoluteUrl("/downloads"), changeFrequency: "weekly", priority: 0.8 },
    { url: absoluteUrl("/analyst"), lastModified, changeFrequency: "weekly", priority: 0.6 },
    { url: absoluteUrl("/servers"), changeFrequency: "monthly", priority: 0.5 },
    { url: absoluteUrl("/events"), changeFrequency: "monthly", priority: 0.5 },
    { url: absoluteUrl("/discord"), changeFrequency: "monthly", priority: 0.4 },
  ];

  // The date at midday UTC rather than midnight: the archive's days are
  // Pacific, so midnight UTC on the stated day is the previous evening there.
  const middayOf = (day: string) => new Date(`${day}T12:00:00Z`);

  for (const day of days) {
    entries.push({
      url: absoluteUrl(`/matches/${day.archiveDay}`),
      lastModified: middayOf(day.archiveDay),
      changeFrequency: "monthly",
      priority: 0.7,
    });
  }

  for (const match of nights) {
    entries.push({
      url: absoluteUrl(`/matches/${match.archiveDay}/${match.sourceMatchId}`),
      lastModified: middayOf(match.archiveDay),
      changeFrequency: "monthly",
      priority: 0.6,
    });
  }

  for (const column of columns) {
    entries.push({
      url: absoluteUrl(`/news/${column.archiveDay}`),
      lastModified: column.generatedAt ?? undefined,
      changeFrequency: "monthly",
      priority: 0.7,
    });
  }

  /*
   * The four shelves and everything published on them.
   *
   * No `lastModified` on any of it. The date this file already has is the
   * newest night in the match archive, which says nothing whatever about when
   * a map was uploaded, and a sitemap that asserts a modification date it made
   * up is worse than one that stays quiet: a crawler believes it. The item
   * rows carry `published_at` and `updated_at` and this can start reporting
   * them the day `listSlugs` returns them.
   */
  for (const { section, slugs } of shelves) {
    entries.push({
      url: absoluteUrl(section.route),
      changeFrequency: "weekly",
      priority: 0.7,
    });

    for (const slug of slugs) {
      entries.push({
        url: absoluteUrl(`${section.route}/${slug}`),
        changeFrequency: "monthly",
        priority: 0.6,
      });
    }
  }

  for (const map of maps) {
    entries.push({
      // `mapSlug`, not the encoded name. The route is `/matches/map/ankh-b12`
      // and every other link on the site builds it that way; an encoded
      // `Ankh%20b12` 404s, which is nine dead URLs in a sitemap.
      url: absoluteUrl(`/matches/map/${mapSlug(map.mapName)}`),
      lastModified,
      changeFrequency: "weekly",
      priority: 0.6,
    });
  }

  return entries;
}
