# ADR-004 — Cliente Godot 4.7 exportado a Web

**Estado:** Aceptado · **Fecha:** 2026-11-09 · **Decisionista:** Arquitecto

## Contexto

El repo `cover-douha/wormate-clone-2` es un scaffold Manus "Generic Game Template" en Godot 4.7 (género `maze-chase`, starter `game-generic-v56`). Originalmente (mensajes Fase 1) el equipo había supuesto un cliente Canvas 2D + Vite. El descubrimiento del repo real obliga a replantear.

## Decisión

Adoptar Godot 4.7 (modo "GL Compatibility") como cliente, exportado a Web (WASM + PCK). El flujo de build existente (`package.json` script `export`: `godot --headless --path . --export-release Web dist/index.html`) se conserva.

## Justificación

- El repo ya está inicializado y es modular. Rehacer en Canvas 2D desperdicia el scaffold.
- `agent-notes/scaffold-audit.md` ya recomienda reemplazar `MazeWorld` por un `WormArena`, conservando `Main`, `ScreenFactory`, `SaveStore`, `RunScoreService`, `EffectsDirector`, `AudioDirector`.
- El viewport 1280×720 del template coincide con ADR-003.
- El doc `docs/game-multiplayer.md` prescribe servidor Node+ws sin Godot, lo que cuadra con ADR-001.

## Consecuencias

- **Constantes**: en `autoload/tuning_store.gd` (GDScript). Sin `shared/constants.ts` TS.
- **Tipos**: `scripts/entities/worm.gd`, `food.gd` (GDScript); sin `types.ts`.
- **Tests cliente**: tests nativos Godot (`test/test_suite.gd`) + Playwright sobre el export Web.
- **Tests servidor**: Vitest (JS puro).

## Reversión

Si el usuario prefiere web puro sin Godot: clonar el repo a rama `web-puro`, descartar `project.godot` y `scripts/`, reimplementar cliente en Canvas 2D + Vite. Coste: ~1 semana de refactor.
