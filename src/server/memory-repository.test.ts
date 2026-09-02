import { describe, expect, it } from "vitest";
import { InMemoryMemoryStore, MemoryPermissionError, MemoryRepository } from "@/server/memory-repository";

const userA = "alice";
const userB = "bob";
async function repository() { return new MemoryRepository(new InMemoryMemoryStore()); }
async function memory(repo: MemoryRepository, title = "A quiet morning") { return repo.createMemory({ title, reflection: "The light was soft and I noticed it.", category: "gratitude", visibility: "private", wallId: "personal" }, userA); }

describe("MemoryRepository", () => {
  it("creates complete memories with both placement coordinate sets", async () => {
    const repo = await repository(); const result = await memory(repo);
    expect(result.authorId).toBe(userA); expect(result.visibility).toBe("private");
    expect(result.placements.personal.freeform).toEqual(expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) }));
    expect(result.placements.personal.snapped).toEqual(expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) }));
    expect(result.createdAt).toBe(result.updatedAt);
  });

  it("lists by owner, category, and created date", async () => {
    const repo = await repository(); await memory(repo, "First");
    const other = await repo.createMemory({ title: "Other", reflection: "Not mine", category: "growth", visibility: "private", wallId: "personal" }, userB);
    const allMine = await repo.listMemoriesForUser(userA); expect(allMine).toHaveLength(1); expect(allMine[0].id).not.toBe(other.id);
    expect((await repo.listMemoriesForUser(userA, { category: "growth" })).length).toBe(0);
    const from = new Date(Date.now() - 1000).toISOString(); expect((await repo.listMemoriesForUser(userA, { from })).length).toBe(1);
  });

  it("updates and deletes only the requested owned memory", async () => {
    const repo = await repository(); const first = await memory(repo, "Original"); const second = await memory(repo, "Keep me");
    const updated = await repo.updateMemory(first.id, { title: "Rewritten", category: "growth" }, userA);
    expect(updated.title).toBe("Rewritten"); expect(updated.category).toBe("growth"); expect(updated.updatedAt).not.toBe(first.updatedAt);
    await repo.deleteMemory(first.id, userA); expect((await repo.listMemoriesForUser(userA)).map((item) => item.id)).toEqual([second.id]);
  });

  it("enforces ownership on every single-memory read and write", async () => {
    const repo = await repository(); const item = await memory(repo);
    await expect(repo.getMemory(item.id, userB)).rejects.toBeInstanceOf(MemoryPermissionError);
    await expect(repo.updateMemory(item.id, { title: "Nope" }, userB)).rejects.toBeInstanceOf(MemoryPermissionError);
    await expect(repo.updateCardPlacement({ memoryId: item.id, coordinates: { x: 50, y: 50 } }, userB)).rejects.toBeInstanceOf(MemoryPermissionError);
    await expect(repo.deleteMemory(item.id, userB)).rejects.toBeInstanceOf(MemoryPermissionError);
    expect((await repo.getMemory(item.id, userA)).title).toBe("A quiet morning");
  });

  it("keeps freeform and snapped placement histories independent across toggles", async () => {
    const repo = await repository(); const item = await memory(repo);
    await repo.updateCardPlacement({ memoryId: item.id, coordinates: { x: 51, y: 42 } }, userA);
    await repo.updateCardPlacement({ memoryId: item.id, snapToGrid: true }, userA);
    await repo.updateCardPlacement({ memoryId: item.id, coordinates: { x: 80, y: 72 } }, userA);
    let current = await repo.getMemory(item.id, userA);
    expect(current.placements.personal.freeform).toEqual({ x: 51, y: 42 });
    expect(current.placements.personal.snapped).toEqual({ x: 80, y: 72 });
    expect(await repo.getWallPreference("personal", userA)).toBe(true);
    await repo.updateCardPlacement({ memoryId: item.id, snapToGrid: false }, userA);
    current = await repo.getMemory(item.id, userA); expect(current.placements.personal.freeform).toEqual({ x: 51, y: 42 });
    await repo.updateCardPlacement({ memoryId: item.id, snapToGrid: true }, userA);
    current = await repo.getMemory(item.id, userA); expect(current.placements.personal.snapped).toEqual({ x: 80, y: 72 });
  });

  it("changes the wall preference without rewriting a memory", async () => {
    const repo = await repository(); const item = await memory(repo);
    await repo.updateCardPlacement({ memoryId: item.id, snapToGrid: true }, userA);
    const unchanged = await repo.getMemory(item.id, userA);
    expect(unchanged.updatedAt).toBe(item.updatedAt);
    expect(await repo.getWallPreference("personal", userA)).toBe(true);
  });

  it("validates unsafe input at the repository boundary", async () => {
    const repo = await repository();
    await expect(repo.createMemory({ title: "", reflection: "x", category: "gratitude", visibility: "private", wallId: "personal" }, userA)).rejects.toThrow("title");
    await expect(repo.createMemory({ title: "x", reflection: "x", category: "not-real" as "gratitude", visibility: "private", wallId: "personal" }, userA)).rejects.toThrow();
  });
});
