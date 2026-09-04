/**
 * Where a file is about to go, and permission for the browser to put it there.
 *
 * The form asks this first, for every file it is about to send. It answers with
 * the storage key the file will live under, which is derived from the item's
 * address and never invented, and with a short-lived signed URL the browser can
 * PUT the bytes straight to. That direct upload is the point: it never touches
 * a serverless function, so it has no request body limit, and 195 of the 391
 * custom maps on the live server are over the 4 MB one.
 *
 * **The signed URL only works once the bucket has a CORS policy**, and our R2
 * API token cannot set one: it is an Object Read and Write token, and
 * GetBucketCors answers AccessDenied. Setting it is a one-time action in the
 * Cloudflare dashboard. Until it happens the browser's PUT fails at the network
 * layer, before any status code exists, so the form falls back to posting
 * through `/api/admin/upload` and this answer carries `serverPathLimitBytes` so
 * it knows in advance whether that fallback can carry this particular file.
 *
 * The signature covers the headers named in `headers`, so the browser has to
 * send exactly those and nothing that contradicts them. A mismatch is not a
 * refusal anybody can read: R2 answers SignatureDoesNotMatch and the form sees
 * a failed PUT it cannot tell apart from a missing CORS policy. Sending the map
 * back rather than documenting it elsewhere is what keeps the two ends in step.
 */
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { and, eq } from "drizzle-orm";

import { adminState } from "@/lib/admin-key";
import { db } from "@/lib/db";
import { items } from "@/lib/db/schema";
import { ITEM_KINDS, type ItemKind } from "@/lib/downloads";
import {
  contentTypeFor,
  screenshotKeyFor,
  slugFromName,
  storageKeyFor,
} from "@/lib/ingest-rules";
import {
  MAX_OBJECT_BYTES,
  OBJECT_CACHE_CONTROL,
  SERVER_PATH_LIMIT_BYTES,
} from "@/lib/ingest";
import { formatBytes, publicUrl } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Five minutes. Long enough to start an upload, short enough to be no use later. */
const EXPIRES_IN_SECONDS = 300;

/**
 * The same check `actions.ts` makes, written out again because `allowed()`
 * there is module-private.
 *
 * A route handler is a public endpoint whatever page called it, so guarding the
 * admin page and not this would hand a signed write URL for our bucket to
 * anybody who found the path. It is the first thing every handler here does.
 */
async function allowed(): Promise<boolean> {
  return (await adminState()).state === "allowed";
}

function fail(message: string, status: number, extra: Record<string, unknown> = {}) {
  return Response.json({ ok: false, error: message, ...extra }, { status });
}

/**
 * A client for signing, built here rather than borrowed from `r2.ts`.
 *
 * That module's client is deliberately private and its one exported write does
 * not presign, so this reads the same four variables in the same way. The same
 * arrangement `backup.ts` and the ingest CLI already have, and the duplication
 * is a dozen lines against a configuration that cannot drift because there is
 * only one set of variables to read.
 */
function bucketClient(): { s3: S3Client; bucket: string } | null {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET;

  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) return null;

  return {
    bucket,
    s3: new S3Client({
      region: "auto",
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId, secretAccessKey },
    }),
  };
}

export async function POST(request: Request) {
  if (!(await allowed())) {
    return fail("Not unlocked. Enter the admin key on /admin first.", 401);
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return fail("The request body is not JSON.", 400);
  }

  const kind = String(body.kind ?? "").trim().toLowerCase() as ItemKind;
  if (!ITEM_KINDS.includes(kind)) {
    return fail(`"${kind}" is not a shelf. Expected one of ${ITEM_KINDS.join(", ")}.`, 400);
  }

  /*
   * The slug goes through the same normaliser a filename does, with a sentinel
   * extension on the end so `baseName` has something to strip other than a dot
   * the person meant to keep. Without it a slug typed as "2.0 final" is read as
   * the file "2" and the item lives at /maps/2 forever.
   */
  const slug = slugFromName(`${String(body.slug ?? "").trim()}.slug`);
  if (!slug) {
    return fail(
      "That leaves no usable address. An item cannot live at an empty slug.",
      400,
    );
  }

  const filename = String(body.filename ?? "").trim();
  if (!filename) return fail("No filename was given.", 400);

  const sizeBytes = Number(body.sizeBytes);
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    return fail("The file size is missing or is not a number.", 400);
  }
  if (sizeBytes > MAX_OBJECT_BYTES) {
    return fail(
      `${filename} is ${formatBytes(sizeBytes)}, and R2 takes at most ` +
        `${formatBytes(MAX_OBJECT_BYTES)} in a single upload. Use the ingest CLI ` +
        `for a file this size: npm run ingest -- "<folder>" --go`,
      413,
      { sizeBytes, maxObjectBytes: MAX_OBJECT_BYTES },
    );
  }

  /*
   * A screenshot's position is part of its key, so the gallery order is in the
   * bucket rather than only in a column, exactly as the CLI writes it. The
   * download has no position: an item has one file and it is the item's own
   * name that identifies it.
   */
  const role = String(body.role ?? "download").trim().toLowerCase();
  if (role !== "download" && role !== "screenshot") {
    return fail(`"${role}" is not a role. Expected download or screenshot.`, 400);
  }

  const position = Number(body.position ?? 0);
  if (role === "screenshot" && (!Number.isInteger(position) || position < 0)) {
    return fail("A screenshot needs its position, counting from zero.", 400);
  }

  const key =
    role === "screenshot"
      ? screenshotKeyFor(kind, slug, position, filename)
      : storageKeyFor(kind, slug, filename);

  const configured = bucketClient();
  if (!configured) {
    /*
     * Storage degrades honestly rather than pretending. Without the bucket
     * there is nowhere to put anything, and a form that accepted a file and
     * then had nothing to show for it would be worse than a refusal.
     */
    return fail(
      "R2 is not configured on this deployment, so there is nowhere to put the file. " +
        "Needs R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and R2_BUCKET.",
      503,
    );
  }

  const contentType = contentTypeFor(filename);

  let url: string | null = null;
  let problem: string | null = null;
  try {
    url = await getSignedUrl(
      configured.s3,
      new PutObjectCommand({
        Bucket: configured.bucket,
        Key: key,
        ContentType: contentType,
        // The same day-long cache every other writer sets. Signed, so the
        // browser has to send it, which is why it is in `headers` below.
        CacheControl: OBJECT_CACHE_CONTROL,
      }),
      { expiresIn: EXPIRES_IN_SECONDS },
    );
  } catch (error) {
    /*
     * Signing is arithmetic over the credentials and does not talk to
     * Cloudflare, so this failing means the credentials themselves are
     * unusable. Reported rather than thrown: the form can still offer the
     * server path for a small file, which is more use than an error page.
     */
    problem = error instanceof Error ? error.message : String(error);
  }

  /*
   * Whether this item already exists, so the form can say "this replaces the
   * file on Ankh b12" rather than silently landing on it. Upserting by slug has
   * already cost this project a row once, and within one form it is catchable,
   * so it is caught. Only asked for the download, since a screenshot belongs to
   * whatever the download decides.
   */
  let existing: { title: string; status: string } | null = null;
  if (role === "download") {
    const [row] = await db
      .select({ title: items.title, status: items.status })
      .from(items)
      .where(and(eq(items.kind, kind), eq(items.slug, slug)))
      .limit(1);
    existing = row ?? null;
  }

  return Response.json({
    ok: true,
    kind,
    slug,
    filename,
    key,
    contentType,
    /** Null when signing failed. The form falls back to the server path. */
    url,
    problem,
    expiresInSeconds: EXPIRES_IN_SECONDS,
    /** Send these on the PUT verbatim. They are covered by the signature. */
    headers: { "content-type": contentType, "cache-control": OBJECT_CACHE_CONTROL },
    /** Where the object will be readable once it is there, or null if unconfigured. */
    publicUrl: publicUrl(key),
    /**
     * The ceiling on the fallback path, and whether this file clears it. A file
     * that does cannot be rescued by posting it through our own server, so the
     * form has to say what unblocks it instead of retrying into a 413.
     */
    serverPathLimitBytes: SERVER_PATH_LIMIT_BYTES,
    serverPathPossible: sizeBytes <= SERVER_PATH_LIMIT_BYTES,
    existing,
  });
}
