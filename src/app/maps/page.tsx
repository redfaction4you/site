import type { Metadata } from "next";

import { StubPage } from "@/components/stub-page";

export const metadata: Metadata = {
  title: "Maps",
  description:
    "The RedFaction4You map catalogue, with compatibility badges showing which clients can load each level.",
};

export default function MapsPage() {
  return (
    <StubPage
      title="Maps"
      phase={2}
      summary="A browsable, permanently hosted catalogue of Red Faction levels, filterable by gametype, pack, author and the client features a map needs."
      planned={[
        "Filter by gametype, map pack, author and required client features",
        "Detail pages with a screenshot gallery, download and rotation badge",
        "Automatic compatibility detection: we read the RFL version at upload and tell you which clients can load it",
        "Permanent download URLs so Discord posts and server configs never rot",
        "A public compatibility matrix showing exactly which client plays what",
      ]}
    />
  );
}
