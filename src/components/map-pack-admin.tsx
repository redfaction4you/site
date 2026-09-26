import Link from "next/link";

import {
  activateMapPack,
  deactivateMapPacks,
  deleteMapPack,
  saveMapPack,
} from "@/app/admin/actions";
import type { MapPack } from "@/lib/map-packs";
import { welcomeFor } from "@/lib/map-packs";
import { SERVERS } from "@/lib/servers";

/**
 * Map packs, managed.
 *
 * A pack is the rotation one server runs: one mapper's work, a Halloween set,
 * whatever is wanted next. Exactly one pack is on per server. For Themed,
 * switching one on rewrites three fields of that server's config and restarts
 * it, and nothing else about the server changes; see the note on the panel for
 * why Novelty and Halloween are different.
 *
 * The maps go in as text, one per line, because a pack is twenty filenames and
 * the fastest way to enter twenty filenames is to paste twenty lines. The
 * optional columns after the filename exist for the public page, not the
 * server: it credits the mapper and links somewhere to download.
 */

const FIELD =
  "w-full rounded-sm border border-basalt-600 bg-basalt-850 px-2 py-1.5 text-sm text-steel-100 placeholder:text-steel-700 focus:border-rust-500 focus:outline-none";
const LABEL = "figure-label mb-1 block";

function mapsToText(pack: MapPack | null): string {
  if (!pack) return "";
  return pack.maps
    .map((entry) =>
      [entry.filename, entry.title, entry.author, entry.url]
        .map((part) => part ?? "")
        .join(" | ")
        .replace(/(\s*\|\s*)+$/, ""),
    )
    .join("\n");
}

export function MapPackAdmin({
  packs,
  editing,
}: {
  packs: MapPack[];
  /** The pack `?pack=<slug>` asked to edit, loaded into the form below. */
  editing: MapPack | null;
}) {
  // One entry per server, because exactly one pack is on per server. This
  // showed the first active pack in the table and nothing else, which was the
  // same answer while only Themed took packs and hid two servers after that.
  const onNow = SERVERS.map((server) => ({
    server,
    pack: packs.find((pack) => pack.active && pack.server === server.slug) ?? null,
  }));

  return (
    <div className="mt-10 border-t border-basalt-800 pt-6">
      <h3 className="rule-heading">Map packs</h3>
      <p className="mt-2 max-w-4xl text-sm leading-relaxed text-steel-400">
        The rotation each server runs. Switching one on changes the level list,
        what the server calls itself and the message players see when they
        join, and nothing else about the server.{" "}
        <strong className="text-steel-400">
          Themed picks it up on its nightly pass, around 4am Pacific
        </strong>
        , and only while nobody is playing, so a change never kicks anybody; to
        land one sooner, start the <code>RF4U DM Map Pack</code> task on the
        VPS by hand.{" "}
        <strong className="text-steel-400">
          Novelty and Halloween are not applied automatically.
        </strong>{" "}
        Their configs on the VPS are edited by hand, so switching a pack on
        here changes the list on their page and not what they play until the
        config is changed to match. Each server&rsquo;s page shows whichever
        pack is on.
      </p>

      <ul className="mt-4 space-y-3">
        {onNow.map(({ server, pack }) => (
          <li key={server.slug}>
            {pack ? (
              <div className="plate border-l-2 border-l-rust-500 p-3">
                <p className="text-sm text-steel-200">
                  <Link
                    href={`/servers/${server.slug}`}
                    className="text-steel-400 hover:text-rust-300"
                  >
                    {server.name}
                  </Link>
                  : <span className="font-semibold">{pack.name}</span> is on
                  {pack.activatedAt ? (
                    <span className="text-steel-500">
                      {" "}
                      since {pack.activatedAt.slice(0, 10)}
                    </span>
                  ) : null}
                </p>
                <p className="mt-1 font-mono text-xs text-steel-500">
                  {pack.maps.length} maps · server name:{" "}
                  {pack.serverName ?? <span className="text-steel-400">unchanged</span>}
                </p>
                <p className="mt-1 text-xs leading-snug text-steel-400">
                  Welcome message: &ldquo;{welcomeFor(pack)}&rdquo;
                </p>
                <form action={deactivateMapPacks} className="mt-2">
                  <input type="hidden" name="server" value={server.slug} />
                  <button
                    type="submit"
                    className="rounded-sm border border-basalt-600 px-3 py-1 font-display text-xs uppercase tracking-wider text-steel-300 hover:border-rust-500 hover:text-rust-300"
                  >
                    Switch off
                  </button>
                </form>
              </div>
            ) : (
              <p className="text-sm text-steel-500">
                {server.name}: no pack is on. It is running whatever rotation it
                was last given.
              </p>
            )}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs leading-snug text-steel-400">
        Switching off leaves that server exactly as it is. It does not put a
        previous rotation back, because this only knows what it set. A pack
        cannot be deleted while it is on, so that the site never forgets a
        rotation a server is still running.
      </p>

      {packs.length > 0 ? (
        <ul className="mt-4 space-y-2">
          {packs.map((pack) => (
            <li
              key={pack.slug}
              className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-basalt-800 pb-2"
            >
              <span className="text-sm text-steel-200">{pack.name}</span>
              <span className="font-mono text-xs text-steel-400">
                {pack.maps.length} maps · /{pack.slug}
              </span>
              {pack.active ? (
                <span className="font-display text-xs uppercase tracking-wider text-rust-400">
                  on
                </span>
              ) : (
                <form action={activateMapPack}>
                  <input type="hidden" name="slug" value={pack.slug} />
                  <button
                    type="submit"
                    className="rounded-sm border border-basalt-600 px-2.5 py-0.5 font-display text-xs uppercase tracking-wider text-steel-300 hover:border-rust-500 hover:text-rust-300"
                  >
                    Switch on
                  </button>
                </form>
              )}

              {/* Loads it into the form below rather than making somebody
                  retype twenty filenames to correct one of them. */}
              <Link
                href={`/admin?pack=${encodeURIComponent(pack.slug)}#pack-form`}
                className="ml-auto font-display text-xs uppercase tracking-wider text-steel-300 hover:text-rust-300"
              >
                Edit
              </Link>

              <form action={deleteMapPack}>
                <input type="hidden" name="slug" value={pack.slug} />
                <button
                  type="submit"
                  className="font-display text-xs uppercase tracking-wider text-steel-400 hover:text-rust-400"
                  // The action refuses the active one; saying so first saves a
                  // round trip and reads as a rule rather than a rejection.
                  title={
                    pack.active
                      ? "Switch it off first: this is the rotation the server is running"
                      : "Delete this pack"
                  }
                >
                  Delete
                </button>
              </form>
            </li>
          ))}
        </ul>
      ) : null}

      {/*
        One form for both new and existing packs: the slug is the key, so
        saving under a name that already exists edits it. Fewer controls than a
        separate edit mode, and re-pasting a corrected map list is the common
        case anyway.
      */}
      {/* Two columns from `lg`: the settings are eight short fields and a
          textarea, and stacking them ran this form down a whole screen. */}
      <form
        id="pack-form"
        action={saveMapPack}
        // Keyed on the slug so React rebuilds the fields when a different pack
        // is chosen. Without it the defaultValues are ignored on the second
        // Edit click, because the inputs are the same elements.
        key={editing?.slug ?? "new"}
        className="mt-6 grid scroll-mt-6 gap-x-8 gap-y-3 lg:grid-cols-2"
      >
        <p className="figure-label lg:col-span-2">
          {editing ? (
            <>
              Editing {editing.name}
              <Link
                href="/admin#pack-form"
                className="ml-3 normal-case tracking-normal text-steel-400 hover:text-rust-300"
              >
                start a new one instead
              </Link>
            </>
          ) : (
            "Add a pack"
          )}
        </p>

        <div className="grid gap-3 sm:grid-cols-2 lg:col-span-2">
          <div>
            <label className={LABEL} htmlFor="pack-name">
              Name
            </label>
            <input
              id="pack-name"
              name="name"
              required
              maxLength={80}
              defaultValue={editing?.name ?? ""}
              placeholder="Halloween 2026"
              className={FIELD}
            />
          </div>
          <div>
            <label className={LABEL} htmlFor="pack-slug">
              Slug: blank to derive from the name
            </label>
            <input
              id="pack-slug"
              name="slug"
              maxLength={60}
              defaultValue={editing?.slug ?? ""}
              placeholder="halloween-2026"
              className={FIELD}
            />
          </div>
        </div>

        {/*
          Which server the pack is for, and this control did not exist.

          The column has a `themed` default and `saveMapPack` never wrote the
          key, so every pack made here landed on Themed however it was named.
          The three per-server rows in the database today were written by hand,
          which is why it went unnoticed: editing one of those is safe, since
          the upsert leaves `server` alone. Creating a Novelty pack quietly made
          a fourth Themed pack.

          A default of `themed` rather than a blank first option, because a pack
          has to belong to a server and the form should not be able to submit a
          state the action refuses. Every server in servers.ts takes a pack.
        */}
        <div>
          <label className={LABEL} htmlFor="pack-server">
            Server this pack is for
          </label>
          <p className="mt-1 text-xs leading-relaxed text-steel-400">
            Each server has exactly one pack on at a time. Switching this one on
            switches off whatever that server was running, and leaves the other
            servers alone.
          </p>
          <select
            id="pack-server"
            name="server"
            defaultValue={editing?.server ?? "themed"}
            className={FIELD}
          >
            {SERVERS.map((server) => (
              <option key={server.slug} value={server.slug}>
                {server.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={LABEL} htmlFor="pack-server-name">
            Server name while it is on: blank leaves it alone
          </label>
          {/* Worth reading before typing in this box. The applier writes this
              straight into rf4u-dm.toml, so a pack carrying an old name silently
              renames the server back the next time it is applied. That very
              nearly undid the rename to Bot-Free Pub: the stored pack still said
              "RedFaction4You.com [DM] — Stock Favourites" and would have won on
              the next edit. Leave it blank unless the pack genuinely should
              rename the server. */}
          <p className="mt-1 text-xs leading-relaxed text-steel-500">
            This is written into the server config, so it overrides the name the
            server is running under. Leave it blank unless this pack should
            rename the server while it is on.
          </p>
          <input
            id="pack-server-name"
            name="serverName"
            maxLength={80}
            defaultValue={editing?.serverName ?? ""}
            placeholder="RF4U - Halloween"
            className={FIELD}
          />
        </div>

        {/* Beside the server name: both are single lines bound for the game,
            and both go through asciiForGame on the way out. */}
        <div>
          <label className={LABEL} htmlFor="pack-welcome">
            Welcome message: blank writes one from the pack
          </label>
          <input
            id="pack-welcome"
            name="welcomeMessage"
            maxLength={300}
            defaultValue={editing?.welcomeMessage ?? ""}
            placeholder="Now playing: Halloween 2026, 10 maps."
            className={FIELD}
          />
        </div>

        <div className="lg:col-span-2">
          <label className={LABEL} htmlFor="pack-blurb">
            Blurb for the public page
          </label>
          <textarea
            id="pack-blurb"
            name="blurb"
            rows={2}
            maxLength={600}
            defaultValue={editing?.blurb ?? ""}
            placeholder="Ten maps with a haunted streak, on the server until November."
            className={FIELD}
          />
        </div>

        <div className="lg:col-span-2">
          <label className={LABEL} htmlFor="pack-maps">
            Maps, one per line: filename | title | author | link
          </label>
          <textarea
            id="pack-maps"
            name="maps"
            rows={8}
            required
            defaultValue={editing ? mapsToText(editing) : ""}
            placeholder={
              "dm04.rfl | The Pit | SomeMapper | https://factionfiles.com/...\ndm07.rfl\nglass_house.rfl | Glass House"
            }
            className={`${FIELD} font-mono text-xs`}
          />
          <p className="mt-1 text-xs leading-snug text-steel-400">
            Only the filename is required and it must end in{" "}
            <code className="text-steel-500">.rfl</code>. A bad filename is
            refused here, because the server&rsquo;s own answer to one is to drop
            it and quietly run a shorter rotation. Lines starting with{" "}
            <code className="text-steel-500">#</code> are ignored.
          </p>
          {/* The title is not decoration: it is what the server page prints,
              and what it looks for when it marks the map playing now. Worth
              saying on the form rather than in a handoff. */}
          <p className="mt-1.5 text-xs leading-snug text-steel-400">
            <strong className="text-steel-500">Give every map a title.</strong>{" "}
            It is what the server page lists, and how that page marks the map
            playing now when the server reports a name rather than a filename.
            Author and link are for custom maps: a player whose client cannot
            fetch a map has no other way to get it.
          </p>
        </div>

        <div>
          <button
            type="submit"
            className="rounded-sm bg-rust-500 px-4 py-1.5 font-display text-xs font-semibold uppercase tracking-wider text-white hover:bg-rust-400"
          >
            Save pack
          </button>
        </div>
      </form>

      {packs.length > 0 ? (
        <details className="mt-4">
          <summary className="cursor-pointer font-display text-xs uppercase tracking-widest text-steel-500 hover:text-steel-300">
            Copy an existing pack&rsquo;s map list
          </summary>
          <div className="mt-2 space-y-3">
            {packs.map((pack) => (
              <div key={pack.slug}>
                <p className="figure-label">{pack.name}</p>
                <pre className="mt-1 overflow-x-auto rounded-sm border border-basalt-700 bg-basalt-900 p-2 font-mono text-xs text-steel-400">
                  {mapsToText(pack)}
                </pre>
              </div>
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}
