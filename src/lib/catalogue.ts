/**
 * Reading the downloads catalogue.
 *
 * Every shelf, Maps and Assets and Mods and Tools, is the same query with a
 * different `kind`, which is why they are one table. The differences that
 * matter are editorial, and they live in `@/lib/downloads` beside the rules
 * that can be tested without a database.
 *
 * Nothing here decides what a section is called or which facets it offers. This
 * module knows how to fetch rows and nothing else.
 */
import { and, asc, desc, eq, ilike, or, sql } from "drizzle-orm";
import { cache } from "react";

import { db } from "@/lib/db";
import { files, items, itemUpdates, mapMeta, screenshots } from "@/lib/db/schema";
import {
  DEFAULT_SORT,
  type ItemKind,
  type Section,
  type Sort,
} from "@/lib/downloads";
import type { RfClient } from "@/lib/rfl/clients";

export type CatalogueFilters = {
  /** Free-text match against title and author. */
  q?: string;
  /** The section facet: a map type, an asset type. */
  category?: string;
  /** Only items playable on this client. Maps and mods only. */
  client?: RfClient;
  /** Single tag match. */
  tag?: string;
  /** Which order. Defaults to newest first. */
  sort?: Sort;
};

/** What one row of a listing needs. Deliberately not the whole record. */
export type ItemSummary = {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  authorName: string | null;
  category: string | null;
  releaseVersion: string | null;
  releasedOn: string | null;
  publishedAt: Date | null;
  updatedAt: Date | null;
  tags: string[];
  downloadCount: number;
  playsOn: RfClient[];
  rflVersion: number | null;
  detectionConfidence: "known" | "unknown" | null;
  screenshotKey: string | null;
};

function publishedWhere(kind: ItemKind) {
  return and(eq(items.kind, kind), eq(items.status, "published"));
}

/**
 * How each sort is expressed, in one place.
 *
 * Every one of them has a tie-break, and that is not tidiness. Postgres is free
 * to return equally-ranked rows in any order it likes, and a listing that
 * reshuffles itself between two identical requests looks broken in a way that
 * is very hard to report: nothing is wrong on either page. The archive will
 * also arrive in bulk, so "every map imported on the same day" is the ordinary
 * case rather than a rare tie.
 *
 * `name` sorts case-insensitively, because a shelf where `Ankh` sorts before
 * `ankh` sorts before `Badlands` is sorted by nothing a reader can see.
 */
const ORDER_BY: Record<Sort, ReturnType<typeof desc>[]> = {
  new: [desc(items.publishedAt), asc(sql`lower(${items.title})`)],
  updated: [desc(items.updatedAt), asc(sql`lower(${items.title})`)],
  downloads: [desc(items.downloadCount), asc(sql`lower(${items.title})`)],
  name: [asc(sql`lower(${items.title})`), desc(items.publishedAt)],
};

const summaryColumns = {
  id: items.id,
  slug: items.slug,
  title: items.title,
  summary: items.summary,
  authorName: items.authorName,
  category: items.category,
  releaseVersion: items.releaseVersion,
  releasedOn: items.releasedOn,
  publishedAt: items.publishedAt,
  updatedAt: items.updatedAt,
  tags: items.tags,
  downloadCount: items.downloadCount,
  playsOn: mapMeta.playsOn,
  rflVersion: mapMeta.rflVersion,
  detectionConfidence: mapMeta.detectionConfidence,
  /*
   * The card image is the first screenshot, and only its key is fetched.
   * Selecting the whole screenshots relation here would pull every image row
   * for every item in the listing to render one thumbnail each, which is the
   * shape of the bug that made a match page 749 kB.
   */
  screenshotKey: sql<string | null>`(
    select ${screenshots.storageKey}
    from ${screenshots}
    where ${screenshots.itemId} = ${items.id}
    order by ${screenshots.position} asc
    limit 1
  )`,
};

/**
 * Lists published items on one shelf.
 *
 * Left-joins the compatibility metadata so an item with no detection row still
 * appears. A map missing its compatibility data should show up unlabelled
 * rather than vanish: the listing's job is to be complete, and the badge's job
 * is to be honest about what it does not know.
 */
export async function listItems(
  kind: ItemKind,
  filters: CatalogueFilters = {},
): Promise<ItemSummary[]> {
  const conditions = [publishedWhere(kind)];

  if (filters.q) {
    const pattern = `%${filters.q}%`;
    conditions.push(
      or(ilike(items.title, pattern), ilike(items.authorName, pattern))!,
    );
  }

  if (filters.category) {
    conditions.push(eq(items.category, filters.category));
  }

  if (filters.tag) {
    conditions.push(sql`${items.tags} @> ARRAY[${filters.tag}]::text[]`);
  }

  if (filters.client) {
    conditions.push(
      sql`${mapMeta.playsOn} @> ${JSON.stringify([filters.client])}::jsonb`,
    );
  }

  const rows = await db
    .select(summaryColumns)
    .from(items)
    .leftJoin(mapMeta, eq(mapMeta.itemId, items.id))
    .where(and(...conditions))
    .orderBy(...ORDER_BY[filters.sort ?? DEFAULT_SORT]);

  return rows.map((row) => ({ ...row, playsOn: row.playsOn ?? [] }));
}

/**
 * How many published items sit under each facet of one shelf.
 *
 * Read in the same pass as the listing so a filter chip can carry its count,
 * and so a facet nobody has filled can be shown as empty rather than offered as
 * a link to nothing. Uncategorised items are counted under the null key, which
 * the caller may show or ignore.
 */
export async function countByCategory(
  kind: ItemKind,
): Promise<Record<string, number>> {
  const rows = await db
    .select({ category: items.category, count: sql<number>`count(*)::int` })
    .from(items)
    .where(publishedWhere(kind))
    .groupBy(items.category);

  const counts: Record<string, number> = {};
  for (const row of rows) counts[row.category ?? "none"] = row.count;
  return counts;
}

/**
 * Everything a detail page needs, or null if there is no such published item.
 *
 * Wrapped in React's `cache` because every detail route calls it twice, once in
 * generateMetadata and once in the page body, and that should be one query.
 */
export const getItem = cache(async function getItem(kind: ItemKind, slug: string) {
  const item = await db.query.items.findFirst({
    where: and(eq(items.kind, kind), eq(items.slug, slug), eq(items.status, "published")),
    with: {
      files: true,
      screenshots: true,
      mapMeta: true,
      updates: true,
    },
  });

  if (!item) return null;

  return {
    ...item,
    files: [...item.files].sort(
      (a, b) => Number(b.isPrimary) - Number(a.isPrimary) || a.filename.localeCompare(b.filename),
    ),
    screenshots: [...item.screenshots].sort((a, b) => a.position - b.position),
    /*
     * Newest first, which is the only order a changelog is ever read in.
     * Sorted here rather than in SQL because the relation is fetched whole and
     * an item has a handful of these, not thousands.
     */
    updates: [...item.updates].sort(
      (a, b) => b.releasedAt.getTime() - a.releasedAt.getTime(),
    ),
  };
});

export type CatalogueItem = NonNullable<Awaited<ReturnType<typeof getItem>>>;

/** Published slugs for one shelf, for the sitemap. */
export async function listSlugs(kind: ItemKind): Promise<string[]> {
  const rows = await db
    .select({ slug: items.slug })
    .from(items)
    .where(publishedWhere(kind));
  return rows.map((row) => row.slug);
}

/** Tags in use within a shelf, most common first. Drives the tag filter row. */
export async function listTags(kind: ItemKind): Promise<{ tag: string; count: number }[]> {
  return db
    .select({
      tag: sql<string>`unnest(${items.tags})`.as("tag"),
      count: sql<number>`count(*)::int`,
    })
    .from(items)
    .where(publishedWhere(kind))
    .groupBy(sql`1`)
    .orderBy(sql`2 desc`, sql`1 asc`);
}

/** Total published items per shelf. Drives the counts on the downloads hub. */
export async function countByKind(): Promise<Record<string, number>> {
  const rows = await db
    .select({ kind: items.kind, count: sql<number>`count(*)::int` })
    .from(items)
    .where(eq(items.status, "published"))
    .groupBy(items.kind);

  const counts: Record<string, number> = {};
  for (const row of rows) counts[row.kind] = row.count;
  return counts;
}

/**
 * One file, with the item it belongs to, for the download redirect.
 *
 * Selected by file id alone rather than by (kind, slug, file) because that is
 * what a download URL can carry stably: renaming an item changes its slug and
 * every link to it, and a download link that rots is the one thing this archive
 * promises not to produce. Status is checked here so a draft or pulled item
 * cannot be fetched by anyone holding an old file id.
 */
export async function getDownloadable(fileId: string) {
  const [row] = await db
    .select({
      itemId: items.id,
      kind: items.kind,
      slug: items.slug,
      storageKey: files.storageKey,
      filename: files.filename,
    })
    .from(files)
    .innerJoin(items, eq(items.id, files.itemId))
    .where(and(eq(files.id, fileId), eq(items.status, "published")))
    .limit(1);

  return row ?? null;
}

/**
 * Bumps the counter when somebody takes a copy.
 *
 * Never awaited on the request path, and never allowed to fail a download: a
 * counter is a nice-to-have and the file is the point. The caller runs this
 * after the response has been handed over.
 */
export async function recordDownload(itemId: string): Promise<void> {
  try {
    await db
      .update(items)
      .set({ downloadCount: sql`${items.downloadCount} + 1` })
      .where(eq(items.id, itemId));
  } catch (error) {
    console.warn("[catalogue] could not record a download:", error);
  }
}

/** Re-exported so pages do not each reach into the schema module. */
export { files, items, itemUpdates, mapMeta, screenshots };
export type { Section };
