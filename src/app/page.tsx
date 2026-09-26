import Image from "next/image";
import Link from "next/link";

import { shortName } from "@/components/server-tabs";
import { rotationForServer } from "@/lib/map-packs";
import { DISCORD_INVITE } from "@/lib/nav";
import { getServerStatus, nowPlaying, type ServerStatus } from "@/lib/server-status";
import { type GameServer, SERVERS, serverAddress } from "@/lib/servers";

export const dynamic = "force-dynamic";

/**
 * The front page: the three servers, and what each is playing right now.
 *
 * It was a news front page until 25 September 2026: the analyst's match report,
 * the night's results, records scrolling across the top and a leaderboard down
 * the side. RF4U stopped recording stats that day and the page was rebuilt
 * around the one thing that is still live, which is the servers.
 *
 * **No database read on a plain visit.** Each card asks the FactionFiles server
 * browser, cached for thirty seconds, and the rotation behind it comes from a
 * lookup cached for an hour. A front page that woke Neon on every request was
 * one of the causes of a $52 month.
 */
export default async function HomePage() {
  const cards = await Promise.all(
    SERVERS.map(async (server) => {
      const address = serverAddress(server);
      const [status, pack] = await Promise.all([
        address
          ? getServerStatus(address)
          : Promise.resolve<ServerStatus>({
              state: "unknown",
              reason: "No server address configured.",
            }),
        rotationForServer(server),
      ]);
      return { server, status, maps: pack?.maps ?? [] };
    }),
  );

  return (
    <div className="mx-auto max-w-6xl px-4 pb-10">
      <h1 className="sr-only">RedFaction4You</h1>

      <section className="pt-8">
        <p className="eyebrow">Play</p>
        <h2 className="mt-2 font-brand text-2xl leading-[1.2] text-steel-100 sm:text-3xl">
          Three Red Faction servers,{" "}
          <span className="text-rust-500">always on.</span>
        </h2>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-steel-300">
          RF4U runs three community servers for Red Faction (2001). Each card
          shows what is playing right now; open one to see every map in its
          rotation.
        </p>
      </section>

      <div className="mt-6 grid gap-5 lg:grid-cols-3">
        {cards.map(({ server, status, maps }) => (
          <ServerCard key={server.slug} server={server} status={status} maps={maps} />
        ))}
      </div>

      <p className="mt-6 text-sm text-steel-400">
        Missing a map?{" "}
        <Link href="/downloads" className="text-rust-400 hover:text-rust-300">
          Downloads
        </Link>{" "}
        has the maps, mods and tools, free and with no account needed.
      </p>

      <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-basalt-800 pt-4 text-xs">
        <p className="max-w-2xl leading-relaxed text-steel-500">
          Games are arranged in Discord, which is also where anything new is
          announced first.
        </p>
        <a
          href={DISCORD_INVITE}
          target="_blank"
          rel="noreferrer noopener"
          className="shrink-0 rounded-sm bg-rust-500 px-4 py-2 font-display text-[0.6875rem] font-semibold uppercase tracking-widest text-white transition-colors hover:bg-rust-400"
        >
          Join the Discord
        </a>
      </div>
    </div>
  );
}

/**
 * One server, as a card that is a link to its page.
 *
 * The map preview sits behind the card under a heavy scrim, the same way and
 * for the same reasons as on the server page: legibility over screenshots
 * nobody chose for their contrast, and served through our own domain rather
 * than hot-linked, because a browser guard flagging the file host put a
 * malware warning over this site once already.
 */
function ServerCard({
  server,
  status,
  maps,
}: {
  server: GameServer;
  status: ServerStatus;
  maps: readonly { filename: string; title?: string }[];
}) {
  const online = status.state === "online" ? status : null;
  const playing = nowPlaying(status, maps);
  const busy = online !== null && online.humans > 0;

  return (
    <Link
      href={`/servers/${server.slug}`}
      data-server-theme={server.theme}
      className="server-accent-border group relative block overflow-hidden rounded-sm border bg-basalt-900"
    >
      {online?.mapInfo?.imageUrl ? (
        <>
          <Image
            src={online.mapInfo.imageUrl}
            alt=""
            fill
            sizes="(min-width: 1024px) 380px, 100vw"
            className="object-cover"
          />
          <div className="absolute inset-0 bg-basalt-950/88" />
        </>
      ) : null}

      <div className="relative flex h-full flex-col px-4 py-4">
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className={
              "h-2 w-2 shrink-0 rounded-full " +
              (busy
                ? "animate-pulse bg-signal-green"
                : online
                  ? "bg-oxide-400"
                  : "bg-steel-600")
            }
          />
          <span className="font-display text-[0.6875rem] uppercase tracking-widest text-steel-400">
            {online ? "Online" : status.state === "offline" ? "Offline" : "Status unknown"}
          </span>
        </div>

        <h3 className="server-accent mt-2 font-display text-2xl font-bold uppercase tracking-[0.1em]">
          {shortName(server.name)}
        </h3>
        <p className="mt-1.5 text-sm leading-relaxed text-steel-300">{server.blurb}</p>

        <div className="mt-4 border-t border-basalt-800 pt-3">
          {online ? (
            <>
              <p className="eyebrow server-accent">Playing now</p>
              <p className="mt-0.5 font-display text-lg font-bold leading-tight text-steel-100">
                {playing ?? "an unnamed level"}
              </p>
              <p className="mt-0.5 font-mono text-xs text-steel-500">
                {online.humans === 0
                  ? "nobody on right now"
                  : `${online.humans} of ${online.maxPlayers} on`}
              </p>
            </>
          ) : status.state === "offline" ? (
            <p className="text-sm text-steel-400">
              Not answering right now. It restarts on its own, usually within a
              minute or two.
            </p>
          ) : (
            <p className="text-sm text-steel-400">
              The server browser could not be reached, so there is nothing to
              report just now.
            </p>
          )}
        </div>

        <p className="mt-4 font-display text-[0.6875rem] font-semibold uppercase tracking-widest text-rust-400 group-hover:text-rust-300">
          {maps.length > 0 ? `All ${maps.length} maps` : "Open the server"}
        </p>
      </div>
    </Link>
  );
}
