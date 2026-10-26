# our-app Design System (reference for replicating the UI in another project)

Source: `frontend/src` only. "unknown" = not determinable from code. Colors are placeholders; the `custom` column is for the human to fill.

## 0. Quick brief for the agent

**Personality:** warm, soft, rounded, glassy, app-like (installed-PWA feel on a phone). Mobile-only single column; no desktop layout exists.

**8 rules to preserve**
1. Every visual value comes from a CSS variable in `styles/tokens.css`. No hardcoded colors, spacing, radius, shadows in components (rare exceptions in section 8).
2. One column, max width `30rem` (480px), centered. Designed at 380px. There are **zero width breakpoints**; nothing reflows on desktop, it is just a centered phone column.
3. Fixed floating **pill bottom nav** (4 icon-only tabs, glass blur, sliding active indicator) + **sticky glass header** (avatar + greeting + logout). Content is padded so nothing hides behind the nav.
4. Create/edit = **bottom sheet** (portal, backdrop blur, swipe-down to dismiss, focus trap, sticky Cancel/Save bar). Never a centered modal.
5. Interactive minimum size = `--tap-target` (2.75rem / 44px). Inputs are 16px font (iOS no-zoom).
6. Cards: white surface, 1px border, `--radius-lg` (1.25rem), soft shadow. Lists rise in with a staggered `rise` animation (70ms per item, capped at index 6).
7. Every data screen has 4 states: skeleton (shimmer, `aria-busy`), error card (message + "Coba lagi" secondary button), empty (dashed box + round tinted icon + title + hint), success. Plus a global "server lagi bangun" banner after 4s of no response.
8. UI copy is Indonesian, short, sentence case. Errors via **toast** (4s, bottom, above nav); validation via **inline** error under the field; destructive actions via confirm (see section 6).

**3 things most likely to be replicated wrong**
1. **Bottom nav + sticky layers**: nav is `position: fixed`, pill-shaped, inset `1rem` from sides, `max-width: 28rem`, `backdrop-filter: blur(22px) saturate(1.6)`; indicator is a separate absolutely-positioned span translated with `--nav-index` using an overshoot easing `cubic-bezier(0.34,1.45,0.64,1)` 460ms. Header and page toolbars use translucent bg + `blur(12px)`. Page toolbars stick at `top: header-height + 1px` and bleed to the page edges with negative margin.
2. **Sheet behavior**: body scroll lock uses `position: fixed` (iOS), root extends below the safe area, panel is `92dvh` max, sticky action bar uses negative horizontal margin to bleed edge to edge, and `bottom` padding includes `env(safe-area-inset-bottom)`. Swipe starts only from header or from body scrolled to top, never from textarea/contenteditable.
3. **Two primary-button styles**: page-level "Tambah" is a gradient pill with glow shadow (`--gradient-hero`, `--shadow-glow`) and **is not** the `Button` component; the `Button` component's primary is flat color, radius `--radius-md`. Mixing them up changes the whole feel.

---

## 1. Stack and design intent

| Item | Value |
|---|---|
| Framework | React 19 + TypeScript (strict), Vite, `react-router` (BrowserRouter) |
| Data | TanStack Query (list pages use `retry: false`; the API client retries GET itself) |
| Styling | CSS Modules (`*.module.css`) + global CSS variables. No CSS framework, no CSS-in-JS |
| Component lib | None. All components hand-built in `components/` |
| Icon lib | None. Hand-drawn inline SVGs in `components/Icons.tsx`: 24x24 viewBox, `stroke=currentColor`, `strokeWidth 1.8`, round caps/joins, `width/height 1em`, `aria-hidden` |
| Fonts | System stack only: `system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`. No webfont |
| Animation lib | None. CSS keyframes/transitions, View Transitions API (one place), `requestAnimationFrame` count-up |
| Charts | `recharts` (3 chart files) plus CSS-driven chart animation |
| Rich text | Tiptap (editor in sheets) + shared `styles/rich-content.css` for read/write typography |
| Dark mode | none |
| Language | `<html lang="id">`; UI Indonesian |
| PWA | `display: standalone`, `viewport-fit=cover`, `apple-mobile-web-app-status-bar-style: black-translucent`, theme color = bg color |

**Personality (5):** warm, soft, rounded, glassy, playful-but-calm.

Global base (`styles/global.css`): `box-sizing: border-box`; body bg `--color-bg`, text `--color-text`, 16px / line-height 1.5; `overflow-x: hidden`; **scrollbars hidden everywhere** (`scrollbar-width: none`) for an app look; `h1-h3,p` margin 0; headings line-height 1.25; `button,input { font: inherit }`; `img,svg { max-width: 100% }`.

---

## 2. Tokens

### 2.1 Colors (light only; all from `styles/tokens.css`)

| Role | Token | Current value | Usage | custom |
|---|---|---|---|---|
| Background (page) | `--color-bg` | `#fbf7f4` | body, node borders, toolbar base | |
| Background (surface) | `--color-surface` | `#ffffff` | cards, sheet, inputs, header | |
| Background (muted) | `--color-surface-muted` | `#f3ece6` | tab tracks, chips, read-only blocks, close buttons, avatar halo | |
| Text | `--color-text` | `#2b2522` | body, titles | |
| Text muted | `--color-text-muted` | `#6f625b` | labels, subtitles, hints, inactive tabs | |
| Border | `--color-border` | `#e5dad2` | card/input/divider borders, grabber | |
| Primary | `--color-primary` | `#b8435f` | primary Button, active tab text, links, focus-within border | |
| Primary pressed | `--color-primary-pressed` | `#9c344e` | Button hover, selected pill text | |
| Primary surface | `--color-primary-surface` | `#fbe9ee` | active nav pill, selected pill bg, empty-state icon bg, note rail | |
| On primary | `--color-on-primary` | `#ffffff` | text on primary/danger/success fills | |
| Secondary | none (neutral surface used) | n/a | `Button secondary` = surface + border | |
| Accent (gradient) | `--gradient-hero` | `primary -> --chart-5 (#7b5ea7)` 135deg | page "Tambah" button, "Malam ini apa?" hero, edit CTA | |
| Success | `--color-success` / `-surface` | `#2e7d5b` / `#e4f3ec` | income, done status, success toast | |
| Warning | `--color-warning-surface` / `-text` | `#fff4d6` / `#6b4f00` | server-waking banner only | |
| Danger | `--color-danger` / `-surface` | `#b3261e` / `#fbe9e7` | errors, expense, delete, danger toast | |
| Info | none | n/a | info toast = inverted (`--color-text` bg, `--color-bg` text) | |
| Focus ring | `--color-focus-ring` | `#4a7fd0` | `:focus-visible` outline (blue, not brand) | |
| Skeleton | `--color-skeleton-base` / `-shine` | `#eee5de` / `#f8f2ed` | shimmer | |
| Glass surfaces | `--color-surface-glass` / `--color-nav-glass` / `--color-bg-glass` | white 85% / `#f3ece6` 62% / `#fbf7f4` 88% | header / nav / sticky toolbar | |
| Media overlay | `--color-on-media`, `-muted`, `--color-scrim-soft/strong`, `--color-glass-dark/light/faint/border`, `--color-backdrop` | white, white 78%, near-black alphas | text on photos, sheet backdrop (55%) | |
| Per-person | `--color-flow-hafizh` -> `--chart-6`; `--color-primary` -> `--chart-5` | blue->teal; primary->purple (135deg) | avatar gradients (hafizh / queen) | |
| Flow steps (Deeptalk) | `--color-flow-incident/hafizh/queen/solution` + `-surface` | amber / blue / primary / success | one accent per step; card tint via `--tone`, `--tone-surface` | |
| Rating | `--color-star`, `--color-star-muted` | `#e0a21b`, `#e5dad2` | stars | |
| Charts | `--chart-1..6`, `--chart-other`, `--cat-*`, `--flow-income/expense`, `--hafizh`, `--queen` | see file | chart series; people and categories never share colors | |
| Dark mode | none | n/a | no dark values exist | |

Semantic tinting pattern: status = pill with `*-surface` bg + solid-color text + 0.5rem dot (`currentColor`). Neutral = muted surface + muted text. In stats, negative values use soft `--flow-expense` tint, not danger red ("information, not an alarm").

### 2.2 Typography

Family: system stack. Weights: 400 / 500 (`--font-weight-medium`) / 700 (`--font-weight-bold`); 600 token exists (`--font-weight-semibold`, rarely used). Line-height: 1.5 body (`normal`), 1.25 headings (`tight`). Letter-spacing: `-0.02em` (`tight`) on titles/numbers, `0.14em` (`wide`) on uppercase eyebrows.

| Token | Size | Where used |
|---|---|---|
| `--font-size-xs` | 0.75rem (12) | pills, dates, hints, count badges, eyebrow labels, "Halo," |
| `--font-size-sm` | 0.875rem (14) | field labels, subtitles, toasts, tabs, secondary text, errors |
| `--font-size-md` | 1rem (16) | body, inputs (iOS no-zoom), buttons |
| `--font-size-lg` | 1.125rem (18) | card titles, user name, empty title, section titles |
| `--font-size-xl` | 1.375rem (22) | sheet title, amount input, Deeptalk list item title, login title |
| `--font-size-2xl` | 1.75rem (28) | page `h1`, big balance, countdown number |
| `--font-size-hero` | 2.25rem (36) | stats/detail hero amount |
| `--font-size-card-title` | 0.9375rem | stats hero label |
| `--font-size-display` | 3rem | defined; usage unknown |

Patterns:
- Page `h1`: 2xl / bold / tight spacing. Subtitle under it: sm, muted, single line with ellipsis.
- Eyebrow/section label: xs, bold or regular, `uppercase`, `letter-spacing: 0.14em` (detail `.kind`, `.panelTitle`, `.noteLabel`, `.pickLabel`, flow `.junction`).
- Numbers: `font-variant-numeric: tabular-nums` on countdown number and wallet stat values.
- Notes: italic + left rail (`border-left: 0.25rem solid --color-primary-surface`, `padding-left: 0.75rem`).
- Long text: `overflow-wrap: anywhere`; titles clamp (`-webkit-line-clamp` 3 on entertainment card, 2 on deeptalk card); notes clamp 1-3 lines; single-line text uses ellipsis.
- Uppercase via `text-transform` only on eyebrows; user name uses `capitalize`.

### 2.3 Spacing, radius, border, elevation, z-index, breakpoints, blur, opacity

| Group | Values |
|---|---|
| Spacing (4px base) | `--space-1` .25rem, `-2` .5, `-3` .75, `-4` 1, `-5` 1.25, `-6` 1.5, `-8` 2, `-10` 2.5 |
| Radius | `sm` .5rem (cover, menu item, skeleton), `md` .75rem (buttons, inputs, toasts, inner blocks), `lg` 1.25rem (cards, sheet top, empty box), `pill` 999px (nav, chips, tabs, round buttons) |
| Border | `--border-width` 1px; focus ring 2px; dashed variant for empty states and card footers |
| Shadow | `sm` 0 1 2 8% (thumb, small cards, back/step buttons); `md` 0 4 16 14% (content cards, toasts, menu); `lg` 0 14 32 22% (card hover); `header` 0 2 12 7%; `nav` 0 8 24 16%; `sheet` 0 -10 40 28%; `glow` 0 8 20 primary 32% (gradient CTAs, highlighted card) |
| z-index | tabs/indicator internals 1; ActionMenu 3; sticky toolbar 5; header and nav 10; sheet `--z-sheet` 30; floating rich toolbar 31; toast `--z-toast` 40. Only sheet/toast are tokens |
| Breakpoints | **none** (no width media queries). Only `prefers-reduced-motion` and `hover: hover` |
| Blur | `--glass-blur` 12px (header, toolbar, pills on photos); `--nav-blur` 22px (+saturate 1.6); backdrop `blur(4px)` (= glass/3); `--ambient-blur` 28px (cover glow) |
| Opacity | disabled controls `0.6` (month step `0.45`, tonight hero `0.55`, rich tool `0.4`); ambient cover glow `0.35-0.4` |

Sizing tokens: `--tap-target` 2.75rem, `--avatar-size` 2.5rem, `--avatar-size-sm` 1.5rem, `--icon-size` 1.5rem, `--icon-size-sm` 1.125rem, `--status-dot-size` .5rem, `--nav-height` 3.75rem, `--app-header-height` `4rem + safe-area-top`, `--content-max-width` 30rem, `--menu-width` 10rem, `--sheet-max-height` 92dvh, `--sheet-grabber-width` 2.5rem, `--cover-width/height` 3.5/5.25rem, `--poster-width/height` 5.5/8.25rem, `--detail-badge-size` 3.5rem, `--media-card-aspect` 16/9, `--flow-node-size` 1.75rem, `--flow-rail-width` 2px, `--chart-height` 14rem (tall 18rem).

Safe-area: `env(safe-area-inset-top/bottom)` used in header padding, nav gap, sheet root/padding, sheet action bar.

---

## 3. Layout and responsive

**App shell** (`pages/AppLayout.tsx` + css), vertical flex column, `min-height: 100dvh`:

| Layer | Behavior |
|---|---|
| Shell | `max-width: 30rem; margin-inline: auto; padding-bottom: nav-height + nav-gap + 1rem` |
| Header | `sticky; top: 0; z 10`; padding `0.75rem 1rem` (+ safe-area top); bg `--color-surface-glass` + blur 12px; bottom border + `--shadow-header`. Left: 2.5rem initial-avatar (gradient per person) + "Halo," (xs muted) over name (lg bold, capitalize, ellipsis). Right: 44px round logout icon button (hover -> danger surface/color) |
| Waking banner | Below header, in flow: `margin 0.75rem 1rem 0`, warning-surface bg, `--radius-md`, sm text, `role=status`. Text: "Server lagi bangun… mohon tunggu sebentar." Shown when any request has had no response for 4s |
| Main | `flex: 1; padding: 1rem; min-width: 0` |
| Bottom nav | `fixed`; left/right `1rem`; bottom `max(0.5rem, safe-area/2)`; height 3.75rem; padding .5rem; pill; `max-width: 28rem` centered; 4 equal grid columns, gap .25rem; glass bg + blur; `--shadow-nav` |
| Nav indicator | Absolute span, `--color-primary-surface` pill + `shadow-sm`, `translateX(index * (100% + gap))`, hidden (opacity 0) when route matches no tab |
| Nav tab | Icon only (24px), no visible text, `aria-label` carries the name. Inactive muted; active primary color + icon `scale(1.12)`; press `scale(0.88)` |

Nav tabs (fixed order): Countdown, Entertainment, Deeptalk, Keuangan. `/` redirects to `/countdown`; unknown paths too. Login page is outside the shell: centered `Card` (max 30rem) on full-height page.

**Container/grid rules**
- Everything is a vertical flex stack with `gap: var(--space-4)` (1rem) at page level, `--space-3` inside cards, `--space-2` in tight clusters.
- Page structure: `.page { display:flex; flex-direction:column; gap:1rem; min-width:0 }`. Always `min-width: 0` on flex children to allow ellipsis/wrapping.
- Page header row: `h1`+subtitle left, "Tambah" pill button right, `padding-top: 0.5rem`, `align-items: center`.
- Two-up grids: `repeat(2, minmax(0,1fr))`, gap .75rem (ratings, income/expense, form pairs). Dividers between cells via `border-left` + `padding-left: 1rem`.
- Horizontal bleed: elements that touch screen edges (sticky toolbars, pill rows, sheet action bars) use `margin-inline: calc(var(--space-4) * -1)` then re-pad with `padding-inline: var(--space-4)`.
- Photo cards use `aspect-ratio: 16/9`.

**Per-breakpoint behavior:** none defined. Wider viewports: same column centered, header/nav also clamp to 30rem/28rem (header background itself stays inside the shell width). `hover: hover` media query gates only the entertainment card lift.

**Sticky/fixed/scroll**
| Element | Behavior |
|---|---|
| Header | sticky top 0 |
| Page toolbar (`StickyToolbar`, entertainment `.toolbar`, deeptalk `.toolbar`) | sticky at `top: var(--app-header-height) + 1px`, z 5, glass bg `--color-bg-glass` + blur |
| Bottom nav | fixed |
| Sheet | fixed overlay; page scroll locked (`body position: fixed`, scroll restored on close); sheet body scrolls (`overscroll-behavior: contain`) |
| Sheet action bar | `sticky; bottom: 0` inside sheet body, top border, surface bg |
| Toast region | fixed, bottom = nav height + gap + 1rem, `pointer-events: none` |
| Scroll restoration | `useScrollRestoration`: new route -> top (instant); back/forward -> restored position; browser restoration set to manual |
| Horizontal pill rows | `overflow-x: auto`, scroll-snap x proximity, hidden scrollbar, never wrap |

---

## 4. Components

Usage counts = number of importing files. All sizes follow `--tap-target` unless stated. Focus = global `:focus-visible` unless stated.

### 4.1 Buttons

| Component | Purpose / variants | Visual traits | States | Used |
|---|---|---|---|---|
| `Button` (`components/Button.tsx`) | Form/state actions. Variants `primary` (flat primary fill, white text), `secondary` (surface + border), `ghost` (transparent, primary text). `fullWidth` prop | min-height 44px, padding `.5rem 1.25rem`, radius `md`, weight 500 | hover: primary -> pressed color; secondary/ghost -> muted surface. disabled: opacity .6, `not-allowed`. loading: label replaced by "Memproses…", `aria-busy`, disabled. No active/press style | 21 |
| Page add button (`.add`, duplicated in 4 css files) | "Tambah" with plus icon, top-right of page header | gradient pill (`--gradient-hero`), white bold text, `--shadow-glow`, icon 1.125rem | active: `scale(.96)`. no hover style | 4 pages |
| Hero CTA `TonightPick` (`pages/EntertainmentFilters.tsx`) | Random pick "Malam ini apa?" | full-width, gradient bg, `radius-lg`, glass icon circle + title/hint | active `scale(.98)`; disabled opacity .55, no shadow | 1 |
| Round icon button (many ad-hoc: logout, close, step, edit, trash) | Icon-only actions | 44px (some 40px) circle; muted/surface bg; icon 1.5rem | hover bg shift; active `scale(.94)`; disabled .6/.45 | ~10 |
| `BackLink` | Detail pages back | pill, border, shadow-sm, chevron in 2.5rem muted circle, bold sm label | active `scale(.96)` | 5 |
| `SheetActions` | Bottom bar in form sheets | `[trash? 44px danger-surface square] [Batal secondary flex:1] [Simpan primary flex:1]`. Save disabled until valid; shows "Memproses…" while saving; all disabled while any mutation runs | trash: active `scale(.94)` | 5 (+3 hand-rolled bars) |
| Detail sheet actions | In `RecordDetailSheet`: pill buttons Hapus (danger-surface), Ubah (gradient + glow); after Hapus: confirm text + Batal / "Ya, hapus" danger pill ("Menghapus…" while deleting) | pills, `flex:1`, bold, active `scale(.97)` | disabled .6 | 1 |
| `ActionMenu` trigger | 3-dot overflow | 44px circle; `glass` (dark translucent + blur, on photos) or `plain` (muted) | hover/expanded darker | 6 |

### 4.2 Inputs

| Component | Notes | Used |
|---|---|---|
| `Input` | label above (sm, 500, muted) -> input -> error (`<p>`, sm, danger). Input: min-height 44, radius `md`, 1px border, surface bg, 16px font, padding `.5rem .75rem`. `aria-invalid` -> danger border; `aria-describedby` -> error id. Date inputs reset to left-aligned, `appearance:none` (iOS overflow fix). No custom focus style (global ring) | 10 |
| `Select` | same shell as Input, native `<select>` | 4 |
| `AmountField` | Rp amount: bordered row with muted prefix (lg bold) + borderless input (xl bold, tight spacing). Focus-within -> primary border (inner outline removed). Invalid -> danger border. Value auto-grouped with thousands dots while typing | 5 |
| Textarea (inline in forms) | min-height 88px, `resize: vertical`, same border/radius, 3 rows, `maxLength` | 3 forms |
| `richEditor/RichEditor` (Tiptap) | framed (border + radius md, `overflow: clip`), top toolbar (muted bg, scrolls horizontally, 44px tool buttons, active tool = primary-surface + primary), min-height 132px, max `min(45dvh, 24rem)`, focus-within primary border, over-limit danger border + counter + "Terlalu panjang." alert. Toolbar floats above the keyboard (`fixed`, bottom = keyboard inset) when keyboard is open | Deeptalk |
| `SlideTabs` | segmented control: muted pill track (padding .25rem), white thumb slides via `--index/--count` (transition 360ms `--transition-slow`), active label primary + bold | 3 |
| `Segmented` | equal-width bordered toggle buttons, selected = solid primary | **unused** |
| `Pills` / `StatusPills` / `FilterPills` | scrollable filter pills: 44px, pill, border; selected = primary border + primary-surface bg + pressed text + bold; optional colored 8px dot; count badge (xs bold; selected -> solid primary w/ white text) | 3 impls |
| `StatsTargetPicker` | person/category target picker for stats | 1 (internals unknown) |
| File upload (`CountdownForm`) | native file input hidden behind a styled label button; preview image; status line; retry/remove buttons | 1 |

### 4.3 Cards and data display

| Component | Notes | Used |
|---|---|---|
| `Card` | surface, 1px border, `radius-lg`, padding 1rem, `shadow-sm`. In practice only used for **error/empty message blocks** (15) and login; content cards are page-local classes with `shadow-md` | 15 |
| Content card (page-local, e.g. `.card`, `.item`, `.flowCard`, `.panel`) | white, border, `radius-lg`, `shadow-md`, padding 1rem, internal gap .75-1rem; optional dashed-top footer (`border-top: 1px dashed`) | all list pages |
| Photo card (Countdown) | 16:9, photo bg or gradient fallback, bottom dark scrim, glass date pill top-left, `ActionMenu` top-right, big number (2xl bold tabular) + unit + title + 1-line note; inner 1px glass-border highlight; past = photo `grayscale(.7)` and "hari lalu" | 1 |
| Poster card (Entertainment) | poster 5.5x8.25rem + status pill + title (lg, 3-line clamp) + info + date + italic note + 2-up rating strip (avatar-sm + stars); blurred cover "ambient" glow fading into surface; whole card is one link (title link stretched with `::after`); `user-select:none` | 1 |
| Link card (Deeptalk, Finance, Wedding) | whole card is a `<Link>`; hover: shadow-lg; active: `scale(.985)`; trailing 2.5rem muted chevron circle (hover -> primary-surface) | 3 |
| Row list (`.rows` in `FinanceLayout.module.css`) | transactions grouped per day: day header (sm muted title left, bold total right) + one card of rows separated by 1px hairlines; row = 40px icon circle (income/expense tint) + title + ellipsis note + right-aligned bold amount (max 50% width) | 1 |
| Stat pair | `dl` 2-col, xs muted label with colored dot, md bold value, divider between cells | 3 |
| Hero summary | centered block, `--stats-hero-surface` gradient overlay on surface, 56px badge circle, eyebrow, hero amount (36px bold) | detail sheet, wedding, stats |
| Status pill / Chip | pill, xs bold, tone surface + tone text + dot. `Chip` component (neutral/primary/success) exists but is **unused** | pills everywhere |
| `ProgressBar` | 8px pill track (muted), fill primary (or success), width transition 150ms | 4 |
| Flow timeline (Deeptalk detail) | vertical 2px rail, 28px numbered nodes colored per step, branch bracket (dashed left border), per-step tinted empty-state box (dashed, `--tone`) | 1 |
| Avatars | initial letter in gradient circle (hafizh: blue->teal, queen: primary->purple); sizes 2.5rem / 1.5rem | many |
| `Cover` | 3.5x5.25rem image, `radius-sm`, muted placeholder on error/null, lazy, `no-referrer` | 2 |
| Charts (`*Charts.tsx`) | recharts + CSS animations (section 5); chart colors from `--chart-*`; chart heights 14rem/18rem; axis labels 10-11px (hardcoded) | stats |

### 4.4 Navigation

| Component | Notes |
|---|---|
| Bottom nav | section 3 |
| `MonthNav` | `[44px round prev] [calendar icon + month label, bold] [44px round next]`; disabled arrows opacity .45; active `scale(.94)`; labels "Bulan sebelumnya/berikutnya" (3) |
| `StickyToolbar` | sticky glass wrapper for tabs/pills (2) |
| `FinanceTabs` | `SlideTabs` "Kartu / Statistik" inside `StickyToolbar`; switches route |
| `KindTabs` (entertainment) | SlideTabs clone with icon + label per kind (Film/Series/Games/Books; labels from `KIND_LABELS`, only "Film" confirmed) |

### 4.5 Feedback

| Component | Notes |
|---|---|
| `Toast` (`ToastProvider`, `useToast().show(msg, tone)`) | tones `info` (inverted dark), `error` (danger fill), `success` (success fill). Fixed above nav, stacked column gap .5rem, auto-dismiss 4000ms, **no manual dismiss, no enter/exit animation**, radius md, shadow md, sm text, `aria-live=polite` region. Practically only `error` is used in pages |
| `Skeleton` | shimmer block (see section 5), `radius-sm` default, pages override height/radius; `aria-hidden`; container sets `aria-busy` |
| `EmptyState` | dashed 1px border, `radius-lg`, padding `2rem 1rem`, centered; 56px primary-surface circle icon, bold title (md), muted sm hint | 6 (+1 hand-rolled in Deeptalk) |
| Error card | `Card` with muted message + secondary "Coba lagi" button, left-aligned column | ~15 |
| Inline form error | sm danger text under field; Login error = danger-surface box with `role=alert` |
| Waking banner | section 3 |

### 4.6 Overlays

| Component | Notes |
|---|---|
| `Sheet` | bottom sheet via `createPortal`; backdrop `--color-backdrop` + 4px blur (fade 360ms); panel max-width 30rem, `max-height: 92dvh`, top radius `lg`, `shadow-sheet`, slide-up 360ms; grabber bar (2.5rem x .25rem) -> header (title xl + 44px round close on muted bg) -> scrolling body. `busy` prop blocks close/Escape/swipe. Props: `title`, `onClose`, `busy` | 11 |
| `RecordDetailSheet` | read-only record view in a Sheet with hero, rows (`dl` on muted bg, label left muted sm / value right 500), note block (primary left bar + uppercase label); owner-only edit/delete | 1 |
| `ActionMenu` | popover anchored top-right under trigger (`top: 100% + .5rem`), width 10rem, surface, border, `radius-md`, shadow md; items 44px, icon + label, danger tone; opens with `pop` (scale .92 -> 1, 150ms, origin top-right); closes on outside pointerdown, Escape (focus back to trigger), or selection | 6 |
| Confirm dialogs | native `window.confirm` (see section 6) |

---

## 5. Interaction and motion

**Timing tokens:** `--transition-fast` 150ms ease; `--transition-slow` 360ms `cubic-bezier(0.2,0.8,0.2,1)`; `--transition-nav` 460ms `cubic-bezier(0.34,1.45,0.64,1)` (overshoot); `--stats-ease` = `cubic-bezier(0.2,0.8,0.2,1)`; `--stats-motion-duration` 600ms; `--stats-sweep-duration` 800ms.

| Interaction | Trigger | Duration / easing | Effect |
|---|---|---|---|
| List/card entrance `rise` | mount | 360ms slow ease; delay `index * 70ms` (index capped 6); `both` (cards) / `backwards` (entertainment card) | opacity 0 -> 1, `translateY(1rem)` -> 0 |
| Detail sections `enter` | mount | 480ms stats-ease; delays 120/200/280ms; hero body children 0/60/110/160ms | fade + `translateY(1.25rem)`; topbar and hero stay still |
| Nav indicator | route change | 460ms overshoot | slides with `translateX`; icon `scale(1.12)` active, `0.88` on press |
| Tab thumb (SlideTabs, KindTabs, deeptalk tabs) | select | 360ms slow | thumb `translateX(index*100%)`; text color 150ms |
| Press feedback | `:active` | 150ms | `scale` .94-.98 depending on size (small round buttons .94, pills .96, cards .985, entertainment card .97 at 90ms) |
| Hover feedback | hover | 150ms | bg shift to muted surface (buttons/menu items), card `shadow-lg`; chevron circle -> primary-surface |
| Entertainment card hover | `hover: hover` only | 260ms stats-ease | `translateY(-0.25rem)`, `shadow-lg`, border -> primary-surface, poster `scale(1.04)` |
| Focus | `:focus-visible` | none | 2px solid `#4a7fd0` outline, offset 2px (row buttons use inset offset) |
| Sheet open | mount | 360ms slow | panel slides up from `translateY(100%)`, backdrop fades |
| Sheet close | button / Escape / backdrop absent | none | unmounts instantly (no exit animation) except swipe |
| Sheet swipe-down | touch drag on header or scrolled-to-top body | settle 220ms ease-out | follows finger; closes if drag > 25% of height or velocity > 0.5px/ms; drag start threshold 8px |
| ActionMenu open | click | 150ms | `pop` scale .92 -> 1 + fade; no exit animation |
| Toast | `show()` | none | appears/disappears instantly after 4s |
| Skeleton shimmer | while loading | 1.4s linear infinite | 90deg gradient, `background-size: 200%`, base `#eee5de` / shine `#f8f2ed`, position 200% -> -200% |
| Page transition (entertainment card -> detail) | click on card link | old 200ms ease fade-out; new 360ms slow fade-in; poster group morph 460ms slow | View Transitions API with shared element `entertainment-poster`; fallback to normal navigation if unsupported, reduced motion, or modifier key |
| Other route changes | navigation | none | no transition; scroll to top (or restore on back) |
| Stats charts | scroll into view (`IntersectionObserver`, threshold .2, plays once) | 600ms (bars `grow`, `fill-x`), 800ms (`sweep`), `pop` 240ms; bars staggered 50ms steps (to 550ms) | CSS animations `animation-play-state: paused -> running`; numbers count up 0 -> value, 600ms cubic ease-out via rAF |
| Progress bar | value change | 150ms | width transition |
| Highlighted pick (entertainment) | random pick | none extra | card gets primary border + glow shadow + gradient "pick" label |
| Reduced motion | `prefers-reduced-motion: reduce` | n/a | global rule sets all `animation-duration`/`transition-duration` to 0.01ms; nav indicator/icon transitions off; chart animations `none`; JS count-up jumps to value; view transition skipped |

Loading pattern: skeleton blocks sized to approximate the final content (heights hardcoded per page: 6rem, 8.5rem, 10rem, 13rem...; countdown uses 16:9 aspect), container `aria-busy="true"`. Auth gate shows a full-viewport skeleton (`aria-label="Memuat"`). Lazy stats route uses a 16rem skeleton fallback. Rich editor lazy-loads with a loading box and a failed state (`role=alert`).

---

## 6. UX patterns per screen type

### 6.1 Screen types

| Type | Example | Structure |
|---|---|---|
| Login | `LoginPage` | centered `Card`, "Masuk" title (xl), email + password `Input`s, error box (`role=alert`), full-width primary `Button` "Masuk". Redirects to `/` if already signed in |
| Photo-card list | Countdown | header (h1 + pill subtitle summary + Tambah) -> list of 16:9 cards |
| Filtered list | Entertainment, Deeptalk | header -> sticky toolbar (type tabs and/or status pills with counts) -> optional hero CTA -> list -> footer credits (entertainment) |
| Card hub | Keuangan | header (h1 + total subtitle + month pill) -> sticky `SlideTabs` (Kartu/Statistik) -> link cards (wallets, dating, wedding) |
| Detail | Entertainment detail, Deeptalk detail, Wedding detail | topbar (`BackLink` left, `ActionMenu` right) -> hero card -> sections; sections stagger in |
| Month ledger | Wallet, Dating | `BackLink`, header + Tambah, sticky `MonthNav`, summary stat card, filter `Pills`, day-grouped rows -> row tap opens detail sheet -> Ubah opens form sheet |
| Stats | Statistik | header -> tabs -> one filters card (target picker, month nav, range tabs 6/12 bulan) -> stacked chart sections |
| Form | all create/edit | `Sheet` + form + sticky action bar |

### 6.2 Rules

- **Primary action:** top-right pill "Tambah" on list pages (always the same label + plus icon). In forms: right-most "Simpan". In detail sheets: gradient "Ubah".
- **Info hierarchy (list card):** status/date pills on top -> title (largest) -> meta (muted sm) -> footer after dashed divider (progress, counts, chevron).
- **Navigation in:** tap whole card (link). **Out:** `BackLink` pill (label = parent name, e.g. "Keuangan"), browser back (scroll restored), bottom nav. Entertainment detail links back with `?kind=` so the list reopens on the same tab.
- **Create/edit:** open `Sheet`; form remounts per open (fresh state, fresh client UUID). Title: "Tambah X" / "Ubah X" or "X baru" / "Ubah X".
- **Validation timing:** forms use `noValidate`; validity is evaluated **live on change** (no blur validation). Save button is disabled until valid (required fields filled, numeric in range). Field-level errors appear inline under the field only when the entered value is invalid (e.g. amount out of range, number fields "Isi angka a-b atau kosongkan."), not for merely empty required fields. Optional fields labelled "(opsional)". `maxLength` on text inputs; rich editor shows counter.
- **Error placement:** field-level -> inline below field; submit/network/permission errors -> **toast (error)**; page-load errors -> error card in place of content with "Coba lagi"; login -> inline box.
- **Version conflict:** toast "Data sudah diubah di perangkat lain[. Dimuat ulang, coba lagi.]", refetch, close the sheet.
- **Success feedback:** no success toast; sheet closes and list refreshes (query invalidation). Countdown uses no extra confirmation either. Sharing/other success toasts: unknown.
- **Loading feedback:** skeleton for page data; button label "Memproses…" for submit; "Mengunggah…" status for photo upload; hero CTA hint "Memuat daftar rencana…"; waking banner after 4s; request timeout 60s, GET auto-retry delays 1s then 2s.
- **Empty states:** `EmptyState` (icon + title + hint). Two variants of copy: nothing exists ("Belum ada X" + invitation hint) vs filter has no match ("Tidak ada X di sini" / "Tidak ada item dengan status ini" + "Coba pilih filter lain."). Some screens use a plain `Card` with one line instead ("Belum ada item", "Belum ada rencana").
- **Destructive actions:**
  - In lists/forms: **native `window.confirm`** with a quoted name: `Hapus countdown "Judul"?`, `Hapus transaksi ini?`. Menu item "Hapus" is red (`tone: danger`). Form delete = red-tinted trash icon button on the left of `SheetActions`.
  - In `RecordDetailSheet`: **inline two-step confirm** inside the sheet (question text + Batal + red confirm).
  - Cascading delete states the consequence in the confirm text (`Semua isinya ikut terhapus.`).
  - Edit/delete shown only to the owner (read-only view for the other person).
- **Feedback choice summary:** toast = failures; inline = field validation + login + upload status; modal(sheet) = all forms and read-only details; native confirm = delete; banner = server cold start.
- **Microcopy:**
  - Language: Indonesian, informal-friendly ("kalian", "Malam ini apa?", "Server lagi bangun…"); sentence case; buttons are single verbs: Tambah, Ubah, Hapus, Simpan, Batal, Coba lagi, Masuk, Tutup, Keluar.
  - Greeting: "Halo," + lowercase username capitalized by CSS.
  - Ellipsis character `…` (single glyph) for in-progress text. Middle dot ` · ` separates summary parts ("12 movies · 3 selesai").
  - Dates: `17 Agustus 2026` (day, full Indonesian month, year); ranges collapse shared month/year with en dash (`10-12 Oktober 2026`); relative countdown: number + "hari lagi" / "hari lalu", or "Hari ini". Month label e.g. via `monthLabel` ("Oktober 2026" style; exact format in `api/financeModel.ts`).
  - Money: `Rp 1.250.000`, negative `-Rp 5.000`, whole rupiah, dot thousands; inputs auto-group with dots.
  - Truncation: titles clamp 2-3 lines, notes 1-3 lines, subtitles/names single-line ellipsis; user text always `overflow-wrap: anywhere`.
  - Timestamps in comments use `Intl.DateTimeFormat("id-ID")`.

---

## 7. Accessibility actually implemented

**Present**
- `<html lang="id">`; semantic `header`, `main`, `nav` (`aria-label="Navigasi utama"`), `article`, `section` (with `aria-label`/`aria-labelledby`), `dl/dt/dd` for key-value data, `ul/li` for rows, `h1` per page, `h2` for cards/sections, `form` + real `<label htmlFor>`.
- Icon-only buttons have `aria-label` in Indonesian (Keluar, Tutup, Hapus komentar, Kirim komentar, Bulan sebelumnya, Tambah pos...). Decorative icons/avatars `aria-hidden`.
- `Sheet`: `role=dialog`, `aria-modal`, `aria-labelledby`, focus moves into panel on open, **Tab focus trap**, Escape closes (blocked while `busy`), focus returns to opener.
- `ActionMenu`: `aria-haspopup=menu`, `aria-expanded`, `aria-controls`, `role=menu/menuitem`, first item focused on open, Escape closes and refocuses trigger, outside click closes.
- Toggle groups: `role=group` + `aria-label`, buttons with `aria-pressed` (tabs and pills are NOT `role=tab`).
- Inputs: `aria-invalid`, `aria-describedby` -> error id.
- Live regions: toast `role=status aria-live=polite`; waking banner `role=status`; errors `role=alert`; chart info `aria-live=polite`.
- Loading: `aria-busy` on skeleton containers; skeletons `aria-hidden`; flow progress has `role=img` with text alternative ("2 dari 4 langkah terisi").
- Focus-visible: global 2px blue ring, offset 2px; entertainment card shows the ring on the whole card when its stretched link is focused.
- Touch targets: 44px (`--tap-target`) for nearly all controls; 16px input font (no iOS zoom); `-webkit-tap-highlight-color: transparent` on nav/cards; `touch-action: manipulation` on editor tools.
- Reduced motion: global CSS override + JS checks (view transition, count-up).
- Images: decorative card photos `alt=""`; covers `alt="Cover {title}"`; previews have alt.

**Gaps**
- Scrollbars hidden globally (no visible scroll affordance).
- Bottom nav tabs have no visible text label (icon only).
- No skip link; no arrow-key navigation in tab groups, pills, or action menu (Tab only).
- Tabs use `aria-pressed` buttons, not tab/tabpanel roles.
- Toast cannot be dismissed manually and disappears after 4s with no pause.
- AmountField and RichEditor remove the native outline and rely on border color change (primary) as focus indicator.
- Some round controls are 40px, not 44px (e.g. Deeptalk `.editButton`, avatar-size chevrons are decorative).
- Contrast of muted text on tinted surfaces, and white-on-photo text: not verified (unknown).
- Native `window.confirm` is used for most deletes (not styled, not localizable).
- `maximum-scale` is not restricted (zoom allowed) - fine, not a gap.

---

## 8. Inconsistencies (canonical version first)

| # | Inconsistency | Canonical |
|---|---|---|
| 1 | Pill filter row implemented 3 times: `components/Pills.tsx` (wallet), `StatusPills` in `pages/EntertainmentFilters.tsx`, `FilterPills` in `pages/DeeptalkPage.tsx`. Deeptalk version lacks scroll-snap and edge-bleed margins | Entertainment/Pills version (snap + bleed) |
| 2 | Sliding segmented tabs implemented 3 times: `SlideTabs`, `KindTabs`, Deeptalk detail `.tabs`. Active color: primary (SlideTabs, KindTabs) vs `--color-text` (Deeptalk detail) | `SlideTabs` (primary) |
| 3 | `.add` gradient pill and `.page/.header/.heading/.title/.subtitle` CSS copied in Countdown, Entertainment, Deeptalk, FinanceLayout css | Identical values; treat as one component |
| 4 | Two primary CTA looks: flat `Button primary` vs gradient+glow pill (`.add`, edit CTA, tonight hero) | Gradient pill for page-level/hero actions; flat Button inside forms and states |
| 5 | Sheet action bar duplicated: `SheetActions`, entertainment/countdown form `.actions`, Deeptalk `.sheetActions`, `RecordDetailSheet .actions` (same CSS) | `SheetActions` |
| 6 | `BackLink` CSS duplicated in `DeeptalkDetailPage.module.css` | `BackLink` component |
| 7 | `Card` has `shadow-sm`; page content cards use `shadow-md` | `shadow-md` for content cards; `Card` only for message blocks |
| 8 | English copy mixed into Indonesian UI: Countdown subtitle ("Loading…", "No events yet", "N days left for next event", "No event to await", "The event is today"), Deeptalk ("All", "Our conversations", "No topics yet", "N topics · N open"), wallet filter "All" | Indonesian |
| 9 | Delete confirmation: `window.confirm` (lists, forms) vs inline two-step confirm (`RecordDetailSheet`) | Inline confirm is the more polished one; native confirm is the majority (unknown which is intended) |
| 10 | Empty state: `EmptyState` component vs hand-rolled in Deeptalk (different padding `2.5rem`, size 1.5x tap-target) vs plain `Card` text | `EmptyState` |
| 11 | Hardcoded values outside tokens: chart axis font 10px/11px, chart widths (12rem, 11rem, 7.5rem, 6rem), `2px` bar width, `letter-spacing: -0.01em` in sheet title, `0.75rem/0.875rem` chart sizes | Use tokens; no token exists for chart font sizes |
| 12 | Ad-hoc durations outside tokens: 90, 240, 260, 300, 400, 480, 600, 800ms, rise delay 70ms | Tokens: 150 fast / 360 slow / 460 nav / 600 stats / 800 sweep |
| 13 | Unused components: `Chip`, `Segmented` (0 importers); tokens `--font-size-display`, `--color-glass-faint`, `--stats-card-radius` (= `--radius-lg` value), `--chip-size`, `--calendar-cell` not seen in reviewed files | do not replicate unless needed |
| 14 | `AppLayout.module.css` `.header` repeats `border-bottom/background/box-shadow` twice | harmless duplication |
| 15 | z-index: only sheet (30) and toast (40) are tokens; others literal (1, 2, 3, 5, 10) | keep the scale in section 2.3 |
| 16 | Toast region sits above nav but toast z (40) > sheet (30) while its bottom offset is computed for the nav, so over a sheet it overlays the sheet's action bar | unknown if intended |
| 17 | Press-scale values vary (.88, .92, .94, .96, .97, .98, .985) | by element size: smaller = stronger |
| 18 | Focus indicator: global blue ring vs border-color-only on AmountField/RichEditor | global ring |

---

## 9. File map (all under `frontend/src/`)

| Concern | File(s) |
|---|---|
| Design tokens (colors, type, spacing, radius, shadow, z, motion, sizing) | `styles/tokens.css` |
| Global reset, base type, focus ring, reduced motion, view-transition keyframes | `styles/global.css` |
| Rich-text typography (editor + reader) | `styles/rich-content.css` |
| Entry / providers / routes | `main.tsx`, `App.tsx` (Query -> Toast -> Auth -> Router) |
| App shell: header, nav, waking banner, scroll restoration | `pages/AppLayout.tsx`, `pages/AppLayout.module.css`, `pages/useScrollRestoration.ts` |
| Auth gate / login | `auth/RequireAuth.tsx`, `pages/LoginPage.tsx` (+ css) |
| Cold-start ("server lagi bangun") signal | `api/wakingStore.ts`, `api/createApiClient.ts` (4s slow, 60s timeout, retry 1s/2s) |
| Icons | `components/Icons.tsx` |
| Buttons | `components/Button.tsx`, `SheetActions.tsx`, `BackLink.tsx`, `ActionMenu.tsx` |
| Inputs | `components/Input.tsx`, `Select.tsx`, `AmountField.tsx`, `richEditor/*`, `RichText.tsx` |
| Tabs / filters | `components/SlideTabs.tsx`, `Pills.tsx`, `Segmented.tsx` (unused), `StickyToolbar.tsx`, `FinanceTabs.tsx`, `MonthNav.tsx`, `pages/EntertainmentFilters.tsx` |
| Cards / display | `components/Card.tsx`, `Chip.tsx` (unused), `Cover.tsx`, `ProgressBar.tsx`, `EmptyState.tsx`, `pages/FinanceLayout.module.css` (shared finance blocks: card, rows, day groups, avatar, pill), `pages/EntertainmentCard.*`, `pages/CountdownPage.module.css` |
| Overlays / feedback | `components/Sheet.tsx`, `RecordDetailSheet.tsx`, `Toast.tsx`, `Skeleton.tsx` |
| Charts and stats motion | `components/WalletCharts.*`, `FinanceCharts.*`, `DatingCharts.*`, `statsMotion.ts`, `pages/StatsPage.*`, `*StatsView.*` |
| Page transition helper | `pages/viewTransition.ts` |
| Representative pages per layout type | list: `pages/CountdownPage.tsx`, `EntertainmentPage.tsx`, `DeeptalkPage.tsx`; hub: `FinancePage.tsx`; detail: `EntertainmentDetailPage.tsx`, `DeeptalkDetailPage.tsx`; ledger: `WalletPage.tsx`; forms: `EntertainmentForm.tsx`, `TransactionForm.tsx`, `CountdownForm.tsx` |
| Formatting helpers (copy conventions) | `api/countdownDate.ts` (dates), `api/financeModel.ts` (rupiah, month label), `api/deeptalkModel.ts` (date range) |
| HTML/PWA shell | `../index.html`, `../public/manifest.webmanifest` |
