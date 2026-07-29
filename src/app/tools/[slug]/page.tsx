import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ItemDetail } from "@/components/item-detail";
import { getItem, KIND_META } from "@/lib/catalogue";

const meta = KIND_META.tool;

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const item = await getItem(meta.kind, slug);
  if (!item) return { title: "Not found" };

  return {
    title: item.title,
    description:
      item.summary ??
      `${item.title}, a Red Faction editing tool in the RedFaction4You archive.`,
  };
}

export default async function Page({ params }: Props) {
  const { slug } = await params;
  const item = await getItem(meta.kind, slug);
  if (!item) notFound();

  return <ItemDetail item={item} meta={meta} />;
}
