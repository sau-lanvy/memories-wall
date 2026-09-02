---
name: Lignum Archive
colors:
  surface: '#13140d'
  surface-dim: '#13140d'
  surface-bright: '#393a32'
  surface-container-lowest: '#0d0f08'
  surface-container-low: '#1b1c15'
  surface-container: '#1f2019'
  surface-container-high: '#292b23'
  surface-container-highest: '#34352e'
  on-surface: '#e4e3d7'
  on-surface-variant: '#d2c4bb'
  inverse-surface: '#e4e3d7'
  inverse-on-surface: '#303129'
  outline: '#9b8e87'
  outline-variant: '#4f453f'
  surface-tint: '#dfc1ac'
  primary: '#dfc1ac'
  on-primary: '#3f2c1e'
  primary-container: '#2c1b0e'
  on-primary-container: '#9c816f'
  inverse-primary: '#715a49'
  secondary: '#e9c349'
  on-secondary: '#3c2f00'
  secondary-container: '#af8d11'
  on-secondary-container: '#342800'
  tertiary: '#ffb4ac'
  on-tertiary: '#690007'
  tertiary-container: '#470003'
  on-tertiary-container: '#ed4e47'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#fddcc7'
  primary-fixed-dim: '#dfc1ac'
  on-primary-fixed: '#28180b'
  on-primary-fixed-variant: '#584233'
  secondary-fixed: '#ffe088'
  secondary-fixed-dim: '#e9c349'
  on-secondary-fixed: '#241a00'
  on-secondary-fixed-variant: '#574500'
  tertiary-fixed: '#ffdad6'
  tertiary-fixed-dim: '#ffb4ac'
  on-tertiary-fixed: '#410003'
  on-tertiary-fixed-variant: '#92030f'
  background: '#13140d'
  on-background: '#e4e3d7'
  surface-variant: '#34352e'
typography:
  display-lg:
    fontFamily: Newsreader
    fontSize: 48px
    fontWeight: '600'
    lineHeight: 56px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Newsreader
    fontSize: 32px
    fontWeight: '500'
    lineHeight: 40px
  headline-sm:
    fontFamily: Newsreader
    fontSize: 24px
    fontWeight: '500'
    lineHeight: 32px
  body-lg:
    fontFamily: Work Sans
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Work Sans
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  label-caps:
    fontFamily: Space Mono
    fontSize: 12px
    fontWeight: '700'
    lineHeight: 16px
    letterSpacing: 0.1em
  headline-md-mobile:
    fontFamily: Newsreader
    fontSize: 28px
    fontWeight: '500'
    lineHeight: 36px
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  unit: 8px
  gutter: 24px
  margin-mobile: 16px
  margin-desktop: 40px
  card-padding: 24px
  column-gap: 32px
---

## Brand & Style
The design system embodies a "Memories Wall" aesthetic, blending the permanence of a physical oak workspace with the fluidity of a modern digital archive. It is designed to evoke a sense of grounding, nostalgia, and organized reflection. 

The style is **Tactile / Skeuomorphic**, utilizing deep textures, realistic lighting, and physical metaphors. It avoids the coldness of traditional SaaS by treating every UI element as a physical object—paper, pins, and wood—placed intentionally within a curated workspace. The target audience seeks a professional yet soulful environment for documenting milestones and growth.

## Colors
The palette is rooted in a dark, atmospheric base of **Oak and Umber**. 

- **Primary:** Deep wood tones (#2C1B0E) serve as the foundation for backgrounds and structural elements.
- **Neutral:** A warm "Paper" cream (#FDFCF0) is used for note surfaces to provide high legibility against the dark wood.
- **Accents (The "Pins"):** Vibrant colors are used sparingly to categorize memories:
    - **Vibrant Red (Milestones):** High urgency and celebration.
    - **Gold (Gratitude):** Warmth and high-value reflection.
    - **Blue (Planning):** Calm and structural.
    - **Green (Growth):** Freshness and progression.

## Typography
Typography creates a dialogue between the "Author" and the "System." 

**Newsreader** is the editorial voice, used for headings and memory titles to convey a literary, timeless quality. **Work Sans** provides a grounded, professional contrast for body descriptions and metadata, ensuring clarity even at smaller sizes. **Space Mono** is used for functional labels and timestamps, mimicking the look of a typewriter or a cataloging system, reinforcing the "Archive" concept.

## Layout & Spacing
The design system utilizes a **Fixed Grid** on desktop and a **Fluid Stack** on mobile.

- **Desktop:** A rigid three-column layout titled "Now," "Next," and "Later." Each column has a 32px gap to allow the oak background texture to remain visible, creating "air" between cards.
- **Mobile:** Columns reflow into a vertical stack. "Now" is pinned to the top, with "Next" and "Later" accessible via a horizontal tab bar or sequential scrolling.
- **Margins:** Generous outer margins (40px) create the feeling of a desk surface where items are placed away from the edges.

## Elevation & Depth
Depth is the core of this system's realism. 

- **Level 0 (Background):** A deep, dark textured oak wood grain. It should have a subtle vignette at the edges of the screen to focus attention on the center.
- **Level 1 (Cards):** These are "Paper" notes. They use a multi-layered shadow: a sharp 1px stroke (ink edge) and a diffused, 15% opacity black shadow with a 4px offset to imply they are resting just above the wood.
- **Level 2 (Pinned State):** When a card is focused or "pinned," the shadow increases in blur and offset, and a tiny "pin" icon (using the accent colors) appears at the top center, visually anchoring the paper to the background.
- **Navigation:** The app bar and side nav use a "Tonal Layer" approach—darker than the wood, with a slight matte finish to look like carved ebony or metal inserts.

## Shapes
The shape language is "Soft" (0.25rem) to mimic the natural cuts of high-quality paper and stationery. While cards are largely rectangular to maintain a professional grid, the subtle rounding prevents them from feeling sharp or aggressive.

- **Buttons:** Use `rounded-lg` (0.5rem) to differentiate interactive actions from static content.
- **Pins/Chips:** Use a full "Pill" shape to represent the rounded heads of physical push-pins.

## Components
- **Memory Cards:** Paper-colored surfaces (#FDFCF0) with a subtle vertical paper grain texture. Top-border accent lines correspond to the category (Red, Gold, Blue, Green).
- **The "Pin" Chip:** Small, circular or pill-shaped indicators that sit at the top of cards. They contain only a label or a single icon.
- **Input Fields:** Styled as "Blotted Lines." Instead of a full box, use a bottom-border only with a typewriter-style cursor to encourage a journaling feel.
- **Action Buttons:** Dark, wood-stain buttons with gold (#D4AF37) borders for primary actions, or simple text links for secondary actions.
- **Lists:** Traditional bulleted lists are replaced with small "Ink Dot" icons.
- **Side Navigation:** Vertical, slim bar with high-contrast icons. When hovered, an oak-veneer highlight appears behind the menu item.