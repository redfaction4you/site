import type { Metadata } from "next";
import Link from "next/link";

import { getServerStatus } from "@/lib/server-status";
import {
  SERVERS,
  SERVER_CLIENT,
  serverAddress,
  serverHost,
  type GameServer,
} from "@/lib/servers";

export const metadata: Metadata = {
  title: "Servers",
  description:
    "The four RedFaction4You servers: what each one is for, who is on right now, and every map in its rotation.",
};

export const dynamic = "force-dynamic";

const CLIENT_URL = "https://alpinefaction.com/";

/**
 * The four servers, and the way in to each.
 *
 * A hub rather than one long page. This used to be a single page carrying the
 * match server's connection details, its records, the deathmatch leaders and the
 * active map pack, which was reasonable with two servers and stopped being so at
 * four: the person who wants the Halloween map list has no use for a capture the
 * flag scoreboard on the way to it.
 *
 * Nothing was lost in the split. The records are on `/stats`, which is where a
 * reader looking for records goes, and the deathmatch board is on `/stats/dm`.
 * What lives here is the part that is genuinely about the servers.
 *
 * **Live status is four calls to somebody else's server**, made in parallel and
 * revalidated rather than made per reader. A server that does not answer says so
 * and the rest of the page is unaffected.
 */
export default async function ServersPage() {
  const host = serverHost();
  const statuses = await Promise.all(
    SERVERS.map(async (server) => {
      const address = serverAddress(server);
      if (!address) return { server, status: null };
      return { server, status: await getServerStatus(address) };
    }),
  );

  const anyoneOn = statuses.reduce(
    (total, { status }) =>
      total + (status?.state === "online" ? status.humans : 0),
    0,
  );

  return (
    <div className="mx-auto max-w-5xl px-4 pb-16">
      <div className="border-b-2 border-basalt-700 pb-5 pt-8">
        <p className="eyebrow">Play</p>
        <h1 className="mt-2 font-display text-3xl font-bold text-steel-100 sm:text-4xl">
          Our servers
        </h1>
        <p className="mt-3 max-w-2xl text-lg leading-relaxed text-steel-300">
          Four of them, all on the same machine, all free to join and none of
          them passworded.{" "}
          {anyoneOn > 0
            ? `${anyoneOn} ${anyoneOn === 1 ? "person is" : "people are"} playing right now.`
            : "Nobody is on at the moment, which is usually a matter of timing rather than interest."}
        </p>
      </div>

      {/* --- what you need, once, for all four ---------------------------- */}
      <section className="panel mt-6 p-5">
        <h2 className="font-display text-sm font-bold uppercase tracking-widest text-steel-200">
          What you need
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-steel-400">
          <a
            href={CLIENT_URL}
            rel="noopener noreferrer"
            target="_blank"
            className="text-rust-300 hover:underline"
          >
            {SERVER_CLIENT}
          </a>
          , and nothing else. Maps you do not have are downloaded by the server
          when it needs them, so you never have to install a pack to play on one.
          {host ? (
            <>
              {" "}
              Every server is at <code className="font-mono text-steel-200">{host}</code>{" "}
              on its own port.
            </>
          ) : null}
        </p>
      </section>

      {/* --- one card per server ------------------------------------------ */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {statuses.map(({ server, status }) => (
          <ServerCard key={server.slug} server={server} status={status} />
        ))}
      </div>

      <p className="mt-8 border-t border-basalt-800 pt-4 text-xs leading-relaxed text-steel-500">
        Records and player statistics live on{" "}
        <Link href="/stats" className="text-steel-300 hover:text-rust-300">
          the stats page
        </Link>
        , and the deathmatch board on{" "}
        <Link href="/stats/dm" className="text-steel-300 hover:text-rust-300">
          its own
        </Link>
        . Only the match and Themed servers record anything.
      </p>
    </div>
  );
}

function ServerCard({
  server,
  status,
}: {
  server: GameServer;
  status: Awaited<ReturnType<typeof getServerStatus>> | null;
}) {
  const online = status?.state === "online" ? status : null;
  const playing = online?.mapInfo?.name ?? online?.map ?? null;

  return (
    <Link
      href={`/server/${server.slug}`}
      data-server-theme={server.theme}
      className="server-accent-border panel group flex flex-col border p-5 transition-colors hover:border-rust-500"
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-display text-lg font-bold leading-snug text-steel-100 group-hover:text-rust-300">
          {server.name}
        </h2>
        {/* A dot rather than the word "online": the number beside it is what
            somebody is actually reading for. */}
        <span className="shrink-0 font-mono text-xs text-steel-500">
          {online ? (
            <>
              <span className={online.humans > 0 ? "server-accent" : "text-steel-600"}>
                ●
              </span>{" "}
              <span className="text-steel-300 tabular-nums">{online.humans}</span>
              <span className="text-steel-600">/{online.maxPlayers}</span>
            </>
          ) : status?.state === "offline" ? (
            "not answering"
          ) : (
            "unknown"
          )}
        </span>
      </div>

      <p className="mt-2 flex-1 text-sm leading-relaxed text-steel-400">
        {server.blurb}
      </p>

      <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1 border-t border-basalt-800 pt-3">
        {playing ? (
          <span className="min-w-0 truncate font-mono text-xs text-steel-300">
            {playing}
          </span>
        ) : null}
        <span className="ml-auto font-mono text-[0.6875rem] uppercase tracking-widest text-steel-600">
          {server.identity ? "recorded" : "not recorded"}
        </span>
      </div>
    </Link>
  );
}
