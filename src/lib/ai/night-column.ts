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
import { matchCaptures, matchPlayers, matches } from "@/lib/db/schema";
import { MATCH_COMPLETED, SOUND_SHOOTING, TOOK_PART } from "@/lib/matches/queries";
import { checkClaims, repairNote } from "./fact-check";
import { generate } from "./generate";
import type { PickableMatch, Team } from "./match-pick";

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
- Only call something a high, a best, a most, a lead or a session high if the
  "who led what" list says so. Do not work it out yourself by comparing rows.
- If you describe what a player did and they have any captures, say how many.
  Listing one player's captures while leaving out another's reads as though the
  second player did not score, which is worse than mentioning neither.
- Never guess a player's gender. Use they and them for everyone, without
  exception, however the name reads to you. Never write he, she, his or her
  about a player.
- Refer to players exactly by the names given, including odd capitalisation.
- The players listed are everyone who played. Never mention spectators, and
  never name anybody not in the lists given. Do not point out that a player
  finished with zero captures or zero frags: naming somebody only to say they
  did nothing is not worth a reader's time and reads as a slight.
- Write about people, not colours. Red and blue are shirt colours that get
  reshuffled between matches, so "red pushed hard" says almost nothing while
  "Romek and ED ASSMASTER pushed hard" says who did it. Name the players who did
  a thing wherever the data lets you, and check the "who the sides were" list
  before calling either colour a team at all.
- Do not use em dashes.
- No headings, no bullet points, no markdown. Plain paragraphs.
- Four to six paragraphs. Stop when you have said what there is to say.
- Matches run about ten minutes. Judge early and late against that, not against
  the clock reading. A goal at 3:51 is not an early lead.

First line of your reply must be a headline on its own, under 70 characters,
with no quotes and no trailing full stop. Then a blank line. Then the column.

The headline must not contain a date in any form. The facts below open with the
date and a model given them will copy it in, which produces headlines like "Red
dominated early on 2026-07-29". Every page that shows a headline shows the date
beside it already, so it is wasted characters and it reads like a filename.`;

function clock(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export type NightFacts = {
  archiveDay: string;
  matchCount: number;
  prompt: string;

  /**
   * The shape of the night, separately from the prose prompt.
   *
   * The illustration needs the same facts but not the same wall of text, and
   * pulling them out here means it does not re-query a night that has just been
   * read in full. `matches` is what `match-pick.ts` reads to choose which match
   * and which moment the picture is about.
   */
  maps: string[];
  redWins: number;
  blueWins: number;
  matches: PickableMatch[];
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
    /*
     * Completed matches only, and `final` does not mean completed.
     *
     * The server labels an abandoned start `final` exactly like a game that ran
     * its full ten minutes, so a match cancelled after thirty seconds reached a
     * column and was written about as a real nil nil result. Duration is the
     * only thing that separates them: every completed match on record ran 600
     * seconds or more, and the cancelled one ran 30.
     *
     * Filtered at the source rather than described to the writer as suspect. A
     * cancelled match is not a match that went badly, it is an event that did
     * not happen, and there is nothing true to say about it.
     *
     * The condition was written out here before `MATCH_COMPLETED` existed. It is
     * the shared one now, so the column and the pages it links to cannot come to
     * different views of which matches happened.
     */
    .where(
      and(
        eq(matches.archiveDay, archiveDay),
        eq(matches.status, "final"),
        MATCH_COMPLETED,
      ),
    )
    .orderBy(asc(matches.startedAt));

  if (rows.length === 0) return null;

  // Totals for the night, per player, across every match they appeared in.
  //
  // The matches above were filtered and these totals were not, so the writer was
  // handed a frag count for the night that the night's own page no longer
  // agreed with. A column quoting a total nobody can find on the scoreboard
  // beside it is worse than one that says less.
  const totals = await db
    .select({
      name: sql<string>`min(${matchPlayers.name})`,
      matches: sql<number>`count(distinct ${matchPlayers.matchId})::int`,
      kills: sql<number>`coalesce(sum(${matchPlayers.kills}), 0)::int`,
      deaths: sql<number>`coalesce(sum(${matchPlayers.deaths}), 0)::int`,
      caps: sql<number>`coalesce(sum(${matchPlayers.caps}), 0)::int`,
      score: sql<number>`coalesce(sum(${matchPlayers.score}), 0)::int`,
      // Sound matches only. A rail match where the hit counter runs away would
      // otherwise hand the column an accuracy over 100% as a fact, and the one
      // thing a fact checker cannot catch is a false figure it was given as
      // ground truth.
      hit: sql<number>`coalesce(sum(${matchPlayers.shotsHit}) filter (where ${SOUND_SHOOTING}), 0)::float8`,
      fired: sql<number>`coalesce(sum(${matchPlayers.shotsFired}) filter (where ${SOUND_SHOOTING}), 0)::float8`,
      bestStreak: sql<number>`coalesce(max(${matchPlayers.maxStreak}), 0)::int`,
      returns: sql<number>`coalesce(sum(${matchPlayers.flagReturns}), 0)::int`,
    })
    .from(matchPlayers)
    .innerJoin(matches, eq(matches.id, matchPlayers.matchId))
    .where(and(eq(matches.archiveDay, archiveDay), TOOK_PART, MATCH_COMPLETED))
    .groupBy(sql`lower(${matchPlayers.name})`)
    .orderBy(sql`coalesce(sum(${matchPlayers.score}), 0) desc`);

  /*
   * Squad sizes and capture order per match, for the illustration.
   *
   * Read here rather than in the image code so a night is queried once. Both are
   * facts the picture depends on being right: the number of figures a side, and
   * whose flag was moving.
   */
  const squadRows = await db
    .select({
      matchId: matchPlayers.matchId,
      team: matchPlayers.team,
      count: sql<number>`count(distinct lower(${matchPlayers.name}))::int`,
      names: sql<string[]>`array_agg(distinct ${matchPlayers.name} order by ${matchPlayers.name})`,
    })
    .from(matchPlayers)
    .innerJoin(matches, eq(matches.id, matchPlayers.matchId))
    .where(and(eq(matches.archiveDay, archiveDay), TOOK_PART, MATCH_COMPLETED))
    .groupBy(matchPlayers.matchId, matchPlayers.team);

  const squads = new Map<
    string,
    { red: number; blue: number; redNames: string[]; blueNames: string[] }
  >();
  for (const row of squadRows) {
    const entry = squads.get(row.matchId) ?? {
      red: 0,
      blue: 0,
      redNames: [],
      blueNames: [],
    };
    if (row.team === "red") {
      entry.red = row.count;
      entry.redNames = row.names ?? [];
    } else if (row.team === "blue") {
      entry.blue = row.count;
      entry.blueNames = row.names ?? [];
    }
    squads.set(row.matchId, entry);
  }

  const captureList = await db
    .select({
      matchId: matchCaptures.matchId,
      team: matchCaptures.team,
      elapsedSeconds: matchCaptures.elapsedSeconds,
    })
    .from(matchCaptures)
    .innerJoin(matches, eq(matches.id, matchCaptures.matchId))
    .where(eq(matches.archiveDay, archiveDay))
    // By when they happened, not by the match clock, which restarts in
    // overtime. See CAPTURE_ORDER in queries.ts.
    .orderBy(asc(matchCaptures.observedAt), asc(matchCaptures.elapsedSeconds));

  const captureRows = new Map<string, typeof captureList>();
  for (const row of captureList) {
    const list = captureRows.get(row.matchId) ?? [];
    list.push(row);
    captureRows.set(row.matchId, list);
  }

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
    // Who was actually on each side. Red and blue are shirt colours here, not
    // teams, and the line-ups say so match by match.
    const squad = squads.get(match.id);
    if (squad) {
      lines.push(
        `  Red: ${squad.redNames.join(", ") || "nobody recorded"}. ` +
          `Blue: ${squad.blueNames.join(", ") || "nobody recorded"}.`,
      );
    }
    if (match.report) {
      lines.push(`  What happened: ${match.report.replace(/\s+/g, " ").trim()}`);
    }
    lines.push("");
  }

  /*
   * Whether each side stayed the same, which changes what can honestly be said.
   *
   * Players mix around between matches, and the two sides do not necessarily mix
   * to the same degree. On one night red was the same pair from first match to
   * last while blue rotated through three different pairings, so "red set the
   * pace" was fair and "blue found their footing" described a group that never
   * existed. An all or nothing flag would have lost that, so each side is
   * reported separately and by name.
   */
  const rosterOf = (names: string[]) =>
    [...names].map((name) => name.toLowerCase()).sort().join("|");

  const squadList = rows
    .map((match) => squads.get(match.id))
    .filter((squad): squad is NonNullable<typeof squad> => Boolean(squad));

  const redStable = new Set(squadList.map((s) => rosterOf(s.redNames))).size === 1;
  const blueStable = new Set(squadList.map((s) => rosterOf(s.blueNames))).size === 1;

  lines.push("");
  lines.push("Who the sides were:");

  for (const [colour, stable, names] of [
    ["Red", redStable, squadList[0]?.redNames ?? []],
    ["Blue", blueStable, squadList[0]?.blueNames ?? []],
  ] as const) {
    lines.push(
      stable
        ? `  ${colour} was the same players in every match: ${names.join(", ")}. ` +
            `You may talk about ${colour.toLowerCase()} as a team.`
        : `  ${colour} was not the same players from match to match. Do not talk ` +
            `about ${colour.toLowerCase()} as a team with a run of form, and do not ` +
            `total up its wins as though one group won them. Name the people instead.`,
    );
  }
  lines.push("");

  lines.push("Player totals across the whole night:");
  for (const p of totals) {
    const accuracy = p.fired > 0 ? `${((p.hit / p.fired) * 100).toFixed(1)}%` : "n/a";
    lines.push(
      `  ${p.name}: played ${p.matches}, ${p.kills} frags, ${p.deaths} deaths, ` +
        `${p.caps} captures, ${p.score} total score, ${accuracy} accuracy, ` +
        `best streak ${p.bestStreak}, ${p.returns} flag returns`,
    );
  }

  /*
   * Who actually led what, worked out here rather than left to the model.
   *
   * Reading down a table to find the largest number is the thing models get
   * wrong, and they get it wrong confidently. A column once called 19.2 percent
   * the session high while another player sat on 19.4, from a prompt that listed
   * both. The arithmetic is trivial for us and unreliable for them, so we do it
   * and hand over the answer, exactly as `phase()` does for match timings in
   * match-report.ts.
   */
  const leaderOf = (
    label: string,
    value: (row: (typeof totals)[number]) => number,
    format: (row: (typeof totals)[number]) => string,
  ) => {
    const best = totals.reduce((a, b) => (value(b) > value(a) ? b : a));
    // A tie is not a lead. Saying one of two equal players "led" is false, and it
    // is the kind of false that reads as authoritative.
    const tied = totals.filter((row) => value(row) === value(best));
    return tied.length > 1
      ? `  ${label}: tied between ${tied.map((row) => row.name).join(" and ")} on ${format(best)}`
      : `  ${label}: ${best.name} with ${format(best)}`;
  };

  if (totals.length > 0) {
    lines.push("");
    lines.push(
      "Who led what tonight. These are the only superlatives you may use. Do not",
      "call anything a high, a best, a most or a lead unless it appears here:",
    );
    lines.push(leaderOf("most frags", (p) => p.kills, (p) => `${p.kills}`));
    lines.push(leaderOf("highest total score", (p) => p.score, (p) => `${p.score}`));
    lines.push(leaderOf("most captures", (p) => p.caps, (p) => `${p.caps}`));
    lines.push(leaderOf("longest streak", (p) => p.bestStreak, (p) => `${p.bestStreak}`));
    lines.push(leaderOf("most deaths", (p) => p.deaths, (p) => `${p.deaths}`));
    lines.push(leaderOf("most flag returns", (p) => p.returns, (p) => `${p.returns}`));
    lines.push(
      leaderOf(
        "best accuracy",
        (p) => (p.fired > 0 ? p.hit / p.fired : 0),
        (p) => (p.fired > 0 ? `${((p.hit / p.fired) * 100).toFixed(1)}%` : "n/a"),
      ),
    );
  }

  const first = rows[0]?.startedAt;
  const last = rows[rows.length - 1]?.endedAt ?? rows[rows.length - 1]?.startedAt;
  if (first && last) {
    const minutes = Math.round((last.getTime() - first.getTime()) / 60000);
    lines.push("");
    lines.push(`The session ran about ${minutes} minutes from first to last match.`);
  }

  return {
    archiveDay,
    matchCount: rows.length,
    prompt: lines.join("\n"),
    // Duplicate map names are kept out: a night that ran Huna twice is one
    // visual hook, not two.
    maps: [...new Set(rows.map((match) => match.mapName))],
    redWins: rows.filter((match) => match.winner === "red").length,
    blueWins: rows.filter((match) => match.winner === "blue").length,
    matches: rows.map((match) => ({
      sourceMatchId: match.sourceMatchId,
      mapName: match.mapName,
      redScore: match.redScore,
      blueScore: match.blueScore,
      winner: match.winner === "red" || match.winner === "blue" ? match.winner : null,
      overtime: Boolean(match.overtime),
      redPlayers: squads.get(match.id)?.red ?? 0,
      bluePlayers: squads.get(match.id)?.blue ?? 0,
      captures: (captureRows.get(match.id) ?? []).map((capture) => ({
        team: capture.team as Team,
        elapsedSeconds: capture.elapsedSeconds,
      })),
    })),
  };
}

export type WrittenColumn = { headline: string; body: string };

/** Splits the reply into a headline and a body, or null if it ignored the shape. */
function parseColumn(text: string): WrittenColumn | null {
  const [first, ...rest] = text.split("\n");
  const headline = first.replace(/^#+\s*/, "").replace(/^["']|["'.]$/g, "").trim();
  const body = rest.join("\n").trim();

  // A reply that did not follow the shape is not worth storing half of.
  if (!headline || headline.length > 120 || !body) return null;

  return { headline, body };
}

/**
 * Writes the column, or returns null if generation is off or failed.
 *
 * Written, then checked against the same facts, then rewritten once if the check
 * found anything. A column that is still wrong after the repair is discarded
 * rather than published: the next sync tries again, and a night with no write-up
 * is a page with one less article, while a night with a wrong write-up is a
 * broken promise about what this archive is for.
 */
export async function writeNightColumn(
  facts: NightFacts,
): Promise<WrittenColumn | null> {
  const text = await generate(SYSTEM, facts.prompt);
  if (!text) return null;

  const draft = parseColumn(text);
  if (!draft) return null;

  const check = await checkClaims(facts.prompt, `${draft.headline}\n\n${draft.body}`);
  if (check.ok) return draft;

  console.warn(
    `[ai] column for ${facts.archiveDay} failed the fact check, rewriting: ` +
      check.problems.map((p) => p.problem).join(" | ").slice(0, 300),
  );

  const repaired = await generate(
    SYSTEM,
    `${facts.prompt}\n\n${repairNote(check.problems)}`,
  );
  if (!repaired) return null;

  const second = parseColumn(repaired);
  if (!second) return null;

  const recheck = await checkClaims(
    facts.prompt,
    `${second.headline}\n\n${second.body}`,
  );
  if (recheck.ok) return second;

  console.warn(
    `[ai] column for ${facts.archiveDay} still wrong after a rewrite, discarding: ` +
      recheck.problems.map((p) => p.problem).join(" | ").slice(0, 300),
  );
  return null;
}

/** Exported for the column page, which shows the clock alongside captures. */
export { clock };
