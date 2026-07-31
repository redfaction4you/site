/**
 * Checking generated prose without asking a model.
 *
 * `fact-check.ts` sends a draft back to a model and asks what the data does not
 * support. That catches things arithmetic cannot, and it has two weaknesses: it
 * costs a request from a scarce allowance, and it is the same kind of task that
 * produced the error in the first place. A model asked to scan a table for the
 * largest value gets it wrong; a model asked to check whether somebody else
 * scanned it correctly can get that wrong too.
 *
 * These checks are arithmetic and string work. They are free, instant,
 * deterministic, and where they fire they are certain rather than probable. They
 * run first, so the model pass is spent on what only it can judge.
 *
 * **What this cannot do.** It cannot tell whether a sentence leaves a false
 * impression, whether a superlative is fair, or whether an opinion has quietly
 * become a claim. Those need the model pass, and the two are complementary
 * rather than alternatives.
 *
 * Deliberately free of imports so `node --test` can load it directly.
 */

export type VerifyProblem = {
  /** What was found in the draft. */
  quote: string;
  problem: string;
};

export type Verification = { ok: boolean; problems: VerifyProblem[] };

/**
 * Numbers the prose may use without them appearing in the facts.
 *
 * Small counts get written both ways ("two or three paragraphs", "the first
 * time") and appear constantly in ordinary sentences, so requiring them to be
 * present in the data would flag good writing. Anything above this is a figure
 * somebody is quoting, which is the case worth checking.
 */
const FREELY_USED_UP_TO = 3;

/** Digits, decimals and percentages. Not years, which are matched separately. */
const NUMBER_PATTERN = /\d+(?:\.\d+)?%?/g;

/**
 * Numbers spelled out, because prose spells them out.
 *
 * Found by testing the check against the sentence it was written for: the
 * published claim read "faced each other nine times, more than any other
 * opponent", and a digit-only check sailed straight past it. A verifier that
 * misses the case that motivated it is worse than none, because it is trusted.
 *
 * Stops at twenty. Beyond that people write the digits, and a match count in
 * this archive will not reach it for a long time.
 */
const NUMBER_WORDS: Record<string, string> = {
  zero: "0", one: "1", two: "2", three: "3", four: "4", five: "5",
  six: "6", seven: "7", eight: "8", nine: "9", ten: "10",
  eleven: "11", twelve: "12", thirteen: "13", fourteen: "14", fifteen: "15",
  sixteen: "16", seventeen: "17", eighteen: "18", nineteen: "19", twenty: "20",
};

/** Every figure in a piece of text, however it was written. */
function figuresIn(text: string): string[] {
  const digits = (text.match(NUMBER_PATTERN) ?? []).map((n) => n.replace("%", ""));
  const words = (text.toLowerCase().match(/[a-z]+/g) ?? [])
    .filter((word) => word in NUMBER_WORDS)
    .map((word) => NUMBER_WORDS[word]);
  return [...digits, ...words];
}

function numbersIn(text: string): string[] {
  return text.match(NUMBER_PATTERN) ?? [];
}

/**
 * Every figure in the draft has to appear in the facts it was written from.
 *
 * The single most valuable check available, because an invented number is the
 * failure that has actually happened here and it is decidable without judgement.
 * A model asked "is this number right" may say yes; a string search cannot.
 *
 * Compares bare values so "86%" in the prose is satisfied by "86" in the facts,
 * since the facts express a rate as a number and a sentence expresses it as a
 * percentage. A date in the facts also licenses its parts, because "2026-07-30"
 * is legitimately written as "30 July".
 */
export function verifyNumbers(facts: string, draft: string): Verification {
  const allowed = new Set<string>();

  for (const raw of numbersIn(facts)) {
    const bare = raw.replace("%", "");
    allowed.add(bare);
    // A rate given as 0.86 is written as 86, and one given as 86 as 0.86.
    const asNumber = Number(bare);
    if (Number.isFinite(asNumber)) {
      allowed.add(String(Math.round(asNumber)));
      if (asNumber < 1) allowed.add(String(Math.round(asNumber * 100)));
    }
  }

  // Dates licence their own components: 2026-07-30 permits 2026, 07, 7 and 30.
  for (const date of facts.match(/\d{4}-\d{2}-\d{2}/g) ?? []) {
    const [year, month, day] = date.split("-");
    for (const part of [year, month, day, String(Number(month)), String(Number(day))]) {
      allowed.add(part);
    }
  }

  const problems: VerifyProblem[] = [];
  const seen = new Set<string>();

  for (const raw of numbersIn(draft)) {
    const bare = raw.replace("%", "");
    if (seen.has(bare)) continue;
    seen.add(bare);

    const value = Number(bare);
    if (Number.isFinite(value) && value <= FREELY_USED_UP_TO) continue;
    if (allowed.has(bare)) continue;
    if (Number.isFinite(value) && allowed.has(String(Math.round(value)))) continue;

    problems.push({
      quote: raw,
      problem: `${raw} does not appear anywhere in the data this was written from.`,
    });
  }

  return { ok: problems.length === 0, problems };
}

/** Phrases that assert something is the largest, best or only of its kind. */
const SUPERLATIVES = [
  "the most",
  "more than any",
  "the highest",
  "the best",
  "the longest",
  "the fastest",
  "the largest",
  "the top",
  "leads the",
  "leading the",
  "tops the",
  "topped the",
  "a record",
  "unbeaten",
  "nobody else",
  "no other",
];

/**
 * A superlative is only allowed when the facts state it.
 *
 * This exists because of a real sentence: one pair had "faced each other nine
 * times, more than any other opponent on the board" when a second pair was level
 * on nine. Every number in it was true and the claim was false, which is the
 * shape of error that reads most authoritative.
 *
 * The facts carry a precomputed leader block for exactly this. The check is
 * therefore not "is this superlative correct", which needs judgement, but "did
 * the data offer a leader at all, and does the sentence agree with it". Where
 * the block says a thing is level between several, any superlative about it is
 * wrong by construction.
 */
export function verifySuperlatives(facts: string, draft: string): Verification {
  const problems: VerifyProblem[] = [];
  const levelled = /No single (?:pair|player) leads this/i.test(facts);
  if (!levelled) return { ok: true, problems };

  // Which values are contested, so a superlative quoting one is provably wrong.
  const tiedValues = new Set(
    (facts.match(/all level on (\d+)/gi) ?? []).map((line) =>
      line.replace(/\D/g, ""),
    ),
  );

  for (const sentence of draft.split(/(?<=[.!?])\s+/)) {
    const lower = sentence.toLowerCase();
    if (!SUPERLATIVES.some((phrase) => lower.includes(phrase))) continue;

    // Both forms, since prose writes "nine" where a table writes 9.
    if (figuresIn(sentence).some((value) => tiedValues.has(value))) {
      problems.push({
        quote: sentence.trim(),
        problem:
          "The data says that figure is level between several, so it is not a lead " +
          "and must not be written as one.",
      });
    }
  }

  return { ok: problems.length === 0, problems };
}

/** Every free check, run together. */
export function verifyDraft(facts: string, draft: string): Verification {
  const problems = [
    ...verifyNumbers(facts, draft).problems,
    ...verifySuperlatives(facts, draft).problems,
  ];
  return { ok: problems.length === 0, problems };
}

/** The correction handed back on a rewrite. Mirrors `repairNote`. */
export function verifyNote(problems: VerifyProblem[]): string {
  const list = problems
    .map((problem) => `- "${problem.quote}": ${problem.problem}`)
    .join("\n");

  return (
    "Your previous draft had these problems. Write it again, keeping the parts " +
    "that were right and fixing only these:\n\n" +
    list
  );
}
