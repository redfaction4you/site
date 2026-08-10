import { and, eq, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { featurePieces, matchPlayers, matches } from "@/lib/db/schema";
import { DISPLAY_NAME, IDENTITY_KEY } from "@/lib/matches/identities";
import { MATCH_COMPLETED, TOOK_PART, getMatch } from "@/lib/matches/queries";
import { accuracyOf, accuracyPercent } from "@/lib/matches/accuracy";
import { checkClaims } from "./fact-check";
import { scoreboardComplaint } from "./prose-density";
import { generate } from "./generate";
import { COLUMNIST_NAME } from "./opinion";
import { loreFor } from "./lore";

/**
 * A feature: one subject, every match of it, in detail.
 *
 * The nightly column reports an evening and moves on. When something people
 * had been asking about for weeks finally happened — two players who had spent
 * twenty-four matches on opposite sides put on the same one — an evening
 * report gave it a paragraph, which is the right weight for a night and the
 * wrong weight for the thing itself.
 *
 * So this is built from a different fact sheet: not season totals and pairing
 * rates, but the matches themselves. Every scoreboard line, every capture with
 * the clock on it, what the flags did. A piece can only be as detailed as what
 * it is handed, and "be more detailed" is not an instruction a model can
 * follow without more facts.
 *
 * Written on request. Nothing schedules these, because deciding a subject
 * deserves a feature is a judgement, and the model does not make it.
 */

/*
 * Rewritten on 10 August, because it was asking for the wrong thing.
 *
 * It used to say "walk through the matches, name the maps, the scores, who did
 * what in each one", and it got exactly that: a feature about two players
 * finally sharing a side after twenty-four matches as opponents came back with
 * two paragraphs reading out both scoreboards, every player, both teams. The
 * reader's verdict was that it "loses its entire plot", and they were right —
 * the plot was in the first paragraph and never came back.
 *
 * The match page already does chronology, and does it better, with a table and
 * a timeline. What only a column can do is say what it makes of the thing. So
 * the instruction is inverted: the argument is the job, the figures are
 * evidence for it, and anything the reader could get by clicking the match is
 * not worth spending a paragraph on.
 *
 * `prose-density.ts` is the check, because an instruction not to recite is
 * exactly the kind a model agrees with and then ignores.
 */
const SYSTEM = `You are ${COLUMNIST_NAME}, a sports analyst who covers a Red Faction
Capture the Flag server. You are writing a FEATURE: one subject, argued
properly, from the match record below.

WHAT THIS IS. A feature is not a longer match report. The match pages already
carry every scoreboard, every capture and a timeline, and a reader is one click
from all of it. Your job is the thing none of that can do: say what you make of
this subject, and defend it.

- Four to six paragraphs. Lead with the point, not the chronology.
- **Do not recite scoreboards.** Never list what several players scored. Never
  walk a match capture by capture. If you find yourself writing "X finished
  with N frags and N deaths" for player after player, you have stopped writing
  the piece.
- Numbers are evidence, so use few and make each one earn its place. A figure
  is worth quoting when it is surprising, when it is somebody's best or worst,
  or when it is set against what they normally do. The record below gives you
  each player's usual, so prefer "twice what they manage in an ordinary match"
  to the raw total.
- Keep hold of the subject. If the piece is about two players finally sharing a
  side, every paragraph should be about that, including the ones that describe
  a match. A paragraph that would read the same in any other article is a
  paragraph to cut.
- Judgement is the job, and hedged judgement is not judgement. Say whether it
  worked, whether it should happen again, what it looked like. You may say the
  sample is too small to be sure, and then say what you think anyway.
- Only what is below. Every figure in your piece must appear in the record.
  Never invent a moment, a save, a call or a conversation, and never claim to
  have watched anything: you have the scoreboards and the event log.
- Where the record cannot answer something, say so plainly or leave it out.
  "The log does not say who returned it" is a real sentence; guessing is not.
  Do not make a paragraph out of what the log does not say.
- Never guess a player's gender. Use they and them for everyone, without
  exception, however the name reads to you. Never write he, she, his or her.
- Refer to players exactly by the names given, including odd capitalisation.
- Do not use em dashes.
- No headings, no bullet points, no markdown. Plain paragraphs.

First line of your reply must be a headline on its own, under 70 characters, no
quotes, no trailing full stop, and no date in any form.
Second line must be a single sentence standfirst, under 140 characters, saying
what the piece argues.
Then a blank line, then the piece.`;

/**
 * What a feature can be about.
 *
 * Started as "two players who finally shared a side" and generalised the same
 * day: the interesting thing is rarely the same shape twice. A match that was
 * better than the scoreline suggests, somebody's best night, a rivalry that
 * keeps producing one-goal games. Each kind knows how to build its own fact
 * sheet, and everything downstream — the writer, the fact check, the page — is
 * shared, so a new kind is a builder and nothing else.
 */
export type FeatureSubject =
  | { kind: "pairing"; a: string; b: string }
  | { kind: "rivalry"; a: string; b: string }
  | { kind: "match"; archiveDay: string; sourceMatchId: number }
  | { kind: "player"; name: string };

export type FeatureFacts = {
  kind: FeatureSubject["kind"];
  subjects: string[];
  matchRefs: string[];
  prompt: string;
};

function clock(seconds: number | null | undefined): string {
  if (seconds == null) return "unknown time";
  const whole = Math.max(0, Math.round(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

/** Which side each of two people was on, per match they were both in. */
type Sides = Map<string, { winner: string | null; teams: Map<string, string> }>;

/**
 * Where two people stood in every match they were both in.
 *
 * One query answering both questions a pair of players raises — when were they
 * together, when were they against each other — because they are the same
 * question read two ways. It was written out twice, once in `matchesTogether`
 * and once inside the pairing fact sheet to count how often they had been
 * opponents, and the rivalry piece would have made three.
 *
 * Through identity, so somebody who has played under four names is one person,
 * and only matches that counted: a feature built partly on an abandoned start
 * would be describing a game the rest of the site says did not happen.
 */
async function sidesByMatch(a: string, b: string): Promise<Sides> {
  const rows = await db
    .select({
      archiveDay: matches.archiveDay,
      sourceMatchId: matches.sourceMatchId,
      winner: matches.winner,
      team: matchPlayers.team,
      person: DISPLAY_NAME,
    })
    .from(matchPlayers)
    .innerJoin(matches, eq(matches.id, matchPlayers.matchId))
    .where(and(TOOK_PART, MATCH_COMPLETED, eq(matches.status, "final")))
    .groupBy(
      matches.archiveDay,
      matches.sourceMatchId,
      matches.winner,
      matchPlayers.team,
      IDENTITY_KEY,
    );

  const wanted = new Set([a.toLowerCase(), b.toLowerCase()]);
  const sides: Sides = new Map();
  for (const row of rows) {
    if (!wanted.has(row.person.toLowerCase())) continue;
    const key = `${row.archiveDay}/${row.sourceMatchId}`;
    if (!sides.has(key)) sides.set(key, { winner: row.winner, teams: new Map() });
    sides.get(key)!.teams.set(row.person.toLowerCase(), row.team);
  }

  // Both of them, or it answers neither question.
  for (const [key, entry] of sides) {
    if (entry.teams.size !== 2) sides.delete(key);
  }
  return sides;
}

/** The matches where they shared a side, oldest first. */
function together(sides: Sides): string[] {
  return [...sides.entries()]
    .filter(([, entry]) => new Set(entry.teams.values()).size === 1)
    .map(([key]) => key)
    .sort();
}

/** The matches where they were on opposite sides, oldest first. */
function opposed(sides: Sides): string[] {
  return [...sides.entries()]
    .filter(([, entry]) => new Set(entry.teams.values()).size === 2)
    .map(([key]) => key)
    .sort();
}

/**
 * What each of these people does in an ordinary match.
 *
 * The missing half of a feature. Handed a scoreboard and nothing else, the only
 * true sentence a writer can build is the scoreboard back again — "Medeo held
 * the flag for 133 seconds" is a fact about nothing until you know that Medeo
 * usually holds it for forty. With the baseline beside it the same figure
 * becomes an observation, which is what the piece is for.
 *
 * Career averages across every completed match, grouped by identity, so
 * somebody who has played under four names has one baseline.
 */
async function baselinesFor(names: string[]): Promise<string[]> {
  const wanted = new Set(names.map((name) => name.toLowerCase()));

  const rows = await db
    .select({
      person: DISPLAY_NAME,
      matches: sql<number>`count(distinct ${matches.id})::int`,
      kills: sql<number>`avg(${matchPlayers.kills})::float8`,
      deaths: sql<number>`avg(${matchPlayers.deaths})::float8`,
      caps: sql<number>`avg(${matchPlayers.caps})::float8`,
      hold: sql<number>`avg(${matchPlayers.flagHoldMs})::float8`,
      streak: sql<number>`max(${matchPlayers.maxStreak})::int`,
    })
    .from(matchPlayers)
    .innerJoin(matches, eq(matches.id, matchPlayers.matchId))
    .where(and(TOOK_PART, MATCH_COMPLETED, eq(matches.status, "final")))
    .groupBy(IDENTITY_KEY);

  return rows
    .filter((row) => wanted.has(row.person.toLowerCase()))
    .map(
      (row) =>
        `  ${row.person}, across ${row.matches} matches, averages ` +
        `${row.kills.toFixed(1)} frags, ${row.deaths.toFixed(1)} deaths, ` +
        `${row.caps.toFixed(1)} captures and ${Math.round(row.hold / 1000)}s ` +
        `holding the flag per match; best streak ever ${row.streak}.`,
    );
}

/**
 * One match written out in full, appended to a fact sheet.
 *
 * The scoreboard and every capture with the clock on it. Shared by the kinds
 * that walk through several matches, so a piece about a partnership and a piece
 * about a rivalry are handed the same depth of record and cannot come to
 * describe the same match differently.
 */
async function appendMatch(
  lines: string[],
  ref: string,
  /** Whose match this is. Given, everyone else collapses to one line. */
  focus?: string[],
): Promise<void> {
  const [archiveDay, sourceMatchId] = ref.split("/");
  const match = await getMatch(archiveDay, Number(sourceMatchId));
  if (!match) return;

  lines.push("");
  lines.push(
    `MATCH ${sourceMatchId} on ${archiveDay}, ${match.mapName}, ` +
      `${match.mode}. Final score red ${match.redScore}, blue ${match.blueScore}` +
      `${match.winner ? `, ${match.winner} won` : ", no recorded winner"}` +
      `${match.overtime ? ", went to overtime" : ""}.`,
  );

  const played = match.players.filter((player) => player.team !== "spectator");
  const line = (player: (typeof played)[number]) => {
    const accuracy = accuracyOf(player.shotsHit, player.shotsFired);
    return (
      `${player.name} (${player.team}): ${player.kills} frags, ` +
      `${player.deaths} deaths, ${player.caps} captures, ` +
      `best streak ${player.maxStreak}, ` +
      `${accuracy === null ? "accuracy not sound" : `${accuracyPercent(accuracy)} accuracy`}, ` +
      `${Math.round(player.flagHoldMs / 1000)}s holding the flag, ` +
      `${player.flagPickups} flag pickups, ${player.flagReturns} returns.`
    );
  };

  /*
   * Only the people the piece is about, when the piece is about people.
   *
   * The sheet used to carry every player's full line and every capture with the
   * clock on it, for every match, and the writer did the obvious thing with it:
   * read it back. A reader called the result a play by play and said the piece
   * lost its plot. It was not disobedience — that is what the material was.
   *
   * So a piece walking several matches gets its subjects' lines, the shape of
   * the result, and who else mattered in one sentence. It cannot recite a
   * scoreboard it was never given, and the match page carries the full one for
   * anybody who wants it. `buildMatchFacts` passes no focus and still gets
   * everything, because that kind is explicitly about one match in full.
   */
  const focused = focus?.length
    ? played.filter((player) => focus.some((name) => name.toLowerCase() === player.name.toLowerCase()))
    : null;

  if (focused && focused.length > 0) {
    lines.push("  The subjects in this match:");
    for (const player of focused) lines.push(`    ${line(player)}`);

    const others = played.filter((player) => !focused.includes(player));
    const best = others.reduce<(typeof played)[number] | null>(
      (top, player) => (!top || player.score > top.score ? player : top),
      null,
    );
    if (best) {
      lines.push(
        `  Everyone else, in one line: ${others.length} other players, ` +
          `best of them ${best.name} (${best.team}) on ${best.score} points, ` +
          `${best.kills} frags. Do not list the rest; the match page has them.`,
      );
    }

    // Who scored, not when. A list of clock times is a play by play waiting to
    // be transcribed, and the counts carry the same fact about the match.
    const byPlayer = new Map<string, number>();
    for (const capture of match.captures) {
      const who = capture.playerName ?? "unknown";
      byPlayer.set(who, (byPlayer.get(who) ?? 0) + 1);
    }
    lines.push(
      byPlayer.size
        ? `  Captures by: ${[...byPlayer.entries()]
            .sort((x, y) => y[1] - x[1])
            .map(([who, n]) => `${who} ${n}`)
            .join(", ")}.`
        : "  No captures recorded in this match.",
    );
    return;
  }

  lines.push("  Scoreboard:");
  for (const player of played) lines.push(`    ${line(player)}`);

  if (match.captures.length) {
    lines.push("  Captures, in order:");
    for (const capture of match.captures) {
      const assists =
        Array.isArray(capture.assists) && capture.assists.length
          ? ` Carried on the way by ${capture.assists.join(", ")}.`
          : "";
      lines.push(
        `    ${clock(capture.elapsedSeconds)} ${capture.playerName ?? "unknown"} ` +
          `capped for ${capture.team}, making it ${capture.redScore}-${capture.blueScore}.${assists}`,
      );
    }
  } else {
    lines.push("  No captures recorded in this match.");
  }
}

/**
 * The fact sheet: the matches themselves, at full detail.
 *
 * Deliberately unlike the opinion's. That one is a season summary because a
 * column is about a night in the context of a season; this is about specific
 * games, so it carries their scoreboards and their flag events and no season
 * rates at all.
 */
async function buildPairingFacts(a: string, b: string): Promise<FeatureFacts | null> {
  const sides = await sidesByMatch(a, b);
  const refs = together(sides);
  if (refs.length === 0) return null;

  const lines: string[] = [];
  lines.push(
    `SUBJECT: every match ${a} and ${b} have played on the same side. ` +
      `There are ${refs.length}.`,
  );

  // What they had been before this: opponents, and how many times.
  lines.push(
    `Before any of this they had been opponents ${opposed(sides).length} times.`,
  );

  const lore = loreFor([a, b]);
  if (lore) {
    lines.push("");
    lines.push("WHO THEY ARE:");
    lines.push(lore);
  }

  const baselines = await baselinesFor([a, b]);
  if (baselines.length) {
    lines.push("");
    lines.push("WHAT THEY NORMALLY DO, so a figure below can be measured against it:");
    lines.push(...baselines);
  }

  for (const ref of refs) await appendMatch(lines, ref, [a, b]);

  lines.push("");
  lines.push(
    "Write the feature. The subject is the partnership, not the matches: the " +
      "matches are evidence for what you make of it. Say whether it worked and " +
      "whether it should happen again. Do not walk through either game in " +
      "order, and do not read out a scoreboard — the match pages have those, " +
      "and a reader is one click away. Every figure you use must come from " +
      "what is above.",
  );

  return {
    kind: "pairing",
    subjects: [a, b],
    matchRefs: refs,
    prompt: lines.join("\n"),
  };
}

/**
 * Two players across every match they have played against each other.
 *
 * The mirror of the pairing piece, and the one the archive has far more of:
 * people share a side because a shuffle put them there, and spend most of their
 * evenings opposite each other. The record it is built on is the head to head —
 * who won when they were on opposite sides — which is a real fact about two
 * people in a way that a pairing win rate from three matches is not.
 *
 * **It is a record, not a rating.** Nothing here claims either of them is
 * better; a CTF match is won by a side of several people and the scoreline
 * belongs to the team. The instruction at the bottom says so, because the
 * temptation to read "5-2 up" as "the stronger player" is exactly what a model
 * will do unprompted.
 */
async function buildRivalryFacts(a: string, b: string): Promise<FeatureFacts | null> {
  const sides = await sidesByMatch(a, b);
  const refs = opposed(sides);
  if (refs.length === 0) return null;

  /*
   * Counted from the side each was on and the match's own winner, so a match
   * with no recorded winner is a third outcome rather than silently a loss.
   */
  let aWins = 0;
  let bWins = 0;
  let undecided = 0;
  for (const ref of refs) {
    const entry = sides.get(ref)!;
    const aTeam = entry.teams.get(a.toLowerCase());
    const bTeam = entry.teams.get(b.toLowerCase());
    if (!entry.winner) undecided++;
    else if (entry.winner === aTeam) aWins++;
    else if (entry.winner === bTeam) bWins++;
    else undecided++;
  }

  const lines: string[] = [];
  lines.push(
    `SUBJECT: every match ${a} and ${b} have played against each other. ` +
      `There are ${refs.length}.`,
  );
  lines.push(
    `Head to head across those matches: ${a}'s side won ${aWins}, ` +
      `${b}'s side won ${bWins}` +
      `${undecided ? `, and ${undecided} had no recorded winner` : ""}.`,
  );

  const shared = together(sides).length;
  lines.push(
    shared === 0
      ? `They have never played on the same side.`
      : `They have also shared a side ${shared} ${shared === 1 ? "time" : "times"}.`,
  );

  const lore = loreFor([a, b]);
  if (lore) {
    lines.push("");
    lines.push("WHO THEY ARE:");
    lines.push(lore);
  }

  const baselines = await baselinesFor([a, b]);
  if (baselines.length) {
    lines.push("");
    lines.push("WHAT THEY NORMALLY DO, so a figure below can be measured against it:");
    lines.push(...baselines);
  }

  for (const ref of refs) await appendMatch(lines, ref, [a, b]);

  lines.push("");
  lines.push(
    "Write the feature about the two of them as opponents: what each does to " +
      "the other, whether one of them changes how the other plays, and whether " +
      "the head to head reflects the games. Do not walk through the matches in " +
      "order and do not read out a scoreboard; the match pages have those. " +
      "Every figure you use must come from what is above. A CTF match is won " +
      "by a side rather than by a player, so do not present the head to head " +
      "as proof that either is the better player; it is the record of which " +
      "side came out ahead.",
  );

  return {
    kind: "rivalry",
    subjects: [a, b],
    matchRefs: refs,
    prompt: lines.join("\n"),
  };
}

/**
 * One match, at full depth.
 *
 * For the game that was better than its scoreline, or the one everybody
 * remembers. Same detail as a pairing piece gets per match, with room to
 * spend all of it on one.
 */
async function buildMatchFacts(
  archiveDay: string,
  sourceMatchId: number,
): Promise<FeatureFacts | null> {
  const match = await getMatch(archiveDay, sourceMatchId);
  if (!match) return null;

  const played = match.players.filter((player) => player.team !== "spectator");
  const lines: string[] = [];
  lines.push(
    `SUBJECT: one match, in full. ${match.mapName} on ${archiveDay}, ` +
      `${match.mode}, final score red ${match.redScore} blue ${match.blueScore}` +
      `${match.winner ? `, ${match.winner} won` : ", no recorded winner"}` +
      `${match.overtime ? ", and it went to overtime" : ""}.`,
  );

  const lore = loreFor(played.map((player) => player.name));
  if (lore) {
    lines.push("");
    lines.push("WHO PLAYED:");
    lines.push(lore);
  }

  lines.push("");
  lines.push("SCOREBOARD:");
  for (const player of played) {
    const accuracy = accuracyOf(player.shotsHit, player.shotsFired);
    lines.push(
      `  ${player.name} (${player.team}): ${player.kills} frags, ${player.deaths} deaths, ` +
        `${player.caps} captures, best streak ${player.maxStreak}, ` +
        `${accuracy === null ? "accuracy not sound" : `${accuracyPercent(accuracy)} accuracy`}, ` +
        `${Math.round(player.flagHoldMs / 1000)}s holding the flag, ` +
        `${player.flagPickups} pickups, ${player.flagReturns} returns.`,
    );
  }

  if (match.captures.length) {
    lines.push("");
    lines.push("CAPTURES, in order:");
    for (const capture of match.captures) {
      const assists =
        Array.isArray(capture.assists) && capture.assists.length
          ? ` Carried on the way by ${capture.assists.join(", ")}.`
          : "";
      lines.push(
        `  ${clock(capture.elapsedSeconds)} ${capture.playerName ?? "unknown"} ` +
          `capped for ${capture.team}, making it ${capture.redScore}-${capture.blueScore}.${assists}`,
      );
    }
  }

  lines.push("");
  lines.push(
    "Write the feature about this one match: how it turned, who decided it, " +
      "and what the scoreline does or does not tell you.",
  );

  return {
    kind: "match",
    subjects: played.map((player) => player.name),
    matchRefs: [`${archiveDay}/${sourceMatchId}`],
    prompt: lines.join("\n"),
  };
}

/**
 * One player, across everything they have played.
 *
 * Their record, their best nights, and the matches that made them. Built from
 * per-match rows rather than season totals, because a piece about somebody is
 * about what they did on particular evenings.
 */
async function buildPlayerFacts(name: string): Promise<FeatureFacts | null> {
  const rows = await db
    .select({
      archiveDay: matches.archiveDay,
      sourceMatchId: matches.sourceMatchId,
      mapName: matches.mapName,
      team: matchPlayers.team,
      winner: matches.winner,
      redScore: matches.redScore,
      blueScore: matches.blueScore,
      person: DISPLAY_NAME,
      kills: sql<number>`max(${matchPlayers.kills})::int`,
      deaths: sql<number>`max(${matchPlayers.deaths})::int`,
      caps: sql<number>`max(${matchPlayers.caps})::int`,
      streak: sql<number>`max(${matchPlayers.maxStreak})::int`,
      hold: sql<number>`max(${matchPlayers.flagHoldMs})::int`,
      hit: sql<number>`max(${matchPlayers.shotsHit})::float8`,
      fired: sql<number>`max(${matchPlayers.shotsFired})::float8`,
    })
    .from(matchPlayers)
    .innerJoin(matches, eq(matches.id, matchPlayers.matchId))
    .where(and(TOOK_PART, MATCH_COMPLETED, eq(matches.status, "final")))
    .groupBy(
      matches.archiveDay,
      matches.sourceMatchId,
      matches.mapName,
      matchPlayers.team,
      matches.winner,
      matches.redScore,
      matches.blueScore,
      IDENTITY_KEY,
    );

  const mine = rows
    .filter((row) => row.person.toLowerCase() === name.toLowerCase())
    .sort((a, b) => `${a.archiveDay}${a.sourceMatchId}`.localeCompare(`${b.archiveDay}${b.sourceMatchId}`));
  if (mine.length === 0) return null;

  const lines: string[] = [];
  lines.push(`SUBJECT: ${name}, across all ${mine.length} matches they have played.`);

  const lore = loreFor([name]);
  if (lore) {
    lines.push("");
    lines.push("WHO THEY ARE:");
    lines.push(lore);
  }

  const baselines = await baselinesFor([name]);
  if (baselines.length) {
    lines.push("");
    lines.push("WHAT THEY NORMALLY DO, which every match below should be read against:");
    lines.push(...baselines);
  }

  lines.push("");
  /*
   * A list to find the pattern in, not a list to reproduce.
   *
   * This one is per-match rows for one player rather than a scoreboard, so it
   * is less dangerous than the pairing sheet was, and it is the same trap: a
   * writer handed forty rows will read out forty rows. Said plainly here as
   * well as in the instructions, because the material is what actually decides
   * what comes back.
   */
  lines.push(
    "EVERY MATCH, oldest first. This is here so you can find the pattern in " +
      "it — their best nights, their worst, what changed. Do not list these " +
      "back; the player's own page already has the table.",
  );
  for (const row of mine) {
    const accuracy = accuracyOf(row.hit, row.fired);
    const result = row.winner ? (row.winner === row.team ? "won" : "lost") : "no result";
    lines.push(
      `  ${row.archiveDay} match ${row.sourceMatchId}, ${row.mapName}, ` +
        `${row.team}, ${result} ${row.redScore}-${row.blueScore}: ` +
        `${row.kills} frags, ${row.deaths} deaths, ${row.caps} captures, ` +
        `best streak ${row.streak}, ` +
        `${accuracy === null ? "accuracy not sound" : `${accuracyPercent(accuracy)} accuracy`}, ` +
        `${Math.round(row.hold / 1000)}s on the flag.`,
    );
  }

  lines.push("");
  lines.push(
    "Write the feature about this player: what they are good at, what they are " +
      "not, how they have changed, and what it is like to play with or against " +
      "them. Point at two or three matches that show it rather than working " +
      "through the list, and set a figure against their usual when you use one.",
  );

  return {
    kind: "player",
    subjects: [name],
    matchRefs: mine.map((row) => `${row.archiveDay}/${row.sourceMatchId}`),
    prompt: lines.join("\n"),
  };
}

/** Builds the fact sheet for whichever kind of subject was asked for. */
export async function buildFeatureFacts(
  subject: FeatureSubject,
): Promise<FeatureFacts | null> {
  switch (subject.kind) {
    case "pairing":
      return buildPairingFacts(subject.a, subject.b);
    case "rivalry":
      return buildRivalryFacts(subject.a, subject.b);
    case "match":
      return buildMatchFacts(subject.archiveDay, subject.sourceMatchId);
    case "player":
      return buildPlayerFacts(subject.name);
  }
}

export type FeaturePiece = {
  headline: string;
  standfirst: string;
  body: string;
  slug: string;
};

function slugify(headline: string): string {
  return headline
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70);
}

function parse(reply: string): FeaturePiece | null {
  const trimmed = reply.trim();
  const lines = trimmed.split(/\r?\n/);
  const headline = (lines[0] ?? "").trim().replace(/^["']|["']$/g, "");
  const standfirst = (lines[1] ?? "").trim().replace(/^["']|["']$/g, "");
  const body = lines.slice(2).join("\n").trim();
  if (!headline || headline.length > 90) return null;
  if (!standfirst || standfirst.length > 200) return null;
  if (body.length < 400) return null;
  return { headline, standfirst, body, slug: slugify(headline) };
}

/**
 * Writes the feature, fact checked before it is returned.
 *
 * The same gate the column goes through, for the same reason: a piece that
 * states a figure the record does not support is worse than no piece, and this
 * one states a great many more figures than a column does.
 */
export async function writeFeature(facts: FeatureFacts): Promise<FeaturePiece | null> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const reply = await generate(SYSTEM, facts.prompt);
    if (!reply) continue;

    const piece = parse(reply);
    if (!piece) continue;

    /*
     * Refused before the fact check, because it would pass one.
     *
     * A paragraph reading out a scoreboard is accurate in every particular —
     * that is why it survived to a reader, who called it a play by play and
     * said the piece lost its plot. `checkClaims` asks whether the figures are
     * true; this asks whether the piece is an article. Cheap, and it costs an
     * attempt rather than a publication.
     */
    const scoreboard = scoreboardComplaint(piece.body);
    if (scoreboard) {
      console.log(`[ai] feature attempt ${attempt} rejected: ${scoreboard}`);
      continue;
    }

    const check = await checkClaims(
      facts.prompt,
      `${piece.headline}\n\n${piece.standfirst}\n\n${piece.body}`,
    );
    if (!check.ok) {
      console.log(
        `[ai] feature attempt ${attempt} failed the fact check: ` +
          check.problems.map((problem) => `${problem.quote} — ${problem.problem}`).join("; "),
      );
      continue;
    }

    return piece;
  }
  return null;
}

/**
 * Stores a written feature. Nothing sweeps this table; see the schema note.
 *
 * **The slug comes from the headline, so re-commissioning a subject usually
 * lands on the same row.** A model asked twice about the same two players
 * tends to reach for the same headline, that headline makes the same slug, and
 * the upsert replaces the piece in place rather than adding a second one. That
 * is the right behaviour — two near-identical articles about one pairing help
 * nobody — and until 10 August it was silent in two ways that mattered.
 *
 * `created_at` was left alone, so a piece rewritten today carried the date of
 * the one it replaced. It was reported exactly that way: a new feature that
 * read as five days old on `/admin`. The row now holds text written now, so it
 * takes today's date and sorts to the top of the list where it belongs.
 *
 * `posted_at` was left alone too, which was worse. A piece that had been sent
 * to Discord and was then rewritten went on showing as posted, when what had
 * been posted was different text that no longer existed anywhere. Clearing it
 * makes the button come back: this text has not been sent, because it has not.
 */
export async function saveFeature(
  piece: FeaturePiece,
  facts: FeatureFacts,
  model: string | null,
): Promise<void> {
  await db
    .insert(featurePieces)
    .values({
      slug: piece.slug,
      headline: piece.headline,
      standfirst: piece.standfirst,
      body: piece.body,
      subjects: facts.subjects,
      matchRefs: facts.matchRefs,
      model,
    })
    .onConflictDoUpdate({
      target: featurePieces.slug,
      set: {
        headline: piece.headline,
        standfirst: piece.standfirst,
        body: piece.body,
        subjects: facts.subjects,
        matchRefs: facts.matchRefs,
        model,
        createdAt: new Date(),
        postedAt: null,
      },
    });
}

/** Every feature, newest first. */
export async function listFeatures() {
  return db
    .select({
      slug: featurePieces.slug,
      headline: featurePieces.headline,
      standfirst: featurePieces.standfirst,
      body: featurePieces.body,
      subjects: featurePieces.subjects,
      matchRefs: featurePieces.matchRefs,
      model: featurePieces.model,
      createdAt: sql<string>`${featurePieces.createdAt}::text`,
      // Null for everything until somebody presses the button on /admin.
      // Nothing sweeps this table, so nothing else will ever set it.
      postedAt: sql<string | null>`${featurePieces.postedAt}::text`,
    })
    .from(featurePieces)
    .orderBy(sql`${featurePieces.createdAt} desc`);
}

export async function getFeature(slug: string) {
  const [row] = await db
    .select({
      slug: featurePieces.slug,
      headline: featurePieces.headline,
      standfirst: featurePieces.standfirst,
      body: featurePieces.body,
      subjects: featurePieces.subjects,
      matchRefs: featurePieces.matchRefs,
      model: featurePieces.model,
      createdAt: sql<string>`${featurePieces.createdAt}::text`,
    })
    .from(featurePieces)
    .where(eq(featurePieces.slug, slug));
  return row ?? null;
}
