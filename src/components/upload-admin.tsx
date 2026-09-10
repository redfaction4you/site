"use client";

import { useEffect, useRef, useState } from "react";

import {
  SERVER_PATH_HINT,
  freshMemo,
  reasonFrom,
  transferOne,
  type Refusal,
  type Stored,
  type Transfer,
} from "@/components/upload-transfer";
import { SECTIONS, SECTION_BY_KIND, type ItemKind } from "@/lib/downloads";
import {
  isImageName,
  normaliseReleasedOn,
  slugFromName,
  storageKeyFor,
  titleFromName,
} from "@/lib/ingest-rules";
import { formatBytes } from "@/lib/storage";

/**
 * Putting a file into the catalogue from a browser.
 *
 * The CLI was the whole upload path and it is the wrong shape for the person
 * this archive is for. He is a mapper. Hosting his work somewhere else means
 * somebody else can edit it and nobody but them can delete it, and the answer to
 * that is a site where the author is the one holding the file, which is only
 * true if putting a file here is something you can do without a terminal.
 *
 * **The transfer itself lives in `upload-transfer.ts`** and was the middle of
 * this file until the catalogue below needed to add screenshots to an item that
 * already exists. The presigned PUT, the fallback through our own server, the
 * hash and the CORS policy it prints are all there and are shared, because two
 * copies of that would fail differently on the same bucket. What is left here is
 * the form: what a person types, what survives a failure, and what the screen
 * says while 379 MB is moving.
 *
 * EVERYTHING TYPED SURVIVES A FAILURE. The chosen files live in this component's
 * state rather than being read off the input at submit, so a 200 MB upload that
 * fails at the last byte leaves the form exactly as it was and the button can be
 * pressed again. A form that empties itself after that is worse than no form.
 *
 * It is the only client component in the upload path. The rest of `/admin` is
 * server rendered, and the reason this one is not is upload progress: `fetch`
 * cannot report it, so the transfers go through XMLHttpRequest, and a screen
 * that sits still for four minutes on a large map looks broken.
 */

/* --- constants ------------------------------------------------------------ */

const FIELD =
  "w-full rounded-sm border border-basalt-600 bg-basalt-850 px-2 py-1.5 text-sm text-steel-100 placeholder:text-steel-700 focus:border-rust-500 focus:outline-none";
const LABEL = "figure-label mb-1 block";

/* --- pure helpers --------------------------------------------------------- */

/**
 * The slug as it will really be stored.
 *
 * A typed slug goes through the same normaliser as a filename, with a sentinel
 * extension on the end so `baseName` has something to strip other than a dot the
 * person meant to keep. Without it a slug written as `2.0 final` reads as the
 * file `2` with the extension `.0 final` and the item lives at `/maps/2`
 * forever. The ingest CLI does exactly this, and the two have to agree, because
 * the slug is half of the unique key an upload upserts on.
 */
function normalisedSlug(typed: string, filename: string | null): string {
  const wanted = typed.trim();
  if (wanted) return slugFromName(`${wanted}.slug`);
  return filename ? slugFromName(filename) : "";
}

/* --- the section ---------------------------------------------------------- */

export function UploadAdmin({
  storageReady,
  taken,
}: {
  /** Whether R2 can be written to at all. False is a normal state, not a fault. */
  storageReady: boolean;
  /** Every address already in the catalogue, so the form can say what it would replace. */
  taken: { address: string; title: string }[];
}) {
  const [kind, setKind] = useState<ItemKind>("map");
  const [category, setCategory] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [shots, setShots] = useState<File[]>([]);
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [author, setAuthor] = useState("");
  const [summary, setSummary] = useState("");
  const [version, setVersion] = useState("");
  const [released, setReleased] = useState("");
  const [tags, setTags] = useState("");
  const [publish, setPublish] = useState(false);

  /*
   * Whether a person has taken these over. Title and slug prefill from the
   * filename and keep doing so while nobody has edited them, and stop the moment
   * somebody has: quietly overwriting a title somebody typed because they then
   * changed the file is the small betrayal that makes a form untrustworthy.
   */
  const [titleTouched, setTitleTouched] = useState(false);
  const [slugTouched, setSlugTouched] = useState(false);

  const [phase, setPhase] = useState<"idle" | "working" | "done" | "failed">("idle");
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [refusal, setRefusal] = useState<Refusal | null>(null);
  const [result, setResult] = useState<{
    path: string;
    status: string;
    created: boolean;
    warnings: string[];
  } | null>(null);
  const [dragging, setDragging] = useState(false);

  // Cleared after a successful run so the next upload starts from an empty
  // control. Everything else on the form is state and is left alone on failure.
  const fileInput = useRef<HTMLInputElement>(null);
  const shotInput = useRef<HTMLInputElement>(null);

  /*
   * A 379 MB upload takes minutes, and the browser will happily throw it away
   * because somebody hit back. This is the one thing a page can do about that.
   */
  useEffect(() => {
    if (phase !== "working") return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [phase]);

  const section = SECTION_BY_KIND[kind];
  const address = normalisedSlug(slug, file?.name ?? null);
  const clash = taken.find((entry) => entry.address === `${kind}/${address}`) ?? null;
  const busy = phase === "working";

  /** The download, and the two fields that follow from its name. */
  function chooseDownload(chosen: File | undefined) {
    if (!chosen) return;
    setFile(chosen);
    if (!titleTouched) setTitle(titleFromName(chosen.name));
    if (!slugTouched) setSlug(slugFromName(chosen.name));
  }

  function addShots(chosen: File[]) {
    const images = chosen.filter((entry) => isImageName(entry.name));
    if (images.length > 0) setShots((current) => [...current, ...images]);
  }

  /**
   * A drop, which unlike either input can be several things at once.
   *
   * Images become screenshots and the first thing that is not an image becomes
   * the download, which is the same reading `chooseDownload` in the ingest rules
   * makes of a folder. A file picked through the file input on the other hand is
   * the download whatever it is, because that is what the person pressing that
   * particular button asked for.
   */
  function acceptDrop(chosen: File[]) {
    addShots(chosen);
    chooseDownload(chosen.find((entry) => !isImageName(entry.name)));
  }

  function reset() {
    setFile(null);
    setShots([]);
    setTitle("");
    setSlug("");
    setAuthor("");
    setSummary("");
    setVersion("");
    setReleased("");
    setTags("");
    setTitleTouched(false);
    setSlugTouched(false);
    setTransfers([]);
    setResult(null);
    setRefusal(null);
    setPhase("idle");
    if (fileInput.current) fileInput.current.value = "";
    if (shotInput.current) shotInput.current.value = "";
  }

  async function upload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file || busy) return;

    const slugNow = normalisedSlug(slug, file.name);
    if (!slugNow) {
      setPhase("failed");
      setRefusal({
        message:
          "Nothing was sent: no usable address could be made from that name. An item cannot live at an empty address, so type a slug.",
        cors: null,
        cli: false,
      });
      return;
    }

    /*
     * The date is checked before anything moves, because the alternative is a
     * date silently becoming null at the far end. Somebody who typed a year and
     * watched a 200 MB upload succeed has no reason to go back and check the
     * one field that was quietly dropped.
     */
    if (released.trim() && !normaliseReleasedOn(released)) {
      setPhase("failed");
      setRefusal({
        message:
          "Nothing was sent: the release date has to be a full date or a bare year, like 2003-11-04 or 2003. Fixing it costs nothing right now and would have cost the whole upload after it.",
        cors: null,
        cli: false,
      });
      return;
    }

    setPhase("working");
    setRefusal(null);
    setResult(null);

    const queue = [
      { file, role: "download" as const, position: null as number | null },
      ...shots.map((shot, position) => ({
        file: shot,
        role: "screenshot" as const,
        position,
      })),
    ];

    setTransfers(
      queue.map((entry) => ({
        name: entry.file.name,
        bytes: entry.file.size,
        sent: 0,
        via: null,
        state: "waiting" as const,
      })),
    );

    const mark = (index: number, patch: Partial<Transfer>) =>
      setTransfers((current) =>
        current.map((entry, position) => (position === index ? { ...entry, ...patch } : entry)),
      );

    const fail = (
      index: number,
      message: string,
      unblock: { cors?: string | null; cli?: boolean } = {},
    ) => {
      mark(index, { state: "failed" });
      setRefusal({ message, cors: unblock.cors ?? null, cli: unblock.cli === true });
      setPhase("failed");
    };

    /*
     * What this run has learned about the direct path, so a bucket with no CORS
     * policy costs one failed PUT rather than one per screenshot. Carried across
     * the whole queue rather than per file, because only the first file ever
     * tries the direct route: a verdict scoped to one iteration is gone by the
     * time the file that actually gets refused reads it, which once produced a
     * refusal reading "refused with null" and, worse, hid the CORS policy on the
     * one screen that exists to print it.
     */
    const memo = freshMemo();
    const stored: Stored[] = [];

    /*
     * The transfer is `transferOne`, shared with the screenshot control in the
     * catalogue below. What this loop still decides is the screen: which row is
     * moving, how far it has got, and that a refusal stops the queue where it is
     * rather than skipping a file and writing a row for the rest.
     */
    for (const [index, entry] of queue.entries()) {
      mark(index, { state: "sending" });

      const outcome = await transferOne(
        {
          kind,
          slug: slugNow,
          file: entry.file,
          role: entry.role,
          position: entry.position,
        },
        memo,
        (state) => mark(index, { state }),
        (sent, via) => mark(index, { sent, via }),
      );

      if (!outcome.ok) {
        fail(index, outcome.refusal.message, outcome.refusal);
        return;
      }

      mark(index, { sent: entry.file.size, via: outcome.via, state: "done" });
      stored.push(outcome.stored);
    }

    /* the row, last, because a row pointing at bytes that are not there is the
       one failure the site cannot see */

    /*
     * An empty tags box means "I said nothing about tags", and it has to reach
     * the commit as null rather than as an empty list.
     *
     * The two are not the same thing there. Every editorial field an upload
     * sends is coalesced onto the row, so null leaves what is already stored
     * alone; an empty array is a real value and assigns, which would clear the
     * tags somebody typed into the catalogue below simply because they later
     * re-uploaded a corrected file with the box blank. That is the one thing
     * `ingestUploaded` promises not to do. It is the same reading the ingest CLI
     * makes of a sidecar with no `tags` key, and the opposite of the edit form
     * one section down, where the box is pre-filled with what is stored and
     * clearing it means clearing them.
     */
    const wantedTags = tags
      .split(",")
      .map((tag) => tag.trim().toLowerCase())
      .filter(Boolean);

    try {
      const answer = await fetch("/api/admin/upload/commit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind,
          slug: slugNow,
          title: title.trim(),
          authorName: author.trim() || null,
          summary: summary.trim() || null,
          releaseVersion: version.trim() || null,
          // Normalised on the way out, so a bare year is a real date and
          // anything unreadable was refused before a byte moved.
          releasedOn: normaliseReleasedOn(released),
          tags: wantedTags.length > 0 ? wantedTags : null,
          // Empty means "no opinion", which for a map is the instruction to
          // read it off the level names and for everything else is none.
          category: category || null,
          publish,
          file: stored[0],
          // Their order here is their position on the page, which is why they
          // are sent as a list rather than each carrying a number.
          screenshots: stored.slice(1).map((shot) => ({
            storageKey: shot.storageKey,
            filename: shot.filename,
            sizeBytes: shot.sizeBytes,
            sha256: shot.sha256,
            contentType: shot.contentType,
            caption: null,
          })),
        }),
      });
      const body = await answer.text();
      if (!answer.ok) {
        setRefusal({
          message:
            `The files are stored and the catalogue row was not written: ${reasonFrom(answer.status, body)} ` +
            "Nothing was lost. Pressing upload again re-uses the same keys and overwrites the same objects.",
          cors: null,
          cli: false,
        });
        setPhase("failed");
        return;
      }
      const parsed = JSON.parse(body) as {
        url?: unknown;
        path?: unknown;
        status?: unknown;
        created?: unknown;
        warnings?: unknown;
      };
      setResult({
        path:
          typeof parsed.url === "string"
            ? parsed.url
            : typeof parsed.path === "string"
              ? parsed.path
              : `${section.route}/${slugNow}`,
        status: typeof parsed.status === "string" ? parsed.status : publish ? "published" : "draft",
        created: parsed.created !== false,
        // Never dropped. A pack with one unreadable level in it is the case
        // this exists for, and the CLI prints the same list under its table.
        warnings: Array.isArray(parsed.warnings)
          ? parsed.warnings.filter((entry): entry is string => typeof entry === "string")
          : [],
      });
      setPhase("done");
      if (fileInput.current) fileInput.current.value = "";
      if (shotInput.current) shotInput.current.value = "";
    } catch {
      setRefusal({
        message:
          "The files are stored and the site could not be reached to write the row. Pressing upload again re-uses the same keys, so nothing is duplicated.",
        cors: null,
        cli: false,
      });
      setPhase("failed");
    }
  }

  const totalBytes = transfers.reduce((sum, entry) => sum + entry.bytes, 0);
  const sentBytes = transfers.reduce((sum, entry) => sum + entry.sent, 0);
  const percent = totalBytes > 0 ? Math.round((sentBytes / totalBytes) * 100) : 0;

  return (
    <div id="upload" className="mt-10 scroll-mt-6 border-t border-basalt-800 pt-6">
      <h3 className="rule-heading">Upload something</h3>

      <p className="mt-2 max-w-4xl text-sm leading-relaxed text-steel-400">
        Choose a file, say which shelf it belongs on, and it is in the catalogue.
        It lands as a draft unless you say otherwise, so nothing is on a shelf
        until somebody has read what was derived. The bytes go straight from this
        browser into our bucket, which is what makes a 379 MB map pack possible
        at all;{" "}
        <strong className="text-steel-300">
          if that route is not open yet the file is posted through the site
          instead, and that path stops at about {formatBytes(SERVER_PATH_HINT)}
        </strong>
        . Anything larger will say so, and say what unblocks it, rather than
        failing quietly.
      </p>

      {!storageReady ? (
        <div className="plate mt-4 border-l-2 border-l-oxide-400 p-3">
          <p className="text-sm leading-relaxed text-oxide-400">
            Storage is not configured on this deployment, so there is nowhere to
            put a file and the form is not shown. It needs R2_ACCOUNT_ID,
            R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and R2_BUCKET. Reading is a
            separate variable again, NEXT_PUBLIC_R2_PUBLIC_BASE.
          </p>
        </div>
      ) : (
        <form onSubmit={upload} className="mt-4 grid gap-5 lg:grid-cols-2">
          {/* --- the file ------------------------------------------------- */}

          <div className="lg:col-span-2">
            <span className={LABEL}>The file</span>
            <div
              onDragOver={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(event) => {
                event.preventDefault();
                setDragging(false);
                acceptDrop(Array.from(event.dataTransfer.files));
              }}
              className={
                "rounded-sm border border-dashed p-3 transition-colors " +
                (dragging ? "border-rust-500 bg-rust-500/[0.04]" : "border-basalt-600")
              }
            >
              <input
                ref={fileInput}
                type="file"
                aria-label="The file to upload"
                onChange={(event) => chooseDownload(event.target.files?.[0])}
                className="block w-full text-sm text-steel-300 file:mr-3 file:rounded-sm file:border file:border-basalt-600 file:bg-basalt-850 file:px-3 file:py-1 file:font-display file:text-xs file:uppercase file:tracking-wider file:text-steel-300 hover:file:border-rust-500 hover:file:text-rust-300"
              />
              <p className="mt-2 text-xs leading-snug text-steel-400">
                Or drop files here. Images in a drop become screenshots and the
                first file that is not an image becomes the download.
              </p>
              {file ? (
                <p className="mt-2 font-mono text-xs text-steel-200">
                  {file.name}
                  <span className="text-steel-400"> · {formatBytes(file.size)}</span>
                  {file.size > SERVER_PATH_HINT ? (
                    <span className="text-oxide-400"> · needs the direct route</span>
                  ) : null}
                </p>
              ) : null}
            </div>
          </div>

          {/* --- shelf and facet ------------------------------------------ */}

          <div>
            <span className={LABEL}>Shelf</span>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {SECTIONS.map((shelf) => (
                <label
                  key={shelf.kind}
                  className="flex items-center gap-1.5 text-sm text-steel-200"
                >
                  <input
                    type="radio"
                    name="kind"
                    value={shelf.kind}
                    checked={kind === shelf.kind}
                    onChange={() => {
                      setKind(shelf.kind);
                      // A facet only means anything inside its own shelf, so
                      // carrying `ctf` onto Assets would file the item under a
                      // value nothing there links to.
                      setCategory("");
                    }}
                    className="accent-rust-500"
                  />
                  {shelf.title}
                </label>
              ))}
            </div>
            <p className="mt-1 text-xs leading-snug text-steel-400">
              Nothing in a file says which shelf it belongs on. A tool filed as a
              map is found by nobody looking for a tool.
            </p>
          </div>

          {/* Mods and Tools have no facets at all, so the control goes rather
              than sitting there empty. */}
          {section.categories.length > 0 ? (
            <div>
              <label className={LABEL} htmlFor="upload-category">
                Type
              </label>
              <select
                id="upload-category"
                value={category}
                onChange={(event) => setCategory(event.target.value)}
                className={FIELD}
              >
                <option value="">
                  {kind === "map" ? "work it out from the file" : "none for now"}
                </option>
                {section.categories.map((facet) => (
                  <option key={facet.id} value={facet.id}>
                    {facet.label}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs leading-snug text-steel-400">
                {kind === "map"
                  ? "Red Faction puts the game type in the level filename and the server reads it that way, so leaving this alone is usually right. Single player has no prefix and is never derived: set it here or it stays unset."
                  : "Optional. An item with none is still listed, under no facet."}
              </p>
            </div>
          ) : (
            <div>
              <span className={LABEL}>Type</span>
              <p className="text-sm text-steel-400">
                {section.title} has no facets, so nothing is filed under one.
              </p>
            </div>
          )}

          {/* --- what it is ----------------------------------------------- */}

          <div>
            <label className={LABEL} htmlFor="upload-title">
              Title
            </label>
            <input
              id="upload-title"
              value={title}
              maxLength={200}
              onChange={(event) => {
                setTitle(event.target.value);
                setTitleTouched(true);
              }}
              placeholder="taken from the filename"
              className={FIELD}
            />
          </div>

          <div>
            <label className={LABEL} htmlFor="upload-slug">
              Address
            </label>
            <input
              id="upload-slug"
              value={slug}
              maxLength={80}
              onChange={(event) => {
                setSlug(event.target.value);
                setSlugTouched(true);
              }}
              placeholder="taken from the filename"
              className={`${FIELD} font-mono`}
            />
            <p className="mt-1 font-mono text-[0.625rem] leading-snug text-steel-400">
              {address ? (
                <>
                  <span className="text-steel-200">
                    {section.route}/{address}
                  </span>
                  {file ? (
                    <>
                      {" · "}
                      {storageKeyFor(kind, address, file.name)}
                    </>
                  ) : null}
                </>
              ) : (
                "choose a file, or type a name"
              )}
            </p>
            {/*
              The address is permanent and the storage key derived from it is the
              file's public URL forever, so it is worth seeing before anybody
              commits to it. Landing on an address that already exists is the
              upsert trap that has cost this project a row already.
            */}
            {clash ? (
              <p className="mt-1 text-xs leading-snug text-oxide-400">
                {clash.title} already lives there. Uploading replaces its file
                and edits that row rather than making a second one.
              </p>
            ) : null}
          </div>

          <div>
            <label className={LABEL} htmlFor="upload-author">
              Author
            </label>
            <input
              id="upload-author"
              value={author}
              maxLength={120}
              onChange={(event) => setAuthor(event.target.value)}
              placeholder="who made it"
              className={FIELD}
            />
            <p className="mt-1 text-xs leading-snug text-steel-400">
              Who made it, not who uploaded it. Unknown is a legitimate answer
              and a better one than a guess.
            </p>
          </div>

          <div>
            <label className={LABEL} htmlFor="upload-version">
              Version, as the author wrote it
            </label>
            <input
              id="upload-version"
              value={version}
              maxLength={24}
              onChange={(event) => setVersion(event.target.value)}
              placeholder="a6a"
              className={FIELD}
            />
          </div>

          <div className="lg:col-span-2">
            <label className={LABEL} htmlFor="upload-summary">
              Summary, one line for cards and search
            </label>
            <input
              id="upload-summary"
              value={summary}
              maxLength={300}
              onChange={(event) => setSummary(event.target.value)}
              className={FIELD}
            />
          </div>

          <div>
            <label className={LABEL} htmlFor="upload-released">
              Released, a year or a full date
            </label>
            <input
              id="upload-released"
              value={released}
              maxLength={10}
              onChange={(event) => setReleased(event.target.value)}
              placeholder="2003"
              className={`${FIELD} font-mono`}
            />
            <p className="mt-1 text-xs leading-snug text-steel-400">
              When the thing came out, not when it was archived. A bare year is
              stored as the first of January and shown as the year alone.
            </p>
          </div>

          <div>
            <label className={LABEL} htmlFor="upload-tags">
              Tags, comma separated
            </label>
            <input
              id="upload-tags"
              value={tags}
              onChange={(event) => setTags(event.target.value)}
              placeholder="large, remake, night"
              className={FIELD}
            />
            {/* Same warning as the item editor, and for the same reason: this
                is where the wrong tags get typed in the first place. */}
            <p className="mt-1 text-xs leading-snug text-steel-400">
              Not the game type, and not which client loads it. Those are the
              Type above and what the file itself says, so a tag repeating
              either is a fact said twice that can later disagree with itself.
            </p>
          </div>

          {/* --- screenshots ---------------------------------------------- */}

          <div className="lg:col-span-2">
            <label className={LABEL} htmlFor="upload-shots">
              Screenshots
            </label>
            <input
              ref={shotInput}
              id="upload-shots"
              type="file"
              accept="image/*"
              multiple
              onChange={(event) => addShots(Array.from(event.target.files ?? []))}
              className="block w-full text-sm text-steel-300 file:mr-3 file:rounded-sm file:border file:border-basalt-600 file:bg-basalt-850 file:px-3 file:py-1 file:font-display file:text-xs file:uppercase file:tracking-wider file:text-steel-300 hover:file:border-rust-500 hover:file:text-rust-300"
            />
            {shots.length > 0 ? (
              <ul className="mt-2 grid gap-1">
                {shots.map((shot, position) => (
                  <li
                    key={`${shot.name}-${position}`}
                    className="flex flex-wrap items-baseline gap-x-2 font-mono text-xs text-steel-300"
                  >
                    <span className="text-steel-400">{position + 1}</span>
                    {shot.name}
                    <span className="text-steel-400">{formatBytes(shot.size)}</span>
                    <button
                      type="button"
                      onClick={() =>
                        setShots((current) =>
                          current.filter((_, index) => index !== position),
                        )
                      }
                      className="font-display uppercase tracking-wider text-steel-400 hover:text-rust-400"
                    >
                      remove
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-xs leading-snug text-steel-400">
                Optional, and their order here is the order on the page.
              </p>
            )}
          </div>

          {/* --- draft or live -------------------------------------------- */}

          <div className="lg:col-span-2">
            <span className={LABEL}>When it is uploaded</span>
            <div className="flex flex-wrap gap-x-5 gap-y-1">
              <label className="flex items-center gap-1.5 text-sm text-steel-200">
                <input
                  type="radio"
                  name="publish"
                  checked={!publish}
                  onChange={() => setPublish(false)}
                  className="accent-rust-500"
                />
                Save as a draft
              </label>
              <label className="flex items-center gap-1.5 text-sm text-steel-200">
                <input
                  type="radio"
                  name="publish"
                  checked={publish}
                  onChange={() => setPublish(true)}
                  className="accent-rust-500"
                />
                Publish now
              </label>
            </div>
            {/*
              The draft default is the same decision the CLI makes and for the
              same reason, with one honest caveat: it governs the page and never
              the bytes.
            */}
            <p className="mt-1 max-w-4xl text-xs leading-snug text-steel-400">
              A draft is on no shelf and its page answers 404, so nothing is
              found by accident before somebody has read what was derived. The
              file itself is world readable at its permanent URL either way,
              from the moment it is stored, so the decision to distribute
              something is made before uploading rather than at publish time.
            </p>
          </div>

          <div className="lg:col-span-2">
            <button
              type="submit"
              disabled={busy || !file}
              className="rounded-sm bg-rust-500 px-4 py-1.5 font-display text-xs font-semibold uppercase tracking-wider text-white hover:bg-rust-400 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy ? `Uploading, ${percent}%` : publish ? "Upload and publish" : "Upload as a draft"}
            </button>
            {phase === "failed" ? (
              <span className="ml-3 text-xs text-steel-400">
                Nothing typed has been lost. Press it again when the reason below
                is dealt with.
              </span>
            ) : null}
          </div>
        </form>
      )}

      {/* --- what is happening, in bytes ---------------------------------- */}

      {transfers.length > 0 ? (
        <ul className="mt-4 grid gap-1.5">
          {transfers.map((entry, index) => {
            const done = entry.bytes > 0 ? Math.round((entry.sent / entry.bytes) * 100) : 0;
            return (
              <li key={`${entry.name}-${index}`}>
                <div className="flex flex-wrap items-baseline gap-x-2 font-mono text-xs">
                  <span className="min-w-0 flex-1 truncate text-steel-200">{entry.name}</span>
                  <span className="tabular-nums text-steel-400">
                    {formatBytes(entry.sent)} / {formatBytes(entry.bytes)}
                  </span>
                  <span
                    className={
                      "font-display text-[0.625rem] uppercase tracking-wider " +
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

      {/* --- the refusal, in full ----------------------------------------- */}

      {refusal ? (
        <div className="plate mt-4 border-l-2 border-l-rust-500 p-3">
          <p className="text-sm leading-relaxed text-steel-200">{refusal.message}</p>
          {refusal.cors ? (
            <>
              <p className="mt-2 text-sm leading-relaxed text-steel-300">
                Uploading straight from a browser needs a CORS policy on the
                bucket, and our R2 token cannot set one: it can read and write
                objects and nothing else. So this is a one-time job in the
                Cloudflare dashboard, under R2, the bucket, Settings, CORS
                policy. Paste this, and the direct route works from then on at
                any size. Both headers matter, because the signed upload carries
                both and a browser will send neither unless the bucket has named
                it.
              </p>
              <pre className="mt-2 overflow-x-auto rounded-sm border border-basalt-600 bg-basalt-900 p-2 font-mono text-[0.625rem] leading-relaxed text-steel-200">
                {refusal.cors}
              </pre>
            </>
          ) : null}
          {refusal.cli ? (
            <p className="mt-2 text-sm leading-relaxed text-steel-300">
              The CLI has no such limit in the meantime, because it talks to R2
              from a terminal rather than from a browser:{" "}
              <code className="text-steel-100">
                npm run ingest -- &quot;C:/folder-holding-the-file&quot; --go
              </code>
              . One folder is one item, and{" "}
              <span className="text-steel-200">docs/uploading.md</span> is the
              guide.
            </p>
          ) : null}
        </div>
      ) : null}

      {/* --- the link, which is the whole point --------------------------- */}

      {result ? (
        <div className="plate mt-4 border-l-2 border-l-signal-green p-3">
          <p className="text-sm leading-relaxed text-steel-200">
            Stored, and the row is{" "}
            {result.created ? "written" : "updated, since something already lived there"}.{" "}
            {result.status === "published" ? (
              <>
                It is live at{" "}
                <a href={result.path} className="text-rust-400 hover:text-rust-300">
                  {result.path}
                </a>
                .
              </>
            ) : (
              <>
                It is a draft at{" "}
                <span className="font-mono text-steel-100">{result.path}</span>,
                which answers 404 until it is published in the catalogue below.
              </>
            )}
          </p>
          {/*
            What the parser wants somebody to look at, said here rather than
            stored and forgotten. One unreadable level inside a good packfile is
            the ordinary case, and it costs the compatibility reading rather than
            the entry.
          */}
          {result.warnings.length > 0 ? (
            <ul className="mt-2 grid gap-1">
              {result.warnings.map((warning) => (
                <li key={warning} className="text-xs leading-snug text-oxide-400">
                  {warning}
                </li>
              ))}
            </ul>
          ) : null}
          <button
            type="button"
            onClick={reset}
            className="mt-2 rounded-sm border border-basalt-600 px-3 py-1 font-display text-xs uppercase tracking-wider text-steel-300 hover:border-rust-500 hover:text-rust-300"
          >
            Upload another
          </button>
        </div>
      ) : null}
    </div>
  );
}
