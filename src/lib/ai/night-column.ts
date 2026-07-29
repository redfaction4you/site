/**
 * The daily column: one piece covering a whole night of matches.
 *
 * Individual match reports say what happened in one game. This is the thing you
 * read over lunch: how the evening went, who turned up, what stood out across
 * all of it. Written once per night, rewritten only if more matches arrive on
 * the same day.
 *
 * Same two rules as the match reports, for the same reason. The model gets
 * facts and is told to use only those, and the result is labelled as
 * machine-written wherever it appears.
 */
import { and, asc, eq, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { matchPlayers, matches } from "@/lib/db/schema";
import { generate } from "./generate";

const SYSTEM = `You are a sports columnist covering a Red Faction capture-the-flag league.

You write the daily wrap: one piece covering a night of matches, the kind of
thing someone reads over lunch. Warm, specific, a bit of personality. You care
about the people playing.

Structure, loosely:
- Open with what defined the night. Not "last night saw five matches".
- Walk the matches in order, briefly. Say what turned each one.
- Then the players: who stood out, who carried, who had a rough night but kept
  showing up. Be generous and human about it.
- Close with a line that looks forward, without inventing a fixture or a date.

Hard rules:
- Use ONLY the facts given. You know nothing else about these players or this
  community.
- Never invent history, rivalries, past seasons, records, nicknames or motives.
- Never state a number that is not in the data.
- Never guess a player's gender. Use they/them if you need a pronoun.
- Refer to players exactly by the names given, including odd capitalisation.
- Do not use em dashes.
- No headings, no bullet points, no markdown. Plain paragraphs.
- Four to six paragraphs. Stop when you have said what there is to say.

First line of your reply must be a headline on its own, under 70 characters,
with no quotes and no trailing full stop. Then a blank line. Then the column.`;

function clock(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export type NightFacts = {
  archiveDay: string;
  matchCount: number;
  prompt: string;
};

/**
 * Gathers the night into something worth writing about.
 *
 * Per match: the result and its shape. Per player: their totals for the night,
 * which is what lets the column say who carried rather than just who won.
 */
export async function buildNightFacts(archiveDay: string): Promise<NightFacts | null> {
  const rows = await db
    .select({
      id: matches.id,
      sourceMatchId: matches.sourceMatchId,
      mapName: matches.mapName,
      mode: matches.mode,
      startedAt: matches.startedAt,
      endedAt: matches.endedAt,
      redScore: matches.redScore,
      blueScore: matches.blueScore,
      winner: matches.winner,
      overtime: matches.overtime,
      report: matches.report,
      kills: matches.kills,
    })
    .from(matches)
    .where(and(eq(matches.archiveDay, archiveDay), eq(matches.status, "final")))
    .orderBy(asc(matches.startedAt));

  if (rows.length === 0) return null;

  // Totals for the night, per player, across every match they appeared in.
  const totals = await db
    .select({
      name: sql<string>`min(${matchPlayers.name})`,
      matches: sql<number>`count(distinct ${matchPlayers.matchId})::int`,
      kills: sql<number>`coalesce(sum(${matchPlayers.kills}), 0)::int`,
      deaths: sql<number>`coalesce(sum(${matchPlayers.deaths}), 0)::int`,
      caps: sql<number>`coalesce(sum(${matchPlayers.caps}), 0)::int`,
      score: sql<number>`coalesce(sum(${matchPlayers.score}), 0)::int`,
      hit: sql<number>`coalesce(sum(${matchPlayers.shotsHit}), 0)::float8`,
      fired: sql<number>`coalesce(sum(${matchPlayers.shotsFired}), 0)::float8`,
      bestStreak: sql<number>`coalesce(max(${matchPlayers.maxStreak}), 0)::int`,
      returns: sql<number>`coalesce(sum(${matchPlayers.flagReturns}), 0)::int`,
    })
    .from(matchPlayers)
    .innerJoin(matches, eq(matches.id, matchPlayers.matchId))
    .where(and(eq(matches.archiveDay, archiveDay), eq(matchPlayers.spectator, false)))
    .groupBy(sql`lower(${matchPlayers.name})`)
    .orderBy(sql`coalesce(sum(${matchPlayers.score}), 0) desc`);

  const lines: string[] = [];
  lines.push(`Match night of ${archiveDay}.`);
  lines.push(`${rows.length} matches were played, in this order:`);
  lines.push("");

  for (const [index, match] of rows.entries()) {
    const winner = match.winner ?? "nobody";
    lines.push(
      `Match ${index + 1}: ${match.mapName} (${match.mode}). ` +
        `Red ${match.redScore}, blue ${match.blueScore}. Won by ${winner}.` +
        (match.overtime ? " Went to overtime." : "") +
        ` ${(match.kills as unknown[]).length} frags in the match.`,
    );
    // The per match report, where one exists, carries the narrative detail.
    if (match.report) {
      lines.push(`  What happened: ${match.report.replace(/\s+/g, " ").trim()}`);
    }
    lines.push("");
  }

  lines.push("Player totals across the whole night:");
  for (const p of totals) {
    const accuracy = p.fired > 0 ? `${((p.hit / p.fired) * 100).toFixed(1)}%` : "n/a";
    lines.push(
      `  ${p.name}: played ${p.matches}, ${p.kills} frags, ${p.deaths} deaths, ` +
        `${p.caps} captures, ${p.score} total score, ${accuracy} accuracy, ` +
        `best streak ${p.bestStreak}, ${p.returns} flag returns`,
    );
  }

  const first = rows[0]?.startedAt;
  const last = rows[rows.length - 1]?.endedAt ?? rows[rows.length - 1]?.startedAt;
  if (first && last) {
    const minutes = Math.round((last.getTime() - first.getTime()) / 60000);
    lines.push("");
    lines.push(`The session ran about ${minutes} minutes from first to last match.`);
  }

  return { archiveDay, matchCount: rows.length, prompt: lines.join("\n") };
}

export type WrittenColumn = { headline: string; body: string };

/** Writes the column, or returns null if generation is off or failed. */
export async function writeNightColumn(
  facts: NightFacts,
): Promise<WrittenColumn | null> {
  const text = await generate(SYSTEM, facts.prompt);
  if (!text) return null;

  // First line is the headline, the rest is the column.
  const [first, ...rest] = text.split("\n");
  const headline = first.replace(/^#+\s*/, "").replace(/^["']|["'.]$/g, "").trim();
  const body = rest.join("\n").trim();

  // A reply that did not follow the shape is not worth storing half of.
  if (!headline || headline.length > 120 || !body) return null;

  return { headline, body };
}

/** Exported for the column page, which shows the clock alongside captures. */
export { clock };
