import type { NextConfig } from "next";

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
      // The client comparison moved into Guides.
      { source: "/clients", destination: "/guides", permanent: true },
      { source: "/client", destination: "/guides", permanent: true },
    ];
  },
};

export default nextConfig;
