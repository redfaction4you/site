/**
 * Nightly backup of everything the database holds, into R2.
 *
 * The second commitment in the build plan is that nothing here disappears. Up
 * to now that was a promise about permanent URLs with no copy behind it: the
 * entire match archive lived in one Neon database with nothing anywhere else.
 * A promise about permanence with no backup story is just a sentence.
 *
 * This is a logical dump rather than pg_dump: every table read out as JSON,
 * gzipped, written to one object per day. At this scale that is simpler than
 * managing a binary tool in a serverless function, and it has a property a
 * pg_dump does not: anyone can read it. That matters for the third commitment
 * too, since publishing what we hold is the mitigation for being a single point
 * of failure for this history.
 *
 * Restoring is inserting the rows back. No proprietary format, no version
 * coupling, no tooling required beyond something that reads JSON.
 */
import { gzipSync } from "node:zlib";

import {
  DeleteObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

import { db } from "@/lib/db";
import {
  accounts,
  files,
  items,
  mapMeta,
  matchCaptures,
  matchPlayers,
  matches,
  nightColumns,
  screenshots,
  sessions,
  users,
} from "@/lib/db/schema";

/** Objects live under this prefix, one per day. */
const PREFIX = "backups/";

/**
 * How many daily backups to keep.
 *
 * Thirty days is enough to notice and recover from anything that goes wrong
 * quietly, which is the failure mode that matters: a bad ingest that corrupts
 * a night is only obvious once somebody looks.
 */
const KEEP_DAYS = 30;

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

export type BackupResult = {
  key: string;
  bytes: number;
  rows: Record<string, number>;
  pruned: number;
};

/**
 * Reads every table and writes one gzipped JSON object.
 *
 * Deliberately reads everything rather than doing an incremental diff. The
 * archive is small, a whole-database snapshot is trivially restorable, and an
 * incremental scheme is a thing that can be subtly wrong for months.
 */
export async function runBackup(): Promise<BackupResult> {
  const s3 = client();
  const bucket = process.env.R2_BUCKET;
  if (!s3 || !bucket) throw new Error("R2 is not configured");

  // Order matters on restore: parents before children, because of the foreign
  // keys. Kept as an array rather than an object so that order is explicit.
  const tables: [string, Promise<unknown[]>][] = [
    ["users", db.select().from(users)],
    ["accounts", db.select().from(accounts)],
    ["sessions", db.select().from(sessions)],
    ["items", db.select().from(items)],
    ["files", db.select().from(files)],
    ["map_meta", db.select().from(mapMeta)],
    ["screenshots", db.select().from(screenshots)],
    ["matches", db.select().from(matches)],
    ["match_players", db.select().from(matchPlayers)],
    ["match_captures", db.select().from(matchCaptures)],
    ["night_columns", db.select().from(nightColumns)],
  ];

  const data: Record<string, unknown[]> = {};
  const rows: Record<string, number> = {};

  for (const [name, query] of tables) {
    const result = await query;
    data[name] = result;
    rows[name] = result.length;
  }

  const takenAt = new Date();
  const document = {
    format: "rf4u-backup-v1",
    takenAt: takenAt.toISOString(),
    // Named so a restorer knows what order to insert in without guessing.
    tableOrder: tables.map(([name]) => name),
    rows,
    data,
  };

  const body = gzipSync(Buffer.from(JSON.stringify(document), "utf8"));
  const key = `${PREFIX}${takenAt.toISOString().slice(0, 10)}.json.gz`;

  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: "application/json",
      ContentEncoding: "gzip",
    }),
  );

  return { key, bytes: body.byteLength, rows, pruned: await prune(s3, bucket) };
}

/**
 * Deletes backups past the retention window.
 *
 * Runs after a successful write, never before, so a failure to upload can never
 * take the old copies with it.
 */
async function prune(s3: S3Client, bucket: string): Promise<number> {
  const listed = await s3.send(
    new ListObjectsV2Command({ Bucket: bucket, Prefix: PREFIX }),
  );

  const keys = (listed.Contents ?? [])
    .map((object) => object.Key)
    .filter((key): key is string => Boolean(key))
    // The key is the date, so lexical order is chronological order.
    .sort();

  const doomed = keys.slice(0, Math.max(0, keys.length - KEEP_DAYS));

  for (const key of doomed) {
    await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  }

  return doomed.length;
}

/** What exists, newest first. Used by the status endpoint. */
export async function listBackups(): Promise<
  { key: string; bytes: number; at: string | null }[]
> {
  const s3 = client();
  const bucket = process.env.R2_BUCKET;
  if (!s3 || !bucket) return [];

  const listed = await s3.send(
    new ListObjectsV2Command({ Bucket: bucket, Prefix: PREFIX }),
  );

  return (listed.Contents ?? [])
    .filter((object) => object.Key)
    .map((object) => ({
      key: object.Key as string,
      bytes: object.Size ?? 0,
      at: object.LastModified?.toISOString() ?? null,
    }))
    .sort((a, b) => b.key.localeCompare(a.key));
}
