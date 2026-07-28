import type { Metadata } from "next";

import { StubPage } from "@/components/stub-page";

export const metadata: Metadata = {
  title: "Guides",
  description:
    "Written guides for installing custom Red Faction maps and models, using RED, packing levels and choosing a client.",
};

export default function GuidesPage() {
  return (
    <StubPage
      title="Guides"
      phase={2}
      summary="Our own documentation, written here rather than linked to a forum post from 2009 that may not load next year."
      planned={[
        "Installing custom maps, models and weapons, with exact paths for the Steam, GOG and disc releases",
        "Which client to install: Alpine, Dash, Pure and vanilla 1.21 compared on the facts",
        "Getting started with RED, the official level editor",
        "Packing a finished level into a .vpp",
        "Submitting your work to RedFaction4You",
        "The map compatibility matrix: which client plays what, and why",
      ]}
    />
  );
}
