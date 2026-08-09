import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import { dayLabel } from "@/components/match-archive";
import {
  COLUMNIST_BIO,
  COLUMNIST_NAME,
  COLUMNIST_NOTE,
  COLUMNIST_ROLE,
} from "@/lib/ai/opinion";
import { listOpinions } from "@/lib/matches/queries";
import { listFeatures } from "@/lib/ai/feature";

export const metadata: Metadata = {
  title: COLUMNIST_NAME,
  description: `${COLUMNIST_NAME} is a machine written opinion column about who plays alongside whom on the RedFaction4You server.`,
};

export const dynamic = "force-dynamic";

/**
 * Everything the columnist has written, and who he is supposed to be.
 *
 * A byline that goes nowhere is a byline nobody trusts, and his pieces were only
 * reachable by finding the night they were filed under. This is the page the
 * name points at.
 *
 * The bio is a joke and the correction underneath it is not. That ordering is
 * deliberate: a fictional backstory on a site whose argument is that its
 * information can be trusted only works if the fiction is obviously fiction and
 * the plain statement travels with it rather than sitting at the bottom.
 */
export default async function AnalystPage() {
  const [pieces, features] = await Promise.all([listOpinions(), listFeatures()]);

  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <p className="eyebrow">Opinion</p>

      <div className="mt-3 flex flex-wrap items-start gap-5 border-b-2 border-basalt-700 pb-6">
        <Image
          src="/mr-mesh.png"
          alt=""
          width={120}
          height={120}
          priority
          className="h-28 w-28 shrink-0 rounded-sm border border-basalt-600 object-cover object-top"
        />

        <div className="min-w-0 flex-1">
          <h1 className="font-display text-3xl font-bold text-steel-100">
            {COLUMNIST_NAME}
          </h1>
          <p className="mt-1 font-display text-[0.6875rem] uppercase tracking-widest text-oxide-400">
            {COLUMNIST_ROLE}
          </p>

          <div className="mt-3 max-w-2xl space-y-2 text-sm leading-relaxed text-steel-300">
            {COLUMNIST_BIO.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </div>

          {/* The correction, immediately under the joke rather than beneath the
              articles, because a reader who skims should not get one without
              the other. */}
          <p className="mt-3 max-w-2xl border-l-2 border-basalt-600 pl-3 text-xs leading-relaxed text-steel-500">
            None of that is true, because he is not a person. {COLUMNIST_NOTE}
          </p>
        </div>
      </div>

      {/*
        The features, above the nightly columns.
        Two kinds of writing on one page: the column that follows a night, and
        the longer pieces about one subject. Features lead because there are
        few of them and each was commissioned deliberately, where a column
        arrives every time anybody plays.
      */}
      {features.length > 0 ? (
        <section className="mt-8">
          <h2 className="section-heading">Features</h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-steel-400">
            Longer pieces about one thing: a pairing, a match, somebody&rsquo;s
            run of form. Written on request rather than on a schedule, and
            built from the scoreboards they link to.
          </p>
          <ul className="mt-4 space-y-4">
            {features.map((feature) => (
              <li key={feature.slug} className="border-b border-basalt-800 pb-4">
                <Link href={`/analyst/features/${feature.slug}`} className="group">
                  <h3 className="font-display text-xl font-bold leading-snug text-steel-100 group-hover:text-rust-300">
                    {feature.headline}
                  </h3>
                  {feature.standfirst ? (
                    <p className="mt-1 text-sm leading-relaxed text-steel-400">
                      {feature.standfirst}
                    </p>
                  ) : null}
                </Link>
                <p className="mt-1 font-mono text-[0.6875rem] text-steel-600">
                  {feature.subjects.join(", ")} ·{" "}
                  {feature.matchRefs.length}{" "}
                  {feature.matchRefs.length === 1 ? "match" : "matches"}
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {pieces.length === 0 ? (
        <p className="mt-8 text-sm text-steel-500">
          He has not written anything yet. A piece follows a night once there is
          enough on record to have a view about.
        </p>
      ) : (
        <ol className="mt-8 space-y-8">
          {pieces.map((piece) => (
            <li key={piece.archiveDay}>
              <article className="plate border-l-2 border-l-oxide-500 p-5">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <h2 className="font-display text-lg font-bold leading-snug text-steel-100">
                    {piece.headline}
                  </h2>
                  <Link
                    href={`/news/${piece.archiveDay}`}
                    className="shrink-0 font-mono text-xs text-steel-500 hover:text-rust-300"
                  >
                    {dayLabel(piece.archiveDay)}
                  </Link>
                </div>

                <div className="mt-3 space-y-3 text-sm leading-relaxed text-steel-300">
                  {piece.body
                    .split(/\n{2,}/)
                    .map((paragraph) => paragraph.trim())
                    .filter(Boolean)
                    .map((paragraph, index) => (
                      <p key={index}>{paragraph}</p>
                    ))}
                </div>

                <p className="mt-3 text-[0.6875rem] text-steel-600">
                  Written from {piece.matchCount}{" "}
                  {piece.matchCount === 1 ? "match" : "matches"} on record
                  {piece.model ? ` by ${piece.model}` : ""}.
                </p>
              </article>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
