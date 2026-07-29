/**
 * The guide index.
 *
 * Guides are hand-written pages, not database rows, because there will be a
 * dozen of them and each is prose rather than data. This file exists so the
 * index page and the individual guides cannot disagree about what exists.
 */

export type Guide = {
  slug: string;
  title: string;
  /** One line for the index. Written for a player, not a developer. */
  summary: string;
  /**
   * When the facts in it were last checked against a source. Guides about
   * software that is still being developed rot, and a guide that does not say
   * when it was last verified is asking to be trusted on nothing.
   */
  verifiedOn: string;
};

export const GUIDES: Guide[] = [
  {
    slug: "which-client",
    title: "Which client should I run?",
    summary:
      "Four ways to play a game from 2001, and which one to install in 2026. The short answer is Alpine Faction, and this explains why and where the others still make sense.",
    verifiedOn: "2026-07-28",
  },
  {
    slug: "compatibility",
    title: "The compatibility matrix",
    summary:
      "Which client loads which levels, by format version, and why some maps refuse to open. This is the table behind every badge in the catalogue.",
    verifiedOn: "2026-07-28",
  },
];

export function getGuide(slug: string): Guide | undefined {
  return GUIDES.find((guide) => guide.slug === slug);
}
