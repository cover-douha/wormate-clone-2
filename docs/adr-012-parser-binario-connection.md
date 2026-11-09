# ADR-012 — Parser binario en `connection.gd`

**Estado:** Aceptado · **Fecha:** 2026-11-09 · **Decisionista:** Arquitecto (sobre hallazgo de `vigia`)
**Implementado por:** `tornillo` en commit `a6339a6` (paralelo al handoff de `vigia` — coincidencia rápida).

## Contexto

`vigia` detectó que tras ADR-011 (servidor envía binario), `connection.gd::_handle_packet` (líneas 117-133 pre-fix) seguía asumiendo texto UTF-8 + JSON.parse. El primer byte magic 0x57 rompía `JSON.parse_string` → el cliente Godot **no recibía snapshots** → F9 roto del lado cliente.

Sin ADR-012, ADR-011 era dead code del lado cliente.

## Decisión

`connection.gd::_handle_packet` distingue binario de texto por el primer byte:

- `pkt[0] == 0x57` (MAGIC) → frame binario según ADR-006 v2 / ADR-011.
- Sino, si `_peer.was_string_packet()` → JSON texto (welcome, error, backward compat).
- Sino → paquete desconocido, descartar.

### Parser binario (implementado en `a6339a6`)

```
1. Validar pkt.size() >= 12 (header 10 + crc 2).
2. version = pkt[1]. Si != PROTOCOL_VERSION, push_warning + descartar.
3. seq = read_u32_be(pkt, 2)
4. lastAck = read_u32_be(pkt, 6)
5. body_end = pkt.size() - 2
6. expected_crc = read_u16_be(pkt, body_end)
7. actual_crc = crc16_range(pkt, 0, body_end)  # CRC-CCITT 0x1021, init 0xFFFF
8. Si no coinciden → push_warning + descartar.
9. body_bytes = pkt.slice(10, body_end)
10. snap = JSON.parse_string(body_bytes.get_string_from_utf8())
11. snap.seq = seq; snap.lastAck = lastAck
12. emit signal snapshot(snap)
```

### Helpers GDScript añadidos

- `_read_u32_be(buf, offset)` → int (big-endian, manual con shifts)
- `_read_u16_be(buf, offset)` → int
- `_crc16_range(buf, start, end)` → int (CRC-CCITT idéntico a `server/protocol.mjs::crc16`)

## Risk register

| ID | Riesgo | Prob | Impacto | Mitigación | Dueño |
|---|---|---|---|---|---|
| **R17** | connection.gd parser binario no implementado | Alta (confirmado) | Crítico (F9 roto lado cliente) | ADR-012 + implementación tornillo | tornillo (✅ hecho en a6339a6) |

**R17 CERRADO** tras `a6339a6`.

## Justificación

- Sin esto, ADR-011 es inútil del lado cliente. `vigia` midió: frame binario actual = 39 353 bytes avg (12 B header + 39 341 B JSON body). El body sigue siendo JSON porque el **compact body ADR-006 v2** (DataView con bit-packing) está pendiente para H3.
- 25.2 MB/s a 30 clientes (DoD F9 pide 3 MB/s) — sigue 8.4× arriba. **ADR-012 no resuelve el ancho de banda**; solo habilita que el cliente reciba lo que el servidor ya envía.
- La reducción de ancho de banda real vendrá con el **compact body H3** (bit-packing de coordenadas int16 1/16u, flags, etc., según ADR-006 v2 formato binario).

## Estado del ancho de banda tras ADR-011 + ADR-012

| Métrica | Sin ADR-011/012 | Con ADR-011/012 (hoy) | Con compact body H3 |
|---|---|---|---|
| Formato snapshot | JSON completo | Header binario + JSON body | Bit-packing completo |
| Tamaño/tick | 40.7 KB | 39.4 KB (12 B header) | ~1.2 KB (target) |
| Bandwidth 30 clientes | 23.85 MB/s | 25.2 MB/s (medido por vigia) | ~720 KB/s (target) |
| DoD F9 (≤3 MB/s) | 8× fuera | 8× fuera | OK |

**Conclusión honesta:** ADR-011 + ADR-012 habilitan el path binario pero NO cumplen DoD F9 todavía. El compact body H3 es **imprescindible** para F9.

## Decisiones derivadas

1. **H2 acceptance** puede proceder sin compact body (con 2-4 clientes en LAN, ancho de banda no es problema).
2. **F9 acceptance** (30 clientes) requiere compact body H3 → nuevo ADR cuando lo ataquemos.
3. `vigia` mantendrá `it.fails` en `e2e.test.mjs` (5 KB size + benchmark) como recordatorio hasta H3.

## Reversión

- Si `WebSocketPeer` de Godot 4.7 tuviera limitaciones con binary frames: `room.useBinary = false` (flag ya existe en ADR-011) → fallback a JSON texto. Coste: no cumple DoD F9 pero H2 básico funciona.
- No hemos encontrado problemas; `tornillo` ya implementó el parser y la estructura GDScript es estándar.

## Tests (asignados a `vigia`)

- Unit GDScript: `_handle_binary_snapshot` con frame válido → emite signal snapshot.
- Unit: CRC corrupto → descarta + push_warning.
- Unit: magic incorrecto → descarta.
- Unit: versión incorrecta → descarta.
- E2E: 2 clientes Godot conectados, reciben snapshots, gusanos se mueven.

## Implementación efectiva

- `tornillo` commit `a6339a6` — implementa parser binario + helpers + backward compat JSON. Cubre los 8 pasos de `vigia`.
- `vigia` ya detectó que el **body sigue siendo JSON** (compact body H3 pendiente) — no es defecto de `tornillo`, es deuda de Fase 3.

## Próximos pasos del ancho de banda (para F9)

1. **H2 (ahora):** aceptación con 2-4 clientes en LAN. No necesita compact body.
2. **H3 (después):** compact body con bit-packing ADR-006 v2. Nuevos tests en `protocol.test.mjs` midiendo <=1.5 KB/tick con 30 jugadores + deltas de food. Reduce 25× el ancho de banda.
3. **F9 acceptance (H3+):** 30 clientes simultáneos, benchmark <=3 MB/s, latencia <=200 ms con jitter.
