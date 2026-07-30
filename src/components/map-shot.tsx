import Image from "next/image";

import { shotsForMap } from "@/lib/ai/image-refs";
import { publicUrl, storageConfigured } from "@/lib/storage";

/**
 * A screenshot of the map a match was played on.
 *
 * The archive knew which map every match used and showed the reader a name. A
 * name is enough to look something up and not enough to recognise it, and most
 * of these maps look nothing like each other: an Egyptian tomb, a Martian mining
 * base, a stone courtyard. Showing the place costs nothing, because the
 * screenshots are already in the bucket for the illustration pipeline.
 *
 * Unlike `ColumnImage` this carries no "generated" caption, and must not: these
 * are real screenshots of the real level, so labelling them as synthetic would be
 * its own kind of wrong.
 *
 * Renders nothing when the map has no screenshots or storage is unconfigured.
 * A missing picture is a map nobody has photographed yet, which is a normal
 * state and not an error.
 */
export function MapShot({
  mapName,
  area,
  className = "",
  sizes = "(min-width: 1024px) 320px, 100vw",
  priority = false,
  rounded = true,
}: {
  mapName: string;
  /** Prefer a particular part of the map, when the manifest has one. */
  area?: string;
  className?: string;
  sizes?: string;
  priority?: boolean;
  rounded?: boolean;
}) {
  const shots = shotsForMap(mapName);
  if (shots.length === 0) return null;

  /*
   * A specific area if one was asked for, otherwise the establishing shot.
   *
   * `overview` is the picture that represents the map: the whole level from
   * outside or above, which is what somebody scanning a list of results needs in
   * order to recognise where a match was played. A flag room close-up is the
   * right choice when illustrating a capture and the wrong one as a label.
   *
   * Explicitly ternary rather than `area && find(...) ?? shots[0]`: an empty area
   * string is not nullish, so `??` would hand the expression an "" and never fall
   * back.
   */
  const preferred = area ? shots.find((shot) => shot.area === area) : undefined;
  const overview = shots.find((shot) => shot.area === "overview");
  const chosen = preferred ?? overview ?? shots[0];

  const src = publicUrl(chosen.key);
  if (!src) return null;

  return (
    <div
      /*
       * Deliberately no width of its own.
       *
       * It used to set `w-full` and let callers override with `w-28`. Two width
       * utilities on one element is a coin toss decided by stylesheet order, not
       * by which one was passed last, and the coin landed on full width: a 112
       * pixel thumbnail rendered at 1168 and pushed the whole page into a
       * horizontal scroll. The caller owns the width; this owns the shape.
       */
      className={
        "relative aspect-video overflow-hidden border border-basalt-800 bg-basalt-900 " +
        (rounded ? "rounded-sm " : "") +
        className
      }
    >
      <Image
        src={src}
        // Decorative next to the map's own name, which is always beside it. A
        // screen reader announcing the file twice helps nobody.
        alt=""
        fill
        sizes={sizes}
        priority={priority}
        className="object-cover"
      />
    </div>
  );
}

/** True when a map has anything to show, for callers laying out around it. */
export function hasMapShot(mapName: string): boolean {
  return storageConfigured && shotsForMap(mapName).length > 0;
}
