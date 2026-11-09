# ADR-009 — Constante única cliente/servidor vía `sync_constants.mjs`

**Estado:** Aceptado · **Fecha:** 2026-11-09 · **Decisionista:** Arquitecto (sobre propuesta de `tornillo`, commit `c6bddad`)

## Contexto

`MAX_TURN_PER_SEC` existía hardcoded en dos sitios:
- `server/game/worm.mjs`: `4 * dt` (literal mágico)
- `scripts/entities/worm.gd`: `MAX_TURN_PER_SEC = 4.0` (constante local)

Si un lado cambiaba el valor y el otro no, el cliente y servidor divergían en el comportamiento de giro. Bug sutil pero real: el cliente predeciría un giro a 4 rad/s mientras el servidor aplicaría otro, causando snaps constantes (R3 amplificado).

`Tornillo` añadió `WORLD.MAX_TURN_PER_SEC := 4.0` a `server/protocol.mjs` (commit `c6bddad`) y ambos lados ahora leen de ahí.

## Decisión

**Toda constante compartida cliente-servidor vive en `server/protocol.mjs::WORLD` y se sincroniza a GDScript vía `tools/sync_constants.mjs`.**

`scripts/game/worm_constants.gd` es **autogenerado** — no se edita a mano. El script de sync lee `WORLD`, emite `const NAME := value` en GDScript, y verifica con una lectura comparativa.

## Listado oficial de constantes sincronizadas (H1)

- `WIDTH, HEIGHT, VIEWPORT_W, VIEWPORT_H, FOOD_CAP`
- `TICK_HZ, TICK_MS, INTERP_MS`
- `GRID_CELL, HIT_RADIUS, SEG_SPACING`
- `INITIAL_LENGTH, BASE_SPEED, BOOST_SPEED_MULT`
- `BOOST_MASS_COST_PER_SEC, RESPAWN_MS`
- `HEAD_VS_HEAD` (string enum: `'BOTH_DIE' | 'NOBODY_DIES'`)
- **`MAX_TURN_PER_SEC = 4.0`** (añadido en `c6bddad`)

## Procedimiento de cambio

1. Editar `server/protocol.mjs::WORLD`.
2. Correr `pnpm sync:constants` → regenera `scripts/game/worm_constants.gd`.
3. Commitar ambos juntos: `[sync] <constante>: <motivo>`.
4. Si la constante tiene un ADR asociado, mencionarlo en el commit.

## Reglas

- **Prohibido** declarar constantes gameplay en `worm.gd`, `worm_arena.gd` o `world.mjs` sin pasar por `WORLD`. Code review de `vigia` lo rechaza.
- Excepciones: literales puramente visuales (colores, tamaños de sprite) que no afectan simulación ni hitbox.
- `HEAD_VS_HEAD` como string enum: GDScript usa `String`, JS usa string literal. El sync traduce correctamente.

## Justificación

- Fuente única de verdad → imposible divergencia cliente/servidor.
- `MAX_TURN_PER_SEC = 4.0 rad/s = 229°/s`. `vigia` reportó 720°/s en server pero `tornillo` verificó: es 4 rad/s en ambos lados (la confusión fue por una lectura del código anterior antes de la sincronización).
- Coste de mantener el script de sync: ~50 líneas, ya escrito. No requiere codegen complejo.

## Tests que cubren

- `tools/sync_constants.mjs` verifica su propia salida.
- Pendiente: test e2e que cambie una constante, regenere, y compruebe que el GDScript importado tiene el mismo valor. (Lo añade `vigia` si lo considera crítico.)

## Reversión

Si el equipo prefiere un único TOML/JSON como fuente externa (en vez de `protocol.mjs`), basta crear `tools/constants.toml`, leerlo en `protocol.mjs` y en `sync_constants.mjs`. Coste bajo; no necesario hoy.
