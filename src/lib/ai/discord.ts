/**
 * Posts the nightly column to Discord.
 *
 * A webhook rather than a bot: there is nothing to listen for, no commands to
 * handle and no gateway connection to keep alive. One POST when a column is
 * written, and nothing running the rest of the time.
 *
 * Unconfigured is a normal state. Without a webhook URL the column is still
 * written and still appears on the site; it just is not announced.
 */

import { SITE_URL } from "@/lib/site";

/** Discord's cap on an embed description. Columns run well under this. */
const EMBED_LIMIT = 4096;

function webhookUrl(): string | null {
  const url = process.env.DISCORD_NEWS_WEBHOOK?.trim();
  if (!url) {
    /*
     * Said out loud, every time.
     *
     * This used to return null in silence, on the reasoning at the top of this
     * file that unconfigured is a normal state. It is a normal state for a
     * deployment nobody wants Discord posts from, and it was not that: the
     * variable was set locally, never added to production, and the site wrote
     * six columns and opinion pieces that queued up and went nowhere for five
     * days. Nothing in any log said so. A line per attempt is cheap and is the
     * difference between a silent failure and a findable one.
     *
     * `/api/health` is the other half of this and the half a monitor can act on.
     */
    console.warn(
      "[discord] DISCORD_NEWS_WEBHOOK is not set, so nothing will be announced. " +
        "In production this is almost certainly a mistake: see /api/health.",
    );
    return null;
  }
  // A webhook URL that is not a webhook URL is a configuration mistake worth
  // refusing rather than POSTing somebody's match results to.
  if (!/^https:\/\/(discord|discordapp)\.com\/api\/webhooks\//i.test(url)) {
    console.warn("[discord] DISCORD_NEWS_WEBHOOK does not look like a webhook URL");
    return null;
  }
  return url;
}

/**
 * Whether announcing can work at all, without revealing the webhook.
 *
 * A boolean about the environment, for `/api/health` to report. The URL itself
 * never leaves this module.
 */
export function discordConfigured(): boolean {
  return webhookUrl() !== null;
}

function truncate(text: string, limit: number): string {
  if (text.length <= limit) return text;
  // Cut at a paragraph break so the post ends on a whole thought.
  const cut = text.lastIndexOf("\n\n", limit - 60);
  const body = cut > limit * 0.5 ? text.slice(0, cut) : text.slice(0, limit - 60);
  return `${body.trim()}\n\nRead the rest on the site.`;
}

export type ColumnToAnnounce = {
  archiveDay: string;
  headline: string;
  body: string;
  matchCount: number;
  /** The generated illustration, if there is one. Null is normal. */
  imageUrl?: string | null;
  /**
   * The night's matches, so the post can link to each one.
   *
   * The embed sent people to the article and stopped there, which is the one
   * page on the site that does not have the scoreboard on it. Somebody reading
   * "Blue took it 5-3 on Huna" in Discord wants the match, and the match has a
   * permanent URL, so not offering it was a link nobody had to guess at going
   * unoffered.
   */
  matches?: {
    sourceMatchId: number;
    mapName: string;
    redScore: number;
    blueScore: number;
  }[];
};

/**
 * The night's matches as one field of links.
 *
 * One field rather than one per match, because Discord lays fields out in
 * columns and six of them turns a post into a grid of stubs. Capped, because a
 * long night would otherwise push the embed past its limit for a list nobody
 * reads to the end of; the site link at the top covers the rest.
 */
function matchLinks(column: ColumnToAnnounce): string | null {
  if (!column.matches?.length) return null;

  const shown = column.matches.slice(0, 12);
  const lines = shown.map(
    (match) =>
      `[${match.mapName}](${SITE_URL}/matches/${column.archiveDay}/${match.sourceMatchId}) ` +
      `${match.redScore}-${match.blueScore}`,
  );

  if (column.matches.length > shown.length) {
    lines.push(
      `[and ${column.matches.length - shown.length} more](${SITE_URL}/matches/${column.archiveDay})`,
    );
  }

  return lines.join("\n");
}

/**
 * What became of an attempt to post, in the only three kinds that matter.
 *
 * A boolean cannot express the case that duplicated a piece in the channel: the
 * post arrived and the answer did not. `false` was read as "did not happen", the
 * row kept its null `posted_at`, and fifteen minutes later the same opinion went
 * out a second time. The archive recorded one post; Discord had two.
 *
 * - `sent`      Discord accepted it. Certain.
 * - `rejected`  It certainly did not arrive: no webhook, a 4xx, a rate limit.
 *               Safe to try again, because there is nothing to duplicate.
 * - `unknown`   The request went out and the outcome is not known: a timeout, a
 *               dropped connection, a 5xx. **Never retried.** A retry here is
 *               exactly the double post, and a piece silently missing from the
 *               channel is a far smaller harm than the same piece twice.
 */
export type AnnounceResult = "sent" | "rejected" | "unknown";

/**
 * How an HTTP response should be read when the post was not accepted.
 *
 * 4xx is the server telling us it did not act: a malformed embed, a webhook that
 * no longer exists, a rate limit. 5xx is the server failing to tell us anything,
 * which is not the same as it not having happened.
 */
function resultFor(status: number): AnnounceResult {
  return status >= 400 && status < 500 ? "rejected" : "unknown";
}

export async function announceColumn(column: ColumnToAnnounce): Promise<AnnounceResult> {
  const url = webhookUrl();
  if (!url) return "rejected";

  const link = `${SITE_URL}/news/${column.archiveDay}`;
  const links = matchLinks(column);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        embeds: [
          {
            title: column.headline.slice(0, 250),
            url: link,
            description: truncate(column.body, EMBED_LIMIT),
            color: 0xe0301e,
            // Discord fetches this itself, which is another reason the bucket
            // URL has to be public and permanent rather than signed.
            ...(column.imageUrl ? { image: { url: column.imageUrl } } : {}),
            ...(links
              ? {
                  fields: [
                    { name: "Every match this night", value: links.slice(0, 1024) },
                  ],
                }
              : {}),
            footer: {
              // The illustration is labelled here for the same reason it is
              // labelled on the site. A synthetic photograph passed off as a
              // record of the evening is the single most misleading thing this
              // project could publish, and an embed travels further than a page.
              // Named, because an embed travels away from the place it was
              // posted and a reader three shares later has no idea whose
              // archive this is.
              text:
                `redfaction4you.com · ${column.matchCount} ${column.matchCount === 1 ? "match" : "matches"} · written automatically from the match data` +
                (column.imageUrl ? " · picture generated, not a photograph" : ""),
            },
            timestamp: new Date().toISOString(),
          },
        ],
      }),
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });

    if (!response.ok) {
      console.warn(`[discord] webhook ${response.status}: ${await response.text()}`);
      return resultFor(response.status);
    }

    return "sent";
  } catch (error) {
    // A timeout or a dropped connection says nothing about whether Discord
    // created the message. Treated as unknown, and therefore never retried.
    const reason = error instanceof Error ? error.message : String(error);
    console.warn(`[discord] webhook failed, outcome unknown: ${reason}`);
    return "unknown";
  }
}

export type OpinionToAnnounce = {
  archiveDay: string;
  headline: string;
  body: string;
  matchCount: number;
  columnist: string;
};

/**
 * Posts the columnist's piece, and marks it as opinion in every way it can.
 *
 * A report tells you what happened and this argues about it, so the two must not
 * arrive in the channel looking like the same thing. An embed travels further
 * than a page, and it travels without whatever context surrounded it, so
 * everything that distinguishes the two has to be inside the embed itself: the
 * byline in the author slot, the word opinion in the title, a different colour
 * from the report's red, and a footer that says it is a view rather than a
 * finding and that a machine wrote it.
 *
 * **The difference is not that one is checked and the other is not.** This file
 * said that and so did the footer, and it was wrong in the direction that costs
 * you: `writeOpinion` runs `checkClaims` exactly as the reports do, and refuses
 * to publish when the checker could not run, where a report publishes anyway.
 * The figures in a piece are as checked as any on the site. What is the column's
 * own is the argument it builds out of them.
 *
 * Gold rather than red is not decoration. Red is what a match report posts under,
 * and somebody scrolling a channel sorts by colour long before they read a
 * footer.
 */
export async function announceOpinion(piece: OpinionToAnnounce): Promise<AnnounceResult> {
  const url = webhookUrl();
  if (!url) return "rejected";

  const link = `${SITE_URL}/news/${piece.archiveDay}`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        embeds: [
          {
            author: { name: `${piece.columnist} · opinion` },
            title: piece.headline.slice(0, 250),
            url: link,
            description: truncate(piece.body, EMBED_LIMIT),
            // Oxide, the site's second colour, so a piece never arrives looking
            // like a result.
            color: 0xe6b64f,
            /*
             * What this is, without talking the piece down.
             *
             * It used to end "and unlike a match report it is not checked
             * against the archive", which was both corrosive and untrue. Every
             * opinion piece goes through `checkClaims` exactly as a report
             * does, and it is held to the stricter standard of the two: a
             * report publishes when the checker could not run, and a piece does
             * not publish at all. Advertising a weakness the writing does not
             * have, on an archive whose whole argument is that its information
             * can be trusted, is a bad trade in both directions.
             *
             * What still needs saying is the real distinction, which is not
             * about checking: a report tells you what happened and this argues
             * about it. The numbers in it are as checked as any other; the
             * view it takes of them is one column's.
             */
            footer: {
              text:
                `Opinion, written automatically by ${piece.columnist} from ${piece.matchCount} ` +
                `matches on record. Its figures come from the archive; the argument is its own.`,
            },
            timestamp: new Date().toISOString(),
          },
        ],
      }),
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });

    if (!response.ok) {
      console.warn(`[discord] opinion webhook ${response.status}: ${await response.text()}`);
      return resultFor(response.status);
    }

    return "sent";
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.warn(`[discord] opinion webhook failed, outcome unknown: ${reason}`);
    return "unknown";
  }
}

export type FeatureToAnnounce = {
  slug: string;
  headline: string;
  standfirst: string;
  body: string;
  /** Who or what it is about, for the line under the title. */
  subjects: string[];
  /** How many matches the piece was built from. */
  matchCount: number;
  columnist: string;
};

/**
 * A feature, announced because somebody decided to announce it.
 *
 * **Nothing calls this on a schedule and nothing sweeps `feature_pieces`.**
 * That is the whole difference from a column or an opinion piece, both of which
 * are swept up and posted by the next sync if their `posted_at` is null — which
 * is why regenerating one republishes it. A feature is written when somebody
 * asks, and posted when somebody presses the button, and those are two separate
 * decisions on purpose.
 *
 * `posted_at` is stamped by the caller after this returns `sent`, so the button
 * becomes a date. A Discord message cannot be unsent, so there is deliberately
 * no way to post the same piece twice by accident.
 *
 * Oxide, like the opinion piece and unlike a match report: somebody scrolling a
 * channel sorts by colour long before they read a footer, and a feature is not
 * a result.
 */
export async function announceFeature(
  piece: FeatureToAnnounce,
): Promise<AnnounceResult> {
  const url = webhookUrl();
  if (!url) return "rejected";

  const link = `${SITE_URL}/analyst/features/${piece.slug}`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        embeds: [
          {
            author: { name: `${piece.columnist} · feature` },
            title: piece.headline.slice(0, 250),
            url: link,
            // The standfirst first, because it exists to say what the piece
            // covers, and then as much of the piece as an embed will hold.
            description: truncate(
              piece.standfirst.trim()
                ? `**${piece.standfirst.trim()}**\n\n${piece.body}`
                : piece.body,
              EMBED_LIMIT,
            ),
            color: 0xe6b64f,
            fields: piece.subjects.length
              ? [{ name: "About", value: piece.subjects.join(", ").slice(0, 1000) }]
              : undefined,
            footer: {
              text:
                `Feature, written automatically by ${piece.columnist} from ` +
                `${piece.matchCount} ${piece.matchCount === 1 ? "match" : "matches"} ` +
                `on record and checked against them. Posted by hand.`,
            },
            timestamp: new Date().toISOString(),
          },
        ],
      }),
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });

    if (!response.ok) {
      console.warn(`[discord] feature webhook ${response.status}: ${await response.text()}`);
      return resultFor(response.status);
    }

    return "sent";
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.warn(`[discord] feature webhook failed, outcome unknown: ${reason}`);
    return "unknown";
  }
}
