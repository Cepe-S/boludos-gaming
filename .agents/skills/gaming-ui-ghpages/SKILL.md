---
name: gaming-ui-ghpages
description: >-
  Use this skill when creating or styling React components, the Dark Gaming UI theme,
  timeline visualizations, interactive roulette, or configuring Vite and GitHub Actions
  for GitHub Pages deployment.
---

# Dark Gaming UI & GitHub Pages Deployment Skill

## 1. Visual Identity ("Boludos Gaming" — GitHub High-Density + Discord Dark Layering)
- **Elevation Surfaces** (from `DESIGN.md`):
  - Canvas (`--background`): `#0B0D10` (`216 18% 5%`) — clean dark canvas without neon blur blobs.
  - Main Cards & Sidebar (`--card`): `#11141A` (`220 21% 9%`) with crisp `1px` borders `#232834` (`--border`).
  - Popovers, Sheets & Secondary (`--popover` / `--secondary`): `#181C24` (`220 20% 12%`).
  - Muted / Hover Rows (`--muted`): `#1F242E` (`220 18% 15%`).
  - Border Radius (`--radius`): `0.375rem` (`6px` / `rounded-md`).
- **Accents & Semantic Status**:
  - Primary CTA & Focus (`--primary`): Discord Blurple `#5865F2`.
  - Synchrony High / On-Time Emerald: `#10b981`.
  - Precision Margin / Warning Amber: `#f59e0b`.
  - Sanction / Humo Crimson (`--destructive`): `#DA373C` / `#f43f5e`.
  - Reserve vibrant gradients/glows strictly for the **Weighted Roulette**, semantic status pills, and **PVJ-6D** archetype visualizations.
- **Argentine Gamer Tone**:
  - Authentic, fun local expressions for a group of friends (*"¿Sale ese?"*, *"El Tribunal del Humo"*, *"Fantasma"*, *"Reloj Suizo"*, *"Tirar la Ruleta"*, *"Anotarse con ±15m"*, *"Pegar el grito en Discord"*).

## 2. Component Primitives & Layout Rules
- Use local `shadcn/ui` primitives in `src/components/ui/` imported via `@/components/ui/*` and `cn()` from `@/lib/utils`.
- Use `react-hook-form` + `zod` + `@hookform/resolvers` for forms and dialogs.
- **Use `lucide-react` with `strokeWidth={1.75}` (`w-4 h-4` in buttons/inputs/tables, `w-5 h-5` in nav/headers).**
- **UI Concisa & Icon-First**: La aplicación está dirigida a gente con conocimiento medio/alto de aplicaciones e interfaces. Eliminar párrafos explicativos, subtítulos obvios y textos repetitivos entre labels y botones; usar botones solo-ícono con `title`/`aria-label` para acciones estándar y conservar copy exclusivamente para datos, estados y errores accionables.

## 3. Interactive Visualizations Required
- **Schedule Overlap Timeline**:
  - Horizontal evening/night timeline (`19:00` to `03:00`) where each participant row shows:
    - Solid bar: `[availableFrom, availableUntil]`
    - Striped/translucent uncertainty wings: `±precisionMinutes` (`±5m`, `±15m`, `±30m`, `±60m`)
    - Highlighted vertical band showing the **Guaranteed Group Overlap Window**.
- **Synchrony & Weighted Roulette**:
  - Visual roulette slot/card animation that cycles through compatible games weighted by their Synchrony Score and lands on the winner with confetti and automatic Discord + Web Push dispatch.

## 4. GitHub Pages Compatibility
- `vite.config.ts` must use `base: './'` so static assets work seamlessly under any GitHub Pages subpath (`https://<user>.github.io/<repo>/`) without broken links.
- `.github/workflows/deploy.yml` must build and deploy `dist/` automatically on push to `main`.
