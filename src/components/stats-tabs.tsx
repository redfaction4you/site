import { GameTabs } from "@/components/game-tabs";

/** The stats page's instance of the shared game tabs. */
export function StatsTabs({ active }: { active: "ctf" | "dm" }) {
  return <GameTabs ctfHref="/stats" dmHref="/stats/dm" active={active} />;
}
