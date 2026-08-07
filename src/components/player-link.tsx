import Link from "next/link";

/**
 * A player's name, linking to their record.
 *
 * Lived inside `match-detail.tsx` until the frag log moved to a page of its
 * own and needed it too. Its own file rather than an export from that
 * component, because it is used wherever a name appears and importing it from a
 * six-hundred-line view would pull that view into anything that wanted a link.
 *
 * A missing name renders as "unknown" rather than a dead link. The event log
 * carries a null killer for a death nobody caused, which is a fact worth
 * showing rather than an error worth hiding.
 */
export function PlayerLink({
  name,
  className,
}: {
  name: string | null;
  className?: string;
}) {
  if (!name) return <span className="text-steel-500">unknown</span>;
  return (
    <Link
      href={`/players/${encodeURIComponent(name)}`}
      className={className ?? "text-steel-200 hover:text-rust-300 hover:underline"}
    >
      {name}
    </Link>
  );
}
