import type { Metadata } from "next";

import { StubPage } from "@/components/stub-page";

export const metadata: Metadata = {
  title: "Events",
  description:
    "Red Faction tournaments, community nights and map jams, current and archived, including the Hall of Champions.",
};

export default function EventsPage() {
  return (
    <StubPage
      title="Events"
      phase={4}
      summary="Tournaments, community nights, map jams and anniversaries. The RF4U CTF hub folds in here, so brackets become the biggest kind of event rather than the only kind."
      planned={[
        "Tournament brackets, team rosters and results, current and archived",
        "The Hall of Champions, carried over intact",
        "Community nights and map jams, with a calendar you can subscribe to",
        "Event pages that link to the maps played, which link to their downloads",
        "One Discord login ties your profile, your uploads and your match history together",
        "The existing rftournaments URL kept as a redirect, so old links survive",
      ]}
    />
  );
}
