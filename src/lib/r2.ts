/**
 * Writing to the R2 bucket.
 *
 * `storage.ts` is the read half: it turns a stored key into the permanent public
 * URL. This is the write half, and it exists because the nightly column now
 * generates an illustration that has to live somewhere.
 *
 * Two things are worth knowing before adding a caller.
 *
 * The bucket is public. It has a custom domain attached, so every object in it
 * is downloadable by anyone who guesses the key. Nothing may be written here
 * that is not safe to publish. This is not theoretical: the first database
 * backup was readable at files.redfaction4you.com within seconds of being
 * written, and it contained the identity keys the whole read layer is careful
 * never to serve.
 *
 * Which is why `backups/` is refused outright below. Backups are encrypted and
 * written by `backup.ts`, which owns that prefix; an ordinary caller reaching
 * for it is a mistake rather than an intention, and the cost of that mistake is
 * a published database.
 */
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

/**
 * A separate client from the one in `backup.ts`, deliberately.
 *
 * Both read the same environment, so they cannot drift apart in configuration,
 * and the duplication is a dozen lines. Backups are the one path where a
 * mistake is not recoverable, so it keeps its own copy rather than depending on
 * a module that other features are free to change.
 */
function client(): S3Client | null {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

  if (!accountId || !accessKeyId || !secretAccessKey) return null;

  return new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
}

/** True once the bucket can be written to. Unconfigured is a normal state. */
export function canWriteToStorage(): boolean {
  return Boolean(client() && process.env.R2_BUCKET);
}

/**
 * Uploads one object. Returns true only if R2 accepted it.
 *
 * Never throws. Every caller so far is decoration on top of the archive, and a
 * failed upload must cost a picture rather than a page.
 */
export async function putPublicObject(
  key: string,
  body: Uint8Array,
  contentType: string,
): Promise<boolean> {
  const normalised = key.replace(/^\/+/, "");

  if (normalised.startsWith("backups/")) {
    console.warn(`[r2] refusing to write ${normalised}: backups/ belongs to backup.ts`);
    return false;
  }

  const s3 = client();
  const bucket = process.env.R2_BUCKET;
  if (!s3 || !bucket) return false;

  try {
    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: normalised,
        Body: body,
        ContentType: contentType,
        // A day, not a year, and not immutable. Some keys here are derived from
        // stable things like a match day, so the same key can legitimately be
        // written twice. Cloudflare held a deleted backup at the edge for four
        // hours once; an immutable year on an overwritable key would be the same
        // mistake with a longer tail.
        CacheControl: "public, max-age=86400",
      }),
    );
    return true;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.warn(`[r2] upload of ${normalised} failed: ${reason}`);
    return false;
  }
}
