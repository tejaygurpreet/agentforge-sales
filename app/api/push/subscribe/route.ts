import { NextResponse } from "next/server";
import { createServerSupabaseActionClient } from "@/lib/supabase-server";

type Body = {
  endpoint?: string;
  keys?: { p256dh?: string; auth?: string };
};

/**
 * Prompt 84 — persist Web Push subscription (authenticated).
 */
export async function POST(req: Request) {
  const supabase = await createServerSupabaseActionClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const endpoint = typeof body.endpoint === "string" ? body.endpoint.trim() : "";
  const p256dh = typeof body.keys?.p256dh === "string" ? body.keys.p256dh.trim() : "";
  const auth = typeof body.keys?.auth === "string" ? body.keys.auth.trim() : "";
  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json({ error: "Missing subscription keys" }, { status: 400 });
  }

  const ua = req.headers.get("user-agent") ?? null;
  const now = new Date().toISOString();

  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      user_id: user.id,
      endpoint,
      p256dh,
      auth,
      user_agent: ua,
      updated_at: now,
    },
    { onConflict: "endpoint" },
  );

  if (error) {
    console.error("[AgentForge] push subscribe", error.message);
    return NextResponse.json({ error: "Could not save subscription" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const supabase = await createServerSupabaseActionClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let endpoint = "";
  try {
    const j = (await req.json()) as { endpoint?: string };
    endpoint = typeof j.endpoint === "string" ? j.endpoint.trim() : "";
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!endpoint) {
    return NextResponse.json({ error: "Missing endpoint" }, { status: 400 });
  }

  const { error } = await supabase
    .from("push_subscriptions")
    .delete()
    .eq("user_id", user.id)
    .eq("endpoint", endpoint);

  if (error) {
    console.error("[AgentForge] push unsubscribe", error.message);
    return NextResponse.json({ error: "Could not remove subscription" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
