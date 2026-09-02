"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { memoryRepository, demoUserId, type MemoryRepository, MemoryPermissionError, MemoryNotFoundError, MemoryValidationError } from "@/server/memory-repository";
import { memoryCategorySchema, type Memory, type PlacementUpdateInput, type UpdateMemoryInput, type MemoryCategory } from "@/domain/memory";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string; code: "INVALID" | "NOT_FOUND" | "FORBIDDEN" | "UNKNOWN" };
export type WallData = { memories: Memory[]; snapToGrid: boolean };
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
    const memory = await memoryRepository.createMemory({ title: text("title"), reflection: text("reflection"), category: text("category") as MemoryCategory, visibility: "private", wallId: "personal" }, demoUserId);
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
