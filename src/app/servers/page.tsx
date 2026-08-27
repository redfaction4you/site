import { redirect } from "next/navigation";

import { SERVERS } from "@/lib/servers";

/**
 * `/servers` opens on the first tab.
 *
 * The four servers are tabs on one page and every tab is a real URL, so this
 * has to resolve to one of them rather than being a fifth thing to read. A
 * redirect rather than rendering the same page at two addresses: duplicate
 * content at `/servers` and `/servers/match` would be two URLs for one page,
 * which splits whatever links people paste.
 *
 * Not permanent. Which server leads is an editorial decision and it has already
 * changed once; a 308 would be cached by browsers long after that.
 */
export default function ServerIndex() {
  redirect(`/servers/${SERVERS[0].slug}`);
}
