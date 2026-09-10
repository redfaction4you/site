"use client";

import { contentTypeFor } from "@/lib/ingest-rules";
import { formatBytes } from "@/lib/storage";

/**
 * Getting one file from a browser into the bucket, and the only copy of that.
 *
 * This was the middle of `upload-admin.tsx` and it is here because a second
 * screen now needs it: adding screenshots to an item that already exists.
 * Copying the loop would have been quicker and it is exactly the arrangement
 * that goes wrong quietly, because the two copies do not fail in the same way.
 * One of them learns that the direct path is blocked and the other does not, or
 * one sends `cache-control` on the PUT and the other stops, and the second
 * screen breaks on a bucket where the first one works. The same reasoning that
 * keeps `ingest-rules.ts` shared between the CLI and the site: a storage key is
 * a promise, and two callers disagreeing about how to make one is how an
 * archive ends up with a file it cannot find.
 *
 * "use client" because all of it is browser machinery. `XMLHttpRequest` for
 * progress, `crypto.subtle` for the hash, `window.location.origin` for the CORS
 * policy it prints. Nothing here can run on the server and the directive is
 * what stops a server component importing it by accident.
 *
 * THE SIZE PROBLEM IS THE WHOLE DESIGN and it was measured rather than assumed.
 * The 391 custom maps on the live server average 14.6 MB, the largest is 379 MB,
 * and 195 of them are over 4 MB. Vercel caps a serverless function's request
 * body at 4.5 MB, so posting bytes through our own server carries about half the
 * archive and no more. Uploading straight from the browser to R2 with a
 * presigned PUT has no such limit and is what this reaches for first.
 *
 * The catch is that a direct PUT needs a CORS policy on the bucket, and our R2
 * API token cannot set one: it is an Object Read and Write token, and
 * GetBucketCors answers AccessDenied. That is a one-time action in the
 * Cloudflare dashboard, so until it is done the direct path fails, in the
 * browser, as a bare network error with no status and no body. Hence two paths
 * and a refusal that says which:
 *
 *   1. presigned PUT straight to R2, no size limit,
 *   2. the same bytes posted through our server when that fails and they fit,
 *   3. and when neither is possible, the CORS policy to paste and the CLI
 *      command, rather than a 413 or a spinner that never stops.
 */

/* --- the contract with the two upload routes ------------------------------ */

/**
 * What `POST /api/admin/upload/prepare` answers.
 *
 * `key` is the object key both paths land the bytes at, derived on the server by
 * `storageKeyFor` and never invented here, so that a form upload and an ingest
 * run cannot disagree about where a file lives. `url` is the presigned PUT, and
 * it is nullable because a deployment can be able to read from the bucket and
 * unable to sign for it, in which case `problem` says why.
 *
 * `headers` are signed into that url, so the PUT has to send exactly them.
 * `serverPathLimitBytes` is what the fallback route will accept, reported by the
 * side that knows rather than guessed at here.
 */
export type Prepared = {
  key: string;
  url: string | null;
  headers: Record<string, string>;
  serverPathLimitBytes: number;
  /** Why there is no signed url, when there is none. */
  problem: string | null;
};

/** What one transfer is doing, so a screen can show it rather than a spinner. */
export type Transfer = {
  name: string;
  bytes: number;
  sent: number;
  /** Which path carried it. Null until one has been tried. */
  via: "direct" | "server" | null;
  state: "waiting" | "reading" | "sending" | "done" | "failed";
};

export type Refusal = {
  message: string;
  /**
   * The policy to paste, set only when the browser was refused before it got a
   * reply, which is the one failure a CORS policy actually fixes. A signing
   * failure or a 403 from R2 is a different problem and pasting this would not
   * touch it.
   */
  cors: string | null;
  /** Whether the CLI is the way through this particular refusal. */
  cli: boolean;
};

/** One stored object, in the shape both commit paths want to hear about it. */
export type Stored = {
  storageKey: string;
  filename: string;
  sizeBytes: number;
  sha256: string | null;
  contentType: string;
  /** The position asked for, which is baked into a screenshot's key. */
  position: number | null;
};

/**
 * What this run has learned about the direct path, carried between files.
 *
 * A bucket with no CORS policy should cost one failed PUT and not one per file,
 * and the status has to live at the same scope as the verdict: only the first
 * file ever tries the direct route, so a status scoped to one file is null by
 * the time a later file is refused, which once produced a refusal reading
 * "refused with null" and hid the CORS policy on the one screen that prints it.
 */
export type DirectMemo = { works: boolean | null; status: number | null };

export function freshMemo(): DirectMemo {
  return { works: null, status: null };
}

/* --- constants ------------------------------------------------------------ */

/**
 * What the server path takes, for a sentence printed before anything has been
 * asked.
 *
 * `SERVER_PATH_LIMIT_BYTES` in `@/lib/ingest` is the real one and the only one
 * that decides anything: it comes back from `prepare` on every file and is what
 * a fallback is judged against. This copy exists because that module reaches the
 * database and must not be pulled into a browser bundle to read one number.
 * Being wrong here costs a hint under a file input; being wrong there costs an
 * upload that fails at the last byte.
 */
export const SERVER_PATH_HINT = 4 * 1024 * 1024;

/* --- pure helpers --------------------------------------------------------- */

/**
 * The bucket policy that turns the direct path on, built from the origin the
 * page is actually being served from so that pasting it works for production
 * and for a dev server alike.
 *
 * **Both headers matter.** The signed PUT carries `content-type` and
 * `cache-control`, because both are covered by the signature, and neither is a
 * header a browser will send cross-origin without the bucket having named it.
 * Leaving `cache-control` out of this list produces exactly the failure this
 * whole module exists to explain, on a bucket whose policy looks correct.
 */
export function corsPolicyFor(origin: string): string {
  return JSON.stringify(
    [
      {
        AllowedOrigins: [origin],
        AllowedMethods: ["PUT"],
        AllowedHeaders: ["content-type", "cache-control"],
        ExposeHeaders: ["etag"],
        MaxAgeSeconds: 3600,
      },
    ],
    null,
    2,
  );
}

/**
 * The reason inside a route's refusal, or something honest about the status.
 *
 * The routes answer `{ ok: false, error }`. R2 answers XML, and Vercel's own
 * 413 is an HTML page from an edge that never ran our code, so anything
 * unparseable falls back to the status and a short quotation rather than being
 * swallowed.
 */
export function reasonFrom(status: number, body: string): string {
  try {
    const parsed = JSON.parse(body) as { error?: unknown; problem?: unknown };
    for (const value of [parsed.error, parsed.problem]) {
      if (typeof value === "string" && value.trim()) return value.trim();
    }
  } catch {
    // Not JSON. A proxy or the platform answered, so the status is the reading.
  }
  const snippet = body.trim().slice(0, 200);
  return snippet ? `${status}: ${snippet}` : `the server answered ${status}`;
}

/**
 * A SHA-256 of the file, computed here because on the direct path nothing else
 * can.
 *
 * `files.sha256` is `NOT NULL` and it is what makes a catalogue row a promise
 * that these exact bytes are stored. The server path hashes the bytes it
 * receives, but a direct upload never passes through our own code, so the
 * commit would have to fetch the object back to work it out, and that is not
 * possible for the 379 MB end of this archive.
 *
 * Returns null rather than throwing when the browser will not give up an
 * ArrayBuffer that size. Losing the hash costs a column; failing here would cost
 * an upload that has already succeeded.
 */
export async function digestOf(file: File): Promise<string | null> {
  try {
    const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
    return [...new Uint8Array(digest)]
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  } catch {
    return null;
  }
}

export type Sent = { ok: boolean; status: number; body: string };

/**
 * One upload, with progress, and it never rejects.
 *
 * XMLHttpRequest rather than fetch for the one reason fetch cannot cover:
 * `upload.progress` events. These files average 14 MB and reach 379 MB, so the
 * difference between this and a promise is the difference between a screen that
 * is working and a screen that has hung.
 *
 * A failed request resolves with `status: 0` rather than throwing, because the
 * caller has to tell two failures apart and only one of them is an error: a
 * status of zero means the browser never got a reply at all, which is what a
 * bucket with no CORS policy looks like from in here, and that one is a
 * fallback rather than a refusal.
 */
export function send(
  method: "PUT" | "POST",
  url: string,
  body: XMLHttpRequestBodyInit,
  headers: Record<string, string>,
  onProgress: (sent: number) => void,
): Promise<Sent> {
  return new Promise((resolve) => {
    const request = new XMLHttpRequest();
    request.open(method, url, true);
    for (const [name, value] of Object.entries(headers)) {
      request.setRequestHeader(name, value);
    }
    request.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable) onProgress(event.loaded);
    });
    const settle = () =>
      resolve({
        ok: request.status >= 200 && request.status < 300,
        status: request.status,
        body: request.responseText ?? "",
      });
    request.addEventListener("load", settle);
    request.addEventListener("error", () => resolve({ ok: false, status: 0, body: "" }));
    request.addEventListener("abort", () => resolve({ ok: false, status: 0, body: "" }));
    request.addEventListener("timeout", () => resolve({ ok: false, status: 0, body: "" }));
    request.send(body);
  });
}

/* --- the mechanism -------------------------------------------------------- */

export type TransferInput = {
  kind: string;
  /** The item's address, already normalised by whoever is calling. */
  slug: string;
  file: File;
  role: "download" | "screenshot";
  /** A screenshot's slot, counting from zero. Null for a download. */
  position: number | null;
};

export type Outcome =
  | { ok: true; stored: Stored; via: "direct" | "server" }
  | { ok: false; refusal: Refusal };

/**
 * Ask where the file goes, put it there, and say which way it went.
 *
 * The three steps are one function because they are one decision: the answer
 * from `prepare` decides whether the direct path is even offered, the direct
 * attempt decides whether the fallback is tried, and the size the prepare step
 * reported decides whether the fallback can carry this particular file. Split
 * across a caller they drift, and the drift is invisible until somebody uploads
 * something large on a bucket with no policy.
 *
 * Nothing here throws. Every failure comes back as a refusal carrying the
 * sentence to show, and the two things that unblock it where they apply.
 */
export async function transferOne(
  input: TransferInput,
  /** Read and written, so one run learns about the direct path once. */
  memo: DirectMemo,
  /** Reading the file to hash it, or sending it. Neither is instant on 200 MB. */
  onStage: (state: "reading" | "sending") => void,
  onProgress: (sent: number, via: "direct" | "server") => void,
): Promise<Outcome> {
  const { file, kind, slug, role, position } = input;
  const contentType = contentTypeFor(file.name);
  onStage("sending");

  /* what the server says about where this goes and how big it may be */

  let prepared: Prepared;
  try {
    const answer = await fetch("/api/admin/upload/prepare", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        kind,
        slug,
        filename: file.name,
        contentType,
        sizeBytes: file.size,
        role,
        position,
      }),
    });
    const body = await answer.text();
    if (!answer.ok) {
      return refused(`Nothing was stored: ${reasonFrom(answer.status, body)}`);
    }
    const parsed = JSON.parse(body) as Partial<Prepared>;
    if (typeof parsed.key !== "string" || !parsed.key) {
      return refused(
        "Nothing was stored: the prepare step did not say where the file should go.",
      );
    }
    prepared = {
      key: parsed.key,
      url: typeof parsed.url === "string" ? parsed.url : null,
      headers:
        parsed.headers && typeof parsed.headers === "object"
          ? parsed.headers
          : { "content-type": contentType },
      serverPathLimitBytes:
        typeof parsed.serverPathLimitBytes === "number"
          ? parsed.serverPathLimitBytes
          : SERVER_PATH_HINT,
      problem: typeof parsed.problem === "string" ? parsed.problem : null,
    };
  } catch {
    return refused(
      "Nothing was stored: the site could not be reached to ask where the file should go.",
    );
  }

  const policy = corsPolicyFor(window.location.origin);

  /* the direct path, which is the one with no size limit */

  if (prepared.url && memo.works !== false) {
    /*
     * Hashed before the bytes go, because after a direct PUT nothing on our
     * side has ever seen them. Read as its own state rather than silently: on a
     * large file this is a couple of seconds during which a progress bar sitting
     * at zero would look like a stall.
     */
    onStage("reading");
    const sha256 = await digestOf(file);

    onStage("sending");
    const sent = await send("PUT", prepared.url, file, prepared.headers, (bytes) =>
      onProgress(bytes, "direct"),
    );
    if (sent.ok) {
      memo.works = true;
      return {
        ok: true,
        via: "direct",
        stored: {
          storageKey: prepared.key,
          filename: file.name,
          sizeBytes: file.size,
          sha256,
          contentType,
          position,
        },
      };
    }
    /*
     * Status zero is the CORS case and the only one worth retrying elsewhere:
     * the browser refused to show us a reply, so nothing is known about whether
     * R2 would have taken it. A real status is R2 answering, usually a signature
     * that has expired or a key the token may not write, and it is carried into
     * the refusal so the two are never confused.
     */
    memo.works = false;
    memo.status = sent.status;
  }

  /* the fallback, which works up to the cap the prepare step reported */

  if (file.size > prepared.serverPathLimitBytes) {
    return refused(
      `${file.name} is ${formatBytes(file.size)}, and the most that can be posted ` +
        `through the site is ${formatBytes(prepared.serverPathLimitBytes)}, because the request ` +
        `has to fit inside a serverless function. ` +
        (prepared.url
          ? memo.status === 0
            ? "Uploading straight to the bucket has no size limit and is what was tried first, but the browser was refused before it got a reply at all, which is what a bucket with no CORS policy looks like from in here."
            : `Uploading straight to the bucket was refused with ${memo.status}, so it is the signature or the key that was not accepted rather than the policy.`
          : `This deployment cannot sign a direct upload${prepared.problem ? `: ${prepared.problem}` : ""}, so there is no path for a file this size.`),
      { cors: memo.status === 0 ? policy : null, cli: true },
    );
  }

  /*
   * Everything the fallback route needs to derive the key itself. It
   * deliberately does not accept one: nothing a caller sends decides where an
   * object lands, which is what stops a stray request naming an object it
   * should not be able to write.
   */
  const form = new FormData();
  form.append("kind", kind);
  form.append("slug", slug);
  form.append("filename", file.name);
  form.append("role", role);
  if (position !== null) form.append("position", String(position));
  form.append("file", file, file.name);

  // Back to zero, because a direct attempt that got some of the way up before
  // being refused has left a bar somewhere in the middle, and a second attempt
  // at the same file starts from the beginning.
  onProgress(0, "server");

  // No content-type header: the browser has to set the multipart boundary
  // itself, and one written by hand is a body the server cannot parse.
  const sent = await send("POST", "/api/admin/upload", form, {}, (bytes) =>
    onProgress(bytes, "server"),
  );

  if (!sent.ok) {
    return refused(
      sent.status === 0
        ? `${file.name} did not reach the site, and the connection dropped without a reply. Nothing after it was sent.`
        : `${file.name} was refused: ${reasonFrom(sent.status, sent.body)}`,
      // The direct route being blocked is worth saying even when the fallback is
      // what actually failed: it is why the file came this way at all, and it is
      // the thing that stays broken until somebody acts on it.
      { cors: memo.status === 0 ? policy : null, cli: memo.status === 0 },
    );
  }

  // The route hashes what it received and reports the key it derived, and both
  // are better answers than anything this side could work out.
  let storageKey = prepared.key;
  let sha256: string | null = null;
  try {
    const answer = JSON.parse(sent.body || "{}") as { key?: unknown; sha256?: unknown };
    if (typeof answer.key === "string" && answer.key) storageKey = answer.key;
    if (typeof answer.sha256 === "string") sha256 = answer.sha256;
  } catch {
    // A 2xx that is not JSON is strange and not fatal. Both ends derive the key
    // from the same rules, so the prepared one is still right.
  }

  return {
    ok: true,
    via: "server",
    stored: {
      storageKey,
      filename: file.name,
      sizeBytes: file.size,
      sha256,
      contentType,
      position,
    },
  };
}

function refused(
  message: string,
  unblock: { cors?: string | null; cli?: boolean } = {},
): Outcome {
  return {
    ok: false,
    refusal: { message, cors: unblock.cors ?? null, cli: unblock.cli === true },
  };
}
