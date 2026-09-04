/**
 * Turning stored objects into a catalogue entry.
 *
 * By the time this is called the bytes are already in the bucket, put there
 * either by the browser talking straight to R2 or by `/api/admin/upload`. This
 * is the half that reads them, writes the rows and answers with the address the
 * item now lives at. It is deliberately the same half for both paths: how a
 * file got into the bucket must not change what the archive records about it,
 * or the catalogue ends up with two shapes of row.
 *
 * **It accepts keys but does not trust them.** Every key is rebuilt from the
 * item's own address with `storageKeyFor` and `screenshotKeyFor` and compared
 * against what was sent. Anything else would let a request name an object it
 * had no business naming and hang a public download row off it, and the
 * encrypted database backups live in the same bucket.
 *
 * **Inspection reads the object back, and only sometimes.** Compatibility
 * detection needs the actual bytes, and on the direct path they never came
 * through here, so the only way to look inside is to fetch the object from its
 * public URL. That is right for a map and absurd for a 379 MB mod, so anything
 * over the ceiling in `ingest.ts` is stored without a compatibility row and
 * says so. An item with no compatibility row is honest; a function that runs
 * out of memory halfway through a commit is not, and it would leave the object
 * in the bucket with nothing pointing at it.
 */
import { revalidatePath } from "next/cache";

import { adminState } from "@/lib/admin-key";
import { ITEM_KINDS, type ItemKind } from "@/lib/downloads";
import {
  extensionOf,
  normaliseReleasedOn,
  screenshotKeyFor,
  slugFromName,
  storageKeyFor,
} from "@/lib/ingest-rules";
import {
  INSPECTION_CEILING_BYTES,
  ingestUploaded,
  inspectStored,
  sha256Of,
  type IngestScreenshot,
} from "@/lib/ingest";
import type { ArchiveInspection } from "@/lib/rfl";
import { formatBytes, publicUrl } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Long enough to pull a large map back out of the bucket and parse it. */
export const maxDuration = 60;

/**
 * The same check `actions.ts` makes, written out again because `allowed()`
 * there is module-private. This one writes to the catalogue and can publish, so
 * it is the first thing that happens.
 */
async function allowed(): Promise<boolean> {
  return (await adminState()).state === "allowed";
}

function fail(message: string, status: number, extra: Record<string, unknown> = {}) {
  return Response.json({ ok: false, error: message, ...extra }, { status });
}

/**
 * The containers worth fetching back to look inside.
 *
 * Detection itself is by content and never by extension, because an extension
 * is a claim made by whoever renamed the file last. This is only deciding
 * whether to spend a download finding out: a `.v3d` model or a `.tga` texture
 * matches none of the three readers, so fetching one would cost bandwidth to
 * learn what its name already said.
 */
function mightHoldLevels(filename: string): boolean {
  return [".rfl", ".vpp", ".zip"].includes(extensionOf(filename));
}

/** What the bucket says about an object, without downloading it. */
async function headStored(url: string): Promise<{ found: boolean; sizeBytes: number | null }> {
  try {
    const response = await fetch(url, { method: "HEAD", cache: "no-store" });
    if (!response.ok) return { found: false, sizeBytes: null };
    const length = Number(response.headers.get("content-length"));
    return { found: true, sizeBytes: Number.isFinite(length) && length > 0 ? length : null };
  } catch {
    return { found: false, sizeBytes: null };
  }
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

  const slug = slugFromName(`${String(body.slug ?? "").trim()}.slug`);
  if (!slug) {
    return fail("That leaves no usable address. An item cannot live at an empty slug.", 400);
  }

  /* --- the download ------------------------------------------------------- */

  const file = (body.file ?? {}) as Record<string, unknown>;
  const filename = String(file.filename ?? "").trim();
  if (!filename) return fail("The upload has no filename.", 400);

  // `key` is accepted beside `storageKey` because the two upload routes answer
  // with the shorter name and it is an easy thing to carry through. Neither is
  // trusted: both are compared against what the key must be.
  const sentKey = String(file.storageKey ?? file.key ?? "").trim();
  const expectedKey = storageKeyFor(kind, slug, filename);
  if (sentKey !== expectedKey) {
    return fail(
      `That key does not belong to this item. ${filename} on ${kind}/${slug} is ` +
        `stored at ${expectedKey}, and the request said ${sentKey || "nothing"}.`,
      400,
    );
  }

  const declaredSize = Number(file.sizeBytes);
  if (!Number.isFinite(declaredSize) || declaredSize <= 0) {
    return fail("The file size is missing or is not a number.", 400);
  }

  const sentHash = String(file.sha256 ?? "").trim().toLowerCase();
  if (sentHash && !/^[0-9a-f]{64}$/.test(sentHash)) {
    return fail("That is not a SHA-256. Expected 64 hex characters.", 400);
  }

  /* --- the screenshots ---------------------------------------------------- */

  const sentShots = Array.isArray(body.screenshots) ? body.screenshots : [];
  const shots: IngestScreenshot[] = [];
  for (const [position, entry] of sentShots.entries()) {
    const shot = (entry ?? {}) as Record<string, unknown>;
    const shotName = String(shot.filename ?? "").trim();
    if (!shotName) return fail(`Screenshot ${position + 1} has no filename.`, 400);

    /*
     * The position is the array order and is baked into the key, which is what
     * makes the gallery order a property of the bucket rather than only of a
     * column. So a screenshot uploaded as the third one cannot be committed as
     * the first: its object is somewhere else.
     */
    const expectedShotKey = screenshotKeyFor(kind, slug, position, shotName);
    const sentShotKey = String(shot.storageKey ?? shot.key ?? "").trim();
    if (sentShotKey !== expectedShotKey) {
      return fail(
        `Screenshot ${position + 1} does not match its position. ${shotName} in ` +
          `slot ${position + 1} is stored at ${expectedShotKey}, and the request ` +
          `said ${sentShotKey || "nothing"}.`,
        400,
      );
    }

    shots.push({
      storageKey: expectedShotKey,
      caption: typeof shot.caption === "string" ? shot.caption : null,
    });
  }

  /* --- the date, which is the one field that can be typed wrongly --------- */

  /*
   * A date that will not parse is refused rather than quietly stored as null.
   * `normaliseReleasedOn` answers null both for "nothing was typed" and for
   * "that is not a date", and treating the second as the first would drop what
   * somebody was in the middle of writing and then report success. The same
   * reasoning `editItem` uses.
   */
  const releasedOnRaw = String(body.releasedOn ?? "").trim();
  const releasedOn = normaliseReleasedOn(releasedOnRaw);
  if (releasedOnRaw && !releasedOn) {
    return fail(
      `"${releasedOnRaw}" is not a date this understands. Use YYYY-MM-DD, or just ` +
        `the year if that is all anybody knows.`,
      400,
    );
  }

  /* --- what is actually in the bucket ------------------------------------- */

  const warnings: string[] = [];
  const href = publicUrl(expectedKey);

  let sizeBytes = declaredSize;
  if (!href) {
    /*
     * Storage reads are unconfigured, which is a real local state rather than a
     * fault: `NEXT_PUBLIC_R2_PUBLIC_BASE` is a separate variable from the four
     * that let something be written. The row is still worth writing, and the
     * item simply carries no compatibility data and an unverified size.
     */
    warnings.push(
      "NEXT_PUBLIC_R2_PUBLIC_BASE is unset, so the stored file could not be read " +
        "back. The item has no compatibility row and its size is the browser's word.",
    );
  } else {
    const head = await headStored(href);
    if (!head.found) {
      /*
       * Reported and not refused. The browser only calls this after its upload
       * came back successful, and a public URL goes through a CDN that can
       * answer for a key it has not seen yet. Refusing here would throw away a
       * good upload over a cache; saying so leaves somebody able to check.
       */
      warnings.push(
        `The object at ${expectedKey} could not be confirmed through the public ` +
          `domain. The row was written because the upload reported success, but ` +
          `open the download once to be sure.`,
      );
    } else if (head.sizeBytes !== null) {
      if (head.sizeBytes !== declaredSize) {
        warnings.push(
          `The bucket holds ${formatBytes(head.sizeBytes)} where the browser said ` +
            `${formatBytes(declaredSize)}. The stored size is what was recorded.`,
        );
      }
      // The bucket's own figure wins over anything the request claimed, since
      // it describes the object the download link actually serves.
      sizeBytes = head.sizeBytes;
    }
  }

  /* --- reading it, when reading it is affordable -------------------------- */

  /*
   * Bytes are pulled back for two reasons: to look for levels inside, and to
   * hash the file when nothing else has. The fallback path hashes as it goes
   * and the browser can hash before it uploads, so this is usually skipped, and
   * it is skipped outright above the ceiling.
   */
  const wantsInspection = mightHoldLevels(filename);
  const wantsHash = sentHash === "";
  const affordable = sizeBytes <= INSPECTION_CEILING_BYTES;

  let inspection: ArchiveInspection | null = null;
  let sha256 = sentHash;

  if ((wantsInspection || wantsHash) && affordable && href) {
    try {
      const response = await fetch(href, { cache: "no-store" });
      if (!response.ok) throw new Error(`the bucket answered ${response.status}`);
      const bytes = new Uint8Array(await response.arrayBuffer());

      const stored = sha256Of(bytes);
      if (sentHash && sentHash !== stored) {
        /*
         * The bytes in the bucket are not the bytes the browser had. That is a
         * corrupted or truncated upload, and it is the one thing here worth
         * refusing outright: publishing it would put a broken download on a
         * shelf with a hash saying it was fine. Nothing has been written yet,
         * so uploading again is the whole fix.
         */
        return fail(
          `The stored file does not match the one that was uploaded. Expected ` +
            `${sentHash} and the bucket holds ${stored}, so the upload was ` +
            `corrupted. Nothing was written. Upload it again.`,
          409,
          { expected: sentHash, stored },
        );
      }
      sha256 = stored;

      if (wantsInspection) {
        inspection = inspectStored(bytes, filename, (reason) => warnings.push(reason));
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      warnings.push(`could not read ${expectedKey} back out of the bucket: ${reason}`);
    }
  } else if (wantsInspection && !affordable) {
    warnings.push(
      `${formatBytes(sizeBytes)} is over the ${formatBytes(INSPECTION_CEILING_BYTES)} ` +
        `inspection ceiling, so this was stored without reading what is inside it. ` +
        `The item has no compatibility row. Run npm run rfl against the file to see ` +
        `what it holds, or re-run the ingest CLI over it to fill the row in.`,
    );
  }

  /*
   * `files.sha256` cannot be null, and inventing one would be worse than
   * refusing: the column is how "nothing here disappears" gets verified rather
   * than merely asserted. The only way to reach this is a file too large to
   * read back that nobody hashed on the way in, and there are two clean ways
   * out of it.
   */
  if (!sha256) {
    const why = !href
      ? `the bucket cannot be read back on this deployment, NEXT_PUBLIC_R2_PUBLIC_BASE is unset`
      : `${formatBytes(sizeBytes)} is over the ${formatBytes(INSPECTION_CEILING_BYTES)} ` +
        `ceiling for reading a file back`;
    return fail(
      `${filename} arrived with no sha256 and none could be worked out here: ${why}. ` +
        `Send sha256 with the file, or use the ingest CLI, which hashes as it reads. ` +
        `Nothing was written.`,
      400,
      { sizeBytes, inspectionCeilingBytes: INSPECTION_CEILING_BYTES },
    );
  }

  /* --- the write ---------------------------------------------------------- */

  try {
    const result = await ingestUploaded({
      kind,
      slug,
      title: typeof body.title === "string" ? body.title : null,
      authorName: typeof body.authorName === "string" ? body.authorName : null,
      summary: typeof body.summary === "string" ? body.summary : null,
      description: typeof body.description === "string" ? body.description : null,
      category: typeof body.category === "string" ? body.category : null,
      releaseVersion:
        typeof body.releaseVersion === "string" ? body.releaseVersion : null,
      releasedOn,
      tags: Array.isArray(body.tags) ? (body.tags as string[]) : null,
      publish: body.publish === true,
      file: {
        storageKey: expectedKey,
        filename,
        sizeBytes,
        sha256,
        contentType: typeof file.contentType === "string" ? file.contentType : null,
      },
      screenshots: shots,
      inspection,
    });

    /*
     * The shelves, the hub, the search and the front page all read this table,
     * and a published upload that does not appear until the cache turns over
     * looks exactly like an upload that failed. Blunt and correct, the same
     * call every action on the admin page makes.
     */
    revalidatePath("/", "layout");

    return Response.json({
      ok: true,
      ...result,
      warnings: [...result.warnings, ...warnings],
    });
  } catch (error) {
    /*
     * The objects are in the bucket and the row is not, which is the recoverable
     * direction: the keys are derived, so committing again overwrites rather
     * than orphaning. Say that, because otherwise the obvious next move is to
     * upload the whole file a second time.
     */
    const reason = error instanceof Error ? error.message : String(error);
    console.error("[upload/commit]", reason);
    return fail(
      `The file is stored but the catalogue row was not written: ${reason} ` +
        `Nothing was lost. Fix the problem and commit again, which overwrites ` +
        `rather than duplicating.`,
      500,
    );
  }
}
