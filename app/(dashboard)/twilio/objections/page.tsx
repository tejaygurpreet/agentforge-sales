import Link from "next/link";
import { ObjectionLibrarySection } from "@/components/dashboard/objection-library-section";
import { Button } from "@/components/ui/button";
import { loadTwilioObjectionLibraryPageData } from "@/lib/twilio-objection-library";

export const dynamic = "force-dynamic";

/**
 * Prompt 162 — Dedicated voice transcripts + objection library (same data as dashboard section).
 */
export default async function TwilioObjectionsPage() {
  const { transcripts, objections } = await loadTwilioObjectionLibraryPageData();

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
            Twilio &amp; voice
          </p>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Voice transcripts</h1>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            Past inbound and outbound call transcripts and living objections for your workspace — used by SDR
            agents in campaigns.
          </p>
        </div>
        <Button variant="outline" size="sm" className="rounded-[var(--card-radius)]" asChild>
          <Link href="/setup">Back to setup</Link>
        </Button>
      </div>
      <ObjectionLibrarySection transcripts={transcripts} objections={objections} />
    </div>
  );
}
