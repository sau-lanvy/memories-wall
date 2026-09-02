"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { memoryRepository, demoUserId, type MemoryRepository, MemoryPermissionError, MemoryNotFoundError, MemoryValidationError } from "@/server/memory-repository";
import { createCommentSchema, createReactionSchema, createReportSchema, memoryCategorySchema, memoryImageSchema, reportReasonSchema, type ActivityNotification, type CommunityMembership, type Memory, type WallTemplate, type MemoryComment, type MemoryReaction, type MemoryReport, type PlacementUpdateInput, type UpdateMemoryInput, type MemoryCategory, type WallBackgroundPreset } from "@/domain/memory";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string; code: "INVALID" | "NOT_FOUND" | "FORBIDDEN" | "UNKNOWN" };
export type WallData = { memories: Memory[]; snapToGrid: boolean; backgroundPreset?: WallBackgroundPreset; templateId?: string; templateVersion?: number; templateRevision?: number; canUndoTemplate?: boolean };
export type TemplateApplicationData = { memories: Memory[]; revision: number; template: WallTemplate; backgroundPreset: WallBackgroundPreset };
export type CommunityData = { memories: Memory[]; communities: CommunityMembership[] };
export type ReactionState = { memoryId: string; reacted: boolean };
const idSchema = z.string().min(1);

function failure(error: unknown): ActionResult<never> {
  if (error instanceof MemoryValidationError || error instanceof z.ZodError) return { ok: false, error: error instanceof Error ? error.message : "Please check the submitted values.", code: "INVALID" };
  if (error instanceof MemoryPermissionError) return { ok: false, error: "This memory belongs to another account.", code: "FORBIDDEN" };
  if (error instanceof MemoryNotFoundError) return { ok: false, error: "That memory no longer exists. Refresh the wall and try again.", code: "NOT_FOUND" };
  return { ok: false, error: error instanceof Error ? error.message : "Something went wrong. Please try again.", code: "UNKNOWN" };
}

function isUploadedFile(value: FormDataEntryValue): value is File {
  return typeof value === "object" && value !== null
    && "arrayBuffer" in value && typeof value.arrayBuffer === "function"
    && "size" in value && typeof value.size === "number"
    && "type" in value && typeof value.type === "string";
}

export async function getWallData(category?: string): Promise<ActionResult<WallData>> {
  try {
    const validCategory = category ? memoryCategorySchema.parse(category) : undefined;
    const memories = await memoryRepository.listMemoriesForUser(demoUserId, { category: validCategory, wallId: "personal" });
    const presentation = await memoryRepository.getWallPresentation("personal", demoUserId);
    return { ok: true, data: { memories, snapToGrid: await memoryRepository.getWallPreference("personal", demoUserId), backgroundPreset: presentation.backgroundPreset, templateId: presentation.templateId, templateVersion: presentation.templateVersion, templateRevision: presentation.revision, canUndoTemplate: Boolean(presentation.undo) } };
  } catch (error) { return failure(error); }
}

export async function createMemoryAction(formData: FormData): Promise<ActionResult<Memory>> {
  try {
    const text = (name: string) => { const value = formData.get(name); return typeof value === "string" ? value : ""; };
    const visibility = text("visibility") || "private";
    const communityIds = text("communityIds").split(",").map((value) => value.trim()).filter(Boolean);
    const photos = [...formData.getAll("photos"), ...formData.getAll("photo")].filter((value): value is File => isUploadedFile(value) && value.size > 0);
    if (photos.length > 5) throw new MemoryValidationError("A memory can have up to 5 images");
    for (const photo of photos) if (!memoryImageSchema.shape.mediaType.safeParse(photo.type).success || !z.number().int().positive().max(10_485_760).safeParse(photo.size).success) throw new MemoryValidationError("Images must be JPG, PNG, or WebP files no larger than 10 MB");
    const memory = await memoryRepository.createMemory({ title: text("title"), reflection: text("reflection"), category: text("category") as MemoryCategory, visibility: visibility as "private" | "selected-community" | "public-discovery", communityIds, wallId: "personal" }, demoUserId);
    for (const photo of photos) await memoryRepository.attachImage(memory.id, { mediaType: photo.type, sizeBytes: photo.size, bytes: new Uint8Array(await photo.arrayBuffer()) }, demoUserId);
    const saved = photos.length ? await memoryRepository.getMemory(memory.id, demoUserId) : memory;
    revalidatePath("/"); return { ok: true, data: saved };
  } catch (error) { return failure(error); }
}

export async function updateMemoryAction(id: string, input: UpdateMemoryInput): Promise<ActionResult<Memory>> {
  try { idSchema.parse(id); const memory = await memoryRepository.updateMemory(id, input, demoUserId); revalidatePath("/"); return { ok: true, data: memory }; }
  catch (error) { return failure(error); }
}

export async function deleteMemoryAction(id: string): Promise<ActionResult<{ id: string }>> {
  try { idSchema.parse(id); await memoryRepository.deleteMemory(id, demoUserId); revalidatePath("/"); return { ok: true, data: { id } }; }
  catch (error) { return failure(error); }
}

export async function listWallTemplatesAction(): Promise<ActionResult<WallTemplate[]>> {
  try { return { ok: true, data: await memoryRepository.listWallTemplates() }; } catch (error) { return failure(error); }
}

export async function applyWallTemplateAction(input: { templateId: string; memoryIds?: string[]; expectedRevision?: number }): Promise<ActionResult<TemplateApplicationData>> {
  try { const result = await memoryRepository.applyWallTemplate({ ...input, wallId: "personal" }, demoUserId); revalidatePath("/"); return { ok: true, data: result }; } catch (error) { return failure(error); }
}

export async function undoTemplateApplicationAction(expectedRevision?: number): Promise<ActionResult<{ memories: Memory[]; revision: number; backgroundPreset: WallBackgroundPreset; templateId?: string; templateVersion?: number }>> {
  try { const result = await memoryRepository.undoTemplateApplication("personal", demoUserId, expectedRevision); revalidatePath("/"); return { ok: true, data: result }; } catch (error) { return failure(error); }
}

export async function updatePlacementAction(input: PlacementUpdateInput): Promise<ActionResult<WallData>> {
  try {
    await memoryRepository.updateCardPlacement(input, demoUserId);
    const memories = await memoryRepository.listMemoriesForUser(demoUserId, { wallId: "personal" });
    const presentation = await memoryRepository.getWallPresentation("personal", demoUserId);
    revalidatePath("/"); return { ok: true, data: { memories, snapToGrid: await memoryRepository.getWallPreference("personal", demoUserId), backgroundPreset: presentation.backgroundPreset, templateId: presentation.templateId, templateVersion: presentation.templateVersion, templateRevision: presentation.revision, canUndoTemplate: Boolean(presentation.undo) } };
  } catch (error) { return failure(error); }
}

export async function getCommunityDataAction(communityId?: string): Promise<ActionResult<CommunityData>> {
  try {
    if (communityId !== undefined) idSchema.parse(communityId);
    const communities = await memoryRepository.listCommunitiesForUser(demoUserId);
    const memories = await memoryRepository.listCommunityMemoriesForUser(demoUserId, communityId);
    return { ok: true, data: { memories, communities } };
  } catch (error) { return failure(error); }
}

export async function getAllMemoriesAction(): Promise<ActionResult<Memory[]>> {
  try { return { ok: true, data: (await memoryRepository.listMemoriesForUser(demoUserId, { ownership: "all" })).filter((memory) => memory.visibility === "selected-community") }; }
  catch (error) { return failure(error); }
}

export async function getRecentlyAddedAction(): Promise<ActionResult<Memory[]>> {
  try { return { ok: true, data: await memoryRepository.listRecentlyAddedMemoriesForUser(demoUserId) }; }
  catch (error) { return failure(error); }
}

export async function getPublicDiscoveryAction(): Promise<ActionResult<Memory[]>> {
  try { return { ok: true, data: await memoryRepository.listPublicDiscoveryForUser(demoUserId) }; }
  catch (error) { return failure(error); }
}

export async function searchMemoriesAction(query: string): Promise<ActionResult<Memory[]>> {
  try { return { ok: true, data: await memoryRepository.searchMemoriesForUser(query, demoUserId) }; }
  catch (error) { return failure(error); }
}

export async function searchPublicMemoriesAction(query: string): Promise<ActionResult<Memory[]>> {
  try { return { ok: true, data: await memoryRepository.searchPublicMemoriesForUser(query, demoUserId) }; }
  catch (error) { return failure(error); }
}

export async function getReactionAction(memoryId: string): Promise<ActionResult<ReactionState>> {
  try { idSchema.parse(memoryId); return { ok: true, data: { memoryId, reacted: await memoryRepository.hasReaction(memoryId, demoUserId) } }; }
  catch (error) { return failure(error); }
}

export async function createReactionAction(input: { memoryId: string }): Promise<ActionResult<MemoryReaction>> {
  try {
    const parsed = createReactionSchema.parse(input);
    return { ok: true, data: await memoryRepository.createReaction(parsed, demoUserId) };
  } catch (error) { return failure(error); }
}

export async function removeReactionAction(memoryId: string): Promise<ActionResult<ReactionState>> {
  try {
    idSchema.parse(memoryId);
    await memoryRepository.removeReaction(memoryId, demoUserId);
    return { ok: true, data: { memoryId, reacted: false } };
  } catch (error) { return failure(error); }
}

export async function listCommentsAction(memoryId: string, offset = 0): Promise<ActionResult<MemoryComment[]>> {
  try { idSchema.parse(memoryId); return { ok: true, data: await memoryRepository.listComments(memoryId, demoUserId, { offset, limit: 20 }) }; }
  catch (error) { return failure(error); }
}

export async function createCommentAction(input: { memoryId: string; body: string }): Promise<ActionResult<MemoryComment>> {
  try {
    const parsed = createCommentSchema.parse(input);
    const comment = await memoryRepository.createComment(parsed, demoUserId);
    revalidatePath("/");
    return { ok: true, data: comment };
  } catch (error) { return failure(error); }
}

export async function deleteCommentAction(id: string): Promise<ActionResult<{ id: string }>> {
  try { idSchema.parse(id); await memoryRepository.deleteComment(id, demoUserId); revalidatePath("/"); return { ok: true, data: { id } }; }
  catch (error) { return failure(error); }
}

export async function moderateCommentAction(id: string): Promise<ActionResult<MemoryComment>> {
  try { idSchema.parse(id); const comment = await memoryRepository.moderateComment(id, demoUserId); revalidatePath("/"); return { ok: true, data: comment }; }
  catch (error) { return failure(error); }
}

export async function createReportAction(input: { targetType: "memory" | "comment"; targetId: string; reason: string }): Promise<ActionResult<MemoryReport>> {
  try {
    const parsed = createReportSchema.parse({ ...input, reason: reportReasonSchema.parse(input.reason) });
    const report = await memoryRepository.createReport(parsed, demoUserId);
    return { ok: true, data: report };
  } catch (error) { return failure(error); }
}

export async function getModerationQueueAction(): Promise<ActionResult<MemoryReport[]>> {
  try { return { ok: true, data: await memoryRepository.listModerationQueue(demoUserId) }; }
  catch (error) { return failure(error); }
}

export async function attachImageAction(memoryId: string, input: { mediaType: string; sizeBytes: number }): Promise<ActionResult<Memory>> {
  try {
    idSchema.parse(memoryId);
    await memoryRepository.attachImage(memoryId, input, demoUserId);
    const memory = await memoryRepository.getMemory(memoryId, demoUserId);
    revalidatePath("/");
    return { ok: true, data: memory };
  } catch (error) { return failure(error); }
}

export async function addMemoryImagesAction(memoryId: string, formData: FormData): Promise<ActionResult<Memory>> {
  try {
    idSchema.parse(memoryId);
    const photos = formData.getAll("photos").filter((value): value is File => isUploadedFile(value) && value.size > 0);
    if (!photos.length) throw new MemoryValidationError("Choose at least one image");
    if (photos.length > 5) throw new MemoryValidationError("A memory can have up to 5 images");
    const current = await memoryRepository.getMemory(memoryId, demoUserId);
    if ((current.images ?? []).length + photos.length > 5) throw new MemoryValidationError("A memory can have up to 5 images");
    for (const photo of photos) {
      if (!memoryImageSchema.shape.mediaType.safeParse(photo.type).success || !z.number().int().positive().max(10_485_760).safeParse(photo.size).success) throw new MemoryValidationError("Images must be JPG, PNG, or WebP files no larger than 10 MB");
      await memoryRepository.attachImage(memoryId, { mediaType: photo.type, sizeBytes: photo.size, bytes: new Uint8Array(await photo.arrayBuffer()) }, demoUserId);
    }
    const memory = await memoryRepository.getMemory(memoryId, demoUserId); revalidatePath("/"); return { ok: true, data: memory };
  } catch (error) { return failure(error); }
}

export async function removeMemoryImageAction(memoryId: string, imageId: string): Promise<ActionResult<Memory>> {
  try { idSchema.parse(memoryId); idSchema.parse(imageId); const memory = await memoryRepository.removeImage(memoryId, imageId, demoUserId); revalidatePath("/"); return { ok: true, data: memory }; }
  catch (error) { return failure(error); }
}

export async function getActivityAction(): Promise<ActionResult<ActivityNotification[]>> {
  try { return { ok: true, data: await memoryRepository.getActivity(demoUserId) }; }
  catch (error) { return failure(error); }
}

export async function setActivityPreferenceAction(enabled: boolean): Promise<ActionResult<{ enabled: boolean }>> {
  try { const parsed = z.boolean().parse(enabled); await memoryRepository.setActivityPreference(parsed, demoUserId); return { ok: true, data: { enabled: parsed } }; }
  catch (error) { return failure(error); }
}
