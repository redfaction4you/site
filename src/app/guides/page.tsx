import type { Metadata } from "next";
import Link from "next/link";

import { GUIDES } from "@/lib/guides";

export const metadata: Metadata = {
  title: "Guides",
  description:
    "Documentation for Red Faction: which client to run, which levels load where, and how to use the editing tools.",
};

/** Guides not written yet. Listed plainly rather than quietly absent. */
const PLANNED = [
  "Installing custom maps, models and weapons, with exact paths for the Steam, GOG and disc releases",
  "Getting started with RED, the official level editor",
  "Packing a finished level into a .vpp for distribution",
  "Submitting your work to RedFaction4You",
];

export default function GuidesPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      <p className="eyebrow">Documentation</p>
      <h1 className="mt-2 font-display text-4xl font-bold text-steel-100">Guides</h1>
      <p className="mt-4 text-lg leading-relaxed text-steel-300">
        Our own documentation, written here rather than linked to a forum post from
        2009 that may not load next year.
      </p>
      <p className="mt-3 text-sm leading-relaxed text-steel-400">
        Every guide says when its facts were last checked. A game this old attracts
        advice that stopped being true a decade ago, and undated advice is
        indistinguishable from it.
      </p>

      <ul className="mt-10 space-y-4">
        {GUIDES.map((guide) => (
          <li key={guide.slug}>
            <Link href={`/guides/${guide.slug}`} className="panel group block p-6">
              <h2 className="font-display text-lg font-bold text-steel-100 transition-colors group-hover:text-rust-300">
                {guide.title}
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-steel-400">
                {guide.summary}
              </p>
              <p className="mt-3 text-xs text-steel-500">
                Last verified {guide.verifiedOn}
              </p>
            </Link>
          </li>
        ))}
      </ul>

      <div className="panel mt-10 p-6">
        <h2 className="font-display text-sm font-semibold uppercase tracking-widest text-steel-400">
          Still to write
        </h2>
        <ul className="mt-4 space-y-2.5 text-sm text-steel-300">
          {PLANNED.map((item) => (
            <li key={item} className="flex gap-3">
              <span
                className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-basalt-600"
                aria-hidden="true"
              />
              <span className="leading-relaxed">{item}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
