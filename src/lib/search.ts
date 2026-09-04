import { and, eq, ilike, or, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  matchPlayers,
  matches,
  nightColumns,
  opinionPieces,
  playerIdentities,
} from "@/lib/db/schema";
import { COLUMNIST_HREF, COLUMNIST_NAME } from "@/lib/ai/opinion";
import { DISPLAY_NAME, IDENTITY_KEY } from "@/lib/matches/identities";
import {
  MATCH_COMPLETED,
  TOOK_PART,
  canonicalNames,
} from "@/lib/matches/queries";
import { mapSlug } from "@/lib/matches/maps";
import { BOARDS } from "@/lib/matches/leaderboards";
import { SECTIONS } from "@/lib/downloads";
import { VISIBLE_NAV } from "@/lib/nav";
import { asDay, asScore } from "@/lib/search-query";

/**
 * One search across everything the archive holds.
 *
 * The site had no way in except the navigation. Somebody who remembers a 5-3 on
 * Huna, or a name they played against, or that the analyst wrote something about
 * pairings, had to know which section files that and walk down to it. That is
 * fine for a reader who already knows the shape of the site and useless for one
 * who does not.
 *
 * Everything here is a database read at request time. There is no index to keep
 * in step, which matters more than speed at this size: an index that drifts is
 * a search that quietly stops finding last night.
 *
 * **The order of the groups is the answer to "what did they probably mean".** A
 * bare name is almost always a player, a date is almost always a night, and a
 * score is almost always a match, so those come first and pages come last.
 */

export type SearchHit = {
  /** Where it goes. */
  href: string;
  /** What it is called. */
  title: string;
  /** What it is, in a word. */
  kind: string;
  /** Anything that helps tell two hits apart. */
  detail?: string;
};

export type SearchResults = {
  query: string;
  groups: { label: string; hits: SearchHit[] }[];
  total: number;
};

/** Enough to be a search rather than a listing of the whole archive. */
const MIN_QUERY = 2;

/** Per group. A search that returns forty players is not answering anything. */
const PER_GROUP = 8;

const dayLabel = (day: string) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });

export async function search(raw: string): Promise<SearchResults> {
  const query = raw.trim();
  if (query.length < MIN_QUERY) return { query, groups: [], total: 0 };

  const like = `%${query}%`;
  const day = asDay(query);
  const score = asScore(query);

  const [players, nights, byScore, byMap, columns, opinions] = await Promise.all([
    // People, grouped as people rather than as names, so a search for one of
    // somebody's names finds the person and lands on their page.
    db
      .select({
        key: IDENTITY_KEY,
        name: DISPLAY_NAME,
        matchesPlayed: sql<number>`count(distinct ${matchPlayers.matchId})::int`,
      })
      .from(matchPlayers)
      .innerJoin(matches, eq(matches.id, matchPlayers.matchId))
      // `DISPLAY_NAME` reads the chosen name off this table, so the join is not
      // optional: without it Postgres refuses the query outright.
      .leftJoin(
        playerIdentities,
        eq(playerIdentities.identityKey, matchPlayers.identityKey),
      )
      .where(and(ilike(matchPlayers.name, like), TOOK_PART, MATCH_COMPLETED))
      .groupBy(IDENTITY_KEY)
      .orderBy(sql`count(distinct ${matchPlayers.matchId}) desc`)
      .limit(PER_GROUP),

    // A night, by the day it was played or by how the date reads.
    db
      .select({
        archiveDay: matches.archiveDay,
        matchCount: sql<number>`count(*)::int`,
      })
      .from(matches)
      .where(
        and(
          MATCH_COMPLETED,
          day
            ? eq(matches.archiveDay, day)
            : sql`to_char(${matches.archiveDay}, 'FMDay FMDD FMMonth YYYY') ilike ${like}`,
        ),
      )
      .groupBy(matches.archiveDay)
      .orderBy(sql`${matches.archiveDay} desc`)
      .limit(PER_GROUP),

    // A scoreline, either way round: somebody remembers 5-3, not who was red.
    score
      ? db
          .select({
            archiveDay: matches.archiveDay,
            sourceMatchId: matches.sourceMatchId,
            mapName: matches.mapName,
            redScore: matches.redScore,
            blueScore: matches.blueScore,
          })
          .from(matches)
          .where(
            and(
              MATCH_COMPLETED,
              or(
                and(eq(matches.redScore, score[0]), eq(matches.blueScore, score[1])),
                and(eq(matches.redScore, score[1]), eq(matches.blueScore, score[0])),
              ),
            ),
          )
          .orderBy(sql`${matches.startedAt} desc`)
          .limit(PER_GROUP)
      : Promise.resolve([]),

    db
      .select({
        mapName: matches.mapName,
        played: sql<number>`count(*)::int`,
      })
      .from(matches)
      .where(and(ilike(matches.mapName, like), MATCH_COMPLETED))
      .groupBy(matches.mapName)
      .orderBy(sql`count(*) desc`)
      .limit(PER_GROUP),

    // The writing, headline and body both: somebody searching for a phrase they
    // remember reading is searching the body.
    db
      .select({
        archiveDay: nightColumns.archiveDay,
        headline: nightColumns.headline,
      })
      .from(nightColumns)
      .where(or(ilike(nightColumns.headline, like), ilike(nightColumns.body, like)))
      .orderBy(sql`${nightColumns.archiveDay} desc`)
      .limit(PER_GROUP),

    db
      .select({
        archiveDay: opinionPieces.archiveDay,
        headline: opinionPieces.headline,
      })
      .from(opinionPieces)
      .where(
        or(ilike(opinionPieces.headline, like), ilike(opinionPieces.body, like)),
      )
      .orderBy(sql`${opinionPieces.archiveDay} desc`)
      .limit(PER_GROUP),
  ]);

  /*
   * The pages themselves, matched in memory.
   *
   * A handful of strings, so a query for them costs nothing and the alternative
   * is a reader typing "stats" into a search that only knows about players. His
   * name is here too: somebody who half remembers a columnist types the name,
   * not the word opinion.
   */
  const staticPages: SearchHit[] = [
    ...VISIBLE_NAV.map((item) => ({
      href: item.href,
      title: item.label,
      kind: "page",
    })),
    /*
     * The four catalogue shelves, from `SECTIONS` rather than from the
     * navigation, because they are deliberately not in it: they are reached
     * through `/downloads` and carry the `hidden` flag in `nav.ts`. Drawn only
     * from `VISIBLE_NAV`, this list could offer a reader who typed "maps" the
     * match record's maps and the competitive map index and never the shelf of
     * map files, which is the thing most people mean by the word.
     *
     * `detail` is what tells the two Maps apart in the results, since both are
     * titled the same on purpose and the shelf's longer nav label, "Map
     * downloads", does not contain the word somebody typed.
     */
    ...SECTIONS.map((section) => ({
      href: section.route,
      title: section.title,
      kind: "downloads",
      detail: "to download",
    })),
    { href: COLUMNIST_HREF, title: COLUMNIST_NAME, kind: "the analyst" },
    { href: "/matches/maps", title: "Competitive CTF maps", kind: "page" },
    { href: "/players/pairings", title: "Pairings", kind: "page" },
    ...BOARDS.map((board) => ({
      href: `/stats/${board.key}`,
      title: board.label,
      kind: "stat board",
    })),
  ].filter((page) => page.title.toLowerCase().includes(query.toLowerCase()));

  /*
   * A search for one of somebody's names finds the person and shows the name the
   * rest of the site knows them by. Searching "s9" should not offer a result
   * headed s9 that opens a page headed Skuldug.
   */
  const named = await canonicalNames();

  const groups: SearchResults["groups"] = [
    {
      label: "Players",
      hits: players.map((row) => {
        const person = named.get(row.key) ?? row.name;
        return {
          href: `/players/${encodeURIComponent(person)}`,
          title: person,
          kind: "player",
          /*
           * Why this matched, when it is not obvious. Searching "s9" turns up
           * Skuldug, which is correct and looks like a mistake without a word
           * about it.
           *
           * Deliberately not a match count. The count available here is of the
           * rows carrying the name that was searched, so it read "Skuldug, 3
           * matches" for somebody who has played ten, which is worse than
           * saying nothing.
           */
          detail:
            person.toLowerCase() === row.name.toLowerCase()
              ? undefined
              : `played as ${row.name}`,
        };
      }),
    },
    {
      label: "Nights",
      hits: nights.map((row) => ({
        href: `/matches/${row.archiveDay}`,
        title: dayLabel(row.archiveDay),
        kind: "night",
        detail: `${row.matchCount} ${row.matchCount === 1 ? "match" : "matches"}`,
      })),
    },
    {
      label: "Matches",
      hits: byScore.map((row) => ({
        href: `/matches/${row.archiveDay}/${row.sourceMatchId}`,
        title: `${row.redScore}–${row.blueScore} on ${row.mapName}`,
        kind: "match",
        detail: dayLabel(row.archiveDay),
      })),
    },
    {
      label: "Maps",
      hits: byMap.map((row) => ({
        href: `/matches/map/${mapSlug(row.mapName)}`,
        title: row.mapName,
        kind: "map",
        detail: `${row.played} ${row.played === 1 ? "match" : "matches"}`,
      })),
    },
    {
      label: "Writing",
      hits: [
        ...columns.map((row) => ({
          href: `/news/${row.archiveDay}`,
          title: row.headline,
          kind: "match report",
          detail: dayLabel(row.archiveDay),
        })),
        ...opinions.map((row) => ({
          href: `/news/${row.archiveDay}`,
          title: row.headline,
          kind: "opinion",
          detail: `${COLUMNIST_NAME} · ${dayLabel(row.archiveDay)}`,
        })),
      ].slice(0, PER_GROUP),
    },
    { label: "Pages", hits: staticPages.slice(0, PER_GROUP) },
  ].filter((group) => group.hits.length > 0);

  return {
    query,
    groups,
    total: groups.reduce((sum, group) => sum + group.hits.length, 0),
  };
}
