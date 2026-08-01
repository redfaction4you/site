/**
 * What the archive cannot know, supplied by the people who were there.
 *
 * Everything else the columnist is given is computed from the record. This file
 * is the exception and is the only one: hand written background about how this
 * server actually runs and who these players are, because some of it changes
 * what the numbers mean and none of it is derivable from them.
 *
 * The case for it is one specific failure. Stanley Mesh kept asking why the two
 * best players are never put on the same side, and treated it as an oversight
 * worth needling people about. It is the opposite: they are split on purpose,
 * because putting them together produces a match nobody enjoys. Reading that
 * pattern off the data alone, the wrong answer is the obvious one, so the
 * columnist was reliably confident and wrong about the single thing he writes
 * about most.
 *
 * The trade this makes, stated plainly because it cuts against the rest of the
 * site: none of this is checkable against the archive. It is community
 * knowledge, and it is here on the word of the people who play. That is why it
 * is confined to the one part of the site that is labelled as opinion, why it is
 * a short file a person can read in full and correct, and why the prompt tells
 * the columnist to treat it as context rather than as findings. It must never be
 * fed to anything that reports.
 *
 * **Keep it factual and keep it short.** Roles and history, not praise. A note
 * that reads as a compliment will come back as a claim in a column.
 */

/**
 * How sides get picked, which is the fact that explains most of the pairing
 * record.
 *
 * Written as prose rather than as a rule the code enforces, because the code
 * cannot check it: the archive records who was on which side and never why.
 */
export const HOW_SIDES_ARE_PICKED = `The strongest players are deliberately split
across the two sides before a match. This server has a handful of very good
players and a lot of players in between, and putting the best ones together
produces a one sided game nobody enjoys. So the strongest players are usually
found opposite each other rather than alongside, and a newer player is often put
with a strong one to even the sides up. A pairing that has never happened is
usually a balancing decision and not an oversight, and two players who keep
ending up on opposite sides are usually being kept apart on purpose.`;

export type PlayerNote = {
  /** lower(name), matching how every player query groups. */
  nameKey: string;
  /** How the name is written, for reference when correcting this file. */
  name: string;
  /** Role and background. Plain, factual, one or two sentences. */
  note: string;
};

/**
 * Background on individual players.
 *
 * Only add somebody when there is something true and specific to say. An entry
 * that says a player is good is worse than no entry: it is unfalsifiable, and it
 * is exactly the kind of sentence that comes back dressed up as a finding.
 */
export const PLAYER_NOTES: PlayerNote[] = [
  {
    nameKey: "medeo",
    name: "Medeo",
    note: "An old school CTF player who has been in the game a long time. A flag carrier by nature and known as a capper.",
  },
  {
    nameKey: "ed assmaster",
    name: "ED ASSMASTER",
    note: "An old school CTF player who has been in the game a long time. A defender by nature: they can and do capture, but defence is what they are known for.",
  },
  {
    nameKey: "sid",
    name: "SiD",
    note: "An old school CTF player who has been in the game a long time.",
  },
  {
    nameKey: "romek",
    name: "Romek",
    note: "Came to CTF from level design, where they were a top tier mapper, and learned to play in order to build better CTF maps. Won a CTF mapping competition, and made Ankh and Huna, two of the most played custom CTF maps ever made. They never request their own maps, and other people request them anyway. Newer to playing CTF than the long standing players, which is why they were often put alongside a strong player while finding their feet. Known as a capper.",
  },
];

/** The notes for a given set of players, in the order the names were given. */
export function notesFor(names: string[]): PlayerNote[] {
  const wanted = names.map((name) => name.toLowerCase());
  return wanted
    .map((key) => PLAYER_NOTES.find((entry) => entry.nameKey === key))
    .filter((entry): entry is PlayerNote => entry !== undefined);
}

/**
 * The background block for a prompt, or an empty string when nothing is known
 * about anybody involved.
 *
 * Labelled inside the prompt as well as here, so the model is never left to
 * guess which of its facts came from the record and which came from a person.
 */
export function loreFor(names: string[]): string {
  const notes = notesFor(names);

  const lines = [
    "BACKGROUND, from the people who run and play on this server.",
    "This is context, not measurement. None of it is in the match data and none",
    "of it can be checked against the record, so use it to understand what you",
    "are looking at and never as evidence for a claim. Do not quote it as though",
    "it were a statistic, and do not add to it.",
    "",
    HOW_SIDES_ARE_PICKED.replace(/\n/g, " ").trim(),
  ];

  if (notes.length > 0) {
    lines.push("");
    lines.push("What is known about the players involved:");
    for (const note of notes) lines.push(`  ${note.name}: ${note.note}`);
    lines.push("");
    lines.push(
      "Anybody not listed here has no background on file. That means nothing is " +
        "known about them, not that there is nothing to know, so say nothing " +
        "about their history or their role.",
    );
  }

  return lines.join("\n");
}
