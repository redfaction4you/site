import Link from "next/link";

import type { LivePlayer } from "@/lib/server-status";

/**
 * The match in progress, as a scoreboard.
 *
 * The server panel listed the names of everybody playing and nothing else, so a
 * live game with six people in it read as less interesting than a match from
 * last Tuesday, which had a full scoreboard and a written report. The data was
 * there the whole time: the browser API returns score, kills, deaths and
 * captures per player, and the parser was throwing all but the score away
 * because it had been written against an empty server and never checked.
 *
 * Split by side when the game is team based, because in CTF the interesting
 * thing is not the ladder, it is which three are beating which three.
 *
 * **Nothing here is stored and nothing here is the record.** These figures come
 * from the live server, they move every few seconds, and a player who leaves
 * takes their row with them. The archive is written from the dedicated server's
 * own export after the night, which is the version that gets checked. Anything
 * here that disagrees with a match page is this being a snapshot, not the match
 * page being wrong.
 */
function Row({ player, rank }: { player: LivePlayer; rank: number }) {
  return (
    <li className="border-b border-basalt-800">
      <div className="flex items-baseline gap-2 py-1">
        <span className="w-3 shrink-0 font-display text-[0.625rem] tabular-nums text-steel-600">
          {rank}
        </span>
        {/*
          Linked only as a name, not as a claim that this is that player: names
          are not unique here and a live one has not been through the archive's
          matching. It is still the right link nine times in ten.
        */}
        <Link
          href={`/players/${encodeURIComponent(player.name)}`}
          className="min-w-0 flex-1 truncate text-xs text-steel-200 hover:text-rust-300"
        >
          {player.name}
        </Link>
        <span className="w-9 shrink-0 text-right font-mono text-xs tabular-nums text-steel-100">
          {player.score ?? "-"}
        </span>
        <span className="w-8 shrink-0 text-right font-mono text-xs tabular-nums text-steel-300">
          {player.kills ?? "-"}
        </span>
        <span className="w-8 shrink-0 text-right font-mono text-xs tabular-nums text-steel-500">
          {player.deaths ?? "-"}
        </span>
        <span className="w-6 shrink-0 text-right font-mono text-xs tabular-nums text-steel-400">
          {player.caps ?? "-"}
        </span>
      </div>
    </li>
  );
}

function Head() {
  return (
    <div className="flex items-baseline gap-2 border-b border-basalt-700 pb-1 font-display text-[0.5625rem] uppercase tracking-wider text-steel-600">
      <span className="w-3 shrink-0">#</span>
      <span className="min-w-0 flex-1">Player</span>
      <span className="w-9 shrink-0 text-right">Score</span>
      <span className="w-8 shrink-0 text-right">Frags</span>
      <span className="w-8 shrink-0 text-right">Deaths</span>
      <span className="w-6 shrink-0 text-right">Caps</span>
    </div>
  );
}

function Side({
  label,
  score,
  players,
  accent,
}: {
  label: string;
  score: number | null;
  players: LivePlayer[];
  accent: string;
}) {
  if (players.length === 0) return null;

  const ranked = [...players].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-2 pb-1">
        <span
          className={`font-display text-[0.625rem] font-bold uppercase tracking-widest ${accent}`}
        >
          {label}
        </span>
        {score !== null ? (
          <span className={`font-mono text-lg leading-none tabular-nums ${accent}`}>
            {score}
          </span>
        ) : null}
      </div>
      <Head />
      <ol>
        {ranked.map((player, index) => (
          <Row key={player.name} player={player} rank={index + 1} />
        ))}
      </ol>
    </div>
  );
}

export function LiveScoreboard({
  players,
  redScore,
  blueScore,
  teamBased,
}: {
  players: LivePlayer[];
  redScore: number;
  blueScore: number;
  teamBased: boolean;
}) {
  if (players.length === 0) return null;

  if (!teamBased) {
    const ranked = [...players].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    return (
      <div className="max-w-md">
        <Head />
        <ol>
          {ranked.map((player, index) => (
            <Row key={player.name} player={player} rank={index + 1} />
          ))}
        </ol>
      </div>
    );
  }

  return (
    <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
      <Side
        label="Red"
        score={redScore}
        accent="text-rust-400"
        players={players.filter((player) => player.team === "red")}
      />
      <Side
        label="Blue"
        score={blueScore}
        accent="text-cobalt-400"
        players={players.filter((player) => player.team === "blue")}
      />
    </div>
  );
}
