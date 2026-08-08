import Link from "next/link";

/**
 * The two games, never on one board.
 *
 * A deathmatch frag and a CTF frag are different things and a board holding
 * both ranks neither — decided 7 August 2026, the same reasoning as the
 * separate tables underneath. Links rather than client state, the same trade
 * every filter on this site makes: each tab is a URL somebody can paste.
 */
export function StatsTabs({ active }: { active: "ctf" | "dm" }) {
  const tab = (href: string, label: string, current: boolean) => (
    <Link
      href={href}
      aria-current={current ? "page" : undefined}
      className={
        "border-b-2 px-1 pb-1.5 font-display text-xs font-semibold uppercase tracking-[0.18em] " +
        (current
          ? "border-rust-500 text-steel-100"
          : "border-transparent text-steel-500 hover:text-steel-300")
      }
    >
      {label}
    </Link>
  );

  return (
    <nav aria-label="Which game" className="mt-3 flex gap-5">
      {tab("/stats", "Capture the Flag", active === "ctf")}
      {tab("/stats/dm", "Deathmatch", active === "dm")}
    </nav>
  );
}
