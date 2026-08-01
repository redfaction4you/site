import type { Metadata } from "next";

import { DISCORD_INVITE } from "@/lib/nav";

export const metadata: Metadata = {
  title: "Discord",
  description:
    "Join the RedFaction4You Discord for pickup games, map releases and match announcements.",
};

const GUILD_ID = process.env.NEXT_PUBLIC_DISCORD_GUILD_ID;

export default function DiscordPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-16">
      <p className="eyebrow">Community</p>
      <h1 className="mt-2 font-display text-4xl font-bold text-steel-100">
        Discord
      </h1>
      <p className="mt-4 max-w-2xl text-lg leading-relaxed text-steel-300">
        Pickup games start here. Match announcements, map releases, server
        status and the place to shout when you want a game right now.
      </p>

      <div className="mt-10 grid gap-6 md:grid-cols-[1fr_auto]">
        <div className="panel overflow-hidden">
          {GUILD_ID ? (
            <iframe
              src={`https://discord.com/widget?id=${GUILD_ID}&theme=dark`}
              title="RedFaction4You Discord"
              width="100%"
              height="480"
              sandbox="allow-popups allow-popups-to-escape-sandbox allow-same-origin allow-scripts"
              className="block border-0"
            />
          ) : (
            <div className="p-6">
              <p className="text-sm leading-relaxed text-steel-400">
                The embedded member list is not configured yet. Set{" "}
                <code className="rounded-sm bg-basalt-800 px-1.5 py-0.5 font-mono text-xs text-steel-200">
                  NEXT_PUBLIC_DISCORD_GUILD_ID
                </code>{" "}
                and enable the server widget in Discord under Server Settings
                &rarr; Widget.
              </p>
            </div>
          )}
        </div>

        <div className="panel h-fit p-5 md:w-64">
          <h2 className="font-display text-base font-bold text-steel-100">
            Signing in here
          </h2>
          <p className="mt-2.5 text-sm leading-relaxed text-steel-400">
            The site uses Discord to sign in. There are no passwords and we never
            see one. Your roles in the server decide what you can do here.
          </p>
          <a
            href={DISCORD_INVITE}
            target="_blank"
            rel="noreferrer noopener"
            className="mt-5 block rounded-sm bg-rust-500 px-4 py-2.5 text-center font-display text-sm font-semibold uppercase tracking-wider text-white transition-colors hover:bg-rust-400"
          >
            Join the server
          </a>
        </div>
      </div>
    </div>
  );
}
