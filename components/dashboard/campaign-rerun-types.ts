import type { LeadFormInput } from "@/agents/types";

/** Client-only payload: pre-fill workspace and optionally auto-start via `startCampaignAction`. */
export type CampaignRerunPayload = {
  nonce: number;
  values: LeadFormInput;
  autoStart: boolean;
  /** Prompt 85 — persisted on next run via `startCampaignWithOptionsAction`. */
  source_template_id?: string;
  /** Prompt 88 — optional saved sequence for the next run. */
  source_sequence_id?: string;
};
