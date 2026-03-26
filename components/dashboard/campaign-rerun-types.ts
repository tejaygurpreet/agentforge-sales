import type { LeadFormInput } from "@/agents/types";

/** Client-only payload: pre-fill workspace and optionally auto-start via `startCampaignAction`. */
export type CampaignRerunPayload = {
  nonce: number;
  values: LeadFormInput;
  autoStart: boolean;
};
