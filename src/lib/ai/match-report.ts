/**
 * Writes the match report.
 *
 * The point is a bit of fun: a short piece the way a sports desk would file it
 * after the game. The interesting part is that the event log genuinely supports
 * a narrative. We know when each capture landed, what the score was at the
 * time, who was carrying, and who was fragging whom in the seconds before it.
 *
 * Two rules shape the prompt, and both exist because this sits on an archive
 * whose whole pitch is that its information can be trusted:
 *
 *   1. The model is given facts and told to use only those. It has no access to
 *      anything else and is told explicitly not to invent history, rivalries or
 *      past meetings, because it does not know any and would happily make them
 *      up if asked to be colourful.
 *   2. The result is labelled as machine-written wherever it is displayed.
 *
 * Generated once and stored. It is not regenerated on every view: it would cost
 * money for no benefit and would say something slightly different each time.
 */
import { generate } from "./generate";
import type { MatchDetail } from "@/lib/matches/queries";

const SYSTEM = `You write short match reports for a Red Faction capture-the-flag archive.

Voice: a sports desk filing a brief report, or a radio host recapping the game.
Warm, specific, a little wry. Never breathless. Never a listicle.

Hard rules:
- Use ONLY the facts given. You know nothing else about these players.
- Never invent history, rivalries, past matches, records, nicknames or motives.
- Never state a number that is not in the data.
- If the data is thin, write less. Two short paragraphs is a fine report.
- No headings, no bullet points, no markdown. Plain paragraphs only.
- Do not open with "In a thrilling match" or similar filler.
- Do not use em dashes.
- Refer to players exactly by the names given, including odd capitalisation.
- Never guess a player's gender. Use they/them if you need a pronoun.
- Maximum three paragraphs.

On timing: each capture is labelled with where it sits in the match. Use that
label, not the clock reading, to decide whether something was early or late. A
goal at 3:51 of a ten minute match is not an early lead.`;

/** Turns seconds into the clock format the site shows elsewhere. */
function clock(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/**
 * Where a moment sits in the match, as a phrase rather than a number.
 *
 * The model has no sense of proportion on its own: given a capture at 3:51 it
 * called it an early lead, which in a ten minute match it plainly is not. Doing
 * the arithmetic here and handing over the answer is more reliable than asking
 * it to reason about fractions, and it stops the report reaching for "early"
 * because the clock looks small.
 */
function phase(elapsed: number, total: number | null): string {
  if (!total || total <= 0) return "at an unrecorded point in the match";

  const fraction = elapsed / total;
  if (fraction <= 0.1) return "in the opening exchanges";
  if (fraction <= 0.3) return "in the first third";
  if (fraction <= 0.45) return "approaching the midpoint";
  if (fraction <= 0.6) return "around the midpoint";
  if (fraction <= 0.8) return "in the second half";
  if (fraction <= 0.95) return "late on";
  return "in the closing moments";
}

/**
 * The facts, laid out for the model.
 *
 * Kill events are summarised rather than dumped: a match carries a few hundred,
 * which is both expensive and useless as a wall of text. What matters
 * narratively is the shape, so we give per player totals plus the frags in the
 * thirty seconds before each capture, which is where a story usually is.
 */
function buildPrompt(match: MatchDetail): string {
  const active = match.players.filter((p) => !p.spectator);
  const lines: string[] = [];

  const totalSeconds =
    match.startedAt && match.endedAt
      ? Math.round((match.endedAt.getTime() - match.startedAt.getTime()) / 1000)
      : null;

  lines.push(`Map: ${match.mapName}`);
  lines.push(`Mode: ${match.mode}`);
  lines.push(`Final score: red ${match.redScore}, blue ${match.blueScore}`);
  lines.push(`Winner: ${match.winner ?? "no winner recorded"}`);
  if (totalSeconds) {
    lines.push(
      `The match lasted ${clock(totalSeconds)}. Judge whether something happened ` +
        `early or late against that length, not against the clock reading alone.`,
    );
  }
  if (match.overtime) lines.push("The match went to overtime.");
  lines.push("");

  for (const team of ["red", "blue"]) {
    const squad = active.filter((p) => p.team === team);
    if (!squad.length) continue;
    lines.push(`${team.toUpperCase()} team:`);
    for (const p of squad) {
      const accuracy =
        p.shotsFired > 0 ? `${((p.shotsHit / p.shotsFired) * 100).toFixed(1)}% accuracy` : "no shots recorded";
      lines.push(
        `  ${p.name}: score ${p.score}, ${p.kills} frags, ${p.deaths} deaths, ` +
          `${p.caps} captures, best streak ${p.maxStreak}, ${accuracy}` +
          (p.flagReturns ? `, ${p.flagReturns} flag returns` : "") +
          (p.flagHoldMs ? `, held the flag ${Math.round(p.flagHoldMs / 1000)}s` : ""),
      );
    }
    lines.push("");
  }

  if (match.captures.length) {
    lines.push("Captures, in order:");
    for (const c of match.captures) {
      lines.push(
        `  ${clock(c.elapsedSeconds)} (${phase(c.elapsedSeconds, totalSeconds)}) ` +
          `${c.team} scored through ${c.playerName ?? "an unknown player"}` +
          `, making it red ${c.redScore} blue ${c.blueScore}` +
          (c.assists.length ? `, assisted by ${c.assists.join(" and ")}` : ""),
      );
    }
    lines.push("");
  }

  // The run-up to each capture: who was fragging while the flag was moving.
  const captureWindows = match.captures.map((c) => ({
    at: c.elapsedSeconds,
    team: c.team,
    frags: match.kills.filter(
      (k) =>
        k.elapsedSeconds <= c.elapsedSeconds &&
        k.elapsedSeconds > c.elapsedSeconds - 30 &&
        !k.suicide,
    ),
  }));

  const withFrags = captureWindows.filter((w) => w.frags.length);
  if (withFrags.length) {
    lines.push("Frags in the thirty seconds before each capture:");
    for (const w of withFrags) {
      const names = w.frags
        .map((f) => `${f.killerName ?? "unknown"} fragged ${f.victimName}`)
        .slice(0, 8);
      lines.push(`  before the ${clock(w.at)} ${w.team} capture: ${names.join("; ")}`);
    }
    lines.push("");
  }

  const weapons = new Map<string, number>();
  for (const k of match.kills) {
    if (k.weapon) weapons.set(k.weapon, (weapons.get(k.weapon) ?? 0) + 1);
  }
  const topWeapons = [...weapons.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
  if (topWeapons.length) {
    lines.push(
      `Most used weapons: ${topWeapons.map(([w, n]) => `${w} (${n} frags)`).join(", ")}`,
    );
  }

  lines.push(`Total frags in the match: ${match.kills.length}`);
  lines.push(`Total flag events: ${match.flagEvents.length}`);

  return lines.join("\n");
}

/** Returns the report, or null if generation is unconfigured or failed. */
export async function writeMatchReport(match: MatchDetail): Promise<string | null> {
  // Nothing to write about. A match with no scoreboard is not a story.
  if (match.players.length === 0) return null;

  return generate(SYSTEM, buildPrompt(match));
}
