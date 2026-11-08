# 2M Design System

The house rules for the three 2M apps (admin-web, courier-pwa, customer-web). The source of truth for values is the shared preset `packages/config/tailwind-preset.js`; this file explains what they are for. Motion, materials and type follow the Apple design skill in `.claude/skills/apple-design/SKILL.md`. Where this file and the skill differ, this file records the deliberate choice for 2M.

Baseline: the admin Tracking redesign of 7 Nov 2026 (live map, dark rail, click-only segmented tabs). New screens should reach that level.

## 1. What the product needs to feel like

- **Calm and confident.** Admins watch orders all day and couriers work on the move. Nothing should blink, bounce or ask for attention unless something needs a decision.
- **One strong element per screen.** On admin Tracking that is the live map; for the courier it is the big action button; in the shop it is the product grid. Everything around it stays quiet.
- **State is never hidden.** Every list shows a count, every courier shows Online or Offline, and every empty area explains itself. A screen is never blank.
- **Indonesian, plain, sentence case.** Buttons are a verb plus an object ("Catat penarikan", "Tugaskan manual"). Errors say what happened and what to do next.

## 2. Tokens

All colours are HSL triplets on `:root`, used through Tailwind (`bg-primary`, `text-muted-foreground`, `bg-primary/10`). Never hard-code a hex value in a component. The one exception is the map pins in `packages/map/src/map.css`, which read the same variables.

### Colour ("Tinta pasir")

| Role | Token | Use |
|---|---|---|
| Page | `--background` (sand) | Body background |
| Surface | `--surface`, `--card` | Cards, inputs, solid panels |
| Ink | `--foreground` | Body text |
| Muted | `--muted`, `--muted-foreground` | Tab tracks, secondary text, inactive items |
| Primary | `--primary` (ink blue #1E3A5F), `--primary-pressed`, `--primary-surface` | Main actions, selected states, courier pin |
| Rail | `--rail`, `--rail-foreground`, `--rail-muted` | Admin sidebar and mobile dock: the heaviest, darkest surface |
| Promo | `--promo` (terracotta) | Promotions, the destination pin, the unread count badge. Never a general accent |
| Status | `success`, `warning`, `info`, `destructive`, each with a `-surface` tint | Status pills, alerts, notices |

Order status colours are the same in every app:

| Status | Pill |
|---|---|
| PENDING_PAYMENT | `pill-warning` |
| PAID, ACCEPTED | `pill-info` |
| PICKING | `pill-warning` (admin), `pill-primary` (customer) |
| ON_DELIVERY | `pill-primary` |
| DELIVERED | `pill-success` |
| FAILED, CANCELLED | `pill-danger` |

PICKING differs between admin and customer; pick one before adding a new screen that shows it.

### Type

- **Face:** Plus Jakarta Sans Variable, self-hosted through `@fontsource-variable/plus-jakarta-sans` and imported in each app's `main.tsx`; the system stack is the fallback. The skill says to prefer the system font. We override it because Segoe UI on Windows desktops made the admin look generic, and Jakarta, designed in Indonesia, fits the product.
- **Tracking depends on size.** Headings use `-0.022em` (base rule on `h1–h3`); body text stays at `0`. Do not set one letter-spacing for everything.
- **Leading:** headings 1.2, body 1.5, dense rows `leading-tight`.
- **Hierarchy comes from weight first:** page title `text-2xl font-bold`, panel title `text-xl font-bold`, row title `font-bold`, metadata `text-xs`/`text-sm` muted.
- **Numbers that change or line up** (counts, codes, money) use `tabular-nums`.

### Shape and depth

| Token | Value | Use |
|---|---|---|
| `rounded-md` | 0.75rem | Inputs, small buttons |
| `rounded-lg` / `.card` | 1.25rem | Cards, list items |
| `rounded-[1.75rem]` | 1.75rem | Large surfaces: the map frame, the floating order panel, the mobile dock |
| `rounded-full` | | Pills, avatars, icon buttons |

The bigger the surface, the larger the radius and the deeper the shadow. Shadows: `shadow-sm` for list items, `shadow-md` for cards, `shadow-lg`/`.material` for floating panels, and `shadow-glow` only under a primary hero button.

### Easing

| Name | Curve | Use |
|---|---|---|
| `settle` | `cubic-bezier(0.32, 0.72, 0, 1)` | Tabs, thumbs, content swaps. Critically damped, no overshoot |
| `slow` | `cubic-bezier(0.2, 0.8, 0.2, 1)` | Sheets, toasts, `animate-rise` |
| `nav` | `cubic-bezier(0.34, 1.45, 0.64, 1)` | Only the courier dock tab widening. The one place with overshoot |

## 3. Layout

### Admin (desktop first, works down to 375px)

- **Navigation:** a dark rail on the left at `md` and up; below that, a floating dark dock at the bottom. A light thumb slides behind the active item. "Segera" items are hidden on mobile.
- **Tracking and Pesan:** a 24rem list column, then a working area.
  - On Tracking the working area is the live map.
  - From `xl` (1280px) up, the order panel floats over the right side of the map as a `.material` sheet.
  - Below `xl` the panel stacks under the map.
- **Kurir and Saldo:** a single table card. Each row starts with an avatar, and statuses are pills with Indonesian labels, never raw enum values.
- The page never scrolls sideways at any width.

### Courier PWA (phone first)

- One centered column (`--content-max-width` 30rem), with a sticky glass header and a floating dark dock.
- Primary actions are full width and `min-h-14`. Destructive actions sit last and use `variant="destructive"`.
- The order detail shows the delivery map first (your position, the destination, a dashed line), then the receiver card.

### Customer web (phone first)

- The same 30rem column, with a full-width tab bar at the bottom.
- The tracking card shows the map while the order is ON_DELIVERY.

## 4. Components

| Component | Where | Rules |
|---|---|---|
| `Segmented` | `apps/admin-web/src/components/Segmented.tsx` | The only tab control in admin. Click, or arrow keys; no swipe. All items are visible with no horizontal scroll. Shorten labels to fit and put the full name in `title` (also used as the accessible name). Counts sit above the label when the tab is a list filter |
| `useThumb` | same file | Slides an indicator to the active element on either axis. Used by `Segmented` and the admin rail |
| `useSwapX` + `.swap-in` | same file, preset | New tab content slides in from the side of the clicked tab, starting at 35% opacity, so there is never an empty frame. Key the container by the tab id |
| `.material` / `.material-chip` | preset | Translucent floating layers: the panel over the map, the status chip on the map. Never put one translucent layer on another. Solid fallbacks exist for reduced transparency and increased contrast |
| `.card` | preset | A solid surface for a region of the page. Do not nest cards more than two deep |
| `.pill`, `.pill-dot` | preset | Status. Use the colour table above. One pill per row at most |
| `.avatar` | preset | First letter on a gradient. Add `grayscale` when the person is offline |
| `.empty-state` | preset | Dashed box with a sentence that says what will appear here and when. Centre it in the empty area (`my-auto`) |
| `ErrorBoundary` | `apps/admin-web/src/components/ErrorBoundary.tsx` | Wraps each admin page, keyed by the tab. A render error shows a message and "Coba lagi"; the sidebar stays |
| `MapView` | `packages/map` (`@2m/map`) | The only map in the codebase. `className` is required because Tailwind does not scan the package. Pins: `courier` (ink circle with a truck, `live` adds a pulse), `destination` (terracotta drop), `branch` (store tile). Pin labels go through `textContent`. Pass `fitKey` to refit when the subject changes and `fitPadding` to keep pins clear of floating UI. Markers must be memoised |
| `Button` (courier) | `apps/courier-pwa/src/components/ui/button.tsx` | Variants `primary`, `hero`, `secondary`, `destructive`; `loading` shows "Memproses…" |
| `.bubble-mine` / `.bubble-other` | preset | Chat. Mine is primary, right aligned; others are surface with a border, left aligned |
| `.sheet-backdrop` / `.sheet-panel` | preset | Bottom sheets (courier, customer). Dims the page, so use them for modal tasks only |
| `.skeleton` | preset | Loading placeholder with `role="status"` and `aria-busy` |

## 5. Motion

Follow the skill. These are the rules as 2M applies them:

1. **Feedback happens on press.** Every button and tappable row scales on `:active`: 0.96 for tabs and nav items, 0.97 for buttons, 0.985 for large rows and cards.
2. **Interruptible.** CSS transitions retarget from the current on-screen value, so clicking another tab mid-move redirects the thumb with no jump. The map pin tween reads the marker's live position before every move.
3. **No bounce by default.** Use `settle` everywhere. Overshoot only belongs to a gesture that carried momentum, and 2M has none yet (the dock is the one existing exception).
4. **No scroll-driven motion.** Nothing animates because the page scrolled. Entry animations (`animate-rise`) only on first render of a page section.
5. **The live map moves gently.** A new courier position tweens over 900ms with an ease-out curve. The view refits only when the subject changes or a pin leaves the frame, so the admin's own panning is never undone by a poll.
6. **Reduced motion.** The preset reduces every animation and transition to near zero; the map pin jumps instead of tweening and the pulse stops. Never hide content behind an animation that may not run.
7. **If a gesture is added** (drag-to-dismiss sheets, swipe actions), follow skill sections 2–6: 1:1 tracking with pointer capture, a spring that takes the release velocity, momentum projection to pick the snap point, and rubber-banding at the edges. Use a spring library for that; CSS transitions are not enough.

## 6. Materials and depth

- **Weight shows hierarchy.** The rail and dock are the heaviest (solid dark ink). The order panel is a thick translucent material (28px blur, deep shadow). Chips over the map are lighter (16px blur, soft shadow). Cards are solid.
- **Translucency only over moving or busy content**, which today means the map. Everywhere else use solid surfaces.
- **Dim to focus, float to keep flow.** A modal task (assign courier, record withdrawal) uses a dimming dialog. A parallel view (order details next to the map) floats without dimming.

## 7. States

Every data view handles four states:

| State | Treatment |
|---|---|
| Loading | `.skeleton` blocks shaped like the content |
| Error | `.alert-box` with the server's message (through `errorMessage`), or the page `ErrorBoundary` for a render error |
| Empty | `.empty-state` with a sentence about what appears here, for example "Order baru muncul di sini setelah pelanggan membayar." |
| Success | The data, plus a toast for an action the user just took |

## 8. Accessibility

- Touch targets are at least `--tap-target` (2.75rem); courier actions are 3.5rem.
- Focus uses the global `:focus-visible` ring. Never remove an outline without a replacement.
- Tabs use `role="tablist"`/`"tab"` with `aria-selected` and arrow keys. Nav items use `aria-current="page"`.
- Icons are `aria-hidden`; icon-only buttons carry an `aria-label`.
- The map is `role="application"` with a label naming what it shows. Information on the map (distance, last ping) is repeated as text in the chip.

## 9. Known gaps

These do not yet meet the standard. Fix them when touching the area:

- **Uppercase eyebrows.** The courier receiver card and the customer order header still use uppercase `.eyebrow` labels. Replace them with sentence-case labels.
- **Hidden scrollbars.** Scrollbars are hidden everywhere (preset base). That suits phones but hides scrollable regions on desktop. Consider thin visible scrollbars from `md` up.
- **Customer styling.** The customer web has not had the Tracking-level pass yet: it has the new font and map pins, but still the older surfaces.
- **No drag on sheets.** Bottom sheets cannot be dragged down to close.
- **No dark mode.** The preset declares `darkMode: ["class"]`, but no dark tokens exist.

## 10. Before shipping UI

1. Run the change on the isolated local stack (`pnpm local:up`, `pnpm local:reset`, `pnpm local:api`, `pnpm local:web`; see `docs/runbook/demo.md`) against the real API, not only a mock.
2. Check widths 1440, 1100 and 375: no horizontal scroll, no truncated tab labels, the thumb on the right item.
3. Check loading, empty and error states, and one interrupted animation (click two tabs quickly).
4. Run `pnpm typecheck`, `pnpm exec eslint .` and `pnpm build`.
