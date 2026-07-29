import Link from "next/link";

import { dayLabel } from "@/components/match-archive";
import { archiveTotals, latestDay, listPlayers } from "@/lib/matches/queries";
import { DISCORD_INVITE, VISIBLE_NAV } from "@/lib/nav";
import { getServerStatus } from "@/lib/server-status";

export const dynamic = "force-dynamic";

/**
 * One line per section, keyed by route. Which appear is decided by VISIBLE_NAV,
 * so the home page cannot advertise something the navigation has hidden.
 */
const SECTION_BLURBS: Record<string, string> = {
  "/maps": "Custom levels, tagged with the clients that can load them.",
  "/mods": "Total conversions and gameplay overhauls.",
  "/models": "Player models and character skins.",
  "/weapons": "Custom weapons and reskins.",
  "/tools": "RED, the official toolkit and community utilities.",
  "/videos": "Tutorials, matches, speedruns and machinima.",
  "/guides": "Which client to run, and which levels load where.",
  "/matches": "Scoreboards, capture timelines and full event logs.",
  "/players": "Records across every archived match.",
  "/server": "Where to play and whether anyone is on.",
  "/events": "Tournaments and the Hall of Champions.",
};

export default async function HomePage() {
  const [status, totals, latest, players] = await Promise.all([
    getServerStatus(),
    archiveTotals(),
    latestDay(),
    listPlayers(),
  ]);

  const online = status.state === "online" ? status : null;
  const busy = online && online.players > 0;

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      {/* No visible hero: the wordmark in the header already says what this is,
          and the page opens straight into what is actually happening. The
          heading stays for screen readers and search results, which both expect
          a page to name itself. */}
      <h1 className="sr-only">RedFaction4You</h1>

      {/* Live strip: the server, and what the archive holds. Answers "is
          anything happening here" without a scroll. */}
      <div className="panel flex flex-wrap items-center gap-x-8 gap-y-4 p-4">
        <Link href="/server" className="group flex items-center gap-2.5">
          <span
            aria-hidden="true"
            className={
              "h-2.5 w-2.5 shrink-0 rounded-full " +
              (busy
                ? "animate-pulse bg-signal-green"
                : online
                  ? "bg-oxide-400"
                  : "bg-steel-600")
            }
          />
          <span className="text-sm text-steel-200 group-hover:text-rust-300">
            {online ? (
              <>
                Server online
                <span className="ml-2 font-mono text-steel-400">
                  {online.players}/{online.maxPlayers}
                </span>
                {online.map ? (
                  <span className="ml-2 text-steel-500">{online.map}</span>
                ) : null}
              </>
            ) : status.state === "offline" ? (
              "Server offline"
            ) : (
              "Server status unknown"
            )}
          </span>
        </Link>

        {totals.matchCount > 0 ? (
          <Link href="/matches" className="text-sm text-steel-400 hover:text-rust-300">
            <span className="font-mono text-steel-200">{totals.matchCount}</span> matches
            over <span className="font-mono text-steel-200">{totals.dayCount}</span>{" "}
            {totals.dayCount === 1 ? "night" : "nights"}
            {latest ? `, latest ${dayLabel(latest)}` : ""}
          </Link>
        ) : null}

        {players.length > 0 ? (
          <Link href="/players" className="text-sm text-steel-400 hover:text-rust-300">
            <span className="font-mono text-steel-200">{players.length}</span> players on
            record
          </Link>
        ) : null}

        <a
          href={DISCORD_INVITE}
          target="_blank"
          rel="noreferrer noopener"
          className="ml-auto rounded-sm bg-rust-500 px-4 py-2 font-display text-xs font-semibold uppercase tracking-wider text-steel-100 transition-colors hover:bg-rust-400"
        >
          Join the Discord
        </a>
      </div>

      {/* Sections, small cards in one band. */}
      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {VISIBLE_NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="panel group p-4 transition-colors hover:border-rust-700"
          >
            <h2 className="font-display text-base font-bold text-steel-100 transition-colors group-hover:text-rust-300">
              {item.label}
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-steel-400">
              {SECTION_BLURBS[item.href] ?? ""}
            </p>
          </Link>
        ))}
      </div>

    </div>
  );
}
