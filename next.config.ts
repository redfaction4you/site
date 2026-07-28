import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      // Discord avatars for member profiles.
      { protocol: "https", hostname: "cdn.discordapp.com" },
      // YouTube thumbnails for the video archive.
      { protocol: "https", hostname: "i.ytimg.com" },
    ],
  },
  async redirects() {
    return [
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
