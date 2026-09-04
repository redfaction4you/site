import { askUpstream, weHold } from "@/lib/autodl";
import { formatCheckAnswer, parseCheckBody } from "@/lib/autodl-rules";

/**
 * "Which of these levels can be fetched?", answered for our catalogue and
 * FactionFiles' together.
 *
 * The path mirrors what Alpine builds, `{base}/checkmaps.php`, so that pointing
 * a client at us stays a one-constant change. The body is a `;` separated list
 * of filenames and the reply is one `found` or `notfound` per line.
 *
 * **The order is the contract.** The client pairs its request list against the
 * reply by index, so a line dropped or moved reports a different map missing
 * than the one that is. Every path here returns exactly as many lines as it was
 * given names.
 */
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const names = parseCheckBody(await request.text());

  if (names.length === 0) {
    return new Response("", { headers: { "content-type": "text/plain" } });
  }

  const mine = await weHold(names);

  // Everything we already hold needs no upstream opinion. Asking about the rest
  // in one request rather than one each keeps this to a single round trip
  // however long the rotation is.
  const unknown = names.filter((_, index) => !mine[index]);

  let upstreamAnswers: boolean[] = [];
  if (unknown.length > 0) {
    const upstream = await askUpstream("/checkmaps.php", {
      method: "POST",
      body: unknown.join(";"),
    });

    if (upstream?.ok) {
      const lines = (await upstream.text()).trim().split(/\r?\n/);
      upstreamAnswers = unknown.map((_, index) => lines[index]?.trim() === "found");
    } else {
      /*
       * An unreachable upstream is "we cannot get it", not an error.
       *
       * The honest answer to "can this be fetched" when the only source is
       * unreachable is no. Saying yes would send the client on to a download
       * that cannot happen, which is a worse failure and a later one.
       */
      upstreamAnswers = unknown.map(() => false);
    }
  }

  let next = 0;
  const answers = names.map((_, index) => (mine[index] ? true : upstreamAnswers[next++]));

  return new Response(formatCheckAnswer(answers), {
    headers: { "content-type": "text/plain", "cache-control": "no-store" },
  });
}
