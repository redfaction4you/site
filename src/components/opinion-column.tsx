import Image from "next/image";

import { COLUMNIST_NAME, COLUMNIST_NOTE, COLUMNIST_ROLE } from "@/lib/ai/opinion";

/**
 * Stanley Mesh's opinion piece, under the night it follows.
 *
 * Visually apart from the column above it, and that separation is the point.
 * Everything else on this site reports and is checkable; this has a view, and a
 * view cannot be checked the way a scoreline can. A reader who cannot tell which
 * they are reading has been misled by the layout even if every word is careful.
 *
 * The byline says machine written on the piece itself rather than in a footnote.
 * That was decided before the column existed and is recorded in the handover: a
 * human sounding name is the one thing that quietly undoes the labelling
 * everything else here carries, so the name and the disclosure travel together.
 */
export function OpinionColumn({
  piece,
  className = "",
}: {
  piece: {
    headline: string;
    body: string;
    matchCount: number;
    model: string | null;
  } | null;
  className?: string;
}) {
  if (!piece) return null;

  return (
    <section
      className={`plate border-l-2 border-l-oxide-500 p-5 ${className}`}
      aria-labelledby="orion-headline"
    >
      {/*
        The byline, with the face.

        A photograph of a journalist would have been the one thing that quietly
        undoes the labelling: a real looking person implies a real person wrote
        it. This is a screenshot of a character from the game, visibly low poly
        and visibly of 2001, which reads as a character rather than a
        correspondent. The surname does the same work, a mesh being a 3D model,
        while the first name keeps him a character rather than a system.

        The disclosure travels with the name rather than sitting in a footnote,
        so the two cannot be separated by a skim.
      */}
      <div className="flex items-center gap-3">
        <Image
          src="/mr-mesh.png"
          alt=""
          width={44}
          height={44}
          className="h-11 w-11 shrink-0 rounded-sm border border-basalt-600 object-cover object-top"
        />
        <div className="min-w-0">
          <p className="font-display text-[0.625rem] font-bold uppercase tracking-[0.24em] text-oxide-400">
            Opinion
          </p>
          <p className="font-display text-sm font-bold text-steel-100">
            {COLUMNIST_NAME}
          </p>
          <p className="font-display text-[0.5625rem] uppercase tracking-widest text-steel-600">
            {COLUMNIST_ROLE} · written by a machine
          </p>
        </div>
      </div>

      <h2
        id="orion-headline"
        className="mt-2 font-display text-xl font-bold leading-snug text-steel-100"
      >
        {piece.headline}
      </h2>

      <div className="mt-3 space-y-3 text-sm leading-relaxed text-steel-300">
        {piece.body
          .split(/\n{2,}/)
          .map((paragraph) => paragraph.trim())
          .filter(Boolean)
          .map((paragraph, index) => (
            <p key={index}>{paragraph}</p>
          ))}
      </div>

      <p className="mt-4 border-t border-basalt-700 pt-3 text-[0.6875rem] leading-relaxed text-steel-600">
        {COLUMNIST_NOTE}
        {piece.model ? ` Written by ${piece.model}` : ""}
        {piece.model ? `, from ${piece.matchCount} matches on record.` : ""}
      </p>
    </section>
  );
}
