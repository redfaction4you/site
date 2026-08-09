/**
 * Facts worth putting in a ticker.
 *
 * A sports ticker earns its place by carrying things you did not go looking
 * for: a record, an unusual scoreline, somebody's best night. Everything here
 * is computed from the archive, so it stays true and it changes on its own as
 * more is played. Nothing is filler.
 */
import { and, desc, eq, ne, sql } from "drizzle-orm";
import { cache } from "react";

import { db } from "@/lib/db";
import { matchPlayers, matches } from "@/lib/db/schema";
import { IDENTITY_KEY } from "@/lib/matches/identities";
import { MATCH_COMPLETED, TOOK_PART, canonicalNames } from "@/lib/matches/queries";

export type TickerItem = {
  /** Short label, shown in the accent colour. */
  label: string;
  /** The fact itself. */
  text: string;
  href: string;
};

function seconds(ms: number): string {
  // Keep a decimal under ten seconds. A fastest capture can genuinely be
  // fractions of a second, and rounding it printed the record as "0s", which
  // reads as a broken number rather than a fast one.
  if (ms < 10_000) return `${(ms / 1000).toFixed(1)}s`;
  const total = Math.round(ms / 1000);
  return total >= 60 ? `${Math.floor(total / 60)}m ${total % 60}s` : `${total}s`;
}

export const getTicker = cache(async function getTicker(): Promise<TickerItem[]> {
  const items: TickerItem[] = [];

  // Best single-match performances. One query, several records out of it.
  const bestRows = await db
    .select({
      /*
       * Selected so the name can be resolved, and dropped again below.
       *
       * `match_players.identity_key` is stored and never served; the mapping
       * happens here rather than in a component, the same arrangement as the
       * scoreboard in `getMatch`.
       */
      identityKey: IDENTITY_KEY,
      name: matchPlayers.name,
      kills: matchPlayers.kills,
      caps: matchPlayers.caps,
      maxStreak: matchPlayers.maxStreak,
      accuracy: matchPlayers.accuracy,
      shotsFired: matchPlayers.shotsFired,
      fastestCaptureMs: matchPlayers.fastestSoloCaptureMs,
      leadCarries: matchPlayers.leadCarries,
      archiveDay: matches.archiveDay,
      sourceMatchId: matches.sourceMatchId,
      mapName: matches.mapName,
    })
    .from(matchPlayers)
    .innerJoin(matches, eq(matches.id, matchPlayers.matchId))
    // Every record below comes out of these rows, so a match that did not count
    // must not be in them. Thirty seconds of an abandoned start is a short
    // window to set a record in and not an impossible one, and "longest streak"
    // taken from a match the archive says did not happen is exactly the kind of
    // wrong number a ticker states with total confidence.
    .where(and(TOOK_PART, eq(matches.status, "final"), MATCH_COMPLETED));

  if (bestRows.length === 0) return items;

  /*
   * Resolved once, here, so every record below is about a person rather than
   * about whatever the scoreboard said that evening — and so does anything
   * added to this function later.
   *
   * Six facts in this ticker name somebody, and each one linked to a player
   * page that could be headed with a different name. Resolving by name could
   * not do it: `cowboy dan` has been used by two different people.
   */
  const named = await canonicalNames();
  const best = bestRows.map(({ identityKey, ...row }) => ({
    ...row,
    name: named.get(identityKey) ?? row.name,
  }));

  const link = (row: (typeof best)[number]) =>
    `/matches/${row.archiveDay}/${row.sourceMatchId}`;

  const topBy = <K extends keyof (typeof best)[number]>(key: K) =>
    best.reduce((a, b) => ((b[key] as number) > (a[key] as number) ? b : a));

  const mostFrags = topBy("kills");
  items.push({
    label: "Match record",
    text: `${mostFrags.kills} frags by ${mostFrags.name} on ${mostFrags.mapName}`,
    href: link(mostFrags),
  });

  const bestStreak = topBy("maxStreak");
  if (bestStreak.maxStreak > 0) {
    items.push({
      label: "Longest streak",
      text: `${bestStreak.maxStreak} by ${bestStreak.name}, ${bestStreak.mapName}`,
      href: link(bestStreak),
    });
  }

  const mostCaps = topBy("caps");
  if (mostCaps.caps > 0) {
    items.push({
      label: "Most caps in a match",
      text: `${mostCaps.caps} by ${mostCaps.name}`,
      href: link(mostCaps),
    });
  }

  // Accuracy needs a floor, otherwise the record is whoever fired twice.
  const sharpshooter = best
    .filter((row) => row.shotsFired >= 200)
    .reduce<(typeof best)[number] | null>(
      (a, b) => (!a || b.accuracy > a.accuracy ? b : a),
      null,
    );
  if (sharpshooter) {
    items.push({
      label: "Best accuracy",
      text: `${(sharpshooter.accuracy * 100).toFixed(1)}% by ${sharpshooter.name}`,
      href: link(sharpshooter),
    });
  }

  /*
   * The measured flag journey, matching the stat boards so the two cannot
   * disagree about the record.
   *
   * No filters left to apply. This reads `fastest_solo_capture_ms`, which is
   * only ever set for a drive one person carried from the stand, so the
   * unrelayed test and the time floor that used to guard the server's own figure
   * are both answered by the column itself.
   */
  const quickest = best
    .filter((row) => (row.fastestCaptureMs ?? 0) > 0)
    .reduce<(typeof best)[number] | null>(
      (a, b) => (!a || (b.fastestCaptureMs ?? 0) < (a.fastestCaptureMs ?? 0) ? b : a),
      null,
    );
  if (quickest?.fastestCaptureMs) {
    items.push({
      label: "Fastest cap",
      text: `${seconds(quickest.fastestCaptureMs)} by ${quickest.name}`,
      href: link(quickest),
    });
  }

  const carrier = topBy("leadCarries");
  if (carrier.leadCarries > 0) {
    items.push({
      label: "Unsung",
      text: `${carrier.name} carried furthest on ${carrier.leadCarries} caps someone else finished`,
      href: link(carrier),
    });
  }

  // Biggest win, which is a fact about the match rather than a player.
  const [blowout] = await db
    .select({
      archiveDay: matches.archiveDay,
      sourceMatchId: matches.sourceMatchId,
      mapName: matches.mapName,
      redScore: matches.redScore,
      blueScore: matches.blueScore,
      margin: sql<number>`abs(${matches.redScore} - ${matches.blueScore})`,
    })
    .from(matches)
    .where(and(eq(matches.status, "final"), ne(matches.winner, ""), MATCH_COMPLETED))
    .orderBy(desc(sql`abs(${matches.redScore} - ${matches.blueScore})`))
    .limit(1);

  if (blowout && blowout.margin > 0) {
    /*
     * Winner first, which it was not.
     *
     * Printed as stored it read "Biggest win, 3-6", which is a defeat by three
     * on the face of it. Red then blue is the right order on a match page, where
     * the columns are labelled and a reader is looking at both sides. Under the
     * words "biggest win" it is the wrong order, because the sentence has
     * already named whose score comes first.
     */
    const winning = Math.max(blowout.redScore, blowout.blueScore);
    const losing = Math.min(blowout.redScore, blowout.blueScore);

    items.push({
      label: "Biggest win",
      text: `${winning}-${losing} on ${blowout.mapName}`,
      href: `/matches/${blowout.archiveDay}/${blowout.sourceMatchId}`,
    });
  }

  // Overtime is rare enough to be interesting when it happens.
  const overtime = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(matches)
    .where(and(eq(matches.status, "final"), eq(matches.overtime, true), MATCH_COMPLETED));

  if (overtime[0]?.count) {
    items.push({
      label: "Overtime",
      text: `${overtime[0].count} ${overtime[0].count === 1 ? "match has" : "matches have"} gone past regulation`,
      href: "/matches",
    });
  }

  return items;
});
