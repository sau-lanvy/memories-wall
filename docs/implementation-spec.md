# Memories Wall Phase 1 3D Wall and Template System

## Problem Statement

The current Memories Wall implementation provides a useful 2D React prototype, but it does not yet deliver the agreed product experience. The wall is rendered as absolutely positioned HTML cards rather than a Three.js-backed spatial surface, the shell does not follow the complete Lignum Archive composition, and there is no database-defined template system or per-wall memory sizing.

The current UI also exposes capabilities that the PRD assigns to later phases, including community sharing, public discovery, reactions, search, and activity surfaces. The application uses a fixed development identity and can replace server-loaded state with localStorage without making that data-source change explicit. These gaps make the current product boundary unclear and create privacy, persistence, accessibility, and interaction risks.

## Solution

Deliver the Phase 1 personal reflection loop as a bounded, responsive, orthographic 2.5D wall backed by Three.js through React Three Fiber. Users will create private memories, optionally attach authorized image files, arrange cards on the wall, resize them using accessible presets, revisit their details, and choose from published wall templates that arrange the currently authorized memories.

The wall will use Three.js for tactile depth, paper cards, pins, shadows, textures, and lift states, while React and HTML will own the accessible shell, controls, text alternatives, details panel, forms, status announcements, and selectable 2D mode. The server repository will remain authoritative behind an authentication seam, and arrangement writes will use revision checks, explicit pending/error states, and a one-step persistent undo for template applications.

Phase 1 navigation and visibility will be private-only. Later-phase domain capabilities may remain structurally extensible but must not appear as usable product surfaces until their release phase.

## User Stories

1. As a memory author, I want to create a memory with a title, reflection, category, and private visibility, so that I can capture a meaningful moment without completing a complex form.
2. As a memory author, I want a newly saved memory to appear on my personal wall immediately, so that the save action feels concrete and trustworthy.
3. As a memory author, I want to edit a memory I own, so that I can clarify or correct my reflection after saving it.
4. As a memory author, I want to delete a memory only after confirming the destructive action, so that an accidental click cannot remove a meaningful reflection.
5. As a memory author, I want memories to be private by default and private-only in Phase 1, so that nothing is shared before sharing capabilities are deliberately launched.
6. As a memory author, I want to choose one of the seven labeled categories, so that I can scan my wall by meaning rather than relying on color alone.
7. As a memory author, I want to filter my personal wall by category, so that I can focus on a particular type of reflection.
8. As a memory author, I want to select a card to focus it and open its full details, so that the spatial wall remains scannable without hiding the complete reflection.
9. As a memory author, I want a focused card to lift visually and come to the front, so that overlapping cards remain understandable without preventing intentional stacking.
10. As a memory author, I want to drag a card across the bounded wall plane on desktop, so that I can curate a natural arrangement without manipulating a confusing 3D camera.
11. As a memory author, I want to use keyboard positioning controls instead of dragging, so that I can arrange cards without precise pointer movement.
12. As a memory author, I want to enable Snap to Grid and restore my prior freeform arrangement when disabling it, so that I can choose between a structured desk and a naturally scattered wall without losing work.
13. As a memory author, I want to resize each memory using Small, Default, and Large presets, so that I can balance information density and readability on my wall.
14. As a memory author, I want card size to persist independently on my personal wall, so that my visual curation is preserved across sessions and devices.
15. As a memory author, I want to attach a JPEG, PNG, or WebP image to a memory, so that a visual moment can accompany my reflection.
16. As a memory author, I want image upload progress, processing, and failure states to be visible, so that I know whether an attached image is actually available.
17. As a memory author, I want attached images to be protected by the memory's visibility and ownership rules, so that a private image cannot be accessed through a guessed or copied URL.
18. As a memory author, I want an image thumbnail on the card and a complete authorized image in details, so that the wall remains visual while the original remains available for revisiting.
19. As a memory author, I want to preview a wall template without changing my arrangement, so that I can compare compositions safely.
20. As a memory author, I want to explicitly apply a selected wall template, so that positions do not change merely because I opened a picker.
21. As a memory author, I want a template to arrange all memories currently visible and authorized in my active view, so that filtering and privacy boundaries are respected.
22. As a memory author, I want new memories added after a template application to use normal initial placement, so that applying a template does not silently reshuffle my existing wall.
23. As a memory author, I want templates to preserve my per-memory size and image treatment, so that a layout preset changes composition without erasing my card preferences.
24. As a memory author, I want to undo the most recent template application after reloading the page, so that an unwanted arrangement can be safely reversed.
25. As a memory author, I want template overflow to place every memory using a predictable wrapped pattern, so that no authorized memory disappears when a wall has more cards than template slots.
26. As a memory author, I want stale arrangement updates to produce a conflict message rather than overwrite a newer arrangement from another device, so that my wall is not silently damaged.
27. As a memory author, I want the desktop shell to use a collapsible sidebar, contextual details panel, and unified collapsible footer, so that navigation and utilities remain available without taking focus away from the wall.
28. As a memory author, I want the footer to expose template utilities and Start a Memory in one coherent workspace, so that creation and arrangement tools are discoverable without duplicating navigation.
29. As a memory author, I want the wall to preserve the Lignum Archive visual language—warm paper, dark wood, pins, editorial typography, grain, and tactile shadows—so that reflection feels grounded rather than like a generic productivity tool.
30. As a mobile user, I want the wall to become a readable vertical stack with touch-safe controls, so that I can revisit memories without precision dragging.
31. As a mobile user, I want a selected template to preserve its ordering and relationships when adapted to a vertical stack, so that a template remains recognizable on a small screen.
32. As a user who prefers reduced motion, I want static 3D depth without parallax or animated lifts, so that the hierarchy remains clear without motion.
33. As a user on a device where WebGL cannot initialize, I want the application to fall back automatically to an equivalent 2D representation, so that the wall remains usable.
34. As a user who prefers non-spatial interaction, I want to switch to a 2D accessible mode at any time, so that Three.js is an enhancement rather than a requirement for understanding or acting on my memories.
35. As a screen-reader user, I want cards, categories, images, focus states, arrangement controls, and save results announced semantically, so that the visual wall has an equivalent non-visual experience.
36. As a user, I want save failures to show pending, retry, conflict, and rollback states, so that the interface never presents an unsaved placement, resize, image, or arrangement as complete.
37. As a user, I want Phase 1 navigation to show only Wall, My Memories, and category views, so that later-phase features do not imply that sharing or discovery is already available.
38. As a developer, I want a development identity adapter behind a real authentication boundary, so that the prototype can run with one fixed user without making identity assumptions part of the product model.
39. As a template administrator, I want to publish named, versioned, database-defined templates with preview assets, so that users select stable arrangements rather than unexplained image filenames.
40. As a template administrator, I want template definitions protected from ordinary user edits, so that published arrangements remain trustworthy and consistent.

## Implementation Decisions

- Use Next.js App Router and React Three Fiber as the client integration for a Three.js scene. The scene will use an orthographic camera, a bounded wall plane, responsive framing, and no unrestricted orbit or zoom in Phase 1.
- Keep the highest-level ownership boundary clear: R3F renders wall depth and tactile card presentation; React and HTML render the shell, accessible text, forms, details, focus management, live announcements, and the selectable 2D mode.
- Preserve the existing freeform and snapped coordinate sets. Extend per-wall placement with a uniform size preset, and use automatic depth/z-order for focused or dragged cards rather than making depth a user-editable coordinate.
- Permit intentional overlap. Dragging and keyboard positioning change the wall-plane position; rotation remains a controlled placement property.
- Keep one personal wall per user in Phase 1 while retaining a wall identity boundary for future multiple-wall support.
- Define a wall template as a published, system-managed, versioned record. A template contains editorial metadata, a preview asset reference, normalized layout slots or regions, rotation values, and presentation-lane metadata. It is not memory content and does not add a lane field to memories.
- Seed Phase 1 templates as read-only published records. Ordinary users can list and preview them but cannot create, edit, or publish them.
- Persist the selected template ID as a per-wall preference. Applying a template is a separate explicit operation that records the applied template ID and version.
- Apply templates only to the currently visible and authorized memory set. Sort that set by creation time descending and stable memory ID, fill normalized slots in order, and use a deterministic wrapped pattern with bounded overlap for overflow.
- Keep template preview non-destructive. An explicit Apply operation writes the new arrangement to both freeform and snapped coordinate sets, preserves each memory's size and image treatment, and creates a one-step server-side undo snapshot.
- Preserve the one-step undo snapshot across reloads. Clear it after undo, another template application, or a later placement edit that makes it stale.
- Add a wall arrangement revision and use compare-and-swap semantics for placement, resize, template, and undo writes. Return an actionable conflict rather than silently accepting a stale write.
- Treat the server repository as authoritative. localStorage may be used only through an explicit demo fallback or draft-recovery path; it must not silently replace server state or convert a failed save into an apparent success.
- Put authentication behind an identity-provider seam. The normal development experience uses one fixed development identity, while authorization tests use isolated multiple-user fixtures.
- Keep Phase 1 visibility private-only in both UI and server behavior. Later visibility states, community operations, discovery, search, reactions, and activity remain deferred product surfaces.
- Support owned JPEG, PNG, and WebP file uploads with a modest size limit, explicit upload and processing states, authorized thumbnail/full-image delivery, and no arbitrary remote image URLs.
- Render image thumbnails as Three.js textures in the tactile card and provide an equivalent HTML representation with alt text and loading/error states.
- Use Small, Default, and Large semantic size presets with responsive clamping. Preserve the selected size per memory and wall; do not expose freeform width/height resizing in the first implementation.
- Use the five design template PNGs as preview/reference assets associated with structured database templates. Pixel dimensions and image contents do not define layout behavior.
- Treat the three Now/Next/Later regions as presentation lanes for initial composition and template metadata only. They adapt to a readable mobile stack and never become memory state or category.
- Reshape the application shell to match the Lignum Archive direction: collapsible sidebar, wall-centered workspace, contextual sliding details panel, and unified collapsible footer. Use `design/DESIGN.md` as the canonical token source and `design/code.html` as an interaction/layout reference where the two differ.
- Preserve the seven domain categories and pair every category accent with a text label or icon. Reuse the smaller visual accent palette without reducing the domain vocabulary.
- Keep reduced-motion mode visually informative but static: disable parallax, animated lifts, and unnecessary transitions while retaining depth hierarchy. Automatically use 2D mode only when WebGL initialization fails; expose 2D mode as an explicit user preference as well.
- Adapt templates to a vertical mobile stack while preserving deterministic order and relationships. Do not require precision dragging on small screens.
- Keep empty, loading, error, permission-denied, upload, WebGL, conflict, retry, and rollback states intentional and actionable.

## Testing Decisions

- Tests must assert externally observable behavior and domain outcomes, not Three.js mesh trees, shader internals, CSS class names, or Azure SDK implementation details.
- Use the `MemoryRepository` through the `MemoryStore` abstraction as the highest domain/persistence seam. Extend the existing in-memory repository tests for private-only Phase 1 authorization, wall placement, size presets, template selection/application, deterministic assignment, overflow, versioning, undo expiry, revisions, stale-write rejection, and image authorization.
- Keep Azure adapter tests focused on persistence mapping, serialization, and error propagation. Do not duplicate repository business-rule tests against the adapter.
- Use the rendered `WallApp` behavior seam with server actions mocked. Cover visible Phase 1 navigation, private-only creation/editing, card focus, keyboard positioning, Snap to Grid, size controls, template preview/apply/undo, pending/retry/rollback messaging, image states, 2D mode, WebGL failure fallback, reduced-motion behavior, and mobile layout behavior.
- Add tests for semantic parity: every memory action available in the 3D presentation must remain available in 2D mode, including selecting, reading details, editing, deleting, resizing, and positioning.
- Add authorization tests that prove private memories and attached images are not returned to another identity, and that later-phase sharing/discovery actions are unavailable under Phase 1 gating.
- Add deterministic template tests with different memory counts, equal timestamps, filtered authorized sets, overflow, reapplication, version changes, and later memory creation.
- Add interaction tests for one-step undo surviving reload, expiring after a later placement edit, and rejecting stale revisions without losing the current arrangement.
- Add accessibility tests for category meaning beyond color, image alt/error states, live save/conflict announcements, visible focus, keyboard positioning, and the automatic 2D fallback.
- Follow existing prior art in `src/app/wall-app.test.tsx` for rendered accessibility/user behavior and in `src/server/memory-repository.test.ts` plus `src/server/azure-table-memory-store.test.ts` for repository and storage behavior.
- Tests should cover the documented Phase 1 contract before visual polish tests. A passing test suite must not be interpreted as proof of visual fidelity unless the behavior and design comparison are separately reviewed.

## Out of Scope

- Community sharing, multiple communities, All Memories, Recently Added, public discovery, text search, reactions, activity notifications, and moderation workflows as active Phase 1 product surfaces.
- Polaroid-specific card presentation and a full media transformation pipeline beyond the agreed owned image upload, thumbnail, authorization, and error states.
- User-created or user-edited wall templates.
- Freeform 3D camera orbit, user-controlled zoom/pan, direct depth manipulation, or physics-based collaboration.
- Multiple user-facing walls, real-time collaborative placement, offline-first authoring, native clients, recommendations, popularity rankings, follower counts, and infinite scrolling.
- Migration from the current Azure Table abstraction to a different persistence engine as part of the wall/template implementation.
- Resolving all broader-release policies such as export, account deletion, retention, analytics consent, custom categories, and public moderation policy. These remain launch-readiness decisions, with attached-image and arrangement-snapshot deletion behavior specified before those features ship.
- Deriving template rules from the PNG assets or treating image dimensions as layout metadata.
- Implementing the feature by testing or depending on internal Three.js scene structure.

## Further Notes

- The PRD is the product source of truth. `docs/product_ideas.md` supplies the 3D/tactile vision, `design/DESIGN.md` supplies canonical visual tokens and layout intent, and `design/code.html` supplies a reference interaction composition where it does not conflict with the design system.
- The current implementation already provides valuable seams: server actions, repository validation/authorization, separate freeform/snapped positions, keyboard positioning, empty/error states, and category labels/icons. The implementation should extend those seams rather than duplicate business rules in the renderer.
- The current implementation audit identifies Phase 1 privacy and persistence correctness as P0 work before visual polish, followed by the 3D wall model, image delivery, template system, shell composition, and progressive visual effects.
- A template application should be treated as one atomic arrangement change from the user's perspective. Partial writes must not leave a mixed arrangement visible as successfully saved.
- The wall must render all authorized memories with progressive reduction of expensive effects and level-of-detail strategies before imposing a product-visible cap.
