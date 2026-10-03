"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import { categoryMeta, type Memory } from "@/domain/memory";
import { breeze, MOTION_STORAGE_KEY, memoryOfTheDay, nextSpotlightId, parseMotionMode, prefersReducedMotion, repelOffset, sparklePin, threadPaths, tiltFromPointer, timeOfDayTint, type MotionMode } from "@/app/wall-motion";

/** Persisted Calm / Lively preference, layered on top of the OS reduced-motion setting. */
export function useMotionMode() {
  const [mode, setMode] = useState<MotionMode>("lively");
  useEffect(() => { setMode(parseMotionMode(window.localStorage.getItem(MOTION_STORAGE_KEY))); }, []);
  const toggle = () => setMode((current) => {
    const next = current === "lively" ? "calm" : "lively";
    window.localStorage.setItem(MOTION_STORAGE_KEY, next);
    return next;
  });
  return { mode, toggle };
}

/** Ambient behaviour for the wall element: light, parallax, pointer tilt, neighbour nudges, breeze and tab-pause. */
export function useLivingWall(ref: RefObject<HTMLElement | null>, mode: MotionMode, active: boolean) {
  const hovered = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const root = ref.current;
    if (!active || !root) return;
    const applyLight = () => {
      const light = timeOfDayTint(new Date().getHours());
      root.style.setProperty("--tod-tint", light.tint);
      root.style.setProperty("--beam-color", light.beam);
      root.dataset.timeOfDay = light.phase;
    };
    applyLight();
    const lightTimer = window.setInterval(applyLight, 10 * 60 * 1000);
    const onVisibility = () => root.classList.toggle("motion-paused", document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => { window.clearInterval(lightTimer); document.removeEventListener("visibilitychange", onVisibility); };
  }, [ref, active]);

  useEffect(() => {
    const root = ref.current;
    if (!active || !root || mode === "calm" || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    let timer = 0;
    const schedule = () => {
      timer = window.setTimeout(() => {
        if (!document.hidden) { breeze(root); sparklePin(root); }
        schedule();
      }, 14000 + Math.random() * 14000);
    };
    schedule();
    return () => window.clearTimeout(timer);
  }, [ref, mode, active]);

  const clearCard = (card: HTMLElement | null) => {
    card?.style.removeProperty("--tilt-x"); card?.style.removeProperty("--tilt-y");
    card?.style.removeProperty("--glare-x"); card?.style.removeProperty("--glare-y");
  };
  const setNeighbours = (root: HTMLElement, card: HTMLElement | null) => {
    const origin = card ? { x: Number(card.dataset.x), y: Number(card.dataset.y) } : null;
    root.querySelectorAll<HTMLElement>(".note-card").forEach((other) => {
      const offset = origin && other !== card && mode === "lively" ? repelOffset(origin, { x: Number(other.dataset.x), y: Number(other.dataset.y) }) : { x: 0, y: 0 };
      other.style.setProperty("--nx", `${offset.x.toFixed(1)}px`);
      other.style.setProperty("--ny", `${offset.y.toFixed(1)}px`);
    });
  };

  return useMemo(() => ({
    onPointerOver(event: ReactPointerEvent<HTMLElement>) {
      const card = (event.target as Element).closest<HTMLElement>(".note-card");
      if (card === hovered.current) return;
      clearCard(hovered.current);
      hovered.current = card;
      setNeighbours(event.currentTarget, card);
    },
    onPointerMove(event: ReactPointerEvent<HTMLElement>) {
      const root = event.currentTarget;
      const bounds = root.getBoundingClientRect();
      root.style.setProperty("--px", String(((event.clientX - bounds.left) / bounds.width) * 2 - 1));
      root.style.setProperty("--py", String(((event.clientY - bounds.top) / bounds.height) * 2 - 1));
      const card = hovered.current;
      if (!card || mode === "calm" || card.classList.contains("dragging")) return;
      const tilt = tiltFromPointer(card.getBoundingClientRect(), event.clientX, event.clientY);
      card.style.setProperty("--tilt-x", tilt.tiltX.toFixed(2)); card.style.setProperty("--tilt-y", tilt.tiltY.toFixed(2));
      card.style.setProperty("--glare-x", `${tilt.glareX.toFixed(0)}%`); card.style.setProperty("--glare-y", `${tilt.glareY.toFixed(0)}%`);
    },
    onPointerLeave(event: ReactPointerEvent<HTMLElement>) {
      clearCard(hovered.current);
      hovered.current = null;
      setNeighbours(event.currentTarget, null);
    },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [mode]);
}

const DUST = Array.from({ length: 16 }, (_, index) => ({
  left: `${(index * 37 + 11) % 100}%`, top: `${(index * 53 + 7) % 100}%`,
  size: 2 + (index % 3), delay: `${-((index * 7) % 20)}s`, duration: `${16 + (index * 5) % 14}s`,
}));

/** Window-light beams, dust motes, paper grain and a per-preset signature shimmer. */
export function WallAtmosphere({ preset }: { preset: string }) {
  return <div aria-hidden="true" className={`wall-atmosphere atmo-${preset} pointer-events-none absolute inset-0 z-[1] overflow-hidden`}>
    <i className="atmo-beam atmo-beam-a" /><i className="atmo-beam atmo-beam-b" />
    {DUST.map((mote, index) => <i key={index} className="atmo-dust" style={{ left: mote.left, top: mote.top, width: mote.size, height: mote.size, animationDelay: mote.delay, animationDuration: mote.duration }} />)}
  </div>;
}

/** Strings pinned between same-category cards, measured from the rendered pins. */
export function CardThreads({ memories, layoutKey, rootRef }: { memories: Memory[]; layoutKey: string; rootRef: RefObject<HTMLElement | null> }) {
  const [threads, setThreads] = useState<{ key: string; category: string; d: string }[]>([]);
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const measure = () => {
      const points = Array.from(root.querySelectorAll<HTMLElement>(".note-card[data-id]")).map((card) => ({
        id: card.dataset.id ?? "", category: card.dataset.category ?? "", x: Math.round(card.offsetLeft + card.offsetWidth / 2), y: card.offsetTop - (parseFloat(getComputedStyle(card).marginTop) || 0) + 12,
      }));
      setThreads(threadPaths(points));
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    return () => observer.disconnect();
  }, [rootRef, layoutKey]);
  const colors = useMemo(() => Object.fromEntries(memories.map((memory) => [memory.category, categoryMeta[memory.category].color])), [memories]);
  if (!threads.length) return null;
  return <svg aria-hidden="true" className="card-threads pointer-events-none absolute inset-0 z-[5] h-full w-full overflow-visible">
    {threads.map((thread) => <path key={thread.key} d={thread.d} fill="none" stroke={colors[thread.category] ?? "#7a7469"} strokeWidth="1.5" strokeLinecap="round" strokeDasharray="1 5" className="card-thread" />)}
  </svg>;
}

const SCENE_CHANGE_MS = 1700;
const SCENE_SWAP_MS = 320;

/**
 * Choreographs a template switch: `changing` is true in the same render that the arrangement moves, so cards
 * glide to their new places; the background preset swaps late, while a wash of light covers the change.
 */
export function useSceneChange(revision: number, preset: string, lively: boolean) {
  const [settledRevision, setSettledRevision] = useState(revision);
  const [shownPreset, setShownPreset] = useState(preset);
  useEffect(() => {
    if (settledRevision === revision) return;
    const timer = window.setTimeout(() => setSettledRevision(revision), SCENE_CHANGE_MS);
    return () => window.clearTimeout(timer);
  }, [revision, settledRevision]);
  useEffect(() => {
    if (preset === shownPreset) return;
    const timer = window.setTimeout(() => setShownPreset(preset), lively && !prefersReducedMotion() ? SCENE_SWAP_MS : 0);
    return () => window.clearTimeout(timer);
  }, [preset, shownPreset, lively]);
  const animated = lively && !prefersReducedMotion();
  return { changing: animated && settledRevision !== revision, preset: animated ? shownPreset : preset };
}

/** After a quiet spell the wall lifts one memory at a time into the light; any input puts everything back. */
export function useIdleSpotlight(ids: string[], enabled: boolean, idleMs = 25_000, stepMs = 4_500) {
  const [spotlightId, setSpotlightId] = useState<string | null>(null);
  const idsRef = useRef(ids);
  idsRef.current = ids;
  useEffect(() => {
    if (!enabled || prefersReducedMotion()) { setSpotlightId(null); return; }
    let idleTimer = 0;
    let stepTimer = 0;
    const arm = () => {
      window.clearTimeout(idleTimer);
      window.clearInterval(stepTimer);
      setSpotlightId((current) => (current ? null : current));
      idleTimer = window.setTimeout(() => {
        setSpotlightId(nextSpotlightId(idsRef.current, null));
        stepTimer = window.setInterval(() => setSpotlightId((current) => nextSpotlightId(idsRef.current, current)), stepMs);
      }, idleMs);
    };
    const events = ["pointermove", "pointerdown", "keydown", "wheel", "touchstart"] as const;
    events.forEach((name) => window.addEventListener(name, arm, { passive: true }));
    arm();
    return () => {
      window.clearTimeout(idleTimer);
      window.clearInterval(stepTimer);
      events.forEach((name) => window.removeEventListener(name, arm));
      setSpotlightId(null);
    };
  }, [enabled, idleMs, stepMs]);
  return spotlightId;
}

/** The memory worth revisiting today. Picked after mount so server and client markup agree. */
export function useMemoryOfTheDay(memories: { id: string; createdAt: string }[]) {
  const [pick, setPick] = useState<ReturnType<typeof memoryOfTheDay>>(null);
  const memoriesRef = useRef(memories);
  memoriesRef.current = memories;
  const key = memories.map((memory) => `${memory.id}@${memory.createdAt}`).join("|");
  useEffect(() => { setPick(memoryOfTheDay(memoriesRef.current, new Date())); }, [key]);
  return pick;
}
