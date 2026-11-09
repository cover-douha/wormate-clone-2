# ADR-008 — Muertes por borde surfacen en `snapshot.deaths`

**Estado:** Aceptado · **Fecha:** 2026-11-09 · **Decisionista:** Arquitecto (sobre fix de `tornillo` en `6ced5e6`)

## Contexto

En `c80dfc3` (mi commit), `Worm.tick()` mataba al gusano por fuera de bordes (línea 49-51 de `worm.mjs`: `if (head.x < 0 || head.x > WORLD.WIDTH ...) this.alive = false; return;`). El loop de `GameWorld.tick()` después revisaba colisiones y luego aplicaba muertes con `if (!w || !w.alive) continue;` — lo que **saltaba** al gusano ya muerto por borde y nunca lo añadía a `deaths[]`.

Resultado: el cliente no recibía el evento de muerte por borde. El HUD no mostraba "Has muerto".

## Fix de `tornillo` (commit `6ced5e6`)

1. Tras `w.tick(dt)` en el loop de movimiento, si `!w.alive`, hacer `this._pendingDeaths.push({ dead: w.id, by: null })`.
2. En el loop de aplicación de muertes, usar `Set` para dedup: una worm puede aparecer por borde + colisión en el mismo tick.
3. Cambiar la guarda: `if (!w) continue;` en vez de `if (!w || !w.alive) continue;` — porque `w.alive` ya puede ser false tras `tick()`.

## Decisión

**Aceptar el fix**. `snapshot.deaths` incluye eventos `{ playerId, by: null }` para muertes por borde. El campo `by: null` representa "sin killer" (mundo/borde).

## Formato

En ADR-006 binario, `killerIdHash = 0xFFFF` representa "mundo/borde". En JSON (actual), `by: null`.

## Justificación

- Sin este fix, el cliente no puede distinguir "gusano salió del mapa" de "gusano sigue vivo". El HUD no mostraría el Game Over correctamente.
- `by: null` / `0xFFFF` es un patrón estándar (ej. slither.io original lo hace igual).
- El `Set` de dedup evita doble drop de comida y doble evento de muerte.

## Tests que cubren el fix

`tests/server/world.test.mjs` (3 tests) — `tornillo` añadió tests que cubren:
- `tick` mueve gusanos vivos
- `tick` detecta muerte por borde y la surfarea en `snapshot.deaths`
- Smoke test básico de comida inicial

## Reversión

Si se decide que el cliente detecte bordes localmente (sin evento del servidor): basta quitar el `if (!w.alive) this._pendingDeaths.push(...)` del primer loop. **No recomendado**: rompe el principio de "servidor autoritativo de muertes" (R4 anti-cheat).
