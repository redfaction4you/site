/**
 * Writing an upload into the catalogue.
 *
 * This is the server side twin of `scripts/ingest.mjs`, and the two have to
 * agree about everything they derive. The CLI reads a folder off a disk; this
 * reads objects that are already in the bucket, put there either by the
 * browser talking straight to R2 or by our own upload route. What happens after
 * the bytes are stored is the same job in both cases, and it is written twice
 * only because the CLI runs under plain `node`, outside Next, where `@/lib`
 * anything that touches the database does not resolve.
 *
 * **Where the two disagree, the archive gets two shapes of row**, which is the
 * failure this file is written to avoid. So every derived value comes from
 * `@/lib/ingest-rules` or `@/lib/downloads` rather than being restated here:
 * the storage key, the slug, the title placeholder, the content type, the
 * category read off the level names. If a rule needs changing, it changes in
 * one of those two modules and both writers follow.
 *
 * The three things a reader of the CLI will recognise, because they are
 * load-bearing there and here:
 *
 * **Ids come from the application, never from Postgres.** Every id in the
 * catalogue tables is a `$defaultFn`, which leaves no `DEFAULT` on the column.
 * They are supplied explicitly below even where Drizzle would fill them in,
 * because the item's id is needed before its row exists in order to hang the
 * file, the screenshots and the compatibility row off it.
 *
 * **A re-upload fills gaps and never overwrites editorial work.** The bytes
 * decide the derived things, so `files`, `screenshots` and `map_meta` are
 * replaced outright. Everything a person types into /admin, a title, a summary,
 * an author, is only written where the row does not already have one, because
 * somebody correcting an entry and then re-uploading a fixed file must not lose
 * the evening they spent on it. What the form says still wins, since that is a
 * person saying what the entry is.
 *
 * **The file row is upserted on its storage key rather than replaced.**
 * `files.id` is the address of `/api/download/[fileId]`, and a link pasted into
 * Discord must not stop resolving because somebody uploaded the map again.
 */
import { createHash, randomUUID } from "node:crypto";

import { and, eq, ne, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";

import { db } from "@/lib/db";
import { files, items, mapMeta, screenshots } from "@/lib/db/schema";
import { SECTION_BY_KIND, categoryFromLevels, type ItemKind } from "@/lib/downloads";
import { contentTypeFor, titleFromName } from "@/lib/ingest-rules";
import {
  inspectUpload,
  looksLikeRfl,
  looksLikeVpp,
  looksLikeZip,
  type ArchiveInspection,
} from "@/lib/rfl";

/* --- the limits, which are the whole reason the form has two paths --------- */

/**
 * The most a file may be when it comes through our own server.
 *
 * Vercel caps a serverless function's request body at 4.5 MB and answers
 * anything larger itself, with an HTML error page our code never sees. So this
 * sits below that with room for multipart framing, the field names and the
 * boundary, which are part of the same body as the file.
 *
 * It is a real ceiling on a real archive rather than a theoretical one: of the
 * 391 custom maps on the live server, 195 are over 4 MB and the largest is
 * 379 MB. Which is why this path is the fallback and not the plan. The browser
 * uploading straight to R2 has no such limit, and the only thing standing
 * between us and that is a CORS policy on the bucket that our API token is not
 * allowed to set.
 *
 * Exported so the form can refuse a file before posting it. Vercel's own 413
 * arrives as HTML from an edge that never ran our code, so a size check made
 * after the request has been sent cannot produce a readable message.
 */
export const SERVER_PATH_LIMIT_BYTES = 4 * 1024 * 1024;

/**
 * The most we will pull back out of the bucket in order to read it.
 *
 * Compatibility detection needs the actual bytes, and on the direct path they
 * went from the browser to R2 without passing through here, so the only way to
 * inspect them is to fetch the object back. That is fine for a map and absurd
 * for a 379 MB mod: a function that runs out of memory takes the whole commit
 * with it, and the item would be left with its object in the bucket and no row
 * pointing at it.
 *
 * **An item with no compatibility row is honest. An out of memory function is
 * not.** Above this the inspection is skipped and the commit says so, which
 * costs a "plays on" badge and nothing else. `npm run rfl` reads such a file
 * locally, and re-running the CLI over it fills the row in later.
 */
export const INSPECTION_CEILING_BYTES = 64 * 1024 * 1024;

/**
 * The most R2 accepts in one PUT.
 *
 * Beyond this an upload has to be split into parts and reassembled, which is a
 * different protocol and a different form. Nothing in the archive is close, and
 * refusing by name beats a signed URL that answers 400 an hour into an upload.
 */
export const MAX_OBJECT_BYTES = 5 * 1024 * 1024 * 1024;

/** What every object this site writes is stored with. Matches `r2.ts`. */
export const OBJECT_CACHE_CONTROL = "public, max-age=86400";

/* --- reading the bytes ---------------------------------------------------- */

/** Hex SHA-256, the same value the CLI stores and the schema documents. */
export function sha256Of(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/**
 * Reads what is inside an upload, or answers null because it is not a level.
 *
 * The sniff in front of `inspectUpload` is a gate rather than an optimisation.
 * That function throws on a container it does not recognise, which is right for
 * a parser and wrong here, because most of the Assets shelf is `.v3d` models,
 * `.vbm` and `.tga` textures and `.wav` sounds, and none of the three
 * containers recognises any of them. Asking first is what lets an asset through
 * the same code path as a map.
 *
 * `filename` matters for exactly one case and it is worth passing. A zip or a
 * packfile carries its entries' names inside it; a bare `.rfl` is nothing but
 * level bytes, and Red Faction keeps the game type in the filename prefix and
 * nowhere else. Without the name every bare level arrives uncategorised.
 *
 * A readable container whose contents will not parse is a real download that is
 * still worth keeping, so it costs the compatibility row rather than the entry
 * and reports why through `onProblem`.
 */
export function inspectStored(
  bytes: Uint8Array,
  filename?: string,
  onProblem?: (reason: string) => void,
): ArchiveInspection | null {
  if (!looksLikeRfl(bytes) && !looksLikeVpp(bytes) && !looksLikeZip(bytes)) return null;

  try {
    return inspectUpload(bytes, filename);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    onProblem?.(`looked like a known container but did not parse: ${reason}`);
    return null;
  }
}

/** The level list in the shape `map_meta.levels` stores. */
function levelsOf(inspection: ArchiveInspection | null) {
  return (inspection?.levels ?? []).map((level) => ({
    path: level.path,
    version: level.header.version,
    levelName: level.header.levelName,
  }));
}

/* --- tidying what the form sent ------------------------------------------- */

function trimmedOrNull(value: unknown, limit: number): string | null {
  const trimmed = typeof value === "string" ? value.trim().slice(0, limit) : "";
  return trimmed === "" ? null : trimmed;
}

/**
 * Tags, lowercased and deduplicated, exactly as the admin edit form does them.
 *
 * The tag filter is a link carrying the tag verbatim, so `CTF` stored beside
 * `ctf` is two chips for one idea, each finding half the shelf, with nothing
 * about either page looking wrong. Capped in both directions because this ends
 * up in a URL.
 *
 * **Nothing usable answers null, not an empty list**, which is the same reading
 * `trimmedOrNull` above gives a blank string and the same one the CLI gives a
 * sidecar with no `tags` key. The difference matters because these values are
 * coalesced onto the row: null leaves the stored tags alone, while `[]` is a
 * real value that assigns, so an upload arriving with no tags would silently
 * clear the ones somebody typed into /admin. Emptying a tag list deliberately is
 * `editItem`'s job, where the box is pre-filled with what is stored and clearing
 * it plainly means clearing them. An upload has no such box to read.
 */
function cleanTags(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const seen = new Set<string>();
  for (const entry of value) {
    if (typeof entry !== "string") continue;
    const tag = entry.trim().toLowerCase().slice(0, 32);
    if (tag) seen.add(tag);
  }
  return seen.size === 0 ? null : [...seen].slice(0, 12);
}

/* --- the write ------------------------------------------------------------ */

export type IngestFile = {
  /** Where the object actually is. Derived by `storageKeyFor`, never invented. */
  storageKey: string;
  filename: string;
  sizeBytes: number;
  sha256: string;
  contentType?: string | null;
};

export type IngestScreenshot = {
  storageKey: string;
  caption?: string | null;
};

export type IngestUploadedInput = {
  kind: ItemKind;
  slug: string;
  title?: string | null;
  authorName?: string | null;
  summary?: string | null;
  description?: string | null;
  category?: string | null;
  releaseVersion?: string | null;
  /** Already `YYYY-MM-DD`. Callers run `normaliseReleasedOn` first. */
  releasedOn?: string | null;
  tags?: string[] | null;
  /** Default false, the same default the CLI has and for the same reason. */
  publish?: boolean;
  file: IngestFile;
  screenshots?: IngestScreenshot[];
  /** What the parser found, or null for anything that is not a level. */
  inspection?: ArchiveInspection | null;
};

export type IngestUploadedResult = {
  itemId: string;
  kind: ItemKind;
  slug: string;
  /** Where the item lives on the site, e.g. `/maps/ctf-ankh`. */
  url: string;
  /** False when this replaced an item that was already there. */
  created: boolean;
  status: "draft" | "published" | "hidden";
  category: string | null;
  levels: number;
  screenshots: number;
  /** Anything a person should look at. Never silently dropped. */
  warnings: string[];
};

/**
 * Puts one already-uploaded file into the catalogue.
 *
 * Everything it writes assumes the objects are in the bucket already. That
 * ordering is the safe one of the two and the CLI takes it for the same reason:
 * an object nothing references is a few kilobytes going spare, while a row
 * referencing an object that is not there is a download button that hands
 * somebody a 404, and the site cannot tell the difference from the inside.
 *
 * Throws on anything structurally impossible, an unknown kind, an empty slug, a
 * key outside `catalogue/`, so the route can answer with the reason. Those are
 * all conditions its caller has already checked; the check is repeated because
 * a function that writes to the catalogue should not depend on having been
 * called carefully.
 */
export async function ingestUploaded(
  input: IngestUploadedInput,
): Promise<IngestUploadedResult> {
  const section = SECTION_BY_KIND[input.kind];
  if (!section) throw new Error(`"${input.kind}" is not one of the four shelves.`);

  const slug = input.slug.trim();
  if (!slug) throw new Error("An item cannot live at an empty address.");

  /*
   * The same refusal `r2.ts` makes, one layer up. The encrypted database
   * backups live in this bucket, and a row that pointed at one would publish
   * the identity keys the whole read layer is careful never to serve.
   */
  if (!input.file.storageKey.startsWith("catalogue/")) {
    throw new Error(`${input.file.storageKey} is not under catalogue/.`);
  }

  const warnings: string[] = [];
  const inspection = input.inspection ?? null;
  const levels = levelsOf(inspection);
  for (const warning of inspection?.warnings ?? []) warnings.push(warning);

  /*
   * The category a person chose wins and is refused outright when the shelf
   * does not offer it, because a typo stored here files the item under a facet
   * no chip links to, which is invisible rather than broken. A category read
   * off the level names is dropped in the same situation instead, since that
   * reading is ours rather than theirs: a mod that happens to ship CTF levels
   * should not be rejected for a derivation that was correct.
   */
  const offered = new Set(section.categories.map((entry) => entry.id));
  const stated = trimmedOrNull(input.category, 40)?.toLowerCase() ?? null;
  if (stated && !offered.has(stated)) {
    throw new Error(
      offered.size === 0
        ? `${section.title} has no categories, so "${stated}" cannot be one.`
        : `Category "${stated}" is not one of ${[...offered].join(", ")} for ${section.title}.`,
    );
  }
  const derivedRaw = categoryFromLevels(levels.map((level) => level.path));
  const derived = derivedRaw && offered.has(derivedRaw) ? derivedRaw : null;
  const category = stated ?? derived;

  const title = trimmedOrNull(input.title, 200);
  const summary = trimmedOrNull(input.summary, 300);
  const description = trimmedOrNull(input.description, 20000);
  const authorName = trimmedOrNull(input.authorName, 120);
  const releaseVersion = trimmedOrNull(input.releaseVersion, 24);
  const releasedOn = trimmedOrNull(input.releasedOn, 10);
  const tags = cleanTags(input.tags);
  const publish = input.publish === true;
  const shots = input.screenshots ?? [];

  /*
   * What is already there, read before anything is written so that the answer
   * can say whether this created an item or replaced one. `neon-http` cannot
   * hold a transaction open across an await, so this is a read and then one
   * batch rather than one interactive transaction.
   */
  const [existing] = await db
    .select({ id: items.id, status: items.status })
    .from(items)
    .where(and(eq(items.kind, input.kind), eq(items.slug, slug)))
    .limit(1);

  const itemId = existing?.id ?? randomUUID();
  const now = new Date();
  const contentType = input.file.contentType || contentTypeFor(input.file.filename);

  const statements: BatchItem<"pg">[] = [];

  /*
   * The upsert, on (kind, slug), which is the item's address and its unique
   * key. Every editorial field falls back to the column rather than being
   * assigned, so a re-upload fills gaps and never overwrites. The derived title
   * is an insert-time placeholder only, for the same reason: `ctf ankh b12` must
   * not replace a title somebody wrote out properly.
   *
   * `status` is never downgraded. Re-uploading a corrected file to a published
   * map must not take it off the shelf, and unticking publish on the form means
   * "leave it as it is" rather than "hide it". Unpublishing is its own action,
   * with its own reasoning about draft against hidden.
   */
  statements.push(
    db
      .insert(items)
      .values({
        id: itemId,
        kind: input.kind,
        slug,
        // `titleFromName` answers "" for a filename with nothing usable in it,
        // so the fallback is `||` rather than `??`: a nameless row on a shelf
        // is worse than the slug repeated.
        title: title ?? (titleFromName(input.file.filename) || slug),
        summary,
        description,
        authorName,
        status: publish ? "published" : "draft",
        releasedOn,
        category,
        releaseVersion,
        tags: tags ?? [],
        createdAt: now,
        updatedAt: now,
        publishedAt: publish ? now : null,
      })
      .onConflictDoUpdate({
        target: [items.kind, items.slug],
        set: {
          title: title ?? sql`${items.title}`,
          summary: summary ?? sql`${items.summary}`,
          description: description ?? sql`${items.description}`,
          authorName: authorName ?? sql`${items.authorName}`,
          releasedOn: releasedOn ?? sql`${items.releasedOn}`,
          releaseVersion: releaseVersion ?? sql`${items.releaseVersion}`,
          tags: tags ?? sql`${items.tags}`,
          category:
            stated ??
            (derived
              ? sql`coalesce(${items.category}, ${derived})`
              : sql`${items.category}`),
          status: publish ? "published" : sql`${items.status}`,
          // Stamped once and never restamped: every listing sorts "Newest" on
          // it, so a second upload of a map from 2003 must not put it back at
          // the top of the shelf.
          publishedAt: publish
            ? sql`coalesce(${items.publishedAt}, now())`
            : sql`${items.publishedAt}`,
          // New bytes for an existing item is the case "Recently updated" is
          // for, so the column that means the content changed moves.
          updatedAt: now,
        },
      }),
  );

  /*
   * Anything this item used to offer goes first, then the file row is upserted
   * on its storage key rather than deleted and recreated. `files.id` is what
   * `/api/download/[fileId]` is addressed by, and re-uploading a map must not
   * break the link somebody pasted into Discord, or reset the count behind it.
   */
  statements.push(
    db
      .delete(files)
      .where(and(eq(files.itemId, itemId), ne(files.storageKey, input.file.storageKey))),
  );
  statements.push(
    db
      .insert(files)
      .values({
        id: randomUUID(),
        itemId,
        storageKey: input.file.storageKey,
        filename: input.file.filename,
        sizeBytes: input.file.sizeBytes,
        sha256: input.file.sha256,
        contentType,
        isPrimary: true,
      })
      .onConflictDoUpdate({
        target: files.storageKey,
        set: {
          itemId,
          filename: input.file.filename,
          sizeBytes: input.file.sizeBytes,
          sha256: input.file.sha256,
          contentType,
          isPrimary: true,
        },
      }),
  );

  /*
   * Screenshots are keyed by position and the upload decides the order, so the
   * set is replaced whole. Their ids appear in no URL; the storage key is the
   * address of a picture.
   */
  statements.push(db.delete(screenshots).where(eq(screenshots.itemId, itemId)));
  shots.forEach((shot, position) => {
    statements.push(
      db.insert(screenshots).values({
        id: randomUUID(),
        itemId,
        storageKey: shot.storageKey,
        caption: trimmedOrNull(shot.caption, 200),
        position,
      }),
    );
  });

  /*
   * Compatibility is read from the bytes every time, so a fixed parser corrects
   * old rows simply by being run again, and an item that no longer reads as a
   * container loses the row rather than keeping a stale one.
   *
   * The row is written for anything holding levels, which is what the table is
   * for, plus the shelves that carry compatibility at all: a map or a mod with
   * no levels in it is worth recording precisely because somebody should look
   * at it, while a tool that happens to be a readable zip is a tool and the
   * empty finding says nothing anybody would read.
   */
  statements.push(db.delete(mapMeta).where(eq(mapMeta.itemId, itemId)));
  if (inspection && (levels.length > 0 || section.hasLevels)) {
    statements.push(
      db.insert(mapMeta).values({
        itemId,
        rflVersion: inspection.rflVersion,
        playsOn: inspection.playsOn,
        detectionConfidence: inspection.confidence,
        levels,
        warnings: inspection.warnings,
        detectedAt: now,
      }),
    );
  }

  /*
   * One batch, so the item is never briefly without its file. `db.batch`, not
   * `db.transaction`: `neon-http` cannot hold an interactive transaction across
   * awaits, which is why nothing in this codebase has ever used one. The match
   * ingest learned it the expensive way, with a delete awaited and an insert
   * awaited leaving a match with no players and a page rendered in the gap.
   */
  await db.batch(statements as [BatchItem<"pg">, ...BatchItem<"pg">[]]);

  return {
    itemId,
    kind: input.kind,
    slug,
    url: `${section.route}/${slug}`,
    created: !existing,
    status: publish ? "published" : (existing?.status ?? "draft"),
    category,
    levels: levels.length,
    screenshots: shots.length,
    warnings,
  };
}
