"use client";

import { uploadBrandingLogoAction } from "@/app/(dashboard)/actions";
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
import {
  defaultPdfBrandingState,
  loadPdfBranding,
  savePdfBranding,
  type PdfBrandingStateV1,
} from "@/lib/pdf-branding";
import { cn } from "@/lib/utils";
import { ImagePlus, Loader2, Palette } from "lucide-react";
import Image from "next/image";
import { useCallback, useEffect, useState, useTransition } from "react";
import { toast } from "@/hooks/use-toast";

export function PdfBrandingPanel() {
  const [state, setState] = useState<PdfBrandingStateV1>(defaultPdfBrandingState);
  const [mounted, setMounted] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    setState(loadPdfBranding());
    setMounted(true);
  }, []);

  const persist = useCallback((patch: Partial<PdfBrandingStateV1>) => {
    const next = savePdfBranding(patch);
    setState(next);
  }, []);

  function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    startTransition(async () => {
      const fd = new FormData();
      fd.set("file", file);
      const res = await uploadBrandingLogoAction(fd);
      if (!res.ok) {
        toast({
          variant: "destructive",
          title: "Logo upload failed",
          description: res.error,
        });
        return;
      }
      persist({ logoPublicUrl: res.publicUrl });
      toast({
        title: "Logo saved",
        description: "Your next PDF export will include this mark.",
      });
    });
  }

  if (!mounted) {
    return (
      <Card className="rounded-2xl border-border/80 shadow-xl ring-1 ring-border/20 dark:ring-white/[0.07]">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg tracking-tight">Report branding</CardTitle>
          <CardDescription>Loading…</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="rounded-2xl border-border/80 bg-card/95 shadow-xl ring-1 ring-border/20 transition-shadow duration-500 hover:shadow-2xl dark:bg-card/95 dark:ring-white/[0.07]">
      <CardHeader className="space-y-1 border-b border-border/50 bg-gradient-to-r from-primary/[0.06] via-muted/35 to-transparent pb-5 dark:from-primary/[0.08] dark:via-muted/15">
        <div className="flex flex-wrap items-center gap-2">
          <div className="rounded-lg border border-border/60 bg-background/80 p-2 shadow-sm">
            <Palette className="h-4 w-4 text-primary" aria-hidden />
          </div>
          <div>
            <CardTitle className="text-lg tracking-tight">Report branding</CardTitle>
            <CardDescription className="text-sm leading-relaxed">
              Logo uploads to your{" "}
              <span className="font-medium text-foreground">Supabase</span>{" "}
              <code className="rounded bg-muted px-1 text-xs">branding-logos</code> bucket; primary /
              secondary colors and dark mode shape the{" "}
              <span className="font-medium text-foreground">executive one-pager</span>, headers, and
              footers on PDFs; org line and logo also prefix{" "}
              <span className="font-medium text-foreground">Markdown</span> and{" "}
              <span className="font-medium text-foreground">JSON</span> exports.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="grid gap-5 pt-5 sm:grid-cols-2">
        <div className="space-y-3">
          <Label htmlFor="pdf-org-name">Cover title / org line</Label>
          <Input
            id="pdf-org-name"
            placeholder="AgentForge Sales"
            value={state.orgName}
            onChange={(e) => persist({ orgName: e.target.value })}
          />
          <p className="text-[11px] text-muted-foreground">
            Shown on the PDF cover band and footers. Leave blank for default product name.
          </p>
        </div>
        <div className="space-y-3">
          <Label>Logo</Label>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={cn("relative gap-2", dashboardOutlineActionClass)}
              disabled={pending}
            >
              {pending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <ImagePlus className="h-4 w-4 opacity-80" aria-hidden />
              )}
              Upload logo
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="absolute inset-0 cursor-pointer opacity-0"
                disabled={pending}
                onChange={onUpload}
                aria-label="Upload logo image"
              />
            </Button>
            {state.logoPublicUrl ? (
              <Image
                src={state.logoPublicUrl}
                alt=""
                width={140}
                height={40}
                className="h-10 max-w-[140px] rounded-md border border-border/60 bg-background object-contain p-1"
                unoptimized
              />
            ) : null}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 px-2 text-xs text-muted-foreground"
            disabled={!state.logoPublicUrl}
            onClick={() => persist({ logoPublicUrl: "" })}
          >
            Clear logo
          </Button>
          <p className="text-[11px] text-muted-foreground">
            Requires <code className="rounded bg-muted px-1 text-[10px]">branding-logos</code> bucket — see{" "}
            <code className="rounded bg-muted px-1 text-[10px]">supabase/branding-storage.sql</code>.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="pdf-primary">Primary accent</Label>
          <div className="flex gap-2">
            <Input
              id="pdf-primary"
              type="color"
              className="h-10 w-14 cursor-pointer p-1"
              value={state.primaryHex}
              onChange={(e) => persist({ primaryHex: e.target.value })}
            />
            <Input
              value={state.primaryHex}
              onChange={(e) => persist({ primaryHex: e.target.value })}
              className="font-mono text-xs"
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="pdf-secondary">Secondary (headers / ink)</Label>
          <div className="flex gap-2">
            <Input
              id="pdf-secondary"
              type="color"
              className="h-10 w-14 cursor-pointer p-1"
              value={state.secondaryHex}
              onChange={(e) => persist({ secondaryHex: e.target.value })}
            />
            <Input
              value={state.secondaryHex}
              onChange={(e) => persist({ secondaryHex: e.target.value })}
              className="font-mono text-xs"
            />
          </div>
        </div>
        <div className="sm:col-span-2 flex flex-wrap items-center gap-3 rounded-lg border border-border/60 bg-muted/15 px-4 py-3 dark:bg-muted/10">
          <input
            id="pdf-dark"
            type="checkbox"
            className="h-4 w-4 rounded border-input"
            checked={state.pdfDark}
            onChange={(e) => persist({ pdfDark: e.target.checked })}
          />
          <Label htmlFor="pdf-dark" className="cursor-pointer text-sm font-normal leading-snug">
            Dark PDF theme (executive night mode — high contrast, consulting-style layout)
          </Label>
        </div>
      </CardContent>
    </Card>
  );
}
