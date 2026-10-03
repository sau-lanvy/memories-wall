import { describe, expect, it } from "vitest";
import { parseMotionMode, repelOffset, threadPaths, tiltFromPointer, timeOfDayTint } from "@/app/wall-motion";

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
