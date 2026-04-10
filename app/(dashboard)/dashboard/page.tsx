import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** Alias: `/dashboard` → main dashboard at `/`. */
export default function DashboardAliasPage() {
  redirect("/");
}
