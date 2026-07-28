import type { Metadata } from "next";

import { StubPage } from "@/components/stub-page";

export const metadata: Metadata = {
  title: "Mods",
  description: "Red Faction mods, hosted permanently and free to download.",
};

export default function ModsPage() {
  return (
    <StubPage
      title="Mods"
      phase={2}
      summary="Total conversions, weapon packs and gameplay mods, hosted on our own storage rather than borrowed from somewhere that might disappear."
      planned={[
        "Same catalogue engine as maps: filtering, detail pages, permanent URLs",
        "Install instructions with exact paths for the Steam, GOG and disc releases",
        "Version history, so an older build stays reachable when a new one breaks something",
        "Virus scanning and hash deduplication on every upload",
      ]}
    />
  );
}
