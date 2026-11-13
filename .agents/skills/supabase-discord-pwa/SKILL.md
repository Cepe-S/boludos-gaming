---
name: supabase-discord-pwa
description: >-
  Use this skill when building or modifying the Supabase PostgreSQL schema, Edge Functions,
  Discord Webhook & Serverless Bot integration (Rich Embeds, <@discord_id> mentions, interactive
  buttons), or PWA Service Worker Web Push notifications.
---

# Supabase, Discord Bot & PWA Web Push Skill

## 1. Dual Discord Integration (100% Free)

### Mode A: Direct Discord Webhook (Zero Backend Setup)
- Sends `POST` requests directly to the user's configured Discord Channel Webhook URL (`https://discord.com/api/webhooks/{id}/{token}`).
- Payload structure must include:
  - `username`: `"Boludos Gaming Bot 🎮"`
  - `avatar_url`: Custom gaming bot avatar
  - `content`: Optional text with real user mentions `<@discord_id>` or `@here` / `<@&role_id>`
  - `embeds`: Rich Discord Embeds with color coding:
    - **New Session**: `#6366f1` (Indigo)
    - **Random Roulette Winner**: `#10b981` (Emerald)
    - **Late Ping / Reclamo**: `#f59e0b` (Amber)
    - **Tribunal Sanction / Fantasma**: `#ef4444` (Red)
    - **Global Chat Broadcast**: `#38bdf8` (Sky)

### Mode B: Serverless Discord Bot (`supabase/functions/discord-bot/index.ts`)
- Uses Discord HTTP Interactions Endpoint (`POST`) verified via Ed25519 signature (`X-Signature-Ed25519`, `X-Signature-Timestamp`).
- Responds to `PING` (`type: 1`) with `{ type: 1 }`.
- Handles `MESSAGE_COMPONENT` (`type: 3`) button clicks:
  - `custom_id: "join_session:{sessionId}:15"` -> Adds the Discord user (`interaction.member.user.id`) to `session_participants` with `±15m` precision and updates the message embed.
  - `custom_id: "checkin_session:{sessionId}"` -> Marks `checked_in_at = now()`, calculates if on-time or late, updates Karma, and replies in the channel.
  - `custom_id: "spin_roulette:{sessionId}"` -> Computes top synchrony games and posts the weighted roulette winner.

---

## 2. Mobile Web Push Notifications (PWA + Service Worker)

1. **`public/manifest.webmanifest`**:
   - Must configure `"display": "standalone"`, `"orientation": "portrait"`, `"theme_color": "#090d16"`, `"background_color": "#090d16"`.
2. **`public/sw.js` (Service Worker)**:
   - Listens to `push` events (`self.addEventListener('push', ...)`), parses JSON `{ title, body, tag, url, actions, vibrate }`, and calls `self.registration.showNotification(...)`.
   - Listens to `notificationclick` to focus an existing client tab or open the session URL.
   - Listens to `message` (`type: 'TRIGGER_LOCAL_PUSH'`) so the app can trigger real OS/Phone notifications via Service Worker registration even before VAPID Edge Function keys are configured.
3. **`supabase/functions/send-push/index.ts`**:
   - Accepts `{ userIds, title, body, url, tag }`, reads `push_subscription` from `profiles`, and sends encrypted Web Push notifications signed with VAPID keys.
