import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { dayLabel } from "@/components/match-archive";
import { MatchDetailView } from "@/components/match-detail";
import {
  getAdjacentMatches,
  getMatch,
  listDays,
  listMatchesForDay,
} from "@/lib/matches/queries";
import { isValidDay } from "@/lib/matches/sanitize";

type Props = { params: Promise<{ day: string; match: string }> };

async function load(params: Props["params"]) {
  const { day, match } = await params;
  if (!isValidDay(day)) return null;

  const id = Number(match);
  if (!Number.isInteger(id) || id < 0) return null;

  return getMatch(day, id);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const match = await load(params);
  if (!match) return { title: "Not found" };

  return {
    title: `${match.mapName}, ${match.redScore}–${match.blueScore}`,
    description: `${match.mode} on ${match.mapName}, played ${dayLabel(match.archiveDay)}. Full scoreboard, capture timeline and event log.`,
  };
}

export default async function MatchPage({ params }: Props) {
  const match = await load(params);
  if (!match) notFound();

  const [days, siblings, adjacent] = await Promise.all([
    listDays(),
    listMatchesForDay(match.archiveDay),
    getAdjacentMatches(match.startedAt, match.id),
  ]);

  return (
    <MatchDetailView
      match={match}
      days={days}
      siblings={siblings}
      previous={adjacent.previous}
      next={adjacent.next}
    />
  );
}
