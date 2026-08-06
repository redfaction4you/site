/**
 * Where this site lives, in one place.
 *
 * It was written out separately in `layout.tsx` and in the Discord announcer,
 * with the same fallback, which is fine until a third caller wants it and the
 * two have drifted. The sitemap and robots file need absolute URLs, so it is a
 * constant now.
 *
 * `NEXT_PUBLIC_SITE_URL` is read at build time like any other public variable.
 * The fallback is the real domain rather than localhost on purpose: a sitemap
 * full of `http://localhost:3000` published to production is worse than one
 * pointing at the right place from a preview.
 */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://redfaction4you.com"
).replace(/\/$/, "");

/** An absolute URL for a site-relative path, for the places that need one. */
export function absoluteUrl(path: string): string {
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}
