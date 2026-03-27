"use client";

import {
  inviteWorkspaceMemberAction,
  updateWorkspaceMemberRoleAction,
} from "@/app/(dashboard)/actions";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { dashboardOutlineActionClass } from "@/lib/dashboard-action-classes";
import { cn } from "@/lib/utils";
import type { WorkspaceMemberDTO, WorkspaceMemberRole } from "@/types";
import { Loader2, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "@/hooks/use-toast";

type Props = {
  members: WorkspaceMemberDTO[];
  currentRole: WorkspaceMemberRole;
};

const ROLE_OPTIONS: WorkspaceMemberRole[] = ["admin", "member", "viewer"];

export function WorkspaceMembersCard({ members, currentRole }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<WorkspaceMemberRole>("member");

  const canManage = currentRole === "admin";
  const activeMembers = useMemo(() => members.filter((m) => m.status === "active"), [members]);
  const pendingInvites = useMemo(() => members.filter((m) => m.status === "pending"), [members]);

  function onInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!canManage) return;
    startTransition(async () => {
      const res = await inviteWorkspaceMemberAction({
        email,
        role,
      });
      if (!res.ok) {
        toast({
          variant: "destructive",
          title: "Invite failed",
          description: res.error,
        });
        return;
      }
      setEmail("");
      toast({
        title: "Invite saved",
        description: "If the user already has an account, access is immediate.",
      });
      router.refresh();
    });
  }

  function onRoleChange(member: WorkspaceMemberDTO, nextRole: WorkspaceMemberRole) {
    if (!canManage || !member.user_id || member.is_self) return;
    const targetUserId = member.user_id;
    startTransition(async () => {
      const res = await updateWorkspaceMemberRoleAction({
        user_id: targetUserId,
        role: nextRole,
      });
      if (!res.ok) {
        toast({
          variant: "destructive",
          title: "Role update failed",
          description: res.error,
        });
        return;
      }
      toast({ title: "Role updated" });
      router.refresh();
    });
  }

  return (
    <Card className="rounded-2xl border-border/80 shadow-xl ring-1 ring-border/20 dark:ring-white/[0.07]">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg tracking-tight">
          <Users className="h-5 w-5 text-primary" aria-hidden />
          Workspace members
        </CardTitle>
        <CardDescription>
          Invite team members to share campaigns, leads, and analytics in this workspace.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <form onSubmit={onInvite} className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
          <div className="space-y-1.5">
            <Label htmlFor="invite-email">Email</Label>
            <Input
              id="invite-email"
              type="email"
              placeholder="teammate@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={pending || !canManage}
              autoComplete="email"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="invite-role">Role</Label>
            <select
              id="invite-role"
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              value={role}
              onChange={(e) => setRole(e.target.value as WorkspaceMemberRole)}
              disabled={pending || !canManage}
            >
              {ROLE_OPTIONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          <div className="self-end">
            <Button type="submit" disabled={pending || !canManage} className="gap-2">
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Invite
            </Button>
          </div>
        </form>

        {!canManage ? (
          <p className="text-xs text-muted-foreground">
            Your role is <span className="font-semibold">{currentRole}</span>. Only admins can manage
            invitations and roles.
          </p>
        ) : null}

        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Active members ({activeMembers.length})
          </p>
          <ul className="space-y-2">
            {activeMembers.map((m) => (
              <li
                key={`${m.workspace_id}-${m.user_id ?? m.invited_email ?? m.created_at}`}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/60 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {m.is_self ? "You" : m.invited_email || m.user_id || "Member"}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {m.user_id ?? m.invited_email ?? "—"}
                  </p>
                </div>
                {canManage && !m.is_self && m.user_id ? (
                  <select
                    className={cn(
                      "h-8 rounded-md border border-input bg-background px-2 text-xs",
                      dashboardOutlineActionClass,
                    )}
                    value={m.role}
                    onChange={(e) => onRoleChange(m, e.target.value as WorkspaceMemberRole)}
                    disabled={pending}
                  >
                    {ROLE_OPTIONS.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="text-xs capitalize text-muted-foreground">{m.role}</span>
                )}
              </li>
            ))}
          </ul>
        </div>

        {pendingInvites.length > 0 ? (
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Pending invites ({pendingInvites.length})
            </p>
            <ul className="space-y-2">
              {pendingInvites.map((m) => (
                <li
                  key={`${m.workspace_id}-${m.invited_email ?? m.created_at}`}
                  className="flex items-center justify-between rounded-md border border-dashed border-border/70 px-3 py-2 text-sm"
                >
                  <span className="truncate">{m.invited_email ?? "pending"}</span>
                  <span className="text-xs capitalize text-muted-foreground">{m.role}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

