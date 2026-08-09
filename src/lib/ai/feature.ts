import { and, eq, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { featurePieces, matchPlayers, matches } from "@/lib/db/schema";
import { DISPLAY_NAME, IDENTITY_KEY } from "@/lib/matches/identities";
import { MATCH_COMPLETED, TOOK_PART, getMatch } from "@/lib/matches/queries";
import { accuracyOf } from "@/lib/matches/accuracy";
import { checkClaims } from "./fact-check";
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

const SYSTEM = `You are ${COLUMNIST_NAME}, a sports analyst who covers a Red Faction
Capture the Flag server. You are writing a FEATURE, not your usual nightly
column: one subject, covered properly, from the match record below.

- This is longer than a column. Four to six paragraphs.
- Walk through the matches. Name the maps, the scores, who did what in each
  one, and how the flags actually moved. The record below has captures with
  the clock on them; use them to tell what happened rather than to decorate.
- You may say what you make of it. That is the job. What worked between them,
  what did not, whether it looked like what you had been asking for.
- Only what is below. Every number in your piece must appear in the record.
  Never invent a moment, a save, a call or a conversation, and never claim to
  have watched anything: you have the scoreboards and the event log.
- Where the record cannot answer something, say so plainly or leave it out.
  "The log does not say who returned it" is a real sentence; guessing is not.
- Never guess a player's gender. Use they and them for everyone, without
  exception, however the name reads to you. Never write he, she, his or her.
- Refer to players exactly by the names given, including odd capitalisation.
- Do not use em dashes.
- No headings, no bullet points, no markdown. Plain paragraphs.

First line of your reply must be a headline on its own, under 70 characters, no
quotes, no trailing full stop, and no date in any form.
Second line must be a single sentence standfirst, under 140 characters, saying
what the piece covers.
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

/**
 * Every match two people played on the same side, newest last.
 *
 * Through identity, so somebody who has played under four names is one person,
 * and only matches that counted: a feature built partly on an abandoned start
 * would be describing a game the rest of the site says did not happen.
 */
async function matchesTogether(a: string, b: string): Promise<string[]> {
  const rows = await db
    .select({
      id: matches.id,
      archiveDay: matches.archiveDay,
      sourceMatchId: matches.sourceMatchId,
      team: matchPlayers.team,
      person: DISPLAY_NAME,
    })
    .from(matchPlayers)
    .innerJoin(matches, eq(matches.id, matchPlayers.matchId))
    .where(and(TOOK_PART, MATCH_COMPLETED, eq(matches.status, "final")))
    .groupBy(matches.id, matches.archiveDay, matches.sourceMatchId, matchPlayers.team, IDENTITY_KEY);

  const wanted = new Set([a.toLowerCase(), b.toLowerCase()]);
  const sides = new Map<string, Map<string, Set<string>>>();
  for (const row of rows) {
    if (!wanted.has(row.person.toLowerCase())) continue;
    const key = `${row.archiveDay}/${row.sourceMatchId}`;
    if (!sides.has(key)) sides.set(key, new Map());
    const byTeam = sides.get(key)!;
    if (!byTeam.has(row.team)) byTeam.set(row.team, new Set());
    byTeam.get(row.team)!.add(row.person.toLowerCase());
  }

  return [...sides.entries()]
    .filter(([, byTeam]) => [...byTeam.values()].some((people) => people.size === 2))
    .map(([key]) => key)
    .sort();
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
  const refs = await matchesTogether(a, b);
  if (refs.length === 0) return null;

  const lines: string[] = [];
  lines.push(
    `SUBJECT: every match ${a} and ${b} have played on the same side. ` +
      `There are ${refs.length}.`,
  );

  // What they had been before this: opponents, and how many times.
  const opposed = await db
    .select({
      matchId: matches.id,
      archiveDay: matches.archiveDay,
      sourceMatchId: matches.sourceMatchId,
      team: matchPlayers.team,
      person: DISPLAY_NAME,
    })
    .from(matchPlayers)
    .innerJoin(matches, eq(matches.id, matchPlayers.matchId))
    .where(and(TOOK_PART, MATCH_COMPLETED, eq(matches.status, "final")))
    .groupBy(matches.id, matches.archiveDay, matches.sourceMatchId, matchPlayers.team, IDENTITY_KEY);

  const wanted = new Set([a.toLowerCase(), b.toLowerCase()]);
  const perMatch = new Map<string, Map<string, string>>();
  for (const row of opposed) {
    if (!wanted.has(row.person.toLowerCase())) continue;
    const key = `${row.archiveDay}/${row.sourceMatchId}`;
    if (!perMatch.has(key)) perMatch.set(key, new Map());
    perMatch.get(key)!.set(row.person.toLowerCase(), row.team);
  }
  const facedCount = [...perMatch.values()].filter(
    (teams) => teams.size === 2 && new Set(teams.values()).size === 2,
  ).length;
  lines.push(
    `Before any of this they had been opponents ${facedCount} times.`,
  );

  const lore = loreFor([a, b]);
  if (lore) {
    lines.push("");
    lines.push("WHO THEY ARE:");
    lines.push(lore);
  }

  for (const ref of refs) {
    const [archiveDay, sourceMatchId] = ref.split("/");
    const match = await getMatch(archiveDay, Number(sourceMatchId));
    if (!match) continue;

    lines.push("");
    lines.push(
      `MATCH ${sourceMatchId} on ${archiveDay}, ${match.mapName}, ` +
        `${match.mode}. Final score red ${match.redScore}, blue ${match.blueScore}` +
        `${match.winner ? `, ${match.winner} won` : ", no recorded winner"}` +
        `${match.overtime ? ", went to overtime" : ""}.`,
    );

    lines.push("  Scoreboard:");
    for (const player of match.players) {
      if (player.team === "spectator") continue;
      const accuracy = accuracyOf(player.shotsHit, player.shotsFired);
      lines.push(
        `    ${player.name} (${player.team}): ${player.kills} frags, ` +
          `${player.deaths} deaths, ${player.caps} captures, ` +
          `best streak ${player.maxStreak}, ` +
          `${accuracy === null ? "accuracy not sound" : `${accuracy.toFixed(1)}% accuracy`}, ` +
          `${Math.round(player.flagHoldMs / 1000)}s holding the flag, ` +
          `${player.flagPickups} flag pickups, ${player.flagReturns} returns.`,
      );
    }

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

  lines.push("");
  lines.push(
    "Write the feature. Cover the matches above in order. It is fine to say " +
      "which of them was the better game and why, and to judge whether the " +
      "pairing worked, but every number must come from what is above.",
  );

  return {
    kind: "pairing",
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
        `${accuracy === null ? "accuracy not sound" : `${accuracy.toFixed(1)}% accuracy`}, ` +
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

  lines.push("");
  lines.push("EVERY MATCH, oldest first:");
  for (const row of mine) {
    const accuracy = accuracyOf(row.hit, row.fired);
    const result = row.winner ? (row.winner === row.team ? "won" : "lost") : "no result";
    lines.push(
      `  ${row.archiveDay} match ${row.sourceMatchId}, ${row.mapName}, ` +
        `${row.team}, ${result} ${row.redScore}-${row.blueScore}: ` +
        `${row.kills} frags, ${row.deaths} deaths, ${row.caps} captures, ` +
        `best streak ${row.streak}, ` +
        `${accuracy === null ? "accuracy not sound" : `${accuracy.toFixed(1)}% accuracy`}, ` +
        `${Math.round(row.hold / 1000)}s on the flag.`,
    );
  }

  lines.push("");
  lines.push(
    "Write the feature about this player: what they are good at, how their " +
      "nights have gone, and which matches are the ones worth pointing at.",
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

/** Stores a written feature. Never announced by anything; see the schema note. */
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
