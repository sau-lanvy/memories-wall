"use client";

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { categoryMeta, type Memory } from "@/domain/memory";
import { flipFromRect } from "@/app/wall-motion";
import "@/app/memory-book.css";

const BOOK_QUERY = "(min-width: 900px)";
const OPEN_MS = 1500;
const CLOSE_MS = 900;
const TURN_MS = 820;
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
    setTurn({ direction, key: Date.now() });
    timers.current.push(window.setTimeout(() => onTurn(direction), TURN_MS / 2));
    timers.current.push(window.setTimeout(() => setTurn(null), TURN_MS));
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
            <div className="book-page book-page-right">
              <i aria-hidden="true" className="book-ribbon" />
              <div key={memory.id} className="book-page-body">{children({ close })}</div>
            </div>
          </div>
          <div className="book-leaf">
            <div className="book-face book-cover" aria-hidden="true">
              <div className="book-label" style={{ backgroundColor: meta.surface }}>
                <i className="book-label-pin" style={{ background: `radial-gradient(circle at 35% 35%, ${meta.color}, #7f1d1d 70%, #3a352d)` }} />
                <span className="book-label-kind">{meta.icon} {meta.label}</span>
                <span className="book-label-title">{memory.title}</span>
              </div>
            </div>
            <div className="book-face book-board book-board-left">
              <div className="book-page book-page-left"><div key={memory.id} className="book-page-body"><BookLeftPage memory={memory} photo={photo} /></div></div>
            </div>
          </div>
          {turn && <div key={turn.key} aria-hidden="true" className={`book-turn ${turn.direction === 1 ? "turn-forward" : "turn-back"}`}><i className="book-turn-face" /><i className="book-turn-face book-turn-back" /></div>}
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
