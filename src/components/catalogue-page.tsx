import Link from "next/link";

import { listItems, listTags, type CatalogueFilters, type KindMeta } from "@/lib/catalogue";
import { DISCORD_INVITE } from "@/lib/nav";
import { ALL_CLIENTS, CLIENT_LABELS, type RfClient } from "@/lib/rfl/clients";
import { ItemCard } from "@/components/item-card";

/**
 * One listing page, shared by all five catalogue sections.
 *
 * Filters are plain links carrying query parameters rather than client-side
 * state. That keeps every filtered view a real URL somebody can bookmark or
 * paste into Discord, which matters more here than a slicker interaction: this
 * is an archive, and its whole value is that links to it keep working.
 */

function isClient(value: string | undefined): value is RfClient {
  return Boolean(value) && ALL_CLIENTS.includes(value as RfClient);
}

function FilterLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={
        "rounded-sm border px-2.5 py-1 font-display text-xs font-semibold uppercase tracking-wider transition-colors " +
        (active
          ? "border-rust-500 bg-rust-500/15 text-rust-300"
          : "border-basalt-700 bg-basalt-850 text-steel-400 hover:border-basalt-600 hover:text-steel-200")
      }
    >
      {children}
    </Link>
  );
}

function EmptyState({ meta }: { meta: KindMeta }) {
  return (
    <div className="panel mt-10 p-8 text-center">
      <h2 className="font-display text-xl font-bold text-steel-100">
        {meta.emptyHeading}
      </h2>
      <p className="mx-auto mt-3 max-w-lg text-sm leading-relaxed text-steel-400">
        {meta.emptyBody}
      </p>
      <a
        href={DISCORD_INVITE}
        target="_blank"
        rel="noreferrer noopener"
        className="mt-6 inline-block rounded-sm bg-rust-500 px-5 py-2.5 font-display text-sm font-semibold uppercase tracking-wider text-white transition-colors hover:bg-rust-400"
      >
        Got files to contribute?
      </a>
    </div>
  );
}

function NoMatches({ meta }: { meta: KindMeta }) {
  return (
    <div className="panel mt-10 p-8 text-center">
      <h2 className="font-display text-lg font-bold text-steel-100">
        Nothing matches those filters
      </h2>
      <p className="mt-3 text-sm text-steel-400">
        <Link
          href={meta.route}
          className="text-rust-400 underline underline-offset-4 hover:text-rust-300"
        >
          Clear them and see everything
        </Link>
      </p>
    </div>
  );
}

export async function CataloguePage({
  meta,
  searchParams,
}: {
  meta: KindMeta;
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const one = (key: string) => {
    const value = searchParams[key];
    return Array.isArray(value) ? value[0] : value;
  };

  const filters: CatalogueFilters = {
    q: one("q") || undefined,
    tag: one("tag") || undefined,
    client: isClient(one("client")) ? (one("client") as RfClient) : undefined,
  };

  const [entries, tags] = await Promise.all([
    listItems(meta.kind, filters),
    listTags(meta.kind),
  ]);

  const filtered = Boolean(filters.q || filters.tag || filters.client);

  // Whether anything exists at all, as opposed to nothing matching. These need
  // different copy: one is "we have not filled this in yet", the other is
  // "your filters are too narrow", and conflating them is confusing.
  const anyPublished = filtered ? tags.length > 0 || entries.length > 0 : entries.length > 0;

  const withParam = (key: string, value: string | undefined) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(filters)) {
      if (v && k !== key) params.set(k, String(v));
    }
    if (value) params.set(key, value);
    const query = params.toString();
    return query ? `${meta.route}?${query}` : meta.route;
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-16">
      <p className="eyebrow">{meta.eyebrow}</p>
      <h1 className="mt-2 font-display text-4xl font-bold text-steel-100">
        {meta.title}
      </h1>
      <p className="mt-4 max-w-2xl text-lg leading-relaxed text-steel-300">
        {meta.intro}
      </p>

      {anyPublished ? (
        <div className="mt-8 space-y-3">
          {meta.hasLevels ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="mr-1 font-display text-xs uppercase tracking-widest text-steel-500">
                Plays on
              </span>
              {ALL_CLIENTS.map((client) => (
                <FilterLink
                  key={client}
                  href={withParam(
                    "client",
                    filters.client === client ? undefined : client,
                  )}
                  active={filters.client === client}
                >
                  {CLIENT_LABELS[client]}
                </FilterLink>
              ))}
            </div>
          ) : null}

          {tags.length ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="mr-1 font-display text-xs uppercase tracking-widest text-steel-500">
                Tags
              </span>
              {tags.map(({ tag, count }) => (
                <FilterLink
                  key={tag}
                  href={withParam("tag", filters.tag === tag ? undefined : tag)}
                  active={filters.tag === tag}
                >
                  {tag} <span className="text-steel-500">{count}</span>
                </FilterLink>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {entries.length === 0 ? (
        filtered ? (
          <NoMatches meta={meta} />
        ) : (
          <EmptyState meta={meta} />
        )
      ) : (
        <>
          <p className="mt-8 text-sm text-steel-500">
            {entries.length} {entries.length === 1 ? meta.noun : `${meta.noun}s`}
            {filtered ? " matching" : ""}
          </p>
          <ul className="mt-6 grid gap-x-6 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
            {entries.map((item) => (
              <ItemCard key={item.id} item={item} meta={meta} />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
