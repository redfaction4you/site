import type { Metadata } from "next";
import Link from "next/link";

import { countByKind } from "@/lib/catalogue";
import { SECTIONS } from "@/lib/downloads";
import { DISCORD_INVITE } from "@/lib/nav";

export const metadata: Metadata = {
  title: "Downloads",
  description:
    "Maps, assets, mods and tools for Red Faction (2001). Free, no account needed, hosted here so the links keep working.",
};

/*
 * An hour stale, the same trade the detail pages make.
 *
 * The only thing on this page that moves between deploys is the count on each
 * card, and a shelf that gained a map twenty minutes ago reading one short is
 * not a fault anybody can see. Without this the page would be built once and
 * the counts would be frozen at whatever they were the day it shipped, which is
 * the version of wrong that never corrects itself.
 */
export const revalidate = 3600;

/**
 * The way in to the downloads, which the owner asked for as one page.
 *
 * Four shelves that are one table underneath, so the temptation is to render
 * them as one long list. They are separate here because they answer different
 * questions: you come looking for a level to play, or for a model to build
 * with, or for the editor. A card each, with the facets underneath, means the
 * common case is two clicks and the URL you land on is one you can paste.
 */
export default async function DownloadsPage() {
  const counts = await countByKind();

  return (
    <div className="mx-auto max-w-5xl px-4 py-16">
      <p className="eyebrow">Archive</p>
      <h1 className="mt-2 font-display text-4xl font-bold text-steel-100">
        Downloads
      </h1>
      <p className="mt-4 max-w-2xl text-lg leading-relaxed text-steel-300">
        Everything the community built for Red Faction, kept in one place. All of
        it is free, none of it needs an account, and every file is held on this
        site rather than linked somewhere else, so a download that is here stays
        here.
      </p>

      <div className="mt-10 grid gap-5 sm:grid-cols-2">
        {SECTIONS.map((section) => {
          const count = counts[section.kind] ?? 0;

          return (
            <section key={section.id} className="plate p-5">
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="font-display text-xl font-bold">
                  <Link
                    href={section.route}
                    className="text-steel-100 transition-colors hover:text-rust-400"
                  >
                    {section.title}
                  </Link>
                </h2>
                {/*
                  The count says what is actually on the shelf, including when
                  that is nothing. An empty section that says so beats one that
                  looks full until it is opened.
                */}
                <p className="shrink-0 font-mono text-[0.625rem] uppercase tracking-widest text-steel-400">
                  {count === 0
                    ? "Empty so far"
                    : `${count} ${count === 1 ? section.noun : section.pluralNoun}`}
                </p>
              </div>

              <p className="mt-2 text-sm leading-relaxed text-steel-400">
                {section.tagline}
              </p>

              {/*
                Facets as links rather than as anything clever. Each one is a
                real URL, which is the same rule the listing pages follow: a
                reader can send somebody straight to the CTF maps.
              */}
              <div className="mt-4 flex flex-wrap gap-1.5">
                {section.categories.length > 0 ? (
                  section.categories.map((category) => (
                    <Link
                      key={category.id}
                      href={`${section.route}?type=${category.id}`}
                      className="rounded-sm border border-basalt-600 px-2 py-1 font-display text-[0.625rem] font-semibold uppercase tracking-widest text-steel-400 transition-colors hover:border-rust-500 hover:text-rust-300"
                    >
                      {category.label}
                    </Link>
                  ))
                ) : (
                  <Link
                    href={section.route}
                    className="rounded-sm border border-basalt-600 px-2 py-1 font-display text-[0.625rem] font-semibold uppercase tracking-widest text-steel-400 transition-colors hover:border-rust-500 hover:text-rust-300"
                  >
                    Browse {section.pluralNoun}
                  </Link>
                )}
              </div>
            </section>
          );
        })}
      </div>

      <div className="panel mt-8 p-6">
        <h2 className="font-display text-sm font-semibold uppercase tracking-widest text-steel-300">
          How this works
        </h2>
        <div className="mt-3 space-y-3 text-sm leading-relaxed text-steel-400">
          <p>
            Nothing is walled off. There is no account, no wait, no counter to
            watch and no advertising against any of it. A download is a file on
            this site&rsquo;s own storage, which is the whole point: most of this
            material was last seen on a forum attachment or a free host that has
            since expired, and a catalogue that only points at those is a list of
            links waiting to rot.
          </p>
          <p>
            Credit goes to whoever made the thing, not to whoever uploaded it
            here. A lot of this was made by people who will never have an account
            on this site, and where the author is not known the page says so
            rather than guessing.
          </p>
          <p>
            If something here is yours and you would rather it were not, say so
            in{" "}
            <a
              href={DISCORD_INVITE}
              target="_blank"
              rel="noreferrer noopener"
              className="text-rust-400 underline underline-offset-4 hover:text-rust-300"
            >
              Discord
            </a>{" "}
            and it comes down. Archiving somebody else&rsquo;s work without asking
            first is a real tradeoff, and this is the side of it we can offer.
          </p>
        </div>
      </div>
    </div>
  );
}
