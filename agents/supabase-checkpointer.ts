import "server-only";

import type { RunnableConfig } from "@langchain/core/runnables";
import type { Checkpoint, CheckpointMetadata } from "@langchain/langgraph-checkpoint";
import { MemorySaver } from "@langchain/langgraph";
import type { PendingWrite } from "@langchain/langgraph-checkpoint";
import { getServiceRoleSupabaseOrNull } from "@/lib/supabase-server";

/** Removes persisted LangGraph memory so the next run starts a new trace for this thread. */
export async function deleteThreadCheckpoint(threadId: string): Promise<void> {
  const sb = getServiceRoleSupabaseOrNull();
  if (!sb) return;
  const { error } = await sb
    .from("agent_graph_checkpoints")
    .delete()
    .eq("thread_id", threadId);
  if (error) {
    console.error("[AgentForge] deleteThreadCheckpoint", error);
  }
}

/** Merges UI-friendly fields into the checkpoint row without clobbering LangGraph blobs. */
export async function mergeDashboardState(
  threadId: string,
  userId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const sb = getServiceRoleSupabaseOrNull();
  if (!sb) return;
  const { data: row } = await sb
    .from("agent_graph_checkpoints")
    .select("state")
    .eq("thread_id", threadId)
    .maybeSingle();
  const prev = (row?.state as Record<string, unknown> | null) ?? {};
  const merged: Record<string, unknown> = { ...prev, ...patch };
  if (
    patch.results !== undefined &&
    typeof patch.results === "object" &&
    patch.results !== null &&
    typeof prev.results === "object" &&
    prev.results !== null
  ) {
    merged.results = {
      ...(prev.results as Record<string, unknown>),
      ...(patch.results as Record<string, unknown>),
    };
  }
  const { error } = await sb.from("agent_graph_checkpoints").upsert(
    {
      thread_id: threadId,
      user_id: userId,
      state: {
        ...merged,
        updatedAt: new Date().toISOString(),
      },
      updated_at: new Date().toISOString(),
    },
    { onConflict: "thread_id" },
  );
  if (error) {
    console.error("[AgentForge] mergeDashboardState", error);
  }
}

type StorageShape = MemorySaver["storage"];
type WritesShape = MemorySaver["writes"];

function serializeStorage(storage: StorageShape): unknown {
  const out: Record<
    string,
    Record<string, Record<string, [string, string, string | undefined]>>
  > = {};
  for (const [tid, nsMap] of Object.entries(storage)) {
    out[tid] = {};
    for (const [ns, cpMap] of Object.entries(nsMap)) {
      out[tid][ns] = {};
      for (const [cid, triple] of Object.entries(cpMap)) {
        const [a, b, parent] = triple;
        out[tid][ns][cid] = [
          Buffer.from(a).toString("base64"),
          Buffer.from(b).toString("base64"),
          parent,
        ];
      }
    }
  }
  return out;
}

function deserializeStorage(raw: unknown): StorageShape {
  if (!raw || typeof raw !== "object") return {};
  const out: StorageShape = {};
  for (const [tid, nsMap] of Object.entries(raw as Record<string, unknown>)) {
    if (!nsMap || typeof nsMap !== "object") continue;
    out[tid] = {};
    for (const [ns, cpMap] of Object.entries(nsMap as Record<string, unknown>)) {
      if (!cpMap || typeof cpMap !== "object") continue;
      out[tid][ns] = {};
      for (const [cid, triple] of Object.entries(cpMap as Record<string, unknown>)) {
        if (!Array.isArray(triple) || triple.length < 2) continue;
        const [ea, eb, parent] = triple as [string, string, string | undefined];
        out[tid][ns][cid] = [
          new Uint8Array(Buffer.from(ea, "base64")),
          new Uint8Array(Buffer.from(eb, "base64")),
          parent,
        ];
      }
    }
  }
  return out;
}

function serializeWrites(writes: WritesShape): unknown {
  const out: Record<string, Record<string, [string, string, string]>> = {};
  for (const [k, inner] of Object.entries(writes)) {
    out[k] = {};
    for (const [ik, triple] of Object.entries(inner)) {
      const [taskId, channel, buf] = triple;
      out[k][ik] = [taskId, channel, Buffer.from(buf).toString("base64")];
    }
  }
  return out;
}

function deserializeWrites(raw: unknown): WritesShape {
  if (!raw || typeof raw !== "object") return {};
  const out: WritesShape = {};
  for (const [k, inner] of Object.entries(raw as Record<string, unknown>)) {
    if (!inner || typeof inner !== "object") continue;
    out[k] = {};
    for (const [ik, triple] of Object.entries(inner as Record<string, unknown>)) {
      if (!Array.isArray(triple) || triple.length < 3) continue;
      const [taskId, channel, b64] = triple as [string, string, string];
      out[k][ik] = [taskId, channel, new Uint8Array(Buffer.from(b64, "base64"))];
    }
  }
  return out;
}

/**
 * Memory-backed LangGraph checkpointer with async hydration / persistence into
 * `agent_graph_checkpoints.state.langgraph` (service role).
 */
export class SupabaseCheckpointSaver extends MemorySaver {
  async hydrate(threadId: string): Promise<void> {
    const sb = getServiceRoleSupabaseOrNull();
    if (!sb) {
      this.storage = {};
      this.writes = {};
      return;
    }
    const { data, error } = await sb
      .from("agent_graph_checkpoints")
      .select("state")
      .eq("thread_id", threadId)
      .maybeSingle();
    if (error) {
      console.error("[AgentForge] checkpointer hydrate", error);
      this.storage = {};
      this.writes = {};
      return;
    }
    const blob = (data?.state as { langgraph?: { storage?: unknown; writes?: unknown } } | null)
      ?.langgraph;
    if (blob?.storage && blob?.writes) {
      this.storage = deserializeStorage(blob.storage);
      this.writes = deserializeWrites(blob.writes);
    } else {
      this.storage = {};
      this.writes = {};
    }
  }

  async persist(
    config: RunnableConfig,
    mergeState?: Record<string, unknown>,
  ): Promise<void> {
    const threadId = config.configurable?.thread_id as string | undefined;
    const userId = config.configurable?.user_id as string | undefined;
    if (!threadId || !userId) return;
    const sb = getServiceRoleSupabaseOrNull();
    if (!sb) return;

    const langgraph = {
      storage: serializeStorage(this.storage),
      writes: serializeWrites(this.writes),
    };

    const { data: row } = await sb
      .from("agent_graph_checkpoints")
      .select("state")
      .eq("thread_id", threadId)
      .maybeSingle();
    const prev = (row?.state as Record<string, unknown> | null) ?? {};

    const nextState = {
      ...prev,
      langgraph,
      ...mergeState,
      updatedAt: new Date().toISOString(),
    };

    const { error } = await sb.from("agent_graph_checkpoints").upsert(
      {
        thread_id: threadId,
        user_id: userId,
        state: nextState,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "thread_id" },
    );
    if (error) {
      console.error("[AgentForge] checkpointer persist", error);
    }
  }

  override async put(
    config: RunnableConfig,
    checkpoint: Checkpoint,
    metadata: CheckpointMetadata,
  ): Promise<RunnableConfig> {
    const result = await super.put(config, checkpoint, metadata);
    await this.persist(config);
    return result;
  }

  override async putWrites(
    config: RunnableConfig,
    writes: PendingWrite[],
    taskId: string,
  ): Promise<void> {
    await super.putWrites(config, writes, taskId);
    await this.persist(config);
  }
}
