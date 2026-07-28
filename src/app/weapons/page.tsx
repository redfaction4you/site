import type { Metadata } from "next";

import { StubPage } from "@/components/stub-page";

export const metadata: Metadata = {
  title: "Weapons",
  description:
    "Custom weapons and weapon skins for Red Faction, hosted permanently and free to download.",
};

export default function WeaponsPage() {
  return (
    <StubPage
      title="Custom weapons &amp; skins"
      phase={2}
      summary="Reskins of the stock arsenal, entirely new weapons, and the packs that replace the lot in one go."
      planned={[
        "Split by what a file actually changes: appearance only, or behaviour too",
        "A clear warning on anything that alters damage or fire rate, since that decides whether it is usable online",
        "Preview renders and, where it matters, a short clip of the weapon firing",
        "Install instructions with exact paths per store release",
        "Permanent download URLs, virus scanning and hash deduplication on every upload",
      ]}
    />
  );
}
