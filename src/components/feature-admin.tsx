import Link from "next/link";

import { commissionFeature, deleteFeature } from "@/app/admin/actions";
import { SubmitButton } from "@/components/submit-button";

/**
 * Commission a feature.
 *
 * Four kinds because four questions keep coming up: what happened when those
 * two finally played together, how it goes when they are against each other,
 * what actually went on in that match, and what is somebody's story so far.
 * Each builds its own fact sheet from the real scoreboards; the piece is
 * written, fact checked and only kept if it passes.
 *
 * Names are typed rather than picked from a list on purpose: the list would
 * be every player who has ever appeared, and the person commissioning a
 * feature already knows whose name they want.
 */
const FIELD =
  "w-full rounded-sm border border-basalt-600 bg-basalt-850 px-2 py-1.5 text-sm text-steel-100 placeholder:text-steel-700 focus:border-rust-500 focus:outline-none";
const LABEL = "figure-label mb-1 block";

/** What the list needs. A subset of a `feature_pieces` row. */
export type WrittenFeature = {
  slug: string;
  headline: string;
  subjects: unknown;
  createdAt: string;
};

export function FeatureAdmin({ written }: { written: WrittenFeature[] }) {
  return (
    <div className="mt-10 border-t border-basalt-800 pt-6">
      <h3 className="rule-heading">Commission a feature</h3>
      <p className="mt-2 max-w-4xl text-sm leading-relaxed text-steel-400">
        A longer piece about one subject, written from the match record and
        checked against it. Nothing writes these on a schedule &mdash; deciding
        something deserves an article is a judgement, and the model does not
        make it. <strong className="text-steel-400">Takes up to a minute</strong>{" "}
        and spends model quota; the button says so while it works, and the page
        lands on the finished piece.{" "}
        <strong className="text-steel-400">
          It is not posted to Discord
        </strong>
        , by anything, ever: that stays a separate decision.
      </p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <form action={commissionFeature} className="plate grid gap-2 p-3">
          <input type="hidden" name="kind" value="pairing" />
          <p className="figure-label">Two players, side by side</p>
          <input name="a" required placeholder="ED ASSMASTER" className={FIELD} />
          <input name="b" required placeholder="Medeo" className={FIELD} />
          <p className="text-xs leading-snug text-steel-400">
            Every match they have played on the same side, in detail.
          </p>
          <SubmitButton
            pendingLabel="Writing…"
            className="mt-1 rounded-sm bg-rust-500 px-3 py-1.5 font-display text-xs font-semibold uppercase tracking-wider text-white hover:bg-rust-400"
          >
            Write it
          </SubmitButton>
        </form>

        <form action={commissionFeature} className="plate grid gap-2 p-3">
          <input type="hidden" name="kind" value="rivalry" />
          <p className="figure-label">Two players, against each other</p>
          <input name="a" required placeholder="J!nX" className={FIELD} />
          <input name="b" required placeholder="$t!nX" className={FIELD} />
          <p className="text-xs leading-snug text-steel-400">
            Every match they have played on opposite sides, with the head to
            head. The record of which side came out ahead, not a claim about
            who is better.
          </p>
          <SubmitButton
            pendingLabel="Writing…"
            className="mt-1 rounded-sm bg-rust-500 px-3 py-1.5 font-display text-xs font-semibold uppercase tracking-wider text-white hover:bg-rust-400"
          >
            Write it
          </SubmitButton>
        </form>

        <form action={commissionFeature} className="plate grid gap-2 p-3">
          <input type="hidden" name="kind" value="match" />
          <p className="figure-label">One match, in full</p>
          <label className={LABEL} htmlFor="feature-match">
            Day and match, as it appears in the URL
          </label>
          <input
            id="feature-match"
            name="matchRef"
            required
            placeholder="2026-08-07/46"
            className={`${FIELD} font-mono`}
          />
          <p className="text-xs leading-snug text-steel-400">
            The scoreboard, every capture with the clock on it, and what the
            scoreline does not tell you.
          </p>
          <SubmitButton
            pendingLabel="Writing…"
            className="mt-1 rounded-sm bg-rust-500 px-3 py-1.5 font-display text-xs font-semibold uppercase tracking-wider text-white hover:bg-rust-400"
          >
            Write it
          </SubmitButton>
        </form>

        <form action={commissionFeature} className="plate grid gap-2 p-3">
          <input type="hidden" name="kind" value="player" />
          <p className="figure-label">One player, so far</p>
          <input name="name" required placeholder="Romek" className={FIELD} />
          <p className="text-xs leading-snug text-steel-400">
            Every match they have played, what they are good at, and the nights
            worth pointing at.
          </p>
          <SubmitButton
            pendingLabel="Writing…"
            className="mt-1 rounded-sm bg-rust-500 px-3 py-1.5 font-display text-xs font-semibold uppercase tracking-wider text-white hover:bg-rust-400"
          >
            Write it
          </SubmitButton>
        </form>
      </div>

      {/*
        What has already been written, which this page could not say.
        You could commission a piece and the only way to see it was to
        remember the URL you were redirected to, and the only way to remove a
        thin one was by hand in the database.
      */}
      <div className="mt-6">
        <p className="figure-label">
          Written so far
          {written.length > 0 ? (
            <span className="ml-2 font-mono normal-case tracking-normal text-steel-400">
              {written.length}
            </span>
          ) : null}
        </p>

        {written.length === 0 ? (
          <p className="mt-2 text-sm text-steel-400">
            Nothing yet. A commissioned piece appears here and at{" "}
            <Link href="/analyst" className="text-steel-300 hover:text-rust-300">
              the analyst&rsquo;s page
            </Link>
            .
          </p>
        ) : (
          <ul className="mt-2 grid gap-x-8 lg:grid-cols-2">
            {written.map((piece) => (
              <li
                key={piece.slug}
                className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-basalt-800 py-2"
              >
                <Link
                  href={`/analyst/features/${piece.slug}`}
                  className="min-w-0 flex-1 text-sm text-steel-200 hover:text-rust-300"
                >
                  {piece.headline}
                </Link>
                <span className="shrink-0 font-mono text-xs text-steel-500">
                  {piece.createdAt.slice(0, 10)}
                </span>
                <form action={deleteFeature} className="shrink-0">
                  <input type="hidden" name="slug" value={piece.slug} />
                  <button
                    type="submit"
                    className="font-display text-xs uppercase tracking-wider text-steel-400 hover:text-rust-400"
                  >
                    Delete
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
