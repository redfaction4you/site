import Link from "next/link";

import type { MapReview } from "@/lib/map-opinions";
import { SERVERS } from "@/lib/servers";

/**
 * What players told the server ghost about the maps: the review list.
 *
 * The owner, 27 September 2026, wanted the ghost to ask what people think of
 * a map and keep the dislikes "on a remove list that we can review". This is
 * that list. It removes nothing: a map that should go comes out of the
 * rotation by hand, in the server's config and its map pack below.
 */
const DAY = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", day: "numeric", month: "short" });

export function MapOpinionsAdmin({ reviews }: { reviews: MapReview[] }) {
  const serverName = (slug: string) => SERVERS.find((server) => server.slug === slug)?.name ?? slug;
  const disliked = reviews.filter((review) => review.dislikes > 0);

  return (
    <div className="mt-10 border-t border-basalt-800 pt-6">
      <h3 className="rule-heading">What players think of the maps</h3>
      <p className="mt-2 max-w-4xl text-sm leading-relaxed text-steel-400">
        Wisp asks players what they think of the map they are on, and notes what
        they say unprompted. The most disliked maps are first. Each player counts
        once per map, by what they said last. Nothing is taken out of a rotation
        automatically: this is a list to read, and a map that should go comes out
        of the server&rsquo;s config and its map pack by hand.
      </p>

      {reviews.length === 0 ? (
        <p className="mt-4 text-sm text-steel-400">No opinions yet. Wisp only just started asking.</p>
      ) : (
        <>
          <p className="mt-3 font-mono text-xs text-steel-400">
            {reviews.length} {reviews.length === 1 ? "map" : "maps"} with opinions · {disliked.length} disliked by somebody
          </p>
          <ul className="mt-3 space-y-3">
            {reviews.map((review) => (
              <li
                key={`${review.server}/${review.filename}`}
                className={`plate border-l-2 p-3 ${review.dislikes > review.likes ? "border-l-rust-500" : "border-l-basalt-700"}`}
              >
                <p className="text-sm text-steel-200">
                  <span className="font-semibold">{review.title}</span>{" "}
                  <span className="text-steel-400">
                    on{" "}
                    <Link href={`/servers/${review.server}`} className="hover:text-rust-300">
                      {serverName(review.server)}
                    </Link>
                  </span>
                </p>
                <p className="mt-1 font-mono text-xs text-steel-400">
                  {review.filename} · {review.dislikes} dislike · {review.likes} like · {review.mixed} mixed
                </p>
                <ul className="mt-2 space-y-1">
                  {review.said.slice(0, 6).map((said, index) => (
                    <li key={index} className="text-xs leading-snug text-steel-400">
                      <span className="text-steel-300">{said.player}</span>{" "}
                      <span className={said.verdict === "dislike" ? "text-rust-400" : said.verdict === "like" ? "text-steel-300" : "text-steel-400"}>
                        {said.verdict}
                      </span>
                      {said.reason ? <>: {said.reason}</> : null}
                      <span className="text-steel-400"> · {DAY.format(said.at)}</span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
