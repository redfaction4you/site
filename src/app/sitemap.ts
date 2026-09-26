import type { MetadataRoute } from "next";

import { listSlugs } from "@/lib/catalogue";
import { SECTIONS } from "@/lib/downloads";
import { SERVERS } from "@/lib/servers";
import { absoluteUrl } from "@/lib/site";

/**
 * Every page worth a crawler's time, which is not every page that answers.
 *
 * **`/videos` and `/guides` are absent.** Built, empty and hidden from the
 * navigation. They answer so shared links keep working, which is not the same
 * as being worth finding. They belong here the day they have something on them.
 *
 * **The three server pages are listed by their own addresses.** `/servers` is
 * only a redirect to the first of them, and a sitemap entry that answers with a
 * redirect is a URL a crawler has to be told twice about.
 *
 * The downloads come from the catalogue rather than from `nav.ts`: the shelves
 * are hidden in the navigation because they are reached through the hub, and
 * that is a decision about a menu rather than about what a crawler should find.
 * **Every item goes through the published filter**, which is `listSlugs`'s own
 * where clause, because a draft in here is a URL that answers 404 to the one
 * visitor guaranteed to try it.
 *
 * Faceted URLs are deliberately absent. `/maps?type=ctf` and `/maps?sort=name`
 * are the same shelf in a different order, so listing them offers a crawler
 * seven near-identical pages per section and asks it to work out which is
 * canonical. The bare listing is the page; the facets are a way to read it.
 *
 * No `lastModified` anywhere. The date this used to carry was the newest night
 * in the match archive, and that archive stopped on 25 September 2026 with the
 * rest of the stats. A sitemap asserting a modification date it made up is
 * worse than one that stays quiet, because a crawler believes it.
 */
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  /*
   * One query per shelf, in parallel. The count is fixed by the number of
   * sections, not by how much has been uploaded.
   */
  const shelves = await Promise.all(
    SECTIONS.map(async (section) => ({
      section,
      slugs: await listSlugs(section.kind),
    })),
  );

  const entries: MetadataRoute.Sitemap = [
    { url: absoluteUrl("/"), changeFrequency: "daily", priority: 1 },
    ...SERVERS.map((server) => ({
      url: absoluteUrl(`/servers/${server.slug}`),
      changeFrequency: "weekly" as const,
      priority: 0.9,
    })),
    // The way in to the files: the page that names all four shelves.
    { url: absoluteUrl("/downloads"), changeFrequency: "weekly", priority: 0.8 },
    { url: absoluteUrl("/events"), changeFrequency: "monthly", priority: 0.5 },
    { url: absoluteUrl("/discord"), changeFrequency: "monthly", priority: 0.4 },
  ];

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

  return entries;
}
