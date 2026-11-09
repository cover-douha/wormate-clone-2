# ADR-011 — Cablear protocol.mjs binario en rooms.mjs

**Estado:** Aceptado · **Fecha:** 2026-11-09 · **Decisionista:** Arquitecto (sobre hallazgo crítico de `vigia`)
**Propuesta original:** `vigia` en handoff del 2026-11-09. Revisión: `timonel` (arquitecto) con una observación (ver "Ajuste" abajo).

## Contexto

`vigia` detectó un gap crítico entre la arquitectura documentada y la implementada:

- **ADR-006 v2** define el formato binario del snapshot delta.
- `server/protocol.mjs` lo implementa (`encodeSnapshot`, `decodeSnapshot`, `crc16`, `PlayerIdTable`) con 10 tests unitarios pasando.
- **Pero** `server/rooms.mjs::_tick()` línea 60 sigue llamando `encode(snapshot)` (línea 66-68), que es un wrapper local de `JSON.stringify`.

**Impacto medido por `vigia`:**
- Snapshot JSON: ~40 KB/tick × 20 Hz × 30 clientes = **24 MB/s upload**.
- DoD F9 pide ≤ 5 KB/tick (240 KB/s total a 30 clientes).
- Es **6× el límite** y hace F9 (multiplayer 30 concurrentes) inviable en producción.

Un test `it.fails` en `tests/server/e2e.test.mjs` documenta el gap: 39 961 bytes > 5 120 esperados.

## Decisión

**Cablear `encodeSnapshot()` binario en `rooms.mjs::_tick()` y eliminar el `encode()` local.**

### Implementación (asignada a `tornillo`)

1. `rooms.mjs::_tick()` reemplaza `socket.send(encode(snapshot))` por `socket.send(encodeSnapshot(snapshot, idTable, prevSnapshotPerClient))`.
2. `Room` mantiene un `PlayerIdTable` por sala. Registra IDs al `addPlayer`, limpia al `removePlayer`.
3. `Room` mantiene `Map<playerId, prevSnapshot>` para delta encoding (bit4=`deltaMode` en flags de ADR-006 v2).
4. **Full-state cada `FULL_SNAPSHOT_INTERVAL_TICKS = 20` (1 Hz)** por cliente, sin delta.
5. Eliminar `encode()` local de `rooms.mjs` (líneas 66-68).
6. El cliente `connection.gd` ya parsea JSON por ahora — añadir un flag `room.useBinary` que active el parseo binario en el cliente cuando el servidor lo envíe (reversión segura).

### Ajuste de `timonel` a la propuesta de `vigia`

- `vigia` proponía paso 6 con `room.useBinary` como **fallback**. **Acepto**, pero **aclaro**: el flag NO es "mantener JSON por defecto" — es solo para rollback en caso de bug Godot. **Por defecto binario**, JSON solo si detectamos problemas en H2 acceptance.
- Confirmo el resto sin cambios: `FULL_SNAPSHOT_INTERVAL_TICKS = 20` (1 Hz a 20 Hz), delta con bit4, `PlayerIdTable` por sala.

## Risk register

| ID | Riesgo | Prob | Impacto | Mitigación | Dueño |
|---|---|---|---|---|---|
| **R16** | Formato binario ADR-006 v2 implementado pero no integrado en rooms.mjs | Alta (confirmado) | Crítico (F9 inviable sin fix) | ADR-011 cablea binario en rooms.mjs | tornillo |

R16 entra al risk register oficial. Estado previo al fix: **abierto**.

## Justificación

- Sin esto, F9 no cumple DoD. El formato binario existe pero está desconectado del path de broadcast.
- `protocol.mjs::encodeSnapshot` ya está testeado (10 tests). Cablearlo es trabajo de integración, no de diseño.
- El test `it.fails` que documenta el gap se convierte en test normal al implementarse — buena práctica.

## Estimación post-fix (diseño, no medición)

- Header binario (10 bytes) + body delta (1–2 KB) + crc (2 bytes) ≈ 1–2 KB/tick × 20 Hz = **20–40 KB/s por cliente**. Bien dentro del DoD F9 (5 KB/tick = 100 KB/s).
- Full-state (1 Hz) ~6 KB/tick × 1 Hz = ~6 KB/s por cliente. Aceptable.
- Validación con benchmark en H2 acceptance (vigia).

## Reversión

- Si el binario causa bugs en `WebSocketPeer` de Godot: flag `room.useBinary = false` → fallback a JSON. Coste: duplicar path de codificación, 24 MB/s.
- Si delta bit4 produce drift inaceptable: enviar full-state cada N ticks en vez de delta (más ancho de banda, más estable). ADR-006 v2 ya prevé esto.

## Tests (asignados a `vigia`)

- Convertir `it.fails` en `e2e.test.mjs` a test normal.
- Tests de delta real: `bit4=deltaMode`, food diff vacío sin cambios, deaths surfacing binario, leaderboard top 10.
- Benchmark: 30 clientes simulados, medir ancho de banda real, verificar ≤ 5 KB/tick por cliente.

## Sequence diagram (post-fix)

```
Room._tick()                         Client (connection.gd)
   │                                       │
   ├─ world.tick(dt, seq)                  │
   │    → snapshot delta                   │
   │                                       │
   ├─ for each player P:                   │
   │    prev = prevSnapshots.get(P.id)      │
   │    buf = encodeSnapshot(snap,          │
   │                        idTable,       │
   │                        prev)           │
   │    socket.send(buf)  ────────────────► │
   │                                       ├─ decodeSnapshot(buf, idTable)
   │    prevSnapshots.set(P.id, snap)      │    → snapshot dict
   │                                       ├─ apply to worm_arena
   │                                       │
   │ if seq % 20 == 0:                     │
   │    // full-state: prev = null         │
   │    // bit4=0 en todos los jugadores   │
   │    // reconexión friendly             │
   │                                       │
   └─ next tick                            │
```
