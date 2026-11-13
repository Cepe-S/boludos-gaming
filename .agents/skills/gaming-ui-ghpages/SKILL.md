---
name: gaming-ui-ghpages
description: >-
  Use this skill when creating or styling React components, the Dark Gaming UI theme,
  timeline visualizations, interactive roulette, or configuring Vite and GitHub Actions
  for GitHub Pages deployment.
---

# Dark Gaming UI & GitHub Pages Deployment Skill

## 1. Visual Identity ("Boludos Gaming")
- **Palette**:
  - Deep Obsidian Background: `#090d16` / `#0f172a`
  - Elevated Cards: `#131c31` with subtle borders `rgba(99, 102, 241, 0.2)`
  - Neon Accents:
    - Primary Cyber Indigo/Violet: `#6366f1` -> `#a855f7`
    - Synchrony High / On-Time Emerald: `#10b981`
    - Precision Margin / Warning Amber: `#f59e0b`
    - Sanction / Humo Crimson: `#f43f5e`
    - Discord Blurple: `#5865F2`
- **Argentine Gamer Tone**:
  - Authentic, fun local expressions for a group of friends (*"¿Sale ese?"*, *"El Tribunal del Humo"*, *"Fantasma"*, *"Reloj Suizo"*, *"Tirar la Ruleta"*, *"Anotarse con ±15m"*, *"Pegar el grito en Discord"*).

## 2. Interactive Visualizations Required
- **Schedule Overlap Timeline**:
  - Horizontal 24h/evening timeline (e.g., `19:00` to `03:00`) where each participant has a row showing:
    - Solid bar: `[availableFrom, availableUntil]`
    - Striped/translucent uncertainty wings: `±precisionMinutes` (`±5m`, `±15m`, `±30m`, `±60m`)
    - Highlighted vertical band showing the **Guaranteed Group Overlap Window**.
- **Synchrony & Weighted Roulette**:
  - Visual roulette wheel / slot strip animation that cycles through compatible games weighted by their Synchrony Score and lands on the winner with confetti and automatic Discord + Web Push dispatch.

## 3. GitHub Pages Compatibility
- `vite.config.ts` must use `base: './'` so static assets work seamlessly under any GitHub Pages subpath (`https://<user>.github.io/<repo>/`) without broken links.
- `.github/workflows/deploy.yml` must build and deploy `dist/` automatically on push to `main`.
