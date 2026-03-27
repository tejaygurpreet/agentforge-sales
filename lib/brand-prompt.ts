/** Default product name when white-label row is empty (Prompt 79). */
export const DEFAULT_BRAND_DISPLAY_NAME = "AgentForge Sales";

/** Replace default product name in long system prompt bodies (Prompt 79). */
export function substituteBrandInPrompt(text: string, brandDisplayName: string): string {
  const b = brandDisplayName.trim() || DEFAULT_BRAND_DISPLAY_NAME;
  if (b === DEFAULT_BRAND_DISPLAY_NAME) return text;
  return text.split(DEFAULT_BRAND_DISPLAY_NAME).join(b);
}
