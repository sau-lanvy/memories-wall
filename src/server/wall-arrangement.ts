import {
  memorySchema,
  type Coordinate,
  type Memory,
  type WallBackgroundPreset,
  type WallPresentation,
  type WallTemplate,
} from "@/domain/memory";
import { MemoryNotFoundError, MemoryValidationError } from "@/server/memory-repository-errors";

export const WALL_TEMPLATES: WallTemplate[] = [
  { id: "desk-grid", name: "Desk Grid", description: "A measured arrangement for a clear working wall.", previewAsset: "/templates/template-1.png", backgroundPreset: "linen", version: 1, published: true, slots: Array.from({ length: 6 }, (_, index) => ({ x: 10 + (index % 3) * 34, y: 12 + Math.floor(index / 3) * 42, rotation: (index % 2 ? 1 : -1) * 1.2, lane: (index < 3 ? "now" : "next") as "now" | "next" })) },
  { id: "scattered-notes", name: "Scattered Notes", description: "A relaxed, overlapping composition for reflective browsing.", previewAsset: "/templates/template-2.png", backgroundPreset: "sage-paper", version: 1, published: true, slots: Array.from({ length: 5 }, (_, index) => ({ x: 12 + (index * 21) % 70, y: 12 + (index * 31) % 68, rotation: (index % 3 - 1) * 2, lane: (index < 2 ? "now" : index < 4 ? "next" : "later") as "now" | "next" | "later" })) },
  { id: "three-lanes", name: "Three Lanes", description: "A simple Now, Next, and Later rhythm.", previewAsset: "/templates/template-3.png", backgroundPreset: "clay-paper", version: 1, published: true, slots: ["now", "next", "later"].map((lane, index) => ({ x: 16 + index * 34, y: 18, lane: lane as "now" | "next" | "later" })) },
  { id: "quiet-corners", name: "Quiet Corners", description: "Room to let each reflection breathe.", previewAsset: "/templates/template-4.png", backgroundPreset: "blueprint-paper", version: 1, published: true, slots: [{ x: 12, y: 14, lane: "now" }, { x: 62, y: 16, lane: "next" }, { x: 24, y: 62, lane: "next" }, { x: 74, y: 64, lane: "later" }] },
  { id: "archive-shelf", name: "Archive Shelf", description: "A dependable row-by-row archive composition.", previewAsset: "/templates/template-5.png", backgroundPreset: "linen", version: 1, published: true, slots: Array.from({ length: 8 }, (_, index) => ({ x: 8 + (index % 4) * 28, y: 15 + Math.floor(index / 4) * 52, lane: (index < 4 ? "now" : "later") as "now" | "later" })) },
];

type ArrangementContext = {
  listVisibleMemories(userId: string, wallId: string): Promise<Memory[]>;
  saveMemory(memory: Memory): Promise<void>;
  decorateMemory(memory: Memory): Promise<Memory>;
  defaultCoordinates(index: number): { freeform: Coordinate; snapped: Coordinate; rotation: number; sizePreset?: "small" | "default" | "large" };
  getPresentation(userId: string, wallId: string): Promise<WallPresentation | null>;
  savePresentation(presentation: WallPresentation): Promise<void>;
};

type UndoSnapshot = { revision: number; memories: Memory[] };

function copy<T>(value: T): T { return structuredClone(value); }

export class WallArrangement {
  private readonly fallbackPresentations = new Map<string, WallPresentation>();
  private readonly undoSnapshots = new Map<string, UndoSnapshot>();

  constructor(private readonly context: ArrangementContext) {}

  listTemplates(): WallTemplate[] { return copy(WALL_TEMPLATES); }

  async getPresentation(wallId: string, userId: string): Promise<WallPresentation> {
    const key = `${userId}:${wallId}`;
    const stored = await this.context.getPresentation(userId, wallId);
    return copy(stored ?? this.fallbackPresentations.get(key) ?? {
      userId,
      wallId,
      revision: 0,
      backgroundPreset: "neutral-texture",
    });
  }

  async apply(input: { wallId?: string; templateId: string; memoryIds?: string[]; expectedRevision?: number }, userId: string) {
    const wallId = input.wallId ?? "personal";
    const template = WALL_TEMPLATES.find((item) => item.id === input.templateId);
    if (!template) throw new MemoryNotFoundError("Wall template not found");
    const previous = await this.getPresentation(wallId, userId);
    const key = `${userId}:${wallId}`;
    if (input.expectedRevision !== undefined && input.expectedRevision !== previous.revision) {
      throw new MemoryValidationError("This wall changed elsewhere. Refresh before applying a template.");
    }
    const visible = await this.context.listVisibleMemories(userId, wallId);
    const selected = input.memoryIds ? visible.filter((memory) => input.memoryIds!.includes(memory.id)) : visible;
    const selectedForPersistence = selected.map((memory) => memorySchema.parse(memory));
    this.undoSnapshots.set(key, { revision: previous.revision, memories: copy(selectedForPersistence) });
    const arranged = selectedForPersistence.map((memory, index) => {
      const hasSlot = index < template.slots.length;
      const slot = template.slots[index % template.slots.length];
      const overflowIndex = Math.max(0, index - template.slots.length);
      const coordinates = hasSlot
        ? { x: slot.x, y: slot.y }
        : { x: 8 + (overflowIndex % 4) * 22, y: 10 + Math.floor(overflowIndex / 4) * 22 };
      const placement = memory.placements[wallId] ?? this.context.defaultCoordinates(index);
      return memorySchema.parse({
        ...memory,
        placements: {
          ...memory.placements,
          [wallId]: {
            ...placement,
            freeform: coordinates,
            snapped: coordinates,
            rotation: hasSlot ? slot.rotation ?? placement.rotation : 0,
          },
        },
      });
    });
    for (const memory of arranged) await this.context.saveMemory(memory);
    const presentation: WallPresentation = {
      userId,
      wallId,
      revision: previous.revision + 1,
      backgroundPreset: template.backgroundPreset,
      templateId: template.id,
      templateVersion: template.version,
      undo: {
        memories: copy(selectedForPersistence),
        backgroundPreset: previous.backgroundPreset,
        templateId: previous.templateId,
        templateVersion: previous.templateVersion,
      },
    };
    this.fallbackPresentations.set(key, copy(presentation));
    await this.context.savePresentation(presentation);
    return {
      memories: await Promise.all(arranged.map((memory) => this.context.decorateMemory(memory))),
      revision: presentation.revision,
      template: copy(template),
      backgroundPreset: presentation.backgroundPreset,
    };
  }

  async undo(wallId: string, userId: string, expectedRevision?: number) {
    const key = `${userId}:${wallId}`;
    const current = await this.getPresentation(wallId, userId);
    if (expectedRevision !== undefined && expectedRevision !== current.revision) {
      throw new MemoryValidationError("This wall changed elsewhere. Refresh before undoing.");
    }
    if (current.revision < 1 || !current.undo) throw new MemoryNotFoundError("There is no template application to undo.");
    const memoriesToRestore = this.undoSnapshots.get(key)?.memories ?? current.undo.memories;
    for (const memory of memoriesToRestore) await this.context.saveMemory(memory);
    const restored: WallPresentation = {
      userId,
      wallId,
      revision: current.revision + 1,
      backgroundPreset: current.undo.backgroundPreset,
      templateId: current.undo.templateId,
      templateVersion: current.undo.templateVersion,
    };
    this.fallbackPresentations.set(key, copy(restored));
    await this.context.savePresentation(restored);
    this.undoSnapshots.delete(key);
    return {
      memories: await Promise.all(memoriesToRestore.map((memory) => this.context.decorateMemory(memory))),
      revision: restored.revision,
      backgroundPreset: restored.backgroundPreset,
      templateId: restored.templateId,
      templateVersion: restored.templateVersion,
    };
  }

  async clearUndo(wallId: string, userId: string): Promise<void> {
    const key = `${userId}:${wallId}`;
    const presentation = await this.getPresentation(wallId, userId);
    if (presentation.undo) {
      const retained = { ...presentation };
      delete retained.undo;
      this.fallbackPresentations.set(key, copy(retained));
      await this.context.savePresentation(retained);
    }
    this.undoSnapshots.delete(key);
  }
}
