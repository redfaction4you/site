/**
 * Putting one person's name back into text that used another of their names.
 *
 * Names on this server are neither unique nor stable. `identities.ts` groups a
 * person's rows however many names they played under, which fixes every total
 * on the site and none of the prose: a kill in the event log, a capture's assist
 * list, a sentence the server composed and a paragraph a model wrote all carry a
 * bare name with no identity beside it. Ten of those were on production, the
 * plainest being a front page reading "Special ED" above a results strip that
 * said Romek.
 *
 * Deliberately free of imports so `node --test` can load it directly, the same
 * arrangement `pairings.ts`, `weapons.ts` and `accuracy.ts` use.
 */

/**
 * Characters that are part of a name here rather than punctuation around one.
 *
 * `!`, `$` and `}` all appear inside real names on this server: `$t!nX`,
 * `J!nX`, `T1k}super`. Treating them as boundaries would let `s9` match inside
 * `s9!nX` and leave `Skuldug!nX` behind, which is worse than the problem.
 */
const NAME_CHAR = "\\w!$}";

/**
 * What may follow a name and still be part of it.
 *
 * `!` is the awkward one. It is inside `$t!nX` and `J!nX`, so it cannot be a
 * boundary, and it also ends sentences, so it cannot not be one. The rule that
 * settles both: a `!` continues a name only when something name-like follows
 * it. `s9` inside `s9!nX` is refused because `!n` continues; `skrub!` at the end
 * of a sentence is allowed because nothing does.
 */
const NAME_CONTINUES = `[\\w$}]|![\\w$}]`;

/** Escapes a name for use in a pattern. `$t!nX` and `<>cDc<>KILLaXxX` are real. */
function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Replaces every alias in a string with the name its owner is known by.
 *
 * `aliases` maps a lowercased name to the canonical one. A name that is already
 * canonical is still passed over, and deliberately: matching is case
 * insensitive and the canonical spelling is what comes out, so this also
 * settles the case drift that had somebody "Sid" in one sentence and "SiD" in
 * the next.
 *
 * Longest alias first, so a short name that is a prefix of a longer one cannot
 * consume it.
 */
export function renameInText(text: string, aliases: Map<string, string>): string {
  if (!text) return text;

  let out = text;

  const ordered = [...aliases.entries()].sort((a, b) => b[0].length - a[0].length);

  for (const [alias, name] of ordered) {
    out = out.replace(
      new RegExp(
        `(^|[^${NAME_CHAR}])(${escape(alias)})(?!${NAME_CONTINUES})`,
        "gi",
      ),
      `$1${name}`,
    );
  }

  return out;
}
