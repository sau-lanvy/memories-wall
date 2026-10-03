import { describe, expect, it } from "vitest";
import { adjacentId, describeAge, flipFromRect, memoryOfTheDay, nextSpotlightId, parseMotionMode, repelOffset, threadPaths, tiltFromPointer, timeOfDayTint } from "@/app/wall-motion";

const rect = { left: 100, top: 100, width: 200, height: 100 };

describe("tiltFromPointer", () => {
  it("is flat with a centred glare when the pointer is in the middle", () => {
    expect(tiltFromPointer(rect, 200, 150)).toEqual({ tiltX: 0, tiltY: 0, glareX: 50, glareY: 50 });
  });
  it("tips the edge under the pointer away and clamps outside the card", () => {
    const corner = tiltFromPointer(rect, 900, 900, 8);
    expect(corner.tiltY).toBe(8);
    expect(corner.tiltX).toBe(-8);
    expect(corner.glareX).toBe(100);
  });
});

describe("repelOffset", () => {
  it("pushes a neighbour directly away, weaker when farther", () => {
    const near = repelOffset({ x: 10, y: 10 }, { x: 20, y: 10 }, 30, 12);
    const far = repelOffset({ x: 10, y: 10 }, { x: 35, y: 10 }, 30, 12);
    expect(near.x).toBeGreaterThan(far.x);
    expect(near.y).toBeCloseTo(0);
  });
  it("ignores cards outside the radius and the card itself", () => {
    expect(repelOffset({ x: 0, y: 0 }, { x: 60, y: 0 })).toEqual({ x: 0, y: 0 });
    expect(repelOffset({ x: 5, y: 5 }, { x: 5, y: 5 })).toEqual({ x: 0, y: 0 });
  });
});

describe("timeOfDayTint", () => {
  it("names a distinct phase across the day", () => {
    const phases = [7, 12, 17, 20, 2].map((hour) => timeOfDayTint(hour).phase);
    expect(new Set(phases).size).toBe(5);
  });
  it("wraps out-of-range hours", () => {
    expect(timeOfDayTint(26).phase).toBe(timeOfDayTint(2).phase);
  });
});

describe("threadPaths", () => {
  it("links same-category cards left to right and skips lone cards", () => {
    const paths = threadPaths([
      { id: "a", category: "gratitude", x: 300, y: 50 },
      { id: "b", category: "gratitude", x: 100, y: 60 },
      { id: "c", category: "gratitude", x: 500, y: 80 },
      { id: "d", category: "goals", x: 10, y: 10 },
    ]);
    expect(paths.map((path) => path.key)).toEqual(["b-a", "a-c"]);
    expect(paths[0].d.startsWith("M 100 60")).toBe(true);
    expect(paths[0].category).toBe("gratitude");
  });
});

describe("parseMotionMode", () => {
  it("defaults to lively and accepts calm", () => {
    expect(parseMotionMode(null)).toBe("lively");
    expect(parseMotionMode("junk")).toBe("lively");
    expect(parseMotionMode("calm")).toBe("calm");
  });
});

describe("flipFromRect", () => {
  it("maps the opened book back onto the card it came from", () => {
    const flip = flipFromRect({ left: 0, top: 0, width: 100, height: 50 }, { left: 200, top: 100, width: 400, height: 300 });
    expect(flip.scale).toBeCloseTo(0.25);
    expect(flip.x).toBeCloseTo(50 - 400);
    expect(flip.y).toBeCloseTo(25 - 250);
  });
  it("never produces an invisible or infinite scale", () => {
    expect(flipFromRect({ left: 0, top: 0, width: 0, height: 0 }, { left: 0, top: 0, width: 0, height: 0 }).scale).toBe(1);
    expect(flipFromRect({ left: 0, top: 0, width: 1, height: 1 }, { left: 0, top: 0, width: 1000, height: 1000 }).scale).toBe(0.1);
  });
});

describe("adjacentId", () => {
  const ids = ["a", "b", "c"];
  it("turns forward and back, wrapping at the ends", () => {
    expect(adjacentId(ids, "a", 1)).toBe("b");
    expect(adjacentId(ids, "c", 1)).toBe("a");
    expect(adjacentId(ids, "a", -1)).toBe("c");
  });
  it("has nowhere to turn with fewer than two memories or an unknown id", () => {
    expect(adjacentId(["a"], "a", 1)).toBeNull();
    expect(adjacentId(ids, "zzz", 1)).toBeNull();
  });
});

describe("memoryOfTheDay", () => {
  const memory = (id: string, createdAt: string) => ({ id, createdAt });
  const now = new Date("2026-10-03T09:00:00");
  it("prefers a memory written on this date in an earlier year", () => {
    const pick = memoryOfTheDay([memory("recent", "2026-09-30T10:00:00"), memory("anniversary", "2025-10-03T20:00:00"), memory("old", "2024-01-10T10:00:00")], now);
    expect(pick).toEqual({ id: "anniversary", daysAgo: 365, anniversary: true });
  });
  it("otherwise resurfaces an older memory, the same one all day", () => {
    const list = [memory("a", "2026-01-01T10:00:00"), memory("b", "2026-02-01T10:00:00"), memory("c", "2026-03-01T10:00:00")];
    const first = memoryOfTheDay(list, now);
    expect(first?.anniversary).toBe(false);
    expect(memoryOfTheDay(list, new Date("2026-10-03T22:00:00"))?.id).toBe(first?.id);
  });
  it("stays quiet when nothing is old enough to revisit", () => {
    expect(memoryOfTheDay([memory("fresh", "2026-10-01T10:00:00")], now)).toBeNull();
    expect(memoryOfTheDay([], now)).toBeNull();
  });
});

describe("nextSpotlightId", () => {
  it("walks the wall in order and wraps", () => {
    expect(nextSpotlightId(["a", "b"], null)).toBe("a");
    expect(nextSpotlightId(["a", "b"], "a")).toBe("b");
    expect(nextSpotlightId(["a", "b"], "b")).toBe("a");
    expect(nextSpotlightId([], "a")).toBeNull();
  });
});

describe("describeAge", () => {
  it("names anniversaries by the year and other memories by their age", () => {
    expect(describeAge({ daysAgo: 365, anniversary: true })).toBe("On this day, 1 year ago");
    expect(describeAge({ daysAgo: 730, anniversary: true })).toBe("On this day, 2 years ago");
    expect(describeAge({ daysAgo: 45, anniversary: false })).toBe("From 45 days ago");
    expect(describeAge({ daysAgo: 100, anniversary: false })).toBe("From 3 months ago");
    expect(describeAge({ daysAgo: 800, anniversary: false })).toBe("From 2 years ago");
  });
});
