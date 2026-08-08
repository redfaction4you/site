import Link from "next/link";

/**
 * The two games as tabs, shared by every page that has a side for each.
 *
 * A deathmatch frag and a CTF frag are different things and a page holding
 * both describes neither — so stats and maps each split in two, and this is
 * the one control that does the splitting. Links rather than client state:
 * each tab is a URL somebody can paste.
 *
 * Drawn as buttons, not underlined words — the first version was two bits of
 * small text and the owner could not tell they were controls at all.
 */
export function GameTabs({
  ctfHref,
  dmHref,
  active,
}: {
  ctfHref: string;
  dmHref: string;
  active: "ctf" | "dm";
}) {
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
      {tab(ctfHref, "Capture the Flag", active === "ctf")}
      {tab(dmHref, "Deathmatch", active === "dm")}
    </nav>
  );
}
