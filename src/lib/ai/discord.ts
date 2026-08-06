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
  if (!url) return null;
  // A webhook URL that is not a webhook URL is a configuration mistake worth
  // refusing rather than POSTing somebody's match results to.
  if (!/^https:\/\/(discord|discordapp)\.com\/api\/webhooks\//i.test(url)) {
    console.warn("[discord] DISCORD_NEWS_WEBHOOK does not look like a webhook URL");
    return null;
  }
  return url;
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

/** Returns true only if Discord accepted the post. */
export async function announceColumn(column: ColumnToAnnounce): Promise<boolean> {
  const url = webhookUrl();
  if (!url) return false;

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
      return false;
    }

    return true;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.warn(`[discord] webhook failed: ${reason}`);
    return false;
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
 * The reports are checked against the record and this is not, so the two must
 * not arrive in the channel looking like the same thing. An embed travels
 * further than a page, and it travels without whatever context surrounded it, so
 * everything that distinguishes the two has to be inside the embed itself: the
 * byline in the author slot, the word opinion in the title, a different colour
 * from the report's red, and a footer that says it is a view rather than a
 * finding and that a machine wrote it.
 *
 * Gold rather than red is not decoration. Red is what a match report posts under,
 * and somebody scrolling a channel sorts by colour long before they read a
 * footer.
 */
export async function announceOpinion(piece: OpinionToAnnounce): Promise<boolean> {
  const url = webhookUrl();
  if (!url) return false;

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
            footer: {
              text:
                `Opinion, written automatically by ${piece.columnist} from ${piece.matchCount} ` +
                `matches on record. It argues rather than reports, and unlike a match ` +
                `report it is not checked against the archive.`,
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
      return false;
    }

    return true;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.warn(`[discord] opinion webhook failed: ${reason}`);
    return false;
  }
}
