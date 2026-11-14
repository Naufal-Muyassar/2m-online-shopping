# 2M Design System

The house rules for the three 2M apps (admin-web, courier-pwa, customer-web). The source of truth for values is the shared preset `packages/config/tailwind-preset.js`; this file explains what they are for. Motion, materials and type follow the Apple design skill in `.claude/skills/apple-design/SKILL.md`. Where this file and the skill differ, this file records the deliberate choice for 2M.

Direction since 14 Nov 2026: **warm Swiss grid**. Sand page, flat warm-white surfaces, crisp 1px borders, one ink-blue accent, a bold type scale, and a full-strength hairline rule above each section. Depth is reserved for things that really float (the order panel over the map, the dock, sheets, dialogs, toasts). The admin Tracking screen (live map, dark rail, click-only segmented tabs, floating panel) is still the bar for a new screen.

## 1. What the product needs to feel like

- **Calm and confident.** Admins watch orders all day and couriers work on the move. Nothing should blink, bounce or ask for attention unless something needs a decision.
- **One strong element per screen.** On admin Tracking that is the live map; for the courier it is the ink status panel and its big action button; in the shop it is the ink hero and the product grid. Everything around it stays quiet.
- **State is never hidden.** Every list shows a count, every courier shows Online or Offline, and every empty area explains itself. A screen is never blank.
- **Indonesian, plain, sentence case.** Buttons are a verb plus an object ("Catat penarikan", "Tugaskan manual"). Errors say what happened and what to do next. Labels are sentence case, never uppercase.

## 2. Tokens

All colours are HSL triplets on `:root`, used through Tailwind (`bg-primary`, `text-muted-foreground`, `bg-primary/10`). Never hard-code a hex value in a component. Map shapes and pins read the same variables through the classes in `packages/map/src/map.css`.

### Colour ("Tinta pasir")

| Role | Token | Use |
|---|---|---|
| Page | `--background` (sand) | Body background |
| Surface | `--surface`, `--card` | Cards, lists, inputs, solid panels |
| Ink | `--foreground` | Body text, section rules, selected chips, segmented thumb, stepper frame |
| Muted | `--muted`, `--muted-foreground` | Tab tracks, icon tiles, secondary text |
| Hairline | `--border`, `--input` | 1px borders; `--input` is the stronger one for controls and dashed frames |
| Primary | `--primary` (ink blue #1E3A5F), `--primary-pressed`, `--primary-surface` | The one accent: primary buttons, links, avatars, the courier pin |
| Rail | `--rail`, `--rail-foreground`, `--rail-muted` | The heaviest surface: admin rail, docks, `.panel-ink`, toasts, auth brand panels |
| Promo | `--promo` (terracotta) | A signal, never a general accent: the destination pin, the unread count badge, promotions |
| Status | `success`, `warning`, `info`, `destructive`, each with a `-surface` tint | Status pills, alerts, notices |

Order status colours are the same in every app:

| Status | Pill |
|---|---|
| PENDING_PAYMENT | `pill-warning` |
| PAID, ACCEPTED | `pill-info` |
| PICKING | `pill-warning` (admin, courier), `pill-primary` (customer) |
| ON_DELIVERY | `pill-primary` |
| DELIVERED | `pill-success` |
| FAILED, CANCELLED | `pill-danger` |

PICKING differs between admin and customer; pick one before adding a new screen that shows it.

### Type

- **Face:** Plus Jakarta Sans Variable, self-hosted through `@fontsource-variable/plus-jakarta-sans` and imported in each app's `main.tsx`; the system stack is the fallback. The skill says to prefer the system font. We override it because Segoe UI on Windows desktops made the admin look generic, and Jakarta, designed in Indonesia, fits the product.
- **Scale.** Use the type classes, not ad-hoc sizes:

| Class | Size | Use |
|---|---|---|
| `.t-display` | 2.25–3.75rem fluid, 800, tracking -0.04em | One per screen at most: the shop hero, auth brand panels, the courier welcome |
| `.t-headline` | 1.75–2.375rem fluid, 800 | Page title (`h1`), a receiver's name, the courier status |
| `.t-title` | 1.1875rem, 700 | Section and card titles |
| `.t-figure` | 1.875–2.5rem fluid, 800, tabular | The one number that matters: a total, a balance |
| `.t-label` | 0.75rem, 600, muted, tracking +0.01em | Metadata, field hints, table headers, timestamps |

- **Tracking depends on size.** Display and headline tighten and add word-spacing so the word gaps stay open; body stays at `0`; labels open up slightly.
- **Numbers that change or line up** (counts, codes, money, times) use `tabular-nums`. Order codes and prices are `font-extrabold tracking-tight`.
- **The section rule.** `.section-head` puts a 1px ink line above a section, the title on the left and a count or action on the right. It replaces boxed section headers.

### Shape and depth

| Token | Value | Use |
|---|---|---|
| `rounded-md` / `--radius` | 0.625rem | Buttons, inputs, chips, icon tiles |
| `rounded-lg` / `.card` / `.list` | 0.875rem | Cards, ruled lists, product tiles, map frames in a column |
| `rounded-xl` | 1rem | `.panel-ink`, dialogs |
| `rounded-2xl` | 1.25rem | The largest surfaces: the admin map frame and the floating order panel |
| `rounded-full` | | Pills, avatars, count badges only |

Surfaces are flat: a 1px `--border` and no shadow. Shadows belong to floating layers only: `.material`, `.dock`, `.sheet-panel`, `.dialog-panel`, `.toast`, and a faint lift on `.card-link:hover`. Primary and danger buttons carry an inset top highlight so they read as a pressable key. No gradients.

### Easing

| Name | Curve | Use |
|---|---|---|
| `settle` | `cubic-bezier(0.32, 0.72, 0, 1)` | Tabs, thumbs, content swaps, arrow nudges, dialogs. Critically damped, no overshoot |
| `slow` | `cubic-bezier(0.2, 0.8, 0.2, 1)` | Sheets, toasts, `animate-rise` |
| `nav` | `cubic-bezier(0.34, 1.45, 0.64, 1)` | Only the courier dock tab widening. The one place with overshoot |

## 3. Layout

Check every screen at 375, 768, 1100 and 1440. The page never scrolls sideways. A grid that stacks on phones needs `grid-cols-1`, and a grid child that holds a horizontal scroller needs `min-w-0`, or the track grows past the viewport.

### Admin (desktop first, works down to 375px)

- **Navigation:** an ink rail on the left at `md` and up; below that, a floating ink dock at the bottom. A sand thumb slides behind the active item. "Segera" items are hidden on mobile.
- **Header:** a 4rem bar with a bottom hairline: search (Tracking only), branch select, avatar, "Keluar". On phones the search drops to its own row.
- **Tracking and Pesan:** a 24rem list column, then a working area.
  - On Tracking the working area is the live map. The selected order card is solid ink; a late card is destructive.
  - From `xl` (1280px) up, the order panel floats over the right side of the map as a `.material` sheet. It is 24rem wide and can be widened with a grip on its left edge (shown on panel hover or keyboard focus; drag, arrow keys, double-click to reset) up to a quarter of the window, never capped below 32rem. The width is saved per browser and the map's fit padding follows it.
  - The order list keeps a 6px inset inside its scroll box so the 4px late ring on a selected card is never clipped.
  - Below `xl` the panel stacks under the map; below `lg` the list is capped in height so the map stays reachable.
- **Kurir and Saldo:** a `.data-table` in a card. Each row starts with an avatar, statuses are pills with Indonesian labels. Under 768px every row becomes a labelled block (`data-label`, `data-primary`, `data-actions` on the cells).

### Courier PWA (phone first)

- One centred column (`--content-max-width` 34rem), with a sticky header and a floating ink dock. From 768px the column sits on a `--muted` page with side hairlines, so it reads as a deliberate sheet.
- Home leads with the ink status panel and its action, then the balance row, the four-tile `Layanan` grid (one frame, shared hairlines) and the job list.
- Actions use `Button` (full width, 3.5rem). Destructive actions sit last and use `variant="destructive"`.
- The Chat tab is a list: the branch admin first, then the customer chats that are still open. Back in a chat room returns to the page it was opened from (the list, an order, Home); a room opened directly falls back to its order, else to the Chat tab.
- The order detail shows the two-step progress rule, the delivery map (your position, the destination, a dashed line), then the receiver card.

### Customer web (phone first, wide from 768px)

- A sticky header with the 2M mark and the branch switcher. From `md` the destinations are text links in the header; below that, a full-width tab bar at the bottom with a short ink bar over the current tab.
- Content sits in a 72rem shell. Pages that have two concerns split at `lg`: catalogue (category rail + grid), cart and checkout (items + sticky summary), order (timeline and tracking + items and totals), address form (map + fields). List pages (branch picker, chat list, account) use the full shell width like the other tabs. `.page-narrow` (44rem, left-aligned to the shell edge) is for forms and single messages (address, mock pay, payment return).
- Below `md` the catalogue's category chips move into a bottom sheet behind a filter button beside the search field; the button turns ink while a category is active. From `md` the chips show inline (a scroll row, then the rail at `lg`).
- The tracking card shows the map while the order is ON_DELIVERY.
- Login and register split into an ink brand panel and the form at `lg`.

## 4. Components

| Component | Where | Rules |
|---|---|---|
| `.btn` + `.btn-primary` / `-secondary` / `-ghost` / `-danger` / `-danger-quiet` / `-invert` / `-invert-outline`; sizes `.btn-lg`, `.btn-sm`, `.btn-block` | preset | The only buttons. One primary per view. `-invert*` only on ink. `.btn-sm` is for table rows and grows to the tap target on touch |
| `Button` (courier) | `apps/courier-pwa/src/components/ui/button.tsx` | `btn btn-lg btn-block`; variants `primary`, `secondary`, `destructive`; `loading` shows "Memproses…" |
| `.link`, `.link-danger` | preset | Inline text actions ("Ubah", "Hapus", "Belanja lagi"). The underline strengthens on hover |
| `.icon-btn`, `.send-btn` | preset | Square icon buttons; icon-only buttons carry an `aria-label` |
| `.field`, `.field-label`, `.option-row`, `.file-picker`, `.stepper`, `.meter` | preset | Form controls. Focus is a primary border plus a 3px ring. `.option-row` makes the whole row the radio's hit area |
| `.chip` | preset | Filter chips with `aria-pressed`; selected is solid ink |
| `Segmented` | `apps/admin-web/src/components/Segmented.tsx` | The only tab control in admin. Click, or arrow keys; no swipe. All items are visible with no horizontal scroll. Shorten labels to fit and put the full name in `title` (also used as the accessible name). Counts sit above the label when the tab is a list filter |
| `useThumb` | same file | Slides an indicator to the active element on either axis. Used by `Segmented` and the admin rail |
| `useSwapX` + `.swap-in` | same file, preset | New tab content slides in from the side of the clicked tab, starting at 35% opacity, so there is never an empty frame. Key the container by the tab id |
| `.card`, `.card-link`, `.card-footer` | preset | A flat bordered surface for a region of the page. Do not nest cards more than two deep |
| `.list`, `.list-row`, `.row-arrow` | preset | Rows that share one frame and hairline dividers. Prefer this to a stack of separate cards. The arrow nudges on hover |
| `.panel-ink` | preset | Solid ink block. One per screen at most |
| `.section-head` | preset | The editorial rule above a section |
| `.data-table` | preset | Admin tables; stacks under 768px |
| `Dialog` | `apps/admin-web/src/components/Dialog.tsx` | Admin modal. Rendered through a portal on `<body>`, because `backdrop-filter` on the order panel would otherwise trap a fixed child inside it |
| `.material` / `.material-chip` | preset | Translucent floating layers: the panel over the map, the status chip on the map. Never put one translucent layer on another. Solid fallbacks exist for reduced transparency and increased contrast |
| `.pill`, `.pill-dot` | preset | Status. Use the colour table above. One pill per row at most |
| `.avatar` | preset | First letter on a flat primary tint. Add `grayscale` when the person is offline |
| `.empty-state` | preset | Dashed box with a sentence that says what will appear here and when. Centre it in the empty area (`my-auto`) |
| `ErrorBoundary` | `apps/admin-web/src/components/ErrorBoundary.tsx` | Wraps each admin page, keyed by the tab. A render error shows a message and "Coba lagi"; the sidebar stays |
| `MapView` | `packages/map` (`@2m/map`) | The live map. `className` is required because Tailwind does not scan the package. Pins: `courier` (ink circle with a truck, `live` adds a pulse), `destination` (terracotta drop), `branch` (store tile). Pin labels go through `textContent`. Pass `fitKey` to refit when the subject changes and `fitPadding` to keep pins clear of floating UI. Markers must be memoised |
| `MapPicker` | `apps/customer-web/src/features/address/MapPicker.tsx` | The address pin picker. Uses the `map-2m` frame and the `.map-area`, `.map-area-center`, `.map-pick` classes for colour |
| `.bubble-mine` / `.bubble-other`, `.chat-day` | preset | Chat. Mine is primary, right aligned; others are surface with a border, left aligned |
| `.sheet-backdrop` / `.sheet-panel` / `.dialog-backdrop` / `.dialog-panel` | preset | Bottom sheets (courier) and centred dialogs. They dim the page, so use them for modal tasks only |
| `.toast` | preset | Ink toast with a status dot; errors are solid destructive |
| `.skeleton` | preset | Loading placeholder with `role="status"` and `aria-busy` |

Add a new token or component class to the preset. Do not rebuild a button, row or panel from utilities inside a feature file.

## 5. Motion

Follow the skill. These are the rules as 2M applies them:

1. **Feedback happens on press.** Every button and tappable row responds on `:active`: 0.96 for tabs and nav items, 0.97 for buttons, 0.99 for cards; list rows darken instead of scaling.
2. **Hover is quiet and physical.** A border darkens to ink, an arrow moves 3px with `settle`, a product icon scales a little. Hover styles sit under `@media (hover: hover)` so a tapped control on a phone does not keep its hover colour.
3. **Interruptible.** CSS transitions retarget from the current on-screen value, so clicking another tab mid-move redirects the thumb with no jump. The map pin tween reads the marker's live position before every move.
4. **No bounce by default.** Use `settle` everywhere. Overshoot only belongs to a gesture that carried momentum, and 2M has none yet (the dock is the one existing exception).
5. **No scroll-driven motion.** Nothing animates because the page scrolled. Entry animations (`animate-rise`, a 0.5rem lift) only on first render of a page section.
6. **The live map moves gently.** A new courier position tweens over 900ms with an ease-out curve. The view refits only when the subject changes or a pin leaves the frame, so the admin's own panning is never undone by a poll.
7. **Reduced motion.** The preset reduces every animation and transition to near zero; the map pin jumps instead of tweening and the pulse stops. Never hide content behind an animation that may not run.
8. **If a gesture is added** (drag-to-dismiss sheets, swipe actions), follow skill sections 2–6: 1:1 tracking with pointer capture, a spring that takes the release velocity, momentum projection to pick the snap point, and rubber-banding at the edges. Use a spring library for that; CSS transitions are not enough.

## 6. Materials and depth

- **Weight shows hierarchy.** The rail, docks and `.panel-ink` are the heaviest (solid ink). The order panel is a thick translucent material (28px blur, deep shadow). Chips over the map are lighter (16px blur, soft shadow). Cards and lists are flat.
- **Translucency only over moving or busy content**, which today means the map, plus the sticky headers and the customer tab bar that content scrolls under. Everywhere else use solid surfaces.
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
- Focus uses the global `:focus-visible` ring (2px, offset 2px); on ink surfaces the ring turns sand. Fields swap the outline for a border and ring. Never remove an outline without a replacement.
- Tabs use `role="tablist"`/`"tab"` with `aria-selected` and arrow keys. Nav items use `aria-current="page"`. Filter chips use `aria-pressed`.
- Icons are `aria-hidden`; icon-only buttons carry an `aria-label`.
- The map is `role="application"` with a label naming what it shows. Information on the map (distance, last ping) is repeated as text in the chip.
- Scrollbars are thin and visible from 768px up, hidden on phones. Use `.no-scrollbar` only on a horizontal chip row.

## 9. Known gaps

These do not yet meet the standard. Fix them when touching the area:

- **No drag on sheets.** Bottom sheets cannot be dragged down to close.
- **No dark mode.** The preset declares `darkMode: ["class"]`, but no dark tokens exist. The ink surfaces (rail, dock, `.panel-ink`) are the only dark elements.
- **Product photos.** Product tiles show a category icon on a tint; there are no product images yet.

## 10. Before shipping UI

1. Run the change on the isolated local stack (`pnpm local:up`, `pnpm local:reset`, `pnpm local:api`, `pnpm local:web`; see `docs/runbook/demo.md`) against the real API, not only a mock.
2. Check widths 1440, 1100, 768 and 375: no horizontal scroll, no truncated tab labels, the thumb on the right item.
3. Check loading, empty and error states, and one interrupted animation (click two tabs quickly).
4. Run `pnpm typecheck`, `pnpm exec eslint .` and `pnpm build`.
