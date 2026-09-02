import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WallData } from "@/server/actions";
import { WallApp } from "@/app/wall-app";

vi.mock("@/server/actions", () => ({
  createMemoryAction: vi.fn(), updateMemoryAction: vi.fn(), deleteMemoryAction: vi.fn(), updatePlacementAction: vi.fn(() => Promise.resolve({ ok: true, data: base })),
  getPublicDiscoveryAction: vi.fn(() => Promise.resolve({ ok: true, data: [] })),
  getReactionAction: vi.fn(() => Promise.resolve({ ok: true, data: { memoryId: "one", reacted: false } })),
  createReactionAction: vi.fn(), removeReactionAction: vi.fn(),
  listWallTemplatesAction: vi.fn(() => Promise.resolve({ ok: true, data: [] })),
  applyWallTemplateAction: vi.fn(), undoTemplateApplicationAction: vi.fn(), addMemoryImagesAction: vi.fn(), removeMemoryImageAction: vi.fn(), listCommentsAction: vi.fn(() => Promise.resolve({ ok: true, data: [] })),
}));

const base: WallData = { snapToGrid: false, memories: [{ id: "one", authorId: "demo-user", title: "A good beginning", reflection: "I made space to notice the good thing.", category: "gratitude", visibility: "private", communityIds: [], createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", placements: { personal: { freeform: { x: 10, y: 10 }, snapped: { x: 16, y: 16 } } } }] };

describe("wall public behavior", () => { beforeEach(() => window.localStorage.clear());
  it("offers one obvious start action for a first visit", () => { render(<WallApp initialData={{ memories: [], snapToGrid: false }} />); expect(screen.getAllByRole("button", { name: "Start a Memory" }).length).toBeGreaterThanOrEqual(1); expect(screen.getByText("Your wall is waiting")).toBeInTheDocument(); });
  it("renders category meaning as accessible text, not color alone", () => { render(<WallApp initialData={base} />); expect(screen.getAllByText("Gratitude").length).toBeGreaterThan(0); expect(screen.getByRole("button", { name: "A good beginning, Gratitude memory" })).toBeInTheDocument(); });
  it("shows gallery position labels and keyboard-accessible thumbnails", async () => {
    const galleryData = { ...base, memories: [{ ...base.memories[0], images: [{ id: "image-one", mediaType: "image/png" as const, sizeBytes: 100, storageKey: "missing-one", uploadedAt: "2026-01-01T00:00:00.000Z" }, { id: "image-two", mediaType: "image/png" as const, sizeBytes: 100, storageKey: "missing-two", uploadedAt: "2026-01-01T00:00:01.000Z" }] }] };
    render(<WallApp initialData={galleryData} />);
    fireEvent.click(screen.getByRole("button", { name: "A good beginning, Gratitude memory" }));
    expect(await screen.findByText("Image 1 of 2")).toBeInTheDocument();
    expect(screen.getAllByRole("img", { name: /unavailable$/i }).length).toBeGreaterThan(0);
    await (await import("@testing-library/user-event")).default.setup().click(screen.getByRole("button", { name: "Next image" }));
    expect(screen.getByText("Image 2 of 2")).toBeInTheDocument();
  });
  it("exposes keyboard-friendly position controls after selecting a card", async () => { const user = (await import("@testing-library/user-event")).default.setup(); render(<WallApp initialData={base} />); await user.click(screen.getByRole("button", { name: "A good beginning, Gratitude memory" })); expect(screen.getByRole("button", { name: "Arrange this card" })).toBeInTheDocument(); await user.click(screen.getByRole("button", { name: "Arrange this card" })); expect(screen.getByRole("button", { name: "Move up" })).toBeInTheDocument(); expect(screen.getByRole("button", { name: "Confirm" })).toBeInTheDocument(); });
  it("keeps existing-memory uploads successful through the multipart endpoint", async () => {
    const user = (await import("@testing-library/user-event")).default.setup();
    const fetchMock = vi.fn<(...args: [RequestInfo | URL, RequestInit?]) => Promise<{ ok: boolean; json: () => Promise<{ ok: true; data: typeof base.memories[0] }> }>>(() => Promise.resolve({ ok: true, json: async () => ({ ok: true, data: base.memories[0] }) }));
    vi.stubGlobal("fetch", fetchMock);
    render(<WallApp initialData={base} />);
    await user.click(screen.getByRole("button", { name: "A good beginning, Gratitude memory" }));
    const input = screen.getByLabelText("Add images");
    await user.upload(input, new File(["image"], "memory.png", { type: "image/png" }));
    await user.click(screen.getByRole("button", { name: "Add" }));
    expect(fetchMock).toHaveBeenCalledWith("/api/memories/one/images", expect.objectContaining({ method: "POST" }));
    expect((fetchMock.mock.calls.at(-1)?.[1] as RequestInit).body).toBeInstanceOf(FormData);
    expect(((fetchMock.mock.calls.at(-1)?.[1] as RequestInit).body as FormData).getAll("photos")).toHaveLength(1);
    expect(await screen.findByRole("status")).toHaveTextContent("Images added to this memory.");
    vi.unstubAllGlobals();
  });
  it("offers a separate public discovery surface", () => { render(<WallApp initialData={base} />); expect(screen.getByRole("button", { name: "Public discovery" })).toBeInTheDocument(); });
  it("keeps a queued pointer move safe when the drag ends in the same event batch", async () => {
    const { container } = render(<WallApp initialData={base} />);
    const canvas = screen.getByRole("region", { name: "Memory wall" });
    vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({ left: 0, top: 0, width: 1000, height: 1000, right: 1000, bottom: 1000, x: 0, y: 0, toJSON: () => ({}) });
    const card = screen.getByRole("button", { name: "A good beginning, Gratitude memory" });
    expect(container).toContainElement(card);
    expect(() => {
      fireEvent.pointerDown(card, { button: 0, clientX: 100, clientY: 100, pointerId: 1 });
      fireEvent.pointerMove(canvas, { clientX: 200, clientY: 200, pointerId: 1 });
      fireEvent.pointerUp(canvas, { pointerId: 1 });
    }).not.toThrow();
  });
});
