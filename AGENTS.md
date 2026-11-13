# Boludos Gaming — Project Guidelines & Architecture (`AGENTS.md`)

## Stack Overview
- **Frontend**: React 19 + TypeScript + Vite + Tailwind CSS + Lucide Icons
- **Backend / BaaS (100% Free)**: Supabase (PostgreSQL, Realtime, Discord OAuth, Edge Functions) + Dual Mode Local/Demo Store (`localStorage` + `BroadcastChannel` for instant multi-tab & offline operation)
- **Integrations**:
  - **Discord Channel Bot & Webhook**: Real-time Rich Embeds, `<@discord_id>` user mentions, and interactive buttons (`supabase/functions/discord-bot/index.ts` + `src/lib/discordService.ts`).
  - **Mobile Web Push (PWA)**: `public/manifest.webmanifest` + `public/sw.js` Service Worker + `supabase/functions/send-push/index.ts`.
- **Hosting**: GitHub Pages (`vite.config.ts` with `base: './'` and `.github/workflows/deploy.yml`).

## Workspace Skills
Always consult the relevant skill in `.agents/skills/` before implementing its domain:
- `.agents/skills/matchmaking-karma-engine/SKILL.md`
- `.agents/skills/supabase-discord-pwa/SKILL.md`
- `.agents/skills/gaming-ui-ghpages/SKILL.md`

## Code Quality Rules
1. Strict TypeScript: Do not use `any` where a typed interface from `src/types/domain.ts` applies.
2. Every action in the UI (creating a session, joining with `±15m` precision, spinning the random roulette, checking in, voting a sanction in the Tribunal del Humo, pinging a late friend, sending a chat message) must update state immediately, trigger the Discord Channel notification (both in the live Discord Feed mirror and to the configured Discord Webhook/Bot), and trigger Web Push notifications when appropriate.
