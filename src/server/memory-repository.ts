import "server-only";

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { createAzureTableMemoryStore } from "@/server/azure-table-memory-store";
import { createAzureBlobImageUrlSigner } from "@/server/azure-blob-image-url-signer";
import { createAzureBlobImageStorage } from "@/server/azure-blob-image-storage";
import { MemoryMedia, type MemoryImageStorage, type MemoryImageUrlSigner } from "@/server/memory-media";
import { MemoryNotFoundError, MemoryPermissionError, MemoryValidationError } from "@/server/memory-repository-errors";
import { WallArrangement } from "@/server/wall-arrangement";
import {
  activitySchema, commentSchema, coordinateSchema, createCommentSchema, createMemorySchema, createReactionSchema, createReportSchema,
  listMemoryFiltersSchema, memorySchema, placementUpdateSchema, reportSchema,
  reactionSchema, updateMemorySchema, type ActivityNotification, type CommunityMembership, type Coordinate,
  type MemoryComment,
  type CreateCommentInput, type CreateMemoryInput, type CreateReactionInput, type CreateReportInput, type ListMemoryFilters, type Memory,
  type MemoryImage, type MemoryReaction, type MemorySizePreset, type WallTemplate, type PlacementUpdateInput, type UpdateMemoryInput, type WallPresentation, type WallBackgroundPreset,
} from "@/domain/memory";

export const DEFAULT_WALL_ID = "personal";
export { MemoryNotFoundError, MemoryPermissionError, MemoryValidationError };

type StoredPreference = { userId: string; wallId: string; snapToGrid: boolean };
type ImageInput = { mediaType: string; sizeBytes: number; bytes?: Uint8Array };
export type { MemoryImageUrlSigner, MemoryImageStorage } from "@/server/memory-media";
export type CommentPage = { offset?: number; limit?: number };
const COMMENT_PAGE_SIZE = 20;
const COMMENT_RATE_WINDOW_MS = 60_000;
const COMMENT_RATE_LIMIT = 5;
type CommentRecord = MemoryComment;
type ReportRecord = import("@/domain/memory").MemoryReport;

export interface MemoryStore {
  get(id: string): Promise<Memory | null>;
  list(): Promise<Memory[]>;
  upsert(memory: Memory): Promise<void>;
  delete(id: string): Promise<void>;
  getPreference(userId: string, wallId: string): Promise<boolean>;
  setPreference(preference: StoredPreference): Promise<void>;
  getWallPresentation?(userId: string, wallId: string): Promise<WallPresentation | null>;
  setWallPresentation?(presentation: WallPresentation): Promise<void>;
  listCommunityMemberships?(userId: string): Promise<CommunityMembership[]>;
  setCommunityMembership?(userId: string, membership: CommunityMembership): Promise<void>;
  getComment?(id: string): Promise<CommentRecord | null>;
  listComments?(memoryId: string): Promise<CommentRecord[]>;
  upsertComment?(comment: CommentRecord): Promise<void>;
  deleteComment?(id: string): Promise<void>;
  listReports?(): Promise<ReportRecord[]>;
  upsertReport?(report: ReportRecord): Promise<void>;
  listActivity?(userId: string): Promise<ActivityNotification[]>;
  upsertActivity?(activity: ActivityNotification): Promise<void>;
  getActivityPreference?(userId: string): Promise<boolean>;
  setActivityPreference?(userId: string, enabled: boolean): Promise<void>;
  getReaction?(memoryId: string, userId: string): Promise<MemoryReaction | null>;
  upsertReaction?(reaction: MemoryReaction): Promise<void>;
  deleteReaction?(memoryId: string, userId: string): Promise<void>;
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
  private readonly memberships = new Map<string, CommunityMembership[]>();
  private readonly comments = new Map<string, CommentRecord>();
  private readonly reports = new Map<string, ReportRecord>();
  private readonly activity = new Map<string, ActivityNotification>();
  private readonly activityPreferences = new Map<string, boolean>();
  private readonly reactions = new Map<string, MemoryReaction>();
  private readonly presentations = new Map<string, WallPresentation>();
  async get(id: string) { return copy(this.memories.get(id) ?? null); }
  async list() { return copy([...this.memories.values()]); }
  async upsert(memory: Memory) { this.memories.set(memory.id, copy(memory)); }
  async delete(id: string) { this.memories.delete(id); }
  async getPreference(userId: string, wallId: string) { return this.preferences.get(`${userId}:${wallId}`) ?? false; }
  async setPreference(preference: StoredPreference) { this.preferences.set(`${preference.userId}:${preference.wallId}`, preference.snapToGrid); }
  async getWallPresentation(userId: string, wallId: string) { return copy(this.presentations.get(`${userId}:${wallId}`) ?? null); }
  async setWallPresentation(presentation: WallPresentation) { this.presentations.set(`${presentation.userId}:${presentation.wallId}`, copy(presentation)); }
  async listCommunityMemberships(userId: string) { return copy(this.memberships.get(userId) ?? []); }
  async setCommunityMembership(userId: string, membership: CommunityMembership) {
    const existing = this.memberships.get(userId) ?? [];
    this.memberships.set(userId, [...existing.filter((item) => item.communityId !== membership.communityId), copy(membership)]);
  }
  grantCommunityMembership(userId: string, communityId: string, name = communityId, canShare = true) {
    return this.setCommunityMembership(userId, { communityId, name, canShare });
  }
  async getComment(id: string) { return copy(this.comments.get(id) ?? null); }
  async listComments(memoryId: string) { return copy([...this.comments.values()].filter((comment) => comment.memoryId === memoryId)); }
  async upsertComment(comment: CommentRecord) { this.comments.set(comment.id, copy(comment)); }
  async deleteComment(id: string) { this.comments.delete(id); }
  async listReports() { return copy([...this.reports.values()]); }
  async upsertReport(report: ReportRecord) { this.reports.set(report.id, copy(report)); }
  async listActivity(userId: string) { return copy([...this.activity.values()].filter((item) => item.userId === userId)); }
  async upsertActivity(activity: ActivityNotification) { this.activity.set(activity.id, copy(activity)); }
  async getActivityPreference(userId: string) { return this.activityPreferences.get(userId) ?? true; }
  async setActivityPreference(userId: string, enabled: boolean) { this.activityPreferences.set(userId, enabled); }
  async getReaction(memoryId: string, userId: string) { return copy(this.reactions.get(`${memoryId}:${userId}`) ?? null); }
  async upsertReaction(reaction: MemoryReaction) { this.reactions.set(`${reaction.memoryId}:${reaction.userId}`, copy(reaction)); }
  async deleteReaction(memoryId: string, userId: string) { this.reactions.delete(`${memoryId}:${userId}`); }
}

export function defaultCoordinates(index: number): { freeform: Coordinate; snapped: Coordinate; rotation: number; sizePreset?: MemorySizePreset } {
  const column = index % 4; const row = Math.floor(index / 4);
  return { freeform: { x: 7 + ((index * 19) % 77), y: 8 + ((index * 29) % 70) }, snapped: { x: 8 + column * 24, y: 8 + row * 24 }, rotation: (index % 3 - 1) * 1.2, sizePreset: "default" as const };
}

export class MemoryRepository {
  private readonly fallbackMemberships = new Map<string, CommunityMembership[]>();
  private readonly fallbackComments = new Map<string, CommentRecord>();
  private readonly fallbackReports = new Map<string, ReportRecord>();
  private readonly fallbackActivity = new Map<string, ActivityNotification>();
  private readonly fallbackActivityPreferences = new Map<string, boolean>();
  private readonly fallbackReactions = new Map<string, MemoryReaction>();
  private readonly commentRateLimits = new Map<string, number[]>();
  private readonly media: MemoryMedia;
  private readonly arrangement: WallArrangement;

  constructor(
    private readonly store: MemoryStore,
    private readonly imageUrlSigner?: MemoryImageUrlSigner,
    private readonly imageStorage?: MemoryImageStorage,
  ) {
    this.media = new MemoryMedia({
      getOwnedMemory: (memoryId, userId) => this.getOwnedMemory(memoryId, userId),
      getReadableMemory: (memoryId, userId) => this.getReadableMemory(memoryId, userId),
      saveMemory: (memory) => this.store.upsert(memory),
    }, imageUrlSigner, imageStorage);
    this.arrangement = new WallArrangement({
      listVisibleMemories: (userId, wallId) => this.listMemoriesForUser(userId, { wallId }),
      saveMemory: (memory) => this.store.upsert(memory),
      decorateMemory: (memory) => this.decorateMemory(memory),
      defaultCoordinates,
      getPresentation: async (userId, wallId) => this.store.getWallPresentation ? this.store.getWallPresentation(userId, wallId) : null,
      savePresentation: async (presentation) => {
        if (this.store.setWallPresentation) await this.store.setWallPresentation(presentation);
      },
    });
  }

  private async decorateMemory(memory: Memory): Promise<Memory> {
    return this.media.decorate(memory);
  }

  private async getOwnedMemory(memoryId: string, userId: string): Promise<Memory> {
    return assertOwner(await this.store.get(memoryId), userId);
  }

  private async getReadableMemory(memoryId: string, userId: string): Promise<Memory> {
    const memory = await this.store.get(memoryId);
    if (!memory) throw new MemoryNotFoundError("Memory not found");
    if (!(await this.canRead(memory, userId))) throw new MemoryPermissionError("You do not have permission to access this memory");
    return memory;
  }

  async createMemory(input: CreateMemoryInput, actorUserId: string): Promise<Memory> {
    const userId = requireUser(actorUserId);
    const parsed = createMemorySchema.safeParse(input);
    if (!parsed.success) throw new MemoryValidationError(parsed.error.issues[0]?.message ?? "Invalid memory");
    const data = parsed.data; const wallId = data.wallId || DEFAULT_WALL_ID;
    await this.assertCanShare(data.visibility, data.communityIds, userId);
    const existing = await this.store.list();
    const now = new Date().toISOString();
    const memory = memorySchema.parse({
      id: randomUUID(), authorId: userId, title: data.title, reflection: data.reflection, category: data.category,
      visibility: data.visibility, communityIds: data.visibility === "selected-community" ? data.communityIds : [],
      createdAt: now, updatedAt: now, images: [], placements: { [wallId]: defaultCoordinates(existing.length) },
    });
    await this.store.upsert(memory);
    return this.decorateMemory(memory);
  }

  async getMemory(id: string, actorUserId: string): Promise<Memory> {
    const userId = requireUser(actorUserId);
    const memory = await this.store.get(id);
    if (!memory) throw new MemoryNotFoundError("Memory not found");
    if (!(await this.canRead(memory, userId))) throw new MemoryPermissionError("You do not have permission to access this memory");
    return this.decorateMemory(memory);
  }

  async listMemoriesForUser(actorUserId: string, filters?: ListMemoryFilters): Promise<Memory[]> {
    const userId = requireUser(actorUserId);
    const parsed = listMemoryFiltersSchema.safeParse({ ...filters, wallId: filters?.wallId ?? DEFAULT_WALL_ID });
    if (!parsed.success) throw new MemoryValidationError(parsed.error.issues[0]?.message ?? "Invalid filters");
    const { category, from, to, wallId, ownership, visibility, communityId } = parsed.data;
    const result: Memory[] = [];
    for (const memory of await this.store.list()) {
      const owned = memory.authorId === userId;
      if (ownership === "owned" && !owned) continue;
      if (ownership === "shared" && (owned || memory.visibility === "private")) continue;
      if (ownership !== "owned" && !owned && memory.visibility === "private") continue;
      if (!owned && !(await this.canRead(memory, userId))) continue;
      if (category && memory.category !== category) continue;
      if (visibility && memory.visibility !== visibility) continue;
      if (communityId && !memory.communityIds.includes(communityId)) continue;
      if (!memory.placements[wallId]) continue;
      if (from && memory.createdAt < from) continue;
      if (to && memory.createdAt > to) continue;
      result.push(memory);
    }
    const sorted = result.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id));
    return Promise.all(sorted.map((memory) => this.decorateMemory(memory)));
  }

  async updateMemory(id: string, input: UpdateMemoryInput, actorUserId: string): Promise<Memory> {
    const userId = requireUser(actorUserId); const current = assertOwner(await this.store.get(id), userId);
    const parsed = updateMemorySchema.safeParse(input);
    if (!parsed.success) throw new MemoryValidationError(parsed.error.issues[0]?.message ?? "Invalid memory");
    const visibility = parsed.data.visibility ?? current.visibility;
    const communityIds = parsed.data.communityIds ?? current.communityIds;
    await this.assertCanShare(visibility, communityIds, userId);
    const next = memorySchema.parse({
      ...current, ...parsed.data, visibility, communityIds: visibility === "selected-community" ? communityIds : [],
      updatedAt: nextTimestamp(current.updatedAt),
    });
    await this.store.upsert(next); return copy(next);
  }

  async listCommunityMemoriesForUser(actorUserId: string, communityId?: string): Promise<Memory[]> {
    const userId = requireUser(actorUserId);
    const memberships = await this.membershipsFor(userId);
    const selectedCommunity = communityId ? memberships.some((item) => item.communityId === communityId) : true;
    if (!selectedCommunity) throw new MemoryPermissionError("You are not a member of this community");
    return this.listMemoriesForUser(userId, { ownership: "shared", communityId });
  }

  async listRecentlyAddedMemoriesForUser(actorUserId: string): Promise<Memory[]> {
    return (await this.listMemoriesForUser(actorUserId, { ownership: "all" })).filter((memory) => memory.visibility === "selected-community");
  }

  async listPublicMemoriesForUser(actorUserId: string, filters?: ListMemoryFilters): Promise<Memory[]> {
    requireUser(actorUserId);
    return this.listMemoriesForUser(actorUserId, { ...filters, ownership: "all", visibility: "public-discovery" });
  }

  async listPublicDiscoveryForUser(actorUserId: string, filters?: ListMemoryFilters): Promise<Memory[]> {
    return this.listPublicMemoriesForUser(actorUserId, filters);
  }

  async listCommunitiesForUser(actorUserId: string): Promise<CommunityMembership[]> {
    return this.membershipsFor(requireUser(actorUserId));
  }

  async searchMemoriesForUser(query: string, actorUserId: string, filters?: ListMemoryFilters): Promise<Memory[]> {
    requireUser(actorUserId);
    const term = z.string().trim().min(1).max(120).safeParse(query);
    if (!term.success) throw new MemoryValidationError("A search term is required");
    const memories = (await this.listMemoriesForUser(actorUserId, { ...filters, ownership: filters?.ownership ?? "all" })).filter((memory) => memory.visibility === "selected-community");
    const needle = term.data.toLocaleLowerCase();
    return memories.filter((memory) => `${memory.title}\n${memory.reflection}`.toLocaleLowerCase().includes(needle));
  }

  async searchPublicMemoriesForUser(query: string, actorUserId: string, filters?: ListMemoryFilters): Promise<Memory[]> {
    requireUser(actorUserId);
    const term = z.string().trim().min(1).max(120).safeParse(query);
    if (!term.success) throw new MemoryValidationError("A search term is required");
    const memories = await this.listPublicMemoriesForUser(actorUserId, filters);
    const needle = term.data.toLocaleLowerCase();
    return memories.filter((memory) => `${memory.title}\n${memory.reflection}`.toLocaleLowerCase().includes(needle));
  }

  async createComment(input: CreateCommentInput, actorUserId: string): Promise<MemoryComment> {
    const userId = requireUser(actorUserId);
    const parsed = createCommentSchema.safeParse(input);
    if (!parsed.success) throw new MemoryValidationError(parsed.error.issues[0]?.message ?? "Invalid comment");
    const memory = await this.store.get(parsed.data.memoryId);
    if (!memory) throw new MemoryNotFoundError("Memory not found");
    if (!(await this.canRead(memory, userId))) {
      throw new MemoryPermissionError("You do not have permission to comment on this memory");
    }
    const now = Date.now();
    const rateKey = `${userId}:${memory.id}`;
    const recent = (this.commentRateLimits.get(rateKey) ?? []).filter((timestamp) => now - timestamp < COMMENT_RATE_WINDOW_MS);
    if (recent.length >= COMMENT_RATE_LIMIT) throw new MemoryValidationError("Please wait a moment before adding another comment.");
    recent.push(now); this.commentRateLimits.set(rateKey, recent);
    const comment = commentSchema.parse({ id: randomUUID(), memoryId: memory.id, authorId: userId, body: parsed.data.body, createdAt: new Date().toISOString() });
    await this.writeComment(comment);
    if (memory.authorId !== userId && await this.activityEnabled(memory.authorId)) {
      await this.writeActivity(activitySchema.parse({ id: randomUUID(), userId: memory.authorId, memoryId: memory.id, kind: "comment", createdAt: comment.createdAt }));
    }
    return copy(comment);
  }

  async createReaction(input: CreateReactionInput, actorUserId: string): Promise<MemoryReaction> {
    const userId = requireUser(actorUserId);
    const parsed = createReactionSchema.safeParse(input);
    if (!parsed.success) throw new MemoryValidationError(parsed.error.issues[0]?.message ?? "Invalid reaction");
    const memory = await this.store.get(parsed.data.memoryId);
    if (!memory) throw new MemoryNotFoundError("Memory not found");
    if (!(await this.canReactTo(memory, userId))) throw new MemoryPermissionError("Reactions are available on shared memories only");
    const existing = await this.readReaction(memory.id, userId);
    if (existing) return copy(existing);
    const reaction = reactionSchema.parse({ id: randomUUID(), memoryId: memory.id, userId, kind: "appreciate", createdAt: new Date().toISOString() });
    await this.writeReaction(reaction);
    return copy(reaction);
  }

  async removeReaction(memoryId: string, actorUserId: string): Promise<void> {
    const userId = requireUser(actorUserId);
    const parsed = z.string().min(1).safeParse(memoryId);
    if (!parsed.success) throw new MemoryValidationError("A memory is required");
    const memory = await this.store.get(parsed.data);
    if (!memory) throw new MemoryNotFoundError("Memory not found");
    if (!(await this.canReactTo(memory, userId))) throw new MemoryPermissionError("Reactions are available on shared memories only");
    await this.deleteReaction(memory.id, userId);
  }

  async hasReaction(memoryId: string, actorUserId: string): Promise<boolean> {
    const userId = requireUser(actorUserId);
    const parsed = z.string().min(1).safeParse(memoryId);
    if (!parsed.success) throw new MemoryValidationError("A memory is required");
    const memory = await this.store.get(parsed.data);
    if (!memory) throw new MemoryNotFoundError("Memory not found");
    if (!(await this.canRead(memory, userId))) throw new MemoryPermissionError("You do not have permission to access this memory");
    if (!(await this.canReactTo(memory, userId))) return false;
    return (await this.readReaction(memory.id, userId)) !== null;
  }

  async listComments(memoryId: string, actorUserId: string, page?: CommentPage): Promise<MemoryComment[]> {
    const memory = await this.store.get(memoryId);
    if (!memory) throw new MemoryNotFoundError("Memory not found");
    if (!(await this.canRead(memory, requireUser(actorUserId)))) throw new MemoryPermissionError("You do not have permission to access these comments");
    const comments = (await this.readComments(memoryId)).filter((comment) => !comment.deletedAt).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    if (!page) return comments.map(copy);
    const offset = Math.max(0, page.offset ?? 0); const limit = Math.min(COMMENT_PAGE_SIZE, Math.max(1, page.limit ?? COMMENT_PAGE_SIZE));
    return comments.slice(offset, offset + limit).map(copy);
  }

  async deleteComment(id: string, actorUserId: string): Promise<void> {
    const userId = requireUser(actorUserId);
    const comment = await this.readComment(id);
    if (!comment) throw new MemoryNotFoundError("Comment not found");
    if (comment.authorId !== userId) throw new MemoryPermissionError("You can only delete your own comments");
    await this.writeComment(commentSchema.parse({ ...comment, deletedAt: new Date().toISOString() }));
  }

  async moderateComment(id: string, actorUserId: string): Promise<MemoryComment> {
    const userId = requireUser(actorUserId);
    const comment = await this.readComment(id);
    if (!comment) throw new MemoryNotFoundError("Comment not found");
    const memory = await this.store.get(comment.memoryId);
    if (!memory || memory.authorId !== userId) throw new MemoryPermissionError("Only the memory owner can moderate comments");
    const moderated = commentSchema.parse({ ...comment, deletedAt: new Date().toISOString() });
    await this.writeComment(moderated);
    return copy(moderated);
  }

  async createReport(input: CreateReportInput, actorUserId: string): Promise<ReportRecord> {
    const userId = requireUser(actorUserId);
    const parsed = createReportSchema.safeParse(input);
    if (!parsed.success) throw new MemoryValidationError(parsed.error.issues[0]?.message ?? "Invalid report");
    const targetMemory = parsed.data.targetType === "memory" ? await this.store.get(parsed.data.targetId) : await this.memoryForComment(parsed.data.targetId);
    if (!targetMemory) throw new MemoryNotFoundError("Reported content not found");
    if (!(await this.canRead(targetMemory, userId))) throw new MemoryPermissionError("You do not have permission to report this content");
    const report = reportSchema.parse({ id: randomUUID(), reporterId: userId, ...parsed.data, createdAt: new Date().toISOString(), status: "open" });
    await this.writeReport(report);
    return copy(report);
  }

  async listModerationQueue(actorUserId: string): Promise<ReportRecord[]> {
    const userId = requireUser(actorUserId);
    const reports = await this.readReports();
    const owned = await this.store.list();
    const ownedIds = new Set(owned.filter((memory) => memory.authorId === userId).map((memory) => memory.id));
    const result: ReportRecord[] = [];
    for (const report of reports) {
      if (report.targetType === "memory" && ownedIds.has(report.targetId)) result.push(report);
      if (report.targetType === "comment") {
        const comment = await this.readComment(report.targetId);
        if (comment && ownedIds.has(comment.memoryId)) result.push(report);
      }
    }
    return result.map(copy);
  }

  async getActivity(actorUserId: string): Promise<ActivityNotification[]> {
    return (await this.readActivity(requireUser(actorUserId))).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(copy);
  }

  async setActivityPreference(enabled: boolean, actorUserId: string): Promise<void> {
    const userId = requireUser(actorUserId);
    if (this.store.setActivityPreference) await this.store.setActivityPreference(userId, enabled);
    else this.fallbackActivityPreferences.set(userId, enabled);
  }

  async attachImage(memoryId: string, input: ImageInput, actorUserId: string): Promise<MemoryImage> {
    return this.media.attach(memoryId, input, requireUser(actorUserId));
  }

  async removeImage(memoryId: string, imageId: string, actorUserId: string): Promise<Memory> {
    return this.media.remove(memoryId, imageId, requireUser(actorUserId));
  }

  async getMemoryMedia(memoryId: string, actorUserId: string): Promise<MemoryImage | null> {
    return this.media.getPrimary(memoryId, requireUser(actorUserId));
  }
  async getMemoryMediaGallery(memoryId: string, actorUserId: string): Promise<MemoryImage[]> {
    return this.media.getGallery(memoryId, requireUser(actorUserId));
  }

  async deleteMemory(id: string, actorUserId: string): Promise<void> {
    const userId = requireUser(actorUserId); assertOwner(await this.store.get(id), userId); await this.store.delete(id);
  }

  async getWallPreference(wallId: string, actorUserId: string): Promise<boolean> {
    const userId = requireUser(actorUserId); if (!z.string().min(1).max(80).safeParse(wallId).success) throw new MemoryValidationError("Invalid wall");
    return this.store.getPreference(userId, wallId);
  }

  async listWallTemplates(): Promise<WallTemplate[]> { return this.arrangement.listTemplates(); }
  async getWallPresentation(wallId: string, actorUserId: string): Promise<WallPresentation> {
    return this.arrangement.getPresentation(wallId, requireUser(actorUserId));
  }
  async getArrangementRevision(wallId: string, actorUserId: string): Promise<number> { return (await this.getWallPresentation(wallId, actorUserId)).revision; }
  async applyWallTemplate(input: { wallId?: string; templateId: string; memoryIds?: string[]; expectedRevision?: number }, actorUserId: string): Promise<{ memories: Memory[]; revision: number; template: WallTemplate; backgroundPreset: WallBackgroundPreset }> {
    return this.arrangement.apply(input, requireUser(actorUserId));
  }
  async undoTemplateApplication(wallId: string, actorUserId: string, expectedRevision?: number): Promise<{ memories: Memory[]; revision: number; backgroundPreset: WallBackgroundPreset; templateId?: string; templateVersion?: number }> {
    return this.arrangement.undo(wallId, requireUser(actorUserId), expectedRevision);
  }

  async updateCardPlacement(input: PlacementUpdateInput, actorUserId: string): Promise<{ memory: Memory; snapToGrid: boolean }> {
    const userId = requireUser(actorUserId); const parsed = placementUpdateSchema.safeParse(input);
    if (!parsed.success) throw new MemoryValidationError(parsed.error.issues[0]?.message ?? "Invalid placement");
    const data = parsed.data; const current = assertOwner(await this.store.get(data.memoryId), userId); const wallId = data.wallId || DEFAULT_WALL_ID;
    const existing = current.placements[wallId] ?? defaultCoordinates((await this.store.list()).length);
    const normalizedExisting = { ...existing, sizePreset: existing.sizePreset ?? "default" as const };
    const currentSnap = await this.store.getPreference(userId, wallId);
    const nextSnap = data.snapToGrid ?? currentSnap;
    const mode = data.mode ?? ((data.snapToGrid ?? currentSnap) ? "snapped" : "freeform");
    const placements = { ...current.placements, [wallId]: normalizedExisting };
    if (data.coordinates) placements[wallId] = { ...placements[wallId], [mode]: coordinateSchema.parse(data.coordinates) };
    if (data.rotation !== undefined) placements[wallId] = { ...placements[wallId], rotation: data.rotation };
    if (data.sizePreset !== undefined) placements[wallId] = { ...placements[wallId], sizePreset: data.sizePreset };
    const next = memorySchema.parse({ ...current, placements, updatedAt: nextTimestamp(current.updatedAt) });
    if (data.coordinates !== undefined || data.rotation !== undefined || data.sizePreset !== undefined) {
      await this.store.upsert(next);
      const presentation = await this.getWallPresentation(wallId, userId);
      await this.arrangement.clearUndo(wallId, userId);
    }
    if (data.snapToGrid !== undefined) await this.store.setPreference({ userId, wallId, snapToGrid: nextSnap });
    return { memory: await this.decorateMemory(next), snapToGrid: nextSnap };
  }

  private async membershipsFor(userId: string): Promise<CommunityMembership[]> {
    if (this.store.listCommunityMemberships) return this.store.listCommunityMemberships(userId);
    return copy(this.fallbackMemberships.get(userId) ?? []);
  }

  private async canRead(memory: Memory, userId: string): Promise<boolean> {
    if (memory.authorId === userId) return true;
    if (memory.visibility === "public-discovery") return true;
    if (memory.visibility !== "selected-community") return false;
    const memberships = await this.membershipsFor(userId);
    return memory.communityIds.some((communityId) => memberships.some((membership) => membership.communityId === communityId));
  }

  private async assertCanShare(visibility: Memory["visibility"], communityIds: string[], userId: string): Promise<void> {
    if (visibility !== "selected-community") return;
    if (!communityIds.length) throw new MemoryValidationError("Select at least one community to share this memory");
    const memberships = await this.membershipsFor(userId);
    const allowed = new Set(memberships.filter((membership) => membership.canShare).map((membership) => membership.communityId));
    if (communityIds.some((communityId) => !allowed.has(communityId))) {
      throw new MemoryPermissionError("You can only share with communities where you have sharing permission");
    }
  }

  private async readComment(id: string): Promise<CommentRecord | null> {
    if (this.store.getComment) return this.store.getComment(id);
    return copy(this.fallbackComments.get(id) ?? null);
  }

  private async readComments(memoryId: string): Promise<CommentRecord[]> {
    if (this.store.listComments) return this.store.listComments(memoryId);
    return copy([...this.fallbackComments.values()].filter((comment) => comment.memoryId === memoryId));
  }

  private async writeComment(comment: CommentRecord): Promise<void> {
    if (this.store.upsertComment) await this.store.upsertComment(comment);
    else this.fallbackComments.set(comment.id, copy(comment));
  }

  private async removeComment(id: string): Promise<void> {
    if (this.store.deleteComment) await this.store.deleteComment(id);
    else this.fallbackComments.delete(id);
  }

  private async memoryForComment(id: string): Promise<Memory | null> {
    const comment = await this.readComment(id);
    return comment ? this.store.get(comment.memoryId) : null;
  }

  private async writeReport(report: ReportRecord): Promise<void> {
    if (this.store.upsertReport) await this.store.upsertReport(report);
    else this.fallbackReports.set(report.id, copy(report));
  }

  private async readReports(): Promise<ReportRecord[]> {
    if (this.store.listReports) return this.store.listReports();
    return copy([...this.fallbackReports.values()]);
  }

  private async activityEnabled(userId: string): Promise<boolean> {
    if (this.store.getActivityPreference) return this.store.getActivityPreference(userId);
    return this.fallbackActivityPreferences.get(userId) ?? true;
  }

  private async writeActivity(activity: ActivityNotification): Promise<void> {
    if (this.store.upsertActivity) await this.store.upsertActivity(activity);
    else this.fallbackActivity.set(activity.id, copy(activity));
  }

  private async readActivity(userId: string): Promise<ActivityNotification[]> {
    if (this.store.listActivity) return this.store.listActivity(userId);
    return copy([...this.fallbackActivity.values()].filter((item) => item.userId === userId));
  }

  private async canReactTo(memory: Memory, userId: string): Promise<boolean> {
    return (memory.visibility === "public-discovery" || memory.visibility === "selected-community") && await this.canRead(memory, userId);
  }

  private async readReaction(memoryId: string, userId: string): Promise<MemoryReaction | null> {
    if (this.store.getReaction) return this.store.getReaction(memoryId, userId);
    return copy(this.fallbackReactions.get(`${memoryId}:${userId}`) ?? null);
  }

  private async writeReaction(reaction: MemoryReaction): Promise<void> {
    if (this.store.upsertReaction) await this.store.upsertReaction(reaction);
    else this.fallbackReactions.set(`${reaction.memoryId}:${reaction.userId}`, copy(reaction));
  }

  private async deleteReaction(memoryId: string, userId: string): Promise<void> {
    if (this.store.deleteReaction) await this.store.deleteReaction(memoryId, userId);
    else this.fallbackReactions.delete(`${memoryId}:${userId}`);
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

function configuredImageUrlSigner(): MemoryImageUrlSigner | undefined {
  const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
  const containerName = process.env.AZURE_BLOB_CONTAINER_NAME ?? process.env.AZURE_STORAGE_CONTAINER_NAME ?? "memory-images";
  return connectionString && containerName ? createAzureBlobImageUrlSigner(connectionString, containerName) : undefined;
}

function configuredImageStorage(): MemoryImageStorage | undefined {
  const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
  const containerName = process.env.AZURE_BLOB_CONTAINER_NAME ?? process.env.AZURE_STORAGE_CONTAINER_NAME ?? "memory-images";
  return connectionString && containerName ? createAzureBlobImageStorage(connectionString, containerName) : undefined;
}

export const memoryRepository = new MemoryRepository(configuredStore(), configuredImageUrlSigner(), configuredImageStorage());

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
export const listPublicMemoriesForUser = (actorUserId: string, filters?: ListMemoryFilters) => memoryRepository.listPublicMemoriesForUser(actorUserId, filters);
export const searchPublicMemoriesForUser = (query: string, actorUserId: string, filters?: ListMemoryFilters) => memoryRepository.searchPublicMemoriesForUser(query, actorUserId, filters);
export const createReaction = (input: CreateReactionInput, actorUserId: string) => memoryRepository.createReaction(input, actorUserId);
export const removeReaction = (memoryId: string, actorUserId: string) => memoryRepository.removeReaction(memoryId, actorUserId);
export const hasReaction = (memoryId: string, actorUserId: string) => memoryRepository.hasReaction(memoryId, actorUserId);
