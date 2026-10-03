/*
 * Physical model of one page turn, sampled into keyframes so the browser can play it on the compositor.
 *
 * Everything is driven by one progress value t ∈ [0, 1]:
 *   - the spine angle (0° flat on the page it leaves → 180° flat on the page it lands on): a finger peels it up slowly,
 *     it falls faster once past upright, lands, and rebounds a hair;
 *   - the curl of the free edge: the finger lifts the edge ahead of the spine, then after release the edge is a damped
 *     spring dragged through the air, so it trails while the leaf falls and slaps down last when it lands;
 *   - light, sheen and the cast shadow, all derived from each strip's actual angle, so they can never drift out of sync.
 */

export const TURN_MS = 720;
export const LEAF_STRIPS = 10;

const LAND = 0.82;
const ARRIVAL_SPEED = 0.9;
const REBOUND = 1.6;
const RELEASE = 0.36;
const FINGER_LEAD = 20;
const EDGE_HZ = 1.7;
const AIR_DRAG = 7;
const SETTLE_FROM = 0.9;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const smoothstep = (value: number) => { const x = clamp(value, 0, 1); return x * x * (3 - 2 * x); };
const radians = (degrees: number) => (degrees * Math.PI) / 180;

/** Spine angle in degrees for progress t: a cubic that starts at rest and lands still moving, then a small rebound. */
export function spineAngle(t: number) {
  if (t <= LAND) {
    const u = clamp(t, 0, 1) / LAND;
    return 180 * ((3 - ARRIVAL_SPEED) * u * u + (ARRIVAL_SPEED - 2) * u * u * u);
  }
  const s = (Math.min(t, 1) - LAND) / (1 - LAND);
  return 180 - REBOUND * 6.75 * s * (1 - s) ** 2;
}

const fingerLead = (t: number) => FINGER_LEAD * Math.sin((Math.PI / 2) * Math.min(1, t / RELEASE));

export interface TurnSample { t: number; angle: number; curl: number }

/**
 * Samples the turn. `curl` is how far the free edge is ahead of the spine, in degrees along the direction of travel
 * (negative = trailing). The edge never passes through the pages: spine + curl stays within [0°, 180°].
 */
export function turnTrack(samples: number, durationMs = TURN_MS): TurnSample[] {
  const seconds = durationMs / 1000;
  const steps = Math.max(samples, Math.round(durationMs));
  const dt = seconds / steps;
  const omega = 2 * Math.PI * EDGE_HZ;
  const angleAt = (step: number) => spineAngle(step / steps);
  let tip = 0;
  let tipVelocity = 0;
  const curls: number[] = [];
  for (let step = 0; step <= steps; step += 1) {
    const t = step / steps;
    const angle = angleAt(step);
    if (t < RELEASE) {
      tip = angle + fingerLead(t);
      tipVelocity = (angleAt(step + 1) + fingerLead((step + 1) / steps) - tip) / dt;
    } else {
      tipVelocity += (omega * omega * (angle - tip) - AIR_DRAG * tipVelocity) * dt;
      tip += tipVelocity * dt;
      if (tip > 180) { tip = 180; tipVelocity = Math.min(0, tipVelocity); }
    }
    const settle = 1 - smoothstep((t - SETTLE_FROM) / (1 - SETTLE_FROM));
    curls.push(clamp(tip - angle, -angle, 180 - angle) * settle);
  }
  return Array.from({ length: samples + 1 }, (_, index) => {
    const t = index / samples;
    return { t, angle: spineAngle(t), curl: curls[Math.round(t * steps)] };
  });
}

/** Strip widths as fractions of the leaf, narrowing toward the free edge where the paper bends most. */
export function leafStrips(count = LEAF_STRIPS) {
  const raw = Array.from({ length: count }, (_, index) => 1.5 - index / Math.max(1, count - 1));
  const total = raw.reduce((sum, width) => sum + width, 0);
  let x = 0;
  const strips = raw.map((value, index) => {
    const width = value / total;
    const strip = { index, x, width, bend: 0 };
    x += width;
    return strip;
  });
  // Hinge i joins strip i-1 to strip i; paper is a little more flexible toward its free edge. The spine hinge stays straight.
  strips.forEach((strip, index) => { if (index > 0) strip.bend = (0.6 + 0.8 * strip.x) * (strips[index - 1].width + strip.width) / 2; });
  const bendTotal = strips.reduce((sum, strip) => sum + strip.bend, 0);
  strips.forEach((strip) => { strip.bend /= bendTotal; });
  return strips;
}

/** Darkening of a face tilted ψ degrees away from the reader (Lambert), capped once it faces away. */
export const faceShade = (tilt: number) => 0.85 * (1 - Math.cos(radians(clamp(tilt, 0, 90))));
/** A soft specular glint as a face sweeps through the light. */
export const faceSheen = (tilt: number) => (tilt >= 90 ? 0 : 0.9 * Math.exp(-(((tilt - 35) / 18) ** 2)));
/** Signed width of the leaf's shadow on the pages, as a fraction of a page: positive on the right page, negative on the left. */
export const leafProjection = (stripAngles: number[], widths: number[]) => stripAngles.reduce((sum, angle, index) => sum + widths[index] * Math.cos(radians(angle)), 0);
