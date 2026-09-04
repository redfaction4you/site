import type { Metadata } from "next";

import { CataloguePage } from "@/components/catalogue-page";
import { SECTION_BY_KIND } from "@/lib/downloads";

const section = SECTION_BY_KIND.asset;

export const metadata: Metadata = {
  title: section.title,
  description: section.intro,
};

export default async function AssetsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <CataloguePage section={section} searchParams={await searchParams} />;
}
