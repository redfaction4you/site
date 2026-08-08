import Link from "next/link";

import { PlayerLink } from "@/components/player-link";
import { mapSlug } from "@/lib/matches/maps";
import type { BrokenRecord } from "@/lib/matches/queries";

/**
 * The records that fell on this night, as a note at the end of the article.
 *
 * Asked for by the owner, 7 August 2026: a record deserves the player's name
 * on it and a route to their stats, so the name links to their page and the
 * figure links to the match it happened in. Everything here is computed by
 * `recordsBrokenOnNight` in code; the model never writes this section, the
 * same separation as the fact-checked superlatives.
 *
 * Renders nothing on a night with no records, which is most nights. A note
 * that appeared every night with something to say would stop being a note.
 */

function seconds(ms: number): string {
  return `${(ms / 1000).toFixed(2)}s`;
}

function describe(record: BrokenRecord): { label: string; figure: string; was: string } {
  switch (record.kind) {
    case "fastest-run":
      return {
        label: "Fastest run on",
        figure: seconds(record.value),
        was: seconds(record.previous),
      };
    case "best-streak":
      return {
        label: "Best streak in one match",
        figure: String(record.value),
        was: String(record.previous),
      };
    case "most-caps":
      return {
        label: "Most captures in one match",
        figure: String(record.value),
        was: String(record.previous),
      };
    case "biggest-win":
      return {
        label: "Biggest win on record",
        figure: `by ${record.value}`,
        was: `by ${record.previous}`,
      };
  }
}

export function NightRecords({
  records,
  archiveDay,
}: {
  records: BrokenRecord[];
  archiveDay: string;
}) {
  if (records.length === 0) return null;

  return (
    <section className="mt-8 border-t border-basalt-800 pt-4">
      <h2 className="rule-heading">
        {records.length === 1 ? "A record fell tonight" : "Records fell tonight"}
      </h2>
      <ul className="mt-3 space-y-2">
        {records.map((record) => {
          const { label, figure, was } = describe(record);
          return (
            <li
              key={`${record.kind}-${record.mapName}`}
              className="text-sm leading-relaxed text-steel-300"
            >
              <span className="text-oxide-400" aria-hidden="true">
                ★{" "}
              </span>
              {label}{" "}
              {record.kind === "fastest-run" ? (
                <>
                  <Link
                    href={`/matches/map/${mapSlug(record.mapName)}`}
                    className="text-steel-200 hover:text-rust-300"
                  >
                    {record.mapName}
                  </Link>{" "}
                </>
              ) : null}
              &mdash;{" "}
              <Link
                href={`/matches/${archiveDay}/${record.sourceMatchId}`}
                className="font-mono tabular-nums text-steel-100 hover:text-rust-300"
              >
                {figure}
              </Link>
              {record.playerName ? (
                <>
                  {" "}
                  by <PlayerLink name={record.playerName} />
                </>
              ) : null}
              <span className="text-steel-500"> · was {was}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
