/**
 * Reading what somebody typed into the search box.
 *
 * Two of the things a reader searches for are not words. A date is how you find
 * a night and a scoreline is how you find a match, and both are typed the way a
 * person says them rather than the way the archive stores them: `31/07/2026` for
 * a day whose URL is `2026-07-31`, `5-3` for a match that might have been 3-5
 * depending on which side the shuffle put them.
 *
 * Kept apart from `search.ts` because that file talks to the database and this
 * is pure string work, which means `node --test` can load it directly. The
 * parsing is the part most likely to be quietly wrong, and it is the only part
 * that can be tested without a database.
 *
 * Deliberately free of imports.
 */

/**
 * A day the archive could hold, from any way somebody would write one.
 *
 * Day first rather than month first, which is the ordering used everywhere else
 * on this site and by the people who play on it. `03/04/2026` is April the
 * third. There is no way to satisfy both readings and the wrong one silently
 * returns a different night, so the site's own convention wins and the search
 * page says which it is.
 */
export function asDay(query: string): string | null {
  const text = query.trim();

  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(text);
  if (iso) {
    const [, year, month, day] = iso;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  const written = /^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/.exec(text);
  if (written) {
    const [, day, month, year] = written;
    if (Number(month) > 12 || Number(day) > 31) return null;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  return null;
}

/**
 * A scoreline, if that is what it is.
 *
 * Returned unordered on purpose, and the caller matches it either way round. A
 * reader remembers that a match finished 5-3; they do not remember whether the
 * side that scored five was wearing red, and on this server the shirts get
 * reshuffled between matches anyway.
 */
export function asScore(query: string): [number, number] | null {
  const pair = /^(\d{1,2})\s*[-–—:]\s*(\d{1,2})$/.exec(query.trim());
  if (!pair) return null;
  return [Number(pair[1]), Number(pair[2])];
}
