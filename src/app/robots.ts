import type { MetadataRoute } from "next";

import { absoluteUrl } from "@/lib/site";

/**
 * The crawl rules, which until now were an absence rather than a decision.
 *
 * **Almost nothing is disallowed here, and that is deliberate.** The pages this
 * site does not want indexed are the ones about individual people, and every one
 * of them already says so with a `noindex` meta tag. A `Disallow` rule would be
 * worse than useless for them: it stops a crawler fetching the page, which means
 * it never reads the instruction not to index it, and a URL blocked in robots
 * can still turn up in results on the strength of links alone. The tag is the
 * mechanism; this file must not undercut it. The reasoning is written out in
 * full on `/players`.
 *
 * What is disallowed is the handful of routes that are not content at all: the
 * admin page, the account linking flow, sign-in, and the API. Nothing there
 * renders anything worth a crawl, and the first two answer with a password
 * prompt or a redirect.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin", "/link", "/signin", "/api/"],
      },
    ],
    sitemap: absoluteUrl("/sitemap.xml"),
  };
}
