/**
 * Stanley Mesh: a short opinion piece about who plays with whom.
 *
 * Every other piece of writing here reports. This one has a view, and that is
 * the point: with a handful of nights on record there is very little that can
 * honestly be *concluded* about pairings, and quite a lot worth *saying*. An
 * opinion is publishable on thin data in a way a finding is not, because it does
 * not claim to be a measurement.
 *
 * **The whole guard is the line between a preference and a finding.**
 *
 *   "Stanley Mesh would like to see Medeo paired with Romek"  is fine. A stated
 *   preference makes no claim about what the record shows.
 *
 *   "Medeo and Romek are the strongest pairing"  is not, on three matches. That
 *   is a finding, and it is not in the data.
 *
 * The fact checker cannot catch the second kind on its own: every number in it
 * may be true while the sentence is still asserting something the sample cannot
 * support. So the defence is mostly upstream. Stanley Mesh is handed rates only where
 * the pairing has cleared the bar in `pairings.ts`, and below it never sees a
 * percentage at all rather than being asked not to use one. A model given a
 * tempting number and told to ignore it will use the number.
 *
 * The byline says it is machine written. That was decided before this existed
 * and is recorded in the handover: a human sounding name is the one thing that
 * quietly undoes the labelling everything else on the site carries. Stanley Mesh is a
 * column, not a person, and the page says so.
 */
import { and, desc, eq, lte, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { matchPlayers, matches } from "@/lib/db/schema";
import { MIN_MATCHES_FOR_PAIR_RATE, buildPairings } from "@/lib/matches/pairings";
import { TOOK_PART, fetchAppearances } from "@/lib/matches/queries";
import { checkClaims, repairNote } from "./fact-check";
import { generate } from "./generate";

/**
 * How this piece is signed, everywhere it appears.
 *
 * In one place so renaming the columnist is one line rather than a search. The
 * The surname is doing quiet work: a mesh is a 3D model, so it says rendered
 * thing without the reader having to be told. The first name pulls the other
 * way, which is the point of having both. He should read as a character with a
 * byline rather than as a system with a label, while the surname and the note
 * beside it stop anybody mistaking him for a correspondent.
 */
export const COLUMNIST_NAME = "Stanley Mesh";

/**
 * What he is, said on the piece.
 *
 * An analyst is the right genre and not only a costume. The rule this column
 * lives or dies by is the one between a preference and a finding, and "what I
 * would like to see is X alongside Y" is exactly how a pundit talks. Putting him
 * in that chair makes the honest sentence the natural one to write rather than a
 * restriction fighting the voice.
 */
export const COLUMNIST_ROLE = "Sports analyst";
export const COLUMNIST_NOTE =
  "Stanley Mesh is a machine written opinion column, not a person. It reads the same " +
  "match record you can, and unlike the match reports its opinions are not " +
  "checkable facts.";

/**
 * Below this there is nothing to have an opinion about.
 *
 * Pairings need matches before anything can be said, even loosely. Two nights of
 * four people produces a piece that is all hedging and no content, which is
 * worse than no piece.
 */
export const MIN_MATCHES_FOR_OPINION = 12;

/** And enough people that a pairing is a choice rather than the only option. */
export const MIN_PLAYERS_FOR_OPINION = 5;

const SYSTEM = `You are ${COLUMNIST_NAME}, a sports analyst covering a Red Faction
capture-the-flag league. You write a short piece about who plays alongside whom.

You are the analyst on the panel after the match, not the commentator during it.
Everything else on this site reports what happened; you are the one part allowed
a view. That is the job: this league is small, there is very little that can be
concluded about pairings, and a great deal worth arguing about.

Talk the way an analyst talks. Back a pairing. Say what you want to see next
week. Be willing to be wrong in public, which is what makes it worth reading.

THE RULE THAT MATTERS MOST

Say what you would like to see. Never say what the record proves.

  Allowed:   "the pairing worth trying is X with Y"
  Allowed:   "X and Y keep ending up on the same side"
  Allowed:   "I would like to see X carrying while Y holds the middle"
  Forbidden: "X and Y are the strongest pairing"
  Forbidden: "X plays better with Y"
  Forbidden: "the numbers show X and Y work"

The difference is whether the sentence claims to be a measurement. A preference
is yours. A finding belongs to the data, and on this much data there are almost
none to be had.

Hard rules:
- Use ONLY the facts given. You know nothing else about these players.
- Never state a number that is not in the data.
- Where a win rate is missing it is missing because there are too few matches to
  give one. Do not compute one from the record, and do not describe that pairing
  as working or not working.
- How much better somebody plays with a given partner is not recorded anywhere
  and cannot be worked out. Never imply it is known.
- Sides are shirt colours that get reshuffled between matches. Red and blue are
  not teams and must never be written about as though they were.
- Never invent history, rivalries, past seasons, records or motives. Two players
  being often on the same side is attendance, not a friendship or a partnership
  they chose.
- Never guess a player's gender. Use they and them for everyone, without
  exception, however the name reads to you. Never write he, she, his or her.
- Refer to players exactly by the names given, including odd capitalisation.
- Do not use em dashes.
- No headings, no bullet points, no markdown. Plain paragraphs.
- Two or three paragraphs. Stop when you have said what there is to say.
- Do not open by describing yourself or the column.

First line of your reply must be a headline on its own, under 70 characters, no
quotes, no trailing full stop, and no date in any form.`;

export type OpinionFacts = {
  archiveDay: string;
  matchCount: number;
  prompt: string;
};

/**
 * The pairing record, laid out for an opinion rather than a report.
 *
 * Rates arrive already computed or already withheld. See the module note: a
 * model handed a percentage and told not to lean on it leans on it.
 */
export async function buildOpinionFacts(archiveDay: string): Promise<OpinionFacts | null> {
  const [totals] = await db
    .select({
      matchCount: sql<number>`count(distinct ${matches.id})::int`,
      playerCount: sql<number>`count(distinct lower(${matchPlayers.name}))::int`,
    })
    .from(matches)
    .innerJoin(matchPlayers, eq(matchPlayers.matchId, matches.id))
    // Only what was on record that night. See the note below.
    .where(
      and(
        eq(matches.status, "final"),
        TOOK_PART,
        lte(matches.archiveDay, archiveDay),
      ),
    );

  if (
    !totals ||
    totals.matchCount < MIN_MATCHES_FOR_OPINION ||
    totals.playerCount < MIN_PLAYERS_FOR_OPINION
  ) {
    return null;
  }

  /*
   * The archive as it stood that night, not as it stands now.
   *
   * Written from the whole archive, the piece under 28 July said ED ASSMASTER
   * and Romek had shared a side seven times at an 86% win rate. On 28 July they
   * had played together once. Every number was true of today and false of the
   * page it sat on, which is the same failure as a stale profile: a figure that
   * is accurate in one frame and misleading in the one it is presented in.
   *
   * A consequence worth stating: an early night may now have too little behind
   * it to say anything, and gets no piece rather than a backdated one. That is
   * the correct outcome. There was nothing to have an opinion about yet.
   */
  const pairings = buildPairings(await fetchAppearances(archiveDay));
  if (pairings.partnerships.length === 0) return null;

  // Who played on the night this piece follows, so it can be about them rather
  // than about the archive in general.
  const tonight = await db
    .select({ name: sql<string>`min(${matchPlayers.name})` })
    .from(matchPlayers)
    .innerJoin(matches, eq(matches.id, matchPlayers.matchId))
    .where(and(eq(matches.archiveDay, archiveDay), TOOK_PART))
    .groupBy(sql`lower(${matchPlayers.name})`)
    .orderBy(desc(sql`sum(${matchPlayers.score})`));

  const lines: string[] = [];
  lines.push(`Tonight, ${archiveDay}, these players were on: ${tonight
    .map((row) => row.name)
    .join(", ")}.`);
  lines.push(
    `Across the whole archive there are ${totals.matchCount} matches and ` +
      `${totals.playerCount} players on record.`,
  );
  lines.push("");

  lines.push("Who has played on the same side, most together first:");
  for (const pair of pairings.partnerships) {
    const rate =
      pair.winRate === null
        ? `no win rate: fewer than ${MIN_MATCHES_FOR_PAIR_RATE} decided matches together, so there is not one to give`
        : `${Math.round(pair.winRate * 100)}% of decided matches won`;
    lines.push(
      `  ${pair.a} and ${pair.b}: ${pair.matches} together, ${pair.wins} won, ` +
        `${pair.losses} lost. ${rate}.`,
    );
  }
  lines.push("");

  lines.push("Who has played against whom, and how that has gone:");
  for (const pair of pairings.rivalries) {
    lines.push(
      `  ${pair.a} against ${pair.b}: ${pair.matches} faced, ` +
        `${pair.a} won ${pair.aWins}, ${pair.b} won ${pair.bWins}.`,
    );
  }
  lines.push("");

  // The pairings that have never happened are the most useful thing here, since
  // a column about what to try needs somewhere to point.
  const seen = new Set(
    pairings.partnerships.map((pair) =>
      [pair.a.toLowerCase(), pair.b.toLowerCase()].sort().join("|"),
    ),
  );
  const names = tonight.map((row) => row.name);
  const untried: string[] = [];
  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      const key = [names[i].toLowerCase(), names[j].toLowerCase()].sort().join("|");
      if (!seen.has(key)) untried.push(`${names[i]} and ${names[j]}`);
    }
  }
  lines.push(
    untried.length
      ? `Pairs from tonight who have never been on the same side: ${untried.join("; ")}.`
      : "Everybody who played tonight has been on a side with everybody else at some point.",
  );

  lines.push("");
  lines.push(
    "Remember: how much better somebody plays with a particular partner is not " +
      "recorded and cannot be worked out from any of the above.",
  );

  return { archiveDay, matchCount: totals.matchCount, prompt: lines.join("\n") };
}

export type OpinionColumn = { headline: string; body: string };

function split(text: string): OpinionColumn | null {
  const trimmed = text.trim();
  const breakAt = trimmed.indexOf("\n");
  if (breakAt === -1) return null;

  const headline = trimmed.slice(0, breakAt).trim().replace(/^["']|["']$/g, "");
  const body = trimmed.slice(breakAt).trim();

  if (!headline || headline.length > 90 || body.length < 120) return null;
  return { headline, body };
}

/**
 * Writes the piece, checks it, and rewrites once if the check objects.
 *
 * Fails open like the other checkers, for the reason given in `fact-check.ts`:
 * a checker that cannot run must never become a new way for the site to go
 * quiet. The difference here is what the check can catch. It verifies the
 * numbers, which leaves the preference-versus-finding rule resting on the prompt
 * and on the facts withholding what should not be leaned on.
 */
export async function writeOpinion(facts: OpinionFacts): Promise<OpinionColumn | null> {
  const first = await generate(SYSTEM, facts.prompt);
  if (!first) return null;

  const piece = split(first);
  if (!piece) return null;

  const check = await checkClaims(facts.prompt, piece.body);
  if (check.ok) return piece;

  const second = await generate(
    SYSTEM,
    `${facts.prompt}\n\n${repairNote(check.problems)}`,
  );
  if (!second) return null;

  const repaired = split(second);
  if (!repaired) return null;

  const recheck = await checkClaims(facts.prompt, repaired.body);
  return recheck.ok ? repaired : null;
}
