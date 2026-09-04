/**
 * Where downloadables actually live.
 *
 * Files are stored in Cloudflare R2 and served from a public bucket domain, so
 * the site never proxies bytes. A permanent URL is the second commitment in the
 * build plan: a link pasted in Discord today should still work in ten years,
 * which means the URL must be a function of the stored key and nothing else.
 * No signed URLs, no expiring tokens, no ids that change when a row is edited.
 *
 * R2 is provisioned. The bucket serves from `files.redfaction4you.com`, and
 * `NEXT_PUBLIC_R2_PUBLIC_BASE` is set in both `.env.local` and production.
 *
 * The guard below still matters, and not only as history: a local run without
 * that variable, a preview deployment that never had it, and a fresh checkout
 * all reach this with nothing configured. In those cases it reports itself as
 * unconfigured and callers render an honest "not available" state rather than a
 * link to nowhere, which is the same bargain `discordConfigured` makes. It is
 * also what the download route tests before it redirects.
 */

const base = process.env.NEXT_PUBLIC_R2_PUBLIC_BASE?.replace(/\/+$/, "");

/** True once the bucket's public domain is known. */
export const storageConfigured = Boolean(base);

/**
 * Public URL for a stored object, or null when storage is not configured.
 *
 * Returning null rather than a broken string forces callers to handle the
 * unconfigured case, which is the whole point of the guard.
 */
export function publicUrl(storageKey: string): string | null {
  if (!base) return null;
  return `${base}/${storageKey.replace(/^\/+/, "")}`;
}

/** Human-readable file size. Archive files are small; this never needs TB. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
}
