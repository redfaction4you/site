/**
 * How a file on somebody's disk becomes a catalogue entry.
 *
 * Deliberately imports nothing, so `node --test` can load it and so the ingest
 * CLI, which runs outside Next and builds its own database client, can share
 * exactly these rules rather than reimplementing them slightly differently.
 * That sharing is the point: the CLI decides a storage key, and a storage key
 * is a promise. It becomes the permanent public URL of the file, it is what a
 * link pasted into Discord resolves through, and it is `unique` in the
 * database. Two callers disagreeing about how to build one is how an archive
 * ends up with a file it cannot find and a row it cannot replace.
 */

/* --- names ---------------------------------------------------------------- */

/** The filename with no directory and no extension. */
export function baseName(filename: string): string {
  const base = filename.split(/[\\/]/).pop() ?? "";
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(0, dot) : base;
}

/** The lowercased extension including the dot, or "" when there is none. */
export function extensionOf(filename: string): string {
  const base = filename.split(/[\\/]/).pop() ?? "";
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(dot).toLowerCase() : "";
}

/**
 * A URL segment from a filename.
 *
 * The slug is the item's address forever, so it is built to be boring: ASCII,
 * lowercase, single hyphens, no leading or trailing punctuation. Everything the
 * archive is going to be fed is twenty years old and named accordingly, with
 * spaces, brackets, apostrophes, tildes and the occasional exclamation mark
 * (`dm- ARRRRRRGGGHHH!.rfl` and `DM-STUs Nighthawks~.rfl` are both real files on
 * our own servers), so this has to survive all of it and still produce
 * something a person would type.
 *
 * Returns "" when nothing usable survives, which the caller must treat as a
 * refusal rather than storing an item at an empty address.
 */
export function slugFromName(filename: string): string {
  return baseName(filename)
    .normalize("NFKD")
    // Strip combining marks, so an accented name folds to its ASCII skeleton
    // rather than losing the whole letter.
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    // A trailing hyphen can reappear after the length cap.
    .replace(/-+$/g, "");
}

/**
 * A readable title from a filename, for when nobody supplied one.
 *
 * Deliberately conservative. It splits on separators and tidies spacing, and it
 * does NOT try to capitalise: `ctfwlpro` is not "Ctfwlpro" to anybody, and a
 * wrong title that looks deliberate is worse than the raw name, which at least
 * reads as untouched. A person renames it later; this only has to be a
 * recognisable placeholder.
 */
export function titleFromName(filename: string): string {
  return baseName(filename)
    .replace(/[_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/* --- what kind of file is this ------------------------------------------- */

const IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp", ".gif"];

/** Screenshots, by extension. Content is sniffed separately where it matters. */
export function isImageName(filename: string): boolean {
  return IMAGE_EXTENSIONS.includes(extensionOf(filename));
}

/**
 * Files that are packaging rather than content, and are never the download.
 *
 * A folder recovered from a forum post routinely carries a readme, a Mac
 * resource fork and a Windows thumbnail cache. Treating one of those as the
 * item's file would publish an entry whose download is `Thumbs.db`.
 */
export function isNoiseName(filename: string): boolean {
  const base = (filename.split(/[\\/]/).pop() ?? "").toLowerCase();
  if (base.startsWith(".") || base.startsWith("._")) return true;
  return ["thumbs.db", "desktop.ini", ".ds_store", "item.json"].includes(base);
}

/**
 * The content type to serve a stored object as.
 *
 * Only types this archive actually holds. Anything unrecognised becomes
 * `application/octet-stream`, which is the honest answer and makes a browser
 * download it rather than try to display it.
 */
export function contentTypeFor(filename: string): string {
  switch (extensionOf(filename)) {
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".png":
      return "image/png";
    case ".webp":
      return "image/webp";
    case ".gif":
      return "image/gif";
    case ".zip":
      return "application/zip";
    case ".txt":
      return "text/plain; charset=utf-8";
    case ".pdf":
      return "application/pdf";
    default:
      return "application/octet-stream";
  }
}

/* --- where it goes -------------------------------------------------------- */

/**
 * The object key for an item's download.
 *
 * Shaped `catalogue/<kind>/<slug>/<filename>` so that the bucket stays legible
 * to a person with an S3 client, and so an item's objects sit together and can
 * be removed together when something has to genuinely stop being distributed.
 *
 * **The key is derived, never random.** It has to be, because re-ingesting a
 * corrected file must overwrite the old object rather than orphan it, and
 * because the public URL is a pure function of this and must not change when a
 * row is edited. The filename is sanitised rather than trusted: it arrives from
 * a zip somebody made in 2003 and could contain anything, including `../`.
 */
export function storageKeyFor(kind: string, slug: string, filename: string): string {
  const base = filename.split(/[\\/]/).pop() ?? "";
  const safe = base
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    // Runs collapse, so `dm- ARRRRRRGGGHHH!.rfl` does not become `dm--...-.rfl`.
    // This is a permanent public URL and it is worth it being readable. It
    // cannot collide: an item has exactly one download, and screenshot keys are
    // numbered by position before they reach here.
    .replace(/-{2,}/g, "-")
    .replace(/^[-.]+/, "")
    .slice(0, 120);
  return `catalogue/${kind}/${slug}/${safe || "file"}`;
}

/** Screenshot keys sit under the item, numbered so their order is in the key. */
export function screenshotKeyFor(
  kind: string,
  slug: string,
  position: number,
  filename: string,
): string {
  const numbered = `${String(position + 1).padStart(2, "0")}-${filename}`;
  return storageKeyFor(kind, `${slug}/shots`, numbered);
}

/* --- the sidecar ---------------------------------------------------------- */

/**
 * What an `item.json` beside the file may say.
 *
 * The folder is the item: an archive, some screenshots, and optionally this to
 * carry what a filename cannot. Everything is optional and everything has a
 * derived fallback, so an archive dropped in with no sidecar still ingests.
 */
export type Sidecar = {
  title?: string;
  authorName?: string;
  summary?: string;
  description?: string;
  category?: string;
  releaseVersion?: string;
  /** `YYYY-MM-DD`, or a bare year, which becomes the first of January. */
  releasedOn?: string;
  tags?: string[];
  kind?: string;
  slug?: string;
  updates?: {
    title: string;
    body?: string;
    releaseVersion?: string;
    releasedAt?: string;
  }[];
};

/** A field-by-field complaint list. Empty means the sidecar is usable. */
export function validateSidecar(value: unknown): string[] {
  const problems: string[] = [];
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return ["item.json must be a JSON object"];
  }

  const sidecar = value as Record<string, unknown>;
  const strings = [
    "title",
    "authorName",
    "summary",
    "description",
    "category",
    "releaseVersion",
    "releasedOn",
    "kind",
    "slug",
  ];
  for (const field of strings) {
    if (sidecar[field] !== undefined && typeof sidecar[field] !== "string") {
      problems.push(`${field} must be a string`);
    }
  }

  if (sidecar.tags !== undefined) {
    if (!Array.isArray(sidecar.tags) || sidecar.tags.some((t) => typeof t !== "string")) {
      problems.push("tags must be an array of strings");
    }
  }

  if (sidecar.releasedOn !== undefined && typeof sidecar.releasedOn === "string") {
    if (!/^\d{4}(-\d{2}-\d{2})?$/.test(sidecar.releasedOn)) {
      problems.push("releasedOn must be YYYY-MM-DD or YYYY");
    }
  }

  if (sidecar.updates !== undefined) {
    if (!Array.isArray(sidecar.updates)) {
      problems.push("updates must be an array");
    } else {
      sidecar.updates.forEach((entry, index) => {
        if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
          problems.push(`updates[${index}] must be an object`);
          return;
        }
        const update = entry as Record<string, unknown>;
        if (typeof update.title !== "string" || update.title.trim() === "") {
          problems.push(`updates[${index}].title is required`);
        }
        if (
          update.releasedAt !== undefined &&
          (typeof update.releasedAt !== "string" ||
            Number.isNaN(Date.parse(update.releasedAt)))
        ) {
          problems.push(`updates[${index}].releasedAt must be a date`);
        }
      });
    }
  }

  return problems;
}

/**
 * A bare year becomes the first of January, and says so by being a real date.
 *
 * Most of this archive knows "2003" and nothing finer. Storing that as
 * `2003-01-01` is what the date column can hold; the listing prints the year
 * only, precisely so a default day is never shown as though somebody recorded
 * it.
 */
export function normaliseReleasedOn(value: string | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (/^\d{4}$/.test(trimmed)) return `${trimmed}-01-01`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  return null;
}

/**
 * Picks the one file that is the download, from everything in a folder.
 *
 * Screenshots and packaging are excluded, and what remains must be exactly one
 * file. Two candidates is not something to resolve by guessing: a folder with
 * `map.rfl` and `map_old.rfl` in it is a question for a person, and picking the
 * larger or the newer would be a coin toss recorded as a fact.
 */
export function chooseDownload(filenames: string[]): {
  file: string | null;
  images: string[];
  problem: string | null;
} {
  const usable = filenames.filter((name) => !isNoiseName(name));
  const images = usable.filter(isImageName).sort();
  const candidates = usable.filter((name) => !isImageName(name));

  if (candidates.length === 1) return { file: candidates[0], images, problem: null };
  if (candidates.length === 0) {
    return { file: null, images, problem: "no downloadable file, only images" };
  }
  return {
    file: null,
    images,
    problem: `${candidates.length} candidate files (${candidates.slice(0, 4).join(", ")}), expected one`,
  };
}
