import Link from "next/link";

import { DISCORD_INVITE } from "@/lib/nav";

type Props = {
  title: string;
  phase: number;
  /** One sentence on what this page will be. Written for visitors, not us. */
  summary: string;
  /** Concrete bullets of what lands when it ships. */
  planned: string[];
};

/**
 * Every route in the site map exists from day one, so nothing in the nav ever
 * dead-links and search engines see a stable URL set. Pages that are not built
 * yet say so plainly rather than pretending to be under construction.
 */
export function StubPage({ title, phase, summary, planned }: Props) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      <p className="eyebrow">Coming in phase {phase}</p>
      <h1 className="mt-2 font-display text-4xl font-bold text-steel-100">
        {title}
      </h1>
      <p className="mt-4 text-lg leading-relaxed text-steel-300">{summary}</p>

      <div className="panel mt-8 p-6">
        <h2 className="font-display text-sm font-semibold uppercase tracking-widest text-steel-400">
          What lands here
        </h2>
        <ul className="mt-4 space-y-2.5">
          {planned.map((item) => (
            <li key={item} className="flex gap-3 text-sm text-steel-300">
              <span
                className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-rust-500"
                aria-hidden="true"
              />
              <span className="leading-relaxed">{item}</span>
            </li>
          ))}
        </ul>
      </div>

      <p className="mt-8 text-sm text-steel-400">
        Want it sooner, or think we have the priorities wrong?{" "}
        <a
          href={DISCORD_INVITE}
          target="_blank"
          rel="noreferrer noopener"
          className="text-rust-400 underline underline-offset-4 hover:text-rust-300"
        >
          Say so in Discord
        </a>
        . In the meantime the{" "}
        <Link
          href="/videos"
          className="text-rust-400 underline underline-offset-4 hover:text-rust-300"
        >
          video archive
        </Link>{" "}
        is live.
      </p>
    </div>
  );
}
