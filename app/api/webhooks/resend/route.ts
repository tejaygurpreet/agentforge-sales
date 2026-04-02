/**
 * Prompt 153 — Alias for Resend inbound webhooks (`email.received`). Same handler as `/api/inbound/resend`.
 * Point Resend at either URL; both verify `WEBHOOK_SECRET` and persist via `lib/inbox.ts`.
 */
export { dynamic, GET, POST } from "@/app/api/inbound/resend/route";
