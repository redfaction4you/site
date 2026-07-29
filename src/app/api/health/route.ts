/**
 * Machine readable health, for an uptime monitor to poll.
 *
 * Answers 200 when the pipeline is running and 503 when it is not, because
 * that is the difference a monitor can act on. Free services like UptimeRobot
 * will email when a URL starts returning 503, which turns a silent failure
 * into a message. That is the whole point: nothing here alerts anyone today,
 * so a stopped sync is only found by someone wondering where last night went.
 *
 * Public and deliberately dull. Match counts and timestamps, nothing about
 * players, no secrets, nothing an attacker gains from.
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
