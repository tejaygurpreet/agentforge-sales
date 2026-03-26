/**
 * Canonical site origin for Supabase emailRedirectTo / OAuth callbacks.
 * Prefer NEXT_PUBLIC_APP_URL in production (e.g. https://agentforgesales.com); fallback to current browser origin.
 */
export function getAuthRedirectOrigin(): string {
  const fromEnv = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "");
  if (typeof window !== "undefined") {
    if (fromEnv) return fromEnv;
    return window.location.origin;
  }
  if (fromEnv) return fromEnv;
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL.replace(/\/$/, "")}`;
  }
  return "http://localhost:3000";
}
