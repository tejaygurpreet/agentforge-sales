import { NextResponse } from "next/server";
import { getClientEnv } from "@/lib/env";

/** Prompt 84 — public VAPID key for `PushManager.subscribe` (safe to expose). */
export async function GET() {
  const key = getClientEnv().NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() ?? "";
  if (!key) {
    return NextResponse.json({ publicKey: null, configured: false });
  }
  return NextResponse.json({ publicKey: key, configured: true });
}
