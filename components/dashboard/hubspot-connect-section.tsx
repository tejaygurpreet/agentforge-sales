"use client";

import {
  disconnectHubSpotAction,
  saveHubSpotAccessTokenAction,
} from "@/app/(dashboard)/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { dashboardOutlineActionClass } from "@/lib/dashboard-action-classes";
import { cn } from "@/lib/utils";
import { Link2, Loader2, PlugZap, Unplug } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

type Props = {
  connected: boolean;
};

/**
 * HubSpot Private App token — stored server-side only (see supabase/hubspot_credentials.sql).
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
        "h-full overflow-hidden rounded-2xl border-border/55 bg-card shadow-lift ring-1 ring-border/25",
        "transition-all duration-300 hover:-translate-y-0.5 hover:shadow-soft",
      )}
    >
      <CardHeader className="space-y-4 border-b border-border/40 bg-gradient-to-br from-orange-500/[0.08] via-card to-amber-500/[0.04] px-6 pb-6 pt-7 sm:px-8 sm:pt-8">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-orange-900/80">CRM sync</p>
        <div className="flex flex-wrap items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-orange-400/35 bg-card shadow-sm">
            <Link2 className="h-6 w-6 text-orange-700" aria-hidden />
          </div>
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-xl font-semibold tracking-tight">HubSpot CRM</CardTitle>
              {connected ? (
                <Badge className="border-primary/35 bg-primary/12 font-semibold text-foreground shadow-sm">
                  Connected
                </Badge>
              ) : (
                <Badge variant="outline" className="border-border/60 font-medium text-muted-foreground">
                  Not connected
                </Badge>
              )}
            </div>
            <CardDescription className="text-[15px] leading-relaxed text-muted-foreground">
              Add a{" "}
              <span className="font-medium text-foreground">Private App access token</span> from HubSpot
              (Settings → Integrations → Private Apps). Stored encrypted in your workspace — used only from
              this server to sync deals and notes, never exposed to the browser.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5 px-6 py-8 sm:px-8 sm:py-9">
        {error ? (
          <p role="alert" className="ux-inline-error px-4 py-3">
            {error}
          </p>
        ) : null}
        {!connected ? (
          <div className="rounded-2xl border border-border/45 bg-muted/20 p-5 shadow-inner sm:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
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
                  className="h-11 rounded-xl border-border/60 font-mono text-sm shadow-sm"
                />
              </div>
              <Button
                type="button"
                disabled={busy || token.trim().length < 20}
                className="h-11 shrink-0 gap-2 rounded-xl px-6 shadow-soft sm:w-auto"
                onClick={() => void onConnect()}
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <PlugZap className="h-4 w-4" aria-hidden />}
                Connect HubSpot
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3 rounded-2xl border border-primary/30 bg-primary/[0.06] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={cn("w-fit gap-2 rounded-xl", dashboardOutlineActionClass)}
              disabled={busy}
              onClick={() => void onDisconnect()}
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Unplug className="h-4 w-4" aria-hidden />}
              Disconnect
            </Button>
            <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">
              Use <strong className="font-medium text-foreground">Export to HubSpot</strong> on a completed
              campaign to create a deal, notes, and attach the dossier PDF.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
