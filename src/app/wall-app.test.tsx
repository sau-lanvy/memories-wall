import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WallData } from "@/server/actions";
import { WallApp } from "@/app/wall-app";

vi.mock("@/server/actions", () => ({
  createMemoryAction: vi.fn(), updateMemoryAction: vi.fn(), deleteMemoryAction: vi.fn(), updatePlacementAction: vi.fn(() => Promise.resolve({ ok: true, data: base })),
}));

const base: WallData = { snapToGrid: false, memories: [{ id: "one", authorId: "demo-user", title: "A good beginning", reflection: "I made space to notice the good thing.", category: "gratitude", visibility: "private", communityIds: [], createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", placements: { personal: { freeform: { x: 10, y: 10 }, snapped: { x: 16, y: 16 } } } }] };

describe("wall public behavior", () => { beforeEach(() => window.localStorage.clear());
  it("offers one obvious start action for a first visit", () => { render(<WallApp initialData={{ memories: [], snapToGrid: false }} />); expect(screen.getAllByRole("button", { name: "Start a Memory" }).length).toBeGreaterThanOrEqual(1); expect(screen.getByText("Your wall is waiting")).toBeInTheDocument(); });
  it("renders category meaning as accessible text, not color alone", () => { render(<WallApp initialData={base} />); expect(screen.getAllByText("Gratitude").length).toBeGreaterThan(0); expect(screen.getByRole("button", { name: "A good beginning, Gratitude memory" })).toBeInTheDocument(); });
  it("exposes keyboard-friendly position controls after selecting a card", async () => { const user = (await import("@testing-library/user-event")).default.setup(); render(<WallApp initialData={base} />); await user.click(screen.getByRole("button", { name: "A good beginning, Gratitude memory" })); expect(screen.getByRole("button", { name: "Arrange this card" })).toBeInTheDocument(); await user.click(screen.getByRole("button", { name: "Arrange this card" })); expect(screen.getByRole("button", { name: "Move up" })).toBeInTheDocument(); expect(screen.getByRole("button", { name: "Confirm" })).toBeInTheDocument(); });
});
