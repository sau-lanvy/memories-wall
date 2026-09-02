import { z } from "zod";

export const MEMORY_CATEGORIES = ["gratitude", "milestone", "growth", "intention", "kindness", "family", "health"] as const;
export const memoryCategorySchema = z.enum(MEMORY_CATEGORIES);
export type MemoryCategory = z.infer<typeof memoryCategorySchema>;
export const VISIBILITIES = ["private"] as const;
export const visibilitySchema = z.enum(VISIBILITIES);
export type Visibility = z.infer<typeof visibilitySchema>;

export const coordinateSchema = z.object({ x: z.number().finite().min(0).max(100), y: z.number().finite().min(0).max(100) }).strict();
export type Coordinate = z.infer<typeof coordinateSchema>;
export const wallPlacementSchema = z.object({
  freeform: coordinateSchema,
  snapped: coordinateSchema,
  rotation: z.number().finite().min(-8).max(8).optional(),
}).strict();
export type WallPlacement = z.infer<typeof wallPlacementSchema>;

export const memorySchema = z.object({
  id: z.string().min(1), authorId: z.string().min(1), title: z.string().trim().min(1).max(120),
  reflection: z.string().trim().min(1).max(5000), category: memoryCategorySchema,
  visibility: visibilitySchema, createdAt: z.string().datetime(), updatedAt: z.string().datetime(),
  placements: z.record(z.string().min(1), wallPlacementSchema),
}).strict();
export type Memory = z.infer<typeof memorySchema>;

export const createMemorySchema = z.object({ title: z.string().trim().min(1, "A title is required").max(120), reflection: z.string().trim().min(1, "A reflection is required").max(5000), category: memoryCategorySchema, visibility: visibilitySchema.default("private"), wallId: z.string().trim().min(1).max(80).default("personal") }).strict();
export type CreateMemoryInput = z.input<typeof createMemorySchema>;
export const updateMemorySchema = z.object({ title: z.string().trim().min(1).max(120).optional(), reflection: z.string().trim().min(1).max(5000).optional(), category: memoryCategorySchema.optional() }).strict();
export type UpdateMemoryInput = z.infer<typeof updateMemorySchema>;
export const listMemoryFiltersSchema = z.object({ category: memoryCategorySchema.optional(), ownership: z.enum(["owned"]).default("owned"), from: z.string().datetime().optional(), to: z.string().datetime().optional(), wallId: z.string().min(1).default("personal") }).strict();
export type ListMemoryFilters = z.input<typeof listMemoryFiltersSchema>;
export const placementUpdateSchema = z.object({
  memoryId: z.string().min(1),
  wallId: z.string().trim().min(1).max(80).default("personal"),
  mode: z.enum(["freeform", "snapped"]).optional(),
  coordinates: coordinateSchema.optional(),
  rotation: z.number().finite().min(-8).max(8).optional(),
  snapToGrid: z.boolean().optional(),
}).strict().refine((v) => v.coordinates !== undefined || v.rotation !== undefined || v.snapToGrid !== undefined, "A position, rotation, or snap preference is required");
export type PlacementUpdateInput = z.input<typeof placementUpdateSchema>;
export type PlacementMode = "freeform" | "snapped";

export const wallDataSchema = z.object({ memories: z.array(memorySchema), snapToGrid: z.boolean() }).strict();

export const categoryMeta: Record<MemoryCategory, { label: string; icon: string; color: string; surface: string }> = {
  gratitude: { label: "Gratitude", icon: "✦", color: "#d7b94b", surface: "#f4ebd0" },
  milestone: { label: "Milestone", icon: "◆", color: "#c16e54", surface: "#edd8d9" },
  growth: { label: "Growth", icon: "↗", color: "#6b855c", surface: "#e1e8dc" },
  intention: { label: "Intention", icon: "◎", color: "#7188a4", surface: "#e5e4f2" },
  kindness: { label: "Kindness", icon: "♡", color: "#b56e6e", surface: "#f4ede9" },
  family: { label: "Family", icon: "⌂", color: "#9c827b", surface: "#f4f1ea" },
  health: { label: "Health", icon: "+", color: "#6d8c72", surface: "#e1e8dc" },
};
