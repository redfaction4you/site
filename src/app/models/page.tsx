import type { Metadata } from "next";

import { StubPage } from "@/components/stub-page";

export const metadata: Metadata = {
  title: "Models",
  description:
    "Custom player models and character skins for Red Faction, hosted permanently and free to download.",
};

export default function ModelsPage() {
  return (
    <StubPage
      title="Player models &amp; skins"
      phase={2}
      summary="Custom character models and player skins, from faithful reskins of the originals to things nobody at Volition would recognise."
      planned={[
        "Filter by type: full models, reskins of stock characters, team-coloured variants",
        "Preview renders rather than just a filename, so you can see it before you download",
        "Install instructions with exact paths for the Steam, GOG and disc releases",
        "Notes on which models work in multiplayer and which are singleplayer only",
        "Permanent download URLs, virus scanning and hash deduplication on every upload",
      ]}
    />
  );
}
