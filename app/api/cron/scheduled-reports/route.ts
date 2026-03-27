import { runScheduledReportsCronJob } from "@/app/(dashboard)/actions";
import { NextResponse } from "next/server";

/**
 * Prompt 86 — Vercel Cron / external scheduler: send due scheduled reports.
 * Set `Authorization: Bearer <CRON_SECRET>` (or `CRON_SECRET` query for manual tests only).
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  const q = new URL(req.url).searchParams.get("secret");
  const ok =
    secret &&
    (auth === `Bearer ${secret}` || (process.env.NODE_ENV === "development" && q === secret));
  if (!ok) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const result = await runScheduledReportsCronJob();
  return NextResponse.json({ ok: true, ...result });
}
