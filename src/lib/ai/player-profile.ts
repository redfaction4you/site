/**
 * Writes the short profile on a player's page.
 *
 * The scoreboard says what somebody did. This says what they are like: who
 * grinds out frags, who lives on the objective, who dies constantly and gets
 * the flag home anyway. That is what people actually say about each other, and
 * it is derivable from the record rather than invented.
 *
 * The model is given the player's totals, where those sit against everyone
 * else, and their recent matches. Comparison is what makes it meaningful: 177
 * frags means nothing on its own, and "second most on the server" means
 * something. Ranks are computed here rather than left to the model to work out
 * from a table, because that is arithmetic and it is bad at it.
 */
import { and, desc, eq, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { matchPlayers, matches } from "@/lib/db/schema";
import {
  MIN_MATCHES_FOR_PAIR_RATE,
  buildPairings,
  pairingsFor,
} from "@/lib/matches/pairings";
import {
  MATCH_COMPLETED,
  SOUND_SHOOTING,
  TOOK_PART,
  fetchAppearances,
} from "@/lib/matches/queries";
import { generate } from "./generate";

const SYSTEM = `You write two paragraph player profiles for a Red Faction
capture-the-flag archive. The tone is a sports writer describing a player
everyone in the league already knows.

What makes a good one:
- Say what kind of player they are, not just what they scored. Frag hunter,
  flag runner, the one who dies constantly and still gets it home.
- Use the comparisons given. Being second in frags across the server is the
  interesting fact; the raw number alone is not.
- Be generous. Somebody with a poor ratio who keeps capturing is doing
  something hard, and a profile should notice.
- Name a genuine weakness only if the numbers plainly show one, and say it
  the way a teammate would, not a critic.
- Who they play with and against is worth a line when the numbers are clear:
  the person they are most often on a side with, or somebody they have faced a
  lot. Say it as attendance, which is what it is. "Usually on the same side as
  X" is supported. "Has a rivalry with X" is not, and neither is anything
  about how the two of them get on, play off each other, or feel about it.

Hard rules:
- Use ONLY the facts given. You know nothing else about this person.
- Never invent history, rivalries, past seasons, records or motives.
- Sides are shirt colours that get reshuffled between matches. Red and blue
  are not teams and must never be written about as though they were.
- A record of two or three matches is not a trend. If a win rate was withheld
  as too few to give, do not compute one from the record yourself and do not
  describe the pairing as working well or badly.
- Never state a number that is not in the data.
- Never guess a player's gender. Use they and them for everyone, without
  exception, however the name reads to you. Never write he, she, his or her.
- Do not use em dashes.
- No headings, no bullet points, no markdown. Two paragraphs, plain prose.
- Do not open with the player's name every time. Vary it.
- If the record is thin, say less. One honest paragraph beats two padded ones.`;

/**
 * Below this a profile is a description of one night, not of a player.
 *
 * Was three, which is one evening: a profile written there described how
 * somebody happened to play on a Tuesday and then sat on their page as though it
 * described them. Nine is roughly two or three nights, enough that a run of good
 * or bad games is not the whole account.
 *
 * The page enforces this as well as the writer, because a stored profile can
 * fall below the bar later: when rows that were never really played stopped
 * counting, two players dropped a match each. Raising this number hides those
 * profiles rather than deleting them, and they come back as the record grows.
 */
export const MIN_MATCHES_FOR_PROFILE = 9;

type Ranked = { rank: number; of: number; value: number };

function rankOf(values: number[], mine: number): Ranked {
  const sorted = [...values].sort((a, b) => b - a);
  return { rank: sorted.indexOf(mine) + 1, of: values.length, value: mine };
}

export type ProfileFacts = {
  nameKey: string;
  displayName: string;
  matchCount: number;
  prompt: string;
};

export async function buildProfileFacts(
  nameKey: string,
): Promise<ProfileFacts | null> {
  // Everyone's totals, so this player can be placed against the field.
  const everyone = await db
    .select({
      nameKey: sql<string>`lower(${matchPlayers.name})`,
      name: sql<string>`min(${matchPlayers.name})`,
      matchesPlayed: sql<number>`count(distinct ${matchPlayers.matchId})::int`,
      kills: sql<number>`coalesce(sum(${matchPlayers.kills}), 0)::int`,
      deaths: sql<number>`coalesce(sum(${matchPlayers.deaths}), 0)::int`,
      caps: sql<number>`coalesce(sum(${matchPlayers.caps}), 0)::int`,
      leadCarries: sql<number>`coalesce(sum(${matchPlayers.leadCarries}), 0)::int`,
      flagReturns: sql<number>`coalesce(sum(${matchPlayers.flagReturns}), 0)::int`,
      // Sound matches only, matching the boards and the scoreboards. See
      // `SOUND_SHOOTING`.
      hit: sql<number>`coalesce(sum(${matchPlayers.shotsHit}) filter (where ${SOUND_SHOOTING}), 0)::float8`,
      fired: sql<number>`coalesce(sum(${matchPlayers.shotsFired}) filter (where ${SOUND_SHOOTING}), 0)::float8`,
      bestStreak: sql<number>`coalesce(max(${matchPlayers.maxStreak}), 0)::int`,
      flagHoldMs: sql<number>`coalesce(sum(${matchPlayers.flagHoldMs}), 0)::int`,
    })
    .from(matchPlayers)
    .innerJoin(matches, eq(matches.id, matchPlayers.matchId))
    // Every figure in a profile is a total or a rank across the field, and both
    // are quoted back to the reader beside /players, which counts only the
    // matches that counted. Two pages describing the same player with different
    // numbers is the whole failure this rule exists to prevent.
    .where(and(TOOK_PART, MATCH_COMPLETED))
    .groupBy(sql`lower(${matchPlayers.name})`);

  const me = everyone.find((row) => row.nameKey === nameKey);
  if (!me || me.matchesPlayed < MIN_MATCHES_FOR_PROFILE) return null;

  const accuracy = (row: (typeof everyone)[number]) =>
    row.fired > 0 ? row.hit / row.fired : 0;

  const lines: string[] = [];
  lines.push(`Player: ${me.name}`);
  lines.push(`Matches played: ${me.matchesPlayed}`);
  lines.push(`There are ${everyone.length} players on record in total.`);
  lines.push("");
  lines.push("Their totals, and where that ranks across all players:");

  const place = (label: string, values: number[], mine: number, suffix = "") => {
    const r = rankOf(values, mine);
    lines.push(`  ${label}: ${mine}${suffix} (ranked ${r.rank} of ${r.of})`);
  };

  place("Frags", everyone.map((r) => r.kills), me.kills);
  place("Deaths", everyone.map((r) => r.deaths), me.deaths);
  place("Captures", everyone.map((r) => r.caps), me.caps);
  place("Flag returns", everyone.map((r) => r.flagReturns), me.flagReturns);
  place("Best streak", everyone.map((r) => r.bestStreak), me.bestStreak);
  place(
    "Lead carries (carried the flag furthest on a run a teammate finished)",
    everyone.map((r) => r.leadCarries),
    me.leadCarries,
  );

  const accuracyRank = rankOf(everyone.map(accuracy), accuracy(me));
  lines.push(
    `  Accuracy: ${(accuracy(me) * 100).toFixed(1)}% (ranked ${accuracyRank.rank} of ${accuracyRank.of})`,
  );

  const ratio = me.deaths > 0 ? me.kills / me.deaths : me.kills;
  const ratios = everyone.map((r) => (r.deaths > 0 ? r.kills / r.deaths : r.kills));
  const ratioRank = rankOf(ratios, ratio);
  lines.push(
    `  Frags per death: ${ratio.toFixed(2)} (ranked ${ratioRank.rank} of ${ratioRank.of})`,
  );
  lines.push(
    `  Time carrying the flag: ${Math.round(me.flagHoldMs / 1000)} seconds across all matches`,
  );
  lines.push("");

  // Recent form, so the profile is about now rather than a lifetime average.
  const recent = await db
    .select({
      mapName: matches.mapName,
      archiveDay: matches.archiveDay,
      team: matchPlayers.team,
      winner: matches.winner,
      kills: matchPlayers.kills,
      deaths: matchPlayers.deaths,
      caps: matchPlayers.caps,
    })
    .from(matchPlayers)
    .innerJoin(matches, eq(matches.id, matchPlayers.matchId))
    .where(
      and(
        sql`lower(${matchPlayers.name}) = ${nameKey}`,
        eq(matches.status, "final"),
        MATCH_COMPLETED,
      ),
    )
    .orderBy(desc(matches.startedAt))
    .limit(8);

  if (recent.length) {
    lines.push("Their most recent matches, newest first:");
    for (const r of recent) {
      const result = r.winner ? (r.winner === r.team ? "won" : "lost") : "no result";
      lines.push(
        `  ${r.archiveDay} ${r.mapName}: ${result}, ${r.kills} frags, ${r.deaths} deaths, ${r.caps} captures`,
      );
    }
  }

  /*
   * Who they play with and against.
   *
   * The most human thing the archive knows and the last thing it was telling
   * anybody. A profile that can say who somebody keeps ending up next to reads
   * like it is about a person in a group rather than a row in a table.
   *
   * The rate is handed over already computed, and withheld where it would be
   * noise, for the same reason the superlatives are: working out a percentage
   * from a record is arithmetic, and being told "do not overread small numbers"
   * is not something a model reliably acts on when a tempting number is sitting
   * in front of it. Below the bar it simply never sees a percentage.
   */
  const pairings = pairingsFor(me.name, buildPairings(await fetchAppearances()));

  if (pairings.alongside.length) {
    lines.push("");
    lines.push("Matches on the same side as each player, and the shared record:");
    for (const row of pairings.alongside) {
      const rate =
        row.winRate === null
          ? ` (too few to give a win rate, fewer than ${MIN_MATCHES_FOR_PAIR_RATE} decided)`
          : ` (${Math.round(row.winRate * 100)}% won)`;
      lines.push(
        `  With ${row.partner}: ${row.matches} together, ${row.wins} won, ${row.losses} lost${rate}`,
      );
    }
  }

  if (pairings.against.length) {
    lines.push("");
    lines.push(`Matches against each player, from ${me.name}'s side of it:`);
    for (const row of pairings.against) {
      lines.push(
        `  Against ${row.opponent}: ${row.matches} faced, ${row.won} won, ${row.lost} lost`,
      );
    }
  }

  return {
    nameKey,
    displayName: me.name,
    matchCount: me.matchesPlayed,
    prompt: lines.join("\n"),
  };
}

export async function writeProfile(facts: ProfileFacts): Promise<string | null> {
  const text = await generate(SYSTEM, facts.prompt);
  if (!text) return null;
  // A one word reply is a failure wearing a success costume.
  return text.length > 80 ? text : null;
}
