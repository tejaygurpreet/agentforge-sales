import { redirect } from "next/navigation";

/** Prompt 135 — Setup hub moved to `/setup` (illustrated integrations + tour). */
export default function OnboardingPage() {
  redirect("/setup");
}
