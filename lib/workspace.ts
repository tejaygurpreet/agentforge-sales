import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export type WorkspaceRole = "admin" | "member" | "viewer";

export type WorkspaceMemberRow = {
  workspace_id: string;
  user_id: string | null;
  role: WorkspaceRole;
  invited_email: string | null;
  status: "active" | "pending";
  created_at: string;
};

export type WorkspaceContext = {
  workspaceId: string;
  currentUserRole: WorkspaceRole;
  memberUserIds: string[];
};

const ROLE_RANK: Record<WorkspaceRole, number> = {
  admin: 3,
  member: 2,
  viewer: 1,
};

function normRole(v: unknown): WorkspaceRole {
  if (v === "admin" || v === "member" || v === "viewer") return v;
  return "viewer";
}

async function acceptPendingInvitesByEmail(
  supabase: SupabaseClient,
  userId: string,
  email: string | null,
): Promise<void> {
  const e = email?.trim().toLowerCase();
  if (!e) return;
  await supabase
    .from("workspace_members")
    .update({
      user_id: userId,
      status: "active",
      invited_email: e,
    })
    .is("user_id", null)
    .eq("invited_email", e)
    .eq("status", "pending");
}

/**
 * Prompt 81: ensures legacy single-user behavior by creating a personal workspace membership.
 */
export async function ensurePersonalWorkspaceMembership(
  supabase: SupabaseClient,
  userId: string,
): Promise<void> {
  await supabase.from("workspace_members").upsert(
    {
      workspace_id: userId,
      user_id: userId,
      role: "admin",
      status: "active",
      invited_email: null,
    },
    { onConflict: "workspace_id,user_id" },
  );
}

/**
 * Picks a default active workspace:
 * - if user has non-personal active memberships, choose highest role then oldest row
 * - otherwise fall back to personal workspace (= user_id)
 */
export async function resolveWorkspaceContext(
  supabase: SupabaseClient,
  user: { id: string; email?: string | null },
): Promise<WorkspaceContext> {
  await ensurePersonalWorkspaceMembership(supabase, user.id);
  await acceptPendingInvitesByEmail(supabase, user.id, user.email ?? null);

  const { data, error } = await supabase
    .from("workspace_members")
    .select("workspace_id, role, created_at")
    .eq("user_id", user.id)
    .eq("status", "active");

  if (error || !Array.isArray(data) || data.length === 0) {
    return {
      workspaceId: user.id,
      currentUserRole: "admin",
      memberUserIds: [user.id],
    };
  }

  const rows = data.map((r) => ({
    workspace_id: String((r as { workspace_id?: unknown }).workspace_id ?? ""),
    role: normRole((r as { role?: unknown }).role),
    created_at: String((r as { created_at?: unknown }).created_at ?? ""),
  }));

  rows.sort((a, b) => {
    const aNonSelf = a.workspace_id !== user.id ? 1 : 0;
    const bNonSelf = b.workspace_id !== user.id ? 1 : 0;
    if (aNonSelf !== bNonSelf) return bNonSelf - aNonSelf;
    const roleDelta = ROLE_RANK[b.role] - ROLE_RANK[a.role];
    if (roleDelta !== 0) return roleDelta;
    return a.created_at.localeCompare(b.created_at);
  });

  const selected = rows[0] ?? {
    workspace_id: user.id,
    role: "admin" as WorkspaceRole,
  };
  const workspaceId = selected.workspace_id || user.id;
  const currentUserRole = selected.role;

  const { data: memberRows } = await supabase
    .from("workspace_members")
    .select("user_id")
    .eq("workspace_id", workspaceId)
    .eq("status", "active")
    .not("user_id", "is", null);

  const memberUserIds = Array.from(
    new Set(
      (memberRows ?? [])
        .map((r) => (r as { user_id?: unknown }).user_id)
        .filter((x): x is string => typeof x === "string" && x.length > 0),
    ),
  );
  if (!memberUserIds.includes(user.id)) memberUserIds.push(user.id);

  return { workspaceId, currentUserRole, memberUserIds };
}

