import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import { dayLabel } from "@/components/match-archive";
import { MatchTimes } from "@/components/match-times";
import { archiveTotals, getMatchStartTimes, latestDay } from "@/lib/matches/queries";
import { DISCORD_INVITE } from "@/lib/nav";
import { getServerStatus, type ServerStatus } from "@/lib/server-status";
import { SYNC_STALE_MINUTES, lastSyncAt } from "@/lib/health";

export const metadata: Metadata = {
  title: "Server",
  description:
    "The RedFaction4You server: whether it is live right now, who is on, and how to join.",
};

export const dynamic = "force-dynamic";

/**
 * Connection details come from the environment, so changing a port is a
 * variable rather than a deploy.
 */
const SERVER = {
  name: process.env.NEXT_PUBLIC_SERVER_NAME ?? "RF4U Competitive [Match]",
  address: process.env.NEXT_PUBLIC_SERVER_ADDRESS ?? null,
  client: process.env.NEXT_PUBLIC_SERVER_CLIENT ?? "Alpine Faction",
  location: process.env.NEXT_PUBLIC_SERVER_LOCATION ?? null,
  slots: process.env.NEXT_PUBLIC_SERVER_SLOTS ?? null,
};

const SERVER_BROWSER = "https://rfsb.factionfiles.com/";

/** Minutes into something a person would say out loud. */
function formatAgo(minutes: number): string {
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} hour${hours === 1 ? "" : "s"}`;
  return `${Math.round(hours / 24)} days`;
}

/** Seconds to m:ss, for the match clock. */
function clock(seconds: number): string {
  const whole = Math.max(0, Math.round(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="font-display text-[0.625rem] uppercase tracking-widest text-steel-500">
        {label}
      </dt>
      <dd className="mt-0.5 truncate text-sm text-steel-200">{children}</dd>
    </div>
  );
}

/**
 * Three states, and the third is the point: being told the server is down means
 * offline, but failing to reach the browser means we do not know. Reporting
 * offline on a timeout would be a guess dressed as a fact, and it would stop
 * someone bothering to launch the game.
 */
function StatusBadge({ status }: { status: ServerStatus }) {
  if (status.state === "online") {
    const empty = status.players === 0;
    return (
      <div className="flex items-baseline gap-3">
        <span className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className={
              "h-2.5 w-2.5 shrink-0 rounded-full " +
              (empty ? "bg-oxide-400" : "animate-pulse bg-signal-green")
            }
          />
          <span
            className={
              "font-display text-sm font-bold uppercase tracking-wider " +
              (empty ? "text-oxide-400" : "text-signal-green")
            }
          >
            {empty ? "Online" : "Live now"}
          </span>
        </span>
        <span className="font-mono text-3xl tabular-nums text-steel-100">
          {status.players}
          <span className="text-steel-500">/{status.maxPlayers}</span>
        </span>
      </div>
    );
  }

  if (status.state === "offline") {
    return (
      <span className="flex items-center gap-2">
        <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-steel-600" />
        <span className="font-display text-sm font-bold uppercase tracking-wider text-steel-400">
          Offline
        </span>
      </span>
    );
  }

  return (
    <span className="flex items-center gap-2">
      <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-steel-700" />
      <span
        className="font-display text-sm font-bold uppercase tracking-wider text-steel-500"
        title={status.reason}
      >
        Status unknown
      </span>
    </span>
  );
}

export default async function ServerPage() {
  const [totals, latest, status, startTimes, lastSync] = await Promise.all([
    archiveTotals(),
    latestDay(),
    getServerStatus(),
    getMatchStartTimes(),
    lastSyncAt(),
  ]);

  const syncMinutesAgo = lastSync
    ? Math.round((Date.now() - lastSync.getTime()) / 60_000)
    : null;

  const online = status.state === "online" ? status : null;

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <p className="eyebrow">Play</p>
      <h1 className="mt-2 font-display text-3xl font-bold text-steel-100">Server</h1>

      {/* Status and how to connect, side by side. This is the whole point of
          the page, so it goes above everything else and fits on one screen. */}
      <div className="panel mt-6 grid gap-6 p-6 lg:grid-cols-[auto_1fr]">
        <div className="lg:border-r lg:border-basalt-700 lg:pr-8">
          <StatusBadge status={status} />

          {online?.map ? (
            <div className="mt-3 flex gap-3">
              {online.mapInfo ? (
                <a
                  href={online.mapInfo.pageUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="relative block h-16 w-28 shrink-0 overflow-hidden rounded-sm border border-basalt-700 bg-basalt-850"
                  title={`${online.mapInfo.name} on FactionFiles`}
                >
                  <Image
                    src={online.mapInfo.imageUrl}
                    alt=""
                    fill
                    sizes="112px"
                    className="object-cover"
                    unoptimized
                  />
                </a>
              ) : null}
              <div className="min-w-0">
                <p className="truncate text-sm text-steel-200">{online.map}</p>
                <p className="text-xs text-steel-500">
                  {online.gameType ?? ""}
                  {online.game?.timeLeft != null
                    ? ` · ${clock(online.game.timeLeft)} left`
                    : ""}
                </p>
              </div>
            </div>
          ) : null}

          {/* The in-progress score, when there is a game to have one. */}
          {online?.game && online.game.teamBased && online.players > 0 ? (
            <p className="mt-3 font-mono text-lg tabular-nums">
              <span className="text-rust-400">{online.game.redScore}</span>
              <span className="mx-2 text-steel-600">-</span>
              <span className="text-oxide-400">{online.game.blueScore}</span>
            </p>
          ) : null}

          {online?.game?.players.length ? (
            <p className="mt-2 truncate text-xs text-steel-500">
              {online.game.players.map((p) => p.name).join(", ")}
            </p>
          ) : null}

          {/* What rules you are joining, from the server's own flags. */}
          {online?.rules.length ? (
            <ul className="mt-3 flex flex-wrap gap-1.5">
              {online.rules.map((rule) => (
                <li
                  key={rule}
                  className="rounded-sm border border-basalt-700 bg-basalt-850 px-2 py-0.5 font-display text-[0.625rem] uppercase tracking-wider text-steel-400"
                >
                  {rule}
                </li>
              ))}
            </ul>
          ) : null}

          {status.state === "offline" ? (
            <p className="mt-2 text-sm text-steel-500">Normal between games.</p>
          ) : null}
        </div>

        <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
          <Detail label="Address">
            {SERVER.address ? (
              <code className="font-mono text-steel-100">{SERVER.address}</code>
            ) : (
              <span className="text-steel-500">ask in Discord</span>
            )}
          </Detail>
          <Detail label="Client">{online?.client ?? SERVER.client}</Detail>
          <Detail label="Slots">{online?.maxPlayers ?? SERVER.slots ?? "-"}</Detail>
          <Detail label="Server">{SERVER.name}</Detail>
          {SERVER.location ? (
            <Detail label="Location">{SERVER.location}</Detail>
          ) : null}
        </dl>
      </div>

      {/* Everything else is one row of short cards. */}
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="panel p-5">
          <h2 className="font-display text-sm font-bold text-steel-100">
            Every match is kept
          </h2>
          <p className="mt-1.5 text-sm leading-relaxed text-steel-400">
            Full scoreboards, capture timelines and complete frag logs. Nothing
            personal is published, no addresses, no Discord ids, no positions.
          </p>
          {totals.matchCount > 0 ? (
            <p className="mt-3 text-sm text-steel-300">
              <Link href="/matches" className="text-rust-400 hover:text-rust-300">
                {totals.matchCount} {totals.matchCount === 1 ? "match" : "matches"}
              </Link>{" "}
              over {totals.dayCount} {totals.dayCount === 1 ? "night" : "nights"}
              {latest ? `, latest ${dayLabel(latest)}` : ""}.
            </p>
          ) : null}

          {/*
            Says when results last arrived, and says so loudly once they stop.
            A stalled sync is invisible otherwise: the site keeps serving
            yesterday's matches and looks entirely fine.
          */}
          {syncMinutesAgo !== null ? (
            <p
              className={
                "mt-2 text-xs " +
                (syncMinutesAgo > SYNC_STALE_MINUTES ? "text-oxide-400" : "text-steel-500")
              }
            >
              {syncMinutesAgo > SYNC_STALE_MINUTES
                ? `No results received for ${formatAgo(syncMinutesAgo)}. The server may not be reporting.`
                : `Results last received ${formatAgo(syncMinutesAgo)} ago.`}
            </p>
          ) : null}
        </div>

        {/* Appears on its own once there is enough history to mean something. */}
        <MatchTimes startedAt={startTimes} />

        <div className="panel p-5">
          <h2 className="font-display text-sm font-bold text-steel-100">
            Getting a game
          </h2>
          <p className="mt-1.5 text-sm leading-relaxed text-steel-400">
            Games are arranged in Discord rather than by waiting in an empty server.
            Say you want one and people turn up.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <a
              href={DISCORD_INVITE}
              target="_blank"
              rel="noreferrer noopener"
              className="rounded-sm bg-rust-500 px-4 py-2 font-display text-xs font-semibold uppercase tracking-wider text-steel-100 transition-colors hover:bg-rust-400"
            >
              Join the Discord
            </a>
            <a
              href={SERVER_BROWSER}
              target="_blank"
              rel="noreferrer noopener"
              className="rounded-sm border border-basalt-600 px-4 py-2 font-display text-xs font-semibold uppercase tracking-wider text-steel-300 transition-colors hover:border-steel-500 hover:text-steel-100"
            >
              Server browser
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
