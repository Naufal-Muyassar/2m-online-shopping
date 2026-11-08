---
name: 2m-design
description: House design rules for the 2M apps. Use before any UI, styling, layout, animation, map or component work in apps/admin-web, apps/courier-pwa, apps/customer-web, packages/config/tailwind-preset.js or packages/map, and when reviewing how a screen looks or moves.
---

# 2M design

1. Read `docs/DESIGN_SYSTEM.md` first. It holds the tokens, layout per app, components, motion and state rules, and the known gaps. The preset `packages/config/tailwind-preset.js` is the source of truth for values.
2. Load the `apple-design` skill (`.claude/skills/apple-design/SKILL.md`) for motion, materials, typography and gesture work. Where it and `DESIGN_SYSTEM.md` differ, `DESIGN_SYSTEM.md` records the 2M choice (for example Plus Jakarta Sans instead of the system font).
3. The bar is the admin Tracking screen: live map, dark rail, click-only `Segmented` tabs, floating `.material` panel. A new screen should reach that level, and reuse those pieces instead of new one-offs.
4. Reuse before adding: `Segmented`, `useThumb`, `useSwapX` with `.swap-in`, `.material`, `.card`, `.pill`, `.empty-state`, `ErrorBoundary`, and `MapView` from `@2m/map`. Add a new token or component class to the preset, never a hard-coded colour in a component.
5. A screen is never blank: handle loading, error, empty and success, and wrap admin pages in `ErrorBoundary`.
6. Verify on the isolated local Docker stack (`docs/runbook/demo.md`) at 1440, 1100 and 375 wide before calling UI work done, and show the user screenshots. Never run resets or tests against the root `.env`: it points at a hosted database.
7. When a change fixes an item in section 9 of `DESIGN_SYSTEM.md` or sets a new pattern, update that file in the same change.
