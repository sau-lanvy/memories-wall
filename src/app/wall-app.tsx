"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import { categoryMeta, MEMORY_CATEGORIES, wallDataSchema, type Coordinate, type Memory, type MemoryCategory } from "@/domain/memory";
import { createMemoryAction, deleteMemoryAction, updateMemoryAction, updatePlacementAction, type WallData } from "@/server/actions";

const STORAGE_KEY = "memories-wall:demo-user:personal";
const initialForm = { title: "", reflection: "", category: "gratitude" as MemoryCategory };
type FormValues = typeof initialForm;
type View = "wall" | "mine";
type PositionDraft = { id: string; coordinates: Coordinate };
type DragState = { id: string; offsetX: number; offsetY: number; coordinates: Coordinate; originalCoordinates: Coordinate };

function formatDate(value: string) { return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value)); }
function activeCoordinates(memory: Memory, snapToGrid: boolean): Coordinate { return memory.placements.personal?.[snapToGrid ? "snapped" : "freeform"] ?? { x: 8, y: 8 }; }
function updateMemoryPosition(memories: Memory[], id: string, coordinates: Coordinate, snapToGrid: boolean): Memory[] {
  return memories.map((memory) => memory.id === id ? { ...memory, placements: { ...memory.placements, personal: { ...(memory.placements.personal ?? { freeform: coordinates, snapped: coordinates }), [snapToGrid ? "snapped" : "freeform"]: coordinates } } } : memory);
}
function clamp(value: number) { return Math.max(2, Math.min(88, value)); }
function snapCoordinate(coordinate: Coordinate): Coordinate { return { x: Math.round(coordinate.x / 8) * 8, y: Math.round(coordinate.y / 8) * 8 }; }

export function WallApp({ initialData }: { initialData: WallData }) {
  const [data, setData] = useState<WallData>(initialData);
  const [hydrated, setHydrated] = useState(false);
  const [view, setView] = useState<View>("wall");
  const [category, setCategory] = useState<MemoryCategory | "all">("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [form, setForm] = useState<FormValues>(initialForm);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({ title: "", reflection: "", category: "gratitude" as MemoryCategory });
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [notice, setNotice] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [positionMode, setPositionMode] = useState<PositionDraft | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const composerTitleRef = useRef<HTMLInputElement>(null);
  const composerReturnFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as WallData;
        const validated = wallDataSchema.safeParse(parsed); if (validated.success) setData(validated.data);
      }
    } catch { /* A corrupt demo snapshot should never block the wall. */ }
    setHydrated(true);
  }, []);
  useEffect(() => { if (hydrated) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); }, [data, hydrated]);

  const selected = data.memories.find((memory) => memory.id === selectedId) ?? null;
  const visibleMemories = useMemo(() => data.memories.filter((memory) => category === "all" || memory.category === category), [data.memories, category]);
  const isEmpty = data.memories.length === 0;

  function selectMemory(memory: Memory) {
    setSelectedId(memory.id); setEditing(false); setPositionMode(null);
    window.setTimeout(() => document.getElementById("memory-details")?.focus(), 0);
  }
  function openComposer() {
    composerReturnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setForm(initialForm); setNotice(null); setComposerOpen(true);
  }
  function closeComposer() {
    setComposerOpen(false);
    window.setTimeout(() => composerReturnFocusRef.current?.focus(), 0);
  }
  useEffect(() => {
    if (composerOpen) window.setTimeout(() => composerTitleRef.current?.focus(), 0);
  }, [composerOpen]);
  function onCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setNotice(null);
    void createMemoryAction(new FormData(event.currentTarget)).then((result) => {
      if (!result.ok) { setNotice({ kind: "error", text: `${result.error} Check the fields and try again.` }); setBusy(false); return; }
      setData((current) => ({ ...current, memories: [result.data, ...current.memories] }));
      setSelectedId(result.data.id); setComposerOpen(false); setForm(initialForm); setNotice({ kind: "success", text: "Memory saved to your wall." }); setBusy(false);
    }).catch(() => { setNotice({ kind: "error", text: "We could not reach the archive. Your draft is still in the form; please try again." }); setBusy(false); });
  }
  function beginEdit() {
    if (!selected) return;
    setEditForm({ title: selected.title, reflection: selected.reflection, category: selected.category }); setEditing(true); setNotice(null);
  }
  function saveEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!selected) return; setBusy(true); setNotice(null);
    void updateMemoryAction(selected.id, editForm).then((result) => {
      if (!result.ok) { setNotice({ kind: "error", text: result.error }); setBusy(false); return; }
      setData((current) => ({ ...current, memories: current.memories.map((memory) => memory.id === result.data.id ? result.data : memory) })); setEditing(false); setNotice({ kind: "success", text: "Memory updated." }); setBusy(false);
    }).catch(() => { setNotice({ kind: "error", text: "The update could not be saved. Please try again." }); setBusy(false); });
  }
  function deleteSelected() {
    if (!selected) return; setBusy(true);
    void deleteMemoryAction(selected.id).then((result) => {
      if (!result.ok) { setNotice({ kind: "error", text: result.error }); setBusy(false); return; }
      setData((current) => ({ ...current, memories: current.memories.filter((memory) => memory.id !== selected.id) })); setSelectedId(null); setConfirmDelete(false); setNotice({ kind: "success", text: "Memory deleted." }); setBusy(false);
    }).catch(() => { setNotice({ kind: "error", text: "The memory could not be deleted. Please try again." }); setBusy(false); });
  }
  function persistPlacement(id: string, coordinates: Coordinate, previousCoordinates?: Coordinate) {
    const safeCoordinates = data.snapToGrid ? snapCoordinate(coordinates) : coordinates;
    setBusy(true);
    void Promise.resolve(updatePlacementAction({ memoryId: id, coordinates: safeCoordinates })).then((result) => {
      if (!result.ok) {
        if (previousCoordinates) setData((current) => ({ ...current, memories: updateMemoryPosition(current.memories, id, previousCoordinates, data.snapToGrid) }));
        setNotice({ kind: "error", text: result.error }); setBusy(false); return;
      }
      setData(result.data); setNotice({ kind: "success", text: `Position saved at ${Math.round(safeCoordinates.x)} percent across and ${Math.round(safeCoordinates.y)} percent down.` }); setBusy(false);
    }).catch(() => { setNotice({ kind: "error", text: "The position could not be saved. Please try again." }); setBusy(false); });
  }
  function toggleSnap() {
    if (!data.memories.length) return;
    const next = !data.snapToGrid; setBusy(true);
    void Promise.resolve(updatePlacementAction({ memoryId: selectedId ?? data.memories[0]?.id ?? "none", snapToGrid: next })).then((result) => {
      if (!result.ok && data.memories.length) { setNotice({ kind: "error", text: result.error }); setBusy(false); return; }
      if (result.ok) setData(result.data); setNotice({ kind: "success", text: next ? "Snap to Grid on. Snapped positions restored." : "Snap to Grid off. Freeform positions restored." }); setBusy(false);
    }).catch(() => { setNotice({ kind: "error", text: "The grid preference could not be saved. Please try again." }); setBusy(false); });
  }
  function onPointerDown(event: ReactPointerEvent<HTMLElement>, memory: Memory) {
    if (event.button !== 0 || (typeof window.matchMedia === "function" && window.matchMedia("(max-width: 760px)").matches)) return;
    const canvas = canvasRef.current; if (!canvas) return;
    const rect = canvas.getBoundingClientRect(); const current = activeCoordinates(memory, data.snapToGrid);
    const x = ((event.clientX - rect.left) / rect.width) * 100; const y = ((event.clientY - rect.top) / rect.height) * 100;
    dragRef.current = { id: memory.id, offsetX: x - current.x, offsetY: y - current.y, coordinates: current, originalCoordinates: current }; setDragId(memory.id); selectMemory(memory); if (typeof event.currentTarget.setPointerCapture === "function") event.currentTarget.setPointerCapture(event.pointerId);
  }
  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!dragRef.current || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect(); const next = { x: clamp(((event.clientX - rect.left) / rect.width) * 100 - dragRef.current.offsetX), y: clamp(((event.clientY - rect.top) / rect.height) * 100 - dragRef.current.offsetY) };
    dragRef.current.coordinates = data.snapToGrid ? snapCoordinate(next) : next;
    setData((current) => ({ ...current, memories: updateMemoryPosition(current.memories, dragRef.current!.id, data.snapToGrid ? snapCoordinate(next) : next, data.snapToGrid) }));
  }
  function onPointerUp() {
    if (!dragRef.current) return;
    const drag = dragRef.current; const id = drag.id; dragRef.current = null; setDragId(null);
    persistPlacement(id, drag.coordinates, drag.originalCoordinates);
  }
  function startPositionMode() { if (selected) setPositionMode({ id: selected.id, coordinates: activeCoordinates(selected, data.snapToGrid) }); }
  function movePosition(deltaX: number, deltaY: number) { if (positionMode) { const factor = data.snapToGrid ? 4 : 1; setPositionMode({ ...positionMode, coordinates: { x: clamp(positionMode.coordinates.x + deltaX * factor), y: clamp(positionMode.coordinates.y + deltaY * factor) } }); } }
  function confirmPosition() {
    if (!positionMode) return;
    const draft = positionMode;
    const current = selected ?? data.memories.find((memory) => memory.id === draft.id);
    if (!current) return;
    const previous = activeCoordinates(current, data.snapToGrid);
    setPositionMode(null);
    setData((current) => ({ ...current, memories: updateMemoryPosition(current.memories, draft.id, draft.coordinates, data.snapToGrid) }));
    persistPlacement(draft.id, draft.coordinates, previous);
  }
  useEffect(() => {
    if (!positionMode) return;
    function onKeyDown(event: KeyboardEvent) {
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) { event.preventDefault(); movePosition(event.key === "ArrowRight" ? 2 : event.key === "ArrowLeft" ? -2 : 0, event.key === "ArrowDown" ? 2 : event.key === "ArrowUp" ? -2 : 0); }
      if (event.key === "Enter") { event.preventDefault(); confirmPosition(); }
      if (event.key === "Escape") { event.preventDefault(); setPositionMode(null); }
    }
    window.addEventListener("keydown", onKeyDown); return () => window.removeEventListener("keydown", onKeyDown);
  }, [positionMode]);

  return <div className="min-h-screen wood-grain wall-shadow">
    <header className="flex min-h-[72px] items-center justify-between border-b border-[#4f453f]/60 bg-[#13140d]/90 px-5 py-4 md:px-10">
      <div className="flex items-center gap-3"><div aria-hidden="true" className="grid h-9 w-9 place-items-center rounded-sm border border-[#e9c349]/60 text-lg text-[#e9c349]">✦</div><div><p className="font-archive text-[10px] uppercase tracking-[.22em] text-[#e9c349]">Lignum Archive</p><h1 className="font-editorial text-xl text-[#e4e3d7]">Memories Wall</h1></div></div>
      <div className="flex items-center gap-3"><span className="desktop-only font-archive text-[10px] uppercase tracking-widest text-[#a8a79b]">Demo desk · local only</span><button type="button" onClick={openComposer} className="rounded-lg border border-[#e9c349] bg-[#2c1b0e] px-4 py-2 text-sm font-semibold text-[#f5d97e] transition hover:bg-[#45301b]" aria-label="Start a Memory"><span aria-hidden="true">＋</span> Start a Memory</button></div>
    </header>
    <div className="mx-auto grid max-w-[1600px] grid-cols-1 md:grid-cols-[220px_minmax(0,1fr)_300px]">
      <aside className="border-b border-[#4f453f]/60 bg-[#1b1c15]/70 p-4 md:min-h-[calc(100vh-72px)] md:border-r md:border-b-0 md:p-6">
        <p className="font-archive mb-3 text-[10px] uppercase tracking-[.18em] text-[#a8a79b]">Archive</p>
        <nav aria-label="Main navigation" className="space-y-1"><button type="button" onClick={() => setView("wall")} className={`w-full rounded-md px-3 py-2.5 text-left text-sm ${view === "wall" ? "bg-[#34352e] text-[#f5d97e]" : "text-[#d2c4bb] hover:bg-[#292b23]"}`}><span aria-hidden="true" className="mr-3">▦</span>Wall</button><button type="button" onClick={() => setView("mine")} className={`w-full rounded-md px-3 py-2.5 text-left text-sm ${view === "mine" ? "bg-[#34352e] text-[#f5d97e]" : "text-[#d2c4bb] hover:bg-[#292b23]"}`}><span aria-hidden="true" className="mr-3">☷</span>My Memories <span className="float-right rounded-full bg-[#292b23] px-2 text-xs">{data.memories.length}</span></button></nav>
        <div className="mt-8"><p className="font-archive mb-3 text-[10px] uppercase tracking-[.18em] text-[#a8a79b]">By feeling</p><div className="space-y-1"><button type="button" onClick={() => setCategory("all")} className={`w-full rounded-md px-3 py-2 text-left text-sm ${category === "all" ? "bg-[#292b23] text-[#f5d97e]" : "text-[#d2c4bb] hover:bg-[#292b23]"}`}>All memories</button>{MEMORY_CATEGORIES.map((item) => <button type="button" key={item} onClick={() => setCategory(item)} className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm ${category === item ? "bg-[#292b23] text-[#f5d97e]" : "text-[#d2c4bb] hover:bg-[#292b23]"}`}><span aria-hidden="true" className="grid h-5 w-5 place-items-center rounded-full text-xs" style={{ backgroundColor: categoryMeta[item].color, color: "#171812" }}>{categoryMeta[item].icon}</span>{categoryMeta[item].label}</button>)}</div></div>
        <div className="mt-8 hidden rounded-md border border-[#4f453f] bg-[#13140d]/50 p-3 md:block"><p className="font-archive text-[9px] uppercase tracking-widest text-[#a8a79b]">Private by default</p><p className="mt-2 text-xs leading-5 text-[#d2c4bb]">Private-by-default demo account. Authentication is intentionally not connected yet.</p></div>
      </aside>
      <main className="min-w-0 p-4 md:p-8">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-4"><div><p className="font-archive text-[10px] uppercase tracking-[.2em] text-[#e9c349]">{view === "mine" ? "My archive" : "Personal wall"}</p><h2 className="font-editorial mt-1 text-3xl text-[#e4e3d7]">{isEmpty ? "A place for what matters" : view === "mine" ? "Everything you have kept" : "Small moments, kept close"}</h2>{!isEmpty && <p className="mt-1 text-sm text-[#a8a79b]">{visibleMemories.length} {visibleMemories.length === 1 ? "memory" : "memories"}{category !== "all" ? ` · ${categoryMeta[category].label}` : ""}</p>}</div><label className={`flex items-center gap-3 rounded-lg ${isEmpty ? "cursor-not-allowed opacity-60" : "cursor-pointer"} border border-[#4f453f] bg-[#1b1c15] px-3 py-2 text-sm text-[#d2c4bb] has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-[#e9c349]`}><span className="relative"><input type="checkbox" checked={data.snapToGrid} onChange={toggleSnap} disabled={busy || isEmpty} className="peer sr-only"/><span aria-hidden="true" className="block h-5 w-9 rounded-full bg-[#4f453f] after:absolute after:left-1 after:top-1 after:h-3 after:w-3 after:rounded-full after:bg-[#d2c4bb] after:transition peer-checked:bg-[#a18428] peer-checked:after:translate-x-4 peer-checked:after:bg-[#fff3bd]" /></span><span>Snap to Grid</span></label></div>
        {notice && <div role="status" className={`mb-4 rounded-md border px-4 py-3 text-sm ${notice.kind === "success" ? "border-[#6b855c] bg-[#1c281c] text-[#cfe4c4]" : "border-[#b56e6e] bg-[#321b1c] text-[#ffd4cf]"}`}>{notice.text}</div>}
        {isEmpty ? <section className="grid min-h-[54vh] place-items-center rounded-lg border border-dashed border-[#806e58] bg-[#1b1c15]/60 p-8 text-center"><div className="max-w-md"><div aria-hidden="true" className="mx-auto mb-5 grid h-16 w-16 rotate-[-4deg] place-items-center border border-[#c6a85c] bg-[#f4ebd0] text-3xl text-[#8a6d1e] shadow-[5px_8px_0_#0b0c08]">✦</div><h3 className="font-editorial text-3xl text-[#e4e3d7]">Your wall is waiting</h3><p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-[#a8a79b]">Capture a moment worth remembering. It will stay private, ready for you to revisit whenever you need it.</p><button type="button" onClick={openComposer} className="mt-7 rounded-lg bg-[#e9c349] px-6 py-3 font-semibold text-[#3c2f00] shadow-[0_3px_0_#806e21] transition hover:bg-[#f5d97e]">Start a Memory <span aria-hidden="true">→</span></button></div></section> : <section ref={canvasRef} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} aria-label="Memory wall" className={`wall-canvas relative min-h-[620px] overflow-hidden rounded-lg border border-[#665440] bg-[#292116]/45 p-3 shadow-[inset_0_0_40px_rgba(0,0,0,.3)] ${view === "mine" ? "" : ""}`}>
          <div className="pointer-events-none absolute left-5 top-4 font-archive text-[9px] uppercase tracking-[.18em] text-[#b6a88d]">{data.snapToGrid ? "Aligned desk · snapped positions" : "Open desk · drag to arrange"}</div>
          <div className="pointer-events-none absolute inset-0 opacity-20" style={{ backgroundImage: "linear-gradient(#bda37a22 1px, transparent 1px), linear-gradient(90deg, #bda37a22 1px, transparent 1px)", backgroundSize: "8% 10%" }} />
          {visibleMemories.map((memory, index) => <MemoryCard key={memory.id} memory={memory} selected={memory.id === selectedId} dragging={memory.id === dragId} index={index} snapToGrid={data.snapToGrid} onSelect={() => selectMemory(memory)} onPointerDown={(event) => onPointerDown(event, memory)} positionOverride={positionMode?.id === memory.id ? positionMode.coordinates : undefined} />)}
          {!visibleMemories.length && <div className="relative z-10 grid min-h-[580px] place-items-center text-center"><div><p className="font-editorial text-2xl text-[#e4e3d7]">Nothing in this section yet.</p><button type="button" onClick={() => setCategory("all")} className="mt-3 text-sm text-[#f5d97e] underline underline-offset-4">Show all memories</button></div></div>}
        </section>}
        <p className="mobile-only mt-3 text-center text-xs text-[#a8a79b]">Cards become a readable stack on small screens. Select one to view its details.</p>
      </main>
      <DetailsPanel selected={selected} editing={editing} editForm={editForm} setEditForm={setEditForm} busy={busy} positionMode={positionMode} onStartPosition={startPositionMode} onMovePosition={movePosition} onConfirmPosition={confirmPosition} onCancelPosition={() => setPositionMode(null)} onEdit={beginEdit} onSaveEdit={saveEdit} onCancelEdit={() => setEditing(false)} onDelete={() => setConfirmDelete(true)} />
    </div>
    {composerOpen && <Composer titleRef={composerTitleRef} form={form} setForm={setForm} busy={busy} notice={notice} onSubmit={onCreate} onClose={closeComposer} />}
    {confirmDelete && selected && <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" role="presentation"><section role="alertdialog" aria-modal="true" aria-labelledby="delete-title" className="w-full max-w-md rounded-lg border border-[#806e58] bg-[#1b1c15] p-6 shadow-2xl"><p className="font-archive text-[10px] uppercase tracking-widest text-[#b56e6e]">Permanent action</p><h2 id="delete-title" className="font-editorial mt-2 text-2xl text-[#e4e3d7]">Delete this memory?</h2><p className="mt-3 text-sm leading-6 text-[#d2c4bb]">“{selected.title}” will be removed from your wall. This cannot be undone.</p><div className="mt-6 flex justify-end gap-3"><button type="button" onClick={() => setConfirmDelete(false)} className="rounded-lg border border-[#665c50] px-4 py-2 text-sm text-[#d2c4bb]">Keep it</button><button type="button" onClick={deleteSelected} disabled={busy} className="rounded-lg bg-[#b56e6e] px-4 py-2 text-sm font-semibold text-[#321b1c]">{busy ? "Deleting…" : "Delete memory"}</button></div></section></div>}
    <div aria-live="polite" aria-atomic="true" className="sr-only">{positionMode ? `Position mode. ${Math.round(positionMode.coordinates.x)} percent across, ${Math.round(positionMode.coordinates.y)} percent down. Use arrow controls, then confirm or cancel.` : notice?.text ?? (selected ? `Selected memory: ${selected.title}` : "")}</div>
  </div>;
}

function MemoryCard({ memory, selected, dragging, snapToGrid, index, positionOverride, onSelect, onPointerDown }: { memory: Memory; selected: boolean; dragging: boolean; snapToGrid: boolean; index: number; positionOverride?: Coordinate; onSelect: () => void; onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void }) {
  const meta = categoryMeta[memory.category]; const placement = memory.placements.personal; const coordinates = positionOverride ?? activeCoordinates(memory, snapToGrid); const rotation = placement?.rotation ?? (index % 3 - 1) * 1.2;
  return <article role="button" tabIndex={0} aria-label={`${memory.title}, ${meta.label} memory`} aria-pressed={selected} onClick={onSelect} onPointerDown={onPointerDown} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect(); } }} className={`wall-card paper-grain card-shadow absolute z-10 w-[min(245px,38%)] select-none rounded-sm border-t-[5px] p-5 text-[#303129] transition-transform duration-200 hover:z-20 ${selected ? "card-selected z-30 scale-[1.03]" : ""} ${dragging ? "cursor-grabbing scale-[1.03]" : "cursor-grab"}`} style={{ left: `${coordinates.x}%`, top: `${coordinates.y}%`, backgroundColor: meta.surface, borderTopColor: meta.color, transform: `rotate(${rotation}deg)${selected || dragging ? " scale(1.03)" : ""}` }}>
    <div className="mb-4 flex items-start justify-between gap-2"><span className="inline-flex items-center gap-1.5 rounded-full border border-[#303129]/20 px-2 py-1 text-[10px] font-bold uppercase tracking-wide" aria-label={`Category: ${meta.label}`}><span aria-hidden="true">{meta.icon}</span>{meta.label}</span><span aria-hidden="true" className="mt-[-27px] grid h-7 w-7 place-items-center rounded-full text-sm font-bold shadow-md" style={{ backgroundColor: meta.color, color: "#242017" }}>•</span></div><h3 className="font-editorial line-clamp-2 text-xl font-semibold leading-tight">{memory.title}</h3><p className="mt-2 line-clamp-3 text-xs leading-5 text-[#5c554a]">{memory.reflection}</p><div className="mt-5 flex items-center justify-between border-t border-[#303129]/15 pt-3 text-[10px] text-[#7a7469]"><span>{formatDate(memory.createdAt)}</span><span aria-label="Private memory">Private · {memory.visibility}</span></div>
  </article>;
}

function DetailsPanel({ selected, editing, editForm, setEditForm, busy, positionMode, onStartPosition, onMovePosition, onConfirmPosition, onCancelPosition, onEdit, onSaveEdit, onCancelEdit, onDelete }: { selected: Memory | null; editing: boolean; editForm: { title: string; reflection: string; category: MemoryCategory }; setEditForm: (value: { title: string; reflection: string; category: MemoryCategory }) => void; busy: boolean; positionMode: PositionDraft | null; onStartPosition: () => void; onMovePosition: (x: number, y: number) => void; onConfirmPosition: () => void; onCancelPosition: () => void; onEdit: () => void; onSaveEdit: (event: FormEvent<HTMLFormElement>) => void; onCancelEdit: () => void; onDelete: () => void }) {
  return <aside id="memory-details" tabIndex={-1} aria-label="Memory details" className="border-t border-[#4f453f]/60 bg-[#1b1c15] p-5 outline-none md:min-h-[calc(100vh-72px)] md:border-l md:border-t-0 md:p-6"><div className="flex items-center justify-between"><p className="font-archive text-[10px] uppercase tracking-[.18em] text-[#a8a79b]">Details</p>{selected && <span className="rounded-full border border-[#6b855c] px-2 py-1 text-[10px] text-[#b6d0aa]">Private</span>}</div>{!selected ? <div className="mt-16 text-center"><div aria-hidden="true" className="text-4xl text-[#665440]">⌁</div><h2 className="font-editorial mt-4 text-2xl text-[#d2c4bb]">Choose a memory</h2><p className="mt-2 text-sm leading-6 text-[#a8a79b]">Select a card to read its full reflection and manage it.</p></div> : editing ? <form onSubmit={onSaveEdit} className="mt-6 space-y-4"><label className="block text-xs text-[#a8a79b]">Title<input required maxLength={120} value={editForm.title} onChange={(event) => setEditForm({ ...editForm, title: event.target.value })} className="mt-1 w-full border-b border-[#806e58] bg-transparent py-2 text-lg text-[#e4e3d7] outline-none focus:border-[#e9c349]" /></label><label className="block text-xs text-[#a8a79b]">Reflection<textarea required maxLength={5000} rows={8} value={editForm.reflection} onChange={(event) => setEditForm({ ...editForm, reflection: event.target.value })} className="mt-1 w-full resize-y border-b border-[#806e58] bg-transparent py-2 text-sm leading-6 outline-none focus:border-[#e9c349]" /></label><CategorySelect value={editForm.category} onChange={(value) => setEditForm({ ...editForm, category: value })} /><div className="flex gap-2"><button disabled={busy} className="rounded-lg bg-[#e9c349] px-4 py-2 text-sm font-semibold text-[#3c2f00]">{busy ? "Saving…" : "Save changes"}</button><button type="button" onClick={onCancelEdit} className="rounded-lg border border-[#665c50] px-4 py-2 text-sm text-[#d2c4bb]">Cancel</button></div></form> : <div className="mt-6"><div className="mb-5 border-l-4 pl-4" style={{ borderColor: categoryMeta[selected.category].color }}><span className="text-xs font-semibold" style={{ color: categoryMeta[selected.category].color }}>{categoryMeta[selected.category].icon} {categoryMeta[selected.category].label}</span><h2 className="font-editorial mt-2 text-3xl leading-tight text-[#e4e3d7]">{selected.title}</h2></div><p className="whitespace-pre-wrap text-sm leading-7 text-[#d2c4bb]">{selected.reflection}</p><dl className="mt-8 space-y-3 border-t border-[#4f453f] pt-4 text-xs"><div className="flex justify-between gap-3"><dt className="text-[#a8a79b]">Written</dt><dd>{formatDate(selected.createdAt)}</dd></div><div className="flex justify-between gap-3"><dt className="text-[#a8a79b]">Last updated</dt><dd>{formatDate(selected.updatedAt)}</dd></div><div className="flex justify-between gap-3"><dt className="text-[#a8a79b]">Visibility</dt><dd>Private</dd></div></dl><div className="mt-7 space-y-2"><button type="button" onClick={onStartPosition} disabled={Boolean(positionMode)} className="w-full rounded-lg border border-[#806e58] px-3 py-2.5 text-left text-sm text-[#f5d97e] hover:bg-[#292b23]"><span aria-hidden="true" className="mr-2">✥</span> {positionMode ? "Position mode active" : "Arrange this card"}</button>{positionMode && <div className="rounded-md border border-[#806e58] bg-[#292b23] p-3"><p className="text-xs leading-5 text-[#d2c4bb]">Use the arrows to move this card. Confirm to save, or cancel to restore its position.</p><div className="mx-auto mt-3 grid w-28 grid-cols-3 gap-1"><span /><PositionButton label="Move up" symbol="↑" onClick={() => onMovePosition(0, -2)} /><span /><PositionButton label="Move left" symbol="←" onClick={() => onMovePosition(-2, 0)} /><PositionButton label="Move down" symbol="↓" onClick={() => onMovePosition(0, 2)} /><PositionButton label="Move right" symbol="→" onClick={() => onMovePosition(2, 0)} /></div><div className="mt-3 flex gap-2"><button type="button" onClick={onConfirmPosition} className="flex-1 rounded bg-[#e9c349] px-2 py-2 text-xs font-semibold text-[#3c2f00]">Confirm</button><button type="button" onClick={onCancelPosition} className="flex-1 rounded border border-[#665c50] px-2 py-2 text-xs">Cancel</button></div></div>}<div className="flex gap-2"><button type="button" onClick={onEdit} className="flex-1 rounded-lg border border-[#665c50] px-3 py-2 text-sm hover:bg-[#292b23]">Edit</button><button type="button" onClick={onDelete} className="flex-1 rounded-lg border border-[#8c5152] px-3 py-2 text-sm text-[#ffb4ac] hover:bg-[#321b1c]">Delete</button></div></div></div>}</aside>;
}
function PositionButton({ label, symbol, onClick }: { label: string; symbol: string; onClick: () => void }) { return <button type="button" aria-label={label} onClick={onClick} className="grid h-9 place-items-center rounded border border-[#665c50] bg-[#1b1c15] text-lg text-[#f5d97e] hover:bg-[#45301b]">{symbol}</button>; }
function CategorySelect({ value, onChange }: { value: MemoryCategory; onChange: (value: MemoryCategory) => void }) { return <label className="block text-xs text-[#a8a79b]">Category<select value={value} onChange={(event) => onChange(event.target.value as MemoryCategory)} className="mt-1 w-full rounded border border-[#665c50] bg-[#292b23] px-3 py-2.5 text-sm text-[#e4e3d7]">{MEMORY_CATEGORIES.map((item) => <option key={item} value={item}>{categoryMeta[item].icon} {categoryMeta[item].label}</option>)}</select></label>; }
function Composer({ titleRef, form, setForm, busy, notice, onSubmit, onClose }: { titleRef: RefObject<HTMLInputElement | null>; form: FormValues; setForm: (value: FormValues) => void; busy: boolean; notice: { kind: "success" | "error"; text: string } | null; onSubmit: (event: FormEvent<HTMLFormElement>) => void; onClose: () => void }) { return <div className="fixed inset-0 z-40 overflow-y-auto bg-black/70 p-4" role="dialog" aria-modal="true" aria-labelledby="create-memory-title"><div className="mx-auto my-8 w-full max-w-2xl rounded-lg border border-[#806e58] bg-[#1b1c15] shadow-2xl"><div className="flex items-start justify-between border-b border-[#4f453f] p-6"><div><p className="font-archive text-[10px] uppercase tracking-widest text-[#e9c349]">New entry</p><h2 id="create-memory-title" className="font-editorial mt-1 text-3xl text-[#e4e3d7]">Keep a moment</h2><p className="mt-1 text-sm text-[#a8a79b]">A few honest lines are enough.</p></div><button type="button" aria-label="Close create memory form" onClick={onClose} className="rounded p-2 text-xl text-[#a8a79b] hover:bg-[#292b23]">×</button></div><form onSubmit={onSubmit} className="space-y-5 p-6"><label className="block text-sm text-[#d2c4bb]">Title<span className="ml-1 text-[#e9c349]">*</span><input ref={titleRef} name="title" required maxLength={120} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="The thing I want to remember" className="mt-2 w-full border-b border-[#806e58] bg-transparent px-0 py-3 text-xl text-[#e4e3d7] outline-none focus:border-[#e9c349]" /></label><label className="block text-sm text-[#d2c4bb]">Reflection<span className="ml-1 text-[#e9c349]">*</span><textarea name="reflection" required maxLength={5000} rows={7} value={form.reflection} onChange={(event) => setForm({ ...form, reflection: event.target.value })} placeholder="What happened? How did it feel?" className="mt-2 w-full resize-y border-b border-[#806e58] bg-transparent px-0 py-3 text-base leading-7 text-[#e4e3d7] outline-none focus:border-[#e9c349]" /></label><div className="grid gap-5 sm:grid-cols-2"><CategorySelect value={form.category} onChange={(value) => setForm({ ...form, category: value })} /><div><p className="text-xs text-[#a8a79b]">Visibility</p><div className="mt-1 flex items-center gap-2 rounded border border-[#665c50] bg-[#292b23] px-3 py-2.5 text-sm text-[#d2c4bb]"><span aria-hidden="true">▣</span><span>Private</span><span className="ml-auto text-xs text-[#8d8c81]">Locked in Phase 1</span></div><input type="hidden" name="category" value={form.category} /><input type="hidden" name="visibility" value="private" /></div></div>{notice?.kind === "error" && <p role="alert" className="rounded border border-[#b56e6e] bg-[#321b1c] p-3 text-sm text-[#ffd4cf]">{notice.text}</p>}<div className="flex justify-end gap-3 border-t border-[#4f453f] pt-5"><button type="button" onClick={onClose} className="rounded-lg border border-[#665c50] px-4 py-2.5 text-sm text-[#d2c4bb]">Cancel</button><button disabled={busy} className="rounded-lg bg-[#e9c349] px-5 py-2.5 text-sm font-semibold text-[#3c2f00]">{busy ? "Saving…" : "Save to wall"}</button></div></form></div></div>; }
