/**
 * Prompt 66 / 68 — human sign-off line for outreach HTML. Prefer OUTREACH_SIGNOFF_NAME; else parse
 * display name from RESEND_FROM_EMAIL ("Name <email@...>"); else empty (prompt uses company-only).
 */
export function getOutreachSignoffNameForPrompt(): string {
  const explicit = process.env.OUTREACH_SIGNOFF_NAME?.trim();
  if (explicit) return explicit;
  const from = process.env.RESEND_FROM_EMAIL?.trim() ?? "";
  const m = from.match(/^["']?([^"'<]+?)["']?\s*</);
  if (m?.[1]) {
    const s = m[1].trim();
    if (s.length > 0 && s.length < 120) return s;
  }
  return "";
}

/**
 * Prompt 68 — signed-in user's full name from signup/profile wins; then env fallbacks.
 */
export function resolveOutreachSignoffName(senderFromAccount?: string | null): string {
  const fromAccount = senderFromAccount?.trim();
  if (fromAccount) return fromAccount;
  return getOutreachSignoffNameForPrompt();
}
