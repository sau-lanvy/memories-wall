import { useEffect, useMemo, useRef, useState, type FormEvent, type PointerEvent as ReactPointerEvent } from "react";
import { type Coordinate, type Memory, type MemoryCategory, type MemorySizePreset, type WallTemplate } from "@/domain/memory";
import { removeMemoryImageAction, createCommentAction, createMemoryAction, createReactionAction, createReportAction, deleteCommentAction, deleteMemoryAction, getActivityAction, getAllMemoriesAction, getCommunityDataAction, getPublicDiscoveryAction, getReactionAction, getRecentlyAddedAction, listCommentsAction, moderateCommentAction, removeReactionAction, searchMemoriesAction, searchPublicMemoriesAction, setActivityPreferenceAction, updateMemoryAction, updatePlacementAction, listWallTemplatesAction, applyWallTemplateAction, undoTemplateApplicationAction, type ActionResult, type WallData } from "@/server/actions";
import type { ActivityNotification, CommunityMembership, MemoryComment, Visibility } from "@/domain/memory";

const STORAGE_KEY = "memories-wall:demo-user:personal";
const initialForm = { title: "", reflection: "", category: "gratitude" as MemoryCategory, visibility: "private" as Visibility, communityIds: "" };
export type FormValues = typeof initialForm;
export type View = "wall" | "mine" | "all" | "community" | "recent" | "discovery";
export type PositionDraft = { id: string; coordinates: Coordinate };
type DragState = { id: string; offsetX: number; offsetY: number; coordinates: Coordinate; originalCoordinates: Coordinate };

export function activeCoordinates(memory: Memory, snapToGrid: boolean): Coordinate { return memory.placements.personal?.[snapToGrid ? "snapped" : "freeform"] ?? { x: 8, y: 8 }; }
function updateMemoryPosition(memories: Memory[], id: string, coordinates: Coordinate, snapToGrid: boolean): Memory[] {
  return memories.map((memory) => memory.id === id ? { ...memory, placements: { ...memory.placements, personal: { ...(memory.placements.personal ?? { freeform: coordinates, snapped: coordinates }), [snapToGrid ? "snapped" : "freeform"]: coordinates } } } : memory);
}
function clamp(value: number) { return Math.max(2, Math.min(88, value)); }
function snapCoordinate(coordinate: Coordinate): Coordinate { return { x: Math.round(coordinate.x / 8) * 8, y: Math.round(coordinate.y / 8) * 8 }; }
function commentsActionAvailable() { try { return typeof listCommentsAction === "function"; } catch { return false; } }

export function useWallInteraction({ initialData }: { initialData: WallData }) {
  const ownerId = initialData.userId ?? "demo-user";
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
  const [templateVersion, setTemplateVersion] = useState(initialData.templateVersion);
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
  const visibleMemories = useMemo(() => displayedMemories.filter((memory) => (category === "all" || memory.category === category) && (ownershipFilter === "all" || ownershipFilter === "mine" ? memory.authorId === ownerId : memory.authorId !== ownerId) && (visibilityFilter === "all" || memory.visibility === visibilityFilter) && (!fromDate || memory.createdAt.slice(0, 10) >= fromDate) && (!toDate || memory.createdAt.slice(0, 10) <= toDate)), [displayedMemories, category, ownershipFilter, visibilityFilter, fromDate, toDate, ownerId]);
  const isEmpty = displayedMemories.length === 0;
  const isOwnedView = view === "wall" || view === "mine";
  const selectedIsOwned = selected?.authorId === ownerId;
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
    if (!templateId || !isOwnedView) return;
    setBusy(true); setNotice(null);
    void applyWallTemplateAction({ templateId, expectedRevision: templateRevision }).then((result) => {
      if (!result.ok) { setNotice({ kind: "error", text: result.error }); return; }
      setData((current) => ({ ...current, memories: current.memories.map((memory) => result.data.memories.find((item) => item.id === memory.id) ?? memory), backgroundPreset: result.data.backgroundPreset, templateId: result.data.template.id, templateRevision: result.data.revision, canUndoTemplate: true }));
      setTemplateRevision(result.data.revision); setTemplateVersion(result.data.template.version); setCanUndoTemplate(true); setBackgroundPreset(result.data.backgroundPreset); setActiveTemplateId(result.data.template.id); setTemplatePreview(false); setNotice({ kind: "success", text: `${result.data.template.name} applied. You can undo this arrangement.` });
    }).catch(() => setNotice({ kind: "error", text: "The template could not be applied. Please try again." })).finally(() => setBusy(false));
  }
  function undoTemplate() {
    setBusy(true);
    void undoTemplateApplicationAction(templateRevision).then((result) => {
      if (!result.ok) { setNotice({ kind: "error", text: result.error }); return; }
      setData((current) => ({ ...current, memories: current.memories.map((memory) => result.data.memories.find((item) => item.id === memory.id) ?? memory), backgroundPreset: result.data.backgroundPreset, templateId: result.data.templateId, templateRevision: result.data.revision, canUndoTemplate: false })); setTemplateRevision(result.data.revision); setTemplateVersion(result.data.templateVersion); setCanUndoTemplate(false); setBackgroundPreset(result.data.backgroundPreset); setActiveTemplateId(result.data.templateId); setNotice({ kind: "success", text: "Previous arrangement restored." });
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
  return {
    state: {
      data, setData, hydrated, view, setView, surfaceMemories, setSurfaceMemories, communities, setCommunities,
      communityId, setCommunityId, search, setSearch, ownershipFilter, setOwnershipFilter, visibilityFilter, setVisibilityFilter,
      fromDate, setFromDate, toDate, setToDate, activity, surfaceLoading, setSurfaceLoading, surfaceError, setSurfaceError,
      surfaceErrorCode, setSurfaceErrorCode, surfaceRequestKey, setSurfaceRequestKey, category, setCategory, selectedId, setSelectedId,
      selected, displayedMemories, visibleMemories, isEmpty, isOwnedView, selectedIsOwned, composerOpen, setComposerOpen, form, setForm,
      editing, setEditing, editForm, setEditForm, confirmDelete, setConfirmDelete, notice, setNotice, busy, positionMode,
      setPositionMode, comments, commentDraft, setCommentDraft, commentsBusy, commentsOffset, commentsCanLoadMore, reacted,
      reactionBusy, reportReason, setReportReason, activityEnabled, dragId, templates, templateId, setTemplateId, templateRevision,
      templatePreview, setTemplatePreview, templateVersion, backgroundPreset, activeTemplateId, canUndoTemplate, sidebarOpen, setSidebarOpen,
      commentsOpen, setCommentsOpen, recentOpen, setRecentOpen,
    },
    actions: {
      selectMemory, openComposer, closeComposer, onCreate, beginEdit, saveEdit, submitComment, loadMoreComments, addImages,
      removeImage, removeComment, moderateCommentFromWall, reportContent, toggleReaction, toggleActivity, deleteSelected,
      persistPlacement, changeSize, applyTemplate, undoTemplate, toggleSnap, onPointerDown, onPointerMove, onPointerUp,
      startPositionMode, movePosition, confirmPosition,
    },
    refs: { canvasRef, composerTitleRef },
  };
}
