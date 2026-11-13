# 🎮 Boludos Gaming — Organizador de Vicio, Ruleta de Sincronía, Tribunal del Humo & Bot de Discord

Aplicación web progresiva (**PWA**) fullstack 100% gratuita para organizar un grupo de amigos que juegan online en PC, alojada en **GitHub Pages** con **Supabase (Free Tier)** y **Bot/Webhook de Discord**.

---

## ✨ Funcionalidades Principales

1. **Catálogo de Juegos con Límites de Jugadores (`min` / `max`)**:
   - Cada juego define su mínimo y máximo de jugadores (ej. *Lethal Company 1–4*, *CS2 1–5*, *Age of Empires II 2–8*, *Project Zomboid 1–16*).
   - Cualquier miembro puede sumar juegos nuevos o usar plantillas rápidas.
2. **Afinidad Individual del 1 al 5 (`★`)**:
   - Cada jugador configura qué juegos tiene/juega y cuánto le gustan del **1 al 5** (*1★: Solo si me obligan* hasta *5★: Vicio total*).
3. **Sesiones Fijas y Sesiones Random con Motor de Sincronía**:
   - Calcula automáticamente qué juegos están en **Sincronía Perfecta** entre todos los jugadores anotados y que respeten el límite de jugadores.
   - **Ruleta Ponderada**: Sorteo animado donde la probabilidad de cada juego es proporcional a su Score de Sincronía grupal.
   - **Sub-Lobbies Inteligentes (Split-Party)**: Cuando hay más amigos anotados que el límite máximo de un juego (ej. son 6 para un juego de 5), arma los sub-lobbies priorizando como titulares a los que tienen mayor **Score de Confiabilidad (Karma)** y llegaron en hora.
4. **Horarios con Margen de Precisión (`±5m`, `±15m`, `±30m`, `±1h`)**:
   - Al anotarse, cada jugador elige su ventana horaria y su margen de precisión.
   - **Línea de Tiempo Grupal**: Muestra visualmente la barra de horario núcleo, las alas de incertidumbre (`±min`), el **Inicio Probable**, el **Inicio 100% Garantizado** y el límite exacto de check-in antes de ser sancionado.
5. **El Tribunal del Humo (Asistencia, Sanciones y Karma)**:
   - Check-in en vivo validado contra `hora_prometida + margen_precisión`.
   - Votación de los presentes o sentencia directa para escrachar llegadas tarde (`-10 Karma`) o faltazos/fantasmas (`-25 Karma`).
   - Asigna títulos dinámicos (*"⌚ Reloj Suizo"*, *"🐢 Rey del ±15m Mentiroso"*, *"💨 Humero Oficial"*, *"👻 Fantasma Supremo"*).
6. **Integración Dual con Servidor de Discord (`#boludos-gaming`)**:
   - **Modo Webhook Instantáneo (30 seg)**: Pegá la URL del Webhook de tu canal de Discord en la pestaña **🤖 Canal de Discord** y el bot publicará Rich Embeds reales en tu servidor cada vez que se cree una sesión, se anote alguien con su horario `±15m`, gire la ruleta, reclamen a un impuntual (`<@discord_id>`) o salga una sanción del Tribunal.
   - **Modo Bot Interactivo Serverless (`supabase/functions/discord-bot`)**: Permite responder a botones interactivos de Discord (*"🎮 Sumarme (±15m)"*, *"✅ Check-in"*, *"🎲 Girar Ruleta"*) sin pagar ningún servidor 24/7.
7. **Chat Global en Tiempo Real + Notificaciones Web Push al Celular (PWA)**:
   - Chat global con menciones (`@todos`, `@usuario`), reacciones, tarjetas de sesiones y reenvío opcional al canal de Discord.
   - Service Worker (`public/sw.js`) + Web Push API para notificaciones que "popean" en Android, iOS (PWA en Pantalla de Inicio) y escritorio.

---

## 🚀 Cómo Correr Localmente

```bash
npm install
npm run dev
```

Para correr los tests automatizados del motor de sincronía, horarios y Discord:

```bash
npm test
```

---

## 🛠️ Configuración Gratuita en Producción (Supabase + Discord + GitHub Pages)

1. **Discord Webhook (30 segundos)**:
   - En tu servidor de Discord, entrá a **Editar Canal -> Integraciones -> Webhooks -> Nuevo Webhook**.
   - Copiá la URL del Webhook y pegala dentro de la app en la pestaña **🤖 Canal de Discord** (o en `VITE_DISCORD_WEBHOOK_URL`).
2. **Supabase (Opcional — Persistencia en la Nube)**:
   - Creá un proyecto gratuito en [supabase.com](https://supabase.com).
   - Ejecutá el archivo [`supabase/schema.sql`](./supabase/schema.sql) en el **SQL Editor**.
   - Copiá `.env.example` a `.env` con tu `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`.
3. **GitHub Pages**:
   - Subí el repositorio a GitHub y en **Settings -> Pages -> Build and deployment** elegí **GitHub Actions**. El workflow [`.github/workflows/deploy.yml`](./.github/workflows/deploy.yml) publica la app automáticamente.
