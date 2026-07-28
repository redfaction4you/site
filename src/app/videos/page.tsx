import type { Metadata } from "next";
import Image from "next/image";

import { DISCORD_INVITE } from "@/lib/nav";
import {
  CATEGORY_BLURB,
  CATEGORY_LABEL,
  VIDEOS,
  byCategory,
  thumbnailUrl,
  watchUrl,
  type Video,
} from "@/lib/videos";

export const metadata: Metadata = {
  title: "Videos",
  description:
    "A curated archive of Red Faction videos: tutorials, gameplay, speedruns, machinima and history.",
};

function VideoCard({ video }: { video: Video }) {
  return (
    <li>
      <a
        href={watchUrl(video.youtubeId)}
        target="_blank"
        rel="noreferrer noopener"
        className="group block"
      >
        <div className="relative aspect-video overflow-hidden rounded-sm border border-basalt-700 bg-basalt-850">
          <Image
            src={thumbnailUrl(video.youtubeId)}
            alt=""
            fill
            sizes="(min-width: 768px) 33vw, 100vw"
            className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          />
          <span
            className="absolute inset-0 flex items-center justify-center bg-basalt-950/35 opacity-0 transition-opacity group-hover:opacity-100"
            aria-hidden="true"
          >
            <span className="rounded-full bg-rust-500 px-4 py-2 font-display text-xs font-semibold uppercase tracking-widest text-steel-100">
              Watch
            </span>
          </span>
        </div>

        <h3 className="mt-3 font-display text-base font-semibold leading-snug text-steel-100 transition-colors group-hover:text-rust-300">
          {video.title}
        </h3>
        <p className="mt-1 text-xs text-steel-500">
          {video.author}
          {video.year ? ` · ${video.year}` : ""}
        </p>
        {video.note ? (
          <p className="mt-1.5 text-sm leading-relaxed text-steel-400">
            {video.note}
          </p>
        ) : null}
      </a>
    </li>
  );
}

function EmptyState() {
  return (
    <div className="panel mt-10 p-8 text-center">
      <h2 className="font-display text-xl font-bold text-steel-100">
        Nothing in the archive yet
      </h2>
      <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-steel-400">
        We are starting this one from scratch rather than scraping whatever
        YouTube surfaces, so it fills up as people suggest things worth keeping.
      </p>
      <a
        href={DISCORD_INVITE}
        target="_blank"
        rel="noreferrer noopener"
        className="mt-6 inline-block rounded-sm bg-rust-500 px-5 py-2.5 font-display text-sm font-semibold uppercase tracking-wider text-steel-100 transition-colors hover:bg-rust-400"
      >
        Suggest a video
      </a>
    </div>
  );
}

export default function VideosPage() {
  const groups = byCategory();

  return (
    <div className="mx-auto max-w-5xl px-4 py-16">
      <p className="eyebrow">Archive</p>
      <h1 className="mt-2 font-display text-4xl font-bold text-steel-100">
        Videos
      </h1>
      <p className="mt-4 max-w-2xl text-lg leading-relaxed text-steel-300">
        Twenty-five years of Red Faction on YouTube, sorted into something you
        can actually browse. Tutorials, matches, speedruns, machinima and the
        occasional documentary about blowing holes in walls.
      </p>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-steel-400">
        Everything here plays on YouTube. We keep the link and the context, they
        keep the bandwidth.
      </p>

      {VIDEOS.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="mt-12 space-y-16">
          {groups.map(({ category, videos }) => (
            <section key={category}>
              <h2 className="font-display text-2xl font-bold text-steel-100">
                {CATEGORY_LABEL[category]}
              </h2>
              <p className="mt-1.5 text-sm text-steel-400">
                {CATEGORY_BLURB[category]}
              </p>

              <ul className="mt-6 grid gap-x-6 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
                {videos.map((video) => (
                  <VideoCard key={video.youtubeId} video={video} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
