import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ItemDetail } from "@/components/item-detail";
import { getItem } from "@/lib/catalogue";
import { SECTION_BY_KIND } from "@/lib/downloads";

const section = SECTION_BY_KIND.mod;

type Props = { params: Promise<{ slug: string }> };

/*
 * An hour stale, on purpose.
 *
 * Two things on this page move without anybody deploying: the download counter,
 * which changes every time somebody takes a copy, and the changelog, which the
 * uploader adds to. Rendering fresh on every request would keep both exact and
 * put a database round trip behind every visit, and this site has already been
 * billed once for a database that never slept. Nobody can perceive a counter
 * that is an hour behind, so the hour is the better half of that trade.
 */
export const revalidate = 3600;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const item = await getItem(section.kind, slug);
  if (!item) return { title: "Not found" };

  return {
    title: item.title,
    description:
      item.summary ?? `${item.title}, a Red Faction mod in the RedFaction4You archive.`,
  };
}

export default async function Page({ params }: Props) {
  const { slug } = await params;
  const item = await getItem(section.kind, slug);
  if (!item) notFound();

  return <ItemDetail item={item} section={section} />;
}
