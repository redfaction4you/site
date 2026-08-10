import { sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { dmPlayers, dmRounds } from "@/lib/db/schema";

/**
 * The two ways the deathmatch archive contradicts itself.
 *
 * Both shapes have existed. The ranking column arriving empty was designed out
 * before launch, and a phantom boundary round reached production on 7 August
 * 2026 and had to be swept by hand.
 *
 * Lifted out of `health.ts` so the admin page can ask the same question. It was
 * only ever in the health answer, which meant the two alarms `vet-live` watches
 * were invisible to the person who would actually fix them: the page they would
 * be looking at knew about capture the flag and nothing else.
 *
 * `npm run vet:dm` is this pair of questions by hand, with the rows named.
 *
 * counts-everything (dm): integrity questions read every row on purpose.
 */
export type DmIntegrity = {
  /** Players with kills or deaths but zero seconds — the ranking column failing. */
  untimed: number;
  /** Sub-30-second rounds carrying stats — the phantom-round shape. */
  phantoms: number;
};

export async function dmIntegrity(): Promise<DmIntegrity> {
  const [row] = await db
    .select({
      untimed: sql<number>`count(*) filter (
        where (${dmPlayers.kills} > 0 or ${dmPlayers.deaths} > 0)
          and ${dmPlayers.secondsPlayed} = 0
      )::int`,
      phantoms: sql<number>`count(distinct ${dmRounds.id}) filter (
        where ${dmRounds.endedAt} is not null
          and ${dmRounds.endedAt} - ${dmRounds.startedAt} < interval '30 seconds'
          and (${dmPlayers.kills} > 0 or ${dmPlayers.deaths} > 0)
      )::int`,
    })
    .from(dmRounds)
    .leftJoin(dmPlayers, sql`${dmPlayers.roundId} = ${dmRounds.id}`);

  return { untimed: row?.untimed ?? 0, phantoms: row?.phantoms ?? 0 };
}
