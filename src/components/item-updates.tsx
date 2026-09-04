import type { CatalogueItem } from "@/lib/catalogue";
import { displayVersion } from "@/lib/downloads";

/**
 * An item's changelog, newest first.
 *
 * A map is not published once. It is published, played, and fixed, and "what
 * changed in a6a" is a question a returning player actually asks. The
 * alternative, an edited description, answers it by destroying the answer to
 * every previous version of it.
 *
 * Plain text, deliberately. There is no markdown renderer on this site and
 * adding a dependency to format a changelog nobody wrote in markdown would be a
 * poor trade, so a body is rendered with its own line breaks intact and nothing
 * else. An author who typed asterisks gets asterisks, which is honest about what
 * was stored.
 */

/**
 * How many entries stand open before the rest are folded away.
 *
 * Three is what fits above the fold beside everything else on the page. The
 * fold only happens when it hides more than one, because a disclosure covering
 * a single entry costs a click to save two lines.
 */
const SHOWN = 3;

/**
 * `12 Mar 2003`, in UTC.
 *
 * Exported because the detail page writes `item.updatedAt` in the same column
 * of the same page, and two formatters is how one page ends up with two date
 * formats. Takes a `date` column's string as well as a timestamp's Date: the
 * archive stores both, and both are read as calendar days here.
 *
 * UTC rather than the reader's zone, on purpose. These are dates on a record
 * rather than moments in somebody's evening, and a release that moves to the
 * day before for readers west of Greenwich is a small lie about the archive.
 */
export function archiveDate(value: Date | string | null): string | null {
  if (!value) return null;

  // A plain calendar day is read at noon, so no timezone can tip it into its
  // neighbour. The match archive parses its own days exactly this way.
  const date = typeof value === "string" ? new Date(`${value}T12:00:00Z`) : value;
  if (Number.isNaN(date.getTime())) return null;

  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

function Entry({ update }: { update: CatalogueItem["updates"][number] }) {
  const version = displayVersion(update.releaseVersion);
  const released = archiveDate(update.releasedAt);

  return (
    <li className="border-l-2 border-basalt-700 pl-4">
      <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
        <h3 className="font-display text-sm font-semibold text-steel-100">
          {update.title}
        </h3>

        {version ? (
          <span className="rounded-sm border border-basalt-600 px-1.5 py-0.5 font-mono text-[0.625rem] text-steel-300">
            {version}
          </span>
        ) : null}

        {released ? (
          <span className="font-display text-[0.625rem] uppercase tracking-widest text-steel-400">
            {released}
          </span>
        ) : null}
      </div>

      {update.body ? (
        <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-steel-300">
          {update.body}
        </p>
      ) : null}
    </li>
  );
}

export function ItemUpdates({ updates }: { updates: CatalogueItem["updates"] }) {
  // An item with no changelog shows nothing at all. An empty heading reads as a
  // section that failed to load rather than one that has nothing to say.
  if (updates.length === 0) return null;

  // Already newest first out of `getItem`, which sorts the relation once for
  // every reader of it. Re-sorting here would be a second opinion on the same
  // question.
  const folded = updates.length > SHOWN + 1;
  const lead = folded ? updates.slice(0, SHOWN) : updates;
  const rest = folded ? updates.slice(SHOWN) : [];

  return (
    <section>
      <h2 className="font-display text-lg font-bold text-steel-100">Latest updates</h2>

      <ol className="mt-4 space-y-5">
        {lead.map((update) => (
          <Entry key={update.id} update={update} />
        ))}
      </ol>

      {/*
        A closed `<details>` still ships everything inside it, which is what made
        a match page 749 kB. What is inside this one is text, a few hundred bytes
        an entry, so it costs nothing worth moving to another route. Full size
        images are the thing that must never go here.
      */}
      {rest.length ? (
        <details className="mt-5">
          <summary className="cursor-pointer font-display text-xs uppercase tracking-widest text-steel-400 hover:text-steel-200">
            {rest.length} earlier update{rest.length === 1 ? "" : "s"}
          </summary>
          <ol className="mt-4 space-y-5">
            {rest.map((update) => (
              <Entry key={update.id} update={update} />
            ))}
          </ol>
        </details>
      ) : null}
    </section>
  );
}
