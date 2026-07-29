import Image from "next/image";
import Link from "next/link";

import type { ItemSummary, KindMeta } from "@/lib/catalogue";
import { publicUrl } from "@/lib/storage";
import { CompatBadge } from "@/components/compat-badge";

/** A single entry in a catalogue listing. */
export function ItemCard({ item, meta }: { item: ItemSummary; meta: KindMeta }) {
  const shot = item.screenshotKey ? publicUrl(item.screenshotKey) : null;
  const year = item.releasedOn ? item.releasedOn.slice(0, 4) : null;

  return (
    <li>
      <Link href={`${meta.route}/${item.slug}`} className="group block">
        <div className="relative aspect-video overflow-hidden rounded-sm border border-basalt-700 bg-basalt-850">
          {shot ? (
            <Image
              src={shot}
              alt=""
              fill
              sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
              className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
            />
          ) : (
            <div className="flex h-full items-center justify-center">
              <span className="font-display text-xs uppercase tracking-widest text-steel-600">
                No screenshot
              </span>
            </div>
          )}
        </div>

        <h3 className="mt-3 font-display text-base font-semibold leading-snug text-steel-100 transition-colors group-hover:text-rust-300">
          {item.title}
        </h3>

        <p className="mt-1 text-xs text-steel-500">
          {item.authorName ?? "Author unknown"}
          {year ? ` · ${year}` : ""}
        </p>

        {item.summary ? (
          <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-steel-400">
            {item.summary}
          </p>
        ) : null}
      </Link>

      {meta.hasLevels ? (
        <div className="mt-2.5">
          <CompatBadge playsOn={item.playsOn} confidence={item.detectionConfidence} />
        </div>
      ) : null}
    </li>
  );
}
