import "server-only";

import { DEFAULT_BRAND_DISPLAY_NAME } from "@/lib/brand-prompt";
import type { CampaignPdfExportOptions } from "@/lib/campaign-pdf";
import { hexToRgb, resolveLogoDataUrl } from "@/lib/pdf-branding";
import type { SupabaseClient } from "@supabase/supabase-js";

export type WhiteLabelRow = {
  app_name: string;
  company_name: string;
  primary_color: string;
  secondary_color: string;
  support_email: string;
  logo_url: string;
};

export type WhiteLabelClientSettings = {
  /** Header / hero — defaults to AgentForge Sales when unset in DB. */
  appName: string;
  companyName: string;
  primaryColor: string;
  secondaryColor: string;
  supportEmail: string;
  logoUrl: string;
  /** Email sign-off line + PDF org line: app_name || company_name || default. */
  brandSignoff: string;
};

function isHexColor(s: string): boolean {
  return /^#([0-9a-fA-F]{6})$/.test(s.trim());
}

export function mergeWhiteLabelRow(row: Partial<WhiteLabelRow> | null): WhiteLabelClientSettings {
  const app = typeof row?.app_name === "string" ? row.app_name.trim() : "";
  const company = typeof row?.company_name === "string" ? row.company_name.trim() : "";
  const primary =
    typeof row?.primary_color === "string" && isHexColor(row.primary_color)
      ? row.primary_color.trim()
      : "#3b82f6";
  const secondary =
    typeof row?.secondary_color === "string" && isHexColor(row.secondary_color)
      ? row.secondary_color.trim()
      : "#0f172a";
  const support = typeof row?.support_email === "string" ? row.support_email.trim() : "";
  const logo = typeof row?.logo_url === "string" ? row.logo_url.trim() : "";

  const brandSignoff = app || company || DEFAULT_BRAND_DISPLAY_NAME;

  return {
    appName: app || DEFAULT_BRAND_DISPLAY_NAME,
    companyName: company,
    primaryColor: primary,
    secondaryColor: secondary,
    supportEmail: support,
    logoUrl: logo,
    brandSignoff,
  };
}

export async function fetchWhiteLabelSettings(
  supabase: SupabaseClient,
  userId: string,
): Promise<WhiteLabelClientSettings> {
  const { data, error } = await supabase
    .from("white_label_settings")
    .select("app_name, company_name, primary_color, secondary_color, support_email, logo_url")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.warn("[AgentForge] fetchWhiteLabelSettings", error.message);
    return mergeWhiteLabelRow(null);
  }
  return mergeWhiteLabelRow(data as Partial<WhiteLabelRow> | null);
}

/** Server-side PDF options for HubSpot (and any Node caller) — matches dashboard white-label. */
export async function buildCampaignPdfExportOptionsFromWhiteLabel(
  wl: WhiteLabelClientSettings,
): Promise<CampaignPdfExportOptions> {
  const primaryRgb = hexToRgb(wl.primaryColor) ?? undefined;
  const secondaryRgb = hexToRgb(wl.secondaryColor) ?? undefined;
  const logoDataUrl = await resolveLogoDataUrl(wl.logoUrl || undefined);
  return {
    mode: "light",
    primaryRgb,
    secondaryRgb,
    logoDataUrl,
    reportTitle: wl.appName,
  };
}
