"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * A row that scrolls sideways, with edges you can click.
 *
 * The results band was already scrollable and already had a fade on its right
 * edge saying so, and on a desktop with a mouse there was no way to act on it.
 * A vertical wheel does nothing to a horizontal scroller, the scrollbar is
 * hidden, and the fade reads as an affordance while being a decoration. So the
 * page advertised a thing it did not offer, which is worse than not advertising
 * it: the matches further along were unreachable rather than merely hidden.
 *
 * The edges are buttons now, and they sit exactly where the fade was, because
 * that is where the eye already goes to ask for more.
 *
 * They appear only in the direction there is something to reach, which is what
 * makes them honest: a control that is visible when it can do nothing is the
 * same lie in a different shape. That also means they are absent entirely when
 * everything fits, and absent before the measurement can run, so nothing here
 * renders on the server.
 *
 * The track itself is focusable and takes arrow keys, which browsers give a
 * scrollable region only when something in it can hold focus. Every tile is a
 * link, so in practice tabbing works too; this is for the case where the row is
 * scrolled past rather than entered.
 */
export function ScrollRow({
  children,
  label,
  className = "",
}: {
  children: React.ReactNode;
  /** Named in the button labels: "Scroll results left". */
  label: string;
  className?: string;
}) {
  const track = useRef<HTMLOListElement>(null);
  const [reach, setReach] = useState({ left: false, right: false });

  const measure = useCallback(() => {
    const el = track.current;
    if (!el) return;
    // A pixel of slack. Sub-pixel layout means scrollLeft rarely lands exactly
    // on its maximum, and a control that stays lit at the end of the row is the
    // same dishonesty this component exists to remove.
    const furthest = el.scrollWidth - el.clientWidth;
    setReach({ left: el.scrollLeft > 1, right: el.scrollLeft < furthest - 1 });
  }, []);

  useEffect(() => {
    const el = track.current;
    if (!el) return;

    measure();

    // The row changes size without the window doing anything: a map thumbnail
    // arriving, a font swapping, a sidebar opening beside it.
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    for (const child of Array.from(el.children)) observer.observe(child);

    return () => observer.disconnect();
  }, [measure, children]);

  const nudge = (direction: -1 | 1) => {
    const el = track.current;
    if (!el) return;

    // Not a whole screen. Landing the next tile flush against the edge loses the
    // sense of a continuous row, and a sliver of the previous one says which way
    // you came from.
    const step = direction * Math.round(el.clientWidth * 0.8);
    const furthest = el.scrollWidth - el.clientWidth;
    const from = el.scrollLeft;
    const target = Math.min(Math.max(from + step, 0), furthest);

    el.scrollTo({ left: target, behavior: "smooth" });

    /*
     * The row moves whether or not it can glide.
     *
     * Smooth scrolling is an animation and an animation needs frames, so a tab
     * that is not compositing, or a browser that declines the behaviour, leaves
     * the click doing nothing at all. That is the exact failure this component
     * was written to remove, so it must not be reintroduced by the way the fix
     * is animated. Caught in the browser pane, which does not composite while it
     * is hidden: the handler ran, the position never changed.
     *
     * The re-measure is here for the same reason. A scroll that never happened
     * emits no scroll event, and the edges would be left describing a position
     * the row is not in.
     */
    window.setTimeout(() => {
      if (el.scrollLeft === from) el.scrollLeft = target;
      measure();
    }, 250);
  };

  return (
    <div className={`relative ${className}`}>
      <ol
        ref={track}
        onScroll={measure}
        tabIndex={0}
        className="scrollbar-none flex gap-1.5 overflow-x-auto pb-1 focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-rust-500"
      >
        {children}
      </ol>

      {reach.left ? (
        <Edge side="left" label={label} onClick={() => nudge(-1)} />
      ) : null}
      {reach.right ? (
        <Edge side="right" label={label} onClick={() => nudge(1)} />
      ) : null}
    </div>
  );
}

function Edge({
  side,
  label,
  onClick,
}: {
  side: "left" | "right";
  label: string;
  onClick: () => void;
}) {
  const left = side === "left";

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Scroll ${label} ${side}`}
      /*
       * Not on a phone, where a finger already does this and the control would
       * be a forty pixel strip sitting on top of the first tile, taking taps
       * meant for it. The affordance is for the pointer that cannot drag.
       */
      className={
        "absolute inset-y-0 hidden w-10 items-center pb-1 text-steel-400 sm:flex " +
        "transition-colors hover:text-rust-300 focus-visible:outline " +
        "focus-visible:outline-1 focus-visible:outline-rust-500 " +
        (left
          ? "left-0 justify-start bg-gradient-to-r"
          : "right-0 justify-end bg-gradient-to-l") +
        " from-basalt-950 via-basalt-950/85 to-transparent"
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
        className="h-4 w-4 drop-shadow"
      >
        <path d={left ? "m15 18-6-6 6-6" : "m9 18 6-6-6-6"} />
      </svg>
    </button>
  );
}
