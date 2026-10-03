import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WallData } from "@/server/actions";
import { WallApp } from "@/app/wall-app";

const ok = vi.hoisted(() => (data: unknown) => () => Promise.resolve({ ok: true, data }));
vi.mock("@/server/actions", () => ({
  createMemoryAction: vi.fn(), updateMemoryAction: vi.fn(), deleteMemoryAction: vi.fn(), updatePlacementAction: vi.fn(),
  getAllMemoriesAction: ok([]), getPublicDiscoveryAction: ok([]), searchMemoriesAction: ok([]), searchPublicMemoriesAction: ok([]),
  getReactionAction: ok({ memoryId: "one", reacted: false }), createReactionAction: vi.fn(), removeReactionAction: vi.fn(),
  listWallTemplatesAction: ok([]), applyWallTemplateAction: vi.fn(), undoTemplateApplicationAction: vi.fn(),
  listCommentsAction: ok([]), getCommunityDataAction: ok({ communities: [], memories: [] }),
  getActivityAction: ok([]), getRecentlyAddedAction: ok([]), setActivityPreferenceAction: vi.fn(), setDecorationLayersAction: vi.fn(),
  createCommentAction: vi.fn(), deleteCommentAction: vi.fn(), moderateCommentAction: vi.fn(), createReportAction: vi.fn(), removeMemoryImageAction: vi.fn(),
}));

const memory = (id: string, title: string, createdAt = "2026-01-01T00:00:00.000Z") => ({
  id, authorId: "demo-user", title, reflection: `${title}, remembered.`, category: "gratitude" as const, visibility: "private" as const, communityIds: [],
  createdAt, updatedAt: createdAt, placements: { personal: { freeform: { x: 10, y: 10 }, snapped: { x: 16, y: 16 } } },
});
const data: WallData = { snapToGrid: false, userId: "demo-user", memories: [memory("one", "A good beginning"), memory("two", "A finished chapter")] };

function stubViewport({ desktop }: { desktop: boolean }) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query.includes("min-width: 900px") ? desktop : false,
    media: query, addEventListener: vi.fn(), removeEventListener: vi.fn(),
  }));
}
const openCard = (title: string) => fireEvent.click(screen.getByRole("button", { name: new RegExp(`^${title},`) }));

describe("memory book", () => {
  beforeEach(() => { window.localStorage.clear(); window.localStorage.setItem("memories-wall:motion", "calm"); });
  afterEach(() => vi.unstubAllGlobals());

  it("opens a clicked memory as a two-page book with its details on the right page", async () => {
    stubViewport({ desktop: true });
    render(<WallApp initialData={data} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    openCard("A good beginning");
    const book = await screen.findByRole("dialog", { name: "A good beginning" });
    expect(book).toHaveTextContent("Memory 1 of 2");
    expect(book.querySelector("#memory-details")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Edit memory" })).toBeInTheDocument();
  });

  it("does not open the book when the card was dragged", async () => {
    stubViewport({ desktop: true });
    vi.stubGlobal("PointerEvent", MouseEvent);
    render(<WallApp initialData={data} />);
    const card = screen.getByRole("button", { name: /^A good beginning,/ });
    fireEvent.pointerDown(card, { button: 0, clientX: 100, clientY: 100 });
    fireEvent.click(card, { clientX: 260, clientY: 180 });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("turns to the next and previous memory with the arrow keys and buttons", async () => {
    stubViewport({ desktop: true });
    render(<WallApp initialData={data} />);
    openCard("A good beginning");
    const book = await screen.findByRole("dialog", { name: "A good beginning" });
    fireEvent.keyDown(book, { key: "ArrowRight" });
    expect(await screen.findByRole("dialog", { name: "A finished chapter" })).toHaveTextContent("Memory 2 of 2");
    fireEvent.click(screen.getByRole("button", { name: "Previous memory" }));
    expect(await screen.findByRole("dialog", { name: "A good beginning" })).toBeInTheDocument();
  });

  it("closes with Escape and returns to the wall", async () => {
    stubViewport({ desktop: true });
    render(<WallApp initialData={data} />);
    openCard("A good beginning");
    fireEvent.keyDown(await screen.findByRole("dialog"), { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.queryByLabelText("Memory details")).not.toBeInTheDocument();
  });

  it("closes the book from the details close button and keeps arrow keys for typing", async () => {
    stubViewport({ desktop: true });
    render(<WallApp initialData={data} />);
    openCard("A good beginning");
    fireEvent.click(await screen.findByRole("button", { name: "Edit memory" }));
    const title = screen.getByRole("textbox", { name: "Title" });
    fireEvent.keyDown(title, { key: "ArrowRight" });
    expect(screen.getByRole("dialog", { name: "A good beginning" })).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close memory details" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("lifts off the card and waits for the closing animation in Lively motion", async () => {
    window.localStorage.setItem("memories-wall:motion", "lively");
    stubViewport({ desktop: true });
    render(<WallApp initialData={data} />);
    openCard("A good beginning");
    const book = await screen.findByRole("dialog");
    await waitFor(() => expect(book).toHaveAttribute("data-animate", "true"));
    expect((book.querySelector(".book-frame") as HTMLElement).style.getPropertyValue("--fly-s")).not.toBe("");
    vi.useFakeTimers();
    fireEvent.keyDown(book, { key: "Escape" });
    expect(book).toHaveAttribute("data-phase", "closing");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(950); });
    vi.useRealTimers();
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("does not swap the memory when closed in the middle of a page turn", async () => {
    window.localStorage.setItem("memories-wall:motion", "lively");
    stubViewport({ desktop: true });
    render(<WallApp initialData={data} />);
    openCard("A good beginning");
    const book = await screen.findByRole("dialog");
    await waitFor(() => expect(book).toHaveAttribute("data-animate", "true"));
    vi.useFakeTimers();
    fireEvent.keyDown(book, { key: "ArrowRight" });
    fireEvent.keyDown(book, { key: "Escape" });
    act(() => { vi.advanceTimersByTime(950); });
    vi.useRealTimers();
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.queryByText("A finished chapter", { selector: "#book-title" })).not.toBeInTheDocument();
  });

  it("keeps Shift+Tab and Tab inside the book", async () => {
    stubViewport({ desktop: true });
    render(<WallApp initialData={data} />);
    openCard("A good beginning");
    const book = await screen.findByRole("dialog");
    const items = Array.from(book.querySelectorAll<HTMLElement>("button:not([disabled]), a[href], input:not([disabled]), textarea:not([disabled]), select:not([disabled])")).filter((item) => !item.closest("[aria-hidden='true']"));
    const aside = book.querySelector<HTMLElement>("#memory-details")!;
    aside.focus();
    fireEvent.keyDown(aside, { key: "Tab", shiftKey: true });
    expect(book).toContainElement(document.activeElement as HTMLElement);
    expect(document.activeElement).toBe(items[items.length - 1]);
  });

  it("keeps the bottom-sheet details panel on narrow screens", () => {
    stubViewport({ desktop: false });
    render(<WallApp initialData={data} />);
    openCard("A good beginning");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Memory details")).toHaveClass("memory-details-panel");
  });
});
