import { footageForMatch } from "@/lib/match-footage";

/**
 * A mark on a match that somebody filmed.
 *
 * Footage lives on the match page and under the night's column, which is the
 * right place to watch it and the wrong place to discover it: knowing which of
 * six matches had a camera on it meant opening all six. This is the same shape
 * wherever a match is listed, so the answer is visible from the list.
 *
 * Deliberately not a link. It marks the match, and the match is already a link
 * to the page the video sits on. A second target inside the first is a smaller
 * thing to hit and a worse place to land.
 */
export async function FootageMark({
  archiveDay,
  sourceMatchId,
  className = "",
}: {
  archiveDay: string;
  sourceMatchId: number;
  className?: string;
}) {
  if ((await footageForMatch(archiveDay, sourceMatchId)).length === 0) return null;

  return (
    <span
      title="Somebody recorded this match"
      aria-label="Recorded"
      className={`inline-flex shrink-0 items-center text-rust-400 ${className}`}
    >
      <svg viewBox="0 0 12 12" className="h-3 w-3" fill="currentColor" aria-hidden="true">
        <path d="M1.6 1.4a.6.6 0 0 1 .92-.5l7.2 4.6a.6.6 0 0 1 0 1l-7.2 4.6a.6.6 0 0 1-.92-.5Z" />
      </svg>
    </span>
  );
}
