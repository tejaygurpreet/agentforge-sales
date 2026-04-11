import { redirect } from "next/navigation";

/** Auth + redirect — not statically generated. */
export const dynamic = "force-dynamic";

/**
 * Prompt 175 — Temporary: everyone (signed in or not) lands on `/login` from root.
 * Marketing hero remains at `/homepage`; operational dashboard at `/dashboard`.
 */
export default function RootPage() {
  redirect("/login");
}
