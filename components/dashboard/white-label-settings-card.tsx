"use client";

import { saveWhiteLabelSettingsAction, uploadBrandingLogoAction } from "@/app/(dashboard)/actions";
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
import { savePdfBranding } from "@/lib/pdf-branding";
import { cn } from "@/lib/utils";
import type { WhiteLabelClientSettingsDTO } from "@/types";
import { ImagePlus, Loader2, Palette } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCallback, useState, useTransition } from "react";
import { toast } from "@/hooks/use-toast";

type Props = {
  initial: WhiteLabelClientSettingsDTO;
};

export function WhiteLabelSettingsCard({ initial }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [appName, setAppName] = useState(initial.appName);
  const [companyName, setCompanyName] = useState(initial.companyName);
  const [primaryColor, setPrimaryColor] = useState(initial.primaryColor);
  const [secondaryColor, setSecondaryColor] = useState(initial.secondaryColor);
  const [supportEmail, setSupportEmail] = useState(initial.supportEmail);
  const [logoUrl, setLogoUrl] = useState(initial.logoUrl);

  const persistLocalBranding = useCallback(() => {
    savePdfBranding({
      orgName: appName,
      primaryHex: primaryColor,
      secondaryHex: secondaryColor,
      logoPublicUrl: logoUrl,
    });
  }, [appName, primaryColor, secondaryColor, logoUrl]);

  function onLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
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
      setLogoUrl(res.publicUrl);
      savePdfBranding({ logoPublicUrl: res.publicUrl });
      toast({ title: "Logo uploaded", description: "Saved to your white-label profile." });
      router.refresh();
    });
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const res = await saveWhiteLabelSettingsAction({
        app_name: appName,
        company_name: companyName,
        primary_color: primaryColor,
        secondary_color: secondaryColor,
        support_email: supportEmail,
        logo_url: logoUrl,
      });
      if (!res.ok) {
        toast({
          variant: "destructive",
          title: "Could not save",
          description: res.error,
        });
        return;
      }
      persistLocalBranding();
      toast({ title: "White-label saved", description: "Branding applies to new campaigns and exports." });
      router.refresh();
    });
  }

  return (
    <Card
      className={cn(
        "h-full overflow-hidden rounded-2xl border-border/55 bg-card shadow-lift ring-1 ring-border/25",
        "transition-all duration-300 hover:-translate-y-0.5 hover:shadow-soft",
      )}
    >
      <CardHeader className="space-y-3 border-b border-border/40 bg-gradient-to-br from-primary/[0.07] via-card to-amber-500/[0.05] px-6 pb-6 pt-7 sm:px-8 sm:pt-8">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary/90">
          Brand &amp; experience
        </p>
        <div className="flex gap-4">
          <div className="mt-0.5 flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-primary/25 bg-card shadow-sm">
            <Palette className="h-6 w-6 text-primary" aria-hidden />
          </div>
          <div className="min-w-0 space-y-2">
            <CardTitle className="text-xl font-semibold tracking-tight">White-label</CardTitle>
            <CardDescription className="text-[15px] leading-relaxed text-muted-foreground">
              Rebrand the app name, colors, support contact, and logo for your dashboard and exports. Leave
              fields blank to keep sensible defaults.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-6 py-8 sm:px-8 sm:py-9">
        <form onSubmit={onSubmit} className="space-y-8">
          <div className="rounded-2xl border border-border/45 bg-muted/20 p-5 shadow-inner sm:p-6">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
              Identity
            </p>
            <div className="mt-4 grid gap-5 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="wl-app-name">Custom app name</Label>
                <Input
                  id="wl-app-name"
                  value={appName}
                  onChange={(e) => setAppName(e.target.value)}
                  placeholder="AgentForge Sales"
                  maxLength={120}
                  autoComplete="organization"
                  className="h-11 rounded-xl border-border/60 shadow-sm"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="wl-company">Company name</Label>
                <Input
                  id="wl-company"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="Your company"
                  maxLength={120}
                  className="h-11 rounded-xl border-border/60 shadow-sm"
                />
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-border/45 bg-muted/20 p-5 shadow-inner sm:p-6">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
              Color system
            </p>
            <div className="mt-4 grid gap-5 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="wl-primary">Primary color</Label>
                <div className="flex gap-2">
                  <Input
                    id="wl-primary"
                    type="color"
                    className="h-11 w-14 cursor-pointer rounded-xl border-border/60 p-1"
                    value={primaryColor}
                    onChange={(e) => setPrimaryColor(e.target.value)}
                  />
                  <Input
                    value={primaryColor}
                    onChange={(e) => setPrimaryColor(e.target.value)}
                    className="h-11 rounded-xl font-mono text-sm shadow-sm"
                    maxLength={7}
                    spellCheck={false}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="wl-secondary">Secondary color</Label>
                <div className="flex gap-2">
                  <Input
                    id="wl-secondary"
                    type="color"
                    className="h-11 w-14 cursor-pointer rounded-xl border-border/60 p-1"
                    value={secondaryColor}
                    onChange={(e) => setSecondaryColor(e.target.value)}
                  />
                  <Input
                    value={secondaryColor}
                    onChange={(e) => setSecondaryColor(e.target.value)}
                    className="h-11 rounded-xl font-mono text-sm shadow-sm"
                    maxLength={7}
                    spellCheck={false}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-border/45 bg-muted/20 p-5 shadow-inner sm:p-6">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
              Contact &amp; logo
            </p>
            <div className="mt-4 space-y-5">
              <div className="space-y-2">
                <Label htmlFor="wl-support">Support email</Label>
                <Input
                  id="wl-support"
                  type="email"
                  value={supportEmail}
                  onChange={(e) => setSupportEmail(e.target.value)}
                  placeholder="support@yourcompany.com"
                  autoComplete="email"
                  className="h-11 rounded-xl border-border/60 shadow-sm"
                />
              </div>

              <div className="space-y-3">
                <Label>Logo</Label>
                <div className="flex flex-wrap items-center gap-5">
                  {logoUrl ? (
                    <div className="relative h-16 w-16 overflow-hidden rounded-2xl border border-border/50 bg-background shadow-sm">
                      <Image src={logoUrl} alt="" fill className="object-contain p-1.5" unoptimized />
                    </div>
                  ) : (
                    <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-dashed border-border/60 bg-muted/30 text-muted-foreground">
                      <ImagePlus className="h-7 w-7" aria-hidden />
                    </div>
                  )}
                  <div>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      id="wl-logo-upload"
                      onChange={onLogoUpload}
                      disabled={pending}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className={cn("gap-2 rounded-xl", dashboardOutlineActionClass)}
                      disabled={pending}
                      onClick={() => document.getElementById("wl-logo-upload")?.click()}
                    >
                      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
                      Upload logo
                    </Button>
                    <p className="mt-2 text-xs text-muted-foreground">PNG or JPG, up to 2MB.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <Button
            type="submit"
            disabled={pending}
            className="h-11 gap-2 rounded-xl px-8 shadow-soft transition-transform active:scale-[0.99]"
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Save white-label settings
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
