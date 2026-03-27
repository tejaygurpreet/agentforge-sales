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
import { Link2, Loader2, Unplug } from "lucide-react";
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
        "premium-surface rounded-2xl border border-orange-500/25 bg-gradient-to-br from-card/95 via-card/85 to-orange-500/[0.06] shadow-lg ring-1 ring-orange-500/15 dark:to-orange-500/[0.1]",
      )}
    >
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0 pb-4">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-lg border border-orange-500/35 bg-orange-500/15 p-2 text-orange-700 dark:text-orange-200">
              <Link2 className="h-4 w-4" aria-hidden />
            </span>
            <CardTitle className="text-lg font-semibold tracking-tight">Connect HubSpot</CardTitle>
            {connected ? (
              <Badge className="border-emerald-500/40 bg-emerald-600/15 text-emerald-900 dark:text-emerald-100">
                Connected
              </Badge>
            ) : (
              <Badge variant="outline" className="border-muted-foreground/30">
                Not connected
              </Badge>
            )}
          </div>
          <CardDescription className="max-w-2xl text-sm">
            Add a{" "}
            <span className="font-medium text-foreground">Private App access token</span> from HubSpot
            (Settings → Integrations → Private Apps). It is stored encrypted at rest in your Supabase
            workspace and used only from this server to sync deals and notes — never exposed to the
            browser.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {error ? (
          <p
            role="alert"
            className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {error}
          </p>
        ) : null}
        {!connected ? (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
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
                className="font-mono text-sm"
              />
            </div>
            <Button
              type="button"
              disabled={busy || token.trim().length < 20}
              className={cn("shrink-0 gap-2 sm:w-auto", dashboardOutlineActionClass)}
              onClick={() => void onConnect()}
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              Connect
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={cn("gap-2", dashboardOutlineActionClass)}
              disabled={busy}
              onClick={() => void onDisconnect()}
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Unplug className="h-4 w-4" />}
              Disconnect
            </Button>
            <p className="text-xs text-muted-foreground">
              Use <strong className="font-medium text-foreground">Export to HubSpot</strong> on a
              completed campaign to create a deal, notes, and attach the dossier PDF.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
