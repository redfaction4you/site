import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PlayerLink } from "@/components/player-link";
import { COLUMNIST_NAME } from "@/lib/ai/opinion";
import { getFeature, listFeatures } from "@/lib/ai/feature";

type Props = { params: Promise<{ slug: string }> };

export const revalidate = 300;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const piece = await getFeature(slug);
  if (!piece) return { title: "Not found" };
  return {
    title: piece.headline,
    description: piece.standfirst ?? undefined,
  };
}

export async function generateStaticParams() {
  const pieces = await listFeatures();
  return pieces.map((piece) => ({ slug: piece.slug }));
}

/**
 * One feature.
 *
 * Longer than a column and about one subject rather than one night, so it gets
 * the shape a long read wants: a standfirst, a comfortable measure, and the
 * matches it was written from listed at the foot. That last part is the
 * important one — a piece this detailed makes a great many claims, and every
 * one of them is checkable against a scoreboard on this site.
 */
export default async function FeaturePage({ params }: Props) {
  const { slug } = await params;
  const piece = await getFeature(slug);
  if (!piece) notFound();

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 pb-12">
      <p className="eyebrow">
        <Link href="/analyst" className="hover:text-rust-300">
          {COLUMNIST_NAME}
        </Link>
      </p>

      <h1 className="mt-2 font-display text-3xl font-bold leading-tight text-steel-100">
        {piece.headline}
      </h1>

      {piece.standfirst ? (
        <p className="mt-3 text-lg leading-relaxed text-steel-300">
          {piece.standfirst}
        </p>
      ) : null}

      {piece.subjects.length > 0 ? (
        <p className="mt-3 flex flex-wrap gap-x-3 gap-y-1 border-y border-basalt-800 py-2 text-sm">
          {piece.subjects.map((subject) => (
            <PlayerLink key={subject} name={subject} />
          ))}
        </p>
      ) : null}

      <div className="mt-5 space-y-4 text-base leading-relaxed text-steel-300">
        {piece.body
          .split(/\n{2,}/)
          .map((paragraph) => paragraph.trim())
          .filter(Boolean)
          .map((paragraph, i) => (
            <p key={i}>{paragraph}</p>
          ))}
      </div>

      <p className="mt-6 text-[0.6875rem] leading-relaxed text-steel-600">
        Written automatically from the match record
        {piece.model ? ` by ${piece.model}` : ""}, and checked against it before
        it was kept. It can only use figures the server recorded.
      </p>

      {piece.matchRefs.length > 0 ? (
        <section className="mt-8 border-t border-basalt-800 pt-4">
          <h2 className="rule-heading">Written from these matches</h2>
          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
            {piece.matchRefs.map((ref) => {
              const [archiveDay, sourceMatchId] = ref.split("/");
              return (
                <li key={ref} className="text-sm">
                  <Link
                    href={`/matches/${archiveDay}/${sourceMatchId}`}
                    className="text-steel-300 hover:text-rust-300"
                  >
                    {archiveDay} &middot; match {sourceMatchId}
                  </Link>
                </li>
              );
            })}
          </ul>
          <p className="mt-2 text-[0.6875rem] leading-snug text-steel-600">
            Every claim above comes from these scoreboards, so every one of them
            can be checked.
          </p>
        </section>
      ) : null}
    </div>
  );
}
