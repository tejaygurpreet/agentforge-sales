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
import { ImagePlus, Loader2 } from "lucide-react";
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
    <Card className="rounded-2xl border-border/80 shadow-xl ring-1 ring-border/20 dark:ring-white/[0.07]">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg tracking-tight">White-label settings</CardTitle>
        <CardDescription>
          Rebrand the app name, colors, support contact, and logo for your dashboard and exports.
          Leave blank to keep the default product name.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="wl-app-name">Custom app name</Label>
              <Input
                id="wl-app-name"
                value={appName}
                onChange={(e) => setAppName(e.target.value)}
                placeholder="AgentForge Sales"
                maxLength={120}
                autoComplete="organization"
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
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="wl-primary">Primary color</Label>
              <div className="flex gap-2">
                <Input
                  id="wl-primary"
                  type="color"
                  className="h-10 w-14 cursor-pointer p-1"
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                />
                <Input
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  className="font-mono text-sm"
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
                  className="h-10 w-14 cursor-pointer p-1"
                  value={secondaryColor}
                  onChange={(e) => setSecondaryColor(e.target.value)}
                />
                <Input
                  value={secondaryColor}
                  onChange={(e) => setSecondaryColor(e.target.value)}
                  className="font-mono text-sm"
                  maxLength={7}
                  spellCheck={false}
                />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="wl-support">Support email</Label>
            <Input
              id="wl-support"
              type="email"
              value={supportEmail}
              onChange={(e) => setSupportEmail(e.target.value)}
              placeholder="support@yourcompany.com"
              autoComplete="email"
            />
          </div>

          <div className="space-y-2">
            <Label>Logo</Label>
            <div className="flex flex-wrap items-center gap-4">
              {logoUrl ? (
                <div className="relative h-14 w-14 overflow-hidden rounded-lg border bg-background">
                  <Image
                    src={logoUrl}
                    alt=""
                    fill
                    className="object-contain p-1"
                    unoptimized
                  />
                </div>
              ) : (
                <div className="flex h-14 w-14 items-center justify-center rounded-lg border border-dashed text-muted-foreground">
                  <ImagePlus className="h-6 w-6" aria-hidden />
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
                  className={cn("gap-2", dashboardOutlineActionClass)}
                  disabled={pending}
                  onClick={() => document.getElementById("wl-logo-upload")?.click()}
                >
                  {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
                  Upload logo
                </Button>
                <p className="mt-1 text-xs text-muted-foreground">PNG or JPG, up to 2MB.</p>
              </div>
            </div>
          </div>

          <Button type="submit" disabled={pending} className="gap-2">
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Save white-label settings
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
