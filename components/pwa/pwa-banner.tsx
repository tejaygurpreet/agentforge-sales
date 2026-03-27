"use client";

import { Bell, Download } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/**
 * Prompt 84 — register SW, optional install prompt, and Web Push subscribe (VAPID).
 */
export function PwaBanner() {
  const [vapidReady, setVapidReady] = useState(false);
  const [perm, setPerm] = useState<NotificationPermission | "unsupported">("default");
  const [busy, setBusy] = useState(false);
  const [installable, setInstallable] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if ("Notification" in window) {
      setPerm(Notification.permission);
    } else {
      setPerm("unsupported");
    }

    void fetch("/api/push/vapid-public")
      .then((r) => r.json())
      .then((j: { publicKey?: string | null }) => {
        if (j?.publicKey && typeof j.publicKey === "string") setVapidReady(true);
      })
      .catch(() => {});

    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/sw.js").catch(() => {});
    }

    const onBip = (e: Event) => {
      e.preventDefault();
      setInstallable(true);
    };
    window.addEventListener("beforeinstallprompt", onBip);
    return () => window.removeEventListener("beforeinstallprompt", onBip);
  }, []);

  const subscribePush = useCallback(async () => {
    const res = await fetch("/api/push/vapid-public");
    const j = (await res.json()) as { publicKey?: string | null };
    const key = j?.publicKey?.trim();
    if (!key) return;

    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(key) as unknown as BufferSource,
    });
    const r = await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(sub.toJSON()),
    });
    if (!r.ok) {
      throw new Error("subscribe failed");
    }
  }, []);

  const onEnableNotifications = useCallback(async () => {
    if (perm === "unsupported" || !vapidReady) return;
    setBusy(true);
    try {
      if (typeof Notification !== "undefined" && Notification.permission !== "granted") {
        const p = await Notification.requestPermission();
        setPerm(p);
        if (p !== "granted") return;
      }
      await subscribePush();
    } catch (e) {
      console.warn("[AgentForge] PwaBanner:push", e);
    } finally {
      setBusy(false);
    }
  }, [perm, vapidReady, subscribePush]);

  const showPushCta =
    vapidReady && perm !== "unsupported" && perm !== "denied";

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border/60 bg-card/40 px-4 py-4 shadow-sm backdrop-blur-sm sm:flex-row sm:items-center sm:justify-between sm:px-5">
      <div className="min-w-0 space-y-1">
        <p className="text-sm font-semibold text-foreground">Mobile &amp; notifications</p>
        <p className="text-pretty text-xs leading-relaxed text-muted-foreground">
          Add AgentForge to your home screen for a focused sales workspace. Enable notifications for
          campaign completion, new reply analysis, and batch run results (requires VAPID keys in env).
        </p>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        {installable ? (
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-primary/40 px-3 py-2 text-xs text-muted-foreground">
            <Download className="h-4 w-4 text-primary" aria-hidden />
            Use your browser&apos;s &quot;Add to Home Screen&quot; / install prompt.
          </span>
        ) : null}
        {showPushCta ? (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="gap-1.5"
            disabled={busy}
            onClick={() => void onEnableNotifications()}
          >
            <Bell className="h-4 w-4" aria-hidden />
            Enable notifications
          </Button>
        ) : null}
        {perm === "denied" ? (
          <span className="text-xs text-muted-foreground">Notifications blocked in browser settings.</span>
        ) : null}
      </div>
    </div>
  );
}
