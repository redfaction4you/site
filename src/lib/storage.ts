/**
 * Where downloadables actually live.
 *
 * Files are stored in Cloudflare R2 and served from a public bucket domain, so
 * the site never proxies bytes. A permanent URL is the second commitment in the
 * build plan: a link pasted in Discord today should still work in ten years,
 * which means the URL must be a function of the stored key and nothing else.
 * No signed URLs, no expiring tokens, no ids that change when a row is edited.
 *
 * R2 is not provisioned yet. Until `NEXT_PUBLIC_R2_PUBLIC_BASE` is set, this
 * reports itself as unconfigured and callers render an honest "not available"
 * state rather than a link to nowhere.
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
