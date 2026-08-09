import { commissionFeature } from "@/app/admin/actions";

/**
 * Commission a feature.
 *
 * Three kinds because three questions keep coming up: what happened when
 * those two finally played together, what actually went on in that match,
 * and what is somebody's story so far. Each builds its own fact sheet from
 * the real scoreboards; the piece is written, fact checked and only kept if
 * it passes.
 *
 * Names are typed rather than picked from a list on purpose: the list would
 * be every player who has ever appeared, and the person commissioning a
 * feature already knows whose name they want.
 */
const FIELD =
  "w-full rounded-sm border border-basalt-600 bg-basalt-850 px-2 py-1.5 text-sm text-steel-100 placeholder:text-steel-700 focus:border-rust-500 focus:outline-none";
const LABEL = "figure-label mb-1 block";

export function FeatureAdmin() {
  return (
    <div className="mt-10 border-t border-basalt-800 pt-6">
      <h3 className="rule-heading">Commission a feature</h3>
      <p className="mt-2 max-w-3xl text-xs leading-relaxed text-steel-500">
        A longer piece about one subject, written from the match record and
        checked against it. Nothing writes these on a schedule &mdash; deciding
        something deserves an article is a judgement, and the model does not
        make it. Takes up to a minute and spends model quota, and the page
        lands on the finished piece.{" "}
        <strong className="text-steel-400">
          It is not posted to Discord
        </strong>
        , by anything, ever: that stays a separate decision.
      </p>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <form action={commissionFeature} className="plate grid gap-2 p-3">
          <input type="hidden" name="kind" value="pairing" />
          <p className="figure-label">Two players, side by side</p>
          <input name="a" required placeholder="ED ASSMASTER" className={FIELD} />
          <input name="b" required placeholder="Medeo" className={FIELD} />
          <p className="text-[0.6875rem] leading-snug text-steel-600">
            Every match they have played on the same side, in detail.
          </p>
          <button
            type="submit"
            className="mt-1 rounded-sm bg-rust-500 px-3 py-1.5 font-display text-xs font-semibold uppercase tracking-wider text-white hover:bg-rust-400"
          >
            Write it
          </button>
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
          <p className="text-[0.6875rem] leading-snug text-steel-600">
            The scoreboard, every capture with the clock on it, and what the
            scoreline does not tell you.
          </p>
          <button
            type="submit"
            className="mt-1 rounded-sm bg-rust-500 px-3 py-1.5 font-display text-xs font-semibold uppercase tracking-wider text-white hover:bg-rust-400"
          >
            Write it
          </button>
        </form>

        <form action={commissionFeature} className="plate grid gap-2 p-3">
          <input type="hidden" name="kind" value="player" />
          <p className="figure-label">One player, so far</p>
          <input name="name" required placeholder="Romek" className={FIELD} />
          <p className="text-[0.6875rem] leading-snug text-steel-600">
            Every match they have played, what they are good at, and the nights
            worth pointing at.
          </p>
          <button
            type="submit"
            className="mt-1 rounded-sm bg-rust-500 px-3 py-1.5 font-display text-xs font-semibold uppercase tracking-wider text-white hover:bg-rust-400"
          >
            Write it
          </button>
        </form>
      </div>
    </div>
  );
}
