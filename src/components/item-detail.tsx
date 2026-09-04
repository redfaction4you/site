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
 * The order of the page is the standing rule on this site: what was recorded
 * owns the top, prose goes underneath. So the download, the pictures, the
 * compatibility reading and the dates sit above the fold, and the description
 * and the changelog sit below them. It has been built the other way round twice
 * and fixed twice, because a paragraph somebody wrote about their map is the
 * interesting part to read and the wrong part to be looking for when the
 * question is "will this load, and how big is it".
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

  /*
   * The primary file, which `getItem` sorts to the front. An item usually has
   * exactly one; a map that ships a texture pack alongside its level has two,
   * and the rest are listed under the button rather than competing with it.
   */
  const primary = item.files[0] ?? null;
  const downloadable = primary !== null && storageConfigured;

  return (
    <div className="mx-auto max-w-5xl px-4 py-16">
      <p className="eyebrow">
        <Link href={section.route} className="hover:text-rust-300">
          {section.title}
        </Link>
      </p>

      <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-2">
        <h1 className="font-display text-4xl font-bold text-steel-100">{item.title}</h1>
        {version ? (
          /*
           * The author's own version string, beside the name the way they wrote
           * it: `Dainer a6a`. Never parsed or ordered, and deliberately nowhere
           * near the compatibility block, where "version" means the RFL format
           * number and answers a completely different question.
           */
          <span className="rounded-sm border border-basalt-600 bg-basalt-850 px-2 py-0.5 font-mono text-sm text-steel-300">
            {version}
          </span>
        ) : null}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-steel-400">
        {/* The author, who is usually not the person who uploaded it and must
            never be rendered as such. */}
        <span>by {item.authorName ?? "an unknown author"}</span>

        {category ? (
          /*
           * `?type=`, which is what `Category.id` in `@/lib/downloads`
           * documents and what the listing page reads. Same pill the listing
           * rows carry, so the facet looks like one thing across the section.
           */
          <Link
            href={`${section.route}?type=${encodeURIComponent(category.id)}`}
            title={category.blurb}
            className="rounded-sm border border-basalt-600 bg-basalt-800 px-1.5 py-0.5 font-display text-[0.625rem] font-semibold uppercase tracking-wider text-steel-300 transition-colors hover:border-basalt-500 hover:text-steel-100"
          >
            {category.label}
          </Link>
        ) : null}
      </div>

      {item.summary ? (
        <p className="mt-4 max-w-2xl text-lg leading-relaxed text-steel-300">
          {item.summary}
        </p>
      ) : null}

      {/*
        The wrapper is conditional rather than the margin being unconditional:
        the gallery renders nothing at all for an item with no screenshots, and
        an empty div with 2rem above it is a gap nobody can explain.
      */}
      {item.screenshots.length ? (
        <div className="mt-8">
          <ItemGallery shots={item.screenshots} title={item.title} />
        </div>
      ) : null}

      {/* --- What was recorded ------------------------------------------- */}
      <div className="mt-10 grid gap-6 lg:grid-cols-[minmax(0,1fr)_15rem]">
        <div className="space-y-6">
          <div className="plate plate-primary p-6">
            {downloadable ? (
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="truncate font-mono text-sm text-steel-200">
                    {primary.filename}
                  </p>
                  <p className="mt-1 text-xs text-steel-400">
                    {formatBytes(primary.sizeBytes)} · SHA-256{" "}
                    <span className="font-mono">{primary.sha256.slice(0, 16)}…</span>
                  </p>
                </div>
                {/*
                 * Through the site's own route rather than straight at the
                 * bucket, which is what lets the download be counted at all.
                 * No `download` attribute: the route answers with a redirect to
                 * another origin, where a browser ignores it, and an attribute
                 * that only sometimes does what it says is worse than none.
                 */}
                <a
                  href={`/api/download/${primary.id}`}
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
                      {storageConfigured ? (
                        <>
                          {" · "}
                          <a
                            href={`/api/download/${file.id}`}
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

          {/* --- Compatibility --------------------------------------------- */}
          {section.hasLevels ? (
            <section>
              <h2 className="font-display text-lg font-bold text-steel-100">
                What can load this
              </h2>
              <div className="mt-3">
                <CompatBadge
                  playsOn={compat?.playsOn ?? []}
                  confidence={compat?.detectionConfidence ?? null}
                  rflVersion={compat?.rflVersion ?? null}
                  verbose
                />
              </div>

              {compat?.warnings?.length ? (
                <div className="panel mt-4 border-oxide-400/30 p-4">
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

              {compat?.levels?.length ? (
                <details className="mt-4">
                  <summary className="cursor-pointer font-display text-xs uppercase tracking-widest text-steel-400 hover:text-steel-200">
                    {compat.levels.length} level
                    {compat.levels.length === 1 ? "" : "s"} inside
                  </summary>
                  <ul className="mt-3 space-y-1.5 text-sm">
                    {compat.levels.map((level) => (
                      <li key={level.path} className="flex justify-between gap-4">
                        <span className="font-mono text-steel-300">{level.path}</span>
                        <span className="shrink-0 text-xs text-steel-400">
                          version {level.version}
                        </span>
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}
            </section>
          ) : null}
        </div>

        {/* --- The record itself ------------------------------------------ */}
        <aside className="plate p-5">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-3 lg:grid-cols-1">
            <Field label="Author">{item.authorName ?? "Unknown"}</Field>

            <Field label="Downloads">
              {item.downloadCount.toLocaleString("en-GB")}
              {/*
               * Said plainly, because the number is not what a reader assumes it
               * is. The bucket is public, so anything fetched by its key
               * directly never passes through the route that counts, and this
               * undercounts by an amount nobody can measure.
               */}
              <span className="mt-0.5 block text-[0.625rem] uppercase tracking-wider text-steel-400">
                through this site
              </span>
            </Field>

            <Field label="First release">
              {archiveDate(item.releasedOn) ?? "Not known"}
            </Field>

            <Field label="Last update">{archiveDate(item.updatedAt) ?? "Not known"}</Field>

            <Field label="Category">
              {category ? (
                <Link
                  href={`${section.route}?type=${encodeURIComponent(category.id)}`}
                  className="text-rust-400 underline underline-offset-4 hover:text-rust-300"
                >
                  {category.label}
                </Link>
              ) : (
                "Uncategorised"
              )}
            </Field>

            {/*
             * The primary file's size, not a total across every file, because
             * this is the number attached to the button above it. The rest are
             * listed with their own sizes in the panel.
             */}
            <Field label="File size">
              {primary ? formatBytes(primary.sizeBytes) : "No file"}
            </Field>
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
        </aside>
      </div>

      {/* --- Prose, underneath ------------------------------------------- */}
      {item.description ? (
        <section className="mt-12 max-w-2xl">
          <h2 className="font-display text-lg font-bold text-steel-100">About</h2>
          {/*
            Plain text with its line breaks kept. There is no markdown renderer
            on this site and a description written twenty years ago in a readme
            is not markdown anyway, so rendering it as prose it never was would
            eat the punctuation somebody typed.
          */}
          <div className="mt-3 whitespace-pre-line text-sm leading-relaxed text-steel-300">
            {item.description}
          </div>
        </section>
      ) : null}

      {item.updates.length ? (
        <div className="mt-12 max-w-2xl">
          <ItemUpdates updates={item.updates} />
        </div>
      ) : null}
    </div>
  );
}
