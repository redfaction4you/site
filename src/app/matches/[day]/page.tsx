import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { DaySelector, MatchList, dayLabel } from "@/components/match-archive";
import { listDays, listMatchesForDay } from "@/lib/matches/queries";
import { isValidDay } from "@/lib/matches/sanitize";

type Props = { params: Promise<{ day: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { day } = await params;
  if (!isValidDay(day)) return { title: "Not found" };

  return {
    title: `Matches, ${dayLabel(day)}`,
    description: `Red Faction match results from ${dayLabel(day)} on the RedFaction4You server.`,
  };
}

export default async function MatchDayPage({ params }: Props) {
  const { day } = await params;
  if (!isValidDay(day)) notFound();

  const [days, matches] = await Promise.all([listDays(), listMatchesForDay(day)]);

  // A well-formed date with nothing in it is a 404, not an empty page: there is
  // no match night there to link to.
  if (matches.length === 0) notFound();

  return (
    <div className="mx-auto max-w-6xl px-4 py-16">
      <p className="eyebrow">Archive</p>
      <h1 className="mt-2 font-display text-4xl font-bold text-steel-100">Matches</h1>
      <p className="mt-4 max-w-2xl text-lg leading-relaxed text-steel-300">
        Every match played on the RF4U server, kept as a permanent record.
        Scoreboards, capture timelines and who actually carried the flag.
      </p>

      <div className="mt-10 grid gap-8 lg:grid-cols-[16rem_1fr]">
        <aside>
          <h2 className="mb-3 font-display text-xs uppercase tracking-widest text-steel-500">
            Match nights
          </h2>
          <DaySelector days={days} selected={day} />
        </aside>

        <section>
          <h2 className="mb-4 font-display text-xl font-bold text-steel-100">
            {dayLabel(day)}
          </h2>
          <MatchList archiveDay={day} matches={matches} />
        </section>
      </div>
    </div>
  );
}
