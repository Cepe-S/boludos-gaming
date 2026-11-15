# DESIGN.md — UI Architecture & Design System (Vite + React + GitHub Pages)

## 1. Core Aesthetic & Design Direction

- **Layout & Information Architecture (GitHub Style):** High-density, structured, and crisp layout. Use 1px hairline borders (`border-border`), clear visual hierarchy via compact headers, clean data tables, and compartmentalized navigation (compact left sidebar + sticky contextual top header).
- **Atmosphere & Color Palette (Discord Gamer Style):** Deep dark-mode surfaces layered by elevation rather than heavy drop shadows or background glow blobs. High contrast for primary text, vibrant saturated accents for primary actions (Discord Blurple `#5865F2`), semantic status badges, the Synchrony Roulette, and PVJ-6D radar/archetype visualizations.
- **Forms (Minimalist & Elegant):** Clean, uncluttered, single-column or split-panel settings layouts (similar to GitHub Settings) with subtle focus rings, high readability, and compact inline validation powered by `react-hook-form` + `zod`.

---

## 2. Tech Stack & Component Library Setup (Vite + React)

This project runs on **Vite + React** and is deployed to **GitHub Pages**. Agents must strictly adhere to the following library stack and usage patterns:

### Mandatory Libraries

1. **Component Primitives:** `shadcn/ui` (built on `@radix-ui/*` + `tailwindcss`).
   - *Rule:* Do NOT install Material UI, Chakra UI, Bootstrap, or Ant Design.
   - *Usage:* Components live locally inside `src/components/ui/`. Import them using the `@/` path alias (e.g., `import { Button } from "@/components/ui/button"`).
2. **Utility Styling:** `tailwindcss` + `clsx` + `tailwind-merge` (via the `cn()` helper in `src/lib/utils.ts`).
   - *Usage:* Always wrap conditional or merged class names in `cn(...)`.
3. **Icons:** `lucide-react`.
   - *Usage:* Standard stroke width (`1.75` or `2`). Use `w-4 h-4` (`16px`) inside buttons, inputs, and table rows; use `w-5 h-5` (`20px`) in navigation items and section headers.
4. **Forms & Validation:** `react-hook-form` + `zod` + `@hookform/resolvers`.
   - *Usage:* Always pair with shadcn's `<Form />`, `<FormField />`, `<FormItem />`, `<FormLabel />`, `<FormControl />`, and `<FormMessage />` components for consistent spacing and accessible error states.

### GitHub Pages Constraints (CRITICAL)

- **Routing:** If using `react-router-dom`, preserve `HashRouter` or ensure `BrowserRouter` uses `basename={import.meta.env.BASE_URL}` so client-side routes do not break on GitHub Pages subpaths.
- **Static Assets:** Reference local images/icons via relative imports or prefix public paths with `${import.meta.env.BASE_URL}` instead of hardcoded root `/` paths. Keep `base: './'` in `vite.config.ts`.

---

## 3. Color Tokens & CSS Variables (`src/index.css`)

Configure Tailwind CSS variables under `:root` / `.dark` to enforce the following dark-mode elevation hierarchy (from deepest background to highest interactive surface):

```css
:root, .dark {
  /* Surface Hierarchy (Discord-inspired layering) */
  --background: 216 18% 5%;          /* #0B0D10 - App Canvas / Deepest layer */
  --card: 220 21% 9%;                /* #11141A - GitHub-style main cards & panels */
  --popover: 220 20% 12%;            /* #181C24 - Dropdowns, tooltips, modals, sheets */
  --secondary: 220 20% 12%;          /* #181C24 - Secondary buttons & elevated inputs */
  --muted: 220 18% 15%;              /* #1F242E - Subtle hover rows & disabled states */

  /* Borders (GitHub-style 1px crisp dividers) */
  --border: 222 20% 17%;             /* #232834 - Default 1px border */
  --input: 222 20% 17%;              /* #232834 - Form input border */

  /* Typography */
  --foreground: 220 13% 95%;         /* #F2F3F5 - Primary headings & high-emphasis text */
  --card-foreground: 220 13% 95%;    /* #F2F3F5 */
  --popover-foreground: 220 13% 95%; /* #F2F3F5 */
  --secondary-foreground: 220 13% 95%;
  --muted-foreground: 215 9% 61%;    /* #949BA4 - Descriptions, labels, metadata */

  /* Gamer Accents (Discord Blurple & Status) */
  --primary: 235 86% 65%;            /* #5865F2 - Primary CTA & active focus */
  --primary-foreground: 0 0% 100%;   /* #FFFFFF */
  --accent: 222 20% 16%;             /* #202531 - Subtle interactive hover surface */
  --accent-foreground: 220 13% 95%;
  --ring: 235 86% 65%;               /* #5865F2 - Focus ring glow */

  /* Semantic Status */
  --destructive: 358 68% 54%;        /* #DA373C - Errors & destructive actions */
  --destructive-foreground: 0 0% 100%;

  --radius: 0.375rem;                /* 6px - Crisp GitHub-like border radius */
}
```

---

## 4. Component Architecture & View Layouts

- **App Shell (`src/components/layout/`):**
  - `AppSidebar`: Compact left sidebar (`#11141A` + `1px` right border `#232834`) with Discord-style Group Switcher, primary navigation (`Sesiones & Ruleta`, `Catálogo & ADN`, `Tribunal del Humo`, `Grupos & Config`), quick tools, and bottom User Profile Dock.
  - `AppHeader`: Sticky contextual top bar (`h-14`) with breadcrumbs, invite code quick copy, today's auto-schedule pill, connection indicator, and slide-over `Sheet` triggers for **Chat Global**, **Notificaciones Push**, and **Feed Discord**.
- **Sessions Command Center (`src/components/sessions/`):**
  - Dense **Bento Grid** layout showing simultaneously:
    1. **Schedule Overlap Timeline** (`xl:col-span-8`): Horizontal timeline (`19:00`–`03:00`) with solid bars, `±min` wings, and guaranteed group overlap band.
    2. **Personal Check-in & Precision Panel** (`xl:col-span-4`): Arrival/departure, `±5m | ±15m | ±30m | ±60m` selector, strict deadline badge, and Check-in CTA.
    3. **Weighted Roulette & Synchrony Engine** (`xl:col-span-7`): Interactive slot/roulette showcase + filtered tabs for Perfect Fit, Karma Sub-Lobbies, AI PVJ-6D Recommendations, and Incompatible games.
    4. **Participants & Tribunal Voting** (`xl:col-span-5`): High-density table sorted by lobby priority with callout/ping actions and inline Tribunal del Humo voting.
- **Catalog & Gamer DNA (`src/components/catalog/`):**
  - **Mi Perfil Gamer**: Split-Panel layout inspired by GitHub Settings (`Resumen & ADN PVJ-6D`, `Steam Sync`, `Podios Top 3`, `Categorías`, `Biblioteca`).
  - **Matriz Grupal del Club**: High-density `1px` bordered data table with Synchrony Score bars, member avatar ratings, and inline `1-5★` rating controls.
- **Groups & Tribunal del Humo (`src/components/groups/`, `src/components/tribunal/`):**
  - **Grupos**: GitHub Repository Settings Split-Panel integrating **Miembros & Roles**, **Integración Discord (Webhook/Bot & Logs)**, **Sesiones**, and **Identidad & Danger Zone**.
  - **Tribunal del Humo**: Top 3-card KPI Strip + Confiabilidad & Prioridad de Cupo data table + `react-hook-form` + `zod` sanction issuance panel.

---

## 5. Copy & Densidad de Interfaz (Audiencia Intermedia/Avanzada)

- **Perfil del Usuario**: La aplicación está dirigida a usuarios con conocimiento medio/alto de aplicaciones, videojuegos e interfaces digitales; no requiere texto tutorial ni explicaciones paso a paso sobre controles evidentes.
- **Cero Redundancia**: Cada elemento debe comunicar una sola vez su propósito. Prohibido duplicar información entre encabezados, párrafos descriptivos y etiquetas de botones.
- **Icon-First en Acciones Utilitarias**: Priorizar botones solo-ícono con `title` y `aria-label` (o `Tooltip`) para acciones reconocibles visualmente.
- **Brevedad Estricta**: Limitar títulos y etiquetas a lo mínimo indispensable, eliminando subtítulos de relleno y priorizando métricas, estados y controles directos.
- **Excepciones**: Conservar texto descriptivo únicamente en mensajes de error/validación accionables, advertencias destructivas y estados vacíos que requieran contexto mínimo.
