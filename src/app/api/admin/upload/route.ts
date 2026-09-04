/**
 * The fallback: the bytes come through our own server on their way to R2.
 *
 * This exists because the direct upload cannot work until somebody sets a CORS
 * policy on the bucket, and our R2 API token is not allowed to set one. Until
 * that happens the browser's PUT fails before it has a status code, and this is
 * what the form falls back to.
 *
 * **It has a hard ceiling and roughly half the archive is over it.** Vercel
 * caps a function's request body at 4.5 MB; of the 391 custom maps on the live
 * server, 195 are larger than 4 MB and the largest is 379 MB. So this path is
 * genuinely a stopgap for small files rather than a second way of doing the
 * job, and the form says so rather than discovering it per file.
 *
 * The size is checked here as well as in the browser, because a route handler
 * is a public endpoint. But the check that matters to a person is the one the
 * form makes before sending: a body over Vercel's own limit is refused at the
 * edge with an HTML error page this code never runs to see, so the readable
 * message has to be produced before the request is made rather than after.
 *
 * The key is derived here rather than accepted, from the same rules the CLI
 * uses. Nothing a caller sends decides where an object lands, which is what
 * keeps a stray request from writing over something it should not be able to
 * name.
 */
import { adminState } from "@/lib/admin-key";
import { ITEM_KINDS, type ItemKind } from "@/lib/downloads";
import {
  contentTypeFor,
  screenshotKeyFor,
  slugFromName,
  storageKeyFor,
} from "@/lib/ingest-rules";
import { SERVER_PATH_LIMIT_BYTES, sha256Of } from "@/lib/ingest";
import { canWriteToStorage, putPublicObject } from "@/lib/r2";
import { formatBytes, publicUrl } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Reading a few megabytes and putting them in a bucket. Generous, not slow. */
export const maxDuration = 60;

/**
 * The same check `actions.ts` makes, written out again because `allowed()`
 * there is module-private. A route handler is a public endpoint whatever page
 * called it, and this one writes to a public bucket.
 */
async function allowed(): Promise<boolean> {
  return (await adminState()).state === "allowed";
}

function fail(message: string, status: number, extra: Record<string, unknown> = {}) {
  return Response.json({ ok: false, error: message, ...extra }, { status });
}

/** The refusal both size checks give, in the same words, naming both figures. */
function tooLarge(name: string, sizeBytes: number) {
  return fail(
    `${name} is ${formatBytes(sizeBytes)} and this path takes at most ` +
      `${formatBytes(SERVER_PATH_LIMIT_BYTES)}, because the request has to fit ` +
      `inside a serverless function. The direct upload to R2 has no such limit ` +
      `and needs a CORS policy on the bucket; until that is set, a file this ` +
      `size has to go through the ingest CLI.`,
    413,
    { sizeBytes, limitBytes: SERVER_PATH_LIMIT_BYTES },
  );
}

export async function POST(request: Request) {
  if (!(await allowed())) {
    return fail("Not unlocked. Enter the admin key on /admin first.", 401);
  }

  if (!canWriteToStorage()) {
    return fail(
      "R2 is not configured on this deployment, so there is nowhere to put the file. " +
        "Needs R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and R2_BUCKET.",
      503,
    );
  }

  /*
   * Refused on the declared length before the body is read, so an oversized
   * upload costs a header rather than the memory to buffer it. The file's own
   * size is checked again below, since a content-length is a claim.
   */
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(declared) && declared > SERVER_PATH_LIMIT_BYTES) {
    return tooLarge("That upload", declared);
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return fail(`That is not a readable multipart form: ${reason}`, 400);
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return fail("No file was attached under the field name `file`.", 400);
  }

  const kind = String(form.get("kind") ?? "").trim().toLowerCase() as ItemKind;
  if (!ITEM_KINDS.includes(kind)) {
    return fail(`"${kind}" is not a shelf. Expected one of ${ITEM_KINDS.join(", ")}.`, 400);
  }

  const slug = slugFromName(`${String(form.get("slug") ?? "").trim()}.slug`);
  if (!slug) {
    return fail("That leaves no usable address. An item cannot live at an empty slug.", 400);
  }

  // The browser's own name for the file, unless the form overrode it. Sanitised
  // by `storageKeyFor` on the way into a key, never trusted as it arrives.
  const filename = String(form.get("filename") ?? "").trim() || file.name.trim();
  if (!filename) return fail("The attached file has no name.", 400);

  const role = String(form.get("role") ?? "download").trim().toLowerCase();
  if (role !== "download" && role !== "screenshot") {
    return fail(`"${role}" is not a role. Expected download or screenshot.`, 400);
  }

  const position = Number(form.get("position") ?? 0);
  if (role === "screenshot" && (!Number.isInteger(position) || position < 0)) {
    return fail("A screenshot needs its position, counting from zero.", 400);
  }

  if (file.size > SERVER_PATH_LIMIT_BYTES) return tooLarge(filename, file.size);

  const key =
    role === "screenshot"
      ? screenshotKeyFor(kind, slug, position, filename)
      : storageKeyFor(kind, slug, filename);

  const bytes = new Uint8Array(await file.arrayBuffer());
  const contentType = contentTypeFor(filename);

  /*
   * Hashed here because the bytes are here. On the direct path the browser has
   * to do it, or the commit reads the object back to work it out, and both are
   * more expensive than hashing something already in memory.
   */
  const sha256 = sha256Of(bytes);

  const stored = await putPublicObject(key, bytes, contentType);
  if (!stored) {
    /*
     * `putPublicObject` never throws and answers only true or false, having
     * already logged the reason. There is nothing more to tell the form than
     * that R2 would not take it, so say that plainly rather than inventing a
     * cause.
     */
    return fail(
      `R2 would not accept ${key}. The reason is in the server log; the file was not stored.`,
      502,
    );
  }

  return Response.json({
    ok: true,
    key,
    filename,
    sizeBytes: file.size,
    sha256,
    contentType,
    publicUrl: publicUrl(key),
  });
}
