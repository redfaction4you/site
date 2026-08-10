import Link from "next/link";

import { dayLabel } from "@/components/match-archive";
import { READING_KINDS, type Readable } from "@/lib/reading";

/**
 * Everything there is to read, in one list, with each entry saying what it is.
 *
 * The three kinds are labelled rather than laid out apart, because a reader
 * choosing what to read next needs to know whether they are picking up a
 * report, an argument or a long piece — and the old arrangement said so with
 * position, which stops meaning anything the moment the lists are merged.
 *
 * Opinion and feature share the site's second colour: both are the columnist's
 * writing and neither is a result. A report is left in plain steel, because it
 * is the ordinary thing here and colouring it would say otherwise. Cobalt is
 * deliberately not used — on this site it means the blue team.
 *
 * **The overflow is a `<details>`, not a button.** It works with no JavaScript,
 * it is in the HTML for anything reading the page without running it, and it is
 * a list of headlines rather than the 465 kB of frag log that taught this
 * archive to be careful about what it renders inside a closed one.
 */

const KIND_CLASS: Record<Readable["kind"], string> = {
  report: "text-steel-400",
  opinion: "text-oxide-400",
  feature: "text-oxide-400",
};

function ReadingRow({ entry }: { entry: Readable }) {
  return (
    <li className="border-b border-basalt-800">
      <Link href={entry.href} className="group block py-2.5">
        <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span
            className={`shrink-0 font-display text-[0.6875rem] font-bold uppercase tracking-[0.18em] ${KIND_CLASS[entry.kind]}`}
          >
            {READING_KINDS[entry.kind].label}
          </span>
          <span className="min-w-0 flex-1 text-sm leading-snug text-steel-200 group-hover:text-rust-300">
            {entry.headline}
          </span>
          <span className="shrink-0 font-mono text-xs tabular-nums text-steel-500">
            {dayLabel(entry.day)}
          </span>
        </span>

        {entry.excerpt ? (
          <span className="mt-1 block text-xs leading-relaxed text-steel-400">
            {entry.excerpt}
          </span>
        ) : null}

        {/* What a feature is about, which is the thing that makes somebody
            click it. A report and an opinion are about the night beside them. */}
        {entry.subjects.length > 0 ? (
          <span className="mt-1 block font-mono text-xs text-steel-500">
            {entry.subjects.join(", ")}
          </span>
        ) : null}
      </Link>
    </li>
  );
}

export function ReadingList({
  entries,
  /** How many to show before the rest goes behind "more to read". */
  initial = 3,
  className = "",
}: {
  entries: Readable[];
  initial?: number;
  className?: string;
}) {
  if (entries.length === 0) return null;

  const shown = entries.slice(0, initial);
  const rest = entries.slice(initial);

  return (
    <div className={className}>
      <ul>
        {shown.map((entry) => (
          <ReadingRow key={entry.key} entry={entry} />
        ))}
      </ul>

      {rest.length > 0 ? (
        <details className="group mt-1">
          <summary className="cursor-pointer list-none py-2 font-display text-[0.6875rem] font-bold uppercase tracking-[0.18em] text-rust-400 hover:text-rust-300">
            More to read
            <span className="ml-2 font-mono tracking-normal text-steel-500">
              {rest.length}
            </span>
            <span className="ml-2 font-mono tracking-normal text-steel-600 group-open:hidden">
              ▾
            </span>
            <span className="ml-2 hidden font-mono tracking-normal text-steel-600 group-open:inline">
              ▴
            </span>
          </summary>
          <ul>
            {rest.map((entry) => (
              <ReadingRow key={entry.key} entry={entry} />
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
