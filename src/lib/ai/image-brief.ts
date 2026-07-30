/**
 * The one sentence of the column that reaches the picture.
 *
 * This module used to choose the subject of the illustration from closed sets.
 * It no longer needs to: with reference images the composition comes from the
 * match record instead, which knows better than a model does. Who played, how
 * many a side, which map, whether a flag was moving and whose it was are all
 * facts, and `match-pick.ts` reads them straight off the record for nothing.
 *
 * What is left is the one thing the record cannot supply, which is how the night
 * felt. A short phrase, capped hard, because the point of everything around it is
 * that the composition is not up for negotiation.
 */
import { generate } from "./generate";
import { MAX_MOOD_LENGTH, cleanMood } from "./image-prompt";

const SYSTEM = `You write one short phrase describing the atmosphere of a match report,
to guide the mood of a photograph that will run beside it.

Reply with the phrase alone. No quotes, no explanation, no full stop.

Rules:
- At most twelve words.
- Atmosphere only. Never events, numbers, player names, team names or map names.
- Take the language from the writing itself wherever you can.
- Do not use em dashes.`;

/**
 * A mood phrase for the night, or an empty string.
 *
 * Empty is a perfectly good outcome: `buildComposition` simply leaves the line
 * out, and the picture is composed from the references and the match facts alone.
 * Nothing here is worth failing an illustration over.
 */
export async function buildMoodPhrase(column: {
  headline: string;
  body: string;
}): Promise<string> {
  // The opening is where a column says what the night was. Enough to judge the
  // feeling by, not so much that the model starts summarising paragraph four.
  const opening = column.body
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 2)
    .join("\n\n")
    .slice(0, 1200);

  const answer = await generate(
    SYSTEM,
    `Headline: ${column.headline}\n\nIt opens:\n${opening}`,
  );

  if (!answer) return "";

  // Models answer a request for a phrase with a sentence, a quoted phrase, or a
  // short essay about the phrase. Take the first line and strip the decoration.
  const first = answer.split("\n").find((line) => line.trim()) ?? "";
  const cleaned = cleanMood(first.replace(/^["'`]+|["'`.]+$/g, ""));

  // A reply that ignored the length is a reply that ignored the brief, and a
  // sentence of narrative in the prompt starts steering the composition.
  return cleaned.length <= MAX_MOOD_LENGTH ? cleaned : "";
}
