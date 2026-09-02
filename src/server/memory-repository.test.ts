import { describe, expect, it } from "vitest";
import { memorySchema } from "@/domain/memory";
import { InMemoryMemoryStore, MemoryPermissionError, MemoryRepository, MemoryValidationError } from "@/server/memory-repository";

const userA = "alice";
const userB = "bob";
async function repository() { return new MemoryRepository(new InMemoryMemoryStore()); }
async function memory(repo: MemoryRepository, title = "A quiet morning") { return repo.createMemory({ title, reflection: "The light was soft and I noticed it.", category: "gratitude", visibility: "private", wallId: "personal" }, userA); }

describe("MemoryRepository", () => {
  it("applies published templates deterministically and preserves size and image metadata", async () => {
    const repo = await repository(); const first = await memory(repo, "First"); const second = await memory(repo, "Second");
    await repo.updateCardPlacement({ memoryId: first.id, sizePreset: "large" }, userA);
    const applied = await repo.applyWallTemplate({ templateId: "three-lanes" }, userA);
    expect(applied.memories.map((item) => item.id)).toEqual([second.id, first.id]);
    expect(applied.memories[1].placements.personal.sizePreset).toBe("large");
    expect(applied.revision).toBe(1);
  });

  it("rejects stale template applications and supports one-step undo", async () => {
    const repo = await repository(); const item = await memory(repo);
    const applied = await repo.applyWallTemplate({ templateId: "desk-grid", expectedRevision: 0 }, userA);
    await expect(repo.applyWallTemplate({ templateId: "three-lanes", expectedRevision: 0 }, userA)).rejects.toThrow("changed elsewhere");
    const undone = await repo.undoTemplateApplication("personal", userA, applied.revision);
    expect(undone.revision).toBe(2);
    await expect(repo.undoTemplateApplication("personal", userA, undone.revision)).rejects.toThrow("no template application");
    expect((await repo.getMemory(item.id, userA)).placements.personal.freeform).toEqual({ x: 7, y: 8 });
  });


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

  it("persists independent card size presets", async () => {
    const repo = await repository(); const item = await memory(repo);
    const result = await repo.updateCardPlacement({ memoryId: item.id, sizePreset: "large" }, userA);
    expect(result.memory.placements.personal.sizePreset).toBe("large");
    expect((await repo.getMemory(item.id, userA)).placements.personal.sizePreset).toBe("large");
  });

  it("validates unsafe input at the repository boundary", async () => {
    const repo = await repository();
    await expect(repo.createMemory({ title: "", reflection: "x", category: "gratitude", visibility: "private", wallId: "personal" }, userA)).rejects.toThrow("title");
    await expect(repo.createMemory({ title: "x", reflection: "x", category: "not-real" as "gratitude", visibility: "private", wallId: "personal" }, userA)).rejects.toThrow();
  });

  it("shares only with communities where the owner has sharing permission", async () => {
    const store = new InMemoryMemoryStore();
    store.grantCommunityMembership(userA, "community-a", "A circle");
    const repo = new MemoryRepository(store);
    const item = await memory(repo);

    const shared = await repo.updateMemory(item.id, { visibility: "selected-community", communityIds: ["community-a"] }, userA);
    expect(shared.visibility).toBe("selected-community");
    expect(await repo.getMemory(item.id, userA)).toEqual(expect.objectContaining({ visibility: "selected-community" }));
    expect(await repo.listMemoriesForUser(userB, { ownership: "shared" })).toEqual([]);
    await expect(repo.updateMemory(item.id, { communityIds: ["community-b"] }, userA)).rejects.toBeInstanceOf(MemoryPermissionError);

    await expect(repo.getMemory(item.id, userB)).rejects.toBeInstanceOf(MemoryPermissionError);
    store.grantCommunityMembership(userB, "community-a", "A circle");
    expect((await repo.listMemoriesForUser(userB, { ownership: "shared" }))[0].id).toBe(item.id);
  });

  it("moves a shared memory back to private and removes it from community listings", async () => {
    const store = new InMemoryMemoryStore();
    store.grantCommunityMembership(userA, "community-a", "A circle");
    store.grantCommunityMembership(userB, "community-a", "A circle");
    const repo = new MemoryRepository(store);
    const item = await repo.createMemory({ title: "Shared", reflection: "A useful moment", category: "growth", visibility: "selected-community", communityIds: ["community-a"], wallId: "personal" }, userA);

    await repo.updateMemory(item.id, { visibility: "private" }, userA);
    expect(await repo.listCommunityMemoriesForUser(userB)).toEqual([]);
    await expect(repo.getMemory(item.id, userB)).rejects.toBeInstanceOf(MemoryPermissionError);
  });

  it("supports authorized comments, owner moderation, and reports", async () => {
    const store = new InMemoryMemoryStore();
    store.grantCommunityMembership(userA, "community-a", "A circle");
    store.grantCommunityMembership(userB, "community-a", "A circle");
    const repo = new MemoryRepository(store);
    const item = await repo.createMemory({ title: "Shared", reflection: "A useful moment", category: "growth", visibility: "selected-community", communityIds: ["community-a"], wallId: "personal" }, userA);

    const comment = await repo.createComment({ memoryId: item.id, body: "Thank you for sharing this." }, userB);
    expect((await repo.listComments(item.id, userB)).map((entry) => entry.body)).toEqual(["Thank you for sharing this."]);
    await expect(repo.deleteComment(comment.id, userA)).rejects.toBeInstanceOf(MemoryPermissionError);
    await repo.moderateComment(comment.id, userA);
    expect(await repo.listComments(item.id, userB)).toEqual([]);
    const report = await repo.createReport({ targetType: "memory", targetId: item.id, reason: "harmful" }, userB);
    expect(report.status).toBe("open");
    expect((await repo.listModerationQueue(userA))[0].id).toBe(report.id);
  });

  it("searches only authorized memories with partial case-insensitive matching", async () => {
    const store = new InMemoryMemoryStore();
    store.grantCommunityMembership(userA, "community-a", "A circle");
    store.grantCommunityMembership(userB, "community-a", "A circle");
    const repo = new MemoryRepository(store);
    await memory(repo, "Morning light");
    const shared = await repo.createMemory({ title: "A Shared Light", reflection: "A community moment", category: "growth", visibility: "selected-community", communityIds: ["community-a"], wallId: "personal" }, userA);
    await repo.createMemory({ title: "Private light", reflection: "Not for others", category: "growth", visibility: "private", wallId: "personal" }, userA);

    expect((await repo.searchMemoriesForUser("LIGHT", userB)).map((entry) => entry.id)).toEqual([shared.id]);
    expect((await repo.searchMemoriesForUser("LIGHT", userA)).map((entry) => entry.id)).toEqual([shared.id]);
  });

  it("searches public discovery without exposing selected-community or private memories", async () => {
    const repo = await repository();
    const publicMemory = await repo.createMemory({ title: "Public light", reflection: "Open to everyone", category: "growth", visibility: "public-discovery", wallId: "personal" }, userA);
    await memory(repo, "Private light");
    const result = await repo.searchPublicMemoriesForUser("LIGHT", userB);
    expect(result.map((entry) => entry.id)).toEqual([publicMemory.id]);
  });

  it("validates image metadata and gates media reads by memory visibility", async () => {
    const store = new InMemoryMemoryStore();
    const repo = new MemoryRepository(store);
    const item = await memory(repo);

    const image = await repo.attachImage(item.id, { mediaType: "image/png", sizeBytes: 1024 }, userA);
    expect(await repo.getMemoryMedia(item.id, userA)).toEqual(image);
    await expect(repo.attachImage(item.id, { mediaType: "image/svg+xml", sizeBytes: 10 }, userA)).rejects.toThrow();
    await expect(repo.getMemoryMedia(item.id, userB)).rejects.toBeInstanceOf(MemoryPermissionError);
  });

  it("supports public discovery while keeping narrower memories out of it", async () => {
    const repo = await repository();
    const privateMemory = await memory(repo, "Private note");
    const shared = await repo.createMemory({ title: "Community note", reflection: "For a circle", category: "growth", visibility: "public-discovery", wallId: "personal" }, userA);
    expect((await repo.listPublicMemoriesForUser(userB)).map((item) => item.id)).toEqual([shared.id]);
    expect((await repo.listPublicMemoriesForUser(userA)).map((item) => item.id)).toEqual([shared.id]);

    await expect(repo.updateMemory(shared.id, { visibility: "selected-community" }, userA)).rejects.toBeInstanceOf(MemoryValidationError);
    await repo.updateMemory(shared.id, { visibility: "private" }, userA);
    expect(await repo.listPublicMemoriesForUser(userB)).toEqual([]);
    expect((await repo.getMemory(privateMemory.id, userA)).visibility).toBe("private");
  });

  it("allows public visibility without a community and transitions back with authorization", async () => {
    const store = new InMemoryMemoryStore();
    store.grantCommunityMembership(userA, "community-a", "A circle");
    const repo = new MemoryRepository(store);
    const item = await repo.createMemory({ title: "Open note", reflection: "A public reflection", category: "growth", visibility: "public-discovery", wallId: "personal" }, userA);
    expect(item.communityIds).toEqual([]);
    const selected = await repo.updateMemory(item.id, { visibility: "selected-community", communityIds: ["community-a"] }, userA);
    expect(selected.visibility).toBe("selected-community");
    expect(selected.communityIds).toEqual(["community-a"]);
    await expect(repo.updateMemory(item.id, { visibility: "selected-community", communityIds: ["other"] }, userA)).rejects.toBeInstanceOf(MemoryPermissionError);
  });

  it("makes reactions idempotent per user and removes only that user's reaction", async () => {
    const repo = await repository();
    const item = await repo.createMemory({ title: "Open note", reflection: "A public reflection", category: "growth", visibility: "public-discovery", wallId: "personal" }, userA);
    const first = await repo.createReaction({ memoryId: item.id }, userB);
    const duplicate = await repo.createReaction({ memoryId: item.id }, userB);
    expect(duplicate).toEqual(first);
    expect(await repo.hasReaction(item.id, userB)).toBe(true);
    expect(await repo.hasReaction(item.id, userA)).toBe(false);
    await repo.removeReaction(item.id, userB);
    expect(await repo.hasReaction(item.id, userB)).toBe(false);
  });

  it("allows reactions and reports on public memories but never on private memories", async () => {
    const repo = await repository();
    const publicMemory = await repo.createMemory({ title: "Open note", reflection: "A public reflection", category: "growth", visibility: "public-discovery", wallId: "personal" }, userA);
    const reaction = await repo.createReaction({ memoryId: publicMemory.id }, userB);
    expect(reaction.memoryId).toBe(publicMemory.id);
    const report = await repo.createReport({ targetType: "memory", targetId: publicMemory.id, reason: "other" }, userB);
    expect(report.targetId).toBe(publicMemory.id);
    const privateMemory = await memory(repo, "Private note");
    await expect(repo.createReaction({ memoryId: privateMemory.id }, userB)).rejects.toBeInstanceOf(MemoryPermissionError);
    await expect(repo.createReport({ targetType: "memory", targetId: privateMemory.id, reason: "privacy" }, userB)).rejects.toBeInstanceOf(MemoryPermissionError);
  });

  it("does not let a non-member react to a selected-community memory", async () => {
    const store = new InMemoryMemoryStore();
    store.grantCommunityMembership(userA, "community-a", "A circle");
    const repo = new MemoryRepository(store);
    const shared = await repo.createMemory({ title: "Circle note", reflection: "For members", category: "growth", visibility: "selected-community", communityIds: ["community-a"], wallId: "personal" }, userA);
    await expect(repo.createReaction({ memoryId: shared.id }, userB)).rejects.toBeInstanceOf(MemoryPermissionError);
  });


  it("keeps an ordered gallery, promotes the next image, and reads legacy image rows", async () => {
    const repo = await repository(); const item = await memory(repo);
    const first = await repo.attachImage(item.id, { mediaType: "image/png", sizeBytes: 100 }, userA);
    const second = await repo.attachImage(item.id, { mediaType: "image/jpeg", sizeBytes: 200 }, userA);
    expect((await repo.getMemory(item.id, userA)).images?.map((image) => image.id)).toEqual([first.id, second.id]);
    await repo.removeImage(item.id, first.id, userA);
    expect((await repo.getMemoryMedia(item.id, userA))?.id).toBe(second.id);
    const legacy = memorySchema.parse({ ...item, images: undefined, image: first });
    expect(legacy.images?.map((image) => image.id)).toEqual([first.id]);
  });

  it("allows authorized owners to comment, pages oldest first, rate limits, and soft deletes", async () => {
    const repo = await repository(); const item = await memory(repo);
    const created = [];
    for (let index = 0; index < 5; index += 1) created.push(await repo.createComment({ memoryId: item.id, body: `Comment ${index}` }, userA));
    await expect(repo.createComment({ memoryId: item.id, body: "Too soon" }, userA)).rejects.toThrow("wait");
    expect((await repo.listComments(item.id, userA, { offset: 0, limit: 2 })).map((comment) => comment.body)).toEqual(["Comment 0", "Comment 1"]);
    await repo.deleteComment(created[0].id, userA);
    expect((await repo.listComments(item.id, userA)).map((comment) => comment.body)).not.toContain("Comment 0");
  });

  it("persists template background and identity, including an empty wall", async () => {
    const repo = await repository();
    const applied = await repo.applyWallTemplate({ templateId: "not-a-template" }, userA).catch(() => null);
    expect(applied).toBeNull();
    const result = await repo.applyWallTemplate({ templateId: "scattered-notes" }, userA);
    const presentation = await repo.getWallPresentation("personal", userA);
    expect(presentation.templateId).toBe("scattered-notes"); expect(presentation.backgroundPreset).toBe("sage-paper"); expect(result.memories).toEqual([]);
  });
});
