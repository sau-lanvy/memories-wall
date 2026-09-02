import "server-only";

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { createAzureTableMemoryStore } from "@/server/azure-table-memory-store";
import {
  coordinateSchema, createMemorySchema, listMemoryFiltersSchema, memorySchema, placementUpdateSchema,
  updateMemorySchema, type Coordinate, type CreateMemoryInput, type ListMemoryFilters, type Memory,
  type PlacementUpdateInput, type UpdateMemoryInput,
} from "@/domain/memory";

export const DEFAULT_WALL_ID = "personal";
export class MemoryNotFoundError extends Error { readonly code = "NOT_FOUND" as const; }
export class MemoryPermissionError extends Error { readonly code = "FORBIDDEN" as const; }
export class MemoryValidationError extends Error { readonly code = "INVALID" as const; }

type StoredPreference = { userId: string; wallId: string; snapToGrid: boolean };
export interface MemoryStore {
  get(id: string): Promise<Memory | null>;
  list(): Promise<Memory[]>;
  upsert(memory: Memory): Promise<void>;
  delete(id: string): Promise<void>;
  getPreference(userId: string, wallId: string): Promise<boolean>;
  setPreference(preference: StoredPreference): Promise<void>;
}

function copy<T>(value: T): T { return structuredClone(value); }
function nextTimestamp(previous: string): string { return new Date(Math.max(Date.now(), Date.parse(previous) + 1)).toISOString(); }
function requireUser(userId: string): string { if (!z.string().trim().min(1).safeParse(userId).success) throw new MemoryPermissionError("A current user is required"); return userId; }
function assertOwner(memory: Memory | null, userId: string): Memory {
  if (!memory) throw new MemoryNotFoundError("Memory not found");
  if (memory.authorId !== userId) throw new MemoryPermissionError("You do not have permission to access this memory");
  return memory;
}

export class InMemoryMemoryStore implements MemoryStore {
  private readonly memories = new Map<string, Memory>();
  private readonly preferences = new Map<string, boolean>();
  async get(id: string) { return copy(this.memories.get(id) ?? null); }
  async list() { return copy([...this.memories.values()]); }
  async upsert(memory: Memory) { this.memories.set(memory.id, copy(memory)); }
  async delete(id: string) { this.memories.delete(id); }
  async getPreference(userId: string, wallId: string) { return this.preferences.get(`${userId}:${wallId}`) ?? false; }
  async setPreference(preference: StoredPreference) { this.preferences.set(`${preference.userId}:${preference.wallId}`, preference.snapToGrid); }
}

export function defaultCoordinates(index: number): { freeform: Coordinate; snapped: Coordinate; rotation: number } {
  const column = index % 4; const row = Math.floor(index / 4);
  return { freeform: { x: 7 + ((index * 19) % 77), y: 8 + ((index * 29) % 70) }, snapped: { x: 8 + column * 24, y: 8 + row * 24 }, rotation: (index % 3 - 1) * 1.2 };
}

export class MemoryRepository {
  constructor(private readonly store: MemoryStore) {}

  async createMemory(input: CreateMemoryInput, actorUserId: string): Promise<Memory> {
    const userId = requireUser(actorUserId);
    const parsed = createMemorySchema.safeParse(input);
    if (!parsed.success) throw new MemoryValidationError(parsed.error.issues[0]?.message ?? "Invalid memory");
    const data = parsed.data; const wallId = data.wallId || DEFAULT_WALL_ID;
    const existing = await this.store.list();
    const now = new Date().toISOString();
    const memory = memorySchema.parse({ id: randomUUID(), authorId: userId, title: data.title, reflection: data.reflection, category: data.category, visibility: "private", createdAt: now, updatedAt: now, placements: { [wallId]: defaultCoordinates(existing.length) } });
    await this.store.upsert(memory);
    return copy(memory);
  }

  async getMemory(id: string, actorUserId: string): Promise<Memory> {
    const userId = requireUser(actorUserId); return copy(assertOwner(await this.store.get(id), userId));
  }

  async listMemoriesForUser(actorUserId: string, filters?: ListMemoryFilters): Promise<Memory[]> {
    const userId = requireUser(actorUserId);
    const parsed = listMemoryFiltersSchema.safeParse({ ...filters, ownership: "owned", wallId: filters?.wallId ?? DEFAULT_WALL_ID });
    if (!parsed.success) throw new MemoryValidationError(parsed.error.issues[0]?.message ?? "Invalid filters");
    const { category, from, to, wallId } = parsed.data;
    return (await this.store.list()).filter((memory) => {
      // The ownership check is deliberately here, before any other filter, for every read.
      if (memory.authorId !== userId) return false;
      if (category && memory.category !== category) return false;
      if (!memory.placements[wallId]) return false;
      if (from && memory.createdAt < from) return false;
      if (to && memory.createdAt > to) return false;
      return true;
    }).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(copy);
  }

  async updateMemory(id: string, input: UpdateMemoryInput, actorUserId: string): Promise<Memory> {
    const userId = requireUser(actorUserId); const current = assertOwner(await this.store.get(id), userId);
    const parsed = updateMemorySchema.safeParse(input);
    if (!parsed.success) throw new MemoryValidationError(parsed.error.issues[0]?.message ?? "Invalid memory");
    const next = memorySchema.parse({ ...current, ...parsed.data, updatedAt: nextTimestamp(current.updatedAt) });
    await this.store.upsert(next); return copy(next);
  }

  async deleteMemory(id: string, actorUserId: string): Promise<void> {
    const userId = requireUser(actorUserId); assertOwner(await this.store.get(id), userId); await this.store.delete(id);
  }

  async getWallPreference(wallId: string, actorUserId: string): Promise<boolean> {
    const userId = requireUser(actorUserId); if (!z.string().min(1).max(80).safeParse(wallId).success) throw new MemoryValidationError("Invalid wall");
    return this.store.getPreference(userId, wallId);
  }

  async updateCardPlacement(input: PlacementUpdateInput, actorUserId: string): Promise<{ memory: Memory; snapToGrid: boolean }> {
    const userId = requireUser(actorUserId); const parsed = placementUpdateSchema.safeParse(input);
    if (!parsed.success) throw new MemoryValidationError(parsed.error.issues[0]?.message ?? "Invalid placement");
    const data = parsed.data; const current = assertOwner(await this.store.get(data.memoryId), userId); const wallId = data.wallId || DEFAULT_WALL_ID;
    const existing = current.placements[wallId] ?? defaultCoordinates((await this.store.list()).length);
    const currentSnap = await this.store.getPreference(userId, wallId);
    const nextSnap = data.snapToGrid ?? currentSnap;
    const mode = data.mode ?? ((data.snapToGrid ?? currentSnap) ? "snapped" : "freeform");
    const placements = { ...current.placements, [wallId]: { ...existing } };
    if (data.coordinates) placements[wallId] = { ...placements[wallId], [mode]: coordinateSchema.parse(data.coordinates) };
    if (data.rotation !== undefined) placements[wallId] = { ...placements[wallId], rotation: data.rotation };
    const next = memorySchema.parse({ ...current, placements, updatedAt: nextTimestamp(current.updatedAt) });
    if (data.coordinates !== undefined || data.rotation !== undefined) await this.store.upsert(next);
    if (data.snapToGrid !== undefined) await this.store.setPreference({ userId, wallId, snapToGrid: nextSnap });
    return { memory: copy(next), snapToGrid: nextSnap };
  }
}

export const demoUserId = "demo-user";
function configuredStore(): MemoryStore {
  const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
  if (connectionString) {
    // Keep Azure composition at the server boundary; local development uses
    // the in-memory store until deployment credentials are configured.
    return createAzureTableMemoryStore(connectionString, process.env.AZURE_TABLE_NAME);
  }
  return new InMemoryMemoryStore();
}

export const memoryRepository = new MemoryRepository(configuredStore());

// The module-level API is the single server-side seam used by actions and by
// callers that do not need to select an adapter. Tests can use the class with
// InMemoryMemoryStore to keep each test isolated.
export const createMemory = (input: CreateMemoryInput, actorUserId: string) => memoryRepository.createMemory(input, actorUserId);
export const getMemory = (id: string, actorUserId: string) => memoryRepository.getMemory(id, actorUserId);
export const listMemoriesForUser = (actorUserId: string, filters?: ListMemoryFilters) => memoryRepository.listMemoriesForUser(actorUserId, filters);
export const updateMemory = (id: string, input: UpdateMemoryInput, actorUserId: string) => memoryRepository.updateMemory(id, input, actorUserId);
export const deleteMemory = (id: string, actorUserId: string) => memoryRepository.deleteMemory(id, actorUserId);
export const updateCardPlacement = (input: PlacementUpdateInput, actorUserId: string) => memoryRepository.updateCardPlacement(input, actorUserId);
export const getWallPreference = (wallId: string, actorUserId: string) => memoryRepository.getWallPreference(wallId, actorUserId);
