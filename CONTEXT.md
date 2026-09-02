# Memories Wall Domain

This context defines the language for a personal, spatial archive of reflections and memories.

## Memory and wall

**Memory**:
A saved reflection owned by a user, with a title, reflection text, category, visibility, timestamps, and optional attached image.
_Avoid_: Note, post, entry

**Wall**:
A user's personal space where authorized memories are arranged for viewing and revisiting. Phase 1 has one personal wall per user.
_Avoid_: Feed, dashboard

**Placement**:
A memory's position and orientation on a wall, including its freeform or snapped coordinates and its user-selected size.
_Avoid_: Layout, location

**Arrangement**:
The set of placements that determines how memories appear together on a wall. An arrangement can be manually curated or produced by a wall template.
_Avoid_: Sort order, feed order

## Wall templates

**Wall Template**:
A published, system-managed preset that arranges the currently visible and authorized memories on a wall. It is presentation data, not memory content.
_Avoid_: Memory template, card template

**Presentation Lane**:
A visual region such as Now, Next, or Later used to organize an arrangement without adding a corresponding concept to the memory.
_Avoid_: Memory state, memory category

**Template Application**:
An explicit user action that applies a selected wall template to the current arrangement and creates a reversible arrangement change.
_Avoid_: Template selection, automatic reflow

## Access and content

**Visibility**:
The rule controlling who may read a memory. Private is the Phase 1 state; selected-community and public-discovery are later planned states.
_Avoid_: Audience, publication status

**Authorized Memory Set**:
The memories the current user is permitted to read in the active wall or view.
_Avoid_: All memories, public feed

**Memory Image Gallery**:
An ordered collection of up to five images associated with a memory. The first remaining image represents the memory, and every image follows the memory ownership and visibility rules.
_Avoid_: Attached image, remote image, image post

**Category**:
A labeled meaning assigned to a memory, such as Gratitude, Milestone, Growth, Intention, Kindness, Family, or Health.
_Avoid_: Tag, channel
