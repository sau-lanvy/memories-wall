import "server-only";

import { TableClient, type TableEntity } from "@azure/data-tables";
import { memorySchema, type Memory } from "@/domain/memory";
import type { MemoryStore } from "@/server/memory-repository";

type MemoryEntity = TableEntity & { kind: "memory"; payload: string };
type PreferenceEntity = TableEntity & { kind: "preference"; snapToGrid: boolean };

/**
 * Azure is intentionally an adapter, not something the UI imports. Set
 * AZURE_STORAGE_CONNECTION_STRING and construct this in a deployment
 * composition root when the hosted environment is ready.
 */
export class AzureTableMemoryStore implements MemoryStore {
  constructor(private readonly client: TableClient) {}

  async get(id: string): Promise<Memory | null> {
    // Memory partitioning by author is an important optimization, but the
    // repository remains the authorization boundary (never trust a caller).
    // This adapter supports a global lookup for the repository's id-based API.
    for await (const entity of this.client.listEntities<MemoryEntity>()) {
      if (entity.rowKey === id && entity.kind === "memory") return memorySchema.parse(JSON.parse(entity.payload));
    }
    return null;
  }

  async list(): Promise<Memory[]> {
    const result: Memory[] = [];
    for await (const entity of this.client.listEntities<MemoryEntity>()) {
      if (entity.kind === "memory") result.push(memorySchema.parse(JSON.parse(entity.payload)));
    }
    return result;
  }

  async upsert(memory: Memory): Promise<void> {
    const entity: MemoryEntity = { partitionKey: memory.authorId, rowKey: memory.id, kind: "memory", payload: JSON.stringify(memory) };
    await this.client.upsertEntity(entity, "Replace");
  }

  async delete(id: string): Promise<void> {
    const memory = await this.get(id);
    if (memory) await this.client.deleteEntity(memory.authorId, memory.id);
  }

  async getPreference(userId: string, wallId: string): Promise<boolean> {
    try {
      const entity = await this.client.getEntity<PreferenceEntity>(`preference:${userId}`, wallId);
      return entity.snapToGrid === true;
    } catch (error) {
      if (isNotFound(error)) return false;
      throw error;
    }
  }

  async setPreference({ userId, wallId, snapToGrid }: { userId: string; wallId: string; snapToGrid: boolean }): Promise<void> {
    const entity: PreferenceEntity = { partitionKey: `preference:${userId}`, rowKey: wallId, kind: "preference", snapToGrid };
    await this.client.upsertEntity(entity, "Replace");
  }
}

function isNotFound(error: unknown): boolean {
  return typeof error === "object" && error !== null && "statusCode" in error && error.statusCode === 404;
}

export function createAzureTableMemoryStore(connectionString: string, tableName = "MemoriesWall"): AzureTableMemoryStore {
  return new AzureTableMemoryStore(TableClient.fromConnectionString(connectionString, tableName));
}
