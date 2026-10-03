import { describe, expect, it } from "vitest";
import { faceShade, faceSheen, leafProjection, leafStrips, spineAngle, turnTrack } from "@/app/page-turn";

describe("page turn model", () => {
  it("lifts slowly from rest, lands still moving, and comes to rest flat", () => {
    expect(spineAngle(0)).toBe(0);
    expect(spineAngle(0.1)).toBeLessThan(0.1 * 180 / 2);
    expect(spineAngle(1)).toBe(180);
    const nearLanding = spineAngle(0.82) - spineAngle(0.81);
    expect(nearLanding).toBeGreaterThan(0);
    expect(Math.max(...Array.from({ length: 101 }, (_, i) => spineAngle(i / 100)))).toBeLessThanOrEqual(180);
  });

  it("leads with the free edge while lifting, trails it while falling, and ends flat", () => {
    const track = turnTrack(72);
    expect([track[0].angle, track[0].curl]).toEqual([0, 0]);
    expect(track.at(-1)!.angle).toBe(180);
    expect(track.at(-1)!.curl).toBeCloseTo(0);
    expect(Math.max(...track.filter((s) => s.t < 0.4).map((s) => s.curl))).toBeGreaterThan(10);
    expect(Math.min(...track.filter((s) => s.t > 0.55 && s.t < 0.85).map((s) => s.curl))).toBeLessThan(-15);
    track.forEach(({ angle, curl }) => {
      expect(angle + curl).toBeGreaterThanOrEqual(0);
      expect(angle + curl).toBeLessThanOrEqual(180);
    });
  });

  it("splits the leaf into strips that narrow toward the free edge and share the whole curl", () => {
    const strips = leafStrips(10);
    expect(strips.reduce((sum, strip) => sum + strip.width, 0)).toBeCloseTo(1);
    expect(strips.reduce((sum, strip) => sum + strip.bend, 0)).toBeCloseTo(1);
    expect(strips[0].bend).toBe(0);
    expect(strips[9].width).toBeLessThan(strips[0].width);
    expect(strips[9].x + strips[9].width).toBeCloseTo(1);
  });

  it("lights each face by its angle and casts a shadow as wide as the leaf's footprint", () => {
    expect(faceShade(0)).toBe(0);
    expect(faceShade(90)).toBeCloseTo(0.85);
    expect(faceShade(150)).toBeCloseTo(0.85);
    expect(faceSheen(35)).toBeCloseTo(0.9);
    expect(faceSheen(120)).toBe(0);
    expect(leafProjection([0, 0], [0.5, 0.5])).toBeCloseTo(1);
    expect(leafProjection([90, 90], [0.5, 0.5])).toBeCloseTo(0);
    expect(leafProjection([180, 180], [0.5, 0.5])).toBeCloseTo(-1);
  });
});
