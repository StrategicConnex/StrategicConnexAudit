# Design System Inspired by Apple

> Category: Media & Consumer
> Consumer electronics. Premium white space, SF Pro, cinematic imagery.

## 1. Visual Theme & Atmosphere

Apple's web language is a precision editorial system that alternates between gallery-like calm and retail-density information blocks. The visual tone stays restrained: broad neutral canvases, quiet chrome, and product imagery given almost all of the expressive weight. The interface is engineered to disappear so hardware, materials, and finish options become the narrative foreground.

Across the five analyzed pages, the rhythm is consistent but not monolithic. Marketing surfaces (homepage and Environment) use cinematic black-and-light chaptering, while commerce surfaces (Store and Shop flows) introduce tighter spacing, more utility controls, and denser card stacks without breaking the core brand grammar. The result is one system with two gears: showcase mode and transaction mode.

Typography is the stabilizer. SF Pro Display carries hero and merchandising hierarchy with compact line heights and controlled tracking, while SF Pro Text handles product metadata, navigation, filters, and dense selection UI. The typography stays understated, but the scale range is wide enough to support both billboard hero messaging and micro utility labels.

Key Characteristics:
- Binary section rhythm: deep black scenes (#000000) alternating with pale neutral fields (#f5f5f7)
- Single blue accent family for action and link semantics (#0071e3, #0066cc, #2997ff)
- Dual operating modes in one system: cinematic showcase modules and dense commerce configurators
- Heavy reliance on imagery and material finishes; UI chrome remains visually thin
- Tight headline metrics (SF Pro Display, semibold) paired with compact body/link typography (SF Pro Text)
- Pill and capsule geometry as signature action language (18px to 980px and circular controls)
- Depth used sparingly; contrast and surface separation do most of the layering work
- Multi-page color-block rhythm: black hero chapters -> pale neutral merchandising fields -> utility white retail surfaces -> dark micro-surfaces for controls

## 2. Color Palette & Roles

### Primary
- Absolute Black (#000000): Immersive hero canvases, high-drama product chapters, deep UI anchors.
- Pale Apple Gray (#f5f5f7): Main light surface for feature bands, comparison blocks, and editorial transitions.
- Near-Black Ink (#1d1d1f): Primary text and dark-fill control color on light canvases.

### Secondary & Accent
- Apple Action Blue (#0071e3): Primary action fill and focus-signaling brand accent.
- Body Link Blue (#0066cc): Inline link color optimized for long-form readability.
- High-Luminance Link Blue (#2997ff): Bright link treatment on darker scenes where stronger contrast is required.

### Surface & Background
- Pure White Canvas (#ffffff): Retail/product-list backgrounds and dense transactional sections.
- Graphite Surface A (#272729): Dark card and media-control context layer.
- Graphite Surface B (#262629): Slightly deeper dark utility layer for control groupings.
- Graphite Surface C (#28282b): Elevated dark supporting surfaces.
- Graphite Surface D (#2a2a2c): Darkest elevated step used for separation in richer dark scenes.

### Neutrals & Text
- Secondary Neutral Gray (#6e6e73): Body secondary copy, helper descriptions, tertiary metadata.
- Soft Border Gray (#d2d2d7): Dividers, subtle outlines, and muted utility containment.
- Mid Border Gray (#86868b): Stronger field outlines in product-configuration and filter contexts.
- Utility Dark Gray (#424245): Dark-neutral text/surface crossover in store contexts.

### Semantic & Accent
- Selection/Focus Signal (#0071e3): Shared focus and selected-state signal across marketing and commerce contexts.

## 3. Typography Rules

### Font Family
- Display Family: SF Pro Display, fallbacks SF Pro Icons, Helvetica Neue, Helvetica, Arial, sans-serif
- Text Family: SF Pro Text, fallbacks SF Pro Icons, Helvetica Neue, Helvetica, Arial, sans-serif

### Hierarchy
(Typography hierarchy details omitted for brevity in DESIGN.md but preserved in logic)

## 4. Component Stylings

### Buttons
- Primary Fill Action: #0071e3 background, #ffffff text, 8px radius.
- Dark Fill Action: #1d1d1f background, #ffffff text, 8px radius.

### Cards & Containers
- Rounded containers (12px-18px) for configurators.
- Larger shells (28px-36px) for featured content.

## 5. Layout Principles
- Base unit: 8px.
- Spacing steps: 4, 8, 16, 24, 32, 48, 64.

## 6. Depth & Elevation
- Depth is restrained. Tonal contrast and surface stepping are preferred over shadows.
