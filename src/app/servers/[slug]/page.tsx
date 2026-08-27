import type { Metadata } from "next";
import { notFound } from "next/navigation";

import Image from "next/image";

import { ServerTabs } from "@/components/server-tabs";
import { getMapPack } from "@/lib/map-packs";
import { getServerStatus } from "@/lib/server-status";
import { nextInRotation, positionInRotation, rotationFrom } from "@/lib/server-rotation";
import {
  SERVERS,
  serverAddress,
  serverBySlug,
} from "@/lib/servers";

export const dynamic = "force-dynamic";

export function generateStaticParams() {
  return SERVERS.map((server) => ({ slug: server.slug }));
}

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const server = serverBySlug((await params).slug);
  if (!server) return { title: "Server" };
  return { title: server.name, description: server.blurb };
}

/*
 * The row classes, hoisted.
 *
 * Built inline they were a fresh string per map, which is what stopped 156
 * identical rows from sharing anything in the serialised tree.
 */
const ROW = "border-b border-basalt-800 py-1.5";
const PLAYING_ROW = "server-accent-bg border-b border-basalt-800 py-1.5";
const LINK = "text-sm text-steel-200 hover:underline";
const PLAYING_LINK = "server-accent text-sm font-semibold hover:underline";

/** Seconds into something a person would say out loud. */
function clock(seconds: number): string {
  const whole = Math.max(0, Math.round(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

/**
 * One server, everything about it.
 *
 * A page each rather than tabs on one page, because these are four different
 * things a person arrives at from four different places: somebody who wants the
 * Halloween map pack has no use for the match server's scoreboard, and a tab is
 * not a URL you can put in a Discord message.
 *
 * **Live status comes from the FactionFiles server browser, not from us.** The
 * two pub servers run no broadcaster and record nothing, so there is nothing on
 * that machine for this page to ask. Asking the browser by host and port is what
 * makes a play-only server cost nothing to show.
 *
 * **Where the order is trustworthy and where it is not**: see
 * `server-rotation.ts`. The short version is that Alpine reshuffles a rotation
 * inside the game server without telling anybody, so `dynamic_rotation` is off
 * on these servers and only that makes "next" honest.
 */
export default async function ServerPage({ params }: Props) {
  const server = serverBySlug((await params).slug);
  if (!server) notFound();

  const address = serverAddress(server);
  const [status, pack] = await Promise.all([
    address ? getServerStatus(address) : Promise.resolve({ state: "unknown" as const, reason: "No server address configured." }),
    server.packSlug ? getMapPack(server.packSlug) : Promise.resolve(null),
  ]);

  const online = status.state === "online" ? status : null;
  const maps = pack?.maps ?? [];
  const playing = online?.mapInfo?.name ?? online?.map ?? null;
  const at = positionInRotation(playing, maps);
  const next = nextInRotation(playing, maps);
  const ordered = rotationFrom(playing, maps);

  return (
    <div
      data-server-theme={server.theme}
      className="mx-auto max-w-5xl px-4 pb-16"
    >
      {/*
        One heading for all four, then the tabs, then the one you are on.

        The alternative was a hub page listing four cards and a page behind each,
        which is one more click to reach the thing everybody wants and puts the
        map list two pages deep. Tabs are still links, so nothing is lost: every
        server remains a URL that can be pasted.
      */}
      <div className="pt-8">
        <p className="eyebrow">Play</p>
        <h1 className="mt-2 font-display text-3xl font-bold uppercase tracking-[0.12em] text-steel-100 sm:text-4xl">
          Our servers
        </h1>
        <ServerTabs active={server.slug} />
      </div>

      <div className="mt-5">
        <h2 className="font-display text-2xl font-bold text-steel-100">
          {server.name}
        </h2>
        <p className="mt-1.5 max-w-3xl text-base leading-relaxed text-steel-300">
          {server.blurb}
        </p>
      </div>

      {/* --- what it is doing right now ----------------------------------- */}
      {/*
        The level being played, behind the panel that says so.

        FactionFiles keeps a preview image for every map and the lookup already
        returns its address, so this costs one more request to a host the site is
        already configured for. A scrim sits over it because the text has to stay
        legible on whatever the picture happens to be: these are screenshots
        nobody chose for their contrast, and half of them are dark corridors and
        the other half are lit by lava.

        **Served through our own domain, never hot-linked.** With `unoptimized`
        the browser fetched it straight from factionfiles.com, and Malwarebytes
        Browser Guard flags that host: a visitor got a red "Malware blocked"
        panel over the page, naming our site as the one doing it. Almost
        certainly a false positive on a game file host, but it does not matter
        whose fault it is. A malware warning on your own site is worse than any
        background image is worth, and a third-party request is the thing that
        triggers it.

        Next's optimiser proxies the image from `/_next/image`, so the browser
        only ever talks to us. It also caches and resizes, which the raw
        `preview.php` endpoint does neither of.
      */}
      <section className="server-accent-border server-accent-bg relative mt-5 overflow-hidden rounded-sm border">
        {online?.mapInfo?.imageUrl ? (
          <>
            <Image
              src={online.mapInfo.imageUrl}
              alt=""
              fill
              sizes="(min-width: 1024px) 960px, 100vw"
              className="object-cover"
              priority
            />
            <div className="absolute inset-0 bg-basalt-950/88" />
          </>
        ) : null}
        <div className="relative px-4 py-3">
        {online ? (
          <>
            <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
              <div className="min-w-0">
                <p className="eyebrow server-accent">Playing now</p>
                <p className="mt-0.5 font-display text-xl font-bold leading-tight text-steel-100">
                  {online.mapInfo?.name ?? online.map ?? "an unnamed level"}
                </p>
                {/*
                  Where it is in the rotation, and what follows it, on one line.

                  These were two blocks and the second carried a rule above it,
                  so a panel reporting an empty server ran to six stacked rows.
                  They are one fact read forwards and backwards.
                */}
                {at !== null || next ? (
                  <p className="mt-0.5 font-mono text-xs text-steel-500">
                    {at !== null ? `${at + 1} of ${maps.length}` : null}
                    {at !== null && next ? " · " : null}
                    {/* Said as "in rotation" rather than "next", because a vote
                        changes it and the site is not told. */}
                    {next ? (
                      <>
                        next in rotation:{" "}
                        <span className="text-steel-400">{next.title ?? next.filename}</span>
                      </>
                    ) : null}
                  </p>
                ) : null}
              </div>
              <div className="text-right">
                <p className="font-display text-xl font-bold text-steel-100 tabular-nums">
                  {online.humans}
                  <span className="text-steel-500">/{online.maxPlayers}</span>
                </p>
                <p className="font-mono text-xs text-steel-500">
                  {online.humans === 0
                    ? "nobody on"
                    : online.humans === 1
                      ? "one player"
                      : `${online.humans} players`}
                  {online.game?.timeLeft != null
                    ? `, ${clock(online.game.timeLeft)} left`
                    : ""}
                </p>
              </div>
            </div>

            {/* Who is actually in there. The whole question somebody opens
                this page to answer, and it is free: the browser already
                returns it beside the level. */}
            {online.game?.players?.length ? (
              <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 border-t border-basalt-800 pt-2.5">
                {online.game.players.map((player, index) => (
                  <li
                    key={`${player.name}-${index}`}
                    className="font-mono text-sm text-steel-200"
                  >
                    {player.name}
                    <span className="ml-1.5 text-steel-600 tabular-nums">
                      {player.kills}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}

          </>
        ) : status.state === "offline" ? (
          <p className="text-sm text-steel-400">
            This server is not answering at the moment. It restarts on its own,
            so it is usually back within a minute or two.
          </p>
        ) : (
          <p className="text-sm text-steel-400">
            The server browser could not be reached, so there is nothing to
            report about who is on. That is a problem at our end, not the
            server&rsquo;s.
          </p>
        )}
        </div>
      </section>

      {/* --- the maps ------------------------------------------------------ */}
      {/*
        Headed "Rotation", not by the pack's name.

        The pack is called Halloween, on the Halloween server, under a tab
        reading HALLOWEEN, below a heading reading RedFaction4You.com
        (Halloween). A fourth copy was vertical space spent saying nothing.
      */}
      {maps.length > 0 ? (
        <section className="mt-7">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-basalt-700 pb-2">
            <h2 className="font-display text-sm font-bold uppercase tracking-[0.14em] text-steel-300">
              Rotation
            </h2>
            <p className="font-mono text-xs text-steel-500">
              {maps.length} maps
              {at !== null ? ", listed from what is on now" : ""}
            </p>
          </div>

          {/*
            The pack's own blurb is deliberately not shown.

            It described the same maps the server's blurb described one screen
            above, and on Halloween it was describing the wrong server outright.
            It is still edited and still read in the admin, where it is about
            the pack rather than about this page.
          */}

          {/*
            Every map links to where you can get it.

            A rotation is a list of filenames, which is what the server needs and
            nothing a reader can use. The titles and links were resolved against
            FactionFiles once and stored, so this costs no request per render.
          */}
          {/*
            Numbered by CSS, not by an element.

            156 maps is the largest list on the site and it was 375 kB, of which
            297 kB was the React flight payload: every item carried a number in
            its own span, a wrapper span, and a className built by concatenation,
            so no two items shared a string and nothing could be deduplicated.
            The counter lives in the stylesheet, the wrapper is gone, and the two
            class strings are constants, so the payload is a list of titles and
            links rather than a list of markup.
          */}
          <ol className="map-rotation mt-3 grid gap-x-6 sm:grid-cols-2 lg:grid-cols-3">
            {ordered.map((map, index) => {
              const isPlaying = at !== null && index === 0;
              return (
                <li
                  key={`${map.filename}-${index}`}
                  className={isPlaying ? PLAYING_ROW : ROW}
                >
                  {map.url ? (
                    <a
                      href={map.url}
                      rel="noopener noreferrer"
                      target="_blank"
                      className={isPlaying ? PLAYING_LINK : LINK}
                    >
                      {map.title ?? map.filename}
                    </a>
                  ) : (
                    <span className={LINK}>{map.title ?? map.filename}</span>
                  )}
                  {map.gameType ? (
                    <span className="ml-2 font-mono text-[0.625rem] uppercase text-steel-600">
                      {map.gameType}
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ol>

          <p className="mt-4 text-xs leading-relaxed text-steel-500">
            Every title links to its page on FactionFiles, which is where the
            file lives. Nothing here is hosted by us.
          </p>
        </section>
      ) : null}

    </div>
  );
}
