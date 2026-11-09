# ADR-005 — Servidor Node.js + ws (autoritativo)

**Estado:** Aceptado · **Fecha:** 2026-11-09 · **Decisionista:** Arquitecto

## Contexto

El `docs/game-multiplayer.md` del repo prescribe: *"Default to a standalone socket server without Godot, normally Node.js with `ws`"*. ADR-001 ya proponía lo mismo; este ADR lo formaliza tras descubrir el scaffold.

## Decisión

Servidor Node.js 20 LTS, librería `ws` (sin socket.io), sin Godot headless. Vive en `server/`. Es la única fuente de verdad de:

- Muertes (R4 anti-cheat).
- Score, comida, colisiones, snapshots.
- Capacidad de sala, asientos, heartbeat.

El cliente envía input acotado y trata los snapshots como autoridad.

## Justificación

- El doc del repo lo prescribe explícitamente.
- `ws` es más ligero que `socket.io` y suficiente para snapshots binarios.
- Sin Godot en el servidor: arranque rápido, sin dependencia de engine en runtime.

## Estructura

```
server/
  authoritative_server.mjs    # entrypoint, escucha ws, gestiona salas
  protocol.mjs                # codificación/decodificación binaria del snapshot
  rooms.mjs                   # gestión de salas y asientos
  game/
    world.mjs                 # GameWorld: tick, simulación, colisiones
    worm.mjs                  # Worm: cabeza, path, growth, death
    food.mjs                  # Food: spawn, eat, drops
    grid.mjs                  # Grid espacial hash 50px
    bots.mjs                  # IA simple (WANDER, SEEK_FOOD, AVOID_HEAD)
```

## Dependencias (en `package.json`)

- `ws` ^8.x
- `vitest` ^1.x (dev)
- Sin runtime Godot.

## Reversión

Si el equipo demuestra que reutilizar físicas/navigation de Godot en servidor aporta beneficio material: reconsiderar Godot headless. Hoy no aplica.
