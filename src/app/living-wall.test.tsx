import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useIdleSpotlight, useMemoryOfTheDay, useSceneChange } from "@/app/living-wall";

beforeEach(() => vi.useFakeTimers());
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("useSceneChange", () => {
  it("moves the cards at once, swaps the background late, then settles", () => {
    const { result, rerender } = renderHook(({ revision, preset }) => useSceneChange(revision, preset, true), { initialProps: { revision: 0, preset: "linen" } });
    expect(result.current).toEqual({ changing: false, preset: "linen" });
    rerender({ revision: 1, preset: "sage-paper" });
    expect(result.current).toEqual({ changing: true, preset: "linen" });
    act(() => { vi.advanceTimersByTime(400); });
    expect(result.current.preset).toBe("sage-paper");
    expect(result.current.changing).toBe(true);
    act(() => { vi.advanceTimersByTime(1500); });
    expect(result.current.changing).toBe(false);
  });

  it("changes instantly in Calm motion", () => {
    const { result, rerender } = renderHook(({ revision, preset }) => useSceneChange(revision, preset, false), { initialProps: { revision: 0, preset: "linen" } });
    rerender({ revision: 1, preset: "sage-paper" });
    expect(result.current).toEqual({ changing: false, preset: "sage-paper" });
  });
});

describe("useIdleSpotlight", () => {
  it("lifts memories into the light after a quiet spell and stops on input", () => {
    const { result } = renderHook(() => useIdleSpotlight(["a", "b"], true, 1000, 500));
    expect(result.current).toBeNull();
    act(() => { vi.advanceTimersByTime(1000); });
    expect(result.current).toBe("a");
    act(() => { vi.advanceTimersByTime(500); });
    expect(result.current).toBe("b");
    act(() => { window.dispatchEvent(new Event("pointermove")); });
    expect(result.current).toBeNull();
    act(() => { vi.advanceTimersByTime(900); });
    expect(result.current).toBeNull();
  });

  it("stays off when disabled or when the OS asks for reduced motion", () => {
    const disabled = renderHook(() => useIdleSpotlight(["a"], false, 100, 100));
    act(() => { vi.advanceTimersByTime(500); });
    expect(disabled.result.current).toBeNull();
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    const reduced = renderHook(() => useIdleSpotlight(["a"], true, 100, 100));
    act(() => { vi.advanceTimersByTime(500); });
    expect(reduced.result.current).toBeNull();
  });
});

describe("useMemoryOfTheDay", () => {
  it("picks an older memory after mount and leaves fresh walls alone", () => {
    vi.setSystemTime(new Date("2026-10-03T09:00:00"));
    const old = renderHook(() => useMemoryOfTheDay([{ id: "old", createdAt: "2025-10-03T10:00:00" }]));
    expect(old.result.current).toMatchObject({ id: "old", anniversary: true });
    const fresh = renderHook(() => useMemoryOfTheDay([{ id: "new", createdAt: "2026-10-02T10:00:00" }]));
    expect(fresh.result.current).toBeNull();
  });
});
