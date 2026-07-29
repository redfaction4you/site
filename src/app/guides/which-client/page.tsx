import type { Metadata } from "next";
import Link from "next/link";

import { getGuide } from "@/lib/guides";

const guide = getGuide("which-client")!;

export const metadata: Metadata = {
  title: guide.title,
  description: guide.summary,
};

type Client = {
  name: string;
  version: string;
  status: string;
  /** Whether we would tell someone to install this today. */
  verdict: "recommended" | "situational" | "legacy";
  what: string;
  when: string;
};

/**
 * Status and version numbers are from the Red Faction Wiki's client list, last
 * checked on the date at the bottom of this page.
 *
 * We have no client of our own, which is exactly why this can be written
 * plainly. A client author publishing this table would be grading rivals; an
 * archive publishing it is just reporting.
 */
const CLIENTS: Client[] = [
  {
    name: "Alpine Faction",
    version: "1.3.0 “Bakeapple”",
    status: "In active development",
    verdict: "recommended",
    what: "The current community client. Modern fixes and a large set of new capabilities for level designers, including the format changes that make some maps Alpine-only.",
    when: "Install this one unless you have a specific reason not to. It is the only client where a bug you report can still be fixed.",
  },
  {
    name: "Dash Faction",
    version: "1.9.0",
    status: "Limited support",
    verdict: "situational",
    what: "Fixes the large majority of the original game's known problems and gives you a solid, playable base game on modern hardware, without adding new level features.",
    when: "A reasonable choice if you want the original game working properly and nothing more. It cannot load Alpine-format levels.",
  },
  {
    name: "Pure Faction",
    version: "3.0e",
    status: "Deprecated, development ceased around 2016",
    verdict: "legacy",
    what: "The de facto standard client for years, and still what a lot of old forum advice assumes you are running.",
    when: "Only if a specific server requires it. It has not been maintained in roughly a decade.",
  },
  {
    name: "Red Faction 1.20 / 1.21",
    version: "1.20 retail, 1.21 digital",
    status: "No longer maintained",
    verdict: "legacy",
    what: "The original game as shipped. 1.21 is a recompile of 1.20 with better compatibility on modern systems, and is what the digital stores sell.",
    when: "The baseline everything else patches. Playable, but you will hit bugs the community fixed years ago.",
  },
];

const VERDICT_STYLE: Record<Client["verdict"], string> = {
  recommended: "border-signal-green/40 bg-signal-green/10 text-signal-green",
  situational: "border-oxide-400/40 bg-oxide-400/10 text-oxide-400",
  legacy: "border-basalt-700 bg-basalt-850 text-steel-500",
};

const VERDICT_LABEL: Record<Client["verdict"], string> = {
  recommended: "Recommended",
  situational: "Situational",
  legacy: "Legacy",
};

export default function WhichClientGuide() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      <p className="eyebrow">
        <Link href="/guides" className="hover:text-rust-300">
          Guides
        </Link>
      </p>
      <h1 className="mt-2 font-display text-4xl font-bold text-steel-100">
        {guide.title}
      </h1>
      <p className="mt-4 text-lg leading-relaxed text-steel-300">
        There are four ways to play Red Faction in 2026 and the differences matter
        more than they look. Here is the short version: <strong>install Alpine
        Faction</strong>. The rest of this page is why, and when the others still
        make sense.
      </p>

      <section className="mt-10 space-y-4 text-sm leading-relaxed text-steel-300">
        <h2 className="font-display text-xl font-bold text-steel-100">
          Why anyone needs a community client
        </h2>
        <p>
          Red Faction shipped in 2001 for hardware and operating systems that no
          longer exist. The original executable still runs, but it carries
          twenty-five years of unfixed bugs and assumptions about your machine that
          stopped being true a long time ago. Every community client is the same
          basic project: keep the game working on computers it was never written for.
        </p>
        <p>
          They diverge on how far past that they go. Some stop at fixing what is
          broken. Alpine went further and added new capabilities for level designers,
          which is why it is the only one that introduces a compatibility split.
        </p>
      </section>

      <section className="mt-10">
        <h2 className="font-display text-xl font-bold text-steel-100">The four</h2>
        <ul className="mt-4 space-y-4">
          {CLIENTS.map((client) => (
            <li key={client.name} className="panel p-6">
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <h3 className="font-display text-lg font-bold text-steel-100">
                  {client.name}
                </h3>
                <span
                  className={
                    "rounded-sm border px-2 py-0.5 font-display text-[11px] font-semibold uppercase tracking-wider " +
                    VERDICT_STYLE[client.verdict]
                  }
                >
                  {VERDICT_LABEL[client.verdict]}
                </span>
              </div>
              <p className="mt-1 text-xs text-steel-500">
                {client.version} · {client.status}
              </p>
              <p className="mt-3 text-sm leading-relaxed text-steel-300">
                {client.what}
              </p>
              <p className="mt-2 text-sm leading-relaxed text-steel-400">
                <span className="text-steel-500">When to pick it: </span>
                {client.when}
              </p>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-10 space-y-4 text-sm leading-relaxed text-steel-300">
        <h2 className="font-display text-xl font-bold text-steel-100">
          The recommendation, stated plainly
        </h2>
        <p>
          Alpine Faction, because it is the one still being worked on. That is not a
          judgement about which feels most faithful to 2001. People disagree about
          that, sometimes strongly, and it is a fair thing to disagree about. It is a
          judgement about which client will still work in five years and where a bug
          you report has somewhere to go.
        </p>
        <p>
          If you prefer how another client plays, run it. Nothing in this archive is
          gated on your choice, and every download says which clients can load it
          before you take it.
        </p>
      </section>

      <div className="panel mt-10 p-6">
        <p className="text-sm leading-relaxed text-steel-300">
          Choosing a client also decides which maps you can load.{" "}
          <Link
            href="/guides/compatibility"
            className="text-rust-400 underline underline-offset-4 hover:text-rust-300"
          >
            The compatibility matrix
          </Link>{" "}
          shows exactly where the line falls.
        </p>
      </div>

      <section className="mt-10 border-t border-basalt-700 pt-6 text-sm text-steel-400">
        <h2 className="font-display text-xs uppercase tracking-widest text-steel-500">
          Sources
        </h2>
        <ul className="mt-3 space-y-1.5">
          <li>
            <a
              href="https://www.redfactionwiki.com/wiki/RF_Client_Versions"
              target="_blank"
              rel="noreferrer noopener"
              className="text-rust-400 underline underline-offset-4 hover:text-rust-300"
            >
              Red Faction Wiki: RF Client Versions
            </a>{" "}
            for version numbers and maintenance status
          </li>
        </ul>
        <p className="mt-4 text-xs text-steel-500">
          Last verified {guide.verifiedOn}. Version numbers move; if this page looks
          stale, it probably is, and the wiki above is the thing to check.
        </p>
      </section>
    </div>
  );
}
