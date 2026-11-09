# ADR-006 — Snapshot delta (Opción 1) — DEFINITIVO

**Estado:** Aceptado · **Versión:** 2 · **Fecha:** 2026-11-09 · **Decisionista:** Arquitecto
**Revisión:** v2 incorpora UMBRAL=18u (propuesta de `tornillo` aceptada) y serialización binaria (implementada en `server/protocol.mjs`).

## Contexto

El Implementador propuso un `Snapshot` con `players[].path: Vec2[]` completo en cada tick. A 30 gusanos × 40 segmentos × 8 bytes ≈ 9.6 KB/tick × 20 Hz ≈ 190 KB/s por cliente. Excesivo. Choca con ADR-001 (delta).

`Tornillo` confirmó Opción 1 en handoff del 2026-11-09.

## Decisión

**Opción 1**: snapshot delta por tick contiene **solo** `id, flags, headX, headY, angle, length, mass, skin` por jugador. El cliente reconstruye el `path` interpolando cabeza + ángulo + longitud + `SEG_SPACING`.

`WormState` completo (con `path`) solo se envía en **full-state snapshot** a 1 Hz, para reconexiones.

## Constantes de predicción (v2)

| Constante | Valor | Origen |
|---|---|---|
| `UMBRAL` (snap de cabeza) | **18 u** | Propuesta de `tornillo` (3 ticks de drift a 120 u/s × 50 ms = 18 u) aceptada por Arquitecto |
| `INTERP_MS` (delay render) | 100 ms | ADR-001 |
| Justificación | 18 u = 3 ticks de drift, mejor umbral de corrección que 30 u (5 ticks) que sería muy perceptible | |

## Formato binario (implementado en `server/protocol.mjs`)

```
Header (10 bytes):
  uint8  magic = 0x57  ('W')
  uint8  version = 1
  uint32 seq          // tick del servidor
  uint32 lastAck      // último ack recibido del cliente (para delta)

Body:
  Players (variable):
    uint16 count
    por jugador:
      uint16 idHash      // hash del PlayerId string (32→16 bits, tabla en servidor)
      uint8  flags       // bit0=alive, bit1=boosting, bit2=isNew, bit3=isBot, bit4=deltaMode
      int16  headX, headY     // delta vs snapshot previo en 1/16 u (cuando bit4=1)
                              // o absoluto en 1/16 u (cuando bit4=0, primer snapshot)
      uint16 angle           // 0..65535 → 0..2π
      uint8  length          // nº de segmentos
      uint8  mass            // masa (uint8; uint16 en full-state)
      uint8  skin

  Food.Deltas (variable):
    uint16 addedCount
      por item: int16 x, int16 y, uint8 kind
    uint16 removedCount
      por item: uint32 foodId

  Food.Drops:
    uint16 count
      por item: int16 x, int16 y, uint8 value

  Deaths:
    uint8 count
      por muerte: uint16 playerIdHash, uint16 killerIdHash (0xFFFF = mundo/borde)

  Leaderboard:
    uint8 topN  // 10
      por entrada: uint16 idHash, uint32 score

Trailer:
  uint16 crc16 (CRC-CCITT 0x1021)
```

## Implementación

`server/protocol.mjs` exporta:
- `encodeSnapshot(snapshot)` → `Buffer` binario según formato.
- `decodeSnapshot(buf)` → objeto `snapshot`.
- `encodeInput(input)` / `decodeInput(buf)` → JSON (input es chico, no justifica binario).
- `crc16(buf)` → CRC-CCITT.

## Supuestos

- **[SUPUESTO]** Coordenadas `int16` con resolución 1/16 u: cubre 4000 u con delta ±2048 u por tick. Si no alcanza, ampliar a int24.
- **[SUPUESTO]** `foodId` uint32: soporta rotación sin colisión de IDs en sesiones largas.
- **[SUPUESTO]** No se envían posiciones de cada segmento: el cliente reconstruye. Si QA detecta jitter visual inaceptable, añadir posiciones de segmentos cada N ticks.

## Estimación de ancho de banda (diseño, no medición)

- Delta típico: ~1.2 KB/tick × 20 Hz = ~24 KB/s por cliente.
- Full-state (1 Hz): ~6 KB/s.
- Validación con benchmark en H2.

## Reversión

Si la reconstrucción de `path` en cliente produce jitter visible que el equipo no puede mitigar: pasar a **Opción 2** (`path` completo cada N ticks + delta de cabeza). El `protocol.mjs` se diseñó con flag `bit4=deltaMode` para soportar ambos modos sin romper el protocolo.
