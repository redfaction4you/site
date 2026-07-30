import Image from "next/image";

import { IMAGE_CAPTION } from "@/lib/ai/image-prompt";
import { publicUrl } from "@/lib/storage";

/**
 * The generated illustration beside a night's column.
 *
 * The only way this image is rendered anywhere on the site, which is deliberate.
 * Every other piece of generated content here says so, and a picture has to say
 * it more loudly than prose does: the whole value of this archive is that its
 * information can be trusted, and a synthetic photograph presented as a record
 * of the evening is the single most misleading thing that could be added to it.
 * Keeping the caption inside the component means nobody can render the picture
 * and forget the label, because there is no way to ask for one without the other.
 *
 * Renders nothing at all when there is no image or when storage is unconfigured,
 * rather than a broken frame. Same honest degradation as `publicUrl` elsewhere.
 */
export function ColumnImage({
  imageKey,
  model,
  headline,
  priority = false,
  className = "",
}: {
  imageKey: string | null;
  model: string | null;
  /** Used for the alt text, so a screen reader gets the article, not the file. */
  headline: string;
  priority?: boolean;
  className?: string;
}) {
  const src = imageKey ? publicUrl(imageKey) : null;
  if (!src) return null;

  return (
    <figure className={className}>
      <div className="relative aspect-[16/9] w-full overflow-hidden rounded-sm border border-basalt-800 bg-basalt-900">
        <Image
          src={src}
          alt={`Generated illustration for the report headlined: ${headline}`}
          fill
          sizes="(min-width: 1024px) 640px, 100vw"
          priority={priority}
          className="object-cover"
        />
      </div>
      <figcaption className="mt-1.5 font-mono text-[0.625rem] uppercase tracking-widest text-steel-600">
        {IMAGE_CAPTION}
        {model ? ` by ${model}` : ""}. Not a photograph of the match.
      </figcaption>
    </figure>
  );
}
