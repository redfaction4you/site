/**
 * Machine readable health, for an uptime monitor to poll.
 *
 * Answers 200 when the nightly backup is current and the database answers, and
 * 503 when either is not, because that is the difference a monitor can act on.
 * Free services like UptimeRobot email when a URL starts returning 503, which
 * turns a silent failure into a message.
 *
 * Public and deliberately dull: two timestamps and a count, no secrets.
 */
import { getHealth } from "@/lib/health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const health = await getHealth();

    return Response.json(health, {
      status: health.ok ? 200 : 503,
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    // Reaching the database is itself part of being healthy.
    const message = error instanceof Error ? error.message : "Health check failed";
    return Response.json(
      { ok: false, error: message },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
}
