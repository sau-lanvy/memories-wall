"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import { categoryMeta, MEMORY_CATEGORIES, wallDataSchema, type Coordinate, type Memory, type MemoryCategory, type MemorySizePreset, type WallTemplate } from "@/domain/memory";
import { createCommentAction, createMemoryAction, createReactionAction, createReportAction, deleteCommentAction, deleteMemoryAction, getActivityAction, getAllMemoriesAction, getCommunityDataAction, getPublicDiscoveryAction, getReactionAction, getRecentlyAddedAction, listCommentsAction, moderateCommentAction, removeReactionAction, searchMemoriesAction, searchPublicMemoriesAction, setActivityPreferenceAction, updateMemoryAction, updatePlacementAction, listWallTemplatesAction, applyWallTemplateAction, undoTemplateApplicationAction, type WallData } from "@/server/actions";
import { ThreeWall } from "@/app/three-wall";
import type { ActivityNotification, CommunityMembership, MemoryComment, Visibility } from "@/domain/memory";

const STORAGE_KEY = "memories-wall:demo-user:personal";
const initialForm = { title: "", reflection: "", category: "gratitude" as MemoryCategory, visibility: "private" as Visibility, communityIds: "" };
type FormValues = typeof initialForm;
type View = "wall" | "mine" | "all" | "community" | "recent" | "discovery";
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
  const [surfaceMemories, setSurfaceMemories] = useState<Memory[] | null>(null);
  const [communities, setCommunities] = useState<CommunityMembership[]>([]);
  const [communityId, setCommunityId] = useState("");
  const [search, setSearch] = useState("");
  const [ownershipFilter, setOwnershipFilter] = useState<"all" | "mine" | "shared">("all");
  const [visibilityFilter, setVisibilityFilter] = useState<"all" | Visibility>("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [activity, setActivity] = useState<ActivityNotification[]>([]);
  const [surfaceLoading, setSurfaceLoading] = useState(false);
  const [surfaceError, setSurfaceError] = useState<string | null>(null);
  const [surfaceErrorCode, setSurfaceErrorCode] = useState<"FORBIDDEN" | "UNKNOWN" | null>(null);
  const [surfaceRequestKey, setSurfaceRequestKey] = useState(0);
  const [category, setCategory] = useState<MemoryCategory | "all">("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [form, setForm] = useState<FormValues>(initialForm);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({ title: "", reflection: "", category: "gratitude" as MemoryCategory, visibility: "private" as Visibility, communityIds: [] as string[] });
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [notice, setNotice] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [positionMode, setPositionMode] = useState<PositionDraft | null>(null);
  const [comments, setComments] = useState<MemoryComment[]>([]);
  const [commentDraft, setCommentDraft] = useState("");
  const [commentsBusy, setCommentsBusy] = useState(false);
  const [reacted, setReacted] = useState(false);
  const [reactionBusy, setReactionBusy] = useState(false);
  const [reportReason, setReportReason] = useState<"harmful" | "harassment" | "privacy" | "spam" | "other">("other");
  const [activityEnabled, setActivityEnabled] = useState(true);
  const [dragId, setDragId] = useState<string | null>(null);
  const [templates, setTemplates] = useState<WallTemplate[]>([]);
  const [templateId, setTemplateId] = useState("");
  const [templateRevision, setTemplateRevision] = useState(0);
  const [templatePreview, setTemplatePreview] = useState(false);
  const canvasRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const selectedIdRef = useRef<string | null>(null);
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

  const displayedMemories = surfaceMemories ?? data.memories;
  const selected = displayedMemories.find((memory) => memory.id === selectedId) ?? null;
  const visibleMemories = useMemo(() => displayedMemories.filter((memory) => (category === "all" || memory.category === category) && (ownershipFilter === "all" || ownershipFilter === "mine" ? memory.authorId === "demo-user" : memory.authorId !== "demo-user") && (visibilityFilter === "all" || memory.visibility === visibilityFilter) && (!fromDate || memory.createdAt.slice(0, 10) >= fromDate) && (!toDate || memory.createdAt.slice(0, 10) <= toDate)), [displayedMemories, category, ownershipFilter, visibilityFilter, fromDate, toDate]);
  const isEmpty = displayedMemories.length === 0;
  const isOwnedView = view === "wall" || view === "mine";
  const selectedIsOwned = selected?.authorId === "demo-user";
  selectedIdRef.current = selectedId;

  useEffect(() => {
    if (isOwnedView) { setSurfaceMemories(null); setSurfaceError(null); setSurfaceErrorCode(null); return; }
    setSurfaceLoading(true); setSurfaceError(null); setSurfaceErrorCode(null);
    void (async () => {
      if (view === "community") {
        const result = await getCommunityDataAction(communityId || undefined);
        if (!result.ok) { setSurfaceError(result.error); setSurfaceErrorCode(result.code === "FORBIDDEN" ? "FORBIDDEN" : "UNKNOWN"); return; }
        setSurfaceMemories(result.data.memories); setCommunities(result.data.communities); return;
      }
      const result = view === "discovery" ? await getPublicDiscoveryAction() : view === "all" ? await getAllMemoriesAction() : await getRecentlyAddedAction();
      if (!result.ok) { setSurfaceError(result.error); setSurfaceErrorCode(result.code === "FORBIDDEN" ? "FORBIDDEN" : "UNKNOWN"); return; }
      setSurfaceMemories(result.data);
    })().catch(() => { setSurfaceError("This surface could not be loaded. Please try again."); setSurfaceErrorCode("UNKNOWN"); }).finally(() => setSurfaceLoading(false));
  }, [view, communityId, isOwnedView, surfaceRequestKey]);

  useEffect(() => {
    if (!selected || selected.visibility === "private") { setComments([]); setReacted(false); return; }
    if (selected.visibility === "selected-community") {
      void listCommentsAction(selected.id).then((result) => { if (result.ok) setComments(result.data); else setNotice({ kind: "error", text: result.error }); }).catch(() => setNotice({ kind: "error", text: "Responses could not be loaded. Please try again." }));
    } else setComments([]);
    const memoryId = selected.id;
    void getReactionAction(memoryId).then((result) => { if (selectedIdRef.current !== memoryId) return; if (result.ok) setReacted(result.data.reacted); else setNotice({ kind: "error", text: result.error }); }).catch(() => { if (selectedIdRef.current === memoryId) setNotice({ kind: "error", text: "Reaction status could not be loaded. Please try again." }); });
  }, [selected?.id, selected?.visibility]);

  useEffect(() => {
    if (typeof listWallTemplatesAction !== "function") return;
    void listWallTemplatesAction().then((result) => { if (result.ok) setTemplates(result.data); });
  }, []);

  useEffect(() => {
    if (view !== "mine") return;
    void getActivityAction().then((result) => { if (result.ok) setActivity(result.data); });
  }, [view]);

  function selectMemory(memory: Memory) {
    setSelectedId(memory.id); setEditing(false); setPositionMode(null);
    window.setTimeout(() => document.getElementById("memory-details")?.focus(), 0);
  }
  function openComposer() {
    composerReturnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setForm(initialForm); setNotice(null); setComposerOpen(true);
    if (!communities.length) void getCommunityDataAction().then((result) => { if (result.ok) setCommunities(result.data.communities); else setNotice({ kind: "error", text: result.error }); }).catch(() => setNotice({ kind: "error", text: "Communities could not be loaded. You can still keep this memory private." }));
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
    setEditForm({ title: selected.title, reflection: selected.reflection, category: selected.category, visibility: selected.visibility, communityIds: selected.communityIds }); setEditing(true); setNotice(null);
    if (!communities.length) void getCommunityDataAction().then((result) => { if (result.ok) setCommunities(result.data.communities); else setNotice({ kind: "error", text: result.error }); }).catch(() => setNotice({ kind: "error", text: "Communities could not be loaded. You can still keep this memory private." }));
  }
  function saveEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!selected) return; setBusy(true); setNotice(null);
    void updateMemoryAction(selected.id, editForm).then((result) => {
      if (!result.ok) { setNotice({ kind: "error", text: result.error }); setBusy(false); return; }
      setData((current) => ({ ...current, memories: current.memories.map((memory) => memory.id === result.data.id ? result.data : memory) }));
      setSurfaceMemories((current) => current ? (result.data.visibility === "public-discovery" ? current.map((memory) => memory.id === result.data.id ? result.data : memory) : current.filter((memory) => memory.id !== result.data.id)) : current);
      setEditing(false); setNotice({ kind: "success", text: "Memory updated." }); setBusy(false);
    }).catch(() => { setNotice({ kind: "error", text: "The update could not be saved. Please try again." }); setBusy(false); });
  }
  function submitComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!selected || !commentDraft.trim()) return;
    setCommentsBusy(true);
    void createCommentAction({ memoryId: selected.id, body: commentDraft }).then((result) => {
      if (!result.ok) { setNotice({ kind: "error", text: result.error }); return; }
      setComments((current) => [...current, result.data]); setCommentDraft(""); setNotice({ kind: "success", text: "Comment shared." });
    }).catch(() => setNotice({ kind: "error", text: "The comment could not be shared. Please try again." })).finally(() => setCommentsBusy(false));
  }
  function removeComment(id: string) {
    setCommentsBusy(true);
    void deleteCommentAction(id).then((result) => {
      if (!result.ok) { setNotice({ kind: "error", text: result.error }); return; }
      setComments((current) => current.filter((comment) => comment.id !== id));
    }).catch(() => setNotice({ kind: "error", text: "The comment could not be deleted. Please try again." })).finally(() => setCommentsBusy(false));
  }
  function moderateCommentFromWall(id: string) {
    setCommentsBusy(true);
    void moderateCommentAction(id).then((result) => {
      if (!result.ok) { setNotice({ kind: "error", text: result.error }); return; }
      setComments((current) => current.filter((comment) => comment.id !== id));
    }).catch(() => setNotice({ kind: "error", text: "The response could not be removed. Please try again." })).finally(() => setCommentsBusy(false));
  }
  function reportContent(targetType: "memory" | "comment", targetId: string) {
    if (!selected) return;
    void createReportAction({ targetType, targetId, reason: reportReason }).then((result) => {
      setNotice(result.ok ? { kind: "success", text: "Report received by the moderation queue." } : { kind: "error", text: result.error });
    }).catch(() => setNotice({ kind: "error", text: "The report could not be submitted. Please try again." }));
  }
  function toggleReaction() {
    if (!selected || selected.visibility === "private") return;
    setReactionBusy(true);
    const operation = reacted ? removeReactionAction(selected.id) : createReactionAction({ memoryId: selected.id });
    const memoryId = selected.id;
    void operation.then((result) => {
      if (selectedIdRef.current !== memoryId) return;
      if (!result.ok) { setNotice({ kind: "error", text: result.error }); return; }
      setReacted(!reacted);
      setNotice({ kind: "success", text: reacted ? "Reaction removed." : "Reaction shared." });
    }).catch(() => setNotice({ kind: "error", text: "The reaction could not be saved. Please try again." })).finally(() => setReactionBusy(false));
  }
  function toggleActivity() {
    const next = !activityEnabled;
    void setActivityPreferenceAction(next).then((result) => { if (result.ok) setActivityEnabled(next); else setNotice({ kind: "error", text: result.error }); }).catch(() => setNotice({ kind: "error", text: "Notification preferences could not be saved." }));
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
  function changeSize(sizePreset: MemorySizePreset) {
    if (!selected || !selectedIsOwned) return;
    const previous = selected.placements.personal?.sizePreset;
    setData((current) => ({ ...current, memories: current.memories.map((memory) => memory.id === selected.id ? { ...memory, placements: { ...memory.placements, personal: { ...memory.placements.personal, sizePreset } } } : memory) }));
    setBusy(true);
    void updatePlacementAction({ memoryId: selected.id, sizePreset }).then((result) => {
      if (result.ok) { setData(result.data); setNotice({ kind: "success", text: `Card size changed to .` }); }
      else { setData((current) => ({ ...current, memories: current.memories.map((memory) => memory.id === selected.id ? { ...memory, placements: { ...memory.placements, personal: { ...memory.placements.personal, sizePreset: previous } } } : memory) })); setNotice({ kind: "error", text: result.error }); }
    }).catch(() => setNotice({ kind: "error", text: "The card size could not be saved. Please try again." })).finally(() => setBusy(false));
  }

  function applyTemplate() {
    if (!templateId) return;
    setBusy(true); setNotice(null);
    void applyWallTemplateAction({ templateId, expectedRevision: templateRevision }).then((result) => {
      if (!result.ok) { setNotice({ kind: "error", text: result.error }); return; }
      setData((current) => ({ ...current, memories: current.memories.map((memory) => result.data.memories.find((item) => item.id === memory.id) ?? memory) }));
      setTemplateRevision(result.data.revision); setTemplatePreview(false); setNotice({ kind: "success", text: `${result.data.template.name} applied. You can undo this arrangement.` });
    }).catch(() => setNotice({ kind: "error", text: "The template could not be applied. Please try again." })).finally(() => setBusy(false));
  }
  function undoTemplate() {
    setBusy(true);
    void undoTemplateApplicationAction(templateRevision).then((result) => {
      if (!result.ok) { setNotice({ kind: "error", text: result.error }); return; }
      setData((current) => ({ ...current, memories: current.memories.map((memory) => result.data.memories.find((item) => item.id === memory.id) ?? memory) })); setTemplateRevision(result.data.revision); setNotice({ kind: "success", text: "Previous arrangement restored." });
    }).catch(() => setNotice({ kind: "error", text: "The arrangement could not be restored. Please try again." })).finally(() => setBusy(false));
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

  return <div className="flex h-screen w-screen overflow-hidden bg-[#13140d]">
    <aside className="relative z-40 flex h-full w-64 flex-shrink-0 flex-col overflow-y-auto border-r border-[#e5e1d8] bg-[#f4f1ea] text-[#3a352d]">
      <div className="p-6">
        <h1 className="font-serif-custom text-3xl font-medium leading-tight tracking-tight text-[#3a352d]">Memories<br />Wall <span className="align-top text-xl text-[#c16e54]">•</span></h1>
        <p className="mt-4 text-sm font-medium leading-relaxed text-[#7a7469]">Small memories,<br />lasting change.</p>
      </div>
      <nav aria-label="Main navigation" className="custom-scrollbar flex-1 space-y-1 overflow-y-auto px-3 py-2">
        <div className="mb-8 space-y-1">
          <button type="button" onClick={() => setView("wall")} className={view === "wall" ? "flex w-full items-center gap-3 rounded-xl border border-[#e5e1d8] bg-white px-3 py-2 text-left font-medium text-[#3a352d] shadow-sm" : "flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left font-medium text-[#7a7469] transition-colors hover:bg-[#eae6dd]"}><span aria-hidden="true">▦</span>Wall{view === "wall" && <span aria-hidden="true" className="ml-auto h-1.5 w-1.5 rounded-full bg-[#c16e54]" />}</button>
          <button type="button" onClick={() => setView("mine")} className={view === "mine" ? "flex w-full items-center gap-3 rounded-xl border border-[#e5e1d8] bg-white px-3 py-2 text-left font-medium text-[#3a352d] shadow-sm" : "flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left font-medium text-[#7a7469] transition-colors hover:bg-[#eae6dd]"}><span aria-hidden="true">☷</span>My Memories <span className="ml-auto rounded-full bg-[#eae6dd] px-2 text-xs text-[#5c554a]">{data.memories.length}</span></button>
          <button type="button" onClick={() => setView("all")} className={view === "all" ? "flex w-full items-center gap-3 rounded-xl border border-[#e5e1d8] bg-white px-3 py-2 text-left font-medium text-[#3a352d] shadow-sm" : "flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left font-medium text-[#7a7469] transition-colors hover:bg-[#eae6dd]"}><span aria-hidden="true">◎</span>All Memories</button>
          <button type="button" onClick={() => setView("community")} className={view === "community" ? "flex w-full items-center gap-3 rounded-xl border border-[#e5e1d8] bg-white px-3 py-2 text-left font-medium text-[#3a352d] shadow-sm" : "flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left font-medium text-[#7a7469] transition-colors hover:bg-[#eae6dd]"}><span aria-hidden="true">♧</span>Community</button>
          <button type="button" onClick={() => setView("recent")} className={view === "recent" ? "flex w-full items-center gap-3 rounded-xl border border-[#e5e1d8] bg-white px-3 py-2 text-left font-medium text-[#3a352d] shadow-sm" : "flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left font-medium text-[#7a7469] transition-colors hover:bg-[#eae6dd]"}><span aria-hidden="true">◷</span>Recently Added{activity.length > 0 && <span className="ml-auto rounded-full bg-[#c16e54] px-2 text-xs text-white">{activity.length}</span>}</button>
          <button type="button" onClick={() => setView("discovery")} className={view === "discovery" ? "flex w-full items-center gap-3 rounded-xl border border-[#e5e1d8] bg-white px-3 py-2 text-left font-medium text-[#3a352d] shadow-sm" : "flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left font-medium text-[#7a7469] transition-colors hover:bg-[#eae6dd]"}><span aria-hidden="true">✧</span>Public discovery</button>
        </div>
        <div>
          <h3 className="mb-2 px-3 text-xs font-bold uppercase tracking-wider text-[#a49e92]">Explore</h3>
          <div className="space-y-0.5">
            <button type="button" onClick={() => setCategory("all")} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm font-medium transition-colors ${category === "all" ? "bg-[#eae6dd] text-[#3a352d]" : "text-[#5c554a] hover:bg-[#eae6dd]"}`}>All memories</button>
            {MEMORY_CATEGORIES.map((item) => <button type="button" key={item} onClick={() => setCategory(item)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm font-medium transition-colors ${category === item ? "bg-[#eae6dd] text-[#3a352d]" : "text-[#5c554a] hover:bg-[#eae6dd]"}`}><span aria-hidden="true" className="grid h-5 w-5 place-items-center rounded-full text-xs" style={{ backgroundColor: categoryMeta[item].color, color: "#2b2416" }}>{categoryMeta[item].icon}</span>{categoryMeta[item].label}</button>)}
          </div>
        </div>
      </nav>
      <div className="mt-auto p-6">
        <p className="font-serif-custom mb-2 text-xl leading-none text-[#c16e54]">&ldquo;</p>
        <p className="pr-4 text-xs font-medium italic leading-relaxed text-[#7a7469]">The future you is shaped by the memories you keep today.</p>
        <div className="mt-4 rounded-lg border border-[#e5e1d8] bg-white/70 p-3"><p className="text-[9px] font-bold uppercase tracking-widest text-[#a49e92]">Private by default</p><p className="mt-2 text-xs leading-5 text-[#7a7469]">Private-by-default demo account. Authentication is intentionally not connected yet.</p><label className="mt-3 flex items-center gap-2 text-xs text-[#5c554a]"><input type="checkbox" checked={activityEnabled} onChange={toggleActivity} /> Notify me about comments</label></div>
      </div>
    </aside>
    <main className="relative flex flex-1 flex-col overflow-hidden bg-textured-wall text-[#3a352d]">
      <header className="relative z-30 flex items-start justify-between gap-4 p-8 pb-4">
        <div>
          <h2 className="font-serif-custom text-4xl font-medium tracking-tight text-[#3a352d]">Pin your intention.</h2>
          <p className="mt-2 font-medium text-[#7a7469]">Place a memory. Read community memories.</p>
        </div>
        <div className="flex items-center gap-4">
          <label className={`flex items-center gap-2 ${isEmpty ? "cursor-not-allowed opacity-60" : "cursor-pointer"} mr-2`}><span className="text-[10px] font-bold uppercase tracking-widest text-[#a49e92]">Snap</span><span className="relative"><input type="checkbox" checked={data.snapToGrid} onChange={toggleSnap} disabled={busy || isEmpty || !isOwnedView} className="peer sr-only" /><span aria-hidden="true" className="block h-5 w-10 rounded-full bg-[#e5e1d8] transition-colors after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:shadow-sm after:transition-transform peer-checked:bg-[#c16e54] peer-checked:after:translate-x-5" /></span></label>
          <button type="button" onClick={openComposer} className="rounded-full bg-[#262421] px-4 py-2 text-sm font-medium text-[#f4f1ea] shadow-sm transition hover:bg-[#1a1816]" aria-label="Start a Memory"><span aria-hidden="true">＋</span> Start a Memory</button>
          <button type="button" className="grid h-10 w-10 place-items-center rounded-full border border-[#e5e1d8] bg-white/80 text-[#826e5e] shadow-sm">D</button>
        </div>
      </header>
      <div className="relative z-30 mx-8 mb-4 flex flex-wrap items-end justify-between gap-4"><div><p className="text-[10px] font-bold uppercase tracking-[.2em] text-[#c16e54]">{view === "mine" ? "My archive" : view === "community" ? "Shared circles" : view === "all" ? "Authorized archive" : view === "recent" ? "Freshly shared" : view === "discovery" ? "Open archive" : "Personal wall"}</p><h3 className="font-serif-custom mt-1 text-2xl text-[#3a352d]">{isEmpty ? "A place for what matters" : view === "mine" ? "Everything you have kept" : view === "community" ? "A wider circle, thoughtfully" : view === "all" ? "Everything you can see" : view === "recent" ? "Recently added memories" : view === "discovery" ? "Public, thoughtfully shared" : "Small moments, kept close"}</h3>{!isEmpty && <p className="mt-1 text-sm text-[#a49e92]">{visibleMemories.length} {visibleMemories.length === 1 ? "memory" : "memories"}{category !== "all" ? ` · ${categoryMeta[category].label}` : ""}</p>}</div></div>
        <div className="relative z-30 mx-8 mb-4 flex flex-wrap items-center gap-3">
          {(view === "all" || view === "discovery") && <form className="relative" onSubmit={(event) => { event.preventDefault(); if (!search.trim()) return; setSurfaceLoading(true); setSurfaceError(null); const searchRequest = view === "discovery" ? searchPublicMemoriesAction(search) : searchMemoriesAction(search); void searchRequest.then((result) => { if (result.ok) setSurfaceMemories(result.data); else { setSurfaceError(result.error); setSurfaceErrorCode(result.code === "FORBIDDEN" ? "FORBIDDEN" : "UNKNOWN"); } }).catch(() => { setSurfaceError("This search could not be completed. Please try again."); setSurfaceErrorCode("UNKNOWN"); }).finally(() => setSurfaceLoading(false)); }}><input aria-label="Search memories" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={view === "discovery" ? "Search public memories" : "Search your authorized memories"} className="w-72 rounded-full border border-[#e5e1d8] bg-white/80 px-4 py-2 text-sm text-[#5c554a] shadow-sm placeholder-[#a49e92] backdrop-blur-sm focus:outline-none focus:ring-2 focus:ring-[#c16e54]/50" /><button className="ml-2 rounded-full border border-[#e5e1d8] bg-white px-4 py-2 text-sm text-[#5c554a] shadow-sm hover:bg-[#f4f1ea]">Search</button></form>}
          {view === "community" && communities.length > 0 && <label className="rounded-full border border-[#e5e1d8] bg-white/80 px-4 py-2 text-sm text-[#5c554a] shadow-sm">Community<select value={communityId} onChange={(event) => setCommunityId(event.target.value)} className="ml-2 rounded-full border border-[#e5e1d8] bg-white px-3 py-1 text-sm"><option value="">All communities</option>{communities.map((community) => <option key={community.communityId} value={community.communityId}>{community.name}</option>)}</select></label>}
          <div className="flex flex-wrap items-center gap-2 rounded-full border border-[#e5e1d8] bg-white/80 px-4 py-2 text-sm shadow-sm"><span className="text-[10px] font-bold uppercase tracking-widest text-[#a49e92]">Template</span><select aria-label="Wall template" value={templateId} onChange={(event) => { setTemplateId(event.target.value); setTemplatePreview(Boolean(event.target.value)); }} className="rounded-full border border-[#e5e1d8] bg-white px-2 py-1 text-sm text-[#5c554a]"><option value="">Choose a composition</option>{templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}</select>{templatePreview && templateId && <><button type="button" onClick={() => setTemplatePreview(false)} className="rounded-full border border-[#e5e1d8] px-3 py-1 text-xs text-[#5c554a]">Close preview</button><button type="button" onClick={applyTemplate} disabled={busy} className="rounded-full bg-[#c16e54] px-3 py-1 text-xs font-semibold text-white">Apply template</button></>}{templateRevision > 0 && <button type="button" onClick={undoTemplate} disabled={busy} className="rounded-full border border-[#e5e1d8] px-3 py-1 text-xs text-[#5c554a]">Undo last template</button>}</div>
          <div className="flex flex-wrap gap-2 text-xs text-[#7a7469]"><label className="rounded-full border border-[#e5e1d8] bg-white/80 px-3 py-1.5 shadow-sm">Ownership<select aria-label="Ownership filter" value={ownershipFilter} onChange={(event) => setOwnershipFilter(event.target.value as typeof ownershipFilter)} className="ml-1 rounded border-0 bg-transparent text-[#5c554a]"><option value="all">Everyone</option><option value="mine">Mine</option><option value="shared">Shared</option></select></label><label className="rounded-full border border-[#e5e1d8] bg-white/80 px-3 py-1.5 shadow-sm">Visibility<select aria-label="Visibility filter" value={visibilityFilter} onChange={(event) => setVisibilityFilter(event.target.value as typeof visibilityFilter)} className="ml-1 rounded border-0 bg-transparent text-[#5c554a]"><option value="all">Any</option><option value="private">Private</option><option value="selected-community">Selected community</option><option value="public-discovery">Public discovery</option></select></label><label className="rounded-full border border-[#e5e1d8] bg-white/80 px-3 py-1.5 shadow-sm">From<input aria-label="Filter from date" type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} className="ml-1 rounded border-0 bg-transparent text-[#5c554a]" /></label><label className="rounded-full border border-[#e5e1d8] bg-white/80 px-3 py-1.5 shadow-sm">To<input aria-label="Filter to date" type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} className="ml-1 rounded border-0 bg-transparent text-[#5c554a]" /></label></div>
        </div>
        {notice && <div role="status" className={`relative z-30 mx-8 mb-4 rounded-lg border px-4 py-3 text-sm shadow-sm ${notice.kind === "success" ? "border-[#8ba47d] bg-[#eef4e9] text-[#4a5444]" : "border-[#b56e6e] bg-[#f9e9e7] text-[#6e4e50]"}`}>{notice.text}</div>}
        <div className="relative min-h-0 flex-1 overflow-hidden px-8 pb-6">
        {surfaceLoading && <section role="status" className="grid min-h-[30vh] place-items-center rounded-lg border border-[#e5e1d8] bg-white/60 p-8 text-center text-[#7a7469]">Loading this surface…</section>}
        {surfaceError && !surfaceLoading && <section role="alert" className="grid min-h-[30vh] place-items-center rounded-lg border border-[#b56e6e] bg-[#f9e9e7] p-8 text-center"><div><p className="font-serif-custom text-2xl text-[#6e4e50]">{surfaceErrorCode === "FORBIDDEN" ? "This view is private." : "This surface is unavailable."}</p><p className="mt-2 text-sm text-[#7a7469]">{surfaceError}</p><button type="button" onClick={() => setSurfaceRequestKey((current) => current + 1)} className="mt-4 text-sm text-[#c16e54] underline">Try again</button>{surfaceErrorCode === "FORBIDDEN" && <button type="button" onClick={() => setView("wall")} className="ml-4 mt-4 text-sm text-[#c16e54] underline">Back to your wall</button>}</div></section>}
        {!surfaceLoading && !surfaceError && (isEmpty ? <section className="grid min-h-[54vh] place-items-center rounded-lg border border-dashed border-[#c5c1b7] bg-white/50 p-8 text-center"><div className="max-w-md"><div aria-hidden="true" className="mx-auto mb-5 grid h-16 w-16 rotate-[-4deg] place-items-center rounded-sm border border-[#e5e1d8] bg-[#f4ebd0] text-3xl text-[#a39774] shadow-md">✦</div><h3 className="font-serif-custom text-3xl text-[#3a352d]">{view === "wall" || view === "mine" ? "Your wall is waiting" : view === "discovery" ? "Nothing public here yet" : "Nothing shared here yet"}</h3><p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-[#7a7469]">{view === "wall" || view === "mine" ? "Capture a moment worth remembering. It will stay private, ready for you to revisit whenever you need it." : view === "discovery" ? "Public memories will appear here when someone chooses to share a reflection beyond their communities." : "Shared memories will appear here when a community member chooses to share them."}</p>{(view === "wall" || view === "mine") && <button type="button" onClick={openComposer} className="mt-7 rounded-full bg-[#262421] px-6 py-3 font-medium text-[#f4f1ea] shadow-sm transition hover:bg-[#1a1816]">Start a Memory <span aria-hidden="true">→</span></button>}</div></section> : <section ref={canvasRef} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} aria-label="Memory wall" className="wall-canvas relative h-full min-h-[560px] overflow-hidden">
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-[0.03]" style={{ backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 199px, #000 199px, #000 200px), repeating-linear-gradient(90deg, transparent, transparent 399px, #000 399px, #000 400px)" }} />
          <div className="pointer-events-none absolute left-2 top-2 text-[9px] font-bold uppercase tracking-[.18em] text-[#a49e92]">{data.snapToGrid ? "Aligned desk · snapped positions" : "Open desk · drag to arrange"}</div>
          <ThreeWall memories={visibleMemories} />
          {visibleMemories.map((memory, index) => <MemoryCard key={memory.id} memory={memory} selected={memory.id === selectedId} dragging={memory.id === dragId} index={index} snapToGrid={data.snapToGrid} onSelect={() => selectMemory(memory)} onPointerDown={(event) => onPointerDown(event, memory)} positionOverride={positionMode?.id === memory.id ? positionMode.coordinates : undefined} />)}
          {!visibleMemories.length && <div className="relative z-10 grid min-h-[520px] place-items-center text-center"><div><p className="font-serif-custom text-2xl text-[#3a352d]">Nothing in this section yet.</p><button type="button" onClick={() => setCategory("all")} className="mt-3 text-sm text-[#c16e54] underline underline-offset-4">Show all memories</button></div></div>}
        </section>)}
        </div>
        <p className="mobile-only mt-3 text-center text-xs text-[#a49e92]">Cards become a readable stack on small screens. Select one to view its details.</p>
      </main>
      <DetailsPanel selected={selected} selectedIsOwned={Boolean(selectedIsOwned)} communities={communities} editing={editing} editForm={editForm} setEditForm={setEditForm} busy={busy} positionMode={positionMode} comments={comments} commentDraft={commentDraft} setCommentDraft={setCommentDraft} commentsBusy={commentsBusy} reacted={reacted} reactionBusy={reactionBusy} reportReason={reportReason} setReportReason={setReportReason} onToggleReaction={toggleReaction} onSubmitComment={submitComment} onDeleteComment={removeComment} onModerateComment={moderateCommentFromWall} onReport={(targetType, targetId) => reportContent(targetType, targetId)} onStartPosition={startPositionMode} onMovePosition={movePosition} onConfirmPosition={confirmPosition} onCancelPosition={() => setPositionMode(null)} onEdit={beginEdit} onSaveEdit={saveEdit} onCancelEdit={() => setEditing(false)} onDelete={() => setConfirmDelete(true)} onChangeSize={changeSize} />
    {composerOpen && <Composer titleRef={composerTitleRef} communities={communities} form={form} setForm={setForm} busy={busy} notice={notice} onSubmit={onCreate} onClose={closeComposer} />}
    {confirmDelete && selected && <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" role="presentation"><section role="alertdialog" aria-modal="true" aria-labelledby="delete-title" className="w-full max-w-md rounded-lg border border-[#e5e1d8] bg-[#fdfcfa] p-6 shadow-2xl"><p className="font-archive text-[10px] uppercase tracking-widest text-[#b56e6e]">Permanent action</p><h2 id="delete-title" className="font-serif-custom mt-2 text-2xl text-[#3a352d]">Delete this memory?</h2><p className="mt-3 text-sm leading-6 text-[#7a7469]">“{selected.title}” will be removed from your wall. This cannot be undone.</p><div className="mt-6 flex justify-end gap-3"><button type="button" onClick={() => setConfirmDelete(false)} className="rounded-lg border border-[#e5e1d8] px-4 py-2 text-sm text-[#7a7469]">Keep it</button><button type="button" onClick={deleteSelected} disabled={busy} className="rounded-lg bg-[#b56e6e] px-4 py-2 text-sm font-semibold text-white">{busy ? "Deleting…" : "Delete memory"}</button></div></section></div>}
    <div aria-live="polite" aria-atomic="true" className="sr-only">{positionMode ? `Position mode. ${Math.round(positionMode.coordinates.x)} percent across, ${Math.round(positionMode.coordinates.y)} percent down. Use arrow controls, then confirm or cancel.` : notice?.text ?? (selected ? `Selected memory: ${selected.title}` : "")}</div>
  </div>;
}

function MemoryCard({ memory, selected, dragging, snapToGrid, index, positionOverride, onSelect, onPointerDown }: { memory: Memory; selected: boolean; dragging: boolean; snapToGrid: boolean; index: number; positionOverride?: Coordinate; onSelect: () => void; onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void }) {
  const meta = categoryMeta[memory.category]; const placement = memory.placements.personal; const coordinates = positionOverride ?? activeCoordinates(memory, snapToGrid); const rotation = placement?.rotation ?? (index % 3 - 1) * 1.2;
  return <article role="button" tabIndex={0} aria-label={`${memory.title}, ${meta.label} memory`} aria-pressed={selected} onClick={onSelect} onPointerDown={onPointerDown} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect(); } }} className={`note-card wall-card absolute z-10 w-[min(245px,38%)] select-none p-5 pt-7 text-[#303129] ${selected ? "card-selected z-30" : ""} ${dragging ? "dragging cursor-grabbing" : "cursor-grab"}`} style={{ width: placement?.sizePreset === "small" ? "min(210px, 32%)" : placement?.sizePreset === "large" ? "min(285px, 44%)" : "min(245px, 38%)", left: `${coordinates.x}%`, top: `${coordinates.y}%`, backgroundColor: meta.surface, transform: `rotate(${rotation}deg)`, zIndex: selected || dragging ? 40 : 10 + index }}>
    <span aria-hidden="true" className="note-pin" style={{ background: `radial-gradient(circle at 35% 35%, ${meta.color}, #7f1d1d 70%, #3a352d)`, transform: `translateX(-50%) rotate(${(rotation ?? 0) * 2}deg)` }} />
    <div className="mb-3 flex items-start justify-between gap-2"><span className="inline-flex items-center gap-1.5 rounded-full border border-[#303129]/20 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-[#5c554a]" aria-label={`Category: ${meta.label}`}><span aria-hidden="true">{meta.icon}</span>{meta.label}</span></div><h3 className="font-serif-custom line-clamp-2 text-xl italic leading-tight text-[#3a352d]">{memory.title}</h3><p className="mt-2 line-clamp-3 text-xs leading-5 text-[#5c554a]">{memory.reflection}</p><div className="mt-5 flex items-center justify-between border-t border-[#303129]/15 pt-3 text-[10px] text-[#7a7469]"><span>{memory.authorId === "demo-user" ? "You" : `By ${memory.authorId}`}</span><span aria-label={`${memory.visibility === "private" ? "Private" : memory.visibility === "selected-community" ? "Selected community" : "Public discovery"} memory`}>{memory.visibility === "private" ? "Private" : memory.visibility === "selected-community" ? "Shared with community" : "Public discovery"}</span></div>
  </article>;
}

function DetailsPanel({ selected, selectedIsOwned, communities, editing, editForm, setEditForm, busy, positionMode, comments, commentDraft, setCommentDraft, commentsBusy, reacted, reactionBusy, onToggleReaction, reportReason, setReportReason, onSubmitComment, onDeleteComment, onModerateComment, onReport, onStartPosition, onMovePosition, onConfirmPosition, onCancelPosition, onEdit, onSaveEdit, onCancelEdit, onDelete, onChangeSize }: {
  selected: Memory | null; selectedIsOwned: boolean; editing: boolean;
  communities: CommunityMembership[];
  editForm: { title: string; reflection: string; category: MemoryCategory; visibility: Visibility; communityIds: string[] };
  setEditForm: (value: { title: string; reflection: string; category: MemoryCategory; visibility: Visibility; communityIds: string[] }) => void;
  busy: boolean; positionMode: PositionDraft | null; comments: MemoryComment[]; commentDraft: string; setCommentDraft: (value: string) => void; commentsBusy: boolean;
  reportReason: "harmful" | "harassment" | "privacy" | "spam" | "other"; setReportReason: (value: "harmful" | "harassment" | "privacy" | "spam" | "other") => void;
  reacted: boolean; reactionBusy: boolean; onToggleReaction: () => void;
  onSubmitComment: (event: FormEvent<HTMLFormElement>) => void; onDeleteComment: (id: string) => void; onModerateComment: (id: string) => void; onReport: (targetType: "memory" | "comment", targetId: string) => void;
  onChangeSize: (sizePreset: MemorySizePreset) => void; onStartPosition: () => void; onMovePosition: (x: number, y: number) => void; onConfirmPosition: () => void; onCancelPosition: () => void; onEdit: () => void; onSaveEdit: (event: FormEvent<HTMLFormElement>) => void; onCancelEdit: () => void; onDelete: () => void;
}) {
  return <aside id="memory-details" tabIndex={-1} aria-label="Memory details" className="border-t w-80 flex-shrink-0 border-l border-[#e5e1d8] bg-[#fdfcfa] p-5 text-[#3a352d] outline-none md:m-8 md:ml-0 md:h-[calc(100vh-4rem)] md:overflow-y-auto md:rounded-2xl md:border md:shadow-2xl md:p-6">
    <div className="flex items-center justify-between"><p className="font-archive text-[10px] uppercase tracking-[.18em] text-[#a49e92]">Details</p>{selected && <span className="rounded-full border border-[#8ba47d] px-2 py-1 text-[10px] text-[#4a5444]">{selected.visibility === "private" ? "Private" : selected.visibility === "selected-community" ? "Selected community" : "Public discovery"}</span>}</div>
    {!selected ? <div className="mt-16 text-center"><div aria-hidden="true" className="text-4xl text-[#665440]">⌁</div><h2 className="font-serif-custom mt-4 text-2xl text-[#7a7469]">Choose a memory</h2><p className="mt-2 text-sm leading-6 text-[#a49e92]">Select a card to read its full reflection and manage it.</p></div>
      : editing ? <form onSubmit={onSaveEdit} className="mt-6 space-y-4"><label className="block text-xs text-[#a49e92]">Title<input required maxLength={120} value={editForm.title} onChange={(event) => setEditForm({ ...editForm, title: event.target.value })} className="mt-1 w-full border-b border-[#e5e1d8] bg-transparent py-2 text-lg text-[#3a352d] outline-none focus:border-[#e9c349]" /></label><label className="block text-xs text-[#a49e92]">Reflection<textarea required maxLength={5000} rows={8} value={editForm.reflection} onChange={(event) => setEditForm({ ...editForm, reflection: event.target.value })} className="mt-1 w-full resize-y border-b border-[#e5e1d8] bg-transparent py-2 text-sm leading-6 outline-none" /></label><CategorySelect value={editForm.category} onChange={(value) => setEditForm({ ...editForm, category: value })} /><label className="block text-xs text-[#a49e92]">Visibility      <select value={editForm.visibility} onChange={(event) => { const visibility = event.target.value as Visibility; setEditForm({ ...editForm, visibility, communityIds: visibility === "selected-community" ? editForm.communityIds : [] }); }} className="mt-1 w-full rounded border border-[#e5e1d8] bg-[#f4f1ea] px-3 py-2.5 text-sm"><option value="private">Private</option>      <option value="selected-community">Selected community</option><option value="public-discovery">Public discovery</option></select></label>{editForm.visibility === "selected-community" && <fieldset className="rounded border border-[#e5e1d8] p-3"><legend className="px-1 text-xs text-[#a49e92]">Share with</legend>{communities.length ? communities.map((community) => <label key={community.communityId} className="flex items-center gap-2 py-1 text-sm"><input type="checkbox" checked={editForm.communityIds.includes(community.communityId)} onChange={(event) => setEditForm({ ...editForm, communityIds: event.target.checked ? [...editForm.communityIds, community.communityId] : editForm.communityIds.filter((id) => id !== community.communityId) })} />{community.name}</label>) : <p className="text-xs text-[#a49e92]">You are not a member of a shareable community yet.</p>}</fieldset>}<div className="flex gap-2"><button disabled={busy} className="rounded-lg bg-[#c16e54] px-4 py-2 text-sm font-semibold text-white">{busy ? "Saving…" : "Save changes"}</button><button type="button" onClick={onCancelEdit} className="rounded-lg border border-[#e5e1d8] px-4 py-2 text-sm text-[#7a7469]">Cancel</button></div></form>
      : <div className="mt-6"><div className="mb-5 border-l-4 pl-4" style={{ borderColor: categoryMeta[selected.category].color }}><span className="text-xs font-semibold" style={{ color: categoryMeta[selected.category].color }}>{categoryMeta[selected.category].icon} {categoryMeta[selected.category].label}</span><h2 className="font-serif-custom mt-2 text-3xl leading-tight text-[#3a352d]">{selected.title}</h2></div><p className="whitespace-pre-wrap text-sm leading-7 text-[#7a7469]">{selected.reflection}</p>{selected.image && <p className="mt-4 rounded border border-[#e5e1d8] bg-[#f4f1ea] p-3 text-xs text-[#7a7469]">Image attached · {selected.image.mediaType}</p>}<dl className="mt-8 space-y-3 border-t border-[#e5e1d8] pt-4 text-xs"><div className="flex justify-between gap-3"><dt className="text-[#a49e92]">Written</dt><dd>{formatDate(selected.createdAt)}</dd></div><div className="flex justify-between gap-3"><dt className="text-[#a49e92]">Last updated</dt><dd>{formatDate(selected.updatedAt)}</dd></div><div className="flex justify-between gap-3"><dt className="text-[#a49e92]">Visibility</dt><dd>{selected.visibility === "private" ? "Private" : selected.visibility === "selected-community" ? "Selected community" : "Public discovery"}</dd></div></dl><div className="mt-5 rounded border border-[#e5e1d8] p-3"><label className="text-xs">Card size<select aria-label="Card size" value={selected.placements.personal?.sizePreset ?? "default"} onChange={(event) => onChangeSize(event.target.value as MemorySizePreset)} className="ml-2 rounded bg-[#f4f1ea] px-2 py-1 text-sm"><option value="small">Small</option><option value="default">Default</option><option value="large">Large</option></select></label></div>
        {selected.visibility === "public-discovery" && <section className="mt-7 border-t border-[#e5e1d8] pt-4"><div className="flex items-center justify-between"><h3 className="font-serif-custom text-xl text-[#3a352d]">Public response</h3><button type="button" onClick={() => onReport("memory", selected.id)} className="text-xs text-[#b56e6e] underline underline-offset-4">Report memory</button></div><button type="button" disabled={reactionBusy} onClick={onToggleReaction} aria-pressed={reacted} className="mt-4 rounded-lg border border-[#e5e1d8] px-4 py-2 text-sm text-[#c16e54] hover:bg-[#f4f1ea]">{reacted ? "♥ Reacted" : "♡ React to this memory"}</button><label className="mt-4 block text-xs text-[#a49e92]">Report reason<select aria-label="Report reason" value={reportReason} onChange={(event) => setReportReason(event.target.value as typeof reportReason)} className="ml-2 rounded border border-[#e5e1d8] bg-[#f4f1ea] px-2 py-1 text-xs"><option value="harmful">Harmful content</option><option value="harassment">Harassment</option><option value="privacy">Privacy concern</option><option value="spam">Spam</option><option value="other">Other</option></select></label></section>}
        {selected.visibility === "selected-community" && <section className="mt-7 border-t border-[#e5e1d8] pt-4"><div className="flex items-center justify-between"><h3 className="font-serif-custom text-xl text-[#3a352d]">Responses <span className="font-archive text-xs text-[#a49e92]">{comments.length}</span></h3><button type="button" onClick={() => onReport("memory", selected.id)} className="text-xs text-[#b56e6e] underline underline-offset-4">Report memory</button></div><button type="button" disabled={reactionBusy} onClick={onToggleReaction} aria-pressed={reacted} className="mt-3 rounded-lg border border-[#e5e1d8] px-4 py-2 text-sm text-[#c16e54] hover:bg-[#f4f1ea]">{reacted ? "♥ Reacted" : "♡ React to this memory"}</button><label className="mt-3 block text-xs text-[#a49e92]">Report reason<select aria-label="Report reason" value={reportReason} onChange={(event) => setReportReason(event.target.value as typeof reportReason)} className="ml-2 rounded border border-[#e5e1d8] bg-[#f4f1ea] px-2 py-1 text-xs"><option value="harmful">Harmful content</option><option value="harassment">Harassment</option><option value="privacy">Privacy concern</option><option value="spam">Spam</option><option value="other">Other</option></select></label><div className="mt-3 space-y-3">{comments.map((comment) => <article key={comment.id} className="rounded border border-[#e5e1d8] bg-[#f4f1ea] p-3"><p className="text-sm leading-5 text-[#7a7469]">{comment.body}</p><div className="mt-2 flex justify-between text-[10px] text-[#a49e92]"><span>{formatDate(comment.createdAt)}</span><span className="flex gap-2"><button type="button" onClick={() => onReport("comment", comment.id)} className="underline">Report</button>{comment.authorId === "demo-user" && <button type="button" disabled={commentsBusy} onClick={() => onDeleteComment(comment.id)} className="underline">Delete</button>}{selectedIsOwned && <button type="button" disabled={commentsBusy} onClick={() => onModerateComment(comment.id)} className="text-[#b56e6e] underline">Remove</button>}</span></div></article>)}</div><form onSubmit={onSubmitComment} className="mt-4 flex gap-2"><input aria-label="Write a comment" value={commentDraft} onChange={(event) => setCommentDraft(event.target.value)} placeholder="Offer a thoughtful response" className="min-w-0 flex-1 rounded border border-[#e5e1d8] bg-[#f4f1ea] px-3 py-2 text-sm" /><button disabled={commentsBusy || !commentDraft.trim()} className="rounded bg-[#c16e54] px-3 py-2 text-xs font-semibold text-white">Share</button></form></section>}
        <div className="mt-7 space-y-2">{selectedIsOwned && <><button type="button" onClick={onStartPosition} disabled={Boolean(positionMode)} className="w-full rounded-lg border border-[#e5e1d8] px-3 py-2.5 text-left text-sm text-[#c16e54] hover:bg-[#f4f1ea]"><span aria-hidden="true" className="mr-2">✥</span> {positionMode ? "Position mode active" : "Arrange this card"}</button>{positionMode && <div className="rounded-md border border-[#e5e1d8] bg-[#f4f1ea] p-3"><p className="text-xs leading-5 text-[#7a7469]">Use the arrows to move this card. Confirm to save, or cancel to restore its position.</p><div className="mx-auto mt-3 grid w-28 grid-cols-3 gap-1"><span /><PositionButton label="Move up" symbol="↑" onClick={() => onMovePosition(0, -2)} /><span /><PositionButton label="Move left" symbol="←" onClick={() => onMovePosition(-2, 0)} /><PositionButton label="Move down" symbol="↓" onClick={() => onMovePosition(0, 2)} /><PositionButton label="Move right" symbol="→" onClick={() => onMovePosition(2, 0)} /></div><div className="mt-3 flex gap-2"><button type="button" onClick={onConfirmPosition} className="flex-1 rounded bg-[#c16e54] px-2 py-2 text-xs font-semibold text-white">Confirm</button><button type="button" onClick={onCancelPosition} className="flex-1 rounded border border-[#e5e1d8] px-2 py-2 text-xs">Cancel</button></div></div>}</>}{selectedIsOwned && <div className="flex gap-2"><button type="button" onClick={onEdit} className="flex-1 rounded-lg border border-[#e5e1d8] px-3 py-2 text-sm hover:bg-[#f4f1ea]">Edit</button><button type="button" onClick={onDelete} className="flex-1 rounded-lg border border-[#b56e6e] px-3 py-2 text-sm text-[#b56e6e] hover:bg-[#f9e9e7]">Delete</button></div>}</div>
      </div>}
  </aside>;
}
function PositionButton({ label, symbol, onClick }: { label: string; symbol: string; onClick: () => void }) { return <button type="button" aria-label={label} onClick={onClick} className="grid h-9 place-items-center rounded border border-[#e5e1d8] bg-[#fdfcfa] text-lg text-[#c16e54] hover:bg-[#f4f1ea]">{symbol}</button>; }
function CategorySelect({ value, onChange }: { value: MemoryCategory; onChange: (value: MemoryCategory) => void }) { return <label className="block text-xs text-[#a49e92]">Category<select value={value} onChange={(event) => onChange(event.target.value as MemoryCategory)} className="mt-1 w-full rounded border border-[#e5e1d8] bg-[#f4f1ea] px-3 py-2.5 text-sm text-[#3a352d]">{MEMORY_CATEGORIES.map((item) => <option key={item} value={item}>{categoryMeta[item].icon} {categoryMeta[item].label}</option>)}</select></label>; }
function Composer({ titleRef, communities, form, setForm, busy, notice, onSubmit, onClose }: { titleRef: RefObject<HTMLInputElement | null>; communities: CommunityMembership[]; form: FormValues; setForm: (value: FormValues) => void; busy: boolean; notice: { kind: "success" | "error"; text: string } | null; onSubmit: (event: FormEvent<HTMLFormElement>) => void; onClose: () => void }) {
  return <div className="fixed inset-0 z-40 overflow-y-auto bg-black/70 p-4" role="dialog" aria-modal="true" aria-labelledby="create-memory-title"><div className="mx-auto my-8 w-full max-w-2xl rounded-lg border border-[#e5e1d8] bg-[#fdfcfa] shadow-2xl"><div className="flex items-start justify-between border-b border-[#e5e1d8] p-6"><div><p className="font-archive text-[10px] uppercase tracking-widest text-[#c16e54]">New entry</p><h2 id="create-memory-title" className="font-serif-custom mt-1 text-3xl text-[#3a352d]">Keep a moment</h2><p className="mt-1 text-sm text-[#a49e92]">A few honest lines are enough.</p></div><button type="button" aria-label="Close create memory form" onClick={onClose} className="rounded p-2 text-xl text-[#a49e92] hover:bg-[#f4f1ea]">×</button></div><form onSubmit={onSubmit} className="space-y-5 p-6"><label className="block text-sm text-[#7a7469]">Title<span className="ml-1 text-[#c16e54]">*</span><input ref={titleRef} name="title" required maxLength={120} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="The thing I want to remember" className="mt-2 w-full border-b border-[#e5e1d8] bg-transparent px-0 py-3 text-xl text-[#3a352d] outline-none focus:border-[#c16e54]" /></label><label className="block text-sm text-[#7a7469]">Reflection<span className="ml-1 text-[#c16e54]">*</span><textarea name="reflection" required maxLength={5000} rows={7} value={form.reflection} onChange={(event) => setForm({ ...form, reflection: event.target.value })} placeholder="What happened? How did it feel?" className="mt-2 w-full resize-y border-b border-[#e5e1d8] bg-transparent px-0 py-3 text-base leading-7 text-[#3a352d] outline-none focus:border-[#c16e54]" /></label><label className="block text-xs text-[#a49e92]">Optional image<input name="photo" type="file" accept="image/jpeg,image/png,image/webp" className="mt-2 block w-full text-sm text-[#7a7469]" /><span className="mt-1 block text-[10px]">JPG, PNG, or WebP up to 10 MB.</span></label><div className="grid gap-5 sm:grid-cols-2"><CategorySelect value={form.category} onChange={(value) => setForm({ ...form, category: value })} /><label className="block text-xs text-[#a49e92]">Visibility<select name="visibility" value={form.visibility} onChange={(event) => { const visibility = event.target.value as FormValues["visibility"]; setForm({ ...form, visibility, communityIds: visibility === "selected-community" ? form.communityIds : "" }); }} className="mt-1 w-full rounded border border-[#e5e1d8] bg-[#f4f1ea] px-3 py-2.5 text-sm text-[#3a352d]"><option value="private">Private</option><option value="selected-community" disabled={!communities.length}>Selected community</option><option value="public-discovery">Public discovery</option></select>{form.visibility === "selected-community" && <fieldset className="mt-2 rounded border border-[#e5e1d8] p-2"><legend className="px-1">Share with</legend>{communities.map((community) => <label key={community.communityId} className="flex items-center gap-2 py-1"><input type="checkbox" checked={form.communityIds.split(",").map((id) => id.trim()).includes(community.communityId)} onChange={(event) => { const ids = form.communityIds.split(",").map((id) => id.trim()).filter(Boolean); setForm({ ...form, communityIds: (event.target.checked ? [...ids, community.communityId] : ids.filter((id) => id !== community.communityId)).join(",") }); }} />{community.name}</label>)}</fieldset>}</label><input type="hidden" name="category" value={form.category} /><input type="hidden" name="communityIds" value={form.communityIds} /></div>{notice?.kind === "error" && <p role="alert" className="rounded border border-[#b56e6e] bg-[#f9e9e7] p-3 text-sm text-[#6e4e50]">{notice.text}</p>}<div className="flex justify-end gap-3 border-t border-[#e5e1d8] pt-5"><button type="button" onClick={onClose} className="rounded-lg border border-[#e5e1d8] px-4 py-2.5 text-sm text-[#7a7469]">Cancel</button><button disabled={busy} className="rounded-lg bg-[#c16e54] px-5 py-2.5 text-sm font-semibold text-white">{busy ? "Saving…" : "Save to wall"}</button></div></form></div></div>;
}
