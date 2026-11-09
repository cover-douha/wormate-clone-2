# ADR-006 — Snapshot delta (Opción 1)

**Estado:** Aceptado · **Fecha:** 2026-11-09 · **Decisionista:** Arquitecto

## Contexto

El Implementador propuso un `Snapshot` con `players[].path: Vec2[]` completo en cada tick. A 30 gusanos × 40 segmentos × 8 bytes ≈ 9.6 KB/tick × 20 Hz ≈ 190 KB/s por cliente. Excesivo. Choca con ADR-001 (delta).

## Decisión

**Opción 1**: snapshot delta por tick contiene **solo** `id, flags, headX, headY, angle, length, skin` por jugador. El cliente reconstruye el `path` interpolando cabeza + ángulo + longitud + `SEG_SPACING`.

`WormState` completo (con `path`) solo se envía en **full-state snapshot** a 1 Hz, para reconexiones.

## Formato binario (borrador, ADR-004 del mensaje truncado reenviado aquí)

```
Header (8 bytes):
  uint32 seq         // tick del servidor
  uint32 lastAck    // último ack recibido del cliente (para delta)

Body:
  Players (variable):
    uint16 count
    por jugador:
      uint16 id
      uint8  flags     // bit0=alive, bit1=boosting, bit2=isNew, bit3=isBot
      int16  headX, headY       // delta vs snapshot previo, en 1/16 u
      uint16 angle              // 0..65535 → 0..2π
      uint8  length             // nº de segmentos
      uint8  skin

  Food.Deltas (variable):
    uint16 addedCount
      por item: int16 x, int16 y, uint8 type
    uint16 removedCount
      por item: uint32 foodId

  Food.Drops (variable):   // masa soltada por boost o muerte
    uint16 count
      por item: int16 x, int16 y, uint8 value

  Deaths (variable):
    uint8 count
      por muerte: uint16 playerId, uint16 killerId (0xFFFF = mundo)

  Leaderboard (variable):
    uint8 topN  // 10
      por entrada: uint16 id, uint32 score

Trailer:
  uint16 crc16
```

## Supuestos

- **[SUPUESTO]** Coordenadas `int16` con resolución 1/16 u: cubre 4000 u con delta ±2048 u por tick. Si no alcanza, ampliar a int24.
- **[SUPUESTO]** `foodId` uint32: soporta rotación sin colisión de IDs en sesiones largas.
- **[SUPUESTO]** No se envían posiciones de cada segmento: el cliente reconstruye. Si QA detecta jitter visual inaceptable, añadir posiciones de segmentos cada N ticks.

## Estimación de ancho de banda (diseño, no medición)

- Delta típico: ~1.2 KB/tick × 20 Hz = ~24 KB/s por cliente.
- Full-state (1 Hz): ~6 KB/s.
- Validación con benchmark en H2.

## Reversión

Si la reconstrucción de `path` en cliente produce jitter visible que el equipo no puede mitigar: pasar a **Opción 2** (`path` completo cada N ticks + delta de cabeza). El `protocol.mjs` se diseñará para soportar ambos modos con un flag.
