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
 * The arrows on the frame are the same idea as the strip rather than a
 * replacement for it. The strip says how many there are and lets somebody jump
 * to one; the arrows are for reading through in order without aiming at a 6rem
 * target, which is most of how a set of screenshots actually gets looked at.
 * They sit on the picture rather than under it so the caption keeps its own
 * line, and they carry a background of their own because a chevron drawn
 * straight onto a screenshot is legible against exactly the screenshots that
 * happen to be dark. Light mode is a real theme here, so that background is a
 * token and flips with everything else.
 *
 * All of it appears only from the second screenshot onwards. One picture is not
 * a gallery, and arrows, a counter and a strip of one around a still are three
 * pieces of furniture saying there is more to see when there is not.
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

  /*
   * Wrapped rather than stopped at the ends. `ScrollRow` hides an edge control
   * that can do nothing, and the same honesty gives the opposite answer here:
   * these two can always do something, because a gallery that dead-ends on the
   * last picture is one somebody decides is broken rather than finished.
   *
   * Stepped from the previous value rather than from `index`, so an arrow key
   * held down cannot move twice off the same render, and clamped on the way in
   * for the same reason `index` is clamped above.
   */
  const step = (direction: -1 | 1) =>
    setSelected((previous) => {
      const from = Math.min(previous, frames.length - 1);
      return (from + direction + frames.length) % frames.length;
    });

  /*
   * The arrow keys are bound to the frame and to nothing wider.
   *
   * A handler on the document takes the arrow keys off anybody scrolling the
   * page, which is a bug nobody reports and everybody feels. A handler on the
   * whole section would be nearly as bad in a smaller way: the strip is a
   * `ScrollRow`, whose track is deliberately focusable so that arrow keys move
   * along the row, and swallowing those would trade one navigation for another.
   * Focus inside the frame means one of the two buttons, which is where Tab
   * lands first when somebody enters the gallery, so the keys are there as soon
   * as the controls are.
   */
  function onFrameKeys(event: React.KeyboardEvent<HTMLDivElement>) {
    if (frames.length < 2) return;
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;

    // Otherwise the page scrolls sideways under the picture at the same time.
    event.preventDefault();
    step(event.key === "ArrowLeft" ? -1 : 1);
  }

  return (
    <section aria-label={`Screenshots of ${title}`}>
      <figure>
        <div
          onKeyDown={onFrameKeys}
          className="relative aspect-video w-full overflow-hidden rounded-sm border border-basalt-700 bg-basalt-900"
        >
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
            /*
             * 44rem is measured rather than guessed, and it changed on 9
             * September 2026 when the gallery moved inside the item page's main
             * column. The container is `max-w-5xl px-4`, so 64rem less 2rem of
             * padding is 62rem of content; the grid takes 16rem for the sticky
             * aside and 2rem for `gap-x-8`, leaving 44rem. The old 62rem was
             * correct while the frame spanned the whole page, and left over it
             * would fetch a picture half again as wide as anything on screen.
             */
            sizes="(min-width: 64rem) 44rem, 100vw"
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

          {/* After the image in the source, so the two positioned elements
              stack the way they are read and neither needs a z-index. */}
          {frames.length > 1 ? (
            <>
              <Step direction={-1} onClick={() => step(-1)} />
              <Step direction={1} onClick={() => step(1)} />
            </>
          ) : null}
        </div>

        {/* Nothing at all under a single uncaptioned shot, rather than a row of
            empty space where a caption would have been. */}
        {current.caption || frames.length > 1 ? (
          <figcaption
            /*
             * Changing the picture changes nothing a screen reader would
             * otherwise mention: the new alt text is only read on the way past,
             * and by then the arrow key has been pressed several times. Polite
             * rather than assertive, because every change here follows a press
             * or a click somebody just made and none of it interrupts anything.
             */
            aria-live="polite"
            className="mt-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1"
          >
            <span className="text-xs leading-relaxed text-steel-400">
              {current.caption}
            </span>
            {frames.length > 1 ? (
              /* "3 of 7" rather than "3 / 7": it is the same count, and this
                 one survives being read out loud. */
              <span className="shrink-0 font-display text-[0.625rem] uppercase tracking-widest text-steel-400">
                {index + 1} of {frames.length}
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

/**
 * One of the two arrows on the frame.
 *
 * Quiet enough to leave the screenshot the picture: a small chip at the edge,
 * where a 4:3 shot letterboxed into a 16:9 frame has bars anyway, rather than a
 * bar across the middle of it.
 *
 * The chip is `basalt-900` at four fifths rather than a black wash, so it is
 * the site's own surface in both themes rather than a colour that only suits
 * one of them. That matters more than it looks: the thing underneath is a
 * photograph and can be any brightness at all, so the worst case is the whole
 * measurement. Composited over pure white and over pure black, `steel-200` on
 * this chip lands at 6.9:1 and 12.5:1 in dark, 13.0:1 and 7.9:1 in light,
 * against the 4.5:1 floor `globals.css` records. A chevron drawn straight onto
 * the picture with no chip has no such floor.
 *
 * No `disabled` state and no fading out at the ends, because there are no ends.
 *
 * The chevrons are `ScrollRow`'s, deliberately: they mean the same thing a few
 * lines below on the same page, and two drawings of "further this way" would be
 * a difference a reader has to resolve for no reason.
 */
function Step({
  direction,
  onClick,
}: {
  direction: -1 | 1;
  onClick: () => void;
}) {
  const back = direction === -1;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={back ? "Previous screenshot" : "Next screenshot"}
      className={
        "absolute top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center " +
        "rounded-sm border border-basalt-700 bg-basalt-900/80 text-steel-200 " +
        "transition-colors hover:bg-basalt-900 hover:text-rust-300 " +
        (back ? "left-2" : "right-2")
      }
    >
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-4 w-4"
      >
        <path d={back ? "m15 18-6-6 6-6" : "m9 18 6-6-6-6"} />
      </svg>
    </button>
  );
}
