import type { Metadata } from "next";

import { discordConfigured, signIn } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false },
};

const ERRORS: Record<string, string> = {
  OAuthAccountNotLinked:
    "That email is already registered against a different sign-in method.",
  AccessDenied: "Discord declined the sign-in request.",
  Configuration:
    "Sign-in is misconfigured on our side. This one is our fault, not yours.",
  Verification: "That sign-in link has expired. Try again.",
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; callbackUrl?: string }>;
}) {
  const { error, callbackUrl } = await searchParams;

  if (!discordConfigured) {
    return (
      <div className="mx-auto flex max-w-md flex-col px-4 py-24">
        <p className="eyebrow">Members</p>
        <h1 className="mt-2 font-display text-3xl font-bold text-steel-100">
          Sign-in is not set up yet
        </h1>
        <p className="mt-4 text-sm leading-relaxed text-steel-400">
          The Discord application has not been created yet, so there is nothing
          to sign in to. Browsing and downloading never need an account, so
          nothing else on the site is affected.
        </p>
        <p className="mt-4 text-xs leading-relaxed text-steel-500">
          Developer note: set <code>AUTH_DISCORD_ID</code> and{" "}
          <code>AUTH_DISCORD_SECRET</code> in <code>.env.local</code>, then
          restart the dev server.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-md flex-col px-4 py-24">
      <p className="eyebrow">Members</p>
      <h1 className="mt-2 font-display text-3xl font-bold text-steel-100">
        Sign in
      </h1>
      <p className="mt-4 text-sm leading-relaxed text-steel-400">
        Discord only. No passwords, no email confirmation, nothing to forget. You
        never need an account to browse or download anything on this site.
      </p>

      {error ? (
        <p
          role="alert"
          className="mt-6 rounded-sm border border-rust-700 bg-rust-700/15 px-4 py-3 text-sm text-rust-200"
        >
          {ERRORS[error] ?? "Sign-in failed. Try again in a moment."}
        </p>
      ) : null}

      <form
        className="mt-8"
        action={async () => {
          "use server";
          await signIn("discord", { redirectTo: callbackUrl ?? "/" });
        }}
      >
        <button
          type="submit"
          className="w-full rounded-sm bg-rust-500 px-5 py-3 font-display text-sm font-semibold uppercase tracking-wider text-steel-100 transition-colors hover:bg-rust-400"
        >
          Continue with Discord
        </button>
      </form>

      <p className="mt-6 text-xs leading-relaxed text-steel-500">
        We read your Discord username, avatar, email and your roles in our own
        server. We cannot see your other servers&rsquo; roles, your messages, or
        anything else.
      </p>
    </div>
  );
}
