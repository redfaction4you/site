import Link from "next/link";

import {
  addItemUpdate,
  deleteItem,
  deleteItemUpdate,
  editItem,
  publishItem,
  unpublishItem,
} from "@/app/admin/actions";
import { archiveDate } from "@/components/item-updates";
import type { AdminItem } from "@/lib/catalogue";
import { SECTION_BY_KIND, categoryOf, displayVersion } from "@/lib/downloads";
import { storageConfigured } from "@/lib/storage";

/**
 * The downloads catalogue, managed.
 *
 * The ingest CLI is the only thing that writes to `items`, and everything it
 * creates lands as a draft. This is the other half of that path: without a
 * screen that can see a draft, an ingested map has a row, has its bytes in the
 * bucket, and is visible on no page anywhere, including this one.
 *
 * Drafts come first because they are the work. Everything below them is
 * maintenance.
 *
 * **One item is expanded at a time, through `?item=`, and that is not a styling
 * choice.** The archive is going to hold hundreds of rows, and a closed
 * `<details>` still ships everything inside it, which is what made a match page
 * 749 kB. Rendering an edit form and a changelog for every row would put a few
 * hundred of each into the payload of a page nobody scrolls to the bottom of.
 * The same reasoning, and the same `?pack=` pattern, as the map pack form.
 */

const FIELD =
  "w-full rounded-sm border border-basalt-600 bg-basalt-850 px-2 py-1.5 text-sm text-steel-100 placeholder:text-steel-700 focus:border-rust-500 focus:outline-none";
const LABEL = "figure-label mb-1 block";
const SMALL_BUTTON =
  "shrink-0 rounded-sm border border-basalt-600 px-2.5 py-0.5 font-display text-xs uppercase tracking-wider text-steel-300 hover:border-rust-500 hover:text-rust-300";

/**
 * The three states, in the order they need attention.
 *
 * Each blurb says what the state means rather than repeating its name, because
 * the difference between `draft` and `hidden` is the one thing about this screen
 * that is genuinely not guessable: one has never been seen, the other was pulled.
 */
const GROUPS: { status: AdminItem["status"]; heading: string; blurb: string }[] = [
  {
    status: "draft",
    heading: "Drafts, waiting on a person",
    blurb:
      "Ingested and not published. Nothing links to these and their addresses answer 404, so nobody finds one by accident. Check the title, the author and the category, then publish.",
  },
  {
    status: "published",
    heading: "Published",
    blurb: "Live on their shelf, listed, and reachable by anybody.",
  },
  {
    status: "hidden",
    heading: "Pulled",
    blurb:
      "These were live and were taken down. The record is kept on purpose: the page is gone, the row is not, and publishing puts it back under the same address.",
  },
];

/** `3 files`, `1 file`, and never `0 files` where it matters. */
function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

function ItemRow({ item, expanded }: { item: AdminItem; expanded: boolean }) {
  const section = SECTION_BY_KIND[item.kind] ?? null;
  const path = section ? `${section.route}/${item.slug}` : `/${item.kind}/${item.slug}`;
  const version = displayVersion(item.releaseVersion);
  const live = item.status === "published";

  /*
   * A category the shelf does not recognise is worth saying out loud. The CLI
   * derives one from a level filename prefix and the vocabulary is editorial, so
   * a stored value can fall outside it after a rename. Nothing looks broken: the
   * item simply never appears under any filter chip on its own shelf.
   */
  const category = section ? categoryOf(section, item.category) : null;

  return (
    <li
      id={`item-${item.id}`}
      className={
        "scroll-mt-6 border-b border-basalt-800 px-2 py-2 " +
        (expanded ? "bg-rust-500/[0.04]" : "")
      }
    >
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="min-w-0 flex-1">
          <span className="block text-sm text-steel-100">
            {/* A link only where there is a page. A draft's address is shown
                below as text, because a link that 404s reads as a broken site
                rather than as a thing not yet published. */}
            {live ? (
              <Link href={path} className="hover:text-rust-300">
                {item.title}
              </Link>
            ) : (
              item.title
            )}
            {version ? (
              <span className="ml-2 rounded-sm border border-basalt-600 px-1.5 py-0.5 font-mono text-[0.625rem] text-steel-300">
                {version}
              </span>
            ) : null}
            {item.status === "draft" ? (
              <span className="ml-2 font-display text-[0.625rem] uppercase tracking-wider text-oxide-400">
                draft
              </span>
            ) : null}
            {item.status === "hidden" ? (
              <span className="ml-2 font-display text-[0.625rem] uppercase tracking-wider text-rust-400">
                pulled
              </span>
            ) : null}
          </span>

          <span className="mt-0.5 block text-xs text-steel-400">
            {section?.noun ?? item.kind}
            {" · "}
            {item.category ? (
              category ? (
                category.label
              ) : (
                <span className="text-oxide-400">
                  {item.category}, not a facet of {section?.title ?? item.kind}
                </span>
              )
            ) : section && section.categories.length > 0 ? (
              <span className="text-oxide-400">no category</span>
            ) : (
              "no facets on this shelf"
            )}
            {" · "}
            {item.authorName ?? <span className="text-oxide-400">no author</span>}
          </span>

          <span className="mt-0.5 block font-mono text-[0.625rem] text-steel-400">
            {path}
            {live ? null : (
              <span className="text-oxide-400">
                {item.status === "hidden"
                  ? " answers 404 while it is pulled"
                  : " answers 404 until published"}
              </span>
            )}
          </span>

          <span className="mt-0.5 block font-mono text-[0.625rem] tabular-nums text-steel-400">
            {/* No file is the one count that stops a publish, so it is the one
                that is coloured. */}
            <span className={item.fileCount === 0 ? "text-oxide-400" : ""}>
              {plural(item.fileCount, "file")}
            </span>
            {" · "}
            {plural(item.screenshotCount, "shot")}
            {" · "}
            {plural(item.updates.length, "update")}
            {" · "}
            {plural(item.downloadCount, "download")}
            {item.publishedAt ? ` · live ${archiveDate(item.publishedAt)}` : ""}
            {` · changed ${archiveDate(item.updatedAt)}`}
          </span>
        </span>

        {/*
          Four controls, four sibling forms and a link. A form cannot be nested
          inside another form, so a row that publishes, edits and deletes cannot
          be one form however much it looks like a single row.
        */}
        {live ? (
          <form action={unpublishItem}>
            <input type="hidden" name="id" value={item.id} />
            <button
              type="submit"
              className={SMALL_BUTTON}
              title="Take the page down. The file stays where it is."
            >
              Pull
            </button>
          </form>
        ) : (
          <form action={publishItem}>
            <input type="hidden" name="id" value={item.id} />
            <button
              type="submit"
              className={SMALL_BUTTON}
              title={
                item.fileCount === 0
                  ? "Refused: this item has no file, so its page would offer nothing to download"
                  : "Put it on its shelf"
              }
            >
              Publish
            </button>
          </form>
        )}

        <Link
          href={
            expanded ? "/admin#catalogue" : `/admin?item=${item.id}#item-${item.id}`
          }
          className="shrink-0 font-display text-xs uppercase tracking-wider text-steel-300 hover:text-rust-300"
        >
          {expanded ? "Close" : "Edit"}
        </Link>

        <form action={deleteItem}>
          <input type="hidden" name="id" value={item.id} />
          <button
            type="submit"
            className="shrink-0 font-display text-xs uppercase tracking-wider text-steel-400 hover:text-rust-400"
            title="Removes the row and its files, screenshots and changelog. The stored file itself stays in the bucket and stays downloadable."
          >
            Delete
          </button>
        </form>
      </div>

      {expanded ? <ItemEditor item={item} /> : null}
    </li>
  );
}

/**
 * The edit form and the changelog, for the one item `?item=` names.
 *
 * Two forms side by side rather than one, because they write different things:
 * the left one corrects what the item is, the right one records that its author
 * changed it. Merging them would mean a typo fix writing a changelog entry, and
 * every changelog entry bumping the item to the top of "Recently updated".
 */
function ItemEditor({ item }: { item: AdminItem }) {
  const section = SECTION_BY_KIND[item.kind] ?? null;

  return (
    <div className="mt-3 grid gap-x-8 gap-y-5 border-t border-basalt-800 pt-3 lg:grid-cols-2">
      <form action={editItem} className="grid gap-3">
        <input type="hidden" name="id" value={item.id} />

        <p className="figure-label">
          Details
          <span className="ml-2 font-mono normal-case tracking-normal text-steel-400">
            {item.slug}
          </span>
        </p>

        {/* The address is not editable and the reason is worth a sentence: it is
            half of the (kind, slug) unique key and every link already pasted
            resolves through it. */}
        <p className="text-xs leading-snug text-steel-400">
          The address cannot be changed here. It is what every link already
          pasted resolves through, and editing it would break those and could
          land on another item&rsquo;s address. Re-ingest under the right name
          instead.
        </p>

        <div>
          <label className={LABEL} htmlFor={`title-${item.id}`}>
            Title
          </label>
          <input
            id={`title-${item.id}`}
            name="title"
            required
            maxLength={200}
            defaultValue={item.title}
            className={FIELD}
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={LABEL} htmlFor={`author-${item.id}`}>
              Author
            </label>
            <input
              id={`author-${item.id}`}
              name="authorName"
              maxLength={120}
              defaultValue={item.authorName ?? ""}
              placeholder="who made it"
              className={FIELD}
            />
            {/* The one field on this form that is routinely got wrong, because
                the obvious reading is "who put it here". */}
            <p className="mt-1 text-xs leading-snug text-steel-400">
              Who made it, not who uploaded it. Most of this archive was made by
              people who will never hold an account here.
            </p>
          </div>
          <div>
            <label className={LABEL} htmlFor={`version-${item.id}`}>
              Version, as the author wrote it
            </label>
            <input
              id={`version-${item.id}`}
              name="releaseVersion"
              maxLength={24}
              defaultValue={item.releaseVersion ?? ""}
              placeholder="a6a"
              className={FIELD}
            />
          </div>
        </div>

        <div>
          <label className={LABEL} htmlFor={`summary-${item.id}`}>
            Summary, one line for cards and search
          </label>
          <input
            id={`summary-${item.id}`}
            name="summary"
            maxLength={300}
            defaultValue={item.summary ?? ""}
            className={FIELD}
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={LABEL} htmlFor={`category-${item.id}`}>
              Category
            </label>
            {section && section.categories.length > 0 ? (
              <select
                id={`category-${item.id}`}
                name="category"
                defaultValue={item.category ?? ""}
                className={FIELD}
              >
                <option value="">none</option>
                {section.categories.map((facet) => (
                  <option key={facet.id} value={facet.id}>
                    {facet.label}
                  </option>
                ))}
                {/* A stored value outside the vocabulary would silently reset to
                    "none" on the next save, so it is offered back and refused
                    on submit instead of disappearing. */}
                {item.category && !categoryOf(section, item.category) ? (
                  <option value={item.category}>
                    {item.category} (not a facet, will be refused)
                  </option>
                ) : null}
              </select>
            ) : (
              <p className="text-sm text-steel-400">
                {section?.title ?? "This shelf"} has no facets, so nothing is
                filed under one.
              </p>
            )}
          </div>

          <div>
            <label className={LABEL} htmlFor={`released-${item.id}`}>
              Released, YYYY-MM-DD or a bare year
            </label>
            <input
              id={`released-${item.id}`}
              name="releasedOn"
              maxLength={10}
              defaultValue={item.releasedOn ?? ""}
              placeholder="2003"
              className={`${FIELD} font-mono`}
            />
            <p className="mt-1 text-xs leading-snug text-steel-400">
              When the thing came out, not when it was archived. A bare year is
              stored as the first of January and shown as the year alone.
            </p>
          </div>
        </div>

        <div>
          <label className={LABEL} htmlFor={`tags-${item.id}`}>
            Tags, comma separated
          </label>
          <input
            id={`tags-${item.id}`}
            name="tags"
            defaultValue={item.tags.join(", ")}
            placeholder="ctf, large, remake"
            className={FIELD}
          />
          <p className="mt-1 text-xs leading-snug text-steel-400">
            Lowercased and deduplicated on save, because a tag is a filter link
            and two spellings of one idea each find half the shelf. Twelve at
            most.
          </p>
        </div>

        <div>
          <button
            type="submit"
            className="rounded-sm bg-rust-500 px-4 py-1.5 font-display text-xs font-semibold uppercase tracking-wider text-white hover:bg-rust-400"
          >
            Save details
          </button>
        </div>
      </form>

      <div className="grid content-start gap-3">
        <p className="figure-label">Changelog</p>
        <p className="text-xs leading-snug text-steel-400">
          What the author changed, and when they changed it. Adding an entry also
          marks the item as recently updated, which is what the{" "}
          <span className="text-steel-300">Recently updated</span> sort on the
          shelf reads. Removing one deliberately does not, so a correction never
          promotes an item.
        </p>

        {item.updates.length > 0 ? (
          <ul className="grid gap-1.5">
            {item.updates.map((update) => (
              <li
                key={update.id}
                className="flex flex-wrap items-baseline gap-x-2.5 border-b border-basalt-800 pb-1.5"
              >
                <span className="min-w-0 flex-1 text-sm text-steel-200">
                  {update.title}
                </span>
                {update.releaseVersion ? (
                  <span className="shrink-0 font-mono text-[0.625rem] text-steel-300">
                    {update.releaseVersion}
                  </span>
                ) : null}
                <span className="shrink-0 font-mono text-[0.625rem] text-steel-400">
                  {archiveDate(update.releasedAt)}
                </span>
                {/* Its own form. It sits beside the add form below and cannot
                    be inside it. */}
                <form action={deleteItemUpdate} className="shrink-0">
                  <input type="hidden" name="id" value={update.id} />
                  <button
                    type="submit"
                    className="font-display text-[0.625rem] uppercase tracking-wider text-steel-400 hover:text-rust-400"
                  >
                    Remove
                  </button>
                </form>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-steel-400">
            No entries. An item with none simply shows no changelog on its page.
          </p>
        )}

        <form action={addItemUpdate} className="grid gap-3">
          <input type="hidden" name="itemId" value={item.id} />

          <div>
            <label className={LABEL} htmlFor={`update-title-${item.id}`}>
              What changed
            </label>
            <input
              id={`update-title-${item.id}`}
              name="title"
              required
              maxLength={200}
              placeholder="new version, fixed the flag rooms"
              className={FIELD}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={LABEL} htmlFor={`update-version-${item.id}`}>
                Version this produced
              </label>
              <input
                id={`update-version-${item.id}`}
                name="releaseVersion"
                maxLength={24}
                placeholder="optional"
                className={FIELD}
              />
            </div>
            <div>
              <label className={LABEL} htmlFor={`update-date-${item.id}`}>
                When the author released it
              </label>
              <input
                id={`update-date-${item.id}`}
                name="releasedAt"
                type="date"
                className={`${FIELD} font-mono`}
              />
              {/* Blank is a real answer and it is not always the right one, so
                  it says what blank does rather than leaving it to be found
                  out on a twenty year old changelog entry. */}
              <p className="mt-1 text-xs leading-snug text-steel-400">
                Blank records today, which is only true of something changed
                today.
              </p>
            </div>
          </div>

          <div>
            <label className={LABEL} htmlFor={`update-body-${item.id}`}>
              Detail, optional
            </label>
            <textarea
              id={`update-body-${item.id}`}
              name="body"
              rows={3}
              maxLength={4000}
              className={FIELD}
            />
            <p className="mt-1 text-xs leading-snug text-steel-400">
              Plain text. There is no markdown renderer on this site, so
              asterisks stay asterisks.
            </p>
          </div>

          <div>
            <button type="submit" className={SMALL_BUTTON}>
              Add entry
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function CatalogueAdmin({
  items,
  editing,
}: {
  items: AdminItem[];
  /** The item `?item=<id>` asked to edit, expanded in place. */
  editing: AdminItem | null;
}) {
  const drafts = items.filter((item) => item.status === "draft").length;

  return (
    <div id="catalogue" className="mt-10 scroll-mt-6 border-t border-basalt-800 pt-6">
      <h3 className="rule-heading">Downloads catalogue</h3>

      <p className="mt-2 max-w-4xl text-sm leading-relaxed text-steel-400">
        Everything the ingest run has put in the database, whatever its status.
        The CLI creates drafts and never publishes, so this screen is the step
        between a file being stored and anybody being able to find it.{" "}
        {drafts > 0 ? (
          <strong className="text-steel-300">
            {plural(drafts, "draft")} waiting.
          </strong>
        ) : (
          "Nothing is waiting."
        )}
      </p>

      {/*
        The two things this screen is most likely to be believed about, said
        where the buttons are rather than in a handover document. Both are on
        ITEM_STATUSES in the schema and both have been got wrong before by
        somebody reading only the button.
      */}
      <div className="plate mt-4 border-l-2 border-l-oxide-400 p-3">
        <p className="text-sm leading-relaxed text-steel-300">
          <strong className="text-steel-100">
            None of these buttons touch the file.
          </strong>{" "}
          The bucket is public and serves from its own domain, so an object is
          world readable from the moment the ingest stores it, which is before
          anything here has been pressed. Pulling an item takes down its page and
          leaves the file exactly as downloadable to anybody holding the URL.
          Deleting an item removes the row, and its files, screenshots and
          changelog with it, and leaves the object in the bucket with nothing
          left in the database recording which key it was under. For anything
          that must genuinely stop being distributed, remove it from R2 first and
          delete the row second.
        </p>
        <p className="mt-2 text-sm leading-relaxed text-steel-300">
          <strong className="text-steel-100">
            Publishing an item with no file is refused
          </strong>
          , because its page would offer nothing to download and its shelf would
          count a map nobody can have. That is the only dead download this can
          catch: a file row records that bytes were stored at a key, not that the
          object is still there, so a published page can still link at nothing if
          the bucket has moved on.
        </p>
        {storageConfigured ? null : (
          <p className="mt-2 text-sm leading-relaxed text-oxide-400">
            Storage is not configured on this deployment, so every download panel
            says the file is unavailable rather than linking anywhere. Publishing
            works and the pages are real; the downloads are not, until
            NEXT_PUBLIC_R2_PUBLIC_BASE is set.
          </p>
        )}
      </div>

      {items.length === 0 ? (
        <p className="mt-4 text-sm leading-relaxed text-steel-400">
          Nothing in the catalogue yet. The shelves are built and empty until an
          ingest run puts something here.
        </p>
      ) : (
        GROUPS.map((group) => {
          const rows = items.filter((item) => item.status === group.status);
          if (rows.length === 0) return null;

          return (
            <section key={group.status} className="mt-6">
              <h4 className="rule-heading">
                {group.heading}
                <span className="font-mono normal-case tracking-normal text-steel-400">
                  {rows.length}
                </span>
              </h4>
              <p className="mt-1.5 max-w-4xl text-sm leading-relaxed text-steel-400">
                {group.blurb}
              </p>
              <ul className="mt-2">
                {rows.map((item) => (
                  <ItemRow
                    key={item.id}
                    item={item}
                    expanded={editing?.id === item.id}
                  />
                ))}
              </ul>
            </section>
          );
        })
      )}
    </div>
  );
}
