import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";

import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

const ROLE_LABEL: Record<string, string> = {
  visitor: "Visitor",
  member: "Member",
  mapper: "Mapper",
  admin: "Admin",
};

async function getMember(handle: string) {
  return db.query.users.findFirst({
    where: eq(users.handle, handle),
    columns: {
      name: true,
      image: true,
      handle: true,
      siteRole: true,
      inGuild: true,
      createdAt: true,
    },
  });
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ handle: string }>;
}): Promise<Metadata> {
  const { handle } = await params;
  const member = await getMember(handle);

  if (!member) return { title: "Member not found" };

  return {
    title: member.name ?? member.handle ?? "Member",
    description: `${member.name ?? "This member"} on RedFaction4You.`,
    robots: { index: false },
  };
}

/**
 * Minimal profile. Phase 3 adds uploads, comments, ratings and team history;
 * the page exists now so the header avatar links somewhere real.
 */
export default async function MemberPage({
  params,
}: {
  params: Promise<{ handle: string }>;
}) {
  const { handle } = await params;
  const member = await getMember(handle);

  if (!member) notFound();

  const joined = new Intl.DateTimeFormat("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(member.createdAt);

  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      <div className="flex flex-wrap items-center gap-5">
        {member.image ? (
          <Image
            src={member.image}
            alt=""
            width={80}
            height={80}
            className="rounded-full border border-basalt-600"
          />
        ) : (
          <div className="h-20 w-20 rounded-full border border-basalt-600 bg-basalt-800" />
        )}

        <div>
          <h1 className="font-display text-3xl font-bold text-steel-100">
            {member.name ?? member.handle}
          </h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-steel-400">
            <span className="rounded-sm border border-rust-700 px-1.5 py-0.5 font-display text-[0.65rem] font-semibold uppercase tracking-wider text-rust-300">
              {ROLE_LABEL[member.siteRole] ?? member.siteRole}
            </span>
            <span>Member since {joined}</span>
            {member.inGuild ? <span>· In the Discord</span> : null}
          </p>
        </div>
      </div>

      <div className="panel mt-10 p-6">
        <h2 className="font-display text-sm font-semibold uppercase tracking-widest text-steel-400">
          Coming in phase 3
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-steel-400">
          Uploads, comments, ratings, team history and match results all land on
          this page once the catalogue and tournaments are live.
        </p>
      </div>
    </div>
  );
}
