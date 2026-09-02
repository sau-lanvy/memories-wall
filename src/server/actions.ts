"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { memoryRepository, demoUserId, type MemoryRepository, MemoryPermissionError, MemoryNotFoundError, MemoryValidationError } from "@/server/memory-repository";
import { createCommentSchema, createReportSchema, memoryCategorySchema, reportReasonSchema, type ActivityNotification, type CommunityMembership, type Memory, type MemoryComment, type MemoryReport, type PlacementUpdateInput, type UpdateMemoryInput, type MemoryCategory } from "@/domain/memory";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string; code: "INVALID" | "NOT_FOUND" | "FORBIDDEN" | "UNKNOWN" };
export type WallData = { memories: Memory[]; snapToGrid: boolean };
export type CommunityData = { memories: Memory[]; communities: CommunityMembership[] };
const idSchema = z.string().min(1);

function failure(error: unknown): ActionResult<never> {
  if (error instanceof MemoryValidationError || error instanceof z.ZodError) return { ok: false, error: error instanceof Error ? error.message : "Please check the submitted values.", code: "INVALID" };
  if (error instanceof MemoryPermissionError) return { ok: false, error: "This memory belongs to another account.", code: "FORBIDDEN" };
  if (error instanceof MemoryNotFoundError) return { ok: false, error: "That memory no longer exists. Refresh the wall and try again.", code: "NOT_FOUND" };
  return { ok: false, error: error instanceof Error ? error.message : "Something went wrong. Please try again.", code: "UNKNOWN" };
}

export async function getWallData(category?: string): Promise<ActionResult<WallData>> {
  try {
    const validCategory = category ? memoryCategorySchema.parse(category) : undefined;
    const memories = await memoryRepository.listMemoriesForUser(demoUserId, { category: validCategory, wallId: "personal" });
    return { ok: true, data: { memories, snapToGrid: await memoryRepository.getWallPreference("personal", demoUserId) } };
  } catch (error) { return failure(error); }
}

export async function createMemoryAction(formData: FormData): Promise<ActionResult<Memory>> {
  try {
    const text = (name: string) => { const value = formData.get(name); return typeof value === "string" ? value : ""; };
    const visibility = text("visibility") || "private";
    const communityIds = text("communityIds").split(",").map((value) => value.trim()).filter(Boolean);
    const memory = await memoryRepository.createMemory({ title: text("title"), reflection: text("reflection"), category: text("category") as MemoryCategory, visibility: visibility as "private" | "selected-community", communityIds, wallId: "personal" }, demoUserId);
    revalidatePath("/"); return { ok: true, data: memory };
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

export async function updatePlacementAction(input: PlacementUpdateInput): Promise<ActionResult<WallData>> {
  try {
    await memoryRepository.updateCardPlacement(input, demoUserId);
    const memories = await memoryRepository.listMemoriesForUser(demoUserId, { wallId: "personal" });
    revalidatePath("/"); return { ok: true, data: { memories, snapToGrid: await memoryRepository.getWallPreference("personal", demoUserId) } };
  } catch (error) { return failure(error); }
}

export async function getCommunityDataAction(communityId?: string): Promise<ActionResult<CommunityData>> {
  try {
    const communities = await memoryRepository.listCommunitiesForUser(demoUserId);
    const memories = await memoryRepository.listCommunityMemoriesForUser(demoUserId, communityId);
    return { ok: true, data: { memories, communities } };
  } catch (error) { return failure(error); }
}

export async function getAllMemoriesAction(): Promise<ActionResult<Memory[]>> {
  try { return { ok: true, data: await memoryRepository.listMemoriesForUser(demoUserId, { ownership: "all" }) }; }
  catch (error) { return failure(error); }
}

export async function getRecentlyAddedAction(): Promise<ActionResult<Memory[]>> {
  try { return { ok: true, data: await memoryRepository.listRecentlyAddedMemoriesForUser(demoUserId) }; }
  catch (error) { return failure(error); }
}

export async function searchMemoriesAction(query: string): Promise<ActionResult<Memory[]>> {
  try { return { ok: true, data: await memoryRepository.searchMemoriesForUser(query, demoUserId) }; }
  catch (error) { return failure(error); }
}

export async function listCommentsAction(memoryId: string): Promise<ActionResult<MemoryComment[]>> {
  try { return { ok: true, data: await memoryRepository.listComments(memoryId, demoUserId) }; }
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
  try { await memoryRepository.deleteComment(id, demoUserId); revalidatePath("/"); return { ok: true, data: { id } }; }
  catch (error) { return failure(error); }
}

export async function moderateCommentAction(id: string): Promise<ActionResult<MemoryComment>> {
  try { const comment = await memoryRepository.moderateComment(id, demoUserId); revalidatePath("/"); return { ok: true, data: comment }; }
  catch (error) { return failure(error); }
}

export async function createReportAction(input: { targetType: "memory" | "comment"; targetId: string; reason: string }): Promise<ActionResult<MemoryReport>> {
  try {
    const parsed = createReportSchema.parse({ ...input, reason: reportReasonSchema.parse(input.reason) });
    const report = await memoryRepository.createReport(parsed, demoUserId);
    return { ok: true, data: report };
  } catch (error) { return failure(error); }
}

export async function getActivityAction(): Promise<ActionResult<ActivityNotification[]>> {
  try { return { ok: true, data: await memoryRepository.getActivity(demoUserId) }; }
  catch (error) { return failure(error); }
}

export async function setActivityPreferenceAction(enabled: boolean): Promise<ActionResult<{ enabled: boolean }>> {
  try { await memoryRepository.setActivityPreference(enabled, demoUserId); return { ok: true, data: { enabled } }; }
  catch (error) { return failure(error); }
}
