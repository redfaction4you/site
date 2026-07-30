/**
 * Checking generated writing against the facts it was given.
 *
 * The site's whole pitch is that its information can be trusted, so a write-up
 * that states a number the server did not record is worse than no write-up. This
 * is the pass that catches it.
 *
 * It exists because of two real defects in the column for 29 July 2026, both of
 * which passed every rule in the writing prompt:
 *
 *   - "ED ASSMASTER ... a session-high 19.2 percent accuracy", when Skuldug shot
 *     19.4. A superlative computed by reading down a table, and got wrong.
 *   - "Medeo poured everything into two maps, putting up 75 frags and 2 flag
 *     returns", omitting their capture while listing everyone else's. Every number
 *     present was true, and the paragraph still left a false impression.
 *
 * The column for the previous night got all of the same things right from the same
 * prompt. So this is model variance rather than a bad instruction, and no amount of
 * further prompt wording fixes variance. A second pass does, because checking a
 * claim against a table is a much easier task than composing prose from one, and
 * models are good at the easy version.
 *
 * Fails **open**: if the check cannot run, the writing is published anyway with a
 * warning in the log. That is the opposite of `vision.ts`, deliberately. An
 * unchecked picture costs nothing to withhold, whereas withholding every article
 * whenever the checker is rate limited would trade a rare small inaccuracy for a
 * frequent total silence. The check may only ever improve the odds, never become a
 * new way for the site to go quiet.
 */
import { generate } from "./generate";

const SYSTEM = `You are checking a piece of writing against the data it was written from.

You are not an editor. Do not comment on style, tone, structure or word choice.
Report only claims that the data does not support.

Reply with JSON and nothing else, in exactly this form:

{"problems": [{"quote": "<the exact words at fault>", "problem": "<what the data actually says>"}]}

An empty problems array means everything checks out.

Report a claim when:
- It states a number that disagrees with the data.
- It calls something the most, best, highest, longest, fastest, a session high, a
  night high, or says somebody led or topped anything, when the data shows another
  player or match ahead of them. Check every superlative against every row.
- It describes a player's contribution while leaving out something the data gives
  them that would change the impression. A player credited with a capture whose
  captures go unmentioned, while other players have theirs listed, is a problem.
- It states something as fact that simply is not in the data at all.

Do not report:
- Rounding that is close enough, such as 19.2 for 19.23.
- Judgement calls about how a match felt, who played well, or what was tense.
- Anything the data supports but you would have phrased differently.

Be precise. The quote must be copied exactly from the writing so it can be found.
Do not use em dashes.`;

export type FactProblem = { quote: string; problem: string };

export type FactCheck = {
  /** True when nothing was found, or when the check could not run. */
  ok: boolean;
  problems: FactProblem[];
  /** False when the check did not actually happen, so callers can say so. */
  ran: boolean;
};

function extractJson(text: string): Record<string, unknown> | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return null;

  try {
    const parsed = JSON.parse(text.slice(start, end + 1));
    return typeof parsed === "object" && parsed !== null
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/** Runs the check. Never throws. */
export async function checkClaims(facts: string, draft: string): Promise<FactCheck> {
  const prompt = [
    "THE DATA:",
    facts,
    "",
    "THE WRITING TO CHECK:",
    draft,
  ].join("\n");

  const answer = await generate(SYSTEM, prompt);
  if (!answer) {
    console.warn("[ai] fact check could not run, publishing unchecked");
    return { ok: true, problems: [], ran: false };
  }

  const parsed = extractJson(answer);
  if (!parsed || !Array.isArray(parsed.problems)) {
    console.warn(`[ai] fact check answer unusable: ${answer.slice(0, 140)}`);
    return { ok: true, problems: [], ran: false };
  }

  const problems: FactProblem[] = [];
  for (const entry of parsed.problems) {
    if (typeof entry !== "object" || entry === null) continue;
    const row = entry as Record<string, unknown>;
    const quote = typeof row.quote === "string" ? row.quote.trim() : "";
    const problem = typeof row.problem === "string" ? row.problem.trim() : "";
    // A problem with no quote cannot be acted on and cannot be verified either.
    if (quote && problem) problems.push({ quote, problem });
  }

  return { ok: problems.length === 0, problems, ran: true };
}

/**
 * The note handed back to the writer for a second attempt.
 *
 * Quoting the offending words rather than describing them means the model has to
 * find and change the actual sentence, instead of rewriting the piece around a
 * vague complaint.
 */
export function repairNote(problems: FactProblem[]): string {
  const lines = [
    "Your previous draft contained claims the data does not support. Write it again,",
    "keeping everything that was right, and fixing exactly these:",
    "",
  ];

  for (const { quote, problem } of problems) {
    lines.push(`  You wrote: "${quote}"`);
    lines.push(`  The data says: ${problem}`);
    lines.push("");
  }

  lines.push(
    "Check every superlative against every row before writing it. If you are not",
    "certain something is the highest or the most, do not say that it is.",
  );

  return lines.join("\n");
}
