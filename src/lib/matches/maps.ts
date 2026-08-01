/**
 * Map names, and the URLs they get.
 *
 * A map name arrives from the server as whatever the level file is called, which
 * is a human string with brackets and spaces in it: `Warlords Pro (No Amp)`. It
 * is the identifier the archive has, so it is the identifier a page is keyed on,
 * and it needs a url safe form.
 *
 * Deliberately not a stored slug column. Slugs get stale the moment a name is
 * corrected upstream, and the archive re-ingests names on every sync, so a
 * derived slug is always the slug of the name we hold. The cost is that two maps
 * whose names differ only in punctuation would collide, which no map on record
 * does; `mapBySlug` resolves against the real list rather than guessing, so a
 * collision would show up as the wrong map rather than a crash, and the list is
 * small enough to read.
 *
 * Pure, so `node --test` loads it directly.
 */

/** `Warlords Pro (No Amp)` becomes `warlords-pro-no-amp`. */
export function mapSlug(mapName: string): string {
  return (
    mapName
      .toLowerCase()
      .normalize("NFKD")
      // Anything that is not a letter or a digit becomes a separator, which
      // folds brackets, dots and runs of spaces into one hyphen.
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "map"
  );
}

/**
 * The map whose name produces this slug, or null.
 *
 * Resolved by slugging the known names rather than by unslugging the url, which
 * cannot be done: `no-amp` could have been `No Amp`, `No-Amp` or `no amp` and
 * nothing in the string says which.
 */
export function mapBySlug(slug: string, names: string[]): string | null {
  const wanted = slug.toLowerCase();
  return names.find((name) => mapSlug(name) === wanted) ?? null;
}
