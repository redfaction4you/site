import Link from "next/link";

/**
 * A run of recent results, oldest to newest.
 *
 * The one thing a sports page shows that this site did not: whether somebody is
 * playing well *now*. A career total answers what they have ever done, and on a
 * squad list ranked by totals it is also partly a ranking of who turns up most,
 * so a reader had no way to tell a regular in poor form from a newcomer in good
 * form.
 *
 * Read left to right ending on the most recent, the way a run of results is
 * written everywhere else. A match with no recorded winner is a dash rather than
 * a loss, matching every other read path here.
 *
 * One component for both places it appears. The player page links each result to
 * its match and the squad list does not, which is the only difference between
 * them and not enough to justify two of these drifting apart.
 */

export type FormResult = {
  /** True won, false lost, null no result recorded. */
  won: boolean | null;
  /** Optional: makes the box a link to the match. */
  href?: string;
  title?: string;
};

export function FormRun({
  results,
  size = "sm",
}: {
  results: FormResult[];
  /** `sm` for a table cell, `md` where it leads a page. */
  size?: "sm" | "md";
}) {
  if (results.length === 0) return null;

  const box = size === "md" ? "h-6 w-6 text-[0.625rem]" : "h-4 w-4 text-[0.5rem]";

  const style = (won: boolean | null) =>
    `flex ${box} items-center justify-center rounded-sm border font-display font-bold uppercase leading-none ` +
    (won === null
      ? "border-basalt-600 bg-basalt-800 text-steel-500"
      : won
        ? "border-signal-green/50 bg-signal-green/20 text-signal-green"
        : "border-rust-700 bg-rust-500/10 text-rust-300");

  const letter = (won: boolean | null) => (won === null ? "–" : won ? "W" : "L");

  return (
    <ol
      className="flex gap-0.5"
      title={
        results.some((result) => result.title)
          ? undefined
          : results
              .map((result) =>
                result.won === null ? "no result" : result.won ? "won" : "lost",
              )
              .join(", ")
      }
    >
      {results.map((result, index) => (
        <li key={index}>
          {result.href ? (
            <Link
              href={result.href}
              title={result.title}
              className={`${style(result.won)} transition-transform hover:-translate-y-0.5`}
            >
              {letter(result.won)}
            </Link>
          ) : (
            <span className={style(result.won)} title={result.title}>
              {letter(result.won)}
            </span>
          )}
        </li>
      ))}
    </ol>
  );
}
