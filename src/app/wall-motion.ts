export type MotionMode = "lively" | "calm";
export const MOTION_STORAGE_KEY = "memories-wall:motion";

export function parseMotionMode(value: string | null): MotionMode {
  return value === "calm" ? "calm" : "lively";
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** Tilt (degrees) and glare position (%) for a card given the pointer position over it. */
export function tiltFromPointer(rect: { left: number; top: number; width: number; height: number }, x: number, y: number, max = 7) {
  const nx = clamp(((x - rect.left) / rect.width) * 2 - 1, -1, 1);
  const ny = clamp(((y - rect.top) / rect.height) * 2 - 1, -1, 1);
  return { tiltX: -ny * max || 0, tiltY: nx * max, glareX: (nx + 1) * 50, glareY: (ny + 1) * 50 };
}

/** Pixel offset that nudges `to` away from `from`; fades to zero at `radius` (wall percent units). */
export function repelOffset(from: { x: number; y: number }, to: { x: number; y: number }, radius = 30, strength = 14) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = Math.hypot(dx, dy);
  if (distance === 0 || distance >= radius) return { x: 0, y: 0 };
  const force = (1 - distance / radius) * strength;
  return { x: (dx / distance) * force, y: (dy / distance) * force };
}

/** Ambient light colours for the viewer's local hour. */
export function timeOfDayTint(hour: number) {
  const h = ((Math.floor(hour) % 24) + 24) % 24;
  if (h >= 5 && h < 9) return { phase: "dawn", tint: "rgba(255,190,170,.38)", beam: "rgba(255,214,190,.55)" };
  if (h >= 9 && h < 16) return { phase: "day", tint: "rgba(255,246,214,.28)", beam: "rgba(255,250,230,.5)" };
  if (h >= 16 && h < 19) return { phase: "golden", tint: "rgba(255,170,90,.42)", beam: "rgba(255,196,120,.6)" };
  if (h >= 19 && h < 22) return { phase: "dusk", tint: "rgba(150,120,200,.34)", beam: "rgba(190,170,240,.4)" };
  return { phase: "night", tint: "rgba(90,110,190,.34)", beam: "rgba(160,180,255,.32)" };
}

export interface ThreadPoint { id: string; category: string; x: number; y: number }

/** Sagging string paths chaining same-category pins left to right (pixel coordinates). */
export function threadPaths(points: ThreadPoint[]) {
  const groups = new Map<string, ThreadPoint[]>();
  for (const point of points) groups.set(point.category, [...(groups.get(point.category) ?? []), point]);
  const paths: { key: string; category: string; d: string }[] = [];
  for (const [category, group] of groups) {
    const sorted = [...group].sort((a, b) => a.x - b.x);
    for (let index = 0; index < sorted.length - 1; index += 1) {
      const a = sorted[index];
      const b = sorted[index + 1];
      const sag = Math.min(60, Math.hypot(b.x - a.x, b.y - a.y) * 0.16 + 10);
      paths.push({ key: `${a.id}-${b.id}`, category, d: `M ${a.x} ${a.y} Q ${(a.x + b.x) / 2} ${(a.y + b.y) / 2 + sag} ${b.x} ${b.y}` });
    }
  }
  return paths;
}

const canAnimate = (el: Element): el is HTMLElement => typeof (el as HTMLElement).animate === "function";

/** Damped pendulum swing layered on top of the card's idle sway. */
export function swingCard(el: Element | null, degrees = 6, delay = 0) {
  if (!el || !canAnimate(el) || el.closest(".motion-calm") || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
  el.animate(
    [0, 1, -0.6, 0.35, -0.15, 0].map((factor, index, all) => ({ rotate: `${factor * degrees}deg`, offset: index / (all.length - 1) })),
    { duration: 1400, delay, easing: "ease-in-out", composite: "add" },
  );
}

/** A passing breeze: every card swings once, staggered across the wall. */
export function breeze(root: Element) {
  root.querySelectorAll(".note-card").forEach((card, index) => swingCard(card, index % 2 ? 2.2 : -2.2, index * 90));
}

/** Briefly lights one random pin. */
export function sparklePin(root: Element) {
  const pins = root.querySelectorAll(".note-pin");
  if (!pins.length) return;
  const pin = pins[Math.floor(Math.random() * pins.length)];
  pin.classList.add("pin-sparkle");
  window.setTimeout(() => pin.classList.remove("pin-sparkle"), 1400);
}
