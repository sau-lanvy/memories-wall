# Memories Wall — Product Requirements Document

**Status:** Draft  
**Source of truth:** This PRD governs product requirements. `docs/product_ideas.md` supplies the product vision, and `design/DESIGN.md` plus `design/code.html` govern visual direction; this PRD takes precedence if requirements conflict.

## 1. Product Overview and Goals

### Product vision

Memories Wall is a tactile, spatial archive for capturing the small moments that shape a person’s life. It combines the emotional warmth of a physical wall of notes and photographs with the accessibility, organization, and optional community interaction of a digital workspace.

The product should make reflection feel like returning to a meaningful place, not maintaining another productivity system. Users can place memories on a visually rich wall, revisit them over time, and recognize patterns of intention, gratitude, growth, and milestones. They may keep memories personal or share selected memories with a community for encouragement and connection.

### Goals

- Make capturing a memory quick enough to do in the moment.
- Give memories a persistent, personal home that feels curated and lived-in.
- Help users scan and organize memories through categories, pins, filters, and spatial placement.
- Make returning to past memories rewarding and useful for reflection.
- Support thoughtful community sharing without making public engagement the product’s primary reward loop.
- Provide a coherent experience across desktop and mobile layouts.
- Establish a full-product north star while allowing capabilities to be delivered in deliberate phases.

### Product principles

1. **Reflection over productivity:** The wall is for noticing and remembering, not managing tasks.
2. **Warmth over clinical utility:** Physical metaphors, paper, pins, depth, and editorial typography should create emotional presence.
3. **User control over exposure:** Sharing and community participation should be optional and understandable.
4. **Low friction over completeness:** A user should be able to save a meaningful memory without filling out a complex form.
5. **Richness with structure:** The wall can feel naturally scattered while filters, categories, and snap-to-grid provide control.

### Non-goals

Memories Wall is not intended to be a general-purpose task manager, a clinical or therapeutic treatment tool, or an engagement-optimized public social network. Community features should support reflection and encouragement rather than infinite-feed consumption or popularity competition.

### Vision versus delivery scope

This PRD describes the full product vision. Individual releases should be phased around a usable reflection loop: create a memory, see it on the wall, revisit it, and optionally share it. Advanced community, media, discovery, and personalization capabilities should not be assumed to block that core loop.

## 2. Users and Core Experiences

### Primary user modes

- **Memory author:** Captures, categorizes, arranges, revisits, and controls the visibility of personal memories.
- **Community reader:** Browses memories that have been shared with them, opens details, and responds with thoughtful comments or other lightweight reactions.

Every user may occupy both modes. **My Memories** contains memories owned by the current user; **All Memories** contains all memories the current user is authorized to see; **Community** contains shared memories in selected communities. My Memories is the Phase 1 personal view; All Memories and Community become distinct surfaces when selected-community sharing launches in Phase 2. Switching among these surfaces, category views, and **Recently Added** should remain understandable and low-friction.

### Core journeys

#### 1. First visit and empty state

The first visit explains the wall as a place to pin a small intention or memory. The empty state should show the primary creation action, explain that memories can be categorized and shared selectively, and avoid requiring a user to understand the full navigation model before creating something.

#### 2. Create and place a memory

The user chooses **Start a Memory**, enters a title and reflection, selects a category, and chooses visibility. In Phase 1, visibility is shown as private-only and cannot be changed; the selected-community option becomes available in Phase 2, and public discovery in Phase 3. On save, the memory appears on the wall with a clear confirmation and can be repositioned. The creation flow should be short by default, with optional metadata or media added without obscuring the primary action.

#### 3. Browse and organize

The author scans a dense wall of cards, filters by category or ownership, and optionally enables **Snap to Grid** when a structured arrangement is preferred. The default arrangement can feel naturally scattered, while the user retains control over placement and readability.

#### 4. Focus and revisit

Selecting a card lifts or focuses it and opens a contextual details panel. The panel exposes the full memory, metadata, visibility, and available actions. Comments are available as a collapsible section so community interaction supports the memory rather than taking over the experience.

#### 5. Discover community memories

The user enters Community or Recently Added to browse shared memories in a way that complements, rather than replaces, the wall. Shared content should communicate its author and category clearly, respect visibility rules, and offer a direct path to details and responses.

#### 6. Responsive use

On desktop, the wall prioritizes spatial placement and information density. In Phase 1, mobile exposes Wall and My Memories tabs plus category filtering; Phase 2 adds Community, All Memories, and Recently Added. Cards reflow into a readable vertical stack. Essential actions remain available without requiring precise drag gestures.

### Experience assumptions

- Memories are private by default; users explicitly choose when to share them.
- Visibility has three planned states: **Private** (owner only, Phase 1), **Selected community** (members of explicitly selected communities, Phase 2), and **Public discovery** (eligible for broader discovery, Phase 3). A user can select only communities where they have membership and permission to share.
- A memory can be useful with text, title, category, and visibility alone; media and richer metadata are additive.
- Community responses are lightweight and secondary to the memory itself.
- The product should support revisiting and reflection without relying on streaks, popularity rankings, or infinite scrolling.

## 3. Functional Requirements

### Memory lifecycle

- Users can create a memory with a title, reflection text, category, visibility, and creation timestamp.
- Users can edit or delete memories they own. Deletion requires confirmation and must not affect unrelated memories.
- Users can optionally attach supported images presented in a Polaroid-style treatment. Media types, limits, and processing rules are defined before Phase 2 implementation.
- The system records the memory’s category, visibility, author, timestamps, and wall position.
- Users can change visibility after creation in the phase where that visibility state is available, subject to the permissions of the selected sharing space. Phase 1 locks memories to Private; Phase 2 permits Selected community; Phase 3 permits Public discovery.

### Wall and navigation

- The Wall displays memory cards with category indicators, readable content, and clear selected/focused states.
- Users can drag cards on desktop and persist their positions, rotation, and arrangement across sessions and devices.
- Users can enable Snap to Grid for structured alignment and disable it to restore the user’s prior freeform arrangement; toggling the setting does not discard freeform positions. The system stores separate freeform and snapped coordinates per wall. While enabled, moved cards update snapped coordinates and persist across sessions and devices; disabling restores the latest saved freeform coordinates. A new card receives both coordinate sets from its initial placement, and re-enabling Snap restores its last snapped arrangement.
- Selecting a card focuses it and opens a contextual details panel containing the full memory and available actions.
- Users can navigate among the surfaces available in their release phase: Phase 1 includes Wall, My Memories, and category views; Phase 2 adds Community, All Memories, and Recently Added; Phase 3 adds public discovery.
- The system provides category, ownership, date, and visibility filters in the core browsing experience. Text search is a Phase 2 capability, searches authorized titles and reflection text across the current user’s authorized memories, and uses case-insensitive partial matching with a recent-first default ordering.

### Community interaction

- Only memories shared with the current user or community are visible outside the owner’s private space.
- Users can comment on eligible shared memories in Phase 2.
- Comment authors can delete their own comments; memory owners can moderate comments on their memories. Reporting is required when community sharing launches: users can submit a defined report reason, receive acknowledgement, and route the report to moderation.
- Lightweight reactions are a Phase 3 capability; the product does not rank memories by popularity or expose follower counts.
- Activity indicators and notifications for relevant community responses are a Phase 2 capability, with user controls and no engagement-heavy feed.

### States, permissions, and resilience

- The product provides intentional empty, loading, error, and permission-denied states for the Wall, My Memories, All Memories, Community, Recently Added, details panel, creation flow, and upload flow.
- Destructive actions are confirmed and communicate their result.
- Private memories never appear in community or public discovery surfaces.
- Failed saves and uploads surface an actionable error and do not present unsaved work as complete.

### Accessibility and responsive behavior

- Core actions—create, navigate, filter, select, edit, delete, and read details—are available by keyboard and exposed to assistive technologies.
- Card movement has a non-drag alternative: keyboard users can focus a card, invoke position mode, move it with directional controls, and confirm or cancel the change. The interface announces the selected card and confirmed position to assistive technology.
- Category meaning is not conveyed by color alone; labels or icons accompany category pins.
- The interface respects reduced-motion preferences and avoids making hover, depth, or animation necessary to understand content.
- On mobile, cards reflow into the required readable vertical stack with touch-safe controls and no dependency on precision dragging.

### Phased capabilities

The full vision may include rich media, multiple communities, public discovery, advanced search, reactions, notifications, and personalization. These capabilities should be delivered after the core loop is reliable: create a memory, place it, find it again, and control who can see it.

## 4. Design and Interaction Principles

The canonical visual direction is the **Lignum Archive** system in `design/DESIGN.md`, expressed in the existing `design/code.html` UI. It is binding for the product’s visual intent, while implementation may adapt effects for accessibility, device capability, and performance.

### Visual language

- Treat the workspace as a tactile archive: dark oak or warm wood surfaces, paper cards, pins, ink edges, realistic shadows, and restrained physical depth.
- Use Newsreader for editorial headings and memory titles, Work Sans for readable body copy and metadata, and Space Mono for functional labels and timestamps.
- Use warm paper surfaces and high-contrast text for cards; use category pins as restrained accent colors paired with labels or icons.
- Keep shapes soft and stationery-like: subtle card rounding, pill-shaped pins/chips, and rounded action controls.
- Use generous desktop margins, visible space between cards, and a dense but legible wall that feels curated rather than algorithmically tiled.

### Interaction language

- The wall is the visual center. Creation, navigation, filtering, and utility controls remain discoverable without competing with the memories.
- Hover, focus, selection, and dragging communicate physical lift, focus, and placement. These states must also have clear non-motion and keyboard equivalents.
- The collapsible sidebar, contextual details panel, and unified collapsible footer preserve workspace focus while exposing navigation and utilities.
- The creation flow uses blotted-line inputs and wood-stain or gold-accented primary actions to maintain a journaling character.
- Copy is warm, concise, and reflective; it should invite attention without introducing streaks, urgency, or popularity pressure.

### Responsive and inclusive adaptation

- Desktop uses a fixed spatial composition with generous margins and intentional card density.
- Mobile uses a fluid stack, tabs, or sequential browsing so content remains readable and controls remain touch-safe.
- Reduced-motion preferences disable or soften lifts, parallax, and transitions without removing state information.
- Keyboard focus, screen-reader labels, visible focus indicators, text alternatives, and non-drag positioning controls are first-class requirements.
- Visual textures, shadows, and remote or expensive effects may be reduced on lower-powered devices, provided hierarchy, category meaning, and interaction state remain clear.

## 5. Technical Architecture

The repository does not currently prescribe an application stack, so this section defines technology-neutral boundaries rather than selecting a framework.

### System boundaries

- **Responsive web client:** Owns the interactive wall, card rendering, drag and focus states, Snap to Grid, responsive layout, accessibility behavior, and local interaction state.
- **Server/API layer:** Owns authentication, memory and comment CRUD, visibility and community authorization, feed/filter queries, media authorization, and notification/activity orchestration.
- **Relational persistence:** Stores users, profiles, memories, categories, visibility grants, communities, comments, reactions, timestamps, and per-user card placement.
- **Media storage:** Stores validated original uploads and generated thumbnails separately from relational records. Access must be authorized rather than exposing private objects by guessable URLs.
- **Background processing:** Handles media transformation, notifications, moderation workflows, and future search indexing without blocking the core save path.

### Data and consistency requirements

- Memory ownership, visibility, and community membership are enforced on the server for every read and write.
- Card position, rotation, and arrangement are persisted per user and wall; placement updates should tolerate retries and avoid silently overwriting newer changes.
- Search and feed queries should begin with indexed relational metadata. Phase 2 text search is limited to authorized titles and reflection text; dedicated search infrastructure is a later optimization, not a prerequisite for the core loop.
- Media uploads validate type, size, ownership, and processing status before becoming visible.
- Deletion and account/data removal must define behavior for associated comments, media, placement records, and audit requirements before public launch.

### Security and privacy baseline

- Private-by-default memories must never be returned through community, feed, search, cache, or notification paths without authorization.
- Authorization is checked server-side; client-side hiding is not a security boundary.
- Authentication credentials and session tokens are handled by an established identity provider or secure application mechanism rather than custom cryptography.
- User-controlled text and media are sanitized, validated, and safely rendered.
- Export, deletion, retention, and reporting policies are specified before broad public sharing.

### Operational requirements

- Instrument save failures, permission denials, upload failures, background-job failures, and interaction performance.
- Collect analytics conservatively around creation, revisit, sharing, and response behavior; avoid collecting private memory contents as product telemetry.
- Provide graceful loading, retry, and error states when API, storage, or background processing is unavailable.
- Preserve the visual intent while allowing reduced effects and lighter rendering on lower-powered devices.

### Deferred architectural complexity

Native clients, real-time collaborative placement, offline-first authoring, public-discovery scale, recommendation systems, and dedicated search infrastructure are deferred until the core reflection loop and privacy model are validated.

## 6. Success Metrics, Scope, and Open Decisions

### Success framework

Metrics are hypotheses to validate with baseline data and qualitative research, not launch commitments.

- **Activation:** percentage of new users who create and save a first memory.
- **Return reflection:** percentage of users who return to revisit or add memories over defined periods.
- **Reflection depth:** detail-panel opens, memories revisited after creation, and qualitative evidence that the wall helps users notice growth or meaning.
- **Healthy participation:** selected shares, meaningful comments, and reports/resolution rates, interpreted without optimizing for volume.
- **Experience quality:** save success rate, permission and upload error rates, interaction performance, accessibility task completion, and mobile usability.
- **User sentiment:** whether users describe the product as grounding, encouraging, personal, and useful for recognizing change over time.

### Measurement definitions

- **Activation** is the percentage of newly registered users who complete a successful `memory_created` event within their first seven days.
- **Return reflection** is the percentage of activated users with at least one `memory_revisited` or `memory_created` event in days 8–30 after activation.
- **Reflection depth** is measured by `memory_revisited` events, defined as opening a saved memory’s details after the creation session, and by a periodic qualitative survey.
- **Healthy participation** counts authorized `memory_shared`, `comment_created`, and `content_reported` events. “Meaningful” comments are assessed through qualitative sampling rather than inferred from length or engagement volume; report resolution is measured from submission to a moderation outcome.
- **Experience quality** uses successful versus failed save/upload events, permission-denial rates, interaction latency, and task-based accessibility/mobile usability studies. Private memory contents are never included in analytics events.
- Numeric targets, cohort size, survey instrument, and reporting cadence remain open decisions, but event names and definitions above are the implementation baseline.

### Recommended phases

#### Phase 1 — Personal reflection loop

Account and privacy foundation; private-only create, edit, and delete memories; categories; persistent wall placement; My Memories; card focus and details panel; responsive layout; keyboard, screen-reader, reduced-motion, and non-drag accessibility baseline.

#### Phase 2 — Selected community

Invite or selected-community sharing; comments and moderation controls; reporting and moderation queue; All Memories and Community surfaces; Recently Added; optional media; text search; richer filters; activity indicators or notifications.

#### Phase 3 — Broader discovery and scale

Public discovery; multiple communities; advanced search; lightweight reactions; personalization; dedicated search, recommendation, and scale optimizations where validated.

### Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Private memories leak through feeds, search, caches, or notifications. | Enforce server-side authorization on every path; test visibility boundaries. |
| Community features turn reflection into popularity competition. | Avoid rankings and follower counts; measure healthy participation and sentiment. |
| Moderation burden grows with sharing. | Start with selected access, reporting, owner controls, and clear policies before public discovery. |
| 3D effects and dense walls hurt performance or readability. | Use progressive visual effects, responsive layouts, reduced-motion support, and performance instrumentation. |
| Freeform spatial interaction excludes some users. | Provide keyboard and explicit positioning alternatives; never make drag the only path. |
| Users do not understand the product’s value quickly. | Make the empty state and first-memory flow concrete, fast, and reflective. |

### Open decisions

- Authentication and identity methods.
- Exact visibility taxonomy and community membership model.
- Media types, size limits, processing, and retention.
- Whether users can create or customize categories.
- Comment, reaction, reporting, and moderation policy.
- Data export, account deletion, and retention behavior.
- Analytics consent and the boundary around private content telemetry.
- Initial launch cohort, research plan, numeric metric targets, survey instrument, and reporting cadence.
