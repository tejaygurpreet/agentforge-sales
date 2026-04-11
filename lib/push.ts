import "server-only";

import webpush from "web-push";
import { getServerEnv } from "@/lib/env";
import { getServiceRoleSupabaseOrNull } from "@/lib/supabase-server";

let vapidInitialized = false;

function ensureVapidConfigured(): boolean {
  const e = getServerEnv();
  const pub = e.VAPID_PUBLIC_KEY?.trim();
  const priv = e.VAPID_PRIVATE_KEY?.trim();
  const subj = e.VAPID_SUBJECT?.trim() || "mailto:support@agentforge.local";
  if (!pub || !priv) return false;
  if (!vapidInitialized) {
    webpush.setVapidDetails(subj, pub, priv);
    vapidInitialized = true;
  }
  return true;
}

/** True when server can send Web Push (VAPID keys in env). */
export function isWebPushConfigured(): boolean {
  const e = getServerEnv();
  return Boolean(e.VAPID_PUBLIC_KEY?.trim() && e.VAPID_PRIVATE_KEY?.trim());
}

export type PushPayload = {
  title: string;
  body: string;
  tag?: string;
  /** Relative or absolute in-app URL to open on notification click. */
  url?: string;
};

/**
 * Prompt 84 — sends a Web Push to every stored subscription for `userId` (best-effort; removes dead endpoints).
 */
export async function sendWebPushToUser(
  userId: string,
  payload: PushPayload,
): Promise<void> {
  if (!ensureVapidConfigured()) return;
  const sb = getServiceRoleSupabaseOrNull();
  if (!sb) return;

  const { data: rows, error } = await sb
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", userId);

  if (error || !rows?.length) {
    if (error) {
      console.warn("[AgentForge] push: list_subscriptions", error.message);
    }
    return;
  }

  const body = JSON.stringify({
    title: payload.title,
    body: payload.body,
    tag: payload.tag ?? "agentforge",
    url: payload.url ?? "/dashboard",
  });

  for (const r of rows) {
    const row = r as {
      id: string;
      endpoint: string;
      p256dh: string;
      auth: string;
    };
    const subscription = {
      endpoint: row.endpoint,
      keys: {
        p256dh: row.p256dh,
        auth: row.auth,
      },
    };
    try {
      await webpush.sendNotification(subscription, body, {
        TTL: 3600,
        urgency: "normal",
      });
    } catch (e: unknown) {
      const status = (e as { statusCode?: number })?.statusCode;
      if (status === 404 || status === 410) {
        await sb.from("push_subscriptions").delete().eq("id", row.id);
      } else {
        console.warn("[AgentForge] push: send_failed", row.endpoint.slice(0, 48), e);
      }
    }
  }
}

export async function notifyCampaignCompletedPush(
  userId: string,
  leadName: string,
  threadId: string,
): Promise<void> {
  await sendWebPushToUser(userId, {
    title: "Campaign completed",
    body: `${leadName} — pipeline finished. Open the dashboard to review.`,
    tag: `campaign-${threadId}`,
    url: "/dashboard",
  });
}

export async function notifyNewReplySavedPush(
  userId: string,
  preview: string,
): Promise<void> {
  const body = preview.replace(/\s+/g, " ").slice(0, 140);
  await sendWebPushToUser(userId, {
    title: "New reply analyzed",
    body: body || "Prospect reply saved — open Replies to review.",
    tag: "reply-analysis",
    url: "/replies",
  });
}

export async function notifyBatchFinishedPush(
  userId: string,
  total: number,
  done: number,
  errors: number,
): Promise<void> {
  const errPart = errors > 0 ? `, ${errors} error${errors === 1 ? "" : "s"}` : "";
  await sendWebPushToUser(userId, {
    title: "Batch finished",
    body: `${done}/${total} campaigns completed${errPart}.`,
    tag: "batch-finish",
    url: "/dashboard",
  });
}
