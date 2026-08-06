/**
 * Decides when a night is over, writes it up, and announces it.
 *
 * Play arrives in a batch: a few matches back to back, then nothing until the
 * same time tomorrow. So a night is finished when no new match has landed for a
 * while, not at any particular clock time. Two rules cover it:
 *
 *   - Any day before today, in the archive's own timezone, is definitely over.
 *   - Today is over once the last match ended more than QUIET_MINUTES ago.
 *
 * If people come back and play more on the same day, the stored match count no
 * longer matches and the column is rewritten rather than left describing half
 * an evening.
 */
import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  matchPlayers,
  matches,
  nightColumns,
  opinionPieces,
  playerProfiles,
} from "@/lib/db/schema";
import {
  MATCH_COMPLETED,
  TOOK_PART,
  aliasNames,
  canonicalNames,
} from "@/lib/matches/queries";
import { renameInText } from "@/lib/matches/names";
import { IDENTITY_KEY } from "@/lib/matches/identities";
import { ARCHIVE_TIME_ZONE, calendarDay } from "@/lib/matches/sanitize";
import { publicUrl } from "@/lib/storage";
import { activeModel, configuredProvider } from "./generate";
import { buildNightFacts, writeNightColumn } from "./night-column";
import { buildOpinionFacts, writeOpinion } from "./opinion";
import { makeColumnImage } from "./night-image";
import {
  MIN_MATCHES_FOR_PROFILE,
  buildProfileFacts,
  writeProfile,
} from "./player-profile";
import { announceColumn, announceOpinion } from "./discord";
import { COLUMNIST_NAME } from "./opinion";

/** How long after the last match before a night counts as finished. */
const QUIET_MINUTES = 75;

/**
 * The least time between two things being announced, measured on the clock.
 *
 * **This is a rate limit and the "one per run" limits below are not.** They cap
 * a single call to `runNightJobs`, which is a cap on nothing: `runNightJobs`
 * runs on every ingest request, the VPS re-sends several recent days on each
 * sync as a separate request each, and three requests arriving back to back
 * spend three runs' worth of budget in the time it takes to POST three
 * documents.
 *
 * That is not hypothetical. The first time a webhook was configured, three
 * nights of backlog arrived in the channel at once; the limit was lowered from
 * three to one and the note written above `announcePendingColumns` says that
 * fixed it. It did not. The second time a webhook was configured, six items
 * were queued and five of them landed in six seconds:
 *
 *     22:26:50  column 2026-08-05     22:26:53  opinion 2026-08-04
 *     22:26:50  opinion 2026-08-05    22:26:56  opinion 2026-07-31
 *     22:26:52  column 2026-08-04
 *
 * A per-call limit cannot express "not too often" because it does not know what
 * time it is. This does, and it needs nothing stored: `posted_at` already
 * records when the last thing went out.
 *
 * Fifteen minutes, which is the sync interval, so a normal night's column and
 * opinion arrive about half an hour apart and a backlog drains at a readable
 * pace instead of as a wall.
 */
const MIN_MINUTES_BETWEEN_POSTS = 15;

/**
 * When anything was last announced, across both kinds.
 *
 * Deliberately shared. Two separate throttles would let a column and an opinion
 * go out in the same second, which is two thirds of what just happened.
 */
async function lastAnnouncedAt(): Promise<Date | null> {
  const [row] = await db
    .select({
      at: sql<Date | null>`greatest(
        (select max(${nightColumns.postedAt}) from ${nightColumns}),
        (select max(${opinionPieces.postedAt}) from ${opinionPieces})
      )`,
    })
    .from(sql`(select 1) as one`);

  return row?.at ? new Date(row.at) : null;
}

/** True when something went out too recently for anything else to follow it. */
async function announcedTooRecently(): Promise<boolean> {
  const last = await lastAnnouncedAt();
  if (!last) return false;

  const minutes = (Date.now() - last.getTime()) / 60_000;
  if (minutes >= MIN_MINUTES_BETWEEN_POSTS) return false;

  console.log(
    `[ai] last announcement was ${Math.round(minutes)} minutes ago, holding ` +
      `until ${MIN_MINUTES_BETWEEN_POSTS}`,
  );
  return true;
}

/** Nights considered per run. A backlog fills in over successive syncs. */
const MAX_PER_RUN = 2;

type Candidate = { archiveDay: string; matchCount: number; lastEnd: Date | null };

async function findFinishedNights(): Promise<Candidate[]> {
  const rows = await db
    .select({
      archiveDay: matches.archiveDay,
      matchCount: sql<number>`count(*)::int`,
      lastEnd: sql<Date | null>`max(coalesce(${matches.endedAt}, ${matches.startedAt}))`,
    })
    .from(matches)
    /*
     * The matches that counted, which is what `buildNightFacts` writes from.
     *
     * These two counts are compared to decide whether a column is out of date,
     * so they have to be the same count. They were not: the writer saw seven
     * matches and this saw eight, and a night containing a cancelled start
     * therefore looked permanently stale on one reading and permanently current
     * on the other, depending on which count reached the comparison first.
     *
     * The 31 July column is the case in hand. It was written before the writing
     * learned to skip cancelled matches, so it describes one as "a brief
     * thirty-second clash that ended in a scoreless draw" and totals "all eight
     * matches" above a page that says seven. With both counts on the same rule
     * it comes out stale, and the next run rewrites it from what actually
     * happened.
     */
    .where(and(eq(matches.status, "final"), MATCH_COMPLETED))
    .groupBy(matches.archiveDay)
    .orderBy(desc(matches.archiveDay))
    .limit(30);

  const today = calendarDay(new Date(), ARCHIVE_TIME_ZONE);
  const quietBefore = Date.now() - QUIET_MINUTES * 60_000;

  return rows.filter((row) => {
    if (row.matchCount === 0) return false;
    if (row.archiveDay < today) return true;
    // Today: only once things have gone quiet.
    const last = row.lastEnd ? new Date(row.lastEnd).getTime() : 0;
    return last > 0 && last < quietBefore;
  });
}

export async function backfillColumns(): Promise<number> {
  if (!configuredProvider()) return 0;

  const finished = await findFinishedNights();
  if (finished.length === 0) return 0;

  const existing = await db
    .select({
      archiveDay: nightColumns.archiveDay,
      matchCount: nightColumns.matchCount,
      imageKey: nightColumns.imageKey,
    })
    .from(nightColumns);

  const written = new Map(existing.map((row) => [row.archiveDay, row.matchCount]));
  const illustrated = new Set(
    existing.filter((row) => row.imageKey).map((row) => row.archiveDay),
  );

  // Nights with no column, or whose match count has grown since it was written.
  const pending = finished
    .filter((night) => written.get(night.archiveDay) !== night.matchCount)
    .slice(0, MAX_PER_RUN);

  const model = activeModel();
  let count = 0;

  for (const night of pending) {
    try {
      const facts = await buildNightFacts(night.archiveDay);
      if (!facts) {
        console.warn(`[ai] no facts for ${night.archiveDay}, skipping`);
        continue;
      }

      const column = await writeNightColumn(facts);
      if (!column) {
        // Worth a line rather than a silent skip. This failed quietly for
        // hours: every condition was met, nothing was written, and nothing
        // said why.
        console.warn(
          `[ai] no column written for ${night.archiveDay} from a ${facts.prompt.length} char prompt`,
        );
        continue;
      }

      /*
       * The picture, made from the column that was just written rather than
       * from the numbers it came from. That ordering is the point: the
       * illustration has to belong to the story that actually got told.
       *
       * A night that already has one keeps it. Regenerating would spend a
       * scarce image request to replace a picture nobody complained about, and
       * a column that is rewritten because two more matches arrived is the same
       * evening with a longer account of it. The image is a mood, not a claim
       * about the score, so it survives the rewrite.
       */
      const image = illustrated.has(night.archiveDay)
        ? null
        : await makeColumnImage(facts, column);

      await db
        .insert(nightColumns)
        .values({
          archiveDay: night.archiveDay,
          headline: column.headline,
          body: column.body,
          matchCount: facts.matchCount,
          model,
          generatedAt: new Date(),
          imageKey: image?.imageKey ?? null,
          imagePrompt: image?.imagePrompt ?? null,
          imageModel: image?.imageModel ?? null,
        })
        .onConflictDoUpdate({
          target: nightColumns.archiveDay,
          set: {
            headline: column.headline,
            body: column.body,
            matchCount: facts.matchCount,
            model,
            generatedAt: new Date(),
            // The image columns are named only when there is a new image, so a
            // rewrite cannot blank a picture that already exists.
            ...(image
              ? {
                  imageKey: image.imageKey,
                  imagePrompt: image.imagePrompt,
                  imageModel: image.imageModel,
                }
              : {}),
            // A rewritten column is worth announcing again only if it was never
            // announced. Reposting an updated piece would spam the channel.
          },
        });

      count++;
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      console.warn(`[ai] column failed for ${night.archiveDay}: ${reason}`);
    }
  }

  return count;
}

/**
 * Gives an existing column its illustration, without touching the writing.
 *
 * `backfillColumns` only attempts an image for a column it is writing, so
 * anything already published when image generation was unavailable would stay
 * unillustrated forever. That is most of the archive, and it will be all of the
 * archive until the Gemini key has image quota at all.
 *
 * Deliberately separate from the writing pass rather than folded into its pending
 * filter. Revisiting a night there would regenerate prose that was fine to get at
 * a missing picture, which spends the scarcer of the two budgets to save the
 * other. Here the stored headline and body are used exactly as they are, so this
 * costs one image request and no text request.
 *
 * One per run, same reasoning as everything else here: a backlog fills in over
 * successive syncs rather than timing one out.
 */
export async function backfillColumnImages(): Promise<number> {
  const [pending] = await db
    .select({
      archiveDay: nightColumns.archiveDay,
      headline: nightColumns.headline,
      body: nightColumns.body,
    })
    .from(nightColumns)
    .where(isNull(nightColumns.imageKey))
    .orderBy(desc(nightColumns.archiveDay))
    .limit(1);

  if (!pending) return 0;

  // Only for the facts the picture needs. No model call, and the column's own
  // text is what actually gets illustrated.
  const facts = await buildNightFacts(pending.archiveDay);
  if (!facts) return 0;

  const image = await makeColumnImage(facts, {
    headline: pending.headline,
    body: pending.body,
  });
  if (!image) return 0;

  await db
    .update(nightColumns)
    .set({
      imageKey: image.imageKey,
      imagePrompt: image.imagePrompt,
      imageModel: image.imageModel,
      // generatedAt is left alone. The writing did not change, and moving it
      // would make the column look freshly rewritten on every page that shows
      // when it was written.
    })
    .where(eq(nightColumns.archiveDay, pending.archiveDay));

  return 1;
}

/**
 * Posts the oldest column that has not been announced yet.
 *
 * Separate from writing so a Discord outage cannot cost us the column, and so
 * an unannounced column is retried on the next sync rather than lost.
 *
 * **Oldest first, not newest.** Newest first is invisible in steady state, when
 * there is one thing waiting, and backwards the moment there is more than one:
 * draining a backlog newest first writes the channel in reverse, so a reader
 * scrolling down goes 5 August, 4 August, 31 July. A channel is a chronology.
 * The night the piece is about is the order it should arrive in.
 *
 * One per run **and** not within `MIN_MINUTES_BETWEEN_POSTS` of the last
 * announcement of any kind. The second half is the one that does the work; see
 * the note on that constant for why the first half never did.
 */
export async function announcePendingColumns(): Promise<number> {
  if (await announcedTooRecently()) return 0;

  const pending = await db
    .select({
      archiveDay: nightColumns.archiveDay,
      headline: nightColumns.headline,
      body: nightColumns.body,
      matchCount: nightColumns.matchCount,
      imageKey: nightColumns.imageKey,
    })
    .from(nightColumns)
    .where(isNull(nightColumns.postedAt))
    .orderBy(asc(nightColumns.archiveDay))
    .limit(1);

  let posted = 0;

  for (const column of pending) {
    /*
     * The night's results, so the post can link to each match rather than only
     * to the article. One query per column being announced, and there are at
     * most three of those per run.
     */
    const played = await db
      .select({
        sourceMatchId: matches.sourceMatchId,
        mapName: matches.mapName,
        redScore: matches.redScore,
        blueScore: matches.blueScore,
      })
      .from(matches)
      // The matches the column is about, which excludes any that were
      // cancelled. Discord would otherwise carry a link to a nil-nil the
      // article does not mention and the archive does not count.
      .where(and(eq(matches.archiveDay, column.archiveDay), MATCH_COMPLETED))
      .orderBy(matches.startedAt);

    /*
     * Everybody called what the site calls them, here as well.
     *
     * The pages get this from `listColumns` and `getColumn`, which resolve a
     * name written months ago to the one its owner is known by now. This reads
     * the table directly, because announcing needs `posted_at` and the page
     * queries do not select it, and that difference is enough to leak: an embed
     * saying "Special ED" landing in Discord under a link to a page that says
     * Romek, permanently, because a Discord post is not re-rendered.
     *
     * The one surface where getting this wrong cannot be fixed by a deploy.
     */
    const aliases = await aliasNames();

    // Writing happens in a separate pass from announcing, so by the time we get
    // here the image either exists or was never going to.
    const ok = await announceColumn({
      ...column,
      headline: renameInText(column.headline, aliases),
      body: renameInText(column.body, aliases),
      imageUrl: column.imageKey ? publicUrl(column.imageKey) : null,
      matches: played,
    });
    if (!ok) continue;

    await db
      .update(nightColumns)
      .set({ postedAt: new Date() })
      .where(eq(nightColumns.archiveDay, column.archiveDay));

    posted++;
  }

  return posted;
}

/**
 * Posts the newest opinion piece that has not been announced yet.
 *
 * One per run, same as the columns, and separate from them so a failure to post
 * one cannot stop the other. The piece is already labelled as opinion on the
 * site; `announceOpinion` labels it again in the embed, because an embed leaves
 * the page behind and arrives somewhere the labelling did not follow.
 */
export async function announcePendingOpinions(): Promise<number> {
  if (await announcedTooRecently()) return 0;

  const [pending] = await db
    .select({
      archiveDay: opinionPieces.archiveDay,
      headline: opinionPieces.headline,
      body: opinionPieces.body,
      matchCount: opinionPieces.matchCount,
    })
    .from(opinionPieces)
    // Oldest first, for the reason on `announcePendingColumns`: a channel is a
    // chronology and a backlog drained newest first writes it backwards.
    .orderBy(asc(opinionPieces.archiveDay))
    .limit(1);

  if (!pending) return 0;

  // Same as the columns: a name resolved on the page and not in the embed is a
  // permanent disagreement, because a Discord post is not re-rendered.
  const aliases = await aliasNames();

  const ok = await announceOpinion({
    ...pending,
    headline: renameInText(pending.headline, aliases),
    body: renameInText(pending.body, aliases),
    columnist: COLUMNIST_NAME,
  });
  if (!ok) return 0;

  await db
    .update(opinionPieces)
    .set({ postedAt: new Date() })
    .where(eq(opinionPieces.archiveDay, pending.archiveDay));

  return 1;
}

/**
 * Rewrites player profiles that have gone out of date.
 *
 * A profile written after three matches is wrong once somebody has played
 * thirty, so the stored match count is compared against the current one rather
 * than regenerating on a timer. Two per run, same reasoning as the columns: a
 * backlog spreads over syncs instead of timing one out.
 */
const MAX_PROFILES_PER_RUN = 2;

/**
 * How many new matches it takes before a profile is worth rewriting.
 *
 * This used to rewrite on any change at all, which sounds right and is not.
 * Everybody who plays a night has their match count go up, so a six player
 * evening meant six rewrites, every evening, for profiles that would read almost
 * identically. Meanwhile the free tier allows twenty model requests per day per
 * key, so those rewrites were spending the same budget the match reports need,
 * and the reports are the thing readers actually notice missing. A profile after
 * seven matches and the same profile after eight is not new information.
 *
 * Twelve rather than three, decided 31 July 2026. Three was still a rewrite
 * roughly every other week per player, and the same argument applies further up
 * the scale: a profile at twelve matches and the same profile at fifteen say the
 * same thing in different words, and each one costs a request from the allowance
 * the match reports draw on. Twelve is about a month of play here, which is
 * roughly how often somebody's game actually changes.
 */
const PROFILE_REWRITE_STEP = 12;

export async function backfillProfiles(): Promise<number> {
  if (!configuredProvider()) return 0;

  const counts = await db
    .select({
      key: IDENTITY_KEY,
      matchCount: sql<number>`count(distinct ${matchPlayers.matchId})::int`,
    })
    .from(matchPlayers)
    .innerJoin(matches, eq(matches.id, matchPlayers.matchId))
    // The same count `/players` shows and the same one a profile is written
    // from, so a profile is neither held back nor rewritten by a match that did
    // not count towards the threshold it is being measured against.
    .where(and(TOOK_PART, MATCH_COMPLETED))
    /*
     * Per person, which is what the threshold is about and what the profile is
     * written from. Counted per name, somebody who has played ten matches under
     * three names had three counts of eight, three and two, none of which
     * reaches nine, so they never got a profile at all.
     */
    .groupBy(IDENTITY_KEY);

  /*
   * Keyed by the name the site knows each person by, lowercased, which is what
   * `buildProfileFacts` looks a profile up with and what the player page asks
   * for. The table's key is still a name; what changed is that it is now one
   * name per person rather than one per spelling.
   */
  const named = await canonicalNames();
  const current = counts.map(({ key, ...row }) => ({
    ...row,
    nameKey: (named.get(key) ?? "").toLocaleLowerCase("en-US"),
  }));

  const existing = await db
    .select({
      nameKey: playerProfiles.nameKey,
      matchCount: playerProfiles.matchCount,
    })
    .from(playerProfiles);

  const written = new Map(existing.map((row) => [row.nameKey, row.matchCount]));

  const pending = current
    .filter((row) => row.matchCount >= MIN_MATCHES_FOR_PROFILE)
    .filter((row) => {
      const already = written.get(row.nameKey);
      // Never written: always worth doing.
      if (already === undefined) return true;
      // Written before: only once enough has happened to change the account.
      return row.matchCount - already >= PROFILE_REWRITE_STEP;
    })
    // Whoever is furthest out of date goes first, so nobody's profile is
    // starved by a busier player's.
    .sort((a, b) => staleness(b) - staleness(a))
    .slice(0, MAX_PROFILES_PER_RUN);

  function staleness(row: { nameKey: string; matchCount: number }): number {
    return row.matchCount - (written.get(row.nameKey) ?? 0);
  }

  console.log(
    `[ai] profiles: ${current.length} players, ${existing.length} written, ${pending.length} pending this run`,
  );

  const model = activeModel();
  let count = 0;

  for (const player of pending) {
    try {
      const facts = await buildProfileFacts(player.nameKey);
      if (!facts) continue;

      const body = await writeProfile(facts);
      if (!body) {
        console.warn(`[ai] no profile written for ${player.nameKey}`);
        continue;
      }

      await db
        .insert(playerProfiles)
        .values({
          nameKey: facts.nameKey,
          displayName: facts.displayName,
          body,
          matchCount: facts.matchCount,
          model,
          generatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: playerProfiles.nameKey,
          set: {
            displayName: facts.displayName,
            body,
            matchCount: facts.matchCount,
            model,
            generatedAt: new Date(),
          },
        });

      count++;
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      console.warn(`[ai] profile failed for ${player.nameKey}: ${reason}`);
    }
  }

  return count;
}

/** Guard used by the ingest route so a missing table cannot break a sync. */
/**
 * Writes Stanley Mesh's opinion piece for any night that has a column and no piece.
 *
 * Runs last on purpose. It is the one thing here that is decoration rather than
 * record, so it should only ever spend quota the reports, the column, the
 * picture and the profiles did not want. A night without one is a night where
 * something more important used the allowance, which is the right trade.
 *
 * Never rewrites. An opinion does not go stale the way a summary of a
 * half-finished evening does, and rewriting one would mean the piece a reader
 * saw yesterday is not the piece they find today.
 */
async function backfillOpinions(): Promise<number> {
  const nights = await db
    .select({ archiveDay: nightColumns.archiveDay })
    .from(nightColumns)
    .leftJoin(opinionPieces, eq(opinionPieces.archiveDay, nightColumns.archiveDay))
    .where(isNull(opinionPieces.archiveDay))
    .orderBy(desc(nightColumns.archiveDay))
    .limit(1);

  if (nights.length === 0) return 0;

  let written = 0;
  for (const night of nights) {
    const facts = await buildOpinionFacts(night.archiveDay);
    if (!facts) continue;

    const piece = await writeOpinion(facts);
    if (!piece) continue;

    await db
      .insert(opinionPieces)
      .values({
        archiveDay: night.archiveDay,
        headline: piece.headline,
        body: piece.body,
        matchCount: facts.matchCount,
        model: activeModel(),
      })
      .onConflictDoNothing();

    written++;
  }

  return written;
}

export async function runNightJobs(): Promise<{
  columns: number;
  images: number;
  posted: number;
  profiles: number;
  opinions: number;
}> {
  let columns = 0;
  let images = 0;
  let posted = 0;
  let profiles = 0;
  let opinions = 0;

  try {
    columns = await backfillColumns();
  } catch (error) {
    console.warn("[ai] column backfill threw:", error);
  }

  // Before announcing, so a column waiting to be posted gets its picture into
  // the embed rather than being announced bare and illustrated a minute later.
  try {
    images = await backfillColumnImages();
  } catch (error) {
    console.warn("[ai] column image backfill threw:", error);
  }

  try {
    posted = await announcePendingColumns();
    posted += await announcePendingOpinions();
  } catch (error) {
    console.warn("[ai] column announce threw:", error);
  }

  try {
    profiles = await backfillProfiles();
  } catch (error) {
    console.warn("[ai] profile backfill threw:", error);
  }

  // Last, so it only ever uses quota nothing else wanted.
  try {
    opinions = await backfillOpinions();
  } catch (error) {
    console.warn("[ai] opinion backfill threw:", error);
  }

  return { columns, images, posted, profiles, opinions };
}

/** Re-exported so callers do not need to know where the constant lives. */
export { QUIET_MINUTES };
