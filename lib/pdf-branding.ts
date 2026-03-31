/** PDF export branding (colors, org line, logo URL, dark PDF). Client `loadPdfBranding`; server may override via Prompt 79 DTO. */

import type { CampaignPdfExportOptions } from "@/lib/campaign-pdf";
import { DEFAULT_BRAND_DISPLAY_NAME } from "@/lib/brand-prompt";
import type { WhiteLabelClientSettingsDTO } from "@/types";

export const PDF_BRANDING_STORAGE_KEY = "agentforge_pdf_branding_v1";

export type PdfBrandingStateV1 = {
  primaryHex: string;
  secondaryHex: string;
  orgName: string;
  pdfDark: boolean;
  logoPublicUrl: string;
};

export const defaultPdfBrandingState: PdfBrandingStateV1 = {
  primaryHex: "#3b82f6",
  secondaryHex: "#0f172a",
  orgName: "",
  pdfDark: false,
  logoPublicUrl: "",
};

export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return {
    r: (n >> 16) & 255,
    g: (n >> 8) & 255,
    b: n & 255,
  };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function loadPdfBranding(): PdfBrandingStateV1 {
  if (typeof window === "undefined") return { ...defaultPdfBrandingState };
  try {
    const raw = window.localStorage.getItem(PDF_BRANDING_STORAGE_KEY);
    if (!raw) return { ...defaultPdfBrandingState };
    const p = JSON.parse(raw) as unknown;
    if (!isRecord(p)) return { ...defaultPdfBrandingState };
    return {
      primaryHex:
        typeof p.primaryHex === "string" && p.primaryHex.startsWith("#")
          ? p.primaryHex
          : defaultPdfBrandingState.primaryHex,
      secondaryHex:
        typeof p.secondaryHex === "string" && p.secondaryHex.startsWith("#")
          ? p.secondaryHex
          : defaultPdfBrandingState.secondaryHex,
      orgName: typeof p.orgName === "string" ? p.orgName.slice(0, 120) : "",
      pdfDark: p.pdfDark === true,
      logoPublicUrl:
        typeof p.logoPublicUrl === "string" ? p.logoPublicUrl.slice(0, 2048) : "",
    };
  } catch {
    return { ...defaultPdfBrandingState };
  }
}

export function savePdfBranding(patch: Partial<PdfBrandingStateV1>): PdfBrandingStateV1 {
  const prev = loadPdfBranding();
  const next: PdfBrandingStateV1 = { ...prev, ...patch };
  if (typeof window !== "undefined") {
    window.localStorage.setItem(PDF_BRANDING_STORAGE_KEY, JSON.stringify(next));
  }
  return next;
}

export async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("read failed"));
    reader.readAsDataURL(blob);
  });
}

/** Fetch public Supabase (or any) logo URL into a data URL for jsPDF. */
export async function resolveLogoDataUrl(
  logoPublicUrl: string | undefined | null,
): Promise<string | undefined> {
  const u = logoPublicUrl?.trim();
  if (!u) return undefined;
  try {
    const sep = u.includes("?") ? "&" : "?";
    const bust = `${u}${sep}af_pdf=${Date.now()}`;
    const res = await fetch(bust, { mode: "cors", cache: "no-store" });
    if (!res.ok) return undefined;
    const blob = await res.blob();
    if (!blob.type.startsWith("image/")) return undefined;
    return await blobToDataUrl(blob);
  } catch {
    return undefined;
  }
}

/** Merges saved branding into PDF export options (fetches logo for jsPDF). */
export async function buildCampaignPdfExportOptions(
  serverWhiteLabel?: WhiteLabelClientSettingsDTO | null,
): Promise<CampaignPdfExportOptions> {
  const b = loadPdfBranding();
  const useServer = serverWhiteLabel != null;
  const primaryHex = useServer ? serverWhiteLabel!.primaryColor : b.primaryHex;
  const secondaryHex = useServer ? serverWhiteLabel!.secondaryColor : b.secondaryHex;
  /** Prompt 112 — align with `mergeWhiteLabelRow` signoff when app name is blank. */
  const orgTitle = useServer
    ? serverWhiteLabel!.appName.trim() ||
      serverWhiteLabel!.brandSignoff?.trim() ||
      b.orgName.trim() ||
      DEFAULT_BRAND_DISPLAY_NAME
    : b.orgName.trim() || DEFAULT_BRAND_DISPLAY_NAME;
  const logoRef =
    useServer && serverWhiteLabel!.logoUrl.trim().length > 0
      ? serverWhiteLabel!.logoUrl
      : b.logoPublicUrl;
  const primaryRgb = hexToRgb(primaryHex) ?? undefined;
  const secondaryRgb = hexToRgb(secondaryHex) ?? undefined;
  const logoDataUrl = await resolveLogoDataUrl(logoRef);
  return {
    mode: b.pdfDark ? "dark" : "light",
    primaryRgb,
    secondaryRgb,
    logoDataUrl,
    reportTitle: orgTitle,
  };
}
