# ADR-007 — Replan de carpetas (sustituye ADR-002)

**Estado:** Aceptado · **Fecha:** 2026-11-09 · **Decisionista:** Arquitecto

## Contexto

ADR-002 original proponía crear carpetas vacías `src/`, `server/`, `client/`, `tests/`, `shared/` para migrar un repo "todo en una carpeta". El repo real **ya es modular** (es un scaffold Godot con `scripts/`, `scenes/`, `autoload/`, `tools/`, `web/`, `docs/`, `agent-notes/`). ADR-002 queda obsoleto.

## Decisión

**No** crear las carpetas de ADR-002. En su lugar:

- Mantener la estructura Godot tal cual (`scripts/`, `scenes/`, `autoload/`, `tools/`, `web/`, `docs/`).
- Añadir `server/` nuevo con el stack de ADR-005.
- Reemplazar el **gameplay** `maze-chase` por `worm-arena`, **sin borrar** los archivos de maze hasta que el nuevo funcione (ADR-002 aplicado a nivel de gameplay, no de carpetas).
- Sin carpeta `shared/` TS: las constantes viven en `autoload/tuning_store.gd` (GDScript) **y** en `server/protocol.mjs` (JS), sincronizadas con `tools/sync_constants.mjs`.

## Estructura resultante

```
wormate-clone-2/
  scripts/                # Godot (existente)
    game/
      worm_arena.gd       # NUEVO — reemplaza a maze_world.gd
      maze_world.gd       # existente, no se toca hasta H1
    entities/
      worm.gd             # NUEVO
      food.gd             # NUEVO
      runner.gd            # existente (no se usa en worm)
      sentinel.gd         # existente (no se usa en worm)
    ...
  server/                 # NUEVO — Node + ws
    authoritative_server.mjs
    protocol.mjs
    rooms.mjs
    game/
      world.mjs
      worm.mjs
      food.mjs
      grid.mjs
      bots.mjs
  tests/
    server/               # Vitest
    e2e/                  # Playwright
  tools/
    sync_constants.mjs    # NUEVO — sincroniza constantes GDScript ↔ JS
  localization/
    es.json               # NUEVO — español primario
  docs/
    gdd-worm-clone.md
    adr-004-godot-client.md
    adr-005-server-node-ws.md
    adr-006-snapshot-delta.md
    adr-007-replan-carpetas.md (este)
  project.godot           # existente
  package.json            # ampliado con deps de servidor
```

## Reglas de migración (de ADR-002 que sí sobreviven)

- Archivos nuevos → carpeta destino correcta.
- Archivos existentes → solo se borran cuando el reemplazo funciona y pasa tests.
- Commits atómicos: un cambio lógico = un commit.

## Reversión

Si el equipo prefiere un `shared/` TS: crearlo y escribir un codegen que genere `autoload/worm_constants.gd` y `server/constants.mjs` desde una fuente única (TOML o JSON). Coste bajo;推迟 hasta que la duplicación cause bugs.
