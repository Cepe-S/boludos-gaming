---
name: matchmaking-karma-engine
description: >-
  Use this skill when implementing, modifying, or testing the core matchmaking algorithms,
  game synchrony calculations (1-5 ratings and player limits), weighted random roulette,
  sub-lobby splitting, schedule precision windows (±5m, ±15m, ±30m, ±60m), and the Tribunal
  del Humo attendance/karma sanction engine.
---

# Matchmaking, Schedule Precision & Karma Engine Skill

## 1. Game Synchrony & Player Limits Algorithm

Given a set of session participants $P = \{p_1, \dots, p_n\}$ and a catalog of games $G$:

1. **Ownership / Willingness Check**:
   - Each player $p$ has a preference entry `(plays: boolean, rating: 1 | 2 | 3 | 4 | 5)` for game $g$.
   - `playsCount`: number of participants in $P$ with `plays === true`.
   - `allPlay`: `playsCount === |P|`.

2. **Lobby Capacity Classification**:
   - **`perfect_fit`**: `allPlay === true` AND `g.minPlayers <= |P| <= g.maxPlayers`.
   - **`split_required`**: `allPlay === true` AND `|P| > g.maxPlayers` (e.g., 7 players signed up, game max is 5).
   - **`needs_more_players`**: `|P| < g.minPlayers`.
   - **`missing_owners`**: One or more participants have `plays === false`.

3. **Synchrony Score ($S_g \in [0, 100]$)**:
   - Average rating among participants who play it:
     $$\bar{r}_g = \frac{1}{|P|} \sum_{p \in P} \text{rating}(p, g)$$
   - Base score: $\text{ round}(\bar{r}_g \times 20)$.
   - Dislike penalty: For each participant who rated $g$ as `1` ("Lo juego solo si me obligan"), subtract `15` points (clamped to `[5, 100]`).
   - Unanimously loved bonus: If all participants rated $\ge 4$, add `+5` points (capped at `100`).

4. **Weighted Random Roulette**:
   - Only `perfect_fit` games (or `split_required` if the group toggles "Permitir dividir en sub-lobbies") enter the roulette.
   - Weight of game $g$: $w_g = \max(1, S_g^2)$.

5. **Split-Lobby Priority Queue (When $|P| > g.maxPlayers$)**:
   - Sort participants by:
     1. Currently checked-in on time (`attendanceStatus === 'on_time'`).
     2. Higher `karmaScore` (Score de Confiabilidad 0..100).
     3. Earlier signup timestamp.
   - Top `g.maxPlayers` go to **Lobby Principal (Titulares)**, remaining go to **Sub-Lobby / Rotación (Suplentes por Humo)**, OR propose two balanced sub-lobbies of size $\lfloor |P|/2 \rfloor$ and $\lceil |P|/2 \rceil$ if both $\ge g.minPlayers$.

---

## 2. Schedule Availability & Precision Window (`±Δ` minutes)

Each participant $p$ declares:
- `availableFrom`: `"HH:mm"` (e.g. `"22:00"`)
- `availableUntil`: `"HH:mm"` (e.g. `"01:30"`, handling midnight crossover cleanly: if `until <= from`, add 24 hours / 1440 mins)
- `precisionMinutes`: `5 | 15 | 30 | 60`

### Calculations (in minutes from `00:00` of session day):
- `earliestStart(p) = startMins(p) - precisionMinutes(p)`
- `strictDeadline(p) = startMins(p) + precisionMinutes(p)` (exact minute after which the player is officially LATE)
- **Group Probable Start**: $\max_{p \in P}(\text{startMins}(p))$
- **Group Guaranteed Start (100% inside precision margin)**: $\max_{p \in P}(\text{strictDeadline}(p))$
- **Group Guaranteed End**: $\min_{p \in P}(\text{endMins}(p) - \text{precisionMinutes}(p))$
- **Group Probable End**: $\min_{p \in P}(\text{endMins}(p))$

---

## 3. Attendance Verification & "El Tribunal del Humo" Sanctions

- **On-Time Check-in** (`checkInMins <= strictDeadline(p)`):
  - `attendanceStatus = 'on_time'`
  - `karmaDelta = +5` (capped at 100)
- **Late Check-in** (`checkInMins > strictDeadline(p)`):
  - `attendanceStatus = 'late'`
  - `karmaDelta = -10`
- **No-Show / Fantasma** (Voted by majority of present players or session closed without check-in):
  - `attendanceStatus = 'no_show'`
  - `karmaDelta = -25`
- **Automatic Titles / Badges by Karma & History**:
  - `karma >= 90 && onTimeCount >= 5`: `"⌚ Reloj Suizo"`
  - `karma >= 75`: `"🫡 Soldado Fiel"`
  - `karma >= 50 && lateCount >= 3`: `"🐢 Rey del ±15m Mentiroso"`
  - `karma < 50 || noShowCount >= 2`: `"💨 Humero Oficial"`
  - `karma < 30 || noShowCount >= 4`: `"👻 Fantasma Supremo (Sin Prioridad de Cupo)"`
