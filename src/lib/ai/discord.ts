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

/** Discord's cap on an embed description. Columns run well under this. */
const EMBED_LIMIT = 4096;

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://redfaction4you.com";

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
};

/** Returns true only if Discord accepted the post. */
export async function announceColumn(column: ColumnToAnnounce): Promise<boolean> {
  const url = webhookUrl();
  if (!url) return false;

  const link = `${SITE_URL}/news/${column.archiveDay}`;

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
            footer: {
              // The illustration is labelled here for the same reason it is
              // labelled on the site. A synthetic photograph passed off as a
              // record of the evening is the single most misleading thing this
              // project could publish, and an embed travels further than a page.
              text:
                `${column.matchCount} ${column.matchCount === 1 ? "match" : "matches"} · written automatically from the match data` +
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
