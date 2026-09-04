/**
 * Answering the game's own autodownload lookup.
 *
 * Alpine resolves a missing level in three steps: it asks a base URL for a
 * filename, reads a `download_url` out of the answer, and does a plain HTTP GET
 * on whatever that URL says. The base is a compiled-in constant, so pointing a
 * client here is a one-line change to our own build, and once it is pointed
 * here the client will fetch from wherever we say. That is the whole mechanism.
 *
 * Deliberately imports nothing, so `node --test` can load it. The rules that
 * matter are the ones that decide whether we hold a level and what shape the
 * answer takes, and both are easy to get quietly wrong: a response missing one
 * field throws inside the client rather than reading as "not found", and a
 * level matched too loosely serves the wrong map under the right name.
 */

/**
 * The base we fall through to for everything we do not hold.
 *
 * A client pointed at us asks us for every level, including the several hundred
 * we have never heard of, so answering only for our own would break
 * autodownload for everything else. Passing those through means a redirected
 * client is never worse off than a stock one, which is the property that makes
 * the redirect safe to ship.
 */
export const UPSTREAM_BASE = "https://autodl.factionfiles.com";

/**
 * A level name reduced to what two spellings of the same map share.
 *
 * The client asks for exactly the filename the server is running, which comes
 * out of a `.toml` written by hand, while our copy of the name comes out of the
 * inside of a zip. Those agree on the letters and on nothing else: real
 * examples on our own servers include `ctf-HunaB8.rfl` against `ctf-hunab8`,
 * and `maps/DM-Combat Arena.rfl` against `DM-Combat Arena.vpp`.
 *
 * So: no directory, no `.rfl`, lowercased. Nothing more aggressive than that.
 * Stripping punctuation would make `dm-01` and `dm01` the same map, and serving
 * somebody the wrong level under the right name is worse than not having it.
 */
export function levelKey(name: string): string {
  const base = (name.split(/[\\/]/).pop() ?? "").trim();
  return base.replace(/\.rfl$/i, "").toLowerCase();
}

/**
 * Is this a level name we are willing to look up at all?
 *
 * These endpoints are public, because the game client is not authenticated and
 * cannot be. The value goes into a database query and into a URL we call
 * upstream, so it is bounded here rather than trusted: Red Faction filenames
 * are long and full of punctuation, but they are not unbounded and they are not
 * paths.
 */
export function isLookupName(name: string): boolean {
  if (!name || name.length > 120) return false;
  if (name.includes("..")) return false;
  // A directory separator means somebody is asking a different question.
  return !/[\\/]/.test(name);
}

/**
 * What the client requires in a `found` answer, and what happens without it.
 *
 * `parse_level_info` in `faction_files.cpp` reads title, author, description,
 * download_size and download_url with `.at()`, which THROWS on a missing key,
 * and then throws again on a zero size or an empty url. A throw there is not
 * "not found": it aborts the download with an error. So a half-populated answer
 * is worse than no answer, and this is the check that we have enough to reply.
 */
export type LevelAnswer = {
  title: string;
  author: string;
  description: string;
  download_size: number;
  download_url: string;
  image_url?: string;
  site_url?: string;
};

export function canAnswer(candidate: {
  title?: string | null;
  sizeBytes?: number | null;
  downloadUrl?: string | null;
}): boolean {
  return Boolean(
    candidate.title &&
      candidate.downloadUrl &&
      typeof candidate.sizeBytes === "number" &&
      candidate.sizeBytes > 0,
  );
}

/**
 * Builds the answer, filling the fields the client insists on.
 *
 * Author and description fall back to a string rather than being omitted,
 * because omitting either throws in the client. "Unknown" is honest for an
 * archive full of files whose makers are not recorded; an empty description is
 * honest for one nobody wrote.
 */
export function levelAnswer(input: {
  title: string;
  author?: string | null;
  description?: string | null;
  sizeBytes: number;
  downloadUrl: string;
  imageUrl?: string | null;
  siteUrl?: string | null;
}): LevelAnswer {
  const answer: LevelAnswer = {
    title: input.title,
    author: input.author?.trim() || "Unknown",
    description: (input.description ?? "").slice(0, 2000),
    download_size: input.sizeBytes,
    download_url: input.downloadUrl,
  };
  if (input.imageUrl) answer.image_url = input.imageUrl;
  if (input.siteUrl) answer.site_url = input.siteUrl;
  return answer;
}

/**
 * The `checkmaps` body: names separated by semicolons, answered a line at a
 * time in the order they were asked.
 *
 * The order is the contract. The client pairs its request list against the
 * response lines by index, so a reply that drops a blank or reorders anything
 * tells it a different map is missing than the one that is.
 */
export function parseCheckBody(body: string): string[] {
  return body
    .split(";")
    .map((name) => name.trim())
    .filter((name) => name.length > 0);
}

export function formatCheckAnswer(found: boolean[]): string {
  return found.map((yes) => (yes ? "found" : "notfound")).join("\n");
}
