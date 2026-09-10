"use client";

import { useRef, useState } from "react";

import { addScreenshots } from "@/app/admin/actions";
import {
  SERVER_PATH_HINT,
  freshMemo,
  transferOne,
  type Refusal,
  type Stored,
  type Transfer,
} from "@/components/upload-transfer";
import { isImageName } from "@/lib/ingest-rules";
import { formatBytes } from "@/lib/storage";

/**
 * Adding pictures to an item that is already in the catalogue.
 *
 * The upload form takes screenshots while it is creating an item, and until now
 * that was the only moment they could ever be given. The one map published so
 * far therefore has a page with no picture on it, which is the most visible gap
 * on the site, and the only way out of it was to re-ingest the whole thing from
 * a terminal.
 *
 * **The transfer is `transferOne`, the same mechanism the upload form uses.** A
 * presigned PUT straight to R2 with no size limit, falling back to posting
 * through our own server when the bucket has no CORS policy yet, and the refusal
 * that says which of the two failed and what unblocks it. Screenshots are small
 * enough that the fallback nearly always carries them, which is exactly why a
 * second uploader written here would have looked fine for months and then failed
 * on somebody's 6 MB png.
 *
 * "use client" for the one reason the upload form is: progress. `fetch` cannot
 * report it, the transfers go through XMLHttpRequest, and a screen that sits
 * still while several megabytes move looks like a screen that has hung. The row
 * around this, and everything that writes, is server rendered.
 *
 * The write is a real form submitted from here rather than the action called as
 * a function, so the redirect afterwards is the framework's, exactly like every
 * other button in the catalogue. The uploaded keys go into a hidden field the
 * moment the last byte lands.
 */

const BUTTON =
  "shrink-0 rounded-sm border border-basalt-600 px-2.5 py-0.5 font-display text-xs uppercase tracking-wider text-steel-300 hover:border-rust-500 hover:text-rust-300 disabled:cursor-not-allowed disabled:opacity-60";

export function ScreenshotUpload({
  itemId,
  kind,
  slug,
  startAt,
  back,
  storageReady,
}: {
  itemId: string;
  kind: string;
  /** The item's address. Half of the key every screenshot is stored under. */
  slug: string;
  /** The slot the first new picture asks for, which is baked into its key. */
  startAt: number;
  /** Where to come back to, so a filtered view survives the write. */
  back: string;
  /** Whether R2 can be written to at all. False is a normal state, not a fault. */
  storageReady: boolean;
}) {
  const [chosen, setChosen] = useState<File[]>([]);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [refusal, setRefusal] = useState<Refusal | null>(null);
  const [busy, setBusy] = useState(false);

  const picker = useRef<HTMLInputElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const payload = useRef<HTMLInputElement>(null);

  if (!storageReady) {
    return (
      <p className="text-xs leading-snug text-oxide-400">
        Storage is not configured on this deployment, so there is nowhere to put
        a picture. It needs R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY
        and R2_BUCKET.
      </p>
    );
  }

  /*
   * Images only, and said here rather than left to the file input's accept
   * attribute, which is a hint a person can walk past. A screenshot row pointing
   * at a zip renders as a broken picture on the item's page and nothing about
   * the admin screen would look wrong.
   */
  function choose(files: File[]) {
    const images = files.filter((file) => isImageName(file.name));
    setRefusal(
      images.length === files.length
        ? null
        : {
            message:
              "Only images can be screenshots, so anything else in that selection was left out. A screenshot row pointing at something that is not a picture shows on the item's page as a broken frame.",
            cors: null,
            cli: false,
          },
    );
    if (images.length > 0) setChosen((current) => [...current, ...images]);
  }

  async function upload() {
    if (busy || chosen.length === 0) return;

    setBusy(true);
    setRefusal(null);
    setTransfers(
      chosen.map((file) => ({
        name: file.name,
        bytes: file.size,
        sent: 0,
        via: null,
        state: "waiting" as const,
      })),
    );

    const mark = (index: number, patch: Partial<Transfer>) =>
      setTransfers((current) =>
        current.map((entry, position) =>
          position === index ? { ...entry, ...patch } : entry,
        ),
      );

    // One verdict about the direct path for the whole run, so a bucket with no
    // CORS policy costs one failed PUT rather than one per picture.
    const memo = freshMemo();
    const stored: Stored[] = [];

    for (const [index, file] of chosen.entries()) {
      mark(index, { state: "sending" });

      const outcome = await transferOne(
        { kind, slug, file, role: "screenshot", position: startAt + index },
        memo,
        (state) => mark(index, { state }),
        (sent, via) => mark(index, { sent, via }),
      );

      if (!outcome.ok) {
        mark(index, { state: "failed" });
        setRefusal(outcome.refusal);
        setBusy(false);
        return;
      }

      mark(index, { sent: file.size, via: outcome.via, state: "done" });
      stored.push(outcome.stored);
    }

    /*
     * The rows last, because a row pointing at bytes that are not there is the
     * one failure the site cannot see. Written through the hidden form below so
     * that the action redirects the way every other control here does; the
     * value is set on the element rather than through state because the submit
     * happens in the same breath and a render has not been waited for.
     */
    if (payload.current && form.current) {
      payload.current.value = JSON.stringify(
        stored.map((shot) => ({
          storageKey: shot.storageKey,
          filename: shot.filename,
          position: shot.position,
          caption: null,
        })),
      );
      form.current.requestSubmit();
    }
  }

  const waiting = chosen.length > 0 && transfers.length === 0;

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <input
          ref={picker}
          type="file"
          accept="image/*"
          multiple
          aria-label="Screenshots to add"
          disabled={busy}
          onChange={(event) => {
            choose(Array.from(event.target.files ?? []));
            // Emptied so that choosing the same file twice in a row still
            // fires a change, which it does not when the value is unchanged.
            if (picker.current) picker.current.value = "";
          }}
          className="block max-w-full text-sm text-steel-300 file:mr-3 file:rounded-sm file:border file:border-basalt-600 file:bg-basalt-850 file:px-3 file:py-1 file:font-display file:text-xs file:uppercase file:tracking-wider file:text-steel-300 hover:file:border-rust-500 hover:file:text-rust-300"
        />
        <button type="button" onClick={upload} disabled={busy || chosen.length === 0} className={BUTTON}>
          {busy
            ? "Uploading"
            : chosen.length > 0
              ? `Add ${chosen.length === 1 ? "the picture" : `${chosen.length} pictures`}`
              : "Add"}
        </button>
      </div>

      {waiting ? (
        <ul className="grid gap-0.5">
          {chosen.map((file, position) => (
            <li
              key={`${file.name}-${position}`}
              className="flex flex-wrap items-baseline gap-x-2 font-mono text-[0.625rem] text-steel-300"
            >
              <span className="min-w-0 flex-1 truncate">{file.name}</span>
              <span className="tabular-nums text-steel-400">{formatBytes(file.size)}</span>
              {file.size > SERVER_PATH_HINT ? (
                <span className="text-oxide-400">needs the direct route</span>
              ) : null}
              <button
                type="button"
                onClick={() =>
                  setChosen((current) => current.filter((_, index) => index !== position))
                }
                className="font-display uppercase tracking-wider text-steel-400 hover:text-rust-400"
              >
                drop
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {transfers.length > 0 ? (
        <ul className="grid gap-1">
          {transfers.map((entry, index) => {
            const done = entry.bytes > 0 ? Math.round((entry.sent / entry.bytes) * 100) : 0;
            return (
              <li key={`${entry.name}-${index}`}>
                <div className="flex flex-wrap items-baseline gap-x-2 font-mono text-[0.625rem]">
                  <span className="min-w-0 flex-1 truncate text-steel-200">{entry.name}</span>
                  <span className="tabular-nums text-steel-400">
                    {formatBytes(entry.sent)} / {formatBytes(entry.bytes)}
                  </span>
                  <span
                    className={
                      "font-display uppercase tracking-wider " +
                      (entry.state === "failed"
                        ? "text-rust-400"
                        : entry.state === "done"
                          ? "text-steel-400"
                          : "text-oxide-400")
                    }
                  >
                    {entry.state === "failed"
                      ? "failed"
                      : entry.state === "done"
                        ? `stored ${entry.via === "server" ? "through the site" : "in the bucket"}`
                        : entry.state === "reading"
                          ? "reading the file"
                          : entry.via === "server"
                            ? "sending through the site"
                            : entry.via === "direct"
                              ? "sending to the bucket"
                              : "waiting"}
                  </span>
                </div>
                <div className="mt-0.5 h-0.5 w-full bg-basalt-700">
                  <div
                    className={
                      "h-0.5 " + (entry.state === "failed" ? "bg-rust-500" : "bg-signal-green")
                    }
                    style={{ width: `${Math.min(done, 100)}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}

      {refusal ? (
        <div className="plate border-l-2 border-l-rust-500 p-2">
          <p className="text-xs leading-relaxed text-steel-200">{refusal.message}</p>
          {refusal.cors ? (
            <>
              <p className="mt-1.5 text-xs leading-relaxed text-steel-300">
                Uploading straight from a browser needs a CORS policy on the
                bucket, and our R2 token cannot set one. It is a one-time job in
                the Cloudflare dashboard, under R2, the bucket, Settings, CORS
                policy. Both headers matter, because the signed upload carries
                both and a browser will send neither unless the bucket has named
                it.
              </p>
              <pre className="mt-1.5 overflow-x-auto rounded-sm border border-basalt-600 bg-basalt-900 p-2 font-mono text-[0.625rem] leading-relaxed text-steel-200">
                {refusal.cors}
              </pre>
            </>
          ) : null}
          {refusal.cli ? (
            <p className="mt-1.5 text-xs leading-relaxed text-steel-300">
              Nothing was attached and nothing typed was lost. The picture is
              still on this machine, so pressing the button again is the whole
              retry once the reason above is dealt with.
            </p>
          ) : null}
        </div>
      ) : null}

      {/*
        The write. Its own form, because a form cannot be nested and the editor
        around this one is already several. Submitted from `upload` above once
        every byte has landed, so the action never records a row for a picture
        that is not in the bucket.
      */}
      <form ref={form} action={addScreenshots} hidden>
        <input type="hidden" name="itemId" value={itemId} />
        <input type="hidden" name="back" value={back} />
        <input type="hidden" name="shots" ref={payload} defaultValue="" />
      </form>
    </div>
  );
}
