import Link from "next/link";

/**
 * The two games, never on one board.
 *
 * A deathmatch frag and a CTF frag are different things and a board holding
 * both ranks neither — decided 7 August 2026, the same reasoning as the
 * separate tables underneath. Links rather than client state, the same trade
 * every filter on this site makes: each tab is a URL somebody can paste.
 *
 * Drawn as buttons, not underlined words. The first version was two bits of
 * small text and the owner could not tell they were controls at all — the
 * active game is a filled plate with the site's red on it, the other is a
 * bordered plate that visibly invites a press.
 */
export function StatsTabs({ active }: { active: "ctf" | "dm" }) {
  const tab = (href: string, label: string, current: boolean) => (
    <Link
      href={href}
      aria-current={current ? "page" : undefined}
      className={
        "rounded-sm border px-4 py-2 font-display text-sm font-bold uppercase tracking-[0.14em] transition-colors " +
        (current
          ? "border-rust-500 bg-rust-500/10 text-steel-100"
          : "border-basalt-600 bg-basalt-850 text-steel-400 hover:border-steel-500 hover:text-steel-200")
      }
    >
      {label}
    </Link>
  );

  return (
    <nav aria-label="Which game" className="mt-4 flex flex-wrap gap-2">
      {tab("/stats", "Capture the Flag", active === "ctf")}
      {tab("/stats/dm", "Deathmatch", active === "dm")}
    </nav>
  );
}
