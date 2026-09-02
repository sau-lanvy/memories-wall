# Memories Wall Implementation Audit

**Date:** 2026-09-02  
**Target:** Phase 1 personal reflection loop, with later-phase capabilities identified separately  
**Sources:** `docs/prd.md` (product requirements), `docs/product_ideas.md` (vision), `design/DESIGN.md` and `design/code.html` (visual direction), and the current `src/` implementation

## Executive summary

The current application is a functional 2D React/Next.js prototype with a useful memory domain, server actions, Azure Table integration, local development fallback, card placement, and accessibility-oriented keyboard positioning. It does not yet implement the agreed product target: a Three.js/React Three Fiber wall, database-defined wall templates, per-memory size, image delivery, or the Phase 1-only navigation and privacy boundary.

The most urgent work is not visual polish. The current UI exposes Phase 2 and Phase 3 capabilities while using a fixed `demoUserId`, and localStorage can replace the server snapshot without communicating that the data source changed. Those issues should be resolved before presenting the prototype as a private Phase 1 product. Three.js rendering and the Lignum Archive shell are the next major implementation track.

## Agreed review baseline

- Phase 1 is the target: create, place, revisit, and privately manage memories.
- The wall is a bounded, responsive, orthographic 2.5D scene backed by Three.js through React Three Fiber.
- Cards move on the wall plane, may overlap intentionally, and persist position, rotation, and Small/Default/Large size per wall.
- Three presentation lanes may shape the initial composition, but lane names are not stored on memories.
- Wall templates are published, system-managed database records with normalized slots/regions, rotations, lane metadata, editorial names, preview assets, versioning, deterministic assignment, bounded wrapped overflow, explicit Apply, and one-step server-persisted undo.
- React/HTML owns accessible shell controls, details, forms, text alternatives, focus management, status announcements, and the selectable 2D mode. R3F owns the visual wall depth and card presentation.
- Phase 1 is private-only, has one personal wall per user, retains seven labeled categories, and uses a development identity behind an authentication seam.
- The server repository is authoritative. localStorage may support explicit demo fallback or draft recovery, but a failed save must not look successful.
- Images are owned file uploads (JPEG, PNG, or WebP) with authorized thumbnails, explicit upload failure states, and no arbitrary remote URLs.

## Requirement matrix

Status values: **Implemented**, **Partial**, **Missing**, and **Intentionally Deferred**.

### Phase 1 product requirements

| Requirement | Status | Evidence | Finding and remediation |
|---|---|---|---|
| Create a memory with title, reflection, category, visibility, and timestamp | Partial | `src/domain/memory.ts:42-58`; `src/app/wall-app.tsx:130-143`; `src/server/actions.ts:24-37` | Creation works and validates text/category, but visibility is selectable beyond Phase 1 and image handling stops at metadata. Lock Phase 1 creation to private and make upload state explicit. |
| Edit and delete owned memories with confirmation | Implemented | `src/server/memory-repository.ts:197-216, 340-342`; `src/app/wall-app.tsx:180-209, 289` | Ownership checks and delete confirmation exist. Define associated-image deletion behavior before public release. |
| Show memories on a persistent personal wall | Partial | `src/app/page.tsx:4-9`; `src/server/memory-repository.ts:112-137`; `src/domain/memory.ts:36-43` | Personal-wall placement exists, but the rendered wall is CSS/HTML rather than the agreed 3D scene and the current fallback can override server data. |
| Persist freeform and snapped placement separately | Implemented | `src/domain/memory.ts:29-34, 73-82`; `src/server/memory-repository.ts:350-369`; `src/app/wall-app.tsx:16-21, 221-240` | The coordinate sets and Snap to Grid behavior are covered and tested. Add wall revision checks before supporting cross-device arrangement edits. |
| Persist rotation and support intentional overlap | Partial | `src/domain/memory.ts:29-34`; `src/app/wall-app.tsx:298` | Rotation is modeled and cards can visually overlap, but there is no explicit focus z-order model and no Three.js depth/lift behavior. |
| Resize a memory per wall | Missing | `src/domain/memory.ts:29-43`; `src/app/wall-app.tsx:298` | No size field or control exists. Add a bounded per-wall uniform Small/Default/Large scale. |
| Use a real Three.js 3D wall | Missing | `package.json:10-24`; `src/app/wall-app.tsx:280-285` | No `three`, `@react-three/fiber`, `@react-three/drei`, WebGL canvas, scene, camera, texture, or mesh exists. |
| Keep core actions keyboard and assistive-technology accessible | Partial | `src/app/wall-app.tsx:239-263, 298`; `src/app/wall-app.test.tsx:17` | Focus, keyboard selection, position mode, and live announcements exist. Add a semantic 2D mode, explicit WebGL fallback, and accessible image loading/error states. |
| Respect reduced motion | Partial | `src/app/globals.css:13` | Global transition/animation reduction exists. It does not yet govern a 3D scene, parallax, camera behavior, or static-depth mode. |
| Reflow safely on mobile | Partial | `src/app/globals.css:11`; `src/app/wall-app.tsx:290` | Cards become a readable stack and dragging is disabled on small screens. Add mobile template adaptation, touch-safe controls, and the agreed 2D mode. |
| Provide intentional empty/loading/error/permission states | Partial | `src/app/wall-app.tsx:276-285`; `src/app/wall-app.tsx:290` | Empty and several surface states exist. Creation/upload, template preview/apply, WebGL initialization, stale writes, and retry/rollback states are not implemented. |

### Phase 1 navigation and privacy

| Requirement | Status | Evidence | Finding and remediation |
|---|---|---|---|
| Phase 1 navigation is Wall, My Memories, and category views | Missing | `docs/prd.md:99,220-223`; `src/app/wall-app.tsx:271` | The UI exposes All Memories, Community, Recently Added, and Public discovery. Hide later-phase surfaces from normal Phase 1 navigation. |
| Phase 1 visibility is private-only | Missing | `docs/prd.md:57,78,91`; `src/domain/memory.ts:5-7,42-58`; `src/app/wall-app.tsx:275,319-329` | The domain, forms, filters, and server actions actively support selected-community and public-discovery. Gate creation/editing/listing to private in Phase 1 and retain later states only behind explicit release boundaries. |
| Server-side identity and authorization protect private memories | Partial | `src/server/memory-repository.ts:45-57,112-137,373-386`; `src/server/actions.ts:12-20` | Repository ownership and visibility checks are present, but every action uses `demoUserId` (`src/server/actions.ts:24-37,42-240`). Replace it with an identity-provider seam; keep one development adapter without exposing user switching. |
| Server persistence is authoritative | Partial | `src/app/page.tsx:4-9`; `src/app/wall-app.tsx:61-74`; `src/server/azure-table-memory-store.ts:1-120` | The page reads the repository, but hydration replaces it with a localStorage snapshot and writes every state update locally. Make fallback explicit and surface server/save failures. |

### Templates and arrangements

| Requirement | Status | Evidence | Finding and remediation |
|---|---|---|---|
| Database-defined, published wall templates | Missing | `design/templates/` contains five PNGs; `src/domain/memory.ts:1-180`; `src/server/memory-repository.ts:1-470` | No template entity, schema, store methods, seed records, names, preview metadata, or user picker exists. Add a server-owned template model and published-record read path. |
| Templates use normalized slots/regions and arrange all current authorized memories | Missing | `src/server/memory-repository.ts:96-110`; `src/app/wall-app.tsx:280-285` | Current placement is generated by `defaultCoordinates(index)` only. Add deterministic creation-time/ID assignment, normalized slots, wrapped overflow, and explicit application to the active authorized set. |
| Preview then explicit Apply | Missing | No template UI or action found | Add a non-destructive preview and an atomic Apply operation. |
| Template versioning and one-step persistent undo | Missing | No arrangement history/template fields found | Persist template ID/version and a server-side previous-arrangement snapshot. Clear the snapshot after undo, another template application, or a later placement edit. |
| Stale-write conflict protection | Missing | `src/server/memory-repository.ts:350-369`; `src/server/actions.ts:47-52` | Placement writes have no wall revision/compare-and-swap token. Add revision-aware arrangement writes and actionable conflict responses. |

### Images

| Requirement | Status | Evidence | Finding and remediation |
|---|---|---|---|
| Validate owned JPEG/PNG/WebP uploads | Partial | `src/domain/memory.ts:17-24`; `src/server/actions.ts:29-31`; `src/server/memory-repository.ts:317-331` | Type and 10 MB size validation exist, and storage keys are generated. There is no blob upload, thumbnail generation, processing status, or served image URL. |
| Authorize image reads and show card/details states | Partial | `src/server/memory-repository.ts:333-337`; `src/app/wall-app.tsx:298-300` | Metadata reads use memory authorization, but the UI does not render images or expose loading/failure/alt behavior. Add authorized thumbnail/full-image delivery and both R3F and HTML representations. |

### Later-phase capabilities

| Capability | Status | Evidence | Finding |
|---|---|---|---|
| Selected-community sharing, comments, moderation, reports | Implemented for later phase | `src/server/actions.ts:62-240`; `src/server/memory-repository.ts:173-337`; `src/app/wall-app.tsx:89-105,306-331` | Useful groundwork exists, but it must be hidden and unavailable in Phase 1. |
| All Memories, Community, Recently Added | Implemented for later phase | `src/app/wall-app.tsx:271-275`; `src/server/actions.ts:62-105` | Surfaces exist and should be release-gated. |
| Text search | Implemented for later phase | `src/app/wall-app.tsx:276`; `src/server/actions.ts:108-122`; `src/server/memory-repository.ts:227-241` | Partial matching exists, but search is correctly a later-phase capability and must not appear in Phase 1. |
| Activity indicators/notifications | Implemented for later phase | `src/server/actions.ts:218-240`; `src/app/wall-app.tsx:77,271` | Preference and activity data exist; hide from Phase 1 until community responses launch. |
| Reactions and public discovery | Implemented for later phase | `src/domain/memory.ts:98-123`; `src/server/actions.ts:123-178`; `src/app/wall-app.tsx:92,306-331` | These are Phase 3 or later surfaces and should not be exposed in the Phase 1 shell. |

## Visual and interaction comparison

### Matches

- The current shell uses the intended editorial/typewriter font roles through `src/app/layout.tsx:2-10`.
- Wood, paper grain, vignette, paper cards, category accents, focus outlines, and elevated card shadows are present in `src/app/globals.css:3-12`.
- Category labels/icons accompany color in `src/domain/memory.ts:138-146` and `src/app/wall-app.tsx:298`, satisfying the design's non-color meaning requirement.
- A contextual details panel, confirmation dialog, keyboard positioning flow, and live region are present in `src/app/wall-app.tsx:239-263,289-331`.
- The current card treatment is closer to the Lignum Archive direction than a generic SaaS wall: paper surfaces, editorial headings, archive labels, pins, and warm accents are all represented.

### Material deviations

- `docs/product_ideas.md:4` requires an interactive 3D environment with natural physical depth, while `src/app/wall-app.tsx:280-285` renders absolutely positioned HTML cards and `src/app/globals.css:11` only changes their layout on mobile.
- `design/DESIGN.md:129-130` calls for named Now/Next/Later desktop composition and mobile adaptation. The current wall has no presentation-lane structure; its initial layout comes from `defaultCoordinates(index)` (`src/server/memory-repository.ts:96-110`).
- `docs/product_ideas.md:10` and `design/code.html:378-446` specify a unified collapsible footer for Recently Added and Start a Memory. The current implementation puts creation in the header and Recently Added in the sidebar (`src/app/wall-app.tsx:264-275`).
- `design/DESIGN.md:133-146` and `design/code.html:93-129` describe stronger physical depth, pins, lift, and shadow behavior. CSS approximates this, but there is no scene depth, lighting, texture mapping, or static 3D fallback.
- `design/code.html:154-180` uses a light paper-toned sidebar and a different green primary accent, while `design/DESIGN.md:105-153` defines the dark Lignum palette and typography. The current dark shell follows `DESIGN.md` more closely; the audit should treat `DESIGN.md` as the canonical token source and `code.html` as interaction/layout reference where they differ.
- The template PNGs are visual assets only (`design/templates/template-1.png` through `template-5.png`); they do not define database layout rules. Structured records must be authored from them rather than deriving behavior from pixel dimensions.

## Prioritized remediation

### P0 - Privacy and correctness before Phase 1 presentation

1. Remove Phase 2/3 controls and server paths from the Phase 1 product surface; enforce private-only create, edit, filters, and reads.
2. Replace direct `demoUserId` use with an authentication boundary and keep the demo identity as a development adapter.
3. Make repository state authoritative. Do not hydrate over server data from localStorage unless the user explicitly selected demo fallback or draft recovery.
4. Add explicit save-state handling for placement and future arrangement writes: pending, retry, conflict, and rollback.

### P1 - Core wall model

1. Add Three.js and React Three Fiber with a bounded orthographic scene and a clear R3F/HTML ownership boundary.
2. Add per-wall Small/Default/Large size, automatic focused-card z-order, static reduced-motion behavior, WebGL failure fallback, and user-selectable 2D mode.
3. Add image upload/storage/thumbnail delivery with ownership authorization and card/details loading/error/alt states.
4. Preserve the existing freeform/snapped coordinate contract while adding wall revisions and conflict-safe writes.

### P2 - Template system and Lignum shell

1. Define and seed published database templates with editorial names, preview assets, normalized slots/regions, lane metadata, and versions.
2. Implement deterministic assignment, wrapped overflow, preview, explicit Apply, atomic arrangement persistence, and one-step undo.
3. Reshape the shell around the wall-centered composition: collapsible sidebar, sliding details panel, and unified collapsible footer.
4. Implement the Now/Next/Later presentation lanes and the mobile vertical adaptation without adding lane fields to memories.

### P3 - Visual quality and scale

1. Add texture-backed paper/card materials, pins, lighting, lift states, and progressive effect reduction/LOD for dense walls.
2. Compare the implemented shell against `design/code.html` and the Lignum tokens without allowing the HTML reference's conflicting palette to override `design/DESIGN.md`.
3. Add focused tests for template assignment/overflow/versioning/undo, stale-write rejection, image delivery states, Phase 1 gating, WebGL fallback, and 2D/3D semantic parity.

## Policy decisions still required before broader release

The PRD leaves export, account deletion, retention, analytics consent, custom categories, and broader moderation policy open (`docs/prd.md:243-252`). These are not blockers for the Phase 1 rendering audit, but they must be resolved before community or public discovery launch. Deletion behavior for attached images and arrangement snapshots is directly coupled to the destructive delete flow and should be specified before image support is shipped.

## Validation boundary

This document is a source-based audit and does not claim that the agreed Three.js/template implementation exists. The current test suite covers existing React behavior and repository authorization/placement behavior (`src/app/wall-app.test.tsx`, `src/server/memory-repository.test.ts`, `src/server/azure-table-memory-store.test.ts`), but no test currently covers the missing 3D, template, resize, image-delivery, or Phase 1-gating requirements.
