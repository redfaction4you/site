import type { Metadata } from "next";

import { LiveFeed } from "@/components/live-feed";
import { LiveRefresh } from "@/components/live-refresh";
import { LiveScoreboard } from "@/components/live-scoreboard";
import Link from "next/link";

import { MapShot } from "@/components/map-shot";

import { dayLabel } from "@/components/match-archive";
import { MatchTimes } from "@/components/match-times";
import {
  archiveTotals,
  getMatchStartTimes,
  latestDay,
  liveMatch,
  mapRotation,
  nightShape,
  serverRecords,
} from "@/lib/matches/queries";
import { mapSlug } from "@/lib/matches/maps";
import { DISCORD_INVITE } from "@/lib/nav";
import { ARCHIVE_TIME_ZONE } from "@/lib/matches/sanitize";
import { dmTotals, listDmPlayers } from "@/lib/dm/queries";
import { activeMapPack } from "@/lib/map-packs";
import {
  getDmServerStatus,
  getServerStatus,
  type ServerStatus,
} from "@/lib/server-status";
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

/**
 * The deathmatch server: same machine, its own port. The address shown falls
 * back to the match server's host with the DM port, which is how the status
 * lookup derives it too.
 */
const DM_SERVER = {
  name: process.env.NEXT_PUBLIC_DM_SERVER_NAME ?? "RedFaction4You.com [DM]",
  address:
    process.env.NEXT_PUBLIC_DM_SERVER_ADDRESS ??
    (process.env.NEXT_PUBLIC_SERVER_ADDRESS
      ? `${process.env.NEXT_PUBLIC_SERVER_ADDRESS.split(":")[0]}:17756`
      : null),
};

/** Minutes into something a person would say out loud. */
function formatAgo(minutes: number): string {
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} hour${hours === 1 ? "" : "s"}`;
  return `${Math.round(hours / 24)} days`;
}

/** Time on the DM server, the way /stats/dm writes it. */
function dmTime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

/** Seconds to m:ss, for the match clock. */
function clock(seconds: number): string {
  const whole = Math.max(0, Math.round(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

/** A label and its value on one line, for the connection details. */
function Line({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0 font-display text-[0.5625rem] uppercase tracking-widest text-steel-600">
        {label}
      </dt>
      <dd className="min-w-0 truncate text-right text-steel-200">{children}</dd>
    </div>
  );
}

/** One single match superlative, linked to the match it happened in. */
function Record({
  label,
  value,
  name,
  mapName,
  href,
}: {
  label: string;
  value: number | string;
  name?: string;
  mapName: string;
  href: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="figure-label shrink-0">{label}</dt>
      <dd className="min-w-0 truncate text-right text-steel-300">
        <span className="font-mono tabular-nums text-steel-100">{value}</span>{" "}
        {name ? `${name} ` : ""}
        <Link href={href} className="text-steel-500 hover:text-rust-300">
          {mapName}
        </Link>
      </dd>
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
  const [
    totals,
    latest,
    status,
    dmStatus,
    startTimes,
    lastSync,
    rotation,
    shape,
    records,
    live,
  ] = await Promise.all([
    archiveTotals(),
    latestDay(),
    getServerStatus(),
    getDmServerStatus(),
    getMatchStartTimes(),
    lastSyncAt(),
    mapRotation(),
    nightShape(),
    serverRecords(),
    liveMatch(),
  ]);

  const dmOnline = dmStatus.state === "online" ? dmStatus : null;

  // The DM record for the panel: top three by time, plus the totals line.
  // Cached queries shared with /stats/dm, so this costs the page nothing new.
  const [dmPlayers, dm, activePack] = await Promise.all([
    listDmPlayers(),
    dmTotals(),
    activeMapPack(),
  ]);
  const dmLeaders = dmPlayers.slice(0, 3);

  const mostPlayed = rotation[0]?.played ?? 0;

  const syncMinutesAgo = lastSync
    ? Math.round((Date.now() - lastSync.getTime()) / 60_000)
    : null;

  const online = status.state === "online" ? status : null;

  return (
    <div className="mx-auto max-w-6xl px-4 pb-12">
      {/*
        A compact header, matching the archive pages.

        This one opened with three inches of padding, an eyebrow and a display
        heading, which is a lot of page spent telling somebody the word Server
        on a page they reached by clicking Server. The counts that were buried
        in a card two screens down come up here instead, where they answer "is
        this place active" before anything else has to load.
      */}
      <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-basalt-800 py-2.5">
        <h1 className="eyebrow">Server</h1>
        <p className="font-mono text-xs text-steel-600">
          <Link href="/matches" className="hover:text-rust-300">
            <span className="text-steel-300">{totals.matchCount}</span> matches
          </Link>{" "}
          · <span className="text-steel-300">{totals.dayCount}</span> nights
          {latest ? ` · latest ${dayLabel(latest)}` : ""}
        </p>
      </div>

      {/*
        The live block: what is happening, and how to be part of it.

        It was a panel with the status in a narrow left column and four detail
        labels stretched across the rest, which left most of the width empty on
        every visit. The scoreboard takes that space when there is a game, and
        the times chart takes it when there is not, so the top of the page is
        never mostly nothing.

        Headed like the DM section below, so the page reads as two sibling
        servers rather than "the server, and an afterthought".
      */}
      <h2 className="section-heading mt-6">The match server</h2>
      <div className="mt-4 grid items-start gap-x-8 gap-y-6 lg:grid-cols-[19rem_1fr]">
        <div className="min-w-0">
          <StatusBadge status={status} />

          {online?.map ? (
            <div className="mt-3 flex gap-3">
              {/*
                Our own screenshot, not FactionFiles' preview. The preview URL
                answered 200 with nothing renderable and the page showed an
                empty bordered box that read as broken — the owner sent the
                screenshot. MapShot renders nothing when a map has no photo,
                which is the honest version of the same state.
              */}
              <span className="w-28 shrink-0 empty:hidden">
                <MapShot mapName={online.map} className="w-28" sizes="112px" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm text-steel-200">{online.map}</p>
                <p className="text-xs text-steel-500">
                  {online.gameType ?? ""}
                  {online.game?.timeLeft != null
                    ? ` · ${clock(online.game.timeLeft)} left`
                    : ""}
                </p>
                {online.game && online.game.teamBased && online.players > 0 ? (
                  <p className="mt-1 font-mono text-lg leading-none tabular-nums">
                    <span className="text-rust-400">{online.game.redScore}</span>
                    <span className="mx-1.5 text-steel-600">-</span>
                    <span className="text-cobalt-400">{online.game.blueScore}</span>
                  </p>
                ) : null}
                {online.mapInfo ? (
                  <a
                    href={online.mapInfo.pageUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="mt-0.5 inline-block text-[0.6875rem] text-steel-500 hover:text-rust-300"
                  >
                    on FactionFiles
                  </a>
                ) : null}
              </div>
            </div>
          ) : null}

          {status.state === "offline" ? (
            <p className="mt-2 text-sm text-steel-500">Normal between games.</p>
          ) : null}

          {/*
            How to join, as a list rather than a grid of four cells with a
            column of air beside them. Address first, because it is the only one
            anybody copies.
          */}
          <dl className="mt-4 space-y-1.5 border-t border-basalt-800 pt-3 text-xs">
            <Line label="Address">
              {SERVER.address ? (
                <code className="font-mono text-steel-100">{SERVER.address}</code>
              ) : (
                <span className="text-steel-500">ask in Discord</span>
              )}
            </Line>
            <Line label="Client">{online?.client ?? SERVER.client}</Line>
            <Line label="Slots">{online?.maxPlayers ?? SERVER.slots ?? "-"}</Line>
            <Line label="Name">{SERVER.name}</Line>
            {SERVER.location ? <Line label="Location">{SERVER.location}</Line> : null}
          </dl>

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

          <div className="mt-4 flex flex-wrap gap-2">
            <a
              href={DISCORD_INVITE}
              target="_blank"
              rel="noreferrer noopener"
              className="rounded-sm bg-rust-500 px-3 py-1.5 font-display text-[0.6875rem] font-semibold uppercase tracking-wider text-white transition-colors hover:bg-rust-400"
            >
              Join the Discord
            </a>
            <a
              href={SERVER_BROWSER}
              target="_blank"
              rel="noreferrer noopener"
              className="rounded-sm border border-basalt-600 px-3 py-1.5 font-display text-[0.6875rem] font-semibold uppercase tracking-wider text-steel-300 transition-colors hover:border-steel-500 hover:text-steel-100"
            >
              Server browser
            </a>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-steel-500">
            Games are arranged in Discord rather than by waiting in an empty
            server. Say you want one and people turn up.
          </p>
        </div>

        {/*
          The right hand column, which always has something in it: the match if
          one is being played, and when matches usually are if not.
        */}
        <div className="min-w-0">
          {online?.game?.players.length ? (
            <section>
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-basalt-800 pb-1.5">
                <h3 className="font-display text-sm font-bold text-steel-100">
                  Live scoreboard
                </h3>
                <LiveRefresh />
              </div>

              <div className="mt-4">
                <LiveScoreboard
                  players={online.game.players}
                  redScore={online.game.redScore}
                  blueScore={online.game.blueScore}
                  teamBased={online.game.teamBased}
                />
              </div>

              <p className="mt-3 max-w-2xl text-xs leading-relaxed text-steel-500">
                Straight from the server as it plays, so it moves while you read
                it and anybody who leaves takes their row with them. It is not
                the record: the archive is written afterwards from the
                server&rsquo;s own export, which is the version that gets checked.
                Sides are named from what the browser reports, and a player it
                does not mark as blue is taken to be red.
              </p>

              {/*
                The story behind those numbers, from our own event stream, which
                is a slower clock than the scoreboard above it and says so.
              */}
              {live ? (
                <div className="mt-6 border-t border-basalt-800 pt-4">
                  <LiveFeed match={live} />
                  <p className="mt-3 max-w-2xl text-xs leading-relaxed text-steel-500">
                    On {live.mapName}, from the events the server has sent us so
                    far. This arrives on the archive sync rather than as it
                    happens, so it runs behind the scoreboard above: last
                    received{" "}
                    {new Date(live.ingestedAt).toLocaleTimeString("en-GB", {
                      timeZone: ARCHIVE_TIME_ZONE,
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                    .
                  </p>
                </div>
              ) : null}
            </section>
          ) : (
            <>
              <MatchTimes startedAt={startTimes} />
              {/*
                The records sit here rather than at the foot of the page.
                Between games the right-hand column was one short chart against
                a much taller card, which is most of what made this page look
                unfinished. They are the match server's own superlatives, so
                they belong beside its status.
              */}
              <div className="mt-6">
        {records.mostCaps || records.bestStreak || records.biggestWin ? (
          <section>
            <h3 className="rule-heading">Records</h3>
            {/*
              Single match superlatives only. The most captures anybody managed
              in one match is a fact about one match however few there are;
              anything averaged over this many would not be.
            */}
            <dl className="mt-2 space-y-1.5 text-xs">
              {records.mostCaps && records.mostCaps.caps > 0 ? (
                <Record
                  label="Most caps, one match"
                  value={records.mostCaps.caps}
                  name={records.mostCaps.name}
                  mapName={records.mostCaps.mapName}
                  href={`/matches/${records.mostCaps.archiveDay}/${records.mostCaps.sourceMatchId}`}
                />
              ) : null}
              {records.bestStreak && records.bestStreak.streak > 0 ? (
                <Record
                  label="Longest streak"
                  value={records.bestStreak.streak}
                  name={records.bestStreak.name}
                  mapName={records.bestStreak.mapName}
                  href={`/matches/${records.bestStreak.archiveDay}/${records.bestStreak.sourceMatchId}`}
                />
              ) : null}
              {records.biggestWin ? (
                <Record
                  label="Widest margin"
                  /* Winner first. Printed as stored it reads as a defeat under
                     a label that has already said whose score comes first. */
                  value={`${Math.max(records.biggestWin.redScore, records.biggestWin.blueScore)}–${Math.min(records.biggestWin.redScore, records.biggestWin.blueScore)}`}
                  mapName={records.biggestWin.mapName}
                  href={`/matches/${records.biggestWin.archiveDay}/${records.biggestWin.sourceMatchId}`}
                />
              ) : null}
            </dl>
          </section>
        ) : null}
              </div>
            </>
          )}
        </div>
      </div>

      {/*
        What actually happens on the match server.

        This sat at the very bottom of the page, under BOTH servers, which read
        as though the rotation, the usual night and the records described the
        pair of them. Every figure in it is CTF: it is the match server's, so
        it belongs under the match server's heading and above the deathmatch
        one. The owner said the page was strange; this was most of why.
      */}
      <div className="mt-8 grid gap-x-8 gap-y-8 lg:grid-cols-[1fr_19rem]">
        <div className="min-w-0 space-y-8">
          {rotation.length > 0 ? (
            <section>
              <h3 className="rule-heading">What gets played</h3>
              <p className="mt-1.5 max-w-2xl text-xs leading-relaxed text-steel-500">
                Every map in the archive, most played first. Deliberately no win
                rate per map: across {totals.matchCount} matches that would be
                noise dressed up as a spawn advantage.
              </p>

              {/* Capped, for the reason the match rows are: a bar stretched
                  across a full width page is a long way for the eye to travel to
                  reach a number it could have read in a third of it. */}
              <ul className="mt-3 max-w-[34rem] space-y-1.5">
                {rotation.map((row) => (
                  <li key={row.mapName} className="flex items-center gap-3">
                    <Link
                      href={`/matches/map/${mapSlug(row.mapName)}`}
                      className="w-36 shrink-0 truncate text-sm text-steel-200 hover:text-rust-300 sm:w-44"
                    >
                      {row.mapName}
                    </Link>
                    {/* A bar, because seven counts in a column is a table nobody
                        reads and a shape anybody takes in at a glance. */}
                    <span className="h-2 min-w-0 flex-1 rounded-sm bg-basalt-800">
                      <span
                        className="block h-full rounded-sm bg-rust-500/70"
                        style={{
                          width: `${mostPlayed > 0 ? (row.played / mostPlayed) * 100 : 0}%`,
                        }}
                      />
                    </span>
                    <span className="w-6 shrink-0 text-right font-mono text-xs tabular-nums text-steel-400">
                      {row.played}
                    </span>
                    <span className="hidden w-10 shrink-0 text-right font-mono text-[0.625rem] tabular-nums text-steel-600 sm:block">
                      {row.overtimes > 0 ? `${row.overtimes} OT` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {/* With a game on, the times chart lost its slot above, so it lands
              here rather than not appearing at all. */}
          {online?.game?.players.length ? (
            <MatchTimes startedAt={startTimes} />
          ) : null}
        </div>

        <div className="min-w-0 space-y-6">
          {shape.nights > 0 ? (
            <section>
              <h3 className="rule-heading">A normal night</h3>
              {/*
                A range rather than an average. Three nights is not enough for a
                mean to mean anything, and 4.7 matches would imply a precision
                that is not there.
              */}
              <dl className="mt-2 grid grid-cols-2 gap-4">
                <div>
                  <dt className="figure-label">Matches</dt>
                  <dd className="figure-value mt-0.5 font-mono text-xl">
                    {shape.minMatches === shape.maxMatches
                      ? shape.minMatches
                      : `${shape.minMatches}–${shape.maxMatches}`}
                  </dd>
                </div>
                <div>
                  <dt className="figure-label">Players</dt>
                  <dd className="figure-value mt-0.5 font-mono text-xl">
                    {shape.minPlayers === shape.maxPlayers
                      ? shape.minPlayers
                      : `${shape.minPlayers}–${shape.maxPlayers}`}
                  </dd>
                </div>
              </dl>
              <p className="mt-2 text-xs leading-relaxed text-steel-500">
                Across {shape.nights} {shape.nights === 1 ? "night" : "nights"} on
                record. A range rather than an average, because that is what this
                much data supports.
              </p>
            </section>
          ) : null}

        </div>
      </div>

      {/*
        The second server, which this page never mentioned.

        Everything above is the match server. The DM server has run beside it
        since 6 August and the owner asked where it was — same machine, its own
        port, no matches: people just join and play, and the archive records
        time on the server rather than results. Compact on purpose: the panel
        answers "is anyone on, and how do I join", and the record itself lives
        under Stats.
      */}
      <section className="mt-10">
        <h2 className="section-heading">The deathmatch server</h2>
        <div className="mt-4 grid items-start gap-x-8 gap-y-4 lg:grid-cols-[19rem_1fr]">
          <div className="min-w-0">
            <StatusBadge status={dmStatus} />

            {dmOnline?.map ? (
              <div className="mt-3 flex min-w-0 gap-3">
                {/* Renders nothing until somebody photographs a DM map, which
                    is the normal state and not an error. */}
                <span className="w-28 shrink-0 empty:hidden">
                  <MapShot mapName={dmOnline.map} className="w-28" sizes="112px" />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm text-steel-200">{dmOnline.map}</p>
                  <p className="text-xs text-steel-500">
                    {dmOnline.gameType ?? ""}
                    {dmOnline.humans > 0
                      ? ` · ${dmOnline.humans} playing`
                      : " · empty"}
                  </p>
                </div>
              </div>
            ) : null}
            {dmStatus.state === "offline" ? (
              <p className="mt-2 text-sm text-steel-500">
                Normal between sessions.
              </p>
            ) : null}

            <dl className="mt-4 space-y-1.5 border-t border-basalt-800 pt-3 text-xs">
              <Line label="Address">
                {DM_SERVER.address ? (
                  <code className="font-mono text-steel-100">{DM_SERVER.address}</code>
                ) : (
                  <span className="text-steel-500">ask in Discord</span>
                )}
              </Line>
              <Line label="Client">{dmOnline?.client ?? SERVER.client}</Line>
              <Line label="Slots">{dmOnline?.maxPlayers ?? "-"}</Line>
              <Line label="Name">{DM_SERVER.name}</Line>
            </dl>
          </div>

          <div className="min-w-0">
            {dmOnline?.game?.players.length ? (
              <div className="mb-4">
                <h3 className="rule-heading">On the server now</h3>
                <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                  {dmOnline.game.players.map((player, index) => (
                    <li key={`${player.name}-${index}`} className="text-sm text-steel-200">
                      {player.name}
                      {player.kills != null ? (
                        <span className="ml-1.5 font-mono text-xs tabular-nums text-steel-500">
                          {player.kills}
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {/*
              The record so far, which is what this column showed nothing of.
              The first version put one floating sentence here and the owner's
              screenshot made the emptiness plain. These are the same figures
              /stats/dm ranks on, cut down to "who has actually been here".
            */}
            {dmLeaders.length > 0 ? (
              <div>
                <h3 className="rule-heading">Most time on the server</h3>
                <ul className="mt-2 max-w-[26rem] space-y-1.5">
                  {dmLeaders.map((player, index) => (
                    <li
                      key={`${player.name}-${index}`}
                      className="flex items-baseline justify-between gap-3 text-sm"
                    >
                      <Link
                        href={`/players/${encodeURIComponent(player.name)}`}
                        className="min-w-0 truncate text-steel-200 hover:text-rust-300"
                      >
                        {player.name}
                      </Link>
                      <span className="shrink-0 font-mono text-sm tabular-nums text-steel-100">
                        {dmTime(player.secondsPlayed)}
                        <span className="ml-2 text-xs text-steel-500">
                          {player.kills} frags
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 font-mono text-xs text-steel-600">
                  {dm.rounds} {dm.rounds === 1 ? "round" : "rounds"} ·{" "}
                  {dmTime(dm.secondsPlayed)} recorded ·{" "}
                  <Link href="/stats/dm" className="text-steel-400 hover:text-rust-300">
                    the full record
                  </Link>
                </p>
              </div>
            ) : null}

            {/*
              What gets played here, which is the deathmatch answer to the
              match server's section of that name. A pack nobody can see the
              contents of is just a different server name, so the maps are
              listed. Renders nothing on the standing rotation.
            */}
            {activePack ? (
              <div className="mt-4 border-t border-basalt-800 pt-3">
                <h3 className="rule-heading">What gets played</h3>
                <p className="mt-2 text-sm text-steel-300">
                  <Link
                    href="/server/map-packs"
                    className="font-semibold text-steel-100 hover:text-rust-300"
                  >
                    {activePack.name}
                  </Link>
                  <span className="text-steel-500">
                    {" "}
                    · {activePack.maps.length}{" "}
                    {activePack.maps.length === 1 ? "map" : "maps"} on rotation
                  </span>
                </p>
                <ul className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
                  {activePack.maps.map((entry) => (
                    <li key={entry.filename} className="text-xs text-steel-400">
                      {entry.title?.trim() || entry.filename}
                      {entry.author ? (
                        <span className="text-steel-600"> · {entry.author}</span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <p
              className={
                "max-w-[36rem] text-sm leading-relaxed text-steel-400 " +
                (dmLeaders.length > 0 || activePack ? "mt-4 border-t border-basalt-800 pt-3" : "")
              }
            >
              No matches here and no waiting for one: join and play. Frags,
              accuracy, streaks and time on the server all count towards{" "}
              <Link
                href="/stats/dm"
                className="text-steel-200 underline decoration-basalt-600 underline-offset-2 hover:text-rust-300"
              >
                the deathmatch record
              </Link>
              , which ranks on time played.
            </p>
          </div>
        </div>
      </section>


      {/*
        Says when results last arrived, and says so loudly once they stop. A
        stalled sync is invisible otherwise: the site keeps serving yesterday's
        matches and looks entirely fine.
      */}
      <p className="mt-10 border-t border-basalt-800 pt-4 text-xs leading-relaxed text-steel-500">
        Every match is kept: full scoreboards, capture timelines and complete frag
        logs. Nothing personal is published, no addresses, no Discord ids, no
        positions.
        {syncMinutesAgo !== null ? (
          <span
            className={syncMinutesAgo > SYNC_STALE_MINUTES ? "text-oxide-400" : ""}
          >
            {syncMinutesAgo > SYNC_STALE_MINUTES
              ? ` No results received for ${formatAgo(syncMinutesAgo)}. The server may not be reporting.`
              : ` Results last received ${formatAgo(syncMinutesAgo)} ago.`}
          </span>
        ) : null}
      </p>
    </div>
  );
}
