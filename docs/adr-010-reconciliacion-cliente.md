# ADR-010 — Política de reconciliación cliente (H2)

**Estado:** Aceptado · **Fecha:** 2026-11-09 · **Decisionista:** Arquitecto (sobre propuesta de `vigia`)
**Propuesta original:** `vigia` en handoff del 2026-11-09. Revisión: `timonel` (arquitecto) con un ajuste menor en los umbrales (ver abajo).

## Contexto

ADR-006 v2 define el **formato** del snapshot delta. ADR-001 define servidor autoritativo + interpolación 100 ms. Pero la **política de comportamiento** del cliente (cómo reconciliar, cuándo predecir, cuándo snap) estaba dispersa en `worm.gd` y `connection.gd` sin documento único.

`vigia` detectó además que el "fix #2" de `tornillo` (commit `c6bddad`) en realidad dejó un comentario honesto en `worm.gd:112-114` diciendo que H1 sigue usando follow-the-leader y H2 usará `reconcile_from_snapshot` con path-sampling puro. **Es deuda técnica documentada, no bug.** Este ADR formaliza el pago de esa deuda.

## Decisión

### 1. Predicción local (gusano propio)
El cliente corre una simulación local de su propio gusano con el último input confirmado. Render en `t_now` sin delay. El input nuevo se aplica local sin esperar ack del servidor.

### 2. Gusanos ajenos
Render con delay `INTERP_MS = 100 ms`, interpolando entre los dos últimos snapshots recibidos. Sin extrapolación.

### 3. Reconciliación de cabeza propia
Cuando llega un snapshot, comparar la cabeza autoritativa del servidor con la predicción local:

| Delta | Acción |
|---|---|
| `delta < UMBRAL` (18 u) | Blend suave hacia el objetivo: `head = lerp(head, serverHead, 0.15)` por frame |
| `UMBRAL ≤ delta < SNAP_SOFT` (18–100 u) | Snap suave: el cliente se mueve a la posición del servidor en 100 ms (lerp en N frames) |
| `delta ≥ SNAP_SOFT` (100 u) | Snap duro inmediato: teleport visual. Sospecha de teleport, reconexión o colisión no predicha |

### 4. Reconstrucción del path
**H2 no usa follow-the-leader.** El snapshot delta trae `head + angle + length`. El cliente reconstruye `_segments` históricos a `SEG_SPACING` u de distancia, muestreando a lo largo del ángulo actual.

El **full-state snapshot** (1 Hz, para reconexión) trae `path` completo del servidor y se aplica directamente.

### 5. Muertes
**El cliente nunca mata** en H2 (refuerza R4 anti-cheat). Toda muerte llega vía `snapshot.deaths` y el cliente solo anima la defunción. Esto incluye la muerte del gusano propio.

### 6. Excepción H1
El commit `4624e0c` (H1 single-player) mata localmente porque no hay servidor. **Al migrar a H2**, eliminar la lógica de muerte local de `worm.gd` y `worm_arena.gd` y reemplazar por escucha de `snapshot.deaths`.

## Ajustes de `timonel` a la propuesta de `vigia`

- `vigia` proponía tres umbrales: `<UMBRAL`, `18u≤delta<100u`, `≥100u`. **Acepto**.
- `vigia` proponía "blend 15%/frame". **Acepto**, pero **aclaramos**: el blend debe ser frame-rate-independent (`1 - exp(-dt / 0.10)`) según `docs/game-multiplayer.md:121`. El 15% solo es correcto a 60 FPS.
- `vigia` proponía "snap suave 100ms". **Acepto**. Implementación: Tween o Lerp manual con duración 100 ms.

## Implementación (asignada a `tornillo`)

- `worm.gd::reconcile_from_snapshot`: reemplazar el `set directo` actual por la lógica de umbrales (§3).
- `worm.gd::reconstruct_path`: nueva función para §4. Reemplaza `_rebuild_segments` follow-the-leader.
- `worm_arena.gd`: en H2, escuchar `snapshot` signal de `connection.gd` y aplicar.
- `worm_arena.gd::_check_food_collision`: en H2, eliminar (la autoridad de comida es del servidor).

## Justificación

- Centraliza comportamientos que estaban dispersos en `worm.gd` y `connection.gd`.
- Diferencia explícita entre H1 (single-player, autoridad local) y H2 (servidor autoritativo). Sin esta separación, migrar H1→H2 rompería el cliente.
- Cubre R3 (predicción local + blend), R4 (muerte solo del servidor) y R6 (skin no afecta hitbox, ya garantizado por `skin_catalog.gd`).

## Riesgos nuevos

| ID | Riesgo | Mitigación |
|---|---|---|
| R14 | Blend 15% causa nausea en jugadores sensibles | `tuning_store.gd` ya tiene `reduced_motion`. Aplicar también a blend. |
| R15 | Path reconstruction produce jitter visual | Si persiste, ADR-006 v2 prevé enviar `path` completo cada N ticks. |

## Reversión

Si el blend causa nausea o la reconstrucción de path jitter inaceptable: bajar a snap duro (delta < UMBRAL → snap, sin blend) o interpolar todo con delay 200 ms. Coste: respuesta visual menos fluida, pero jugable.

## Tests (asignados a `vigia`)

- Unit GDScript: `worm.gd::reconcile_from_snapshot` con delta 5u (blend), 50u (snap suave), 200u (snap duro).
- E2E Playwright: dos clientes, simular 100–200 ms RTT, verificar que el gusano propio no salta y los ajenos se ven fluidos.
- E2E: una worm muere por borde → solo el servidor emite `snapshot.deaths` → cliente no la mata localmente.
