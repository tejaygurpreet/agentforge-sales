"use client";

import {
  disconnectHubSpotAction,
  saveHubSpotAccessTokenAction,
} from "@/app/(dashboard)/actions";
import { HubspotIntegrationHero } from "@/components/illustrations/hubspot-integration-hero";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { dashboardOutlineActionClass } from "@/lib/dashboard-action-classes";
import { cn } from "@/lib/utils";
import { Link2, Loader2, PlugZap, Unplug } from "lucide-react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

type Props = {
  connected: boolean;
};

/**
 * HubSpot Private App token — server-side only. Prompt 136 — split art + clean form layout.
 */
export function HubSpotConnectSection({ connected: initialConnected }: Props) {
  const router = useRouter();
  const [connected, setConnected] = useState(initialConnected);
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setConnected(initialConnected);
  }, [initialConnected]);

  const onConnect = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      const res = await saveHubSpotAccessTokenAction({ access_token: token });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setToken("");
      setConnected(true);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }, [token, router]);

  const onDisconnect = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      const res = await disconnectHubSpotAction();
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setConnected(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }, [router]);

  return (
    <Card
      className={cn(
        "h-full overflow-hidden border-border/50 shadow-[var(--card-shadow-spec)]",
        "transition-all duration-300 hover:-translate-y-1 hover:scale-[1.01] hover:shadow-glow",
      )}
    >
      <div className="grid min-h-[280px] md:grid-cols-[minmax(200px,0.95fr)_minmax(0,1.15fr)]">
        <div className="relative flex min-h-[200px] items-center justify-center border-b border-border/40 bg-gradient-to-br from-sage/[0.12] via-highlight/[0.08] to-terracotta/[0.1] p-6 md:border-b-0 md:border-r md:min-h-full">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_70%_60%_at_50%_40%,hsl(var(--highlight)_/_0.12),transparent_65%)]" aria-hidden />
          <motion.div
            className="relative z-[1] w-full max-w-[300px]"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
          >
            <HubspotIntegrationHero className="h-auto w-full drop-shadow-sm" />
          </motion.div>
        </div>

        <div className="flex flex-col bg-card/40">
          <div className="space-y-4 border-b border-border/35 px-6 py-6 sm:px-8 sm:py-7">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-sage">CRM sync</p>
            <div className="flex flex-wrap items-start gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--card-radius)] border border-sage/35 bg-white/80 shadow-inner ring-1 ring-highlight/15">
                <Link2 className="h-5 w-5 text-sage" aria-hidden />
              </span>
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-xl font-bold tracking-tight text-foreground">HubSpot CRM</h3>
                  {connected ? (
                    <Badge className="border-sage/35 bg-sage/12 font-semibold text-foreground shadow-sm">
                      Connected
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="border-border/60 font-medium text-muted-foreground">
                      Not connected
                    </Badge>
                  )}
                </div>
                <p className="text-[15px] leading-relaxed text-muted-foreground">
                  Paste a{" "}
                  <span className="font-semibold text-foreground">Private App access token</span> — encrypted
                  server-side. Sync deals and notes when you export from a completed campaign.
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-1 flex-col gap-5 px-6 py-6 sm:px-8 sm:py-8">
            {error ? (
              <p role="alert" className="ux-inline-error px-4 py-3">
                {error}
              </p>
            ) : null}
            {!connected ? (
              <div className="rounded-[var(--card-radius)] border border-border/45 bg-muted/15 p-5 shadow-inner sm:p-6">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-end">
                  <div className="min-w-0 flex-1 space-y-2">
                    <Label htmlFor="hubspot-token">Private app access token</Label>
                    <Input
                      id="hubspot-token"
                      name="access_token"
                      type="password"
                      autoComplete="off"
                      placeholder="pat-na1-…"
                      value={token}
                      onChange={(e) => setToken(e.target.value)}
                      className="h-11 rounded-[var(--card-radius)] border-border/60 font-mono text-sm shadow-inner"
                    />
                  </div>
                  <Button
                    type="button"
                    disabled={busy || token.trim().length < 20}
                    className="h-11 shrink-0 gap-2 rounded-[var(--card-radius)] px-6 shadow-soft lg:w-auto"
                    onClick={() => void onConnect()}
                  >
                    {busy ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    ) : (
                      <PlugZap className="h-4 w-4" aria-hidden />
                    )}
                    Connect HubSpot
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-4 rounded-[var(--card-radius)] border border-sage/30 bg-gradient-to-br from-sage/[0.08] to-highlight/[0.06] px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className={cn("w-fit gap-2 rounded-[var(--card-radius)]", dashboardOutlineActionClass)}
                  disabled={busy}
                  onClick={() => void onDisconnect()}
                >
                  {busy ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  ) : (
                    <Unplug className="h-4 w-4" aria-hidden />
                  )}
                  Disconnect
                </Button>
                <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">
                  Use <strong className="font-semibold text-foreground">Export to HubSpot</strong> after a run
                  to push the deal, notes, and dossier PDF.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}
