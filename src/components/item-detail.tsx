import Link from "next/link";

import type { CatalogueItem } from "@/lib/catalogue";
import { categoryOf, displayVersion, type Section } from "@/lib/downloads";
import { formatBytes, storageConfigured } from "@/lib/storage";
import { CompatBadge } from "@/components/compat-badge";
import { ItemGallery } from "@/components/item-gallery";
import { ItemUpdates, archiveDate } from "@/components/item-updates";

/**
 * A detail page for anything on any shelf.
 *
 * Three things belong in the main column and they are in this order: the
 * picture, what it is, and the download. Everything else is the record, and the
 * record lives in the aside.
 *
 * That split is the correction to what this page was. It ran an eyebrow, a
 * title, a byline, a category pill and a summary, then the download, then a
 * section headed "What can load this" with a paragraph under it explaining
 * itself and a link to the guides, all before the description had started. The
 * owner published the first real map, read his own page and called it
 * convoluted: we do not need a lot of headers, and there is a side panel for
 * information like type and plays on. He is right, and the fix is not smaller
 * headings, it is that a fact does not need a heading at all. Which clients
 * load this, which facet of the shelf it sits under, how big it is and when it
 * was released are one row each in the panel on the right.
 *
 * What survives unchanged is the standing rule: what was recorded owns the top
 * and prose goes underneath. The gallery and the download are the first two
 * things in the main column, the aside starts level with them, and the
 * description and the changelog sit in the second row of the same grid. It has
 * been built the other way round twice and fixed twice, because a paragraph
 * somebody wrote about their map is the interesting part to read and the wrong
 * part to be looking for when the question is "will this load, and how big is
 * it".
 *
 * The aside is a grid item with an explicit column and a row span rather than
 * anything floated, so the source order is right on a phone as well: stacked,
 * the record comes after the download and before the prose, which is where
 * somebody on a small screen needs "does this run on my client" to be. Same
 * arrangement as the night page, deliberately, rather than a third one.
 *
 * Everything here renders on the server. The gallery is the single exception
 * and says why in its own file.
 */

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      {/*
       * `steel-400`, not the 500 this used to be and not `.figure-label`, which
       * is declared at 500. Nothing below `steel-400` clears 4.5:1 on this
       * background, and a label saying what a number means is the last text on
       * the page that should be hard to read.
       */}
      <dt className="font-display text-[0.625rem] font-bold uppercase tracking-widest text-steel-400">
        {label}
      </dt>
      <dd className="mt-1 text-sm text-steel-200">{children}</dd>
    </div>
  );
}

/**
 * When the editor last saved a level, as a date somebody can read.
 *
 * Parsed back into a Date before `archiveDate` sees it. That function reads a
 * bare string as a plain calendar day and appends noon to it, which makes
 * nonsense of a full timestamp; a Date it formats directly.
 *
 * Answers null for a level with no date at all, which is two situations that
 * read the same and should: the file carried no plausible stamp, or the row was
 * written before `map_meta.levels` stored one and has not been re-ingested
 * since. Either way the page says nothing rather than guessing.
 */
function levelSavedOn(savedAt: string | undefined): string | null {
  return savedAt ? archiveDate(new Date(savedAt)) : null;
}

export function ItemDetail({
  item,
  section,
}: {
  item: CatalogueItem;
  section: Section;
}) {
  const version = displayVersion(item.releaseVersion);
  const category = categoryOf(section, item.category);
  const compat = item.mapMeta;
  const levels = compat?.levels ?? [];

  /*
   * The primary file, which `getItem` sorts to the front. An item usually has
   * exactly one; a map that ships a texture pack alongside its level has two,
   * and the rest are listed under the button rather than competing with it.
   */
  const primary = item.files[0] ?? null;
  const downloadable = primary !== null && storageConfigured;

  /*
   * One level inside is the ordinary case, and the one where the level's own
   * name and save date are facts about this item rather than rows of a list. A
   * pack holding several carries them per level in the disclosure below the
   * download instead, because five names and five dates in a 16rem column is a
   * table pretending to be a sidebar.
   */
  const onlyLevel = levels.length === 1 ? levels[0] : null;
  const onlySavedOn = onlyLevel ? levelSavedOn(onlyLevel.savedAt) : null;

  /*
   * Three different silences about compatibility, and they do not mean the same
   * thing. `unread` is no `map_meta` row at all, which is what anything too
   * large for the upload path to fetch back gets, and anything that is not a
   * container we can open: nothing was read, so the badge is not drawn, because
   * a row of struck-through clients would assert that none of them load it.
   * `nothingFound` is a row that was written and found no levels in the file.
   * `unverified` is a real version outside the range we have documentation for,
   * which is the whole point of that badge: it refuses to guess.
   */
  const unread = section.hasLevels && !compat;
  const unverified = compat?.detectionConfidence === "unknown";
  const nothingFound = Boolean(compat) && levels.length === 0;

  return (
    <div className="mx-auto max-w-5xl px-4 pb-16 pt-8">
      <p className="eyebrow">
        <Link href={section.route} className="hover:text-rust-300">
          {section.title}
        </Link>
      </p>

      {/*
        Name, version and author on one line rather than three.

        The author is here and nowhere else now. It used to be in this row and
        again as the first field in the aside, which is the shape of clutter the
        owner was describing: a fact said twice costs two rows and answers one
        question. Under the title is where a map is named after its maker, and
        most of this archive was made by people who will never have an account
        here, so this is `authorName` and never the uploader.
      */}
      <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="font-display text-4xl font-bold text-steel-100">{item.title}</h1>

        {version ? (
          /*
           * The author's own version string, beside the name the way they wrote
           * it: `Dainer a6a`. Never parsed or ordered, and deliberately nowhere
           * near the level format number in the aside, where "version" means
           * something else entirely and answers a different question.
           */
          <span className="rounded-sm border border-basalt-600 bg-basalt-850 px-2 py-0.5 font-mono text-sm text-steel-300">
            {version}
          </span>
        ) : null}

        <span className="text-sm text-steel-400">
          by {item.authorName ?? "an unknown author"}
        </span>
      </div>

      {item.summary ? (
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-steel-300">
          {item.summary}
        </p>
      ) : null}

      <div className="mt-6 grid gap-x-8 gap-y-8 lg:grid-cols-[minmax(0,1fr)_16rem]">
        {/* --- The picture and the button ---------------------------------- */}
        <div className="min-w-0 space-y-6">
          {/*
            Inside the column rather than across the page above it, which is what
            puts the record beside the picture instead of a screen below it. A
            16:9 frame at the full width of this container is tall enough on its
            own to push the download button under the fold, and the whole
            argument of this layout is that the answer and the button are both
            visible without scrolling.

            The wrapper is conditional rather than the margin being
            unconditional: the gallery renders nothing at all for an item with no
            screenshots, and an empty block with a gap above it is a hole nobody
            can explain.
          */}
          {item.screenshots.length ? (
            <ItemGallery shots={item.screenshots} title={item.title} />
          ) : null}

          <div className="plate plate-primary p-6">
            {downloadable ? (
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="truncate font-mono text-sm text-steel-200">
                    {primary.filename}
                  </p>
                  {/*
                   * The size and nothing else. The checksum used to sit here
                   * and was cut on sight: sixteen characters of a hash nobody
                   * can compare against anything, in the one place on the page
                   * where a reader is deciding whether to click. It is still
                   * stored, still what the ingest dedupes on, and still what
                   * would answer "is this the same file" if anything ever
                   * asked. A download panel is not that question.
                   *
                   * This is the only place the size is written now. It used to
                   * be here and again as a "File size" row in the aside, which
                   * is the same duplication the author line had.
                   */}
                  <p className="mt-1 text-xs text-steel-400">
                    {formatBytes(primary.sizeBytes)}
                  </p>
                </div>
                {/*
                 * Through the site's own route rather than straight at the
                 * bucket, which is what lets the download be counted at all.
                 * No `download` attribute: the route answers with a redirect to
                 * another origin, where a browser ignores it, and an attribute
                 * that only sometimes does what it says is worse than none.
                 *
                 * Keyed by `ref`, the short number, not by the row's UUID. The
                 * link is the thing that gets pasted into Discord and read out
                 * loud, and `/api/download/12` survives both. The route still
                 * answers to the UUID, so nothing already shared has broken.
                 */}
                <a
                  href={`/api/download/${primary.ref}`}
                  className="rounded-sm bg-rust-500 px-6 py-3 font-display text-sm font-semibold uppercase tracking-wider text-white transition-colors hover:bg-rust-400"
                >
                  Download
                </a>
              </div>
            ) : (
              /*
               * Two different failures, said differently. An entry with no file
               * is a gap in the archive; unconfigured storage is a gap in this
               * deployment, and the record itself is fine. Collapsing them into
               * one sentence would tell a reader the wrong thing in one of the
               * two cases.
               */
              <p className="text-sm leading-relaxed text-steel-400">
                {primary === null
                  ? "This entry has no file attached yet. The record is here so what is missing is visible rather than absent."
                  : "File storage is not configured on this deployment, so downloads are unavailable. The catalogue entry is intact; only the link is missing."}
              </p>
            )}

            {item.files.length > 1 ? (
              <ul className="mt-5 space-y-2 border-t border-basalt-700 pt-4">
                {item.files.slice(1).map((file) => (
                  <li
                    key={file.id}
                    className="flex items-center justify-between gap-4 text-sm"
                  >
                    <span className="min-w-0 truncate font-mono text-steel-300">
                      {file.filename}
                    </span>
                    <span className="shrink-0 text-xs text-steel-400">
                      {formatBytes(file.sizeBytes)}
                      {/*
                        Its own download number, on the row rather than only in
                        the link's href, for the same reason the primary file's
                        is spelled out in the aside: a number nobody can see is a
                        number nobody can quote. Outside the `storageConfigured`
                        branch on purpose, because the number belongs to the
                        record and the missing link belongs to the deployment.
                      */}
                      {" · no. "}
                      <span className="font-mono">{file.ref}</span>
                      {storageConfigured ? (
                        <>
                          {" · "}
                          <a
                            href={`/api/download/${file.ref}`}
                            className="text-rust-400 underline underline-offset-4 hover:text-rust-300"
                          >
                            download
                          </a>
                        </>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          {/*
            What is in the pack, for a pack. Still a disclosure and still closed,
            because the answer most people want is the badge in the aside and
            this is the working underneath it. A single level does not get one:
            its name and its save date are two rows in the aside instead, which
            is one fewer thing to open in the ordinary case.
          */}
          {levels.length > 1 ? (
            <details>
              <summary className="cursor-pointer font-display text-xs uppercase tracking-widest text-steel-400 hover:text-steel-200">
                {levels.length} levels inside
              </summary>
              <ul className="mt-3 space-y-1.5 text-sm">
                {levels.map((level) => {
                  const saved = levelSavedOn(level.savedAt);
                  return (
                    <li
                      key={level.path}
                      className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5"
                    >
                      <span className="min-w-0 break-all font-mono text-steel-300">
                        {level.path}
                      </span>
                      <span className="shrink-0 text-xs text-steel-400">
                        version {level.version}
                        {/* "Saved", never a bare date next to a filename: it is
                            the editor's timestamp and not ours. Absent on a level
                            whose header carried no plausible one, and on every
                            level stored before this was read. */}
                        {saved ? ` · saved ${saved}` : ""}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </details>
          ) : null}
        </div>

        {/* --- The record itself ------------------------------------------- */}
        <aside className="space-y-4 lg:sticky lg:top-20 lg:col-start-2 lg:row-span-2 lg:self-start">
          <div className="plate p-5">
            {section.hasLevels ? (
              <div className="mb-5 border-b border-basalt-700 pb-4">
                <p className="font-display text-[0.625rem] font-bold uppercase tracking-widest text-steel-400">
                  Plays on
                </p>

                {/*
                  The compact badge, not the verbose one. Verbose is a paragraph
                  about where the version came from, a paragraph about what
                  unknown means and a link to the guides, which together were the
                  section this page no longer has. The row of four clients with
                  the ones that work lit is the answer; the lines under it are
                  caveats, and only where there is one to make.
                */}
                {unread ? (
                  <p className="mt-2 text-xs leading-relaxed text-steel-400">
                    This file has not been read, so nothing here can say which
                    clients load it.
                  </p>
                ) : (
                  <>
                    <div className="mt-2">
                      <CompatBadge
                        playsOn={compat?.playsOn ?? []}
                        confidence={compat?.detectionConfidence ?? null}
                      />
                    </div>

                    {compat?.rflVersion ? (
                      <p className="mt-2 text-xs leading-relaxed text-steel-400">
                        Level format{" "}
                        <span className="font-mono text-steel-300">
                          {compat.rflVersion}
                        </span>
                        , read from the file rather than entered by hand.
                      </p>
                    ) : null}

                    {unverified ? (
                      <p className="mt-2 text-xs leading-relaxed text-oxide-300">
                        That version is outside the range we have documentation
                        for, so the row above is unproven. Try it yourself.
                      </p>
                    ) : null}

                    {nothingFound ? (
                      <p className="mt-2 text-xs leading-relaxed text-steel-400">
                        No level data was found in this download, so there is
                        nothing to check compatibility against.
                      </p>
                    ) : null}
                  </>
                )}
              </div>
            ) : null}

            <dl className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-3 lg:grid-cols-1">
              {/*
               * "Type", which is the word the shelf uses above its own chip row
               * and the word the owner uses for it out loud. The link is
               * `?type=`, which is what `Category.id` in `@/lib/downloads`
               * documents and what the listing page reads, so the facet is one
               * thing across the whole section.
               */}
              <Field label="Type">
                {category ? (
                  <Link
                    href={`${section.route}?type=${encodeURIComponent(category.id)}`}
                    title={category.blurb}
                    className="text-rust-400 underline underline-offset-4 hover:text-rust-300"
                  >
                    {category.label}
                  </Link>
                ) : (
                  "Uncategorised"
                )}
              </Field>

              <Field label="First release">
                {archiveDate(item.releasedOn) ?? "Not known"}
              </Field>

              <Field label="Last update">{archiveDate(item.updatedAt) ?? "Not known"}</Field>

              {/*
               * The level's own name, which is not the name of the download and
               * is worth having beside it: the first map published here is
               * `dm-ArenaIslandB3.vpp` and the level inside it is
               * `dm-ArenaIslandB3.rfl`, and the second is what appears in a
               * server's rotation and in the console.
               */}
              {onlyLevel ? (
                <Field label="Level file">
                  <span className="break-all font-mono text-xs text-steel-200">
                    {onlyLevel.path}
                  </span>
                </Field>
              ) : null}

              {/*
               * The date in the level header, which is when it was last saved in
               * the editor. Labelled so it cannot be read as the day it arrived
               * here: it is a fact about the file rather than about this site, it
               * usually predates the site by twenty years, and it is what
               * FactionFiles shows.
               *
               * Missing on anything ingested before the field was stored, and on
               * a file whose stamp is absent or implausible. Nothing is rendered
               * in either case rather than a dash, because a row saying "not
               * known" about a date most readers were not looking for is
               * furniture. Re-ingesting the file is what fills it in.
               */}
              {onlySavedOn ? (
                <Field label="Level saved">
                  {onlySavedOn}
                  <span className="mt-0.5 block text-[0.625rem] uppercase tracking-wider text-steel-400">
                    in the editor
                  </span>
                </Field>
              ) : null}

              <Field label="Downloads">
                {item.downloadCount.toLocaleString("en-GB")}
                {/*
                 * Said plainly, because the number is not what a reader assumes
                 * it is. The bucket is public, so anything fetched by its key
                 * directly never passes through the route that counts, and this
                 * undercounts by an amount nobody can measure.
                 */}
                <span className="mt-0.5 block text-[0.625rem] uppercase tracking-wider text-steel-400">
                  through this site
                </span>
              </Field>

              {/*
               * The download number, written out as the path it belongs to.
               *
               * A short id is only worth having if somebody can find it, and the
               * one place it is otherwise visible is the status bar while the
               * pointer sits on a button. So it is here, quiet, selectable and
               * spelled out in full, because the useful thing to paste is the
               * address rather than the digits on their own. Not in the heading:
               * this is a filing number, and the map is called Arena Island.
               *
               * The primary file's, matching "File size" above it. An item with
               * a second file has that one's number beside its own download link
               * in the panel.
               */}
              {primary ? (
                <Field label="Download number">
                  <span className="font-mono">{primary.ref}</span>
                  <span className="mt-1 block font-mono text-[0.625rem] text-steel-400">
                    /api/download/{primary.ref}
                  </span>
                </Field>
              ) : null}
            </dl>

            {item.tags.length ? (
              <div className="mt-5 border-t border-basalt-700 pt-4">
                <p className="font-display text-[0.625rem] font-bold uppercase tracking-widest text-steel-400">
                  Tags
                </p>
                <ul className="mt-2 flex flex-wrap gap-1.5">
                  {item.tags.map((tag) => (
                    <li key={tag}>
                      <Link
                        href={`${section.route}?tag=${encodeURIComponent(tag)}`}
                        className="block rounded-sm border border-basalt-700 bg-basalt-850 px-2 py-0.5 font-display text-[0.625rem] uppercase tracking-wider text-steel-300 transition-colors hover:border-basalt-600 hover:text-steel-100"
                      >
                        {tag}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>

          {/*
            Kept out of the panel above and given the gold border, because these
            are the sentences the parser wanted somebody to look at. Below the
            compatibility, which they qualify, rather than above the facts they
            say nothing about.
          */}
          {compat?.warnings?.length ? (
            <div className="panel border-oxide-400/30 p-4">
              <p className="font-display text-[0.625rem] font-bold uppercase tracking-widest text-oxide-400">
                Noted at upload
              </p>
              <ul className="mt-2 space-y-1 text-sm text-steel-400">
                {compat.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </aside>

        {/* --- Prose, underneath -------------------------------------------- */}
        {item.description || item.updates.length ? (
          <div className="min-w-0 space-y-12 lg:col-start-1">
            {item.description ? (
              <section className="max-w-2xl">
                <h2 className="font-display text-lg font-bold text-steel-100">About</h2>
                {/*
                  Plain text with its line breaks kept. There is no markdown
                  renderer on this site and a description written twenty years ago
                  in a readme is not markdown anyway, so rendering it as prose it
                  never was would eat the punctuation somebody typed.
                */}
                <div className="mt-3 whitespace-pre-line text-sm leading-relaxed text-steel-300">
                  {item.description}
                </div>
              </section>
            ) : null}

            {item.updates.length ? (
              <div className="max-w-2xl">
                <ItemUpdates updates={item.updates} />
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
