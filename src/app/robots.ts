import type { MetadataRoute } from "next";

import { absoluteUrl } from "@/lib/site";

/**
 * The crawl rules, which until now were an absence rather than a decision.
 *
 * **Almost nothing is disallowed here, and that is deliberate.** A page that
 * should not be indexed says so with a `noindex` meta tag, and a `Disallow`
 * rule would be worse than useless for it: it stops a crawler fetching the
 * page, which means it never reads the instruction not to index it, and a URL
 * blocked in robots can still turn up in results on the strength of links
 * alone. The tag is the mechanism; this file must not undercut it.
 *
 * What is disallowed is the handful of routes that are not content at all: the
 * admin page, sign-in, and the API. Nothing there renders anything worth a
 * crawl, and the admin page answers with a password prompt.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin", "/signin", "/api/"],
      },
    ],
    sitemap: absoluteUrl("/sitemap.xml"),
  };
}
