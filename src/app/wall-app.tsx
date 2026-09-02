"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import { categoryMeta, MEMORY_CATEGORIES, type Coordinate, type Memory, type MemoryCategory, type MemorySizePreset, type WallTemplate } from "@/domain/memory";
import { removeMemoryImageAction, createCommentAction, createMemoryAction, createReactionAction, createReportAction, deleteCommentAction, deleteMemoryAction, getActivityAction, getAllMemoriesAction, getCommunityDataAction, getPublicDiscoveryAction, getReactionAction, getRecentlyAddedAction, listCommentsAction, moderateCommentAction, removeReactionAction, searchMemoriesAction, searchPublicMemoriesAction, setActivityPreferenceAction, updateMemoryAction, updatePlacementAction, listWallTemplatesAction, applyWallTemplateAction, undoTemplateApplicationAction, type ActionResult, type WallData } from "@/server/actions";
import type { ActivityNotification, CommunityMembership, MemoryComment, Visibility, MemoryImage } from "@/domain/memory";

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
function commentsActionAvailable() { try { return typeof listCommentsAction === "function"; } catch { return false; } }

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
  const [commentsOffset, setCommentsOffset] = useState(0);
  const [commentsCanLoadMore, setCommentsCanLoadMore] = useState(false);
  const [reacted, setReacted] = useState(false);
  const [reactionBusy, setReactionBusy] = useState(false);
  const [reportReason, setReportReason] = useState<"harmful" | "harassment" | "privacy" | "spam" | "other">("other");
  const [activityEnabled, setActivityEnabled] = useState(true);
  const [dragId, setDragId] = useState<string | null>(null);
  const [templates, setTemplates] = useState<WallTemplate[]>([]);
  const [templateId, setTemplateId] = useState("");
  const [templateRevision, setTemplateRevision] = useState(initialData.templateRevision ?? 0);
  const [templatePreview, setTemplatePreview] = useState(false);
  const [backgroundPreset, setBackgroundPreset] = useState(initialData.backgroundPreset ?? "neutral-texture");
  const [activeTemplateId, setActiveTemplateId] = useState(initialData.templateId);
  const [canUndoTemplate, setCanUndoTemplate] = useState(initialData.canUndoTemplate ?? false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [commentsOpen, setCommentsOpen] = useState(true);
  const [recentOpen, setRecentOpen] = useState(false);
  const canvasRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const selectedIdRef = useRef<string | null>(null);
  const composerTitleRef = useRef<HTMLInputElement>(null);
  const composerReturnFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    // The server snapshot is authoritative. localStorage is only a non-authoritative
    // demo backup and must never replace a fresh server read during hydration.
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
    if (!selected) { setComments([]); setCommentsOffset(0); setCommentsCanLoadMore(false); setReacted(false); return; }
    setCommentsOffset(0); setCommentsCanLoadMore(false);
    if (commentsActionAvailable()) void listCommentsAction(selected.id, 0).then((result) => { if (selectedIdRef.current !== selected.id) return; if (result.ok) { setComments(result.data); setCommentsCanLoadMore(result.data.length === 20); } else setNotice({ kind: "error", text: result.error }); }).catch(() => setNotice({ kind: "error", text: "Comments could not be loaded. Please try again." }));
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
      setComments((current) => current.length < 20 ? [...current, result.data] : current); setCommentsCanLoadMore((current) => current || comments.length >= 20); setCommentDraft(""); setNotice({ kind: "success", text: "Comment shared." });
    }).catch(() => setNotice({ kind: "error", text: "The comment could not be shared. Please try again." })).finally(() => setCommentsBusy(false));
  }
  function loadMoreComments() {
    if (!selected || commentsBusy || !commentsCanLoadMore || typeof listCommentsAction !== "function") return;
    const nextOffset = commentsOffset + comments.length; setCommentsBusy(true);
    void listCommentsAction(selected.id, nextOffset).then((result) => { if (!result.ok) { setNotice({ kind: "error", text: result.error }); return; } setComments((current) => [...current, ...result.data]); setCommentsOffset(nextOffset); setCommentsCanLoadMore(result.data.length === 20); }).catch(() => setNotice({ kind: "error", text: "More comments could not be loaded." })).finally(() => setCommentsBusy(false));
  }
  function addImages(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!selected) return;
    const form = event.currentTarget;
    const input = form.querySelector<HTMLInputElement>('input[type="file"][name="photos"]');
    const formData = new FormData();
    for (const file of input?.files ?? []) formData.append("photos", file);
    setCommentsBusy(true);
    void fetch(`/api/memories/${encodeURIComponent(selected.id)}/images`, { method: "POST", body: formData })
      .then(async (response) => {
        if (!response.ok) throw new Error("Image upload request failed");
        return response.json() as Promise<ActionResult<Memory>>;
      })
      .then((result) => { if (!result.ok) { setNotice({ kind: "error", text: result.error }); return; } setData((current) => ({ ...current, memories: current.memories.map((memory) => memory.id === result.data.id ? result.data : memory) })); setNotice({ kind: "success", text: "Images added to this memory." }); form.reset(); })
      .catch(() => setNotice({ kind: "error", text: "The images could not be added." }))
      .finally(() => setCommentsBusy(false));
  }
  function removeImage(imageId: string) {
    if (!selected) return; setCommentsBusy(true);
    void removeMemoryImageAction(selected.id, imageId).then((result) => { if (!result.ok) { setNotice({ kind: "error", text: result.error }); return; } setData((current) => ({ ...current, memories: current.memories.map((memory) => memory.id === result.data.id ? result.data : memory) })); setNotice({ kind: "success", text: "Image removed." }); }).catch(() => setNotice({ kind: "error", text: "The image could not be removed." })).finally(() => setCommentsBusy(false));
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
      setData(result.data); setCanUndoTemplate(Boolean(result.data.canUndoTemplate)); setNotice({ kind: "success", text: `Position saved at ${Math.round(safeCoordinates.x)} percent across and ${Math.round(safeCoordinates.y)} percent down.` }); setBusy(false);
    }).catch(() => { setNotice({ kind: "error", text: "The position could not be saved. Please try again." }); setBusy(false); });
  }
  function changeSize(sizePreset: MemorySizePreset) {
    if (!selected || !selectedIsOwned) return;
    const previous = selected.placements.personal?.sizePreset;
    setData((current) => ({ ...current, memories: current.memories.map((memory) => memory.id === selected.id ? { ...memory, placements: { ...memory.placements, personal: { ...memory.placements.personal, sizePreset } } } : memory) }));
    setBusy(true);
    void updatePlacementAction({ memoryId: selected.id, sizePreset }).then((result) => {
      if (result.ok) { setData(result.data); setCanUndoTemplate(Boolean(result.data.canUndoTemplate)); setNotice({ kind: "success", text: `Card size changed to .` }); }
      else { setData((current) => ({ ...current, memories: current.memories.map((memory) => memory.id === selected.id ? { ...memory, placements: { ...memory.placements, personal: { ...memory.placements.personal, sizePreset: previous } } } : memory) })); setNotice({ kind: "error", text: result.error }); }
    }).catch(() => setNotice({ kind: "error", text: "The card size could not be saved. Please try again." })).finally(() => setBusy(false));
  }

  function applyTemplate() {
    if (!templateId) return;
    setBusy(true); setNotice(null);
    void applyWallTemplateAction({ templateId, expectedRevision: templateRevision }).then((result) => {
      if (!result.ok) { setNotice({ kind: "error", text: result.error }); return; }
      setData((current) => ({ ...current, memories: current.memories.map((memory) => result.data.memories.find((item) => item.id === memory.id) ?? memory), backgroundPreset: result.data.backgroundPreset, templateId: result.data.template.id, templateRevision: result.data.revision, canUndoTemplate: true }));
      setTemplateRevision(result.data.revision); setCanUndoTemplate(true); setBackgroundPreset(result.data.backgroundPreset); setActiveTemplateId(result.data.template.id); setTemplatePreview(false); setNotice({ kind: "success", text: `${result.data.template.name} applied. You can undo this arrangement.` });
    }).catch(() => setNotice({ kind: "error", text: "The template could not be applied. Please try again." })).finally(() => setBusy(false));
  }
  function undoTemplate() {
    setBusy(true);
    void undoTemplateApplicationAction(templateRevision).then((result) => {
      if (!result.ok) { setNotice({ kind: "error", text: result.error }); return; }
      setData((current) => ({ ...current, memories: current.memories.map((memory) => result.data.memories.find((item) => item.id === memory.id) ?? memory), backgroundPreset: result.data.backgroundPreset, templateId: result.data.templateId, templateRevision: result.data.revision, canUndoTemplate: false })); setTemplateRevision(result.data.revision); setCanUndoTemplate(false); setBackgroundPreset(result.data.backgroundPreset); setActiveTemplateId(result.data.templateId); setNotice({ kind: "success", text: "Previous arrangement restored." });
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
    const drag = dragRef.current; const canvas = canvasRef.current;
    if (!drag || !canvas) return;
    const rect = canvas.getBoundingClientRect(); const next = { x: clamp(((event.clientX - rect.left) / rect.width) * 100 - drag.offsetX), y: clamp(((event.clientY - rect.top) / rect.height) * 100 - drag.offsetY) };
    const coordinates = data.snapToGrid ? snapCoordinate(next) : next;
    drag.coordinates = coordinates;
    setData((current) => ({ ...current, memories: updateMemoryPosition(current.memories, drag.id, coordinates, data.snapToGrid) }));
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

  return <div className="app-shell flex h-screen w-screen overflow-hidden bg-[#13140d]">
    <aside className={`app-sidebar relative z-40 flex h-full flex-shrink-0 flex-col overflow-y-auto border-r border-[#e5e1d8] bg-[#f4f1ea] text-[#3a352d] ${sidebarOpen ? "is-open" : "is-collapsed"}`}>
      <div className="p-6">
        <h1 className="font-serif-custom text-3xl font-medium leading-tight tracking-tight text-[#3a352d]">Memories<br />Wall <span className="align-top text-xl text-[#c16e54]">•</span></h1>
        <p className="mt-4 text-sm font-medium leading-relaxed text-[#7a7469]">Small memories,<br />lasting change.</p>
        <button type="button" onClick={() => setSidebarOpen((open) => !open)} aria-label={sidebarOpen ? "Collapse navigation" : "Expand navigation"} className="sidebar-toggle absolute -right-4 top-10 z-50 grid h-8 w-8 place-items-center rounded-full border border-[#e5e1d8] bg-white text-[#7a7469] shadow-sm transition hover:text-[#c16e54]">{sidebarOpen ? "‹" : "›"}</button>
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
    {!sidebarOpen && <button type="button" onClick={() => setSidebarOpen(true)} aria-label="Expand navigation" className="sidebar-reopen">›</button>}
    <main className="relative flex flex-1 flex-col overflow-hidden bg-textured-wall text-[#3a352d]">
      <header className="relative z-30 flex items-start justify-between gap-4 p-8 pb-4">
        <div>
          <h2 className="font-serif-custom text-4xl font-medium tracking-tight text-[#3a352d]">Pin your intention.</h2>
          <p className="mt-2 font-medium text-[#7a7469]">Place a memory. Read community memories.</p>
        </div>
        <div className="flex items-center gap-4">
          <label className={`flex items-center gap-2 ${isEmpty ? "cursor-not-allowed opacity-60" : "cursor-pointer"} mr-2`}><span className="text-[10px] font-bold uppercase tracking-widest text-[#a49e92]">Snap</span><span className="relative"><input type="checkbox" checked={data.snapToGrid} onChange={toggleSnap} disabled={busy || isEmpty || !isOwnedView} className="peer sr-only" /><span aria-hidden="true" className="block h-5 w-10 rounded-full bg-[#e5e1d8] transition-colors after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:shadow-sm after:transition-transform peer-checked:bg-[#c16e54] peer-checked:after:translate-x-5" /></span></label>
          <form onSubmit={(event) => { event.preventDefault(); if (!search.trim()) return; setView("all"); setSurfaceLoading(true); void searchMemoriesAction(search).then((result) => { if (result.ok) setSurfaceMemories(result.data); else setSurfaceError(result.error); }).catch(() => setSurfaceError("This search could not be completed. Please try again.")).finally(() => setSurfaceLoading(false)); }} className="hidden lg:block"><label className="sr-only" htmlFor="header-search">Search memories, people, or tags</label><input id="header-search" aria-label="Search memories, people, or tags" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search memories, people, or tags  ⌘K" className="w-72 rounded-full border border-[#e5e1d8] bg-white/80 px-5 py-2.5 text-sm text-[#5c554a] shadow-sm placeholder-[#a49e92] backdrop-blur-sm focus:outline-none focus:ring-2 focus:ring-[#c16e54]/50" /></form>
          <button type="button" onClick={openComposer} className="rounded-full bg-[#262421] px-4 py-2 text-sm font-medium text-[#f4f1ea] shadow-sm transition hover:bg-[#1a1816]" aria-label="Start a Memory"><span aria-hidden="true">＋</span> Start a Memory</button>
          <button type="button" className="grid h-10 w-10 place-items-center rounded-full border border-[#e5e1d8] bg-white/80 text-[#826e5e] shadow-sm">D</button>
        </div>
      </header>
      <div className="relative z-30 mx-8 mb-4 flex flex-wrap items-end justify-between gap-4"><div><p className="text-[10px] font-bold uppercase tracking-[.2em] text-[#c16e54]">{view === "mine" ? "My archive" : view === "community" ? "Shared circles" : view === "all" ? "Authorized archive" : view === "recent" ? "Freshly shared" : view === "discovery" ? "Open archive" : "Personal wall"}</p><h3 className="font-serif-custom mt-1 text-2xl text-[#3a352d]">{isEmpty ? "A place for what matters" : view === "mine" ? "Everything you have kept" : view === "community" ? "A wider circle, thoughtfully" : view === "all" ? "Everything you can see" : view === "recent" ? "Recently added memories" : view === "discovery" ? "Public, thoughtfully shared" : "Small moments, kept close"}</h3>{!isEmpty && <p className="mt-1 text-sm text-[#a49e92]">{visibleMemories.length} {visibleMemories.length === 1 ? "memory" : "memories"}{category !== "all" ? ` · ${categoryMeta[category].label}` : ""}</p>}</div></div>
        <div className="wall-controls relative z-30 mx-8 mb-4 flex flex-wrap items-center gap-3" aria-hidden="true">
          {(view === "all" || view === "discovery") && <form className="relative" onSubmit={(event) => { event.preventDefault(); if (!search.trim()) return; setSurfaceLoading(true); setSurfaceError(null); const searchRequest = view === "discovery" ? searchPublicMemoriesAction(search) : searchMemoriesAction(search); void searchRequest.then((result) => { if (result.ok) setSurfaceMemories(result.data); else { setSurfaceError(result.error); setSurfaceErrorCode(result.code === "FORBIDDEN" ? "FORBIDDEN" : "UNKNOWN"); } }).catch(() => { setSurfaceError("This search could not be completed. Please try again."); setSurfaceErrorCode("UNKNOWN"); }).finally(() => setSurfaceLoading(false)); }}><input aria-label="Search memories" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={view === "discovery" ? "Search public memories" : "Search your authorized memories"} className="w-72 rounded-full border border-[#e5e1d8] bg-white/80 px-4 py-2 text-sm text-[#5c554a] shadow-sm placeholder-[#a49e92] backdrop-blur-sm focus:outline-none focus:ring-2 focus:ring-[#c16e54]/50" /><button className="ml-2 rounded-full border border-[#e5e1d8] bg-white px-4 py-2 text-sm text-[#5c554a] shadow-sm hover:bg-[#f4f1ea]">Search</button></form>}
          {view === "community" && communities.length > 0 && <label className="rounded-full border border-[#e5e1d8] bg-white/80 px-4 py-2 text-sm text-[#5c554a] shadow-sm">Community<select value={communityId} onChange={(event) => setCommunityId(event.target.value)} className="ml-2 rounded-full border border-[#e5e1d8] bg-white px-3 py-1 text-sm"><option value="">All communities</option>{communities.map((community) => <option key={community.communityId} value={community.communityId}>{community.name}</option>)}</select></label>}
          <div className="flex flex-wrap items-center gap-2 rounded-full border border-[#e5e1d8] bg-white/80 px-4 py-2 text-sm shadow-sm"><span className="text-[10px] font-bold uppercase tracking-widest text-[#a49e92]">Template</span><select aria-label="Wall template" value={templateId} onChange={(event) => { setTemplateId(event.target.value); setTemplatePreview(Boolean(event.target.value)); }} className="rounded-full border border-[#e5e1d8] bg-white px-2 py-1 text-sm text-[#5c554a]"><option value="">Choose a composition</option>{templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}</select>{templatePreview && templateId && <><button type="button" onClick={() => setTemplatePreview(false)} className="rounded-full border border-[#e5e1d8] px-3 py-1 text-xs text-[#5c554a]">Close preview</button><button type="button" onClick={applyTemplate} disabled={busy} className="rounded-full bg-[#c16e54] px-3 py-1 text-xs font-semibold text-white">Apply template</button></>}{canUndoTemplate && <button type="button" onClick={undoTemplate} disabled={busy} className="rounded-full border border-[#e5e1d8] px-3 py-1 text-xs text-[#5c554a]">Undo last template</button>}</div>
          {templatePreview && templateId && (() => { const template = templates.find((item) => item.id === templateId); return template ? <figure className="template-preview rounded-2xl border border-[#e5e1d8] bg-[#fdfcfa] p-3 shadow-sm"><img src={template.previewAsset} alt={`${template.name} preview`} className="h-24 w-40 rounded-lg object-cover" /><figcaption className="mt-2 max-w-40 text-xs leading-4 text-[#7a7469]">{template.description}</figcaption></figure> : null; })()}
          <div className="flex flex-wrap gap-2 text-xs text-[#7a7469]"><label className="rounded-full border border-[#e5e1d8] bg-white/80 px-3 py-1.5 shadow-sm">Ownership<select aria-label="Ownership filter" value={ownershipFilter} onChange={(event) => setOwnershipFilter(event.target.value as typeof ownershipFilter)} className="ml-1 rounded border-0 bg-transparent text-[#5c554a]"><option value="all">Everyone</option><option value="mine">Mine</option><option value="shared">Shared</option></select></label><label className="rounded-full border border-[#e5e1d8] bg-white/80 px-3 py-1.5 shadow-sm">Visibility<select aria-label="Visibility filter" value={visibilityFilter} onChange={(event) => setVisibilityFilter(event.target.value as typeof visibilityFilter)} className="ml-1 rounded border-0 bg-transparent text-[#5c554a]"><option value="all">Any</option><option value="private">Private</option><option value="selected-community">Selected community</option><option value="public-discovery">Public discovery</option></select></label><label className="rounded-full border border-[#e5e1d8] bg-white/80 px-3 py-1.5 shadow-sm">From<input aria-label="Filter from date" type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} className="ml-1 rounded border-0 bg-transparent text-[#5c554a]" /></label><label className="rounded-full border border-[#e5e1d8] bg-white/80 px-3 py-1.5 shadow-sm">To<input aria-label="Filter to date" type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} className="ml-1 rounded border-0 bg-transparent text-[#5c554a]" /></label></div>
        </div>
        {notice && <div role="status" className={`relative z-30 mx-8 mb-4 rounded-lg border px-4 py-3 text-sm shadow-sm ${notice.kind === "success" ? "border-[#8ba47d] bg-[#eef4e9] text-[#4a5444]" : "border-[#b56e6e] bg-[#f9e9e7] text-[#6e4e50]"}`}>{notice.text}</div>}
        <div className="relative min-h-0 flex-1 overflow-hidden px-8 pb-6">
        {surfaceLoading && <section role="status" className="grid min-h-[30vh] place-items-center rounded-lg border border-[#e5e1d8] bg-white/60 p-8 text-center text-[#7a7469]">Loading this surface…</section>}
        {surfaceError && !surfaceLoading && <section role="alert" className="grid min-h-[30vh] place-items-center rounded-lg border border-[#b56e6e] bg-[#f9e9e7] p-8 text-center"><div><p className="font-serif-custom text-2xl text-[#6e4e50]">{surfaceErrorCode === "FORBIDDEN" ? "This view is private." : "This surface is unavailable."}</p><p className="mt-2 text-sm text-[#7a7469]">{surfaceError}</p><button type="button" onClick={() => setSurfaceRequestKey((current) => current + 1)} className="mt-4 text-sm text-[#c16e54] underline">Try again</button>{surfaceErrorCode === "FORBIDDEN" && <button type="button" onClick={() => setView("wall")} className="ml-4 mt-4 text-sm text-[#c16e54] underline">Back to your wall</button>}</div></section>}
        {!surfaceLoading && !surfaceError && (isEmpty ? <section className={"wall-background-" + backgroundPreset + " grid h-full min-h-[54vh] place-items-center rounded-lg border border-dashed border-[#c5c1b7] bg-white/50 p-8 text-center"}><div className="max-w-md"><div aria-hidden="true" className="mx-auto mb-5 grid h-16 w-16 rotate-[-4deg] place-items-center rounded-sm border border-[#e5e1d8] bg-[#f4ebd0] text-3xl text-[#a39774] shadow-md">✦</div><h3 className="font-serif-custom text-3xl text-[#3a352d]">{view === "wall" || view === "mine" ? "Your wall is waiting" : view === "discovery" ? "Nothing public here yet" : "Nothing shared here yet"}</h3><p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-[#7a7469]">{view === "wall" || view === "mine" ? "Capture a moment worth remembering. It will stay private, ready for you to revisit whenever you need it." : view === "discovery" ? "Public memories will appear here when someone chooses to share a reflection beyond their communities." : "Shared memories will appear here when a community member chooses to share them."}</p>{(view === "wall" || view === "mine") && <button type="button" onClick={openComposer} className="mt-7 rounded-full bg-[#262421] px-6 py-3 font-medium text-[#f4f1ea] shadow-sm transition hover:bg-[#1a1816]">Start a Memory <span aria-hidden="true">→</span></button>}</div></section> : <section ref={canvasRef} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} aria-label="Memory wall" className={"wall-background-" + backgroundPreset + " relative h-full min-h-[560px] overflow-hidden"}>
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-[0.03]" style={{ backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 199px, #000 199px, #000 200px), repeating-linear-gradient(90deg, transparent, transparent 399px, #000 399px, #000 400px)" }} />
          <div className="pointer-events-none absolute left-2 top-2 text-[9px] font-bold uppercase tracking-[.18em] text-[#a49e92]">{data.snapToGrid ? "Aligned desk · snapped positions" : "Open desk · drag to arrange"}</div>
          {visibleMemories.map((memory, index) => <MemoryCard key={memory.id} memory={memory} selected={memory.id === selectedId} dragging={memory.id === dragId} index={index} snapToGrid={data.snapToGrid} onSelect={() => selectMemory(memory)} onPointerDown={(event) => onPointerDown(event, memory)} positionOverride={positionMode?.id === memory.id ? positionMode.coordinates : undefined} />)}
          {!visibleMemories.length && <div className="relative z-10 grid min-h-[520px] place-items-center text-center"><div><p className="font-serif-custom text-2xl text-[#3a352d]">Nothing in this section yet.</p><button type="button" onClick={() => setCategory("all")} className="mt-3 text-sm text-[#c16e54] underline underline-offset-4">Show all memories</button></div></div>}
        </section>)}
        </div>
        <p className="mobile-only mt-3 text-center text-xs text-[#a49e92]">Cards become a readable stack on small screens. Select one to view its details.</p>
      </main>
      {selected && <DetailsPanel selected={selected} selectedIsOwned={Boolean(selectedIsOwned)} communities={communities} editing={editing} editForm={editForm} setEditForm={setEditForm} busy={busy} positionMode={positionMode} comments={comments} commentsOpen={commentsOpen} onToggleComments={() => setCommentsOpen((open) => !open)} commentDraft={commentDraft} setCommentDraft={setCommentDraft} commentsBusy={commentsBusy} commentsCanLoadMore={commentsCanLoadMore} onLoadMoreComments={loadMoreComments} reacted={reacted} reactionBusy={reactionBusy} reportReason={reportReason} setReportReason={setReportReason} onToggleReaction={toggleReaction} onSubmitComment={submitComment} onDeleteComment={removeComment} onModerateComment={moderateCommentFromWall} onReport={(targetType, targetId) => reportContent(targetType, targetId)} onStartPosition={startPositionMode} onMovePosition={movePosition} onConfirmPosition={confirmPosition} onCancelPosition={() => setPositionMode(null)} onEdit={beginEdit} onSaveEdit={saveEdit} onCancelEdit={() => setEditing(false)} onDelete={() => setConfirmDelete(true)} onChangeSize={changeSize} onAddImages={addImages} onRemoveImage={removeImage} onClose={() => setSelectedId(null)} />}
      <WallSettings open={recentOpen} onToggle={() => setRecentOpen((open) => !open)} search={search} setSearch={setSearch} view={view} onSearch={(query) => { setView(view === "discovery" ? "discovery" : "all"); setSurfaceLoading(true); setSurfaceError(null); const request = view === "discovery" ? searchPublicMemoriesAction(query) : searchMemoriesAction(query); void request.then((result) => { if (result.ok) setSurfaceMemories(result.data); else setSurfaceError(result.error); }).catch(() => setSurfaceError("This search could not be completed. Please try again.")).finally(() => setSurfaceLoading(false)); }} communityId={communityId} setCommunityId={setCommunityId} communities={communities} ownershipFilter={ownershipFilter} setOwnershipFilter={setOwnershipFilter} visibilityFilter={visibilityFilter} setVisibilityFilter={setVisibilityFilter} fromDate={fromDate} setFromDate={setFromDate} toDate={toDate} setToDate={setToDate} templates={templates} templateId={templateId} setTemplateId={setTemplateId} templatePreview={templatePreview} setTemplatePreview={setTemplatePreview} templateRevision={templateRevision} activeTemplateId={activeTemplateId} canUndoTemplate={canUndoTemplate} busy={busy} applyTemplate={applyTemplate} undoTemplate={undoTemplate} />
    {composerOpen && <Composer titleRef={composerTitleRef} communities={communities} form={form} setForm={setForm} busy={busy} notice={notice} onSubmit={onCreate} onClose={closeComposer} />}
    {confirmDelete && selected && <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" role="presentation"><section role="alertdialog" aria-modal="true" aria-labelledby="delete-title" className="w-full max-w-md rounded-lg border border-[#e5e1d8] bg-[#fdfcfa] p-6 shadow-2xl"><p className="font-archive text-[10px] uppercase tracking-widest text-[#b56e6e]">Permanent action</p><h2 id="delete-title" className="font-serif-custom mt-2 text-2xl text-[#3a352d]">Delete this memory?</h2><p className="mt-3 text-sm leading-6 text-[#7a7469]">“{selected.title}” will be removed from your wall. This cannot be undone.</p><div className="mt-6 flex justify-end gap-3"><button type="button" onClick={() => setConfirmDelete(false)} className="rounded-lg border border-[#e5e1d8] px-4 py-2 text-sm text-[#7a7469]">Keep it</button><button type="button" onClick={deleteSelected} disabled={busy} className="rounded-lg bg-[#b56e6e] px-4 py-2 text-sm font-semibold text-white">{busy ? "Deleting…" : "Delete memory"}</button></div></section></div>}
    <div aria-live="polite" aria-atomic="true" className="sr-only">{positionMode ? `Position mode. ${Math.round(positionMode.coordinates.x)} percent across, ${Math.round(positionMode.coordinates.y)} percent down. Use arrow controls, then confirm or cancel.` : notice?.text ?? (selected ? `Selected memory: ${selected.title}` : "")}</div>
  </div>;
}

function ImageWithFallback({ image, alt, className, fullSize = false }: { image: MemoryImage; alt: string; className?: string; fullSize?: boolean }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <div role="img" aria-label={`${alt} unavailable`} className={`${className ?? ""} image-placeholder`}>Image unavailable</div>;
  const source = fullSize ? image.url ?? image.thumbnailUrl : image.thumbnailUrl ?? image.url;
  if (!source) return <div role="img" aria-label={`${alt} unavailable`} className={`${className ?? ""} image-placeholder`}>Image unavailable</div>;
  return <img src={source} alt={alt} className={className} onError={() => setFailed(true)} />;
}

function MemoryCard({ memory, selected, dragging, snapToGrid, index, positionOverride, onSelect, onPointerDown }: { memory: Memory; selected: boolean; dragging: boolean; snapToGrid: boolean; index: number; positionOverride?: Coordinate; onSelect: () => void; onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void }) {
  const meta = categoryMeta[memory.category]; const placement = memory.placements.personal; const coordinates = positionOverride ?? activeCoordinates(memory, snapToGrid); const rotation = placement?.rotation ?? (index % 3 - 1) * 1.2; const representative = (memory.images ?? [])[0];
  return <article role="button" tabIndex={0} aria-label={`${memory.title}, ${meta.label} memory`} aria-pressed={selected} onClick={onSelect} onPointerDown={onPointerDown} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect(); } }} className={`note-card wall-card absolute z-10 w-[min(245px,38%)] select-none p-5 pt-7 text-[#303129] ${selected ? "card-selected z-30" : ""} ${dragging ? "dragging cursor-grabbing" : "cursor-grab"}`} style={{ width: placement?.sizePreset === "small" ? "min(210px, 32%)" : placement?.sizePreset === "large" ? "min(285px, 44%)" : "min(245px, 38%)", left: `${coordinates.x}%`, top: `${coordinates.y}%`, backgroundColor: meta.surface, transform: `rotate(${rotation}deg)`, zIndex: selected || dragging ? 40 : 10 + index }}>
    <span aria-hidden="true" className="note-pin" style={{ background: `radial-gradient(circle at 35% 35%, ${meta.color}, #7f1d1d 70%, #3a352d)`, transform: `translateX(-50%) rotate(${rotation * 2}deg)` }} />
    <div className="mb-3 flex items-start justify-between gap-2"><span className="inline-flex items-center gap-1.5 rounded-full border border-[#303129]/20 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-[#5c554a]" aria-label={`Category: ${meta.label}`}><span aria-hidden="true">{meta.icon}</span>{meta.label}</span></div>
    {representative && <ImageWithFallback image={representative} alt={`${memory.title} representative image`} className="memory-image-thumb mb-3 block aspect-[4/3] w-full rounded-lg border border-white/70 object-cover" />}
    <h3 className="font-serif-custom line-clamp-2 text-xl italic leading-tight text-[#3a352d]">{memory.title}</h3><p className="mt-2 line-clamp-3 text-xs leading-5 text-[#5c554a]">{memory.reflection}</p><div className="mt-5 flex items-center justify-between border-t border-[#303129]/15 pt-3 text-[10px] text-[#7a7469]"><span>{memory.authorId === "demo-user" ? "You" : `By ${memory.authorId}`}</span><span aria-label={`${memory.visibility === "private" ? "Private" : memory.visibility === "selected-community" ? "Selected community" : "Public discovery"} memory`}>{memory.visibility === "private" ? "Private" : memory.visibility === "selected-community" ? "Shared with community" : "Public discovery"}</span></div>
  </article>;
}

function MemoryGallery({ memory, owner, onAddImages, onRemoveImage }: { memory: Memory; owner: boolean; onAddImages: (event: FormEvent<HTMLFormElement>) => void; onRemoveImage: (id: string) => void }) {
  const [index, setIndex] = useState(0); const images = memory.images ?? []; const current = images[index];
  useEffect(() => { setIndex(0); }, [memory.id, images.length]);
  if (!images.length && !owner) return null;
  return <section className="memory-gallery mt-5" aria-label="Memory image gallery">
    {images.length > 0 && <div className="gallery-carousel" role="region" aria-roledescription="carousel" aria-label={`${memory.title} images`}>
      <div className="relative overflow-hidden rounded-xl border border-[#e5e1d8] bg-[#f4f1ea]"><div className="aspect-[4/3] w-full">{current && <ImageWithFallback image={current} alt={`${memory.title}, image ${index + 1} of ${images.length}`} className="h-full w-full object-contain" fullSize />}</div><span className="absolute bottom-2 right-2 rounded-full bg-black/65 px-2 py-1 text-[10px] text-white" aria-label={`Image ${index + 1} of ${images.length}`}>Image {index + 1} of {images.length}</span>{images.length > 1 && <><button type="button" aria-label="Previous image" onClick={() => setIndex((value) => (value - 1 + images.length) % images.length)} className="absolute left-2 top-1/2 rounded-full bg-white/90 px-2 py-1">‹</button><button type="button" aria-label="Next image" onClick={() => setIndex((value) => (value + 1) % images.length)} className="absolute right-2 top-1/2 rounded-full bg-white/90 px-2 py-1">›</button></>}</div>
      <div className="mt-2 flex gap-2 overflow-x-auto" aria-label="Choose an image">{images.map((image, imageIndex) => <button type="button" key={image.id} aria-label={`Show image ${imageIndex + 1} of ${images.length}`} aria-pressed={imageIndex === index} onClick={() => setIndex(imageIndex)} className="gallery-thumbnail aspect-square w-14 flex-shrink-0 overflow-hidden rounded border-2 border-[#e5e1d8] data-[active=true]:border-[#c16e54]" data-active={imageIndex === index}><ImageWithFallback image={image} alt={`Thumbnail ${imageIndex + 1} of ${images.length}`} className="h-full w-full object-cover" /></button>)}</div>
    </div>}
    {owner && <><form onSubmit={onAddImages} className="mt-3 flex items-center gap-2"><label className="flex-1 text-xs text-[#7a7469]">Add images<input name="photos" type="file" multiple accept="image/jpeg,image/png,image/webp" className="mt-1 block w-full text-xs" /></label><button type="submit" className="rounded-lg border border-[#e5e1d8] px-3 py-2 text-xs" disabled={images.length >= 5}>Add</button></form><p className="mt-1 text-[10px] text-[#a49e92]">{images.length}/5 images · upload order is preserved.</p>{images.length > 0 && <ul className="mt-2 space-y-1">{images.map((image, imageIndex) => <li key={image.id} className="flex items-center justify-between text-xs text-[#7a7469]"><span>Image {imageIndex + 1}{imageIndex === 0 ? " · representative" : ""}</span><button type="button" onClick={() => onRemoveImage(image.id)} className="text-[#b56e6e] underline">Remove</button></li>)}</ul>}</>}
  </section>;
}

function DetailsPanel({ selected, selectedIsOwned, communities, editing, editForm, setEditForm, busy, positionMode, comments, commentsOpen, onToggleComments, commentDraft, setCommentDraft, commentsBusy, commentsCanLoadMore, onLoadMoreComments, reacted, reactionBusy, onToggleReaction, reportReason, setReportReason, onSubmitComment, onDeleteComment, onModerateComment, onReport, onStartPosition, onMovePosition, onConfirmPosition, onCancelPosition, onEdit, onSaveEdit, onCancelEdit, onDelete, onChangeSize, onAddImages, onRemoveImage, onClose }: {
  selected: Memory | null; selectedIsOwned: boolean; editing: boolean; communities: CommunityMembership[];
  editForm: { title: string; reflection: string; category: MemoryCategory; visibility: Visibility; communityIds: string[] };
  setEditForm: (value: { title: string; reflection: string; category: MemoryCategory; visibility: Visibility; communityIds: string[] }) => void;
  busy: boolean; positionMode: PositionDraft | null; comments: MemoryComment[]; commentsOpen: boolean; onToggleComments: () => void; commentDraft: string; setCommentDraft: (value: string) => void; commentsBusy: boolean; commentsCanLoadMore: boolean; onLoadMoreComments: () => void;
  reportReason: "harmful" | "harassment" | "privacy" | "spam" | "other"; setReportReason: (value: "harmful" | "harassment" | "privacy" | "spam" | "other") => void; reacted: boolean; reactionBusy: boolean; onToggleReaction: () => void;
  onSubmitComment: (event: FormEvent<HTMLFormElement>) => void; onDeleteComment: (id: string) => void; onModerateComment: (id: string) => void; onReport: (targetType: "memory" | "comment", targetId: string) => void;
  onChangeSize: (sizePreset: MemorySizePreset) => void; onAddImages: (event: FormEvent<HTMLFormElement>) => void; onRemoveImage: (id: string) => void; onStartPosition: () => void; onMovePosition: (x: number, y: number) => void; onConfirmPosition: () => void; onCancelPosition: () => void; onEdit: () => void; onSaveEdit: (event: FormEvent<HTMLFormElement>) => void; onCancelEdit: () => void; onDelete: () => void; onClose: () => void;
}) {
  if (!selected) return null;
  return <aside id="memory-details" tabIndex={-1} aria-label="Memory details" className="memory-details-panel w-80 flex-shrink-0 border-l border-[#e5e1d8] bg-[#fdfcfa] p-5 text-[#3a352d] outline-none md:overflow-y-auto"><div className="flex items-center justify-between"><p className="font-archive text-[10px] uppercase tracking-[.18em] text-[#a49e92]">Details</p><button type="button" onClick={onClose} aria-label="Close memory details" className="rounded p-2 text-xl text-[#a49e92] hover:bg-[#f4f1ea]">×</button></div>
    {editing ? <form onSubmit={onSaveEdit} className="mt-6 space-y-4"><label className="block text-xs text-[#a49e92]">Title<input required maxLength={120} value={editForm.title} onChange={(event) => setEditForm({ ...editForm, title: event.target.value })} className="mt-1 w-full rounded border border-[#e5e1d8] bg-[#f4f1ea] p-2 text-sm" /></label><label className="block text-xs text-[#a49e92]">Reflection<textarea required maxLength={5000} rows={8} value={editForm.reflection} onChange={(event) => setEditForm({ ...editForm, reflection: event.target.value })} className="mt-1 w-full rounded border border-[#e5e1d8] bg-[#f4f1ea] p-2 text-sm" /></label><CategorySelect value={editForm.category} onChange={(category) => setEditForm({ ...editForm, category })} /><div className="flex gap-2"><button type="submit" disabled={busy} className="rounded bg-[#c16e54] px-3 py-2 text-xs text-white">Save</button><button type="button" onClick={onCancelEdit} className="rounded border border-[#e5e1d8] px-3 py-2 text-xs">Cancel</button></div></form> : <div className="mt-6"><div className="mb-5 border-l-4 pl-4" style={{ borderColor: categoryMeta[selected.category].color }}><span className="text-xs font-semibold" style={{ color: categoryMeta[selected.category].color }}>{categoryMeta[selected.category].icon} {categoryMeta[selected.category].label}</span><h2 className="font-serif-custom mt-2 text-3xl leading-tight text-[#3a352d]">{selected.title}</h2></div><p className="whitespace-pre-wrap text-sm leading-7 text-[#7a7469]">{selected.reflection}</p><MemoryGallery memory={selected} owner={selectedIsOwned} onAddImages={onAddImages} onRemoveImage={onRemoveImage} /><dl className="mt-8 space-y-3 border-t border-[#e5e1d8] pt-4 text-xs"><div className="flex justify-between gap-3"><dt className="text-[#a49e92]">Written</dt><dd>{formatDate(selected.createdAt)}</dd></div><div className="flex justify-between gap-3"><dt className="text-[#a49e92]">Last updated</dt><dd>{formatDate(selected.updatedAt)}</dd></div><div className="flex justify-between gap-3"><dt className="text-[#a49e92]">Visibility</dt><dd>{selected.visibility === "private" ? "Private" : selected.visibility === "selected-community" ? "Selected community" : "Public discovery"}</dd></div></dl>
    <section className="mt-7 border-t border-[#e5e1d8] pt-4"><div className="flex items-center justify-between"><h3 className="font-serif-custom text-xl text-[#3a352d]">Comments <span className="text-sm text-[#a49e92]">({comments.length}{commentsCanLoadMore ? "+" : ""})</span></h3><button type="button" onClick={onToggleComments} aria-expanded={commentsOpen} className="text-xs text-[#c16e54]">{commentsOpen ? "Hide" : "Show"}</button></div>{commentsOpen && <><div className="mt-3 space-y-3">{comments.map((comment) => <article key={comment.id} className="border-l-2 border-[#e5e1d8] pl-3"><p className="text-xs leading-5 text-[#5c554a]">{comment.body}</p><div className="mt-1 flex items-center justify-between text-[10px] text-[#a49e92]"><span>{comment.authorId === "demo-user" ? "You" : comment.authorId}</span><span className="flex gap-2">{comment.authorId === "demo-user" && <button type="button" onClick={() => onDeleteComment(comment.id)} className="underline">Delete</button>}{selectedIsOwned && comment.authorId !== "demo-user" && <button type="button" onClick={() => onModerateComment(comment.id)} className="text-[#b56e6e] underline">Remove</button>}</span></div></article>)}</div>{commentsCanLoadMore && <button type="button" onClick={onLoadMoreComments} disabled={commentsBusy} className="mt-3 text-xs text-[#c16e54] underline">Load more</button>}<form onSubmit={onSubmitComment} className="mt-4"><label className="sr-only" htmlFor="comment-body">Add a comment</label><textarea id="comment-body" required maxLength={2000} rows={3} value={commentDraft} onChange={(event) => setCommentDraft(event.target.value)} placeholder="Add a thoughtful comment" className="w-full rounded border border-[#e5e1d8] bg-[#f4f1ea] p-2 text-sm" /><p className="mt-1 text-right text-[10px] text-[#a49e92]">{commentDraft.length}/2000</p><button type="submit" disabled={commentsBusy} className="mt-2 rounded bg-[#c16e54] px-3 py-2 text-xs text-white">{commentsBusy ? "Sharing…" : "Comment"}</button></form></>}</section>
    <div className="mt-7 space-y-2">{selectedIsOwned && <><button type="button" onClick={onStartPosition} disabled={Boolean(positionMode)} className="w-full rounded-lg border border-[#e5e1d8] px-3 py-2.5 text-left text-sm">Arrange this card</button><label className="block rounded-lg border border-[#e5e1d8] px-3 py-2 text-xs">Card size<select aria-label="Card size" value={selected.placements.personal?.sizePreset ?? "default"} onChange={(event) => onChangeSize(event.target.value as MemorySizePreset)} className="ml-2 rounded bg-[#f4f1ea] px-2 py-1 text-sm"><option value="small">Small</option><option value="default">Default</option><option value="large">Large</option></select></label><button type="button" onClick={onEdit} className="w-full rounded-lg border border-[#e5e1d8] px-3 py-2.5 text-left text-sm">Edit memory</button><button type="button" onClick={onDelete} className="w-full rounded-lg border border-[#b56e6e] px-3 py-2.5 text-left text-sm text-[#b56e6e]">Delete memory</button></>}{positionMode && positionMode.id === selected.id && <div className="rounded-lg bg-[#f4f1ea] p-3"><p className="text-xs text-[#7a7469]">Use arrows to position this card.</p><div className="mx-auto mt-3 grid w-28 grid-cols-3 gap-1"><span /><PositionButton label="Move up" symbol="↑" onClick={() => onMovePosition(0, -2)} /><span /><PositionButton label="Move left" symbol="←" onClick={() => onMovePosition(-2, 0)} /><PositionButton label="Confirm" symbol="✓" onClick={onConfirmPosition} /><PositionButton label="Move right" symbol="→" onClick={() => onMovePosition(2, 0)} /><span /><PositionButton label="Cancel" symbol="×" onClick={onCancelPosition} /><span /></div></div>}</div></div>}
  </aside>;
}

function WallSettings({ open, onToggle, search, setSearch, view, onSearch, communityId, setCommunityId, communities, ownershipFilter, setOwnershipFilter, visibilityFilter, setVisibilityFilter, fromDate, setFromDate, toDate, setToDate, templates, templateId, setTemplateId, templatePreview, setTemplatePreview, templateRevision, activeTemplateId, canUndoTemplate, busy, applyTemplate, undoTemplate }: {
  open: boolean; onToggle: () => void; search: string; setSearch: (value: string) => void; view: View; onSearch: (query: string) => void;
  communityId: string; setCommunityId: (value: string) => void; communities: CommunityMembership[];
  ownershipFilter: "all" | "mine" | "shared"; setOwnershipFilter: (value: "all" | "mine" | "shared") => void; visibilityFilter: "all" | Visibility; setVisibilityFilter: (value: "all" | Visibility) => void;
  fromDate: string; setFromDate: (value: string) => void; toDate: string; setToDate: (value: string) => void; templates: WallTemplate[]; templateId: string; setTemplateId: (value: string) => void;
  templatePreview: boolean; setTemplatePreview: (value: boolean) => void; templateRevision: number; activeTemplateId?: string; canUndoTemplate: boolean; busy: boolean; applyTemplate: () => void; undoTemplate: () => void;
}) {
  return <section className={`recent-tray wall-settings ${open ? "is-open" : "is-collapsed"}`} aria-label="Wall Settings">
    <div className="flex items-center justify-between border-b border-[#e5e1d8] px-6 py-3"><p className="text-[10px] font-bold uppercase tracking-[.16em] text-[#a49e92]">Wall Settings</p><button type="button" onClick={onToggle} aria-expanded={open} aria-label={open ? "Collapse wall settings" : "Expand wall settings"} className="text-sm text-[#7a7469]">{open ? "⌄" : "⌃"}</button></div>
    {open && <div className="grid gap-4 p-5 md:grid-cols-[1.1fr_1fr_1fr]">
      <div className="space-y-3">
        <p className="text-[10px] font-bold uppercase tracking-[.16em] text-[#a49e92]">Composition{activeTemplateId ? " · " + activeTemplateId : ""}</p>
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[#e5e1d8] bg-[#f4f1ea] p-3 text-sm text-[#5c554a]"><span>Template</span><select aria-label="Wall template" value={templateId} onChange={(event) => { setTemplateId(event.target.value); setTemplatePreview(Boolean(event.target.value)); }} className="min-w-0 flex-1 rounded-lg border border-[#e5e1d8] bg-white px-2 py-1 text-sm"><option value="">Choose a composition</option>{templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}</select>{templatePreview && templateId && <><button type="button" onClick={() => setTemplatePreview(false)} className="rounded-lg border border-[#e5e1d8] px-2 py-1 text-xs">Close</button><button type="button" onClick={applyTemplate} disabled={busy} className="rounded-lg bg-[#c16e54] px-2 py-1 text-xs font-semibold text-white">Apply</button></>}{canUndoTemplate && <button type="button" onClick={undoTemplate} disabled={busy} className="rounded-lg border border-[#e5e1d8] px-2 py-1 text-xs">Undo</button>}</div>
        {templatePreview && templateId && (() => { const template = templates.find((item) => item.id === templateId); return template ? <figure className="template-preview rounded-xl border border-[#e5e1d8] bg-[#fdfcfa] p-3 shadow-sm"><img src={template.previewAsset} alt={`${template.name} preview`} className="h-20 w-32 rounded-lg object-cover" /><figcaption className="max-w-40 text-xs leading-4 text-[#7a7469]">{template.description}</figcaption></figure> : null; })()}
      </div>
      <div className="space-y-3">
        <p className="text-[10px] font-bold uppercase tracking-[.16em] text-[#a49e92]">Filter the wall</p>
        <div className="grid grid-cols-2 gap-2 text-xs text-[#7a7469]"><label className="rounded-lg border border-[#e5e1d8] bg-[#f4f1ea] px-3 py-2">Ownership<select aria-label="Ownership filter" value={ownershipFilter} onChange={(event) => setOwnershipFilter(event.target.value as "all" | "mine" | "shared")} className="mt-1 block w-full rounded border-0 bg-transparent p-0 text-sm text-[#5c554a]"><option value="all">Everyone</option><option value="mine">Mine</option><option value="shared">Shared</option></select></label><label className="rounded-lg border border-[#e5e1d8] bg-[#f4f1ea] px-3 py-2">Visibility<select aria-label="Visibility filter" value={visibilityFilter} onChange={(event) => setVisibilityFilter(event.target.value as "all" | Visibility)} className="mt-1 block w-full rounded border-0 bg-transparent p-0 text-sm text-[#5c554a]"><option value="all">Any</option><option value="private">Private</option><option value="selected-community">Selected community</option><option value="public-discovery">Public discovery</option></select></label><label className="rounded-lg border border-[#e5e1d8] bg-[#f4f1ea] px-3 py-2">From<input aria-label="Filter from date" type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} className="mt-1 block w-full border-0 bg-transparent p-0 text-sm text-[#5c554a]" /></label><label className="rounded-lg border border-[#e5e1d8] bg-[#f4f1ea] px-3 py-2">To<input aria-label="Filter to date" type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} className="mt-1 block w-full border-0 bg-transparent p-0 text-sm text-[#5c554a]" /></label></div>
      </div>
      <div className="space-y-3">
        <p className="text-[10px] font-bold uppercase tracking-[.16em] text-[#a49e92]">Find a memory</p>
        <form onSubmit={(event) => { event.preventDefault(); if (!search.trim()) return; onSearch(search); }}><label className="sr-only" htmlFor="settings-search">Search memories</label><input id="settings-search" aria-label="Search memories" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search memories, people, or tags" className="w-full rounded-xl border border-[#e5e1d8] bg-[#f4f1ea] px-4 py-2.5 text-sm text-[#5c554a] placeholder-[#a49e92] focus:outline-none focus:ring-2 focus:ring-[#c16e54]/50" /><button type="submit" className="sr-only">Search</button></form>
        {view === "community" && communities.length > 0 && <label className="block rounded-xl border border-[#e5e1d8] bg-[#f4f1ea] px-3 py-2 text-xs text-[#7a7469]">Community<select value={communityId} onChange={(event) => setCommunityId(event.target.value)} className="mt-1 block w-full rounded border-0 bg-transparent p-0 text-sm text-[#5c554a]"><option value="">All communities</option>{communities.map((community) => <option key={community.communityId} value={community.communityId}>{community.name}</option>)}</select></label>}
        <p className="text-xs text-[#a49e92]">Changes apply as you arrange and explore your wall.</p>
      </div>
    </div>}
  </section>;
}
function PositionButton({ label, symbol, onClick }: { label: string; symbol: string; onClick: () => void }) { return <button type="button" aria-label={label} onClick={onClick} className="grid h-9 place-items-center rounded border border-[#e5e1d8] bg-[#fdfcfa] text-lg text-[#c16e54] hover:bg-[#f4f1ea]">{symbol}</button>; }
function CategorySelect({ value, onChange }: { value: MemoryCategory; onChange: (value: MemoryCategory) => void }) { return <label className="block text-xs text-[#a49e92]">Category<select value={value} onChange={(event) => onChange(event.target.value as MemoryCategory)} className="mt-1 w-full rounded border border-[#e5e1d8] bg-[#f4f1ea] px-3 py-2.5 text-sm text-[#3a352d]">{MEMORY_CATEGORIES.map((item) => <option key={item} value={item}>{categoryMeta[item].icon} {categoryMeta[item].label}</option>)}</select></label>; }
function Composer({ titleRef, communities, form, setForm, busy, notice, onSubmit, onClose }: { titleRef: RefObject<HTMLInputElement | null>; communities: CommunityMembership[]; form: FormValues; setForm: (value: FormValues) => void; busy: boolean; notice: { kind: "success" | "error"; text: string } | null; onSubmit: (event: FormEvent<HTMLFormElement>) => void; onClose: () => void }) {
  return <div className="fixed inset-0 z-40 overflow-y-auto bg-black/70 p-4" role="dialog" aria-modal="true" aria-labelledby="create-memory-title"><div className="mx-auto my-8 w-full max-w-2xl rounded-lg border border-[#e5e1d8] bg-[#fdfcfa] shadow-2xl"><div className="flex items-start justify-between border-b border-[#e5e1d8] p-6"><div><p className="font-archive text-[10px] uppercase tracking-widest text-[#c16e54]">New entry</p><h2 id="create-memory-title" className="font-serif-custom mt-1 text-3xl text-[#3a352d]">Keep a moment</h2><p className="mt-1 text-sm text-[#a49e92]">A few honest lines are enough.</p></div><button type="button" aria-label="Close create memory form" onClick={onClose} className="rounded p-2 text-xl text-[#a49e92] hover:bg-[#f4f1ea]">×</button></div><form onSubmit={onSubmit} className="space-y-5 p-6"><label className="block text-sm text-[#7a7469]">Title<span className="ml-1 text-[#c16e54]">*</span><input ref={titleRef} name="title" required maxLength={120} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="The thing I want to remember" className="mt-2 w-full border-b border-[#e5e1d8] bg-transparent px-0 py-3 text-xl text-[#3a352d] outline-none focus:border-[#c16e54]" /></label><label className="block text-sm text-[#7a7469]">Reflection<span className="ml-1 text-[#c16e54]">*</span><textarea name="reflection" required maxLength={5000} rows={7} value={form.reflection} onChange={(event) => setForm({ ...form, reflection: event.target.value })} placeholder="What happened? How did it feel?" className="mt-2 w-full resize-y border-b border-[#e5e1d8] bg-transparent px-0 py-3 text-base leading-7 text-[#3a352d] outline-none focus:border-[#c16e54]" /></label><label className="block text-xs text-[#a49e92]">Optional images (up to 5)<input name="photos" type="file" multiple accept="image/jpeg,image/png,image/webp" className="mt-2 block w-full text-sm text-[#7a7469]" /><span className="mt-1 block text-[10px]">JPG, PNG, or WebP · up to 10 MB each.</span></label><div className="grid gap-5 sm:grid-cols-2"><CategorySelect value={form.category} onChange={(value) => setForm({ ...form, category: value })} /><label className="block text-xs text-[#a49e92]">Visibility<select name="visibility" value={form.visibility} onChange={(event) => { const visibility = event.target.value as FormValues["visibility"]; setForm({ ...form, visibility, communityIds: visibility === "selected-community" ? form.communityIds : "" }); }} className="mt-1 w-full rounded border border-[#e5e1d8] bg-[#f4f1ea] px-3 py-2.5 text-sm text-[#3a352d]"><option value="private">Private</option><option value="selected-community" disabled={!communities.length}>Selected community</option><option value="public-discovery">Public discovery</option></select>{form.visibility === "selected-community" && <fieldset className="mt-2 rounded border border-[#e5e1d8] p-2"><legend className="px-1">Share with</legend>{communities.map((community) => <label key={community.communityId} className="flex items-center gap-2 py-1"><input type="checkbox" checked={form.communityIds.split(",").map((id) => id.trim()).includes(community.communityId)} onChange={(event) => { const ids = form.communityIds.split(",").map((id) => id.trim()).filter(Boolean); setForm({ ...form, communityIds: (event.target.checked ? [...ids, community.communityId] : ids.filter((id) => id !== community.communityId)).join(",") }); }} />{community.name}</label>)}</fieldset>}</label><input type="hidden" name="category" value={form.category} /><input type="hidden" name="communityIds" value={form.communityIds} /></div>{notice?.kind === "error" && <p role="alert" className="rounded border border-[#b56e6e] bg-[#f9e9e7] p-3 text-sm text-[#6e4e50]">{notice.text}</p>}<div className="flex justify-end gap-3 border-t border-[#e5e1d8] pt-5"><button type="button" onClick={onClose} className="rounded-lg border border-[#e5e1d8] px-4 py-2.5 text-sm text-[#7a7469]">Cancel</button><button disabled={busy} className="rounded-lg bg-[#c16e54] px-5 py-2.5 text-sm font-semibold text-white">{busy ? "Saving…" : "Save to wall"}</button></div></form></div></div>;
}
