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
import { matchPlayers, matches, playerIdentities } from "@/lib/db/schema";
import { MIN_MATCHES_FOR_PAIR_RATE, buildPairings } from "@/lib/matches/pairings";
import { MIN_COMPLETED_SECONDS } from "@/lib/matches/completion";
import { DISPLAY_NAME, IDENTITY_KEY } from "@/lib/matches/identities";
import {
  MATCH_COMPLETED,
  TOOK_PART,
  fetchAppearances,
} from "@/lib/matches/queries";
import { checkClaims, repairNote } from "./fact-check";
import { loreFor } from "./lore";
import { verifyDraft, verifyNote } from "./verify";
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

/** Where he can be read. One place, so no surface invents its own. */
export const COLUMNIST_HREF = "/analyst";

/**
 * The joke, and the disclaimer that has to travel with it.
 *
 * A fictional backstory on a site whose whole argument is that its information
 * can be trusted only works if the fiction is obviously fiction. So the bio is
 * daft on purpose, it makes claims the archive visibly cannot support, and the
 * flat statement that he is not a person sits immediately underneath rather than
 * at the bottom of the page.
 *
 * Kept here beside the byline and the note, so a page cannot show the character
 * without the correction.
 */
export const COLUMNIST_BIO = [
  "Retired flag carrier, Ultor mining colony, Mars. Claims a four second " +
    "capture on a map nobody has been able to find, and a career record he " +
    "describes as unbeaten and declines to produce.",
  "These days he watches from the gantry with a clipboard and tells people who " +
    "should be on whose side, which he is better at than he was at carrying.",
];
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

YOU ARE FOLLOWING A SEASON

Not a night. You have watched every night on record and you remember them. The
interesting thing is never the scoreline, it is the shape over time: a pairing
that keeps being put back together, one that has quietly stopped happening, two
players who have circled each other all season on opposite sides and have never
once been given the same shirt. Say what has changed since the last time you
wrote. Notice when something happened for the first time tonight.

WHO YOU ARE

A retired flag carrier who now watches from the gantry with a clipboard. You are
fond of these players and slightly exasperated by them. You have a running
grievance that nobody puts the right people together, and a weakness for a
pairing that has never been tried.

Have a personality. A wry aside is welcome. A running theme across weeks is
better. What you must not do is invent a memory: you know only what is below.

Back a pairing. Say what you want to see next week. Be willing to be wrong in
public, which is the part worth reading.

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
- Only call something the most, the highest, a lead or a record if the "who
  leads what" list says so. Do not work it out yourself by comparing rows. Where
  that list says a thing is level between several, it is not a lead and must not
  be written as one.
- Where a win rate is missing it is missing because there are too few matches to
  give one. Do not compute one from the record, and do not describe that pairing
  as working or not working.
- How much better somebody plays with a given partner is not recorded anywhere
  and cannot be worked out. Never imply it is known.
- Sides are shirt colours that get reshuffled between matches. Red and blue are
  not teams and must never be written about as though they were.
- Never invent history, rivalries, past seasons, records or motives. Two players
  being often on the same side is attendance, not a friendship or a partnership
  they chose. The one exception is the BACKGROUND block, which is history the
  people here have told you; you may use what it says and nothing beyond it.
- The BACKGROUND block is context and never evidence. It explains what you are
  looking at. It cannot support a claim about the record, and a role described
  there is what somebody is known for rather than something the data shows.
- Sides are picked to be even. Do not treat a pairing that has never happened as
  an oversight or a failure of imagination when the background says the strongest
  players are split on purpose. Wanting to see it anyway is fair, and is a
  different sentence from wondering why nobody has thought of it.
- Never guess a player's gender. Use they and them for everyone, without
  exception, however the name reads to you. Never write he, she, his or her.
- Refer to players exactly by the names given, including odd capitalisation.
- Do not use em dashes.
- No headings, no bullet points, no markdown. Plain paragraphs.
- Two or three paragraphs. Stop when you have said what there is to say.
- Do not open by describing yourself or the column.
- Do not open the same way every week. Vary it.
- Do not list every pairing. Pick the two or three worth talking about and say
  something about those. A column is not a table.
- Never claim to remember a match, a moment or a conversation. You have the
  record below and nothing else. Referring to the shape of the season is
  reading; referring to what somebody said or how a game felt is inventing.

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
    // Only what was on record that night, and only what counted. See the note
    // below for the first; the second is because this figure opens the piece as
    // "N matches" and is also the gate on whether there is enough to write
    // about at all.
    .where(
      and(
        eq(matches.status, "final"),
        TOOK_PART,
        MATCH_COMPLETED,
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
    .select({ key: IDENTITY_KEY, name: DISPLAY_NAME })
    .from(matchPlayers)
    .innerJoin(matches, eq(matches.id, matchPlayers.matchId))
    .leftJoin(
      playerIdentities,
      eq(playerIdentities.identityKey, matchPlayers.identityKey),
    )
    .where(and(eq(matches.archiveDay, archiveDay), TOOK_PART, MATCH_COMPLETED))
    // Per person. Grouping on the name listed somebody twice on the one night
    // they changed it, and this list is what the piece is allowed to write about.
    .groupBy(IDENTITY_KEY)
    .orderBy(desc(sql`sum(${matchPlayers.score})`));

  /*
   * The season, not the night.
   *
   * A columnist who only knows tonight can say who was on and nothing else. What
   * makes a pairing worth writing about is its arc: when it started, whether it
   * has kept happening, whether it turned up for the first time this evening.
   * All of that is in the record and none of it was being handed over.
   */
  const seasonRows = await db
    .select({
      nights: sql<number>`count(distinct ${matches.archiveDay})::int`,
      firstNight: sql<string>`min(${matches.archiveDay})::text`,
      lastNight: sql<string>`max(${matches.archiveDay})::text`,
    })
    .from(matches)
    .where(
      and(
        eq(matches.status, "final"),
        MATCH_COMPLETED,
        lte(matches.archiveDay, archiveDay),
      ),
    );
  const season = seasonRows[0];

  // When each pair first and last shared a side, which is the shape of a
  // partnership rather than a snapshot of one.
  const pairHistory = await db.execute(sql`
    select least(lower(a.name), lower(b.name)) as one,
           greatest(lower(a.name), lower(b.name)) as two,
           min(m.archive_day)::text as first_night,
           max(m.archive_day)::text as last_night
    from ${matchPlayers} a
    join ${matchPlayers} b
      on b.match_id = a.match_id and b.team = a.team and lower(b.name) > lower(a.name)
    join ${matches} m on m.id = a.match_id
    where m.status = 'final' and m.archive_day <= ${archiveDay}
      -- The same rule MATCH_COMPLETED carries, written against the alias:
      -- that fragment names the table, and this query aliases it to m.
      -- MIN_COMPLETED_SECONDS is still the one constant.
      and (m.ended_at is null or m.started_at is null
           or extract(epoch from (m.ended_at - m.started_at)) >= ${MIN_COMPLETED_SECONDS})
      and a.team in ('red','blue') and not a.spectator and not b.spectator
    group by 1, 2
  `);

  const history = new Map<string, { first: string; last: string }>();
  for (const row of pairHistory.rows as { one: string; two: string; first_night: string; last_night: string }[]) {
    history.set(`${row.one}|${row.two}`, { first: row.first_night, last: row.last_night });
  }
  const historyFor = (a: string, b: string) =>
    history.get([a.toLowerCase(), b.toLowerCase()].sort().join("|"));

  // How each player has been going lately, so form can be talked about at all.
  const form = await db
    .select({
      name: DISPLAY_NAME,
      played: sql<number>`count(*)::int`,
      won: sql<number>`count(*) filter (where ${matches.winner} = ${matchPlayers.team})::int`,
    })
    .from(matchPlayers)
    .innerJoin(matches, eq(matches.id, matchPlayers.matchId))
    .leftJoin(
      playerIdentities,
      eq(playerIdentities.identityKey, matchPlayers.identityKey),
    )
    .where(
      and(
        eq(matches.status, "final"),
        TOOK_PART,
        MATCH_COMPLETED,
        lte(matches.archiveDay, archiveDay),
      ),
    )
    // Per person, matching every board on the site. Grouping on the name gave
    // the piece two form lines for one player who had changed it.
    .groupBy(IDENTITY_KEY)
    .orderBy(desc(sql`count(*)`));

  const lines: string[] = [];
  lines.push(
    `THE SEASON SO FAR: ${season.nights} nights of play from ${season.firstNight} ` +
      `to ${season.lastNight}, ${totals.matchCount} matches, ${totals.playerCount} ` +
      `players. Tonight is ${archiveDay}, the most recent of them.`,
  );
  lines.push(`On tonight: ${tonight.map((row) => row.name).join(", ")}.`);
  lines.push("");

  /*
   * The background, before the numbers rather than after them.
   *
   * It is what the numbers have to be read through: the pairing record is
   * mostly a record of deliberate balancing, and a column that does not know
   * that reads it as a series of accidents. Handed over first for the same
   * reason the superlatives are precomputed, which is that a model given the
   * rows and left to infer the reason infers the obvious one.
   */
  const lore = loreFor(form.map((row) => row.name));
  if (lore) {
    lines.push(lore);
    lines.push("");
  }

  lines.push("How each player has gone across the season:");
  for (const row of form) {
    lines.push(`  ${row.name}: ${row.played} matches, ${row.won} won.`);
  }
  lines.push("");

  lines.push("Who has played on the same side, most together first:");
  for (const pair of pairings.partnerships) {
    const rate =
      pair.winRate === null
        ? `no win rate: fewer than ${MIN_MATCHES_FOR_PAIR_RATE} decided matches together, so there is not one to give`
        : `${Math.round(pair.winRate * 100)}% of decided matches won`;
    const arc = historyFor(pair.a, pair.b);
    const when = arc
      ? arc.first === arc.last
        ? ` Only ever on ${arc.first}.`
        : ` First on ${arc.first}, most recently ${arc.last}.` +
          (arc.first === archiveDay ? " That is tonight, so this pairing is brand new." : "")
      : "";
    const tonightsFirst =
      arc && arc.first === archiveDay ? "" : arc && arc.last === archiveDay ? " Together again tonight." : "";
    lines.push(
      `  ${pair.a} and ${pair.b}: ${pair.matches} together, ${pair.wins} won, ` +
        `${pair.losses} lost. ${rate}.${when}${tonightsFirst}`,
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

  /*
   * The superlatives, worked out here rather than left to be read off a list.
   *
   * The first season piece said one pair had faced each other "more than any
   * other opponent on the board" when a second pair was level on the same
   * number. That is the exact failure the night column already solved: reading
   * down a table for the largest value is what models get wrong, and they get it
   * wrong confidently. A tie is not a lead, and saying it is reads as
   * authoritative while being false.
   */
  const most = <T extends { matches: number }>(list: T[], label: (item: T) => string) => {
    if (list.length === 0) return null;
    const best = list.reduce((a, b) => (b.matches > a.matches ? b : a));
    const tied = list.filter((item) => item.matches === best.matches);
    return tied.length > 1
      ? `${tied.map(label).join(", and ")}, all level on ${best.matches}. No single pair leads this.`
      : `${label(best)}, on ${best.matches}.`;
  };

  lines.push("");
  lines.push("WHO LEADS WHAT. Only call something the most if it is stated here:");
  const pairLabel = (pair: { a: string; b: string }) => `${pair.a} and ${pair.b}`;
  lines.push(
    `  Most often on the same side: ${most(pairings.partnerships, pairLabel) ?? "nothing yet"}`,
  );
  lines.push(
    `  Most often against each other: ${most(pairings.rivalries, pairLabel) ?? "nothing yet"}`,
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
 * How many times he is asked to fix his own work before it is abandoned.
 *
 * Three, because the free checks make a rewrite cheap to judge and most
 * corrections land on the first attempt. Past that it is not converging and more
 * requests spend an allowance that the reports and the column want.
 */
const MAX_ATTEMPTS = 3;

/**
 * Writes the piece, verifies it, and rewrites until it passes or gives up.
 *
 * The order is the design.
 *
 *   1. Write.
 *   2. Free checks: invented numbers, superlatives on a tie. Instant, costs
 *      nothing, and where they fire they are certain rather than probable.
 *   3. The model check, for what only judgement can catch.
 *   4. Hand back exactly what was wrong and ask again, up to three times.
 *
 * Running the free checks first is not only about cost. A model asked to scan a
 * table for the largest value gets it wrong, which is how the error arrived; a
 * model asked to check that scan can get it wrong the same way. Where arithmetic
 * can decide, arithmetic decides.
 *
 * **This fails closed, unlike the reports and the column.** Those publish when
 * the checker cannot run, because withholding every article whenever an
 * allowance is exhausted trades a rare small error for frequent total silence.
 * That reasoning does not carry here. A missing opinion column costs nothing:
 * there is no record it is the only copy of, and nobody is waiting for it. A
 * wrong one costs the thing the whole site is for. So an unverified piece is not
 * published.
 */
export async function writeOpinion(facts: OpinionFacts): Promise<OpinionColumn | null> {
  let note = "";

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const raw = await generate(SYSTEM, note ? `${facts.prompt}

${note}` : facts.prompt);
    if (!raw) return null;

    const piece = split(raw);
    if (!piece) {
      note = "Your previous reply was not in the required shape. The first line must be a headline on its own, then a blank line, then the column.";
      continue;
    }

    const free = verifyDraft(facts.prompt, piece.body);
    if (!free.ok) {
      console.warn(
        `[ai] ${COLUMNIST_NAME} attempt ${attempt}: ${free.problems
          .map((problem) => problem.problem)
          .join(" ")}`,
      );
      note = verifyNote(free.problems);
      continue;
    }

    const checked = await checkClaims(facts.prompt, piece.body);
    if (checked.ok) {
      // Failing closed means an unrun check is not a pass. Everything else here
      // publishes on a check that could not run; this does not.
      if (!checked.ran) {
        console.warn(
          `[ai] ${COLUMNIST_NAME}: fact check could not run, so nothing is published.`,
        );
        return null;
      }
      return piece;
    }

    note = repairNote(checked.problems);
  }

  console.warn(
    `[ai] ${COLUMNIST_NAME}: ${MAX_ATTEMPTS} attempts did not verify, so nothing is published.`,
  );
  return null;
}
