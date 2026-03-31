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
import { Loader2, Mail, Send, Shield, Sparkles, UserPlus, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "@/hooks/use-toast";

type Props = {
  members: WorkspaceMemberDTO[];
  currentRole: WorkspaceMemberRole;
};

const ROLE_OPTIONS: WorkspaceMemberRole[] = ["admin", "member", "viewer"];

const ROLE_LABEL: Record<WorkspaceMemberRole, string> = {
  admin: "Admin",
  member: "Member",
  viewer: "Viewer",
};

function roleHint(role: WorkspaceMemberRole): string {
  switch (role) {
    case "admin":
      return "Full access — invites & roles";
    case "member":
      return "Create and run campaigns";
    case "viewer":
      return "Read-only analytics & history";
    default:
      return "";
  }
}

function displayLabel(m: WorkspaceMemberDTO): string {
  if (m.is_self) return "You";
  return m.invited_email || m.user_id || "Member";
}

function secondaryLine(m: WorkspaceMemberDTO): string {
  if (m.is_self && m.invited_email) return m.invited_email;
  if (m.invited_email && m.invited_email !== displayLabel(m)) return m.invited_email;
  if (m.user_id && !m.invited_email) return m.user_id;
  return "";
}

function initialsForMember(m: WorkspaceMemberDTO): string {
  const raw = m.invited_email || m.user_id || "?";
  const local = raw.split("@")[0] ?? raw;
  const parts = local.split(/[._-]+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase().slice(0, 2);
  }
  return local.slice(0, 2).toUpperCase() || "?";
}

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
    <Card
      className={cn(
        "overflow-hidden rounded-2xl border-border/55 bg-card shadow-lift ring-1 ring-border/25",
        "transition-shadow duration-300 hover:shadow-soft",
      )}
    >
      <CardHeader className="space-y-3 border-b border-border/40 bg-gradient-to-br from-accent/[0.07] via-card to-primary/[0.05] px-6 pb-6 pt-7 sm:px-8 sm:pt-8">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-accent-foreground/85">
          Collaboration
        </p>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 flex-1 gap-4">
            <div className="mt-0.5 flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-accent/30 bg-card shadow-sm">
              <Users className="h-6 w-6 text-accent-foreground" aria-hidden />
            </div>
            <div className="min-w-0 space-y-2">
              <CardTitle className="text-xl font-semibold tracking-tight text-foreground">
                Team &amp; workspace
              </CardTitle>
              <CardDescription className="text-[15px] leading-relaxed text-muted-foreground">
                Invite teammates to share campaigns, leads, and analytics. AI team coaching (Coaching tab)
                uses this roster for shared context.
              </CardDescription>
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-8 px-6 py-8 sm:px-8 sm:py-9">
        <div
          className={cn(
            "rounded-2xl border border-border/50 bg-gradient-to-br from-muted/35 via-card to-card p-5 shadow-inner ring-1 ring-black/[0.02] sm:p-6",
            !canManage && "opacity-95",
          )}
        >
          <div className="mb-4 flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-primary/20 bg-primary/[0.06] text-primary shadow-sm">
              <UserPlus className="h-4 w-4" aria-hidden />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Invite someone new</p>
              <p className="text-xs text-muted-foreground">They&apos;ll get workspace access based on the role you pick.</p>
            </div>
          </div>
          <form onSubmit={onInvite} className="grid gap-4 sm:grid-cols-[1fr_minmax(8rem,10rem)_auto] sm:items-end">
            <div className="space-y-2">
              <Label htmlFor="invite-email" className="text-sm font-medium">
                Work email
              </Label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <Input
                  id="invite-email"
                  type="email"
                  placeholder="teammate@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={pending || !canManage}
                  autoComplete="email"
                  className="h-11 rounded-xl border-border/60 pl-10 shadow-sm transition-shadow focus-visible:ring-2 focus-visible:ring-primary/25"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="invite-role" className="text-sm font-medium">
                Default role
              </Label>
              <select
                id="invite-role"
                className={cn(
                  "flex h-11 w-full rounded-xl border border-border/60 bg-card px-3 text-sm shadow-sm",
                  "transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25",
                  "disabled:cursor-not-allowed disabled:opacity-50",
                )}
                value={role}
                onChange={(e) => setRole(e.target.value as WorkspaceMemberRole)}
                disabled={pending || !canManage}
                title={roleHint(role)}
              >
                {ROLE_OPTIONS.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABEL[r]}
                  </option>
                ))}
              </select>
              <p className="text-[11px] leading-snug text-muted-foreground">{roleHint(role)}</p>
            </div>
            <div className="flex sm:justify-end">
              <Button
                type="submit"
                disabled={pending || !canManage || !email.trim()}
                className="h-11 min-w-[8.5rem] gap-2 rounded-xl px-6 shadow-soft transition-transform active:scale-[0.99]"
              >
                {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />}
                Send invite
              </Button>
            </div>
          </form>
        </div>

        {!canManage ? (
          <p className="flex items-start gap-2 rounded-xl border border-amber-400/35 bg-amber-500/[0.08] px-4 py-3 text-sm text-amber-950">
            <Shield className="mt-0.5 h-4 w-4 shrink-0 opacity-80" aria-hidden />
            <span>
              Your role is <span className="font-semibold capitalize">{currentRole}</span>. Only admins can
              send invites or change roles.
            </span>
          </p>
        ) : null}

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
              Active members · {activeMembers.length}
            </p>
            <Sparkles className="h-3.5 w-3.5 text-muted-foreground/60" aria-hidden />
          </div>
          <ul className="grid gap-3 sm:grid-cols-1 lg:grid-cols-2">
            {activeMembers.map((m) => (
              <li key={`${m.workspace_id}-${m.user_id ?? m.invited_email ?? m.created_at}`}>
                <div
                  className={cn(
                    "group flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/55 bg-card px-4 py-3.5 shadow-sm",
                    "ring-1 ring-black/[0.02] transition-all duration-200 hover:border-primary/20 hover:shadow-md",
                  )}
                >
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <div
                      className={cn(
                        "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-sm font-bold tabular-nums text-white shadow-sm",
                        m.is_self
                          ? "bg-gradient-to-br from-accent to-primary"
                          : "bg-gradient-to-br from-slate-500 to-slate-600",
                      )}
                      aria-hidden
                    >
                      {m.is_self ? "You" : initialsForMember(m)}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-foreground">{displayLabel(m)}</p>
                      {secondaryLine(m) ? (
                        <p className="truncate text-xs text-muted-foreground">{secondaryLine(m)}</p>
                      ) : null}
                    </div>
                  </div>
                  {canManage && !m.is_self && m.user_id ? (
                    <select
                      className={cn(
                        "h-9 rounded-lg border border-border/60 bg-background px-2.5 text-xs font-medium shadow-sm",
                        "transition-colors hover:border-primary/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25",
                        dashboardOutlineActionClass,
                      )}
                      value={m.role}
                      onChange={(e) => onRoleChange(m, e.target.value as WorkspaceMemberRole)}
                      disabled={pending}
                      aria-label={`Role for ${displayLabel(m)}`}
                    >
                      {ROLE_OPTIONS.map((r) => (
                        <option key={r} value={r}>
                          {ROLE_LABEL[r]}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="rounded-full border border-border/50 bg-muted/40 px-3 py-1 text-xs font-semibold capitalize text-muted-foreground">
                      {ROLE_LABEL[m.role]}
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>

        {pendingInvites.length > 0 ? (
          <div className="space-y-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
              Pending invites · {pendingInvites.length}
            </p>
            <ul className="space-y-2">
              {pendingInvites.map((m) => (
                <li
                  key={`${m.workspace_id}-${m.invited_email ?? m.created_at}`}
                  className="flex items-center justify-between gap-3 rounded-xl border border-dashed border-amber-400/45 bg-amber-500/[0.06] px-4 py-3 text-sm"
                >
                  <span className="flex min-w-0 items-center gap-2 truncate font-medium text-foreground">
                    <Mail className="h-4 w-4 shrink-0 text-amber-700/80" aria-hidden />
                    <span className="truncate">{m.invited_email ?? "pending"}</span>
                  </span>
                  <span className="shrink-0 rounded-full bg-background/80 px-2.5 py-0.5 text-xs font-semibold capitalize text-muted-foreground shadow-sm">
                    {ROLE_LABEL[m.role]}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
