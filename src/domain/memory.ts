import { z } from "zod";

export const MEMORY_CATEGORIES = ["gratitude", "milestone", "growth", "intention", "kindness", "family", "health"] as const;
export const memoryCategorySchema = z.enum(MEMORY_CATEGORIES);
export type MemoryCategory = z.infer<typeof memoryCategorySchema>;
export const VISIBILITIES = ["private", "selected-community", "public-discovery"] as const;
export const visibilitySchema = z.enum(VISIBILITIES);
export type Visibility = z.infer<typeof visibilitySchema>;
export const communityIdSchema = z.string().trim().min(1).max(80);
export const communityMembershipSchema = z.object({
  communityId: communityIdSchema,
  name: z.string().trim().min(1).max(120),
  canShare: z.boolean().default(false),
}).strict();
export type CommunityMembership = z.infer<typeof communityMembershipSchema>;

export const memoryImageSchema = z.object({
  id: z.string().min(1),
  mediaType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  sizeBytes: z.number().int().positive().max(10_485_760),
  storageKey: z.string().min(1),
  thumbnailKey: z.string().min(1).optional(),
  uploadedAt: z.string().datetime(),
}).strict();
export type MemoryImage = z.infer<typeof memoryImageSchema> & { url?: string; thumbnailUrl?: string };
export const MEMORY_IMAGE_LIMIT = 5;

export const coordinateSchema = z.object({ x: z.number().finite().min(0).max(100), y: z.number().finite().min(0).max(100) }).strict();
export type Coordinate = z.infer<typeof coordinateSchema>;
export const MEMORY_SIZE_PRESETS = ["small", "default", "large"] as const;
export const memorySizePresetSchema = z.enum(MEMORY_SIZE_PRESETS);
export type MemorySizePreset = z.infer<typeof memorySizePresetSchema>;
export const wallPlacementSchema = z.object({
  freeform: coordinateSchema,
  snapped: coordinateSchema,
  rotation: z.number().finite().min(-8).max(8).optional(),
  sizePreset: memorySizePresetSchema.optional(),
}).strict();
export type WallPlacement = Omit<z.infer<typeof wallPlacementSchema>, "sizePreset"> & { sizePreset?: MemorySizePreset };

const memoryRecordSchema = z.object({
  id: z.string().min(1), authorId: z.string().min(1), title: z.string().trim().min(1).max(120),
  reflection: z.string().trim().min(1).max(5000), category: memoryCategorySchema,
  visibility: visibilitySchema, createdAt: z.string().datetime(), updatedAt: z.string().datetime(),
  communityIds: z.array(communityIdSchema).default([]),
  images: z.array(memoryImageSchema).max(MEMORY_IMAGE_LIMIT).default([]),
  placements: z.record(z.string().min(1), wallPlacementSchema),
}).strict();
// Older rows used `image`. Normalize them at the domain boundary so reads and
// writes use the ordered gallery without requiring a destructive data migration.
export const memorySchema = z.preprocess((value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const record = { ...(value as Record<string, unknown>) };
  if (record.images === undefined && record.image !== undefined) record.images = [record.image];
  delete record.image;
  return record;
}, memoryRecordSchema);
export type Memory = Omit<z.infer<typeof memorySchema>, "images"> & { images?: MemoryImage[] };

export const createMemorySchema = z.object({
  title: z.string().trim().min(1, "A title is required").max(120),
  reflection: z.string().trim().min(1, "A reflection is required").max(5000),
  category: memoryCategorySchema,
  visibility: visibilitySchema.default("private"),
  communityIds: z.array(communityIdSchema).max(20).default([]),
  wallId: z.string().trim().min(1).max(80).default("personal"),
}).strict();
export type CreateMemoryInput = z.input<typeof createMemorySchema>;
export const updateMemorySchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  reflection: z.string().trim().min(1).max(5000).optional(),
  category: memoryCategorySchema.optional(),
  visibility: visibilitySchema.optional(),
  communityIds: z.array(communityIdSchema).max(20).optional(),
}).strict();
export type UpdateMemoryInput = z.infer<typeof updateMemorySchema>;
export const listMemoryFiltersSchema = z.object({
  category: memoryCategorySchema.optional(),
  ownership: z.enum(["owned", "shared", "all"]).default("owned"),
  visibility: visibilitySchema.optional(),
  communityId: communityIdSchema.optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  wallId: z.string().min(1).default("personal"),
}).strict();
export type ListMemoryFilters = z.input<typeof listMemoryFiltersSchema>;
export const placementUpdateSchema = z.object({
  memoryId: z.string().min(1),
  wallId: z.string().trim().min(1).max(80).default("personal"),
  mode: z.enum(["freeform", "snapped"]).optional(),
  coordinates: coordinateSchema.optional(),
  rotation: z.number().finite().min(-8).max(8).optional(),
  sizePreset: memorySizePresetSchema.optional(),
  snapToGrid: z.boolean().optional(),
}).strict().refine((v) => v.coordinates !== undefined || v.rotation !== undefined || v.sizePreset !== undefined || v.snapToGrid !== undefined, "A position, rotation, or snap preference is required");
export type PlacementUpdateInput = z.input<typeof placementUpdateSchema>;
export type PlacementMode = "freeform" | "snapped";

export const templateSlotSchema = z.object({ x: z.number().finite().min(0).max(100), y: z.number().finite().min(0).max(100), rotation: z.number().finite().min(-8).max(8).optional(), lane: z.enum(["now", "next", "later"]) }).strict();
export type TemplateSlot = z.infer<typeof templateSlotSchema>;
export const templateVisualTreatmentSchema = z.object({
  scene: z.enum(["paper-drift", "warm-cabinet", "soft-constellation", "botanical-light", "blueprint-glow"]),
  motion: z.enum(["still", "breathe", "float", "drift", "constellation"]),
  intensity: z.number().finite().min(0).max(1),
}).strict();
export type TemplateVisualTreatment = z.infer<typeof templateVisualTreatmentSchema>;
export const wallTemplateSchema = z.object({ id: z.string().min(1), name: z.string().trim().min(1).max(120), description: z.string().trim().min(1).max(500), previewAsset: z.string().min(1), version: z.number().int().positive(), published: z.literal(true), backgroundPreset: z.enum(["neutral-texture", "linen", "sage-paper", "clay-paper", "blueprint-paper"]).default("neutral-texture"), visualTreatment: templateVisualTreatmentSchema, slots: z.array(templateSlotSchema).min(1) }).strict();
export type WallTemplate = z.infer<typeof wallTemplateSchema>;

export const WALL_BACKGROUND_PRESETS = ["neutral-texture", "linen", "sage-paper", "clay-paper", "blueprint-paper"] as const;
export const wallBackgroundPresetSchema = z.enum(WALL_BACKGROUND_PRESETS);
export type WallBackgroundPreset = z.infer<typeof wallBackgroundPresetSchema>;
export const wallPresentationSchema = z.object({
  wallId: z.string().min(1), userId: z.string().min(1), revision: z.number().int().nonnegative(),
  backgroundPreset: wallBackgroundPresetSchema, templateId: z.string().min(1).optional(), templateVersion: z.number().int().positive().optional(),
  undo: z.object({ memories: z.array(memorySchema).transform((value) => value as Memory[]), backgroundPreset: wallBackgroundPresetSchema, templateId: z.string().min(1).optional(), templateVersion: z.number().int().positive().optional() }).optional(),
}).strict();
export type WallPresentation = z.infer<typeof wallPresentationSchema>;

export const wallDataSchema = z.object({ memories: z.array(memorySchema), snapToGrid: z.boolean(), backgroundPreset: wallBackgroundPresetSchema.default("neutral-texture"), templateId: z.string().min(1).optional(), templateVersion: z.number().int().positive().optional(), templateRevision: z.number().int().nonnegative().default(0), canUndoTemplate: z.boolean().default(false) }).strict();

export const commentSchema = z.object({
  id: z.string().min(1),
  memoryId: z.string().min(1),
  authorId: z.string().min(1),
  body: z.string().trim().min(1).max(2000),
  createdAt: z.string().datetime(),
  deletedAt: z.string().datetime().optional(),
}).strict();
export type MemoryComment = z.infer<typeof commentSchema>;
export const createCommentSchema = z.object({ memoryId: z.string().min(1), body: z.string().trim().min(1, "A comment is required").max(2000) }).strict();
export type CreateCommentInput = z.input<typeof createCommentSchema>;

export const reactionSchema = z.object({
  id: z.string().min(1),
  memoryId: z.string().min(1),
  userId: z.string().min(1),
  kind: z.literal("appreciate"),
  createdAt: z.string().datetime(),
}).strict();
export type MemoryReaction = z.infer<typeof reactionSchema>;
export const createReactionSchema = z.object({ memoryId: z.string().min(1) }).strict();
export type CreateReactionInput = z.input<typeof createReactionSchema>;

export const reportReasonSchema = z.enum(["harmful", "harassment", "privacy", "spam", "other"]);
export type ReportReason = z.infer<typeof reportReasonSchema>;
export const reportSchema = z.object({
  id: z.string().min(1),
  reporterId: z.string().min(1),
  targetType: z.enum(["memory", "comment"]),
  targetId: z.string().min(1),
  reason: reportReasonSchema,
  createdAt: z.string().datetime(),
  status: z.enum(["open", "reviewed"]).default("open"),
}).strict();
export type MemoryReport = z.infer<typeof reportSchema>;
export const createReportSchema = z.object({
  targetType: z.enum(["memory", "comment"]),
  targetId: z.string().min(1),
  reason: reportReasonSchema,
}).strict();
export type CreateReportInput = z.input<typeof createReportSchema>;

export const activitySchema = z.object({
  id: z.string().min(1),
  userId: z.string().min(1),
  memoryId: z.string().min(1),
  kind: z.literal("comment"),
  createdAt: z.string().datetime(),
  readAt: z.string().datetime().optional(),
}).strict();
export type ActivityNotification = z.infer<typeof activitySchema>;

export const categoryMeta: Record<MemoryCategory, { label: string; icon: string; color: string; surface: string; description: string }> = {
  gratitude: { label: "Gratitude", icon: "✦", color: "#d7b94b", surface: "#f4ebd0", description: "Notice the good that is already here." },
  milestone: { label: "Milestone", icon: "◆", color: "#c16e54", surface: "#edd8d9", description: "Mark the moments that moved you forward." },
  growth: { label: "Growth", icon: "↗", color: "#6b855c", surface: "#e1e8dc", description: "Make room for the person you are becoming." },
  intention: { label: "Intention", icon: "◎", color: "#7188a4", surface: "#e5e4f2", description: "Give a quiet direction to what comes next." },
  kindness: { label: "Kindness", icon: "♡", color: "#b56e6e", surface: "#f4ede9", description: "Keep the gestures that made the day gentler." },
  family: { label: "Family", icon: "⌂", color: "#9c827b", surface: "#f4f1ea", description: "Hold close the people and places that ground you." },
  health: { label: "Health", icon: "+", color: "#6d8c72", surface: "#e1e8dc", description: "Remember the choices that help you feel whole." },
};
