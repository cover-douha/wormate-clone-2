# GDD — Clon de Wormate (Wormzilla)

**Versión:** 1.0 · **Fecha:** 2026-11-09 · **Owner:** Arquitecto y coordinador
**Estado:** Aceptado por silencio del equipo (FASE 1 cerrada)

## 1. Visión

Clon de Wormate.io en navegador web. Subgénero "slither-like": gusanos que crecen comiendo, muertes por colisión cabeza-vs-cuerpo, boost con coste de masa, tabla de líderes en sala única. Cliente Godot 4.7 exportado a WebGL; servidor Node.js autoritativo con `ws`.

Uso: educativo / personal. Marca, nombre y assets propios. No se replican los del original.

## 2. Plataforma y stack

| Capa | Tecnología |
|---|---|
| Cliente | Godot 4.7 (GL Compatibility) → exportación Web (WASM + PCK) |
| Servidor | Node.js 20 LTS + `ws` (sin socket.io) |
| Build cliente | `godot --headless --export-release Web` |
| Tests servidor | Vitest |
| Tests e2e | Playwright sobre el export web |
| Red | WebSocket binario, snapshots delta a 20 Hz |
| Gestor | pnpm (workspaces) |

## 3. Constantes del juego

| Constante | Valor |
|---|---|
| Mundo | 4000 × 4000 u |
| Viewport | 1280 × 720 u |
| Longitud inicial | 10 segmentos |
| Cap de comida | 500 ítems |
| Tick servidor | 20 Hz (50 ms) |
| Interpolación cliente | 100 ms |
| Cabeza vs cabeza | `BOTH_DIE` (flag configurable) |
| Grid espacial (colisiones) | celda 50 px |
| Hit radius cabeza | 12 u |
| Espaciado segmentos | 8 u |
| Velocidad base | 120 u/s |
| Multiplicador boost | 1.8× |
| Coste de masa en boost | 0.5 / s |
| Respawn | 2000 ms |

## 4. Bucle de juego

1. Spawn en punto aleatorio del mundo como gusano de 10 segmentos.
2. El ratón fija el target de la cabeza. El cuerpo sigue por interpolación de segmentos a `SEG_SPACING` u de distancia.
3. Comida dispersa: al consumirla, el gusano crece (1 segmento por unidad de comida) y suma score.
4. **Boost** (clic izq / Espacio): consume masa y deja un rastro de comida recuperable.
5. Muerte: la cabeza toca el cuerpo de otro gusano → el gusano muere y su `path` se convierte en comida. Cabeza-vs-cabeza: ambos mueren (configurable a `NOBODY_DIES`).
6. Respawn tras `RESPAWN_MS` con longitud inicial.

## 5. Controles

- Ratón: dirección de la cabeza.
- Clic izq / Espacio: boost.
- `R`: respawn manual estando muerto.
- `P` / Esc: pausa.
- WASD: reservado para movimiento del jugador o panning de cámara (no habilidades). En este juego, sin binding (el movimiento es por ratón).

## 6. Win condition

No hay. Es sandbox de scoreboard. Meta implícita: liderar la tabla.

## 7. Bots (F6)

Mínimo viable: 3 estados.

| Estado | Comportamiento |
|---|---|
| `WANDER` | Movimiento aleatorio suave, evita bordes. |
| `SEEK_FOOD` | Si hay comida en radio de percepción, se dirige a la más cercana. |
| `AVOID_HEAD` | Si otra cabeza está cerca y en ángulo de colisión, gira. |

Mejoras en Fase 3: rodear gusanos pequeños, evitar gusanos grandes.

## 8. Skins (F8)

Sólo cosméticos. Hitbox fija (`HIT_RADIUS`) independiente del skin. Selección en pantalla de título. Al menos 4 skins en MVP: 2 colores sólidos + 2 patrones.

## 9. Multijugador (F9)

- Sala única, hasta 30 concurrentes (objetivo).
- Servidor autoritativo: única fuente de verdad de muertes, score, comida y colisiones.
- Cliente: solo input + render + interpolación + predicción local del gusano propio.
- Reconexión: full-state snapshot a 1 Hz; credenciales room-scoped emitidas por el servidor.

## 10. HUD (F7)

- Score
- Longitud
- Top 10 leaderboard
- Minimapa (esquina inferior derecha)
- Estado de boost (barra de masa)
- Indicador de ping

## 11. Muerte y anti-cheat (R4)

Toda muerte es dictada por el servidor. El cliente nunca declara muertes — ni siquiera la propia. El cliente recibe el evento `death` y muestra la animación.

## 12. Out-of-scope

Login social, monetización, microtransacciones, modo móvil nativo (responsive web solamente), salas privadas, amigos, ranking persistente entre sesiones, modos alternativos (battle royale, equipos).

## 13. Stretch (Fase 4)

Cuenta de usuario con leaderboard persistente. Skins desbloqueables por logro. Multi-sala con auto-balance.

## 14. Hitos

| H | Nombre | Entrega observable |
|---|---|---|
| H1 | Single-player jugable | Gusano come y crece, bots tontos, muerte por autocolisión y bordes. Sin red. |
| H2 | Multijugador en sala única | 2+ clientes sincronizados a 20 Hz. Muerte por otros gusanos. |
| H3 | Mecánicas completas | Boost, skins, leaderboard, minimapa, bots mejorados. |
| H4 | Empaquetado | `docker compose up` levanta cliente+servidor. Playwright e2e pasa. |
| H5 | (Stretch) Persistencia | Cuentas, leaderboard persistente, multi-sala. |

## 15. Criterios de aceptación (resumen; DoD detallado en QA)

- **H1**: localhost abre, ves un gusano controlable, comes, creces, mueres, reapareces. 60 FPS en laptop medio.
- **H2**: Dos pestañas, ves al otro gusano moverse en tiempo real, lo matas, su cuerpo se vuelve comida. Latencia < 200 ms LAN.
- **H3**: HUD completo, boost con coste visible, ≥4 skins, bots no triviales.
- **H4**: `docker compose up` levanta todo. Smoke test automático pasa.
- **Cobertura**: ≥ 70 % en `server/` y `scripts/game/`. ≥ 1 e2e en H4.

## 16. Supuestos marcados

- **[SUPUESTO]** Uso educativo/personal, no comercial.
- **[SUPUESTO]** Idioma UI: español.
- **[SUPUESTO]** Stack: Godot 4.7 + Node 20 + ws + pnpm. Sin oposición → fijo.
- **[SUPUESTO]** Snapshot **delta** (Opción 1): solo `head+angle+length` por tick; cliente reconstruye `path`. Full-state a 1 Hz para reconexión.
- **[SUPUESTO]** `UMBRAL` snap cabeza = 30 u (2.5 × `HIT_RADIUS`).
- **[SUPUESTO]** `onDeath(worm)` → `grid.removeSegments(path)` **antes** de `foodSystem.dropFromPath(path)`.
