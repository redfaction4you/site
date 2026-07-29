/**
 * Decrypts a backup so it can be read or restored.
 *
 *   npm run backup:read -- backups/2026-07-29.rf4ubk
 *   npm run backup:read -- backups/2026-07-29.rf4ubk --out day.json
 *
 * With no arguments it lists what exists.
 *
 * A backup nobody has ever opened is not a backup, it is a hope. This exists so
 * that reading one is a single command rather than a small project undertaken
 * on the worst possible day.
 *
 * Restoring is inserting the rows back in the order the file names in
 * `tableOrder`, which is parents before children so the foreign keys hold.
 */
import { createDecipheriv } from "node:crypto";
import { writeFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";

import { GetObjectCommand, ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";
import { config } from "dotenv";

config({ path: ".env.local" });

const MAGIC = Buffer.from("RF4UBK1\n", "utf8");

const {
  R2_ACCOUNT_ID,
  R2_ACCESS_KEY_ID,
  R2_SECRET_ACCESS_KEY,
  R2_BUCKET,
  BACKUP_ENCRYPTION_KEY,
} = process.env;

if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET) {
  console.error("R2 is not configured in .env.local");
  process.exit(1);
}

const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
});

const args = process.argv.slice(2);
const key = args.find((a) => !a.startsWith("--"));
const outIndex = args.indexOf("--out");
const outPath = outIndex >= 0 ? args[outIndex + 1] : null;

if (!key) {
  const listed = await s3.send(
    new ListObjectsV2Command({ Bucket: R2_BUCKET, Prefix: "backups/" }),
  );
  const objects = (listed.Contents ?? []).sort((a, b) =>
    String(b.Key).localeCompare(String(a.Key)),
  );

  if (objects.length === 0) {
    console.log("No backups found.");
  } else {
    console.log(`${objects.length} backup(s), newest first:\n`);
    for (const o of objects) {
      console.log(`  ${o.Key}  ${(o.Size / 1024).toFixed(1)} KB  ${o.LastModified?.toISOString()}`);
    }
    console.log(`\nRead one with:  npm run backup:read -- ${objects[0].Key}`);
  }
  process.exit(0);
}

if (!BACKUP_ENCRYPTION_KEY) {
  console.error("BACKUP_ENCRYPTION_KEY is not set. Without it the backup cannot be read.");
  process.exit(1);
}

const object = await s3.send(new GetObjectCommand({ Bucket: R2_BUCKET, Key: key }));
const raw = Buffer.from(await object.Body.transformToByteArray());

if (!raw.subarray(0, MAGIC.length).equals(MAGIC)) {
  console.error("Not an RF4U backup: magic header missing.");
  process.exit(1);
}

const iv = raw.subarray(MAGIC.length, MAGIC.length + 12);
const tag = raw.subarray(MAGIC.length + 12, MAGIC.length + 28);
const body = raw.subarray(MAGIC.length + 28);

const decipher = createDecipheriv("aes-256-gcm", Buffer.from(BACKUP_ENCRYPTION_KEY, "hex"), iv);
decipher.setAuthTag(tag);

let plain;
try {
  plain = Buffer.concat([decipher.update(body), decipher.final()]);
} catch {
  console.error("Decryption failed. Wrong key, or the file has been tampered with.");
  process.exit(1);
}

const document = JSON.parse(gunzipSync(plain).toString("utf8"));

console.log(`  format:   ${document.format}`);
console.log(`  taken at: ${document.takenAt}`);
console.log(`  rows:`);
for (const [table, count] of Object.entries(document.rows)) {
  console.log(`    ${table.padEnd(16)} ${count}`);
}
console.log(`  restore order: ${document.tableOrder.join(", ")}`);

if (outPath) {
  writeFileSync(outPath, JSON.stringify(document, null, 2));
  console.log(`\n  written to ${outPath}`);
  console.log("  NOTE: this file is the decrypted database. Delete it when done.");
}
