import { NextResponse, type NextRequest } from "next/server";
import { getServerEnv } from "@/lib/env";

export async function POST(request: NextRequest) {
  const secret = getServerEnv().WEBHOOK_SECRET;
  const header = request.headers.get("x-webhook-secret");

  if (secret && header !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  return NextResponse.json({
    received: true,
    echo: body,
    hint: "Attach CRM events here to enqueue LangGraph runs.",
  });
}
