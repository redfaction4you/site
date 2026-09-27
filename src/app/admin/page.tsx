import type { Metadata } from "next";
import Link from "next/link";

import { adminState } from "@/lib/admin-key";
import { listMapPacks } from "@/lib/map-packs";
import { listAllItems } from "@/lib/catalogue";
import { MapPackAdmin } from "@/components/map-pack-admin";
import { MapOpinionsAdmin } from "@/components/map-opinions-admin";
import { mapReviewList } from "@/lib/map-opinions";
import { CatalogueAdmin } from "@/components/catalogue-admin";
import { UploadAdmin } from "@/components/upload-admin";
import { canWriteToStorage } from "@/lib/r2";
import { SERVERS } from "@/lib/servers";
import { lock, refreshCaches, unlock } from "./actions";

export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/** What each refusal means, in the words of somebody who has to act on it. */
const PROBLEMS: Record<string, string> = {
  "pack-server":
    "Not saved: that is not a server that takes a map pack. Themed, Novelty and Halloween take a rotation; nothing else does.",
  "pack-exists":
    "Not saved: a pack with that name already exists. Saving would have replaced its maps and its blurb. Edit that one, or choose a different name.",
  "pack-missing":
    "Nothing was switched on: that pack no longer exists. Whatever was on has been left alone.",
  "pack-active":
    "Not deleted: that pack is the one currently on. Switch it off first — deleting it would leave the server running a rotation the site no longer knows about.",
  "pack-name":
    "Not saved: a pack needs a name with at least one letter or number in it, because the slug in its URL is made from the name.",
  "pack-empty":
    "Not saved: no maps. A pack with an empty level list would leave the server with nothing to load, so it is refused here rather than sent.",
  "item-missing":
    "Nothing was changed: that item no longer exists. Somebody deleted it, or the page had been open a while. Everything else is untouched.",
  "item-no-file":
    "Not published: this item has no file. Its page would list a download panel with nothing in it and its shelf would count a map nobody can have, so publishing is refused rather than half done. Re-run the ingest for it, then publish.",
  "item-not-published":
    "Nothing was pulled: that item is not live. Pulling means taking down a page people could read, and a draft has never had one. It has been left as a draft rather than marked as something that was pulled.",
  "item-title":
    "Not saved: an item needs a title. It is what every card, shelf listing and link renders, so a blank one would put a nameless row on a shelf.",
  "item-category":
    "Not saved: that category is not one of that shelf's facets, so nothing would ever find the item under it. Mods and tools have no facets at all. Pick one from the list, or leave it as none.",
  "item-date":
    "Not saved: the release date has to be a full date or a bare year, like 2003-11-04 or 2003. Nothing was written, rather than the date being quietly cleared while the page said it had saved.",
  "item-update-title":
    "Nothing was added: a changelog entry needs a line saying what changed. That line is the whole entry on the item's page.",
  "item-update-date":
    "Nothing was added: that release date could not be read. Leave it blank to record today, or give a date like 2004-06-12.",
  "item-shot-none":
    "Nothing was attached: the request named no pictures at all. The files are uploaded first and the row is written second, so if an upload was running it did not finish.",
  "item-shot-unreadable":
    "Nothing was attached: the request did not describe a screenshot. Every one needs its filename and the slot it was uploaded under, because that number is part of the key its object is stored at.",
  "item-shot-key":
    "Nothing was attached: one of those keys is not this item's. A screenshot's address is built from the item's own address and the slot it was uploaded under, and anything else is refused rather than trusted, because a row can otherwise be hung off any object in the bucket and the database backups live in the same bucket.",
  "item-shot-exists":
    "Nothing was attached: that picture is already on this item. Uploading it again would overwrite the object and then fail on the row, so it stopped before either.",
  "item-shot-missing":
    "Nothing was changed: that screenshot no longer exists. Somebody removed it, or the page had been open a while. The rest of the gallery is untouched.",
  default: "That was refused, and nothing was changed.",
};

type Props = {
  searchParams: Promise<{
    wrong?: string;
    saved?: string;
    problem?: string;
    /** A pack slug to load into the map pack form. */
    pack?: string;
    /** A catalogue item id to expand for editing. */
    item?: string;
    /*
     * The catalogue's own view: a search, a shelf, a status and a page. Every
     * one of them is a link rather than client state, so an admin view is a URL
     * somebody can bookmark or leave open on a second screen. `catalogue-admin`
     * parses them and tolerates anything.
     */
    q?: string;
    kind?: string;
    status?: string;
    page?: string;
    /** Filenames a refused pack could not use, and how many were not listed. */
    bad?: string;
    more?: string;
  }>;
};

/**
 * The one page that changes what the site says: uploads, the catalogue, and
 * the rotation each server runs. That is worth a key.
 *
 * The key is typed once per browser, into the box below. The form post sets a
 * signed cookie and redirects to the plain URL, and the page simply opens from
 * then on. Nothing to remember, no account, no session that expires while you
 * are using it.
 *
 * `?key=` in the URL does nothing, deliberately. See `admin-key.ts`: only a
 * form post can set a cookie, so the parameter never unlocked anything, and
 * pre-filling the box from it put the secret in the address bar and in history
 * while looking like the supported way in.
 */
export default async function AdminPage({ searchParams }: Props) {
  const params = await searchParams;
  const state = await adminState();

  if (state.state === "unconfigured") {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16">
        <h1 className="eyebrow">Admin</h1>
        <p className="mt-4 text-sm leading-relaxed text-steel-400">
          No key is configured, so this page is closed to everybody including
          whoever deployed it. Set <code className="text-steel-200">RF4U_ADMIN_KEY</code>{" "}
          in the environment to at least eight characters, and it will ask for
          it here. A key in the URL does nothing.
        </p>
      </div>
    );
  }

  if (state.state === "locked") {
    return (
      <div className="mx-auto max-w-md px-4 py-16">
        <h1 className="eyebrow">Admin</h1>
        <p className="mt-3 text-sm leading-relaxed text-steel-400">
          Type the key once and this browser will remember it.
        </p>
        {params.wrong ? (
          <p className="mt-3 border-l-2 border-rust-500 px-3 py-1 text-sm text-steel-200">
            That key was not right.
          </p>
        ) : null}
        <form action={unlock} className="mt-4 flex gap-2">
          {/* Never pre-filled from the URL: see the note above the component. */}
          <input
            name="key"
            type="password"
            autoComplete="current-password"
            aria-label="Admin key"
            className="min-w-0 flex-1 rounded-sm border border-basalt-600 bg-basalt-850 px-3 py-2 font-mono text-sm text-steel-100 focus:border-rust-500 focus:outline-none"
          />
          <button
            type="submit"
            className="shrink-0 rounded-sm bg-rust-500 px-4 py-2 font-display text-xs font-semibold uppercase tracking-wider text-white hover:bg-rust-400"
          >
            Unlock
          </button>
        </form>
      </div>
    );
  }

  const [packs, catalogue, reviews] = await Promise.all([
    listMapPacks(),
    // The one read on this page that can see a draft. Everything else in
    // `catalogue.ts` filters to published, deliberately.
    listAllItems(),
    // What players told Wisp about the maps. Never cached: this page is the only reader.
    mapReviewList(),
  ]);

  // The pack `?pack=` asked to edit. Unknown slugs fall back to a blank form
  // rather than an error: the only way to get one is a stale link.
  const editingPack = params.pack
    ? (packs.find((pack) => pack.slug === params.pack) ?? null)
    : null;

  // Same arrangement for the catalogue row `?item=` asked to open. An id that
  // no longer exists collapses back to the plain list rather than erroring: the
  // only way to hold one is a page left open while somebody deleted the item.
  const editingItem = params.item
    ? (catalogue.find((entry) => entry.id === params.item) ?? null)
    : null;

  return (
    <div className="mx-auto max-w-6xl px-4 pb-16">
      <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-basalt-800 py-2.5">
        <h1 className="eyebrow">Admin</h1>
        <div className="flex items-baseline gap-4 font-mono text-xs text-steel-400">
          {/*
            Pressed on the deployment whose cache you want cleared, which is the
            whole point of it being here rather than a script. See the doc block
            on the action.
          */}
          <form action={refreshCaches}>
            <button
              type="submit"
              className="hover:text-rust-300"
              title="Drops the cached listings and pages on this deployment. Press it after editing a row outside this screen, or after an ingest from a terminal."
            >
              Refresh the cache
            </button>
          </form>
          <form action={lock}>
            <button type="submit" className="hover:text-rust-300">
              Lock this browser
            </button>
          </form>
        </div>
      </div>

      {params.saved ? (
        <p className="mt-4 border-l-2 border-signal-green px-3 py-1 text-sm text-steel-200">
          {params.saved === "refreshed"
            ? "Cache dropped on this deployment. The next visit to each page reads the database again. If you edited the row somewhere else, press this on that deployment too."
            : "Saved. It applies everywhere immediately."}
        </p>
      ) : null}

      {/*
        Every action here redirects with `?problem=` when it refuses, and until
        9 August nothing rendered it: a refusal looked exactly like a button that
        did nothing, and was reported as one.
      */}
      {params.problem ? (
        <p className="mt-4 border-l-2 border-rust-500 px-3 py-1 text-sm leading-relaxed text-steel-200">
          {params.problem === "pack-filenames" ? (
            <>
              Not saved, and nothing was changed. Every filename has to end in{" "}
              <code className="text-steel-100">.rfl</code>, and{" "}
              {params.more ? "these do not" : "this does not"}:{" "}
              <span className="font-mono text-rust-300">{params.bad}</span>
              {params.more ? `, and ${params.more} more` : ""}. The server drops
              a map it cannot load and runs a shorter rotation without saying
              so, which is why this is refused here.
            </>
          ) : (
            (PROBLEMS[params.problem] ?? PROBLEMS.default)
          )}
        </p>
      ) : null}

      <section className="mt-5">
        <h2 className="rule-heading">Things you can do</h2>
        <ul className="mt-2 space-y-1.5 text-sm">
          {/* First, because it is the one thing here that adds to the site
              rather than tidying it, and it is far enough down the page to be
              missed by somebody who came for something else. */}
          <li>
            <Link href="#upload" className="text-rust-400 hover:text-rust-300">
              Upload a file
            </Link>
            <span className="text-steel-400">
              {" "}
              straight into the catalogue, without a terminal
            </span>
          </li>
          {SERVERS.map((server) => (
            <li key={server.slug}>
              <Link
                href={`/servers/${server.slug}`}
                className="text-steel-300 hover:text-rust-300"
              >
                {server.name}
              </Link>
              <span className="text-steel-400">: the rotation as a reader sees it</span>
            </li>
          ))}
          <li>
            <a
              href="/api/health"
              target="_blank"
              rel="noreferrer"
              className="text-steel-300 hover:text-rust-300"
            >
              Health
            </a>
            <span className="text-steel-400">
              : backups and the database, which vet-live polls
            </span>
          </li>
        </ul>
      </section>

      {/*
        Uploading sits directly above the catalogue because they are two halves
        of one job: a file arrives here and is published one section down. The
        addresses already in use are handed over so the form can say what an
        upload would replace rather than silently upserting onto an existing
        row, which is the trap the ingest CLI guards against within a run and
        could not guard against across one.

        `canWriteToStorage` is read on the server, since it depends on the three
        R2 credentials, none of which is a NEXT_PUBLIC variable and none of which
        may reach a browser.
      */}
      <UploadAdmin
        storageReady={canWriteToStorage()}
        taken={catalogue.map((entry) => ({
          address: `${entry.kind}/${entry.slug}`,
          title: entry.title,
        }))}
      />

      {/*
        Before the map packs, because this is the section with a work queue in
        it. An ingest run leaves drafts that are invisible everywhere else on
        the site, and the point of putting them first is that somebody who came
        here for something else still sees them waiting.
      */}
      <CatalogueAdmin
        items={catalogue}
        editing={editingItem}
        params={params}
        storageReady={canWriteToStorage()}
      />

      {/* Right above the packs: reading it is how a map ends up coming out of one. */}
      <MapOpinionsAdmin reviews={reviews} />

      <MapPackAdmin packs={packs} editing={editingPack} />
    </div>
  );
}
