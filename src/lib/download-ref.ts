/**
 * Which of the two things a download URL is carrying.
 *
 * `/api/download/<x>` answers to a short number and to the file's UUID, and
 * this is the one place that decides which of the two it is looking at. It
 * imports nothing, so `scripts/download-ref.test.mjs` loads it under plain
 * `node` and the rule is checked without a database, the same arrangement as
 * `downloads.ts` and `ingest-rules.ts`. Keep it importing nothing.
 *
 * The two forms cannot be confused with each other. A UUID is thirty-six
 * characters with four hyphens in it and can never be all digits, so "digits
 * and nothing else" is a complete test rather than a heuristic that will fail
 * on some unlucky id later.
 */

/**
 * The largest number `files.ref` can ever hold.
 *
 * Not a guess: the migration writes `MAXVALUE 2147483647` into the sequence,
 * because the column is a Postgres `integer`. Anything above it is a number no
 * row can have, and the reason to check rather than to shrug is that a
 * comparison of an integer column against an out-of-range literal is not a miss
 * in Postgres, it is an error. `/api/download/99999999999999` would come back
 * 500 from a route whose entire contract is that anything it does not recognise
 * answers 404. Reading it as an id instead compares text with text, matches
 * nothing, and 404s like every other typo.
 *
 * `Number` is exact to 2^53, so a digit string far past this bound still
 * compares larger and is still rejected. It only loses precision in a range
 * that was rejected long before.
 */
export const MAX_DOWNLOAD_REF = 2147483647;

/**
 * The short number in a download URL, or null when the segment is an id.
 *
 * Null is not a failure and never a 404 on its own. It means "this is the other
 * form", and the caller goes on to look the segment up as a file id, which is
 * how every UUID link minted before the numbers existed keeps working.
 *
 * Leading zeros are refused rather than trimmed, which is the one rule here
 * that costs something. `007` and `7` would otherwise be two URLs for one file:
 * two things to paste, two things a person could be told to check, and two
 * spellings of a link the archive promises to keep. The sequence starts at 1,
 * so no real ref carries one anyway, and `0` is not a ref for the same reason.
 */
export function readDownloadRef(segment: string): number | null {
  // Empty string included: a bare `/api/download/` never routes here, but a
  // caller reading a param off something else should get "not a number" rather
  // than `Number("")`, which is 0 and would look like a legitimate row.
  if (!/^[1-9][0-9]*$/.test(segment)) return null;

  const ref = Number(segment);
  return ref <= MAX_DOWNLOAD_REF ? ref : null;
}
