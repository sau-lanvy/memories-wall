import "server-only";

import { TableClient, type TableEntity } from "@azure/data-tables";
import { activitySchema, commentSchema, communityMembershipSchema, memorySchema, reactionSchema, reportSchema, type ActivityNotification, type CommunityMembership, type Memory, type MemoryComment, type MemoryReaction, type MemoryReport } from "@/domain/memory";
import type { MemoryStore } from "@/server/memory-repository";

type MemoryEntity = TableEntity & { kind: "memory"; payload: string };
type PreferenceEntity = TableEntity & { kind: "preference"; snapToGrid: boolean };
type MembershipEntity = TableEntity & { kind: "membership"; payload: string };
type ReactionEntity = TableEntity & { kind: "reaction"; payload: string };
type PayloadEntity = TableEntity & { payload: string };

/**
 * Azure is intentionally an adapter, not something the UI imports. Set
 * AZURE_STORAGE_CONNECTION_STRING and construct this in a deployment
 * composition root when the hosted environment is ready.
 */
export class AzureTableMemoryStore implements MemoryStore {
  private readonly tableReady: Promise<void>;

  constructor(private readonly client: TableClient) {
    this.tableReady = ensureTable(client);
  }

  async get(id: string): Promise<Memory | null> {
    await this.tableReady;
    // Memory partitioning by author is an important optimization, but the
    // repository remains the authorization boundary (never trust a caller).
    // This adapter supports a global lookup for the repository's id-based API.
    for await (const entity of this.client.listEntities<MemoryEntity>()) {
      if (entity.rowKey === id && entity.kind === "memory") return memorySchema.parse(JSON.parse(entity.payload));
    }
    return null;
  }

  async list(): Promise<Memory[]> {
    await this.tableReady;
    const result: Memory[] = [];
    for await (const entity of this.client.listEntities<MemoryEntity>()) {
      if (entity.kind === "memory") result.push(memorySchema.parse(JSON.parse(entity.payload)));
    }
    return result;
  }

  async upsert(memory: Memory): Promise<void> {
    await this.tableReady;
    const entity: MemoryEntity = { partitionKey: memory.authorId, rowKey: memory.id, kind: "memory", payload: JSON.stringify(memory) };
    await this.client.upsertEntity(entity, "Replace");
  }

  async delete(id: string): Promise<void> {
    const memory = await this.get(id);
    if (memory) await this.client.deleteEntity(memory.authorId, memory.id);
  }

  async getPreference(userId: string, wallId: string): Promise<boolean> {
    await this.tableReady;
    try {
      const entity = await this.client.getEntity<PreferenceEntity>(`preference:${userId}`, wallId);
      return entity.snapToGrid === true;
    } catch (error) {
      if (isNotFound(error)) return false;
      throw error;
    }
  }

  async setPreference({ userId, wallId, snapToGrid }: { userId: string; wallId: string; snapToGrid: boolean }): Promise<void> {
    await this.tableReady;
    const entity: PreferenceEntity = { partitionKey: `preference:${userId}`, rowKey: wallId, kind: "preference", snapToGrid };
    await this.client.upsertEntity(entity, "Replace");
  }

  async listCommunityMemberships(userId: string): Promise<CommunityMembership[]> {
    await this.tableReady;
    const result: CommunityMembership[] = [];
    for await (const entity of this.client.listEntities<MembershipEntity>()) {
      if (entity.kind === "membership" && entity.partitionKey === `membership:${userId}`) result.push(communityMembershipSchema.parse(JSON.parse(entity.payload)));
    }
    return result;
  }

  async setCommunityMembership(userId: string, membership: CommunityMembership): Promise<void> {
    await this.tableReady;
    const entity: MembershipEntity = { partitionKey: `membership:${userId}`, rowKey: membership.communityId, kind: "membership", payload: JSON.stringify(membership) };
    await this.client.upsertEntity(entity, "Replace");
  }

  async getComment(id: string): Promise<MemoryComment | null> {
    await this.tableReady;
    for await (const entity of this.client.listEntities<PayloadEntity>()) {
      if (entity.kind === "comment" && entity.rowKey === id) return commentSchema.parse(JSON.parse(entity.payload));
    }
    return null;
  }

  async listComments(memoryId: string): Promise<MemoryComment[]> {
    await this.tableReady;
    const result: MemoryComment[] = [];
    for await (const entity of this.client.listEntities<PayloadEntity>()) {
      if (entity.kind === "comment" && entity.partitionKey === `comment:${memoryId}`) result.push(commentSchema.parse(JSON.parse(entity.payload)));
    }
    return result;
  }

  async upsertComment(comment: MemoryComment): Promise<void> {
    await this.tableReady;
    await this.client.upsertEntity({ partitionKey: `comment:${comment.memoryId}`, rowKey: comment.id, kind: "comment", payload: JSON.stringify(comment) }, "Replace");
  }

  async deleteComment(id: string): Promise<void> {
    await this.tableReady;
    const comment = await this.getComment(id);
    if (comment) await this.client.deleteEntity(`comment:${comment.memoryId}`, comment.id);
  }

  async listReports(): Promise<MemoryReport[]> {
    await this.tableReady;
    const result: MemoryReport[] = [];
    for await (const entity of this.client.listEntities<PayloadEntity>()) {
      if (entity.kind === "report") result.push(reportSchema.parse(JSON.parse(entity.payload)));
    }
    return result;
  }

  async upsertReport(report: MemoryReport): Promise<void> {
    await this.tableReady;
    await this.client.upsertEntity({ partitionKey: "reports", rowKey: report.id, kind: "report", payload: JSON.stringify(report) }, "Replace");
  }

  async listActivity(userId: string): Promise<ActivityNotification[]> {
    await this.tableReady;
    const result: ActivityNotification[] = [];
    for await (const entity of this.client.listEntities<PayloadEntity>()) {
      if (entity.kind === "activity" && entity.partitionKey === `activity:${userId}`) result.push(activitySchema.parse(JSON.parse(entity.payload)));
    }
    return result;
  }

  async upsertActivity(activity: ActivityNotification): Promise<void> {
    await this.tableReady;
    await this.client.upsertEntity({ partitionKey: `activity:${activity.userId}`, rowKey: activity.id, kind: "activity", payload: JSON.stringify(activity) }, "Replace");
  }

  async getActivityPreference(userId: string): Promise<boolean> {
    await this.tableReady;
    try {
      const entity = await this.client.getEntity<TableEntity & { kind: "activity-preference"; enabled: boolean }>("activity-preferences", userId);
      return entity.enabled !== false;
    } catch (error) {
      if (isNotFound(error)) return true;
      throw error;
    }
  }

  async setActivityPreference(userId: string, enabled: boolean): Promise<void> {
    await this.tableReady;
    await this.client.upsertEntity({ partitionKey: "activity-preferences", rowKey: userId, kind: "activity-preference", enabled }, "Replace");
  }

  async getReaction(memoryId: string, userId: string): Promise<MemoryReaction | null> {
    await this.tableReady;
    try {
      const entity = await this.client.getEntity<ReactionEntity>(`reaction:${memoryId}`, encodeURIComponent(userId));
      return reactionSchema.parse(JSON.parse(entity.payload));
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  }

  async upsertReaction(reaction: MemoryReaction): Promise<void> {
    await this.tableReady;
    await this.client.upsertEntity({ partitionKey: `reaction:${reaction.memoryId}`, rowKey: encodeURIComponent(reaction.userId), kind: "reaction", payload: JSON.stringify(reaction) }, "Replace");
  }

  async deleteReaction(memoryId: string, userId: string): Promise<void> {
    await this.tableReady;
    try {
      await this.client.deleteEntity(`reaction:${memoryId}`, encodeURIComponent(userId));
    } catch (error) {
      if (!isNotFound(error)) throw error;
    }
  }
}

async function ensureTable(client: TableClient): Promise<void> {
  try {
    await client.createTable();
  } catch (error) {
    if (!isConflict(error)) throw error;
  }
}

function isNotFound(error: unknown): boolean {
  return typeof error === "object" && error !== null && "statusCode" in error && error.statusCode === 404;
}

function isConflict(error: unknown): boolean {
  return typeof error === "object" && error !== null && "statusCode" in error && error.statusCode === 409;
}

export function createAzureTableMemoryStore(connectionString: string, tableName = "MemoriesWall"): AzureTableMemoryStore {
  return new AzureTableMemoryStore(TableClient.fromConnectionString(connectionString, tableName));
}
