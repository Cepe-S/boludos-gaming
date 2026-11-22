# Boludos Gaming — AGENTS.md

## Reglas de Navegación y Eficiencia
1. **Serena MCP primero:** Priorizar las herramientas de símbolos de Serena MCP (`find_symbol`, `find_referencing_symbols`, `replace_symbol_body`) antes de leer archivos enteros.
2. **Sin búsquedas por terminal:** Prohibido usar la terminal (`grep`, `find`, `ls -R` o equivalentes) para buscar en el código.
3. **Respetar `.antigravityignore`:** No leer ni indexar dependencias, builds, lockfiles, cachés, SQL ni assets multimedia.
4. **UI & Diseño:** Consultar `DESIGN.md` antes de tocar o crear componentes de UI.

## Stack y Scripts (`package.json`)
- **Frontend:** React 19, TypeScript 5.7, Vite 6 (`base: './'`), Tailwind CSS 4, Radix UI, Lucide Icons, React Hook Form + Zod.
- **Backend / BaaS:** Supabase (`@supabase/supabase-js`, Edge Functions) + Dual Mode Local/Demo (`localStorage` + `BroadcastChannel`).
- **Integraciones:** Discord Webhook/Bot (Rich Embeds, `<@discord_id>`) y PWA Web Push (`public/sw.js`).
- **Scripts:** `npm run dev` | `npm run build` (`tsc -b && vite build`) | `npm run preview` | `npm test` (`vitest run`).

## Mapa del Proyecto (Niveles 1–2)
- `src/` — Entrada (`main.tsx`, `App.tsx`, `index.css`, `vite-env.d.ts`)
  - `src/components/` — Componentes de UI y vistas
  - `src/context/` — Estado global y sincronización
  - `src/hooks/` — Custom hooks
  - `src/lib/` — Servicios (Supabase, Discord, matchmaking, karma)
  - `src/types/` — Interfaces de dominio (`domain.ts`)
- `public/` — PWA (`manifest.webmanifest`, `sw.js`, `icon.svg`)
- `supabase/` — `functions/` (Edge Functions) y `schema.sql`
- `.agents/skills/` — Skills de dominio (consultar antes de implementar):
  - `matchmaking-karma-engine/SKILL.md`
  - `supabase-discord-pwa/SKILL.md`
  - `gaming-ui-ghpages/SKILL.md`
- `.github/workflows/` — Deploy a GitHub Pages
- Raíz — `DESIGN.md`, `index.html`, `vite.config.ts`, `tsconfig.json`, `.antigravityignore`, `Lol*.tsx`

## Reglas de Código y UI
1. **TypeScript estricto:** No usar `any` cuando aplique una interfaz tipada de `src/types/domain.ts`.
2. **Acciones en tiempo real:** Toda acción de UI (sesiones, precisión `±15m`, ruleta, check-in, Tribunal del Humo, pings, chat) debe actualizar estado inmediatamente y disparar Discord Feed/Webhook y Web Push cuando corresponda.
3. **UI Concisa & Icon-First:** Audiencia gamer con nivel medio/alto. Evitar textos largos o subtítulos redundantes; priorizar controles solo-ícono con `title`/`aria-label`/`Tooltip` y etiquetas breves (1–3 palabras) enfocadas en datos y estado.
