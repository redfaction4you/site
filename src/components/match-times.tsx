"use client";

/**
 * When games usually happen, in the reader's own timezone.
 *
 * This runs in the browser on purpose. "Around 8pm" is only useful if it means
 * 8pm where you are, and the server has no idea where that is, rendering it
 * server-side would silently publish Pacific time to somebody in Europe.
 *
 * It stays hidden until there is enough history to say something true. With one
 * night's data the "usual" time is just that night, and stating it as a pattern
 * would be a guess. The thresholds below are what "enough" means; the component
 * renders nothing at all beneath them rather than hedging.
 */

/** Below these, we have a sample, not a pattern. */
const MIN_MATCHES = 12;
const MIN_NIGHTS = 3;

const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

function hourLabel(hour: number): string {
  if (hour === 0) return "midnight";
  if (hour === 12) return "midday";
  return hour < 12 ? `${hour}am` : `${hour - 12}pm`;
}

/** Joins a list the way a person would say it. */
function sentenceList(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

export function MatchTimes({ startedAt }: { startedAt: string[] }) {
  const dates = startedAt.map((iso) => new Date(iso)).filter((d) => !isNaN(d.valueOf()));

  // Nights, counted locally: a match at 1am belongs to the evening before, so
  // anything before 6am counts back a day.
  const nights = new Set(
    dates.map((d) => {
      const shifted = new Date(d);
      if (shifted.getHours() < 6) shifted.setDate(shifted.getDate() - 1);
      return shifted.toDateString();
    }),
  );

  if (dates.length < MIN_MATCHES || nights.size < MIN_NIGHTS) return null;

  const byHour = new Map<number, number>();
  const byDay = new Map<number, number>();
  for (const date of dates) {
    byHour.set(date.getHours(), (byHour.get(date.getHours()) ?? 0) + 1);
    byDay.set(date.getDay(), (byDay.get(date.getDay()) ?? 0) + 1);
  }

  const peakHour = [...byHour.entries()].sort((a, b) => b[1] - a[1])[0][0];

  // Days that carry a real share of the matches, not every day that ever saw one.
  const dayThreshold = dates.length * 0.15;
  const busiestDays = [...byDay.entries()]
    .filter(([, count]) => count >= dayThreshold)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([day]) => day)
    .sort()
    .map((day) => DAY_NAMES[day]);

  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const max = Math.max(...byHour.values());

  return (
    <div className="panel p-5">
      <h2 className="font-display text-sm font-bold text-steel-100">
        When games usually happen
      </h2>
      <p className="mt-1.5 text-sm leading-relaxed text-steel-400">
        Matches most often start around{" "}
        <span className="text-steel-100">{hourLabel(peakHour)}</span>
        {busiestDays.length ? (
          <>
            {" "}
            on <span className="text-steel-100">{sentenceList(busiestDays)}</span>
          </>
        ) : null}
        , in your local time
        {timeZone ? <span className="text-steel-500"> ({timeZone})</span> : null}.
      </p>

      {/* A day's worth of hours, so the shape is visible rather than asserted. */}
      <div className="mt-4 flex items-end gap-[2px]" aria-hidden="true">
        {Array.from({ length: 24 }, (_, hour) => {
          const count = byHour.get(hour) ?? 0;
          return (
            <div
              key={hour}
              title={`${hourLabel(hour)}: ${count} match${count === 1 ? "" : "es"}`}
              className={
                "flex-1 rounded-[1px] " +
                (count === 0
                  ? "bg-basalt-800"
                  : hour === peakHour
                    ? "bg-rust-500"
                    : "bg-basalt-600")
              }
              style={{ height: `${Math.max(3, (count / max) * 32)}px` }}
            />
          );
        })}
      </div>
      <div className="mt-1 flex justify-between text-[0.625rem] text-steel-600">
        <span>midnight</span>
        <span>midday</span>
        <span>midnight</span>
      </div>

      <p className="mt-3 text-xs text-steel-500">
        From {dates.length} matches across {nights.size} nights.
      </p>
    </div>
  );
}
