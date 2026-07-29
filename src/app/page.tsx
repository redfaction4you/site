import Link from "next/link";

import { DISCORD_INVITE, VISIBLE_NAV } from "@/lib/nav";

const COMMITMENTS = [
  {
    title: "Everything, labelled honestly",
    body: "Classic maps, Pure-era maps, Dash maps, Alpine maps. We keep all of it, and every file is tagged with the clients that can actually load it, read from the level file rather than guessed.",
  },
  {
    title: "Nothing here disappears",
    body: "We keep our own copy of everything we list, on storage we control, behind permanent URLs. A link you paste in Discord today should still work in ten years.",
  },
  {
    title: "Nobody gets locked out",
    body: "No account needed to browse or download. Ever. Signing in is only for uploading, commenting and rating, and it uses Discord so there is no password to forget.",
  },
];

/**
 * One line per section, keyed by route.
 *
 * Which of these appear is decided by VISIBLE_NAV, not by this list. The home
 * page used to keep its own copy of the sections and drifted out of step with
 * the navigation the moment anything was hidden — the header dropped Maps and
 * Weapons while the page below it still offered both.
 */
const SECTION_BLURBS: Record<string, string> = {
  "/maps":
    "Custom levels going back two decades, each tagged with the clients that can load it.",
  "/mods":
    "Total conversions and gameplay overhauls, with install instructions per store release.",
  "/models":
    "Player models and character skins, with preview renders rather than just a filename.",
  "/weapons":
    "Custom weapons and reskins, marked clearly for whether they change behaviour or just looks.",
  "/tools":
    "RED, the official RF toolkit and the community utilities. Every one with a written guide.",
  "/videos": "Tutorials, matches, speedruns and machinima, curated rather than scraped.",
  "/guides": "How to install a map, use the editor, pack a level, and pick a client.",
  "/matches":
    "Every match played on the server, with full scoreboards, capture timelines and event logs.",
  "/players": "Who plays, how they do, and their record across every archived match.",
  "/server": "Where to play, how to connect, and what the server is running.",
  "/events": "Tournaments, community nights and the Hall of Champions.",
};

const SECTIONS = VISIBLE_NAV.map((item) => ({
  href: item.href,
  label: item.label,
  body: SECTION_BLURBS[item.href] ?? "",
}));

export default function HomePage() {
  return (
    <>
      {/* ------------------------------------------------------------------ */}
      {/* Hero                                                                */}
      {/* ------------------------------------------------------------------ */}
      <section className="relative overflow-hidden border-b border-basalt-800">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(224,48,30,0.16),transparent_62%)]"
        />
        <div className="relative mx-auto max-w-6xl px-4 py-20 sm:py-28">
          <p className="eyebrow">Red Faction · 2001 · still going</p>
          <h1 className="mt-4 max-w-3xl font-brand text-4xl leading-[1.12] text-steel-100 sm:text-5xl">
            Everything for Red Faction,
            <br />
            <span className="text-rust-500">in one place that stays up.</span>
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-steel-300">
            Match results, player records and the files for a game from 2001,
            collected properly instead of scattered across dead forums. Free, no
            account needed, and hosted by us so it does not vanish when someone
            else&rsquo;s server does.
          </p>

          {/* These point at what exists today. The catalogue takes over as the
              primary call to action once it has something on the shelves. */}
          <div className="mt-9 flex flex-wrap gap-3">
            <Link
              href="/matches"
              className="rounded-sm bg-rust-500 px-5 py-2.5 font-display text-sm font-semibold uppercase tracking-wider text-steel-100 transition-colors hover:bg-rust-400"
            >
              Latest matches
            </Link>
            <Link
              href="/players"
              className="rounded-sm border border-basalt-600 px-5 py-2.5 font-display text-sm font-semibold uppercase tracking-wider text-steel-200 transition-colors hover:border-steel-500 hover:text-steel-100"
            >
              Player records
            </Link>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* What is here                                                        */}
      {/* ------------------------------------------------------------------ */}
      <section className="mx-auto max-w-6xl px-4 py-16">
        <p className="eyebrow">What is here</p>
        <h2 className="mt-2 font-display text-3xl font-bold text-steel-100">
          Everything we keep
        </h2>

        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {SECTIONS.map((section) => (
            <Link
              key={section.href}
              href={section.href}
              className="panel group p-5 transition-colors hover:border-rust-700"
            >
              <h3 className="font-display text-lg font-bold text-steel-100 transition-colors group-hover:text-rust-300">
                {section.label}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-steel-400">
                {section.body}
              </p>
            </Link>
          ))}
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Three commitments                                                   */}
      {/* ------------------------------------------------------------------ */}
      <section className="border-y border-basalt-800 bg-basalt-900/40">
        <div className="mx-auto max-w-6xl px-4 py-16">
          <p className="eyebrow">What we commit to</p>
          <h2 className="mt-2 font-display text-3xl font-bold text-steel-100">
            Three promises, published up front
          </h2>

          <div className="mt-10 grid gap-8 md:grid-cols-3">
            {COMMITMENTS.map((item, index) => (
              <div key={item.title}>
                <span className="font-display text-sm font-bold text-rust-600">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <h3 className="mt-1.5 font-display text-xl font-bold text-steel-100">
                  {item.title}
                </h3>
                <p className="mt-2.5 text-sm leading-relaxed text-steel-400">
                  {item.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Discord                                                             */}
      {/* ------------------------------------------------------------------ */}
      <section className="mx-auto max-w-6xl px-4 py-16">
        <div className="panel flex flex-wrap items-center justify-between gap-6 p-8">
          <div className="max-w-lg">
            <h2 className="font-display text-2xl font-bold text-steel-100">
              The rest happens in Discord
            </h2>
            <p className="mt-2.5 text-sm leading-relaxed text-steel-400">
              Pickup games, new releases, help with the editor and the arguments
              about which map is overrated. Signing in here uses the same
              account.
            </p>
          </div>
          <a
            href={DISCORD_INVITE}
            target="_blank"
            rel="noreferrer noopener"
            className="rounded-sm bg-rust-500 px-5 py-2.5 font-display text-sm font-semibold uppercase tracking-wider text-steel-100 transition-colors hover:bg-rust-400"
          >
            Join the Discord
          </a>
        </div>
      </section>
    </>
  );
}
