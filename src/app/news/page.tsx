import type { Metadata } from "next";
import Link from "next/link";

import { dayLabel } from "@/components/match-archive";
import { listColumns } from "@/lib/matches/queries";

export const metadata: Metadata = {
  title: "News",
  description:
    "Match night write-ups from the RedFaction4You server: what happened, who stood out, and how the evening went.",
};

export const dynamic = "force-dynamic";

export default async function NewsPage() {
  const columns = await listColumns();

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <p className="eyebrow">Read</p>
      <h1 className="mt-2 font-display text-3xl font-bold text-steel-100">News</h1>
      <p className="mt-3 text-base leading-relaxed text-steel-300">
        A write-up of each match night: how the evening went, what turned each game,
        and who stood out.
      </p>

      {columns.length === 0 ? (
        <div className="panel mt-8 p-6 text-center">
          <p className="text-sm text-steel-400">
            Nothing written yet. A column appears once a night of matches has finished.
          </p>
        </div>
      ) : (
        <ul className="mt-8 space-y-3">
          {columns.map((column) => (
            <li key={column.archiveDay}>
              <Link href={`/news/${column.archiveDay}`} className="panel group block p-5">
                <p className="text-xs text-steel-500">
                  {dayLabel(column.archiveDay)} · {column.matchCount}{" "}
                  {column.matchCount === 1 ? "match" : "matches"}
                </p>
                <h2 className="mt-1 font-display text-lg font-bold text-steel-100 transition-colors group-hover:text-rust-300">
                  {column.headline}
                </h2>
                <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-steel-400">
                  {column.body.split("\n").find(Boolean)}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
