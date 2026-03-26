"use client";

import type { LeadFormInput } from "@/agents/types";
import type { PersistedCampaignRow } from "@/types";
import { CampaignWorkspace } from "@/components/dashboard/campaign-workspace";
import { RecentCampaigns } from "@/components/dashboard/recent-campaigns";
import { useCallback, useState } from "react";
import type { CampaignRerunPayload } from "@/components/dashboard/campaign-rerun-types";

export type { CampaignRerunPayload } from "@/components/dashboard/campaign-rerun-types";

type Props = {
  recentCampaigns: PersistedCampaignRow[];
};

/**
 * Client-only shell: recent list + new-lead workspace. No render props from the server (Prompt 24).
 * Reply Analyzer sits between Report branding and New campaign inside CampaignWorkspace (Prompt 55).
 */
export function DashboardCampaignRunner({ recentCampaigns }: Props) {
  const [rerunRequest, setRerunRequest] = useState<CampaignRerunPayload | null>(null);

  const onRerunConsumed = useCallback(() => {
    setRerunRequest(null);
  }, []);

  const handleRerun = useCallback((values: LeadFormInput) => {
    setRerunRequest({
      nonce: Date.now(),
      values,
      autoStart: true,
    });
  }, []);

  return (
    <div className="space-y-10 sm:space-y-12">
      <RecentCampaigns campaigns={recentCampaigns} onRerunLead={handleRerun} />
      <CampaignWorkspace rerunRequest={rerunRequest} onRerunConsumed={onRerunConsumed} />
    </div>
  );
}
