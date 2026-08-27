import Link from "next/link";

import {
  activateMapPack,
  deactivateMapPacks,
  deleteMapPack,
  saveMapPack,
} from "@/app/admin/actions";
import type { MapPack } from "@/lib/map-packs";
import { welcomeFor } from "@/lib/map-packs";

/**
 * Map packs, managed.
 *
 * A pack is a themed rotation for the deathmatch server: one mapper's work, a
 * Halloween set, whatever is wanted next. Switching one on rewrites three
 * fields of that server's config and restarts it, and nothing else about the
 * server changes.
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
  const active = packs.find((pack) => pack.active) ?? null;

  return (
    <div className="mt-10 border-t border-basalt-800 pt-6">
      <h3 className="rule-heading">Deathmatch map packs</h3>
      <p className="mt-2 max-w-4xl text-sm leading-relaxed text-steel-400">
        A themed rotation for the DM server. Switching one on changes the level
        list, what the server calls itself and the message players see when they
        join &mdash; nothing else about the server moves.{" "}
        <strong className="text-steel-400">
          The server picks it up within five minutes
        </strong>
        , and only while nobody is playing, so a change made mid-session waits
        rather than kicking everybody.{" "}
        <Link href="/server/map-packs" className="text-steel-400 hover:text-rust-300">
          The public page
        </Link>{" "}
        shows whichever is on.
      </p>

      {active ? (
        <div className="plate mt-4 border-l-2 border-l-rust-500 p-3">
          <p className="text-sm text-steel-200">
            <span className="font-semibold">{active.name}</span> is on
            {active.activatedAt ? (
              <span className="text-steel-500">
                {" "}
                since {active.activatedAt.slice(0, 10)}
              </span>
            ) : null}
          </p>
          <p className="mt-1 font-mono text-xs text-steel-500">
            {active.maps.length} maps · server name:{" "}
            {active.serverName ?? <span className="text-steel-400">unchanged</span>}
          </p>
          <p className="mt-1 text-xs leading-snug text-steel-400">
            Welcome message: &ldquo;{welcomeFor(active)}&rdquo;
          </p>
          <form action={deactivateMapPacks} className="mt-2">
            <button
              type="submit"
              className="rounded-sm border border-basalt-600 px-3 py-1 font-display text-xs uppercase tracking-wider text-steel-300 hover:border-rust-500 hover:text-rust-300"
            >
              Switch off
            </button>
          </form>
          <p className="mt-1.5 text-xs leading-snug text-steel-400">
            Switching off leaves the server exactly as it is. It does not put a
            previous rotation back, because this only knows what it set. The
            pack cannot be deleted while it is on, so that the site never
            forgets a rotation the server is still running.
          </p>
          {/* Not obvious from the button, and it throws away a real reading. */}
          <p className="mt-1 text-xs leading-snug text-steel-400">
            Switching a pack on again restarts its clock: the figures on the
            public page are counted from the moment it was last activated.
          </p>
        </div>
      ) : (
        <p className="mt-3 text-sm text-steel-500">
          No pack is on. The DM server is running whatever rotation it was last
          given.
        </p>
      )}

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
                      ? "Switch it off first — this is the rotation the server is running"
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
              Slug — blank to derive from the name
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

        <div>
          <label className={LABEL} htmlFor="pack-server-name">
            Server name while it is on — blank leaves it alone
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
            placeholder="RedFaction4You.com (Halloween)"
            className={FIELD}
          />
        </div>

        {/* Beside the server name: both are single lines bound for the game,
            and both go through asciiForGame on the way out. */}
        <div>
          <label className={LABEL} htmlFor="pack-welcome">
            Welcome message — blank writes one from the pack
          </label>
          <input
            id="pack-welcome"
            name="welcomeMessage"
            maxLength={300}
            defaultValue={editing?.welcomeMessage ?? ""}
            placeholder="Now playing: Halloween 2026 — 10 maps."
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
          {/* The title is not decoration: it is the join between a pack and the
              archive, and an entry without one goes figureless on the public
              page. Worth saying on the form rather than in a handoff. */}
          <p className="mt-1.5 text-xs leading-snug text-steel-400">
            <strong className="text-steel-500">Give every map a title.</strong>{" "}
            The server reports a map by its display name and never by its
            filename, so the title is how a map is matched to what has been
            played on it. Without one it shows on{" "}
            <Link
              href="/server/map-packs"
              className="text-steel-500 hover:text-rust-300"
            >
              the public page
            </Link>{" "}
            with no time, no rounds and no frags. Author and link are for custom
            maps: a player whose client cannot fetch a map has no other way to
            get it.
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
