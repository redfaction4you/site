import type { NextConfig } from "next";

import { SERVERS } from "./src/lib/servers";

/**
 * Screenshots come from the R2 bucket, whose domain is not known until the
 * bucket exists. Deriving the pattern from the same variable the app uses means
 * configuring storage is one env var, not an env var plus a code change.
 */
function r2Pattern() {
  const base = process.env.NEXT_PUBLIC_R2_PUBLIC_BASE;
  if (!base) return [];
  try {
    return [{ protocol: "https" as const, hostname: new URL(base).hostname }];
  } catch {
    console.warn("[next.config] NEXT_PUBLIC_R2_PUBLIC_BASE is not a valid URL.");
    return [];
  }
}

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      // Discord avatars for member profiles.
      { protocol: "https", hostname: "cdn.discordapp.com" },
      // YouTube thumbnails for the video archive.
      { protocol: "https", hostname: "i.ytimg.com" },
      // Map preview images for whatever the server is currently running.
      { protocol: "https", hostname: "www.factionfiles.com" },
      ...r2Pattern(),
    ],
  },
  async redirects() {
    return [
      // One canonical hostname. Serving the site at both the apex and www means
      // every page has two URLs, which splits search engines and leaves two
      // versions of every link people paste. The apex wins because it is what
      // the site is called.
      //
      // Scoped by host, so preview deployments and localhost are unaffected.
      {
        source: "/:path*",
        has: [{ type: "host" as const, value: "www.redfaction4you.com" }],
        destination: "https://redfaction4you.com/:path*",
        permanent: true,
      },
      // The old tournament hub keeps working. Phase 4 replaces the target.
      { source: "/rf4u", destination: "/events", permanent: false },
      // Tournaments folded into Events. Anything already linked keeps working.
      { source: "/tournaments", destination: "/events", permanent: true },
      { source: "/tournaments/:path*", destination: "/events", permanent: true },
      // "Server" became "Servers" when a second, third and fourth arrived.
      // The singular was live and linked, including from in-game welcome
      // messages printed to everybody who joined, so it keeps working.
      // Permanent: the plural is the name now and that is not going back.
      { source: "/server", destination: "/servers", permanent: true },
      { source: "/server/:path*", destination: "/servers/:path*", permanent: true },
      /*
        Each server's page, one segment shorter.

        The in-game welcome message is where most people meet these URLs, and
        Red Faction's chat is not clickable: the link has to be retyped into a
        browser from memory. "redfaction4you.com/halloween" is one thing to
        remember where "/servers/halloween" is two, and the shorter it is the
        more of it survives the walk to the other window.

        Derived from the registry rather than listed, so a fifth server gets
        one without anybody remembering to come back here.

        The match server is deliberately left out. "/match" beside "/matches"
        is two URLs a letter apart meaning different things, and its welcome
        message points at the archive anyway.

        Temporary on purpose, unlike the singular-to-plural pair above. These
        are conveniences rather than the canonical URL, and a permanent
        redirect cached in every browser that ever followed it would be in the
        way the first time /halloween is wanted for a Halloween event.
      */
      ...SERVERS.filter((server) => server.slug !== "match").map((server) => ({
        source: `/${server.slug}`,
        destination: `/servers/${server.slug}`,
        permanent: false,
      })),
      // The client comparison moved into Guides.
      { source: "/clients", destination: "/guides", permanent: true },
      { source: "/client", destination: "/guides", permanent: true },
      /*
        Models and Weapons became facets of Assets rather than shelves.

        Both were live pages answering 200, and this site's whole argument is
        that a link to it keeps working, so they redirect rather than 404. The
        index of each lands on its own facet, which is the same set of files
        under a different URL, and an item keeps its slug across the move: a
        model's detail page is at `/assets/<slug>` now, so the old address can
        be forwarded to the new one without knowing anything about the item.

        Permanent, unlike the server shortcuts above. This is not a convenience
        that might be wanted back; the shelves are gone and the facets are where
        the files live. A browser that caches this is caching the truth.
      */
      { source: "/models", destination: "/assets?type=model", permanent: true },
      { source: "/models/:slug", destination: "/assets/:slug", permanent: true },
      { source: "/weapons", destination: "/assets?type=weapon", permanent: true },
      { source: "/weapons/:slug", destination: "/assets/:slug", permanent: true },
    ];
  },
};

export default nextConfig;
