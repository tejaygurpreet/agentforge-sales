/**
 * Prompt 115 / 155 — Same handler as `app/api/webhooks/resend/route.ts` (canonical implementation).
 * Configure either URL in Resend Inbound webhooks; both verify `WEBHOOK_SECRET` and persist via `lib/inbox.ts`.
 */
export { dynamic, GET, POST } from "@/app/api/webhooks/resend/route";
