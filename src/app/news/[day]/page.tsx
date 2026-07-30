import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ColumnImage } from "@/components/column-image";
import { dayLabel, matchTime } from "@/components/match-archive";
import { getColumn, listMatchesForDay } from "@/lib/matches/queries";
import { isValidDay } from "@/lib/matches/sanitize";

type Props = { params: Promise<{ day: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { day } = await params;
  if (!isValidDay(day)) return { title: "Not found" };

  const column = await getColumn(day);
  if (!column) return { title: "Not found" };

  return {
    title: column.headline,
    description: `${dayLabel(day)}: ${column.body.split("\n").find(Boolean)?.slice(0, 180)}`,
  };
}

export default async function ColumnPage({ params }: Props) {
  const { day } = await params;
  if (!isValidDay(day)) notFound();

  const [column, matches] = await Promise.all([getColumn(day), listMatchesForDay(day)]);
  if (!column) notFound();

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <p className="eyebrow">
        <Link href="/news" className="hover:text-rust-300">
          News
        </Link>
        <span className="mx-2 text-steel-600">/</span>
        {dayLabel(day)}
      </p>

      <h1 className="mt-2 font-display text-3xl font-bold leading-tight text-steel-100">
        {column.headline}
      </h1>

      <ColumnImage
        imageKey={column.imageKey}
        model={column.imageModel}
        headline={column.headline}
        priority
        className="mt-5"
      />

      <div className="mt-6 space-y-4 text-base leading-relaxed text-steel-300">
        {column.body
          .split(/\n{2,}/)
          .map((paragraph) => paragraph.trim())
          .filter(Boolean)
          .map((paragraph, i) => (
            <p key={i}>{paragraph}</p>
          ))}
      </div>

      <p className="mt-6 text-[0.6875rem] text-steel-600">
        Written automatically from the match data
        {column.model ? ` by ${column.model}` : ""}. It can only use figures the server
        recorded.
      </p>

      {/* The matches it is about, so the claims can be checked. */}
      {matches.length ? (
        <section className="mt-10 border-t border-basalt-800 pt-6">
          <h2 className="font-display text-xs uppercase tracking-widest text-steel-500">
            The matches
          </h2>
          <ul className="mt-3 space-y-2">
            {matches.map((match) => (
              <li key={match.id}>
                <Link
                  href={`/matches/${day}/${match.sourceMatchId}`}
                  className="panel group flex items-center justify-between gap-4 p-3"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-steel-200 group-hover:text-rust-300">
                      {match.mapName}
                    </span>
                    <span className="text-xs text-steel-500">
                      {match.mode} · {matchTime(match.startedAt)}
                    </span>
                  </span>
                  <span className="shrink-0 font-mono tabular-nums">
                    <span
                      className={
                        match.winner === "red" ? "text-rust-400" : "text-steel-500"
                      }
                    >
                      {match.redScore}
                    </span>
                    <span className="mx-1 text-steel-600">-</span>
                    <span
                      className={
                        match.winner === "blue" ? "text-oxide-400" : "text-steel-500"
                      }
                    >
                      {match.blueScore}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
