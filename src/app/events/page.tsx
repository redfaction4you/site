import type { Metadata } from "next";
import Link from "next/link";

import { DISCORD_INVITE } from "@/lib/nav";

export const metadata: Metadata = {
  title: "Events",
  description:
    "RedFaction4You tournaments, community nights and the Hall of Champions.",
};

/**
 * The tournament hub is a separate site that already exists and works.
 *
 * Rather than reproduce it badly or leave this page empty, /events sends people
 * to the real thing. Phase 4 of the build plan absorbs it — which means
 * rebuilding it against this database and this identity system, not copying it
 * across — and until then the honest answer is a link.
 */
const TOURNAMENT_HUB = "https://rftournaments.netlify.app";

export default function EventsPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      <p className="eyebrow">Community</p>
      <h1 className="mt-2 font-display text-4xl font-bold text-steel-100">Events</h1>
      <p className="mt-4 text-lg leading-relaxed text-steel-300">
        Tournaments, brackets, team rosters and the Hall of Champions.
      </p>

      <div className="panel mt-8 p-8">
        <h2 className="font-display text-xl font-bold text-steel-100">
          The RF4U Tournament Hub
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-steel-400">
          Brackets, results and standings live on the tournament hub, which runs as its
          own site. It is where signups happen and where a running tournament is
          tracked.
        </p>
        <a
          href={TOURNAMENT_HUB}
          target="_blank"
          rel="noreferrer noopener"
          className="mt-6 inline-block rounded-sm bg-rust-500 px-5 py-2.5 font-display text-sm font-semibold uppercase tracking-wider text-steel-100 transition-colors hover:bg-rust-400"
        >
          Open the tournament hub
        </a>
      </div>

      <div className="panel mt-6 p-6">
        <h2 className="font-display text-sm font-semibold uppercase tracking-widest text-steel-400">
          Coming here later
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-steel-400">
          The hub will be rebuilt into this site so brackets, match results and player
          records sit together — a tournament match should link straight to its
          scoreboard, and a player&rsquo;s page should show what they won. That is a
          rebuild rather than a copy, because the two currently use different accounts
          and this site&rsquo;s Discord sign-in should win.
        </p>
      </div>

      <p className="mt-8 text-sm text-steel-400">
        Community nights and pickup games are organised in{" "}
        <a
          href={DISCORD_INVITE}
          target="_blank"
          rel="noreferrer noopener"
          className="text-rust-400 underline underline-offset-4 hover:text-rust-300"
        >
          Discord
        </a>
        . Results from those land in{" "}
        <Link
          href="/matches"
          className="text-rust-400 underline underline-offset-4 hover:text-rust-300"
        >
          the match archive
        </Link>
        .
      </p>
    </div>
  );
}
