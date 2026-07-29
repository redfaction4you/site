import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { EmptyArchive } from "@/components/match-archive";
import { latestDay } from "@/lib/matches/queries";

export const metadata: Metadata = {
  title: "Matches",
  description:
    "The RedFaction4You match archive: scoreboards, captures and results from the community server, night by night.",
};

export default async function MatchesPage() {
  const latest = await latestDay();

  // The newest night is what anyone arriving here wants, and sending them to
  // its real URL means the page they are looking at is the page they can share.
  if (latest) redirect(`/matches/${latest}`);

  return (
    <div className="mx-auto max-w-5xl px-4 py-16">
      <p className="eyebrow">Archive</p>
      <h1 className="mt-2 font-display text-4xl font-bold text-steel-100">Matches</h1>
      <p className="mt-4 max-w-2xl text-lg leading-relaxed text-steel-300">
        Every match played on the RF4U server, kept as a permanent record:
        scoreboards, capture timelines and who actually carried the flag.
      </p>
      <EmptyArchive />
    </div>
  );
}
