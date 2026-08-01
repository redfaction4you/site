"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Keeps a live page live.
 *
 * The one client component on the archive side of this site, and it exists
 * because a scoreboard that needs a manual reload is not a scoreboard. It calls
 * `router.refresh()`, which re-runs the server components and swaps in new data
 * without a navigation, so nothing flashes and the scroll position holds.
 *
 * Only mounted while a match is actually in progress, so an idle server costs
 * nobody a timer, and the interval is not shorter than the fetch cache upstream:
 * asking more often than the data can change would be requests for the sake of
 * requests, against somebody else's service.
 *
 * It stops when the tab is hidden. A page left open in a background tab
 * overnight should not spend the night polling.
 */
export function LiveRefresh({ seconds = 30 }: { seconds?: number }) {
  const router = useRouter();
  const [refreshedAt, setRefreshedAt] = useState<number | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      if (timer !== null) return;
      timer = setInterval(() => {
        router.refresh();
        setRefreshedAt(Date.now());
      }, seconds * 1000);
    };

    const stop = () => {
      if (timer === null) return;
      clearInterval(timer);
      timer = null;
    };

    const onVisibility = () => {
      if (document.hidden) {
        stop();
        return;
      }
      // Coming back to a stale tab: catch up at once rather than waiting out
      // another interval on numbers that are already wrong.
      router.refresh();
      setRefreshedAt(Date.now());
      start();
    };

    if (!document.hidden) start();
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [router, seconds]);

  return (
    <p className="font-mono text-[0.625rem] text-steel-600">
      {/*
        Says the page is updating itself, because otherwise a figure that
        changes while somebody is reading it looks like a mistake. Nothing is
        rendered until the first refresh so that the server and the browser
        agree on the first paint.
      */}
      {refreshedAt === null
        ? `Updating every ${seconds} seconds`
        : `Updated ${new Date(refreshedAt).toLocaleTimeString("en-GB", {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          })}`}
    </p>
  );
}
