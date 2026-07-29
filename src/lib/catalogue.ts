/**
 * Reading the catalogue.
 *
 * All five sections — maps, mods, models, weapons, tools — are the same query
 * with a different `kind`, which is why they are one table. The per-kind
 * differences that matter are editorial (what the page says) rather than
 * structural, so they live in KIND_META here rather than in five page files.
 */
import { and, asc, desc, eq, ilike, or, sql } from "drizzle-orm";
import { cache } from "react";

import { db } from "@/lib/db";
import { files, items, mapMeta, screenshots, type ItemKind } from "@/lib/db/schema";
import type { RfClient } from "@/lib/rfl/clients";

export type KindMeta = {
  kind: ItemKind;
  /** URL segment. */
  route: string;
  /** Page heading. */
  title: string;
  /** Singular noun for prose, e.g. "map". */
  noun: string;
  eyebrow: string;
  /** The lead paragraph. Plain and non-promotional, per the house style. */
  intro: string;
  /** Shown when nothing is published yet. Honest about why. */
  emptyHeading: string;
  emptyBody: string;
  /** Whether items of this kind can carry level compatibility data. */
  hasLevels: boolean;
};

export const KIND_META: Record<ItemKind, KindMeta> = {
  map: {
    kind: "map",
    route: "/maps",
    title: "Maps",
    noun: "map",
    eyebrow: "Catalogue",
    intro:
      "Custom Red Faction levels, hosted here permanently. Every map is checked at upload for the client features it needs, so you know what will load it before you download.",
    emptyHeading: "No maps published yet",
    emptyBody:
      "The catalogue is built but empty. It is being seeded from archives of maps scattered across dead forums and expired hosts, which is slower than scraping but means each entry is a file we actually hold.",
    hasLevels: true,
  },
  mod: {
    kind: "mod",
    route: "/mods",
    title: "Mods",
    noun: "mod",
    eyebrow: "Catalogue",
    intro:
      "Total conversions and gameplay overhauls, from small rule changes to whole new campaigns.",
    emptyHeading: "No mods published yet",
    emptyBody:
      "Nothing here so far. Mods tend to be larger and more scattered than maps, so they take longer to track down and verify.",
    hasLevels: true,
  },
  model: {
    kind: "model",
    route: "/models",
    title: "Models",
    noun: "model",
    eyebrow: "Catalogue",
    intro: "Player models and character skins, with previews of what you actually get.",
    emptyHeading: "No models published yet",
    emptyBody:
      "Nothing here so far. If you made models back in the day and still have the files, they are exactly what this section is for.",
    hasLevels: false,
  },
  weapon: {
    kind: "weapon",
    route: "/weapons",
    title: "Weapons",
    noun: "weapon",
    eyebrow: "Catalogue",
    intro: "Custom weapons and reskins, from single replacements to full arsenals.",
    emptyHeading: "No weapons published yet",
    emptyBody: "Nothing here so far.",
    hasLevels: false,
  },
  tool: {
    kind: "tool",
    route: "/tools",
    title: "Tools",
    noun: "tool",
    eyebrow: "Catalogue",
    intro:
      "The editors and utilities for making things: RED, the Official RF Toolkit, VPP Builder and the rest. Each one with a guide, because a tool nobody can start is not much use.",
    emptyHeading: "No tools published yet",
    emptyBody:
      "Nothing here so far. Tools are the highest priority to archive: they are the oldest downloads and the ones most likely to have vanished already.",
    hasLevels: false,
  },
};

export const ALL_KINDS = Object.values(KIND_META);

export type CatalogueFilters = {
  /** Free-text match against title and author. */
  q?: string;
  /** Only items playable on this client. Maps and mods only. */
  client?: RfClient;
  /** Single tag match. */
  tag?: string;
};

/** What a listing card needs. Deliberately not the whole row. */
export type ItemSummary = {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  authorName: string | null;
  releasedOn: string | null;
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
 * Lists published items of one kind.
 *
 * Left-joins the metadata so a map with no detection row still appears; an item
 * missing its compatibility data should show up unlabelled, not vanish.
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

  if (filters.tag) {
    conditions.push(sql`${items.tags} @> ARRAY[${filters.tag}]::text[]`);
  }

  if (filters.client) {
    conditions.push(
      sql`${mapMeta.playsOn} @> ${JSON.stringify([filters.client])}::jsonb`,
    );
  }

  const rows = await db
    .select({
      id: items.id,
      slug: items.slug,
      title: items.title,
      summary: items.summary,
      authorName: items.authorName,
      releasedOn: items.releasedOn,
      tags: items.tags,
      downloadCount: items.downloadCount,
      playsOn: mapMeta.playsOn,
      rflVersion: mapMeta.rflVersion,
      detectionConfidence: mapMeta.detectionConfidence,
      screenshotKey: sql<string | null>`(
        select ${screenshots.storageKey}
        from ${screenshots}
        where ${screenshots.itemId} = ${items.id}
        order by ${screenshots.position} asc
        limit 1
      )`,
    })
    .from(items)
    .leftJoin(mapMeta, eq(mapMeta.itemId, items.id))
    .where(and(...conditions))
    // Newest first, but fall back to title so an unpublished-date import is
    // still in a stable order rather than whatever Postgres feels like.
    .orderBy(desc(items.publishedAt), asc(items.title));

  return rows.map((row) => ({
    ...row,
    playsOn: row.playsOn ?? [],
  }));
}

/**
 * Everything a detail page needs, or null if there is no such published item.
 *
 * Wrapped in React's `cache` because every detail route calls it twice — once
 * in generateMetadata and once in the page body — and that should be one query,
 * not two.
 */
export const getItem = cache(async function getItem(kind: ItemKind, slug: string) {
  const item = await db.query.items.findFirst({
    where: and(eq(items.kind, kind), eq(items.slug, slug), eq(items.status, "published")),
    with: {
      files: true,
      screenshots: true,
      mapMeta: true,
    },
  });

  if (!item) return null;

  return {
    ...item,
    files: [...item.files].sort(
      (a, b) => Number(b.isPrimary) - Number(a.isPrimary) || a.filename.localeCompare(b.filename),
    ),
    screenshots: [...item.screenshots].sort((a, b) => a.position - b.position),
  };
});

export type CatalogueItem = NonNullable<Awaited<ReturnType<typeof getItem>>>;

/** Published slugs for one kind, for generateStaticParams and sitemaps. */
export async function listSlugs(kind: ItemKind): Promise<string[]> {
  const rows = await db
    .select({ slug: items.slug })
    .from(items)
    .where(publishedWhere(kind));
  return rows.map((row) => row.slug);
}

/** Tags in use within a kind, most common first. Drives the filter row. */
export async function listTags(kind: ItemKind): Promise<{ tag: string; count: number }[]> {
  const rows = await db
    .select({
      tag: sql<string>`unnest(${items.tags})`.as("tag"),
      count: sql<number>`count(*)::int`,
    })
    .from(items)
    .where(publishedWhere(kind))
    .groupBy(sql`1`)
    .orderBy(sql`2 desc`, sql`1 asc`);

  return rows;
}

/** Total published items per kind. Used on the home page counts. */
export async function countByKind(): Promise<Record<ItemKind, number>> {
  const rows = await db
    .select({ kind: items.kind, count: sql<number>`count(*)::int` })
    .from(items)
    .where(eq(items.status, "published"))
    .groupBy(items.kind);

  const counts = { map: 0, mod: 0, model: 0, weapon: 0, tool: 0 } as Record<
    ItemKind,
    number
  >;
  for (const row of rows) counts[row.kind] = row.count;
  return counts;
}

/** Bumps the counter when someone takes a copy. Fire and forget; never blocks. */
export async function recordDownload(itemId: string): Promise<void> {
  await db
    .update(items)
    .set({ downloadCount: sql`${items.downloadCount} + 1` })
    .where(eq(items.id, itemId));
}

/** Re-exported so pages do not each reach into the schema module. */
export { files, items, mapMeta, screenshots };
