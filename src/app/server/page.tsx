import type { Metadata } from "next";
import Link from "next/link";

import { DISCORD_INVITE } from "@/lib/nav";
import { archiveTotals, latestDay } from "@/lib/matches/queries";
import { dayLabel } from "@/components/match-archive";

export const metadata: Metadata = {
  title: "Server",
  description:
    "How to join the RedFaction4You server: address, which client to run, and what it is playing.",
};

export const dynamic = "force-dynamic";

/**
 * Connection details live in the environment rather than in the source, so
 * changing a port is a variable rather than a deploy of new code.
 *
 * Everything here is static text about how to connect. Deliberately not a live
 * status page: querying the game server on every page view is a tracker with an
 * operational duty attached, which is the thing the build plan cut twice. What
 * the server did is an archive; what it is doing right now is not.
 */
const SERVER = {
  name: process.env.NEXT_PUBLIC_SERVER_NAME ?? "RF4U Competitive [Match]",
  address: process.env.NEXT_PUBLIC_SERVER_ADDRESS ?? null,
  client: process.env.NEXT_PUBLIC_SERVER_CLIENT ?? "Alpine Faction",
  location: process.env.NEXT_PUBLIC_SERVER_LOCATION ?? null,
  slots: process.env.NEXT_PUBLIC_SERVER_SLOTS ?? null,
};

/**
 * Live status is somebody else's job, on purpose.
 *
 * FactionFiles runs the community server browser and our server is already
 * listed on it. Pointing at that is strictly better than us polling game
 * servers ourselves: no UDP tracker to keep alive, no Windows service, no
 * operational duty — the exact things the build plan cut. It also means the
 * list stays right when we are not looking at it.
 */
const SERVER_BROWSER = "https://rfsb.factionfiles.com/";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="font-display text-[11px] uppercase tracking-widest text-steel-500">
        {label}
      </dt>
      <dd className="mt-1 text-steel-200">{children}</dd>
    </div>
  );
}

export default async function ServerPage() {
  const [totals, latest] = await Promise.all([archiveTotals(), latestDay()]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      <p className="eyebrow">Play</p>
      <h1 className="mt-2 font-display text-4xl font-bold text-steel-100">Server</h1>
      <p className="mt-4 text-lg leading-relaxed text-steel-300">
        The RedFaction4You dedicated server. Everything played on it is recorded and
        kept, so a match you play tonight has a permanent page tomorrow.
      </p>

      <div className="panel mt-8 p-6">
        <dl className="grid gap-5 sm:grid-cols-2">
          <Field label="Server">{SERVER.name}</Field>
          <Field label="Client">{SERVER.client}</Field>
          {SERVER.slots ? <Field label="Slots">{SERVER.slots}</Field> : null}
          {SERVER.location ? (
            <Field label="Location">{SERVER.location}</Field>
          ) : null}
          <Field label="Address">
            {SERVER.address ? (
              <code className="rounded-sm bg-basalt-800 px-2 py-1 font-mono text-sm text-steel-100">
                {SERVER.address}
              </code>
            ) : (
              <span className="text-steel-400">
                Not published here yet — ask in{" "}
                <a
                  href={DISCORD_INVITE}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-rust-400 underline underline-offset-4 hover:text-rust-300"
                >
                  Discord
                </a>
                .
              </span>
            )}
          </Field>
        </dl>
      </div>

      <div className="panel mt-6 flex flex-wrap items-center justify-between gap-4 p-6">
        <div className="max-w-lg">
          <h2 className="font-display text-base font-bold text-steel-100">
            Who is on right now
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-steel-400">
            FactionFiles runs the community server browser and this server is listed on
            it, with current players and map. We point at theirs rather than running a
            second one — a live tracker is a service to keep alive, and this archive is
            not that.
          </p>
        </div>
        <a
          href={SERVER_BROWSER}
          target="_blank"
          rel="noreferrer noopener"
          className="shrink-0 rounded-sm border border-basalt-600 px-5 py-2.5 font-display text-sm font-semibold uppercase tracking-wider text-steel-200 transition-colors hover:border-steel-500 hover:text-steel-100"
        >
          Open the server browser
        </a>
      </div>

      <section className="mt-10">
        <h2 className="font-display text-xl font-bold text-steel-100">
          What gets recorded
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-steel-300">
          Every match on this server is archived: full scoreboards, capture timelines
          and the complete frag and flag event logs. Player records build up across
          every night played.
        </p>
        <p className="mt-3 text-sm leading-relaxed text-steel-400">
          Nothing personal is published. IP addresses, Discord identifiers and player
          positions never leave the server; only match results do.
        </p>

        {totals.matchCount > 0 ? (
          <div className="panel mt-5 flex flex-wrap items-center justify-between gap-4 p-5">
            <p className="text-sm text-steel-300">
              <span className="font-mono text-xl text-steel-100">
                {totals.matchCount}
              </span>{" "}
              {totals.matchCount === 1 ? "match" : "matches"} archived across{" "}
              <span className="font-mono text-xl text-steel-100">{totals.dayCount}</span>{" "}
              {totals.dayCount === 1 ? "night" : "nights"}
              {latest ? `, most recently ${dayLabel(latest)}` : ""}.
            </p>
            <Link
              href="/matches"
              className="rounded-sm bg-rust-500 px-5 py-2.5 font-display text-sm font-semibold uppercase tracking-wider text-steel-100 transition-colors hover:bg-rust-400"
            >
              Browse matches
            </Link>
          </div>
        ) : null}
      </section>

      <section className="mt-10">
        <h2 className="font-display text-xl font-bold text-steel-100">Getting a game</h2>
        <p className="mt-3 text-sm leading-relaxed text-steel-300">
          Pickup games are organised in Discord rather than by sitting in an empty
          server waiting. Say you want a game and people turn up.
        </p>
        <a
          href={DISCORD_INVITE}
          target="_blank"
          rel="noreferrer noopener"
          className="mt-5 inline-block rounded-sm border border-basalt-600 px-5 py-2.5 font-display text-sm font-semibold uppercase tracking-wider text-steel-200 transition-colors hover:border-steel-500 hover:text-steel-100"
        >
          Join the Discord
        </a>
      </section>
    </div>
  );
}
