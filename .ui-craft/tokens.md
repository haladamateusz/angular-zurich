# Design Tokens

## Colors

- Primitive palette: `--color-zuerich-blue-50` through `--color-zuerich-blue-950`, plus the blue-tinted neutral ramp in `src/themes/zuerich-blue.css`.
- Semantic surfaces: `--background-*`, `--card`, `--overlay`, `--surface-*`, and the stable aliases `--background-canvas`, `--background-raised`, `--background-overlay`, and `--background-sunken`.
- Text and borders: `--foreground-*`, `--muted-foreground-*`, `--border-*`, and semantic aliases including `--foreground-primary` and `--border-default`.
- Accent: `--primary` and its interaction states; `--action-primary*` provides a dark-mode-aware alias for new components.
- Status: submitted, changes requested, approved, assigned, adjusted, and rejected use the existing `--color-status-*` tokens.

## Typography

- Body: Lato via `--font-sans`.
- Display: Montserrat via `--font-display`; use `--tracking-display` on large display text.
- Supporting sans: Inter Tight via `--font-inter-tight`.
- Scale: `--type-xs` through `--type-4xl`; weights `--weight-regular`, `--weight-semibold`, and `--weight-bold`; line heights `--leading-tight` and `--leading-normal`.

## Spacing

- Base scale: `--space-1` (4px), `--space-2` (8px), `--space-3` (12px), `--space-4` (16px), `--space-5` (20px), `--space-6` (24px), `--space-8` (32px), `--space-12` (48px), `--space-16` (64px), `--space-18` (72px), and `--space-20` (80px).

## Radius

- Subtle: `--radius-subtle` (4px), for compact links and small affordances.
- Control: `--radius-control` (8px), for inputs, buttons, and compact panels.
- Surface: `--radius-surface` (12px), for cards and larger surfaces.
- Pill: `--radius-pill` (999px), for badges and avatars.

## Shadows

- `--shadow-subtle` for restrained elevation.
- `--shadow-floating` for light-mode popovers, menus, and toast surfaces.
- `--elevation-floating` is the semantic token: it changes to a border ring in dark mode.

## Motion

- Durations: `--duration-fast` (140ms), `--duration-normal` (180ms), and `--duration-slow` (360ms).
- Easings: `--ease-standard` for routine interaction and `--ease-emphasized` for entry and exit transitions.
- All animation must respect the existing reduced-motion rules.

## Layering

- `--z-base` (0), `--z-raised` (1), `--z-dropdown` (40), `--z-modal` (50), `--z-popover` (70), and `--z-toast` (100).
- New overlays must use these semantic levels rather than introducing raw `z-index` values.
