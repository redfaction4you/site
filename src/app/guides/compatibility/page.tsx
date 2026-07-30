import type { Metadata } from "next";
import Link from "next/link";

import { getGuide } from "@/lib/guides";
import {
  ALL_CLIENTS,
  CLIENT_LABELS,
  compatibilityForRflVersion,
  RFL_TABLE_VERIFIED_ON,
  RFL_VERSION_ALPINE_MIN,
  RFL_VERSION_STOCK_PC,
  RFL_VERSION_VANILLA_MAX,
} from "@/lib/rfl/clients";

const guide = getGuide("compatibility")!;

export const metadata: Metadata = {
  title: guide.title,
  description: guide.summary,
};

/**
 * The rows are labels; the answers are computed.
 *
 * Every cell below comes from `compatibilityForRflVersion`, the same function
 * the uploader uses to badge a file. That is deliberate: a published matrix
 * that disagrees with the badges on the maps would be worse than no matrix at
 * all, and the only way to guarantee it cannot is to derive one from the other.
 */
const ROWS = [
  { label: "174, 175", sample: 174, note: "PlayStation 2 levels" },
  { label: `176 – ${RFL_VERSION_VANILLA_MAX}`, sample: RFL_VERSION_STOCK_PC, note: "The original PC format" },
  {
    label: `${RFL_VERSION_VANILLA_MAX + 1} – ${RFL_VERSION_ALPINE_MIN - 1}`,
    sample: RFL_VERSION_VANILLA_MAX + 50,
    note: "Undocumented",
  },
  {
    label: `${RFL_VERSION_ALPINE_MIN} and above`,
    sample: RFL_VERSION_ALPINE_MIN,
    note: "Alpine Faction features",
  },
];

function Cell({ works }: { works: boolean }) {
  return (
    <td className="border-t border-basalt-700 px-3 py-3 text-center">
      <span
        className={works ? "text-signal-green" : "text-steel-600"}
        aria-label={works ? "loads" : "does not load"}
      >
        {works ? "✓" : "-"}
      </span>
    </td>
  );
}

export default function CompatibilityGuide() {
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
        Some Red Faction maps simply will not open in some clients. It is not a bug
        and it is not your install. This page explains exactly where the line falls.
      </p>

      <section className="mt-10 space-y-4 text-sm leading-relaxed text-steel-300">
        <h2 className="font-display text-xl font-bold text-steel-100">
          Why the split exists
        </h2>
        <p>
          Every level file records the format version it was saved in, as a number in
          its first few bytes. When a client opens a level it reads that number first.
          If the format is newer than the one it understands, it stops, because a
          level using features it has never heard of would load wrong, or crash, and
          failing cleanly is better than either.
        </p>
        <p>
          Alpine Faction raised that version number when it added features the
          original engine has no concept of: improved mover physics, dynamic lighting,
          richer skyboxes, a respawn limit lifted from 32 to 2048, and a large set of
          new scripting events. A level built with those honestly declares itself
          unreadable to older clients, and they honestly decline to read it.
        </p>
        <p>
          So the split is real, it is per-map rather than per-client, and it is
          invisible until a download fails. That is why every file in this archive is
          checked at upload and badged with what can load it.
        </p>
      </section>

      <section className="mt-10">
        <h2 className="font-display text-xl font-bold text-steel-100">The matrix</h2>
        <div className="panel mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left">
                <th className="px-3 py-3 font-display text-[0.6875rem] uppercase tracking-widest text-steel-500">
                  Format version
                </th>
                {ALL_CLIENTS.map((client) => (
                  <th
                    key={client}
                    className="px-3 py-3 text-center font-display text-[0.6875rem] uppercase tracking-widest text-steel-500"
                  >
                    {CLIENT_LABELS[client]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row) => {
                const result = compatibilityForRflVersion(row.sample);
                return (
                  <tr key={row.label}>
                    <td className="border-t border-basalt-700 px-3 py-3">
                      <span className="font-mono text-steel-200">{row.label}</span>
                      <span className="mt-0.5 block text-xs text-steel-500">
                        {row.note}
                      </span>
                    </td>
                    {ALL_CLIENTS.map((client) => (
                      <Cell key={client} works={result.playsOn.includes(client)} />
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <p className="mt-4 text-sm leading-relaxed text-steel-400">
          The catalogue badges are produced by the same code that fills in this table,
          so the two cannot drift apart.
        </p>
      </section>

      <section className="mt-10 space-y-4 text-sm leading-relaxed text-steel-300">
        <h2 className="font-display text-xl font-bold text-steel-100">
          What we do not know
        </h2>
        <p>
          Versions {RFL_VERSION_VANILLA_MAX + 1} to {RFL_VERSION_ALPINE_MIN - 1} are a
          gap. They are above the last version the original engine supports and below
          the range Alpine uses, and we have found no documentation for them. A file
          reporting one of those is badged{" "}
          <span className="text-oxide-400">Unverified</span> rather than guessed at. If
          you know what lives in that range, tell us and this page changes.
        </p>
        <p>
          Pure Faction and Dash Faction are listed as loading what the original engine
          loads. That follows from what they are: patches to the original engine
          rather than replacements for its level loader. It is an inference on our
          part rather than something either project states. Treat those two columns as
          well-founded rather than confirmed.
        </p>
      </section>

      <section className="mt-10 border-t border-basalt-700 pt-6 text-sm text-steel-400">
        <h2 className="font-display text-xs uppercase tracking-widest text-steel-500">
          Sources
        </h2>
        <ul className="mt-3 space-y-1.5">
          <li>
            <a
              href="https://github.com/rafalh/rf-reversed"
              target="_blank"
              rel="noreferrer noopener"
              className="text-rust-400 underline underline-offset-4 hover:text-rust-300"
            >
              rafalh/rf-reversed
            </a>{" "}
            for the version numbers the original engine supports
          </li>
          <li>
            <a
              href="https://www.redfactionwiki.com/wiki/Alpine_Faction_Help"
              target="_blank"
              rel="noreferrer noopener"
              className="text-rust-400 underline underline-offset-4 hover:text-rust-300"
            >
              Red Faction Wiki: Alpine Faction Help
            </a>{" "}
            for the Alpine format range
          </li>
        </ul>
        <p className="mt-4 text-xs text-steel-500">
          Last verified {RFL_TABLE_VERIFIED_ON}. Re-checked whenever a client ships a
          format change.
        </p>
      </section>
    </div>
  );
}
