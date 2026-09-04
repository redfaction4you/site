"use client";

import Image from "next/image";
import { useState } from "react";

import { ScrollRow } from "@/components/scroll-row";
import type { CatalogueItem } from "@/lib/catalogue";
import { publicUrl } from "@/lib/storage";

/**
 * The screenshots on a catalogue item: one large frame, and a strip you pick
 * from.
 *
 * This is the one part of a detail page that is genuinely stateful, because
 * "which screenshot am I looking at" is a decision a reader makes and unmakes a
 * dozen times without wanting a page load for each. It is deliberately the only
 * client component in the section: everything above and below it renders on the
 * server, and the filters on the listing pages stay links carrying query
 * parameters for the same reason they always were, because a filtered view is
 * something you paste into Discord and a chosen screenshot is not.
 *
 * `ScrollRow` is reused for the strip rather than a second scroller written
 * here. It already answers the hard half of a horizontal row honestly: the edge
 * controls appear only in the direction there is something to reach, and it
 * moves the row whether or not the browser will glide it, which is the failure
 * it was written to remove. A second implementation would be a second thing to
 * keep in step, and the first divergence would be silent.
 *
 * The thumbnails are plain buttons rather than a tab list, so Tab reaches them
 * and Enter picks one with no focus model of our own. A roving tabindex would
 * be more keystroke-efficient and is one more thing that can be subtly wrong;
 * the browser's own behaviour is already correct here.
 *
 * Nothing depends on an animation finishing, so reduced motion changes nothing
 * about what this does: choosing a frame swaps it, it does not fade into it.
 */

type Frame = { id: string; caption: string | null; src: string };

export function ItemGallery({
  shots,
  title,
}: {
  shots: CatalogueItem["screenshots"];
  title: string;
}) {
  // Before any return, because a hook that runs on some renders and not others
  // is the one mistake this file cannot make.
  const [selected, setSelected] = useState(0);

  // An item with no screenshots gets no heading, no frame and no empty state.
  // Most of this archive is a twenty year old zip nobody photographed.
  if (shots.length === 0) return null;

  /*
   * `publicUrl` is null for every key when the bucket's public domain is unset,
   * so this is all-or-nothing rather than a per-image miss. The env var is a
   * NEXT_PUBLIC one, which is inlined at build time, so the answer here is the
   * same one the server would have given.
   */
  const frames: Frame[] = [];
  for (const shot of shots) {
    const src = publicUrl(shot.storageKey);
    if (src) frames.push({ id: shot.id, caption: shot.caption, src });
  }

  /*
   * Said rather than drawn. A broken image icon where a screenshot should be
   * reads as a lost file, which is the one thing this archive exists not to be,
   * and the count is the part worth keeping: the pictures are recorded, this
   * deployment simply cannot address them.
   */
  if (frames.length === 0) {
    const several = shots.length !== 1;
    return (
      <p className="text-sm leading-relaxed text-steel-400">
        {several ? `${shots.length} screenshots are` : "One screenshot is"} recorded
        for this entry. Image storage is not configured on this deployment, so{" "}
        {several ? "they" : "it"} cannot be shown.
      </p>
    );
  }

  // Clamped rather than trusted: the strip is the only thing that sets this, but
  // a frame count that shrank under a stale index would throw on the render.
  const index = Math.min(selected, frames.length - 1);
  const current = frames[index];

  return (
    <section aria-label={`Screenshots of ${title}`}>
      <figure>
        <div className="relative aspect-video w-full overflow-hidden rounded-sm border border-basalt-700 bg-basalt-900">
          <Image
            // Remounts on a change of frame, so the browser never shows the
            // previous screenshot under the new one's caption.
            key={current.id}
            src={current.src}
            alt={
              current.caption ??
              `${title}, screenshot ${index + 1} of ${frames.length}`
            }
            fill
            sizes="(min-width: 64rem) 62rem, 100vw"
            /*
             * Only the frame the page opens on is eager. The rest are fetched
             * when they are asked for, which is what keeps a twelve screenshot
             * entry from costing twelve full size images nobody looked at.
             */
            priority={index === 0}
            /*
             * Contained, not cropped. Red Faction is a 2001 game and most of
             * these are 4:3, so covering a 16:9 frame would cut the top and
             * bottom off somebody's screenshot to make the layout tidier. The
             * letterbox is the honest version.
             *
             * The frame stays 16:9 for the widescreen shots and for the shape
             * of the page: at this width a 4:3 frame is tall enough on its own
             * to push the download button under the fold, and what was recorded
             * owns the top of a detail page.
             */
            className="object-contain"
          />
        </div>

        {/* Nothing at all under a single uncaptioned shot, rather than a row of
            empty space where a caption would have been. */}
        {current.caption || frames.length > 1 ? (
          <figcaption className="mt-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <span className="text-xs leading-relaxed text-steel-400">
              {current.caption}
            </span>
            {frames.length > 1 ? (
              <span className="shrink-0 font-display text-[0.625rem] uppercase tracking-widest text-steel-400">
                {index + 1} / {frames.length}
              </span>
            ) : null}
          </figcaption>
        ) : null}
      </figure>

      {frames.length > 1 ? (
        <ScrollRow label="screenshots" className="mt-3">
          {frames.map((frame, position) => {
            const active = position === index;
            return (
              <li key={frame.id}>
                <button
                  type="button"
                  onClick={() => setSelected(position)}
                  aria-current={active ? "true" : undefined}
                  aria-label={
                    frame.caption
                      ? `Screenshot ${position + 1}: ${frame.caption}`
                      : `Screenshot ${position + 1} of ${frames.length}`
                  }
                  className={
                    "relative block aspect-video w-24 shrink-0 overflow-hidden rounded-sm border transition-colors " +
                    (active
                      ? "border-rust-500"
                      : "border-basalt-700 hover:border-basalt-500")
                  }
                >
                  {/* The button carries the name, so the picture inside it is
                      decoration and announcing the caption twice helps nobody. */}
                  <Image
                    src={frame.src}
                    alt=""
                    fill
                    sizes="6rem"
                    className="object-cover"
                  />
                </button>
              </li>
            );
          })}
        </ScrollRow>
      ) : null}
    </section>
  );
}
