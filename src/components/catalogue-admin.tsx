import { asc, eq } from "drizzle-orm";
import Image from "next/image";
import Link from "next/link";

import {
  addItemUpdate,
  deleteItem,
  deleteItemUpdate,
  editItem,
  moveScreenshot,
  publishItem,
  removeScreenshot,
  unpublishItem,
} from "@/app/admin/actions";
import { archiveDate } from "@/components/item-updates";
import { ScreenshotUpload } from "@/components/screenshot-upload";
import type { AdminItem } from "@/lib/catalogue";
import { db } from "@/lib/db";
import { screenshots } from "@/lib/db/schema";
import {
  SECTIONS,
  SECTION_BY_KIND,
  categoryOf,
  displayVersion,
  type ItemKind,
} from "@/lib/downloads";
import { publicUrl, storageConfigured } from "@/lib/storage";

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
 *
 * **The filters are links and the search is a GET form**, which is the rule the
 * public shelves are held to and it earns its keep here for a different reason.
 * An admin view is a URL: every draft on the maps shelf is a thing you can
 * bookmark, paste to somebody, or leave open on a second screen while you work
 * through it. Client state would also have to fight `?item=`, because which row
 * is open is a query parameter too, and the two would take turns throwing each
 * other away.
 */

const FIELD =
  "w-full rounded-sm border border-basalt-600 bg-basalt-850 px-2 py-1.5 text-sm text-steel-100 placeholder:text-steel-700 focus:border-rust-500 focus:outline-none";
const LABEL = "figure-label mb-1 block";
const SMALL_BUTTON =
  "shrink-0 rounded-sm border border-basalt-600 px-2.5 py-0.5 font-display text-xs uppercase tracking-wider text-steel-300 hover:border-rust-500 hover:text-rust-300";
const TINY_BUTTON =
  "font-display text-[0.625rem] uppercase tracking-wider text-steel-300 hover:text-rust-300";

/**
 * How many rows render at once.
 *
 * There is one item in the catalogue today and the owner is right that this will
 * not stay true: the live server alone holds 391 custom maps. A page that renders
 * all of them is a page that takes a second to send and cannot be read anyway,
 * and the answer is the same one the frag log got when a match page reached
 * 749 kB. Twenty-five is about a screen and a half of rows, which is enough that
 * paging is rare while a drafts queue is small.
 */
const PAGE_SIZE = 25;

/**
 * The three states, in the order they need attention.
 *
 * Each blurb says what the state means rather than repeating its name, because
 * the difference between `draft` and `hidden` is the one thing about this screen
 * that is genuinely not guessable: one has never been seen, the other was pulled.
 */
const GROUPS: {
  status: AdminItem["status"];
  heading: string;
  /** What the filter chip says. Shorter than the heading, and a noun. */
  chip: string;
  blurb: string;
}[] = [
  {
    status: "draft",
    heading: "Drafts, waiting on a person",
    chip: "Drafts",
    blurb:
      "Ingested and not published. Nothing links to these and their addresses answer 404, so nobody finds one by accident. Check the title, the author and the category, then publish.",
  },
  {
    status: "published",
    heading: "Published",
    chip: "Published",
    blurb: "Live on their shelf, listed, and reachable by anybody.",
  },
  {
    status: "hidden",
    heading: "Pulled",
    chip: "Pulled",
    blurb:
      "These were live and were taken down. The record is kept on purpose: the page is gone, the row is not, and publishing puts it back under the same address.",
  },
];

/** `3 files`, `1 file`, and never `0 files` where it matters. */
function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

/* --- the view, which is a URL --------------------------------------------- */

/** What `/admin` carries about the catalogue, straight off the query string. */
export type CatalogueParams = {
  q?: string;
  kind?: string;
  status?: string;
  page?: string;
  item?: string;
};

type View = {
  q: string;
  kind: ItemKind | null;
  status: AdminItem["status"] | null;
  page: number;
  item: string | null;
};

/**
 * Anything at all is a legal query string, so nothing here throws.
 *
 * A shelf or a status that is not one gets read as no filter rather than as an
 * error, exactly as `parseSort` tolerates anything on the public side. The only
 * way to hold a wrong one is a stale link or a typo, and neither deserves a
 * broken page.
 */
function parseView(params: CatalogueParams): View {
  const kind = SECTIONS.find((section) => section.kind === params.kind)?.kind ?? null;
  const status = GROUPS.find((group) => group.status === params.status)?.status ?? null;
  const page = Number(params.page);

  return {
    q: (params.q ?? "").trim().slice(0, 80),
    kind,
    status,
    page: Number.isInteger(page) && page > 1 ? page : 1,
    item: params.item ?? null,
  };
}

/** This view with something changed, as a link somebody can paste. */
function href(view: View, changes: Partial<View>, anchor = "#catalogue"): string {
  const next = { ...view, ...changes };
  const search = new URLSearchParams();
  if (next.q) search.set("q", next.q);
  if (next.kind) search.set("kind", next.kind);
  if (next.status) search.set("status", next.status);
  if (next.page > 1) search.set("page", String(next.page));
  if (next.item) search.set("item", next.item);
  const query = search.toString();
  return `/admin${query ? `?${query}` : ""}${anchor}`;
}

/**
 * Whether a row survives the filters.
 *
 * The search reads the title, the address and the author, which is what somebody
 * managing this actually has in their head. Title alone would fail on the common
 * case of remembering a filename and not what it was renamed to, and the address
 * is the one string that is guaranteed to be unique.
 */
function matches(item: AdminItem, view: View): boolean {
  if (view.kind && item.kind !== view.kind) return false;
  if (view.status && item.status !== view.status) return false;
  if (!view.q) return true;

  const needle = view.q.toLocaleLowerCase("en-US");
  return [item.title, item.slug, item.authorName ?? ""]
    .join(" ")
    .toLocaleLowerCase("en-US")
    .includes(needle);
}

function FilterLink({
  href: target,
  active,
  title,
  children,
}: {
  href: string;
  active: boolean;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={target}
      title={title}
      aria-current={active ? "true" : undefined}
      className={
        "rounded-sm border px-2.5 py-1 font-display text-xs font-semibold uppercase tracking-wider transition-colors " +
        (active
          ? "border-rust-500 bg-rust-500/15 text-rust-300"
          : "border-basalt-700 bg-basalt-850 text-steel-200 hover:border-basalt-600 hover:text-steel-100")
      }
    >
      {children}
    </Link>
  );
}

/** The number on a chip. Quieter than its label, never quieter than legible. */
function Count({ value }: { value: number }) {
  return <span className="tabular-nums text-steel-400">{value}</span>;
}

/* --- one row -------------------------------------------------------------- */

function ItemRow({
  item,
  expanded,
  view,
  storageReady,
}: {
  item: AdminItem;
  expanded: boolean;
  view: View;
  storageReady: boolean;
}) {
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
                that is coloured. A published item with no picture is the other
                thing worth seeing from here: it is the shape of the gap the
                first real map on this site had. */}
            <span className={item.fileCount === 0 ? "text-oxide-400" : ""}>
              {plural(item.fileCount, "file")}
            </span>
            {" · "}
            <span className={item.screenshotCount === 0 && live ? "text-oxide-400" : ""}>
              {plural(item.screenshotCount, "shot")}
            </span>
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

        {/* Both carry the filters, so opening a row and closing it again lands
            back in the view somebody was working through rather than at the top
            of the whole catalogue. */}
        <Link
          href={
            expanded
              ? href(view, { item: null })
              : href(view, { item: item.id }, `#item-${item.id}`)
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

      {expanded ? (
        <ItemEditor item={item} view={view} storageReady={storageReady} />
      ) : null}
    </li>
  );
}

/* --- the expanded editor -------------------------------------------------- */

/**
 * The screenshots on one item: add, remove, and say which order they go in.
 *
 * **This was the missing control and it is the reported gap.** The upload form
 * takes pictures while it is creating an item and nothing could add one
 * afterwards, so the first map published here had a page with no screenshot on
 * it and no way to get one short of re-ingesting the file from a terminal.
 *
 * The rows are read here rather than handed down with the item. `listAllItems`
 * carries a count for every row and that is all a closed row needs; pulling every
 * screenshot of every item into the page to render one strip is the shape of the
 * bug that made a match page 749 kB. One expanded item, one query.
 */
async function ScreenshotEditor({
  item,
  back,
  storageReady,
}: {
  item: AdminItem;
  back: string;
  storageReady: boolean;
}) {
  const shots = await db
    .select({
      id: screenshots.id,
      storageKey: screenshots.storageKey,
      caption: screenshots.caption,
      position: screenshots.position,
    })
    .from(screenshots)
    .where(eq(screenshots.itemId, item.id))
    .orderBy(asc(screenshots.position));

  // Where the next upload asks to be stored. The action works this out again
  // for itself before it writes, because two people adding pictures at once
  // would otherwise both be told slot three.
  const startAt = shots.reduce((highest, shot) => Math.max(highest, shot.position + 1), 0);

  return (
    <div className="grid content-start gap-2">
      <p className="figure-label">
        Screenshots
        <span className="ml-2 font-mono normal-case tracking-normal text-steel-400">
          {shots.length}
        </span>
      </p>

      <p className="text-xs leading-snug text-steel-400">
        The first one is the card image on the shelf and the opening frame of the
        gallery, so the order is a decision rather than whatever the upload
        happened to be. Removing one deletes the row and leaves the file in the
        bucket, where it stays fetchable by anybody holding its address.
      </p>

      {shots.length > 0 ? (
        <ul className="flex flex-wrap gap-3">
          {shots.map((shot, index) => {
            const src = publicUrl(shot.storageKey);
            const name = shot.storageKey.split("/").pop() ?? shot.storageKey;
            const first = index === 0;
            const last = index === shots.length - 1;

            return (
              <li key={shot.id} className="w-40">
                <div className="relative aspect-video overflow-hidden rounded-sm border border-basalt-700">
                  {src ? (
                    /* Decoration: the filename under it is the label, and the
                       item's own page is where these are read. */
                    <Image src={src} alt="" fill sizes="10rem" className="object-cover" />
                  ) : (
                    <span className="absolute inset-0 grid place-content-center px-2 text-center text-[0.625rem] leading-snug text-oxide-400">
                      no public base, so this cannot be shown
                    </span>
                  )}
                  {first ? (
                    <span className="absolute left-0 top-0 bg-basalt-900/80 px-1 py-0.5 font-display text-[0.5rem] uppercase tracking-wider text-steel-200">
                      card image
                    </span>
                  ) : null}
                </div>

                <p
                  className="mt-1 truncate font-mono text-[0.5625rem] text-steel-400"
                  title={shot.storageKey}
                >
                  {name}
                </p>

                {/* Whatever the ingest sidecar said about this picture. Shown
                    rather than only stored, because it is what the item's own
                    page prints under the frame and nothing else here would
                    reveal that one of them is captioned. */}
                {shot.caption ? (
                  <p className="text-[0.625rem] leading-snug text-steel-300">
                    {shot.caption}
                  </p>
                ) : null}

                <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  {/* One form for both moves, because a submit button carries
                      its own name and value and the two differ only in where
                      the picture is going. */}
                  <form action={moveScreenshot} className="flex gap-x-2">
                    <input type="hidden" name="id" value={shot.id} />
                    <input type="hidden" name="back" value={back} />
                    {first ? null : (
                      <>
                        <button
                          type="submit"
                          name="to"
                          value={0}
                          className={TINY_BUTTON}
                          title="Make this the card image"
                        >
                          First
                        </button>
                        <button type="submit" name="to" value={index - 1} className={TINY_BUTTON}>
                          Up
                        </button>
                      </>
                    )}
                    {last ? null : (
                      <button type="submit" name="to" value={index + 1} className={TINY_BUTTON}>
                        Down
                      </button>
                    )}
                  </form>

                  <form action={removeScreenshot}>
                    <input type="hidden" name="id" value={shot.id} />
                    <input type="hidden" name="back" value={back} />
                    <button
                      type="submit"
                      className="font-display text-[0.625rem] uppercase tracking-wider text-steel-400 hover:text-rust-400"
                      title="Detaches the picture. The object stays in the bucket."
                    >
                      Remove
                    </button>
                  </form>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm text-steel-400">
          None yet, so this item&rsquo;s card on its shelf is a frame with
          nothing in it and its page opens on text. Most of the archive is a
          twenty year old zip nobody photographed; something published today has
          no such excuse.
        </p>
      )}

      <ScreenshotUpload
        itemId={item.id}
        kind={item.kind}
        slug={item.slug}
        startAt={startAt}
        back={back}
        storageReady={storageReady}
      />
    </div>
  );
}

/**
 * The edit form, the changelog and the pictures, for the one item `?item=` names.
 *
 * Three panels rather than one form, because they write different things: one
 * corrects what the item is, one records that its author changed it, and one
 * decides what the item looks like. Merging the first two would mean a typo fix
 * writing a changelog entry, and every changelog entry bumping the item to the
 * top of "Recently updated".
 *
 * The screenshots go first because they are what somebody came here for and what
 * was missing: a picture is the thing an item's page leads with, and looking for
 * the control at the bottom of a form is how it was reported as absent.
 */
function ItemEditor({
  item,
  view,
  storageReady,
}: {
  item: AdminItem;
  view: View;
  storageReady: boolean;
}) {
  const section = SECTION_BY_KIND[item.kind] ?? null;

  /*
   * Where the screenshot actions come back to: this row, in this view. They are
   * the only writes on the screen that keep the filters, because they are the
   * only ones written since the filters existed. Everything else here redirects
   * to a bare `/admin?saved=1` and throws the view away, which is worth fixing
   * the day those actions are next opened.
   */
  const back = href({ ...view, item: item.id }, {}, `#item-${item.id}`);

  return (
    <div className="mt-3 grid gap-x-8 gap-y-5 border-t border-basalt-800 pt-3">
      <ScreenshotEditor item={item} back={back} storageReady={storageReady} />

      <div className="grid gap-x-8 gap-y-5 lg:grid-cols-2">
        <form action={editItem} className="grid content-start gap-3">
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

          <div>
            <label className={LABEL} htmlFor={`description-${item.id}`}>
              Description, the prose under the download
            </label>
            <textarea
              id={`description-${item.id}`}
              name="description"
              rows={8}
              defaultValue={item.description ?? ""}
              className={`${FIELD} resize-y font-sans leading-relaxed`}
            />
            {/*
              Said here because the page renders it with `whitespace-pre-line`
              and nothing else. A blank line between paragraphs is the only
              formatting there is, and a reader who types asterisks expecting
              bold gets asterisks.
            */}
            <p className="mt-1 text-xs leading-snug text-steel-400">
              Plain text, and blank lines are what separate paragraphs. There is
              no markdown renderer on this site, so asterisks stay asterisks.
              Leave it empty and the page simply has no About section.
            </p>
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
    </div>
  );
}

/* --- the section ---------------------------------------------------------- */

export function CatalogueAdmin({
  items,
  editing,
  params,
  storageReady,
}: {
  items: AdminItem[];
  /** The item `?item=<id>` asked to edit, expanded in place. */
  editing: AdminItem | null;
  /** The catalogue's slice of the query string. Filters are links, not state. */
  params: CatalogueParams;
  /** Whether R2 can be written to, which is what the screenshot control needs. */
  storageReady: boolean;
}) {
  const view = parseView(params);
  const drafts = items.filter((item) => item.status === "draft").length;

  /*
   * Faceted counts: each chip counts what pressing it would actually show, so a
   * status chip is counted within the shelf and the search already in force. A
   * chip reading 137 that lands on eleven rows is a chip nobody trusts twice.
   */
  const byStatus = (status: AdminItem["status"] | null) =>
    items.filter((item) => matches(item, { ...view, status })).length;
  const byKind = (kind: ItemKind) =>
    items.filter((item) => matches(item, { ...view, kind })).length;

  const filtered = items.filter((item) => matches(item, view));

  /*
   * Drafts first, then live, then pulled, and that ordering is the point of the
   * whole grouping: a draft is invisible everywhere else on the site, so the
   * work queue has to be the thing you land on. Within a status the order is
   * whatever `listAllItems` gave us, which is newest first.
   */
  const ordered = GROUPS.flatMap((group) =>
    filtered.filter((item) => item.status === group.status),
  );

  const pages = Math.max(1, Math.ceil(ordered.length / PAGE_SIZE));
  const page = Math.min(view.page, pages);
  const from = (page - 1) * PAGE_SIZE;
  const shown = ordered.slice(from, from + PAGE_SIZE);

  /*
   * A run of rows sharing a status, so each heading and each blurb appears once
   * where its rows start. There are at most three, because `ordered` is grouped
   * already, and a run can be the tail of a group continued from the page
   * before.
   */
  const runs: { status: AdminItem["status"]; rows: AdminItem[] }[] = [];
  for (const item of shown) {
    const open = runs[runs.length - 1];
    if (open && open.status === item.status) open.rows.push(item);
    else runs.push({ status: item.status, rows: [item] });
  }

  /*
   * The row somebody asked to edit, when the filters or the paging would have
   * hidden it. Pinned above the list rather than dropped, because `?item=` is
   * usually older than the filters: a link left open on another screen, or a
   * search typed after the row was opened. A page that answers it with an empty
   * list reads as an item that has been deleted.
   */
  const pinned = editing && !shown.some((row) => row.id === editing.id) ? editing : null;

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
        <>
          {/* --- narrowing it down, in links -------------------------------- */}

          <div className="mt-4 grid gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="figure-label w-14 shrink-0">State</span>
              <FilterLink
                href={href(view, { status: null, page: 1 })}
                active={view.status === null}
              >
                All <Count value={byStatus(null)} />
              </FilterLink>
              {GROUPS.map((group) => (
                <FilterLink
                  key={group.status}
                  href={href(view, { status: group.status, page: 1 })}
                  active={view.status === group.status}
                >
                  {group.chip} <Count value={byStatus(group.status)} />
                </FilterLink>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="figure-label w-14 shrink-0">Shelf</span>
              <FilterLink
                href={href(view, { kind: null, page: 1 })}
                active={view.kind === null}
              >
                All
              </FilterLink>
              {SECTIONS.map((section) => (
                <FilterLink
                  key={section.kind}
                  href={href(view, { kind: section.kind, page: 1 })}
                  active={view.kind === section.kind}
                >
                  {section.title} <Count value={byKind(section.kind)} />
                </FilterLink>
              ))}
            </div>

            {/*
              A GET form, so a search is a URL like every other view here and
              works with no JavaScript at all. The two chips already in force ride
              along as hidden fields; the page number and the open row do not,
              because a new search starts at the top and the row it was opened
              from is probably not in it.
            */}
            <form
              method="get"
              action="/admin#catalogue"
              className="flex flex-wrap items-center gap-2"
            >
              {view.kind ? <input type="hidden" name="kind" value={view.kind} /> : null}
              {view.status ? (
                <input type="hidden" name="status" value={view.status} />
              ) : null}
              <label className="figure-label w-14 shrink-0" htmlFor="catalogue-q">
                Find
              </label>
              <input
                id="catalogue-q"
                name="q"
                defaultValue={view.q}
                maxLength={80}
                placeholder="title, address or author"
                className={`${FIELD} max-w-xs`}
              />
              <button type="submit" className={SMALL_BUTTON}>
                Search
              </button>
              {view.q ? (
                <Link href={href(view, { q: "", page: 1 })} className={TINY_BUTTON}>
                  Clear
                </Link>
              ) : null}
            </form>
          </div>

          {/* --- the rows --------------------------------------------------- */}

          {pinned ? (
            <section className="mt-6">
              <h4 className="rule-heading">Open for editing</h4>
              <p className="mt-1.5 max-w-4xl text-sm leading-relaxed text-steel-400">
                The address asked for this row and the view above does not hold
                it, so it is here rather than nowhere. A link to an item is
                usually older than the search or the page that excludes it, and
                a screen that answers one with an empty list reads as an item
                somebody has deleted.
              </p>
              <ul className="mt-2">
                <ItemRow
                  item={pinned}
                  expanded
                  view={view}
                  storageReady={storageReady}
                />
              </ul>
            </section>
          ) : null}

          {ordered.length === 0 ? (
            /* Not the same message as an empty catalogue, and never worded as
               one: there is plenty here and this particular question has no
               answer. */
            <p className="mt-6 max-w-4xl text-sm leading-relaxed text-steel-400">
              Nothing matches that. The catalogue holds{" "}
              {plural(items.length, "item")} and{" "}
              {view.q ? (
                <>
                  nothing {view.kind || view.status ? "in this view " : ""}
                  mentions <span className="text-steel-200">{view.q}</span>
                </>
              ) : view.kind && view.status ? (
                "nothing on that shelf is in that state"
              ) : view.kind ? (
                "none of them is on that shelf"
              ) : (
                "none of them is in that state"
              )}
              .{" "}
              <Link
                href={href(view, { q: "", kind: null, status: null, page: 1 })}
                className="text-rust-400 hover:text-rust-300"
              >
                Show everything
              </Link>
              .
            </p>
          ) : (
            runs.map((run) => {
              const group = GROUPS.find((entry) => entry.status === run.status)!;
              const total = byStatus(run.status);

              return (
                <section key={run.status} className="mt-6">
                  <h4 className="rule-heading">
                    {group.heading}
                    <span className="font-mono normal-case tracking-normal text-steel-400">
                      {run.rows.length === total
                        ? total
                        : `${run.rows.length} of ${total}`}
                    </span>
                  </h4>
                  <p className="mt-1.5 max-w-4xl text-sm leading-relaxed text-steel-400">
                    {group.blurb}
                  </p>
                  <ul className="mt-2">
                    {run.rows.map((item) => (
                      <ItemRow
                        key={item.id}
                        item={item}
                        expanded={editing?.id === item.id}
                        view={view}
                        storageReady={storageReady}
                      />
                    ))}
                  </ul>
                </section>
              );
            })
          )}

          {/* --- paging, which is also links -------------------------------- */}

          {pages > 1 ? (
            <div className="mt-4 flex flex-wrap items-baseline gap-x-4 gap-y-2">
              <span className="font-mono text-xs tabular-nums text-steel-400">
                {from + 1} to {from + shown.length} of {ordered.length}
              </span>
              {page > 1 ? (
                <Link href={href(view, { page: page - 1 })} className={SMALL_BUTTON}>
                  Previous
                </Link>
              ) : null}
              {page < pages ? (
                <Link href={href(view, { page: page + 1 })} className={SMALL_BUTTON}>
                  Next {Math.min(PAGE_SIZE, ordered.length - from - shown.length)}
                </Link>
              ) : null}
              <span className="font-mono text-xs tabular-nums text-steel-400">
                page {page} of {pages}
              </span>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
