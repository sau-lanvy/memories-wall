"use client";

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { categoryMeta, type Memory } from "@/domain/memory";
import { flipFromRect } from "@/app/wall-motion";
import { faceShade, faceSheen, leafProjection, leafStrips, TURN_MS, turnTrack } from "@/app/page-turn";
import "@/app/memory-book.css";

const BOOK_QUERY = "(min-width: 900px)";
const OPEN_MS = 1500;
const CLOSE_MS = 900;
/** The turning leaf is built from hinged strips, narrower toward the free edge, so it can curl like paper. */
const STRIPS = leafStrips();
/** Keyframe samples per turn; the browser interpolates linearly between them. */
const TURN_SAMPLES = 72;
/** How long a turn may wait for the incoming photo to decode before it starts anyway. */
const DECODE_WAIT_MS = 200;
const FOCUSABLE = "a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])";

/** The book reading mode needs room for two pages; narrower screens keep the bottom-sheet details panel. */
export function useBookMode() {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const query = window.matchMedia(BOOK_QUERY);
    const update = () => setEnabled(query.matches);
    update();
    query.addEventListener?.("change", update);
    return () => query.removeEventListener?.("change", update);
  }, []);
  return enabled;
}

const isTextField = (target: EventTarget | null) => target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));

/** Aims the book's "closed" pose at a card on the wall, so it appears to lift off and grow from that card. */
function aimAtCard(frame: HTMLElement, memoryId: string) {
  const card = Array.from(document.querySelectorAll<HTMLElement>(".note-card")).find((element) => element.dataset.id === memoryId);
  const bounds = frame.getBoundingClientRect();
  const closed = { left: bounds.left + bounds.width / 4, top: bounds.top, width: bounds.width / 2, height: bounds.height };
  const flip = card ? flipFromRect(card.getBoundingClientRect(), closed) : { x: 0, y: 40, scale: 0.9 };
  frame.style.setProperty("--fly-x", `${flip.x.toFixed(1)}px`);
  frame.style.setProperty("--fly-y", `${flip.y.toFixed(1)}px`);
  frame.style.setProperty("--fly-s", flip.scale.toFixed(3));
}

/** A frozen, inert copy of a rendered page, so a turning leaf can carry the real page (text, photo, ribbon) on its faces. */
function snapshotPage(page: HTMLElement | null) {
  if (!page) return null;
  const copy = page.cloneNode(true) as HTMLElement;
  [copy, ...Array.from(copy.querySelectorAll<HTMLElement>("[id]"))].forEach((element) => element.removeAttribute("id"));
  copy.setAttribute("inert", "");
  copy.querySelectorAll("img").forEach((image) => { image.loading = "eager"; });
  // Hold the reader's scroll position with a transform rather than scrollTop, which would force a layout per copy.
  const scroll = page.querySelector(".book-page-body")?.scrollTop ?? 0;
  if (scroll) copy.querySelectorAll<HTMLElement>(".book-page-body > *").forEach((child) => { child.style.transform = `translateY(${-scroll}px)`; });
  return copy;
}

function placeSnapshot(slot: HTMLElement | null, copy: HTMLElement | null) {
  slot?.replaceChildren(...(copy ? [copy] : []));
}

/** Waits (briefly) for the photos on the leaf to decode, so a page never flips over with a blank photo. */
function decodeImages(root: HTMLElement) {
  const images = new Map(Array.from(root.querySelectorAll("img")).map((image) => [image.currentSrc || image.src, image]));
  return Promise.race([
    Promise.allSettled(Array.from(images.values(), (image) => image.decode())),
    new Promise((resolve) => window.setTimeout(resolve, DECODE_WAIT_MS)),
  ]);
}

/** One face of a strip: its slice of the page copy, under shade and sheen layers sliced from leaf-wide gradients. */
function LeafFace({ side, x, width }: { side: "front" | "back"; x: number; width: number }) {
  const offset = side === "front" ? x : 1 - x - width;
  const slice = { backgroundSize: `${100 / width}% 100%`, backgroundPosition: `${(offset / (1 - width)) * 100}% 0` };
  return <div className={`turn-seg-face turn-seg-${side}`}>
    <div data-slot={side} className="turn-seg-slot" />
    <i className="turn-shade" style={slice} />
    <i className="turn-sheen" style={slice} />
  </div>;
}

/** One strip of the leaf, hinged to the previous one. Each strip shows its slice of the page on both faces. */
function LeafStrip({ index }: { index: number }) {
  const { x, width } = STRIPS[index];
  return <div className="turn-seg" style={{ "--x": x, "--w": width } as CSSProperties}>
    <LeafFace side="front" x={x} width={width} />
    <LeafFace side="back" x={x} width={width} />
    {index < STRIPS.length - 1 && <LeafStrip index={index + 1} />}
  </div>;
}

/**
 * Plays a page turn on the rig's elements with the Web Animations API. Every element gets keyframes sampled from the
 * same track, so the curl, light and shadow stay locked to the leaf's angle and run on the compositor.
 */
function playTurn(rig: HTMLElement, direction: 1 | -1) {
  const linear = { duration: TURN_MS, easing: "linear", fill: "both" } as const;
  const track = turnTrack(TURN_SAMPLES);
  const geometry = (angle: number) => (direction === 1 ? angle : 180 - angle);
  const poses = track.map(({ t, angle, curl }) => {
    let along = angle;
    const strips = STRIPS.map((strip) => { along += curl * strip.bend; return geometry(along); });
    return { offset: t, spine: geometry(angle), curl, strips, projection: leafProjection(strips, STRIPS.map((strip) => strip.width)) };
  });
  const animations: Animation[] = [];
  const play = (element: Element | null, frames: Keyframe[]) => { if (element) animations.push(element.animate(frames, linear)); };
  play(rig.querySelector(".book-turn"), poses.map(({ offset, spine }) => ({ offset, transform: `rotateX(${(2 * Math.sin((spine * Math.PI) / 180)).toFixed(3)}deg) translateZ(4px) rotateY(${-spine}deg)` })));
  rig.querySelectorAll<HTMLElement>(".turn-seg").forEach((segment, index) => {
    const strip = STRIPS[index];
    play(segment, poses.map(({ offset, curl }) => ({ offset, transform: `rotateY(${(-direction * curl * strip.bend).toFixed(3)}deg)` })));
    (["front", "back"] as const).forEach((side) => {
      const tilt = (angle: number) => (side === "front" ? angle : 180 - angle);
      play(segment.querySelector(`:scope > .turn-seg-${side} > .turn-shade`), poses.map(({ offset, strips }) => ({ offset, opacity: faceShade(tilt(strips[index])) })));
      play(segment.querySelector(`:scope > .turn-seg-${side} > .turn-sheen`), poses.map(({ offset, strips }) => ({ offset, opacity: faceSheen(tilt(strips[index])) })));
    });
  });
  // The shadow on each page is as wide as the leaf's footprint over it, and fades as the leaf stands up.
  const cast = (sign: 1 | -1) => poses.map(({ offset, projection }) => {
    const reach = Math.max(0, sign * projection);
    return { offset, opacity: 0.9 * Math.min(1, reach * 3), transform: `translateZ(2px) scaleX(${reach.toFixed(4)})` };
  });
  play(rig.querySelector(".turn-cast-right"), cast(1));
  play(rig.querySelector(".turn-cast-left"), cast(-1));
  return animations;
}

function fillSlots(rig: HTMLElement | null, slot: "front" | "back", copy: HTMLElement | null) {
  rig?.querySelectorAll<HTMLElement>(`[data-slot="${slot}"]`).forEach((target) => placeSnapshot(target, copy && (copy.cloneNode(true) as HTMLElement)));
}

export function BookLeftPage({ memory, photo }: { memory: Memory; photo?: ReactNode }) {
  const meta = categoryMeta[memory.category];
  const written = new Date(memory.createdAt).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
  return <div className="book-left-content">
    <p className="book-stamp" style={{ color: meta.color, borderColor: meta.color }}><span aria-hidden="true">{meta.icon}</span> {meta.label}</p>
    <h2 id="book-title" className="book-title">{memory.title}</h2>
    <p className="book-date">Pinned {written}</p>
    {photo && <div className="book-photo">{photo}</div>}
    <p className="book-epigraph">{meta.description}</p>
  </div>;
}

interface MemoryBookProps {
  memory: Memory;
  position: { index: number; total: number };
  animate: boolean;
  canDismiss: boolean;
  canTurn: boolean;
  photo?: ReactNode;
  onTurn: (direction: 1 | -1) => void;
  onClose: () => void;
  children: (api: { close: () => void }) => ReactNode;
}

/**
 * Reading mode for one memory. The card is the book's cover label: it lifts off the wall, grows, and the cover
 * swings open on its spine. ←/→ turn to the neighbouring memory with a page turn; Esc closes it back onto the wall.
 */
export function MemoryBook({ memory, position, animate, canDismiss, canTurn, photo, onTurn, onClose, children }: MemoryBookProps) {
  const meta = categoryMeta[memory.category];
  const stageRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const closingRef = useRef(false);
  const timers = useRef<number[]>([]);
  const leftPageRef = useRef<HTMLDivElement>(null);
  const rightPageRef = useRef<HTMLDivElement>(null);
  const rigRef = useRef<HTMLDivElement>(null);
  const ghostSlotRef = useRef<HTMLDivElement>(null);
  const outgoingRef = useRef<{ left: HTMLElement | null; right: HTMLElement | null }>({ left: null, right: null });
  const [phase, setPhase] = useState<"opening" | "open" | "closing">(animate ? "opening" : "open");
  const [turn, setTurn] = useState<{ direction: 1 | -1; key: number } | null>(null);

  useLayoutEffect(() => {
    restoreFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (animate && frameRef.current) aimAtCard(frameRef.current, memory.id);
    // Only the first open flies from the card; later memory changes are page turns.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    const pending = timers.current;
    const opened = animate ? window.setTimeout(() => setPhase("open"), OPEN_MS) : 0;
    return () => {
      window.clearTimeout(opened);
      pending.forEach((timer) => window.clearTimeout(timer));
      restoreFocusRef.current?.isConnected && restoreFocusRef.current.focus();
    };
  }, [animate]);

  // The memory has already changed by the time the leaf mounts: the real pages underneath show the new memory, the leaf
  // carries the outgoing page on its front (or back, when turning backwards) and the incoming page on its other face.
  // The leaf holds its starting pose until its photos decode, then plays; the turn ends when the animation does.
  useLayoutEffect(() => {
    const rig = rigRef.current;
    if (!turn || !rig) return;
    const outgoing = outgoingRef.current;
    const incoming = { left: snapshotPage(leftPageRef.current), right: snapshotPage(rightPageRef.current) };
    if (turn.direction === 1) {
      fillSlots(rigRef.current, "front", outgoing.right);
      fillSlots(rigRef.current, "back", incoming.left);
      placeSnapshot(ghostSlotRef.current, outgoing.left);
    } else {
      fillSlots(rigRef.current, "front", incoming.right);
      fillSlots(rigRef.current, "back", outgoing.left);
      placeSnapshot(ghostSlotRef.current, outgoing.right);
    }
    const finish = () => setTurn((current) => (current?.key === turn.key ? null : current));
    if (typeof rig.animate !== "function") {
      const timer = window.setTimeout(finish, TURN_MS);
      return () => window.clearTimeout(timer);
    }
    let cancelled = false;
    let animations: Animation[] = [];
    void decodeImages(rig).then(() => {
      if (cancelled) return;
      animations = playTurn(rig, turn.direction);
      Promise.all(animations.map((animation) => animation.finished)).then(finish, () => undefined);
    });
    return () => { cancelled = true; animations.forEach((animation) => animation.cancel()); };
  }, [turn]);

  const close = () => {
    if (closingRef.current) return;
    closingRef.current = true;
    timers.current.forEach((timer) => window.clearTimeout(timer));
    timers.current = [];
    setTurn(null);
    if (!animate || !frameRef.current) { onClose(); return; }
    aimAtCard(frameRef.current, memory.id);
    setPhase("closing");
    timers.current.push(window.setTimeout(onClose, CLOSE_MS));
  };
  const turnPage = (direction: 1 | -1) => {
    if (!canTurn || turn || phase === "closing") return;
    if (!animate) { onTurn(direction); return; }
    outgoingRef.current = { left: snapshotPage(leftPageRef.current), right: snapshotPage(rightPageRef.current) };
    setTurn({ direction, key: Date.now() });
    onTurn(direction);
  };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape" && canDismiss) { event.preventDefault(); close(); return; }
    if ((event.key === "ArrowRight" || event.key === "ArrowLeft") && !isTextField(event.target) && !event.altKey && !event.metaKey && !event.ctrlKey) {
      event.preventDefault();
      turnPage(event.key === "ArrowRight" ? 1 : -1);
      return;
    }
    if (event.key !== "Tab") return;
    const items = Array.from(stageRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []).filter((item) => !item.closest("[hidden], [aria-hidden='true']"));
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement as HTMLElement | null;
    const inside = !!active && items.includes(active);
    if (event.shiftKey && (!inside || active === first)) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && (!inside || active === last)) { event.preventDefault(); first.focus(); }
  };

  return <div ref={stageRef} role="dialog" aria-modal="true" aria-labelledby="book-title" data-phase={phase} data-animate={animate} onKeyDown={onKeyDown}
    onPointerDown={(event) => { if (event.target === event.currentTarget && canDismiss) close(); }}
    className={`book-stage ${animate ? "book-animated" : "book-still"} ${phase === "closing" ? "is-closing" : ""}`}>
    <div aria-hidden="true" className="book-dust">{Array.from({ length: 10 }, (_, index) => <i key={index} style={{ left: `${(index * 37 + 9) % 100}%`, top: `${(index * 53 + 11) % 100}%`, animationDelay: `${-index * 1.7}s` }} />)}</div>
    <div ref={frameRef} className="book-frame" style={{ "--category": meta.color } as CSSProperties}>
      <div className="book-fly">
        <div className="book" data-id={memory.id}>
          <div className="book-board book-board-right">
            <div ref={rightPageRef} className="book-page book-page-right">
              <i aria-hidden="true" className="book-ribbon" />
              <div key={memory.id} className="book-page-body">{children({ close })}</div>
            </div>
          </div>
          {animate && phase === "opening" && <><i aria-hidden="true" className="book-turn-cast turn-cast-right book-open-cast" /><i aria-hidden="true" className="book-turn-cast turn-cast-left book-open-cast" /></>}
          <div className="book-leaf">
            <div className="book-face book-cover" aria-hidden="true">
              <i className="book-face-shade" />
              <div className="book-label" style={{ backgroundColor: meta.surface }}>
                <i className="book-label-pin" style={{ background: `radial-gradient(circle at 35% 35%, ${meta.color}, #7f1d1d 70%, #3a352d)` }} />
                <span className="book-label-kind">{meta.icon} {meta.label}</span>
                <span className="book-label-title">{memory.title}</span>
              </div>
            </div>
            <div className="book-face book-board book-board-left">
              <i className="book-face-shade" />
              <div ref={leftPageRef} className="book-page book-page-left"><div key={memory.id} className="book-page-body"><BookLeftPage memory={memory} photo={photo} /></div></div>
            </div>
          </div>
          {turn && <div ref={rigRef} key={turn.key} aria-hidden="true" className={`book-turn-rig ${turn.direction === 1 ? "turn-forward" : "turn-back"}`}>
            <div ref={ghostSlotRef} className="book-turn-ghost" />
            <i className="book-turn-cast turn-cast-left" />
            <i className="book-turn-cast turn-cast-right" />
            <div className="book-turn"><LeafStrip index={0} /></div>
          </div>}
        </div>
      </div>
      <div className="book-footer">
        <button type="button" onClick={() => turnPage(-1)} disabled={!canTurn || Boolean(turn)} aria-label="Previous memory">‹</button>
        <span className="font-archive" aria-live="polite">Memory {position.index + 1} of {position.total}</span>
        <button type="button" onClick={() => turnPage(1)} disabled={!canTurn || Boolean(turn)} aria-label="Next memory">›</button>
      </div>
    </div>
  </div>;
}
