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
import { desc, eq, isNull, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  matchPlayers,
  matches,
  nightColumns,
  opinionPieces,
  playerProfiles,
} from "@/lib/db/schema";
import { TOOK_PART } from "@/lib/matches/queries";
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
import { announceColumn } from "./discord";

/** How long after the last match before a night counts as finished. */
const QUIET_MINUTES = 75;

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
    .where(eq(matches.status, "final"))
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
 * Posts the newest column that has not been announced yet.
 *
 * Separate from writing so a Discord outage cannot cost us the column, and so
 * an unannounced column is retried on the next sync rather than lost.
 *
 * **One per run.** It used to take three, which is invisible in steady state
 * because a night produces one column, and not invisible at all the first time
 * the webhook is configured: three nights of backlog arrived in the channel at
 * once. One at a time means a backlog drains at the pace of the sync instead of
 * landing as a wall, and a normal night still posts within minutes.
 */
export async function announcePendingColumns(): Promise<number> {
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
    .orderBy(desc(nightColumns.archiveDay))
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
      .where(eq(matches.archiveDay, column.archiveDay))
      .orderBy(matches.startedAt);

    // Writing happens in a separate pass from announcing, so by the time we get
    // here the image either exists or was never going to.
    const ok = await announceColumn({
      ...column,
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

  const current = await db
    .select({
      nameKey: sql<string>`lower(${matchPlayers.name})`,
      matchCount: sql<number>`count(distinct ${matchPlayers.matchId})::int`,
    })
    .from(matchPlayers)
    .where(TOOK_PART)
    .groupBy(sql`lower(${matchPlayers.name})`);

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
