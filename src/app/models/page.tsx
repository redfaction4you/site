import type { Metadata } from "next";

import { CataloguePage } from "@/components/catalogue-page";
import { KIND_META } from "@/lib/catalogue";

const meta = KIND_META.model;

export const metadata: Metadata = {
  title: meta.title,
  description: meta.intro,
};

export default async function ModelsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <CataloguePage meta={meta} searchParams={await searchParams} />;
}
