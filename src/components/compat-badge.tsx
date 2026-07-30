import Link from "next/link";

import { ALL_CLIENTS, CLIENT_LABELS, type RfClient } from "@/lib/rfl/clients";

/** Short forms for the badge row, where the full names do not fit. */
const SHORT_LABELS: Record<RfClient, string> = {
  vanilla: "1.20/1.21",
  pure: "Pure",
  dash: "Dash",
  alpine: "Alpine",
};

type Props = {
  playsOn: RfClient[];
  confidence?: "known" | "unknown" | null;
  /** Detail pages show the full explanation; cards show the row only. */
  verbose?: boolean;
  rflVersion?: number | null;
};

/**
 * Which clients can load this.
 *
 * Shows every client we label for, with the ones that work lit up and the ones
 * that do not greyed out, rather than listing only the working ones. A player
 * who runs Dash needs to see that Dash is *not* on the list, and a row of four
 * with one lit says that faster than a row of one.
 *
 * When detection is uncertain the badge says so instead of guessing. The whole
 * value of publishing a compatibility matrix is that it can be trusted, and one
 * confidently wrong badge costs more than a hundred honest "unknown"s.
 */
export function CompatBadge({ playsOn, confidence, verbose, rflVersion }: Props) {
  const unknown = confidence === "unknown";
  const undetected = playsOn.length === 0 && !unknown;

  return (
    <div>
      <ul className="flex flex-wrap items-center gap-1.5">
        {ALL_CLIENTS.map((client) => {
          const works = playsOn.includes(client);
          return (
            <li
              key={client}
              title={`${CLIENT_LABELS[client]}: ${works ? "loads this" : "cannot load this"}`}
              className={
                "rounded-sm border px-2 py-0.5 font-display text-[0.6875rem] font-semibold uppercase tracking-wider " +
                (works
                  ? "border-signal-green/40 bg-signal-green/10 text-signal-green"
                  : "border-basalt-700 bg-basalt-850 text-steel-500 line-through decoration-steel-600")
              }
            >
              {SHORT_LABELS[client]}
            </li>
          );
        })}

        {unknown ? (
          <li className="rounded-sm border border-oxide-400/40 bg-oxide-400/10 px-2 py-0.5 font-display text-[0.6875rem] font-semibold uppercase tracking-wider text-oxide-400">
            Unverified
          </li>
        ) : null}
      </ul>

      {verbose ? (
        <div className="mt-3 space-y-2 text-sm leading-relaxed text-steel-400">
          {rflVersion ? (
            <p>
              Level format version{" "}
              <span className="font-mono text-steel-300">{rflVersion}</span>, read from
              the file itself rather than entered by hand.
            </p>
          ) : null}

          {unknown ? (
            <p className="text-oxide-300">
              This version is outside the range we have documentation for, so we will
              not tell you which clients load it. Treat the row above as unproven and
              try it yourself.
            </p>
          ) : null}

          {undetected ? (
            <p>
              No level data was found in this download, so there is nothing to check
              compatibility against.
            </p>
          ) : null}

          <p>
            <Link
              href="/guides"
              className="text-rust-400 underline underline-offset-4 hover:text-rust-300"
            >
              How the clients differ, and which to run
            </Link>
          </p>
        </div>
      ) : null}
    </div>
  );
}
