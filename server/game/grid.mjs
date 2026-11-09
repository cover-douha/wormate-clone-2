// server/game/grid.mjs
// Grid espacial hash (R1) para colisiones cabeza-vs-cuerpo O(1) por vecindario.
// Celda = WORLD.GRID_CELL (50 u). 30 gusanos * 40 segmentos = 1200 inserciones/tick < 1 ms.

import { WORLD } from '../protocol.mjs';

export class SpatialGrid {
  constructor(cell = WORLD.GRID_CELL) {
    this.cell = cell;
    this.cells = new Map(); // "cx:cy" -> Map<segmentId, { owner, x, y }>
  }

  _key(cx, cy) {
    return cx + ':' + cy;
  }

  _at(x, y) {
    return this._key(Math.floor(x / this.cell), Math.floor(y / this.cell));
  }

  insert(segmentId, owner, x, y) {
    const k = this._at(x, y);
    let bucket = this.cells.get(k);
    if (!bucket) {
      bucket = new Map();
      this.cells.set(k, bucket);
    }
    bucket.set(segmentId, { owner, x, y });
  }

  removeSegment(segmentId, x, y) {
    const k = this._at(x, y);
    const bucket = this.cells.get(k);
    if (!bucket) return;
    bucket.delete(segmentId);
    if (bucket.size === 0) this.cells.delete(k);
  }

  removeOwner(owner, segments) {
    for (const s of segments) this.removeSegment(s.id, s.x, s.y);
  }

  // Busca el primer segmento ajeno al owner cuya cabeza colisiona (circ-circ).
  queryHeadHit(head, owner, hitRadius = WORLD.HIT_RADIUS) {
    const cx = Math.floor(head.x / this.cell);
    const cy = Math.floor(head.y / this.cell);
    const r2 = hitRadius * hitRadius;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const bucket = this.cells.get(this._key(cx + dx, cy + dy));
        if (!bucket) continue;
        for (const seg of bucket.values()) {
          if (seg.owner === owner) continue;
          const sx = seg.x - head.x;
          const sy = seg.y - head.y;
          if (sx * sx + sy * sy <= r2) return seg;
        }
      }
    }
    return null;
  }

  clear() {
    this.cells.clear();
  }
}
