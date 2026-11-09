// tests/server/grid.test.mjs
// Tests unitarios del SpatialGrid.
import { describe, it, expect } from 'vitest';
import { SpatialGrid } from '../../server/game/grid.mjs';
import { WORLD } from '../../server/protocol.mjs';

describe('SpatialGrid — insert/query', () => {
  it('queryHeadHit devuelve null si no hay segmentos ajenos cerca', () => {
    const g = new SpatialGrid();
    expect(g.queryHeadHit({ x: 100, y: 100 }, 'player1')).toBeNull();
  });

  it('queryHeadHit devuelve segmento ajeno dentro del radio', () => {
    const g = new SpatialGrid();
    g.insert('s1', 'bot_0', 100, 100);
    const hit = g.queryHeadHit({ x: 100, y: 100 }, 'player1');
    expect(hit).not.toBeNull();
    expect(hit.owner).toBe('bot_0');
  });

  it('queryHeadHit ignora segmentos del propio owner', () => {
    const g = new SpatialGrid();
    g.insert('s1', 'player1', 100, 100);
    const hit = g.queryHeadHit({ x: 100, y: 100 }, 'player1');
    expect(hit).toBeNull();
  });

  it('queryHeadHit respeta el radio (no halla fuera de radio)', () => {
    const g = new SpatialGrid();
    // Celda 50px. Segmento en (200, 200). Head en (100, 100): distancia ~141, > HIT_RADIUS(12).
    g.insert('s1', 'bot_0', 200, 200);
    const hit = g.queryHeadHit({ x: 100, y: 100 }, 'player1', WORLD.HIT_RADIUS);
    expect(hit).toBeNull();
  });

  it('queryHeadHit busca en celdas vecinas (3x3)', () => {
    const g = new SpatialGrid();
    // Segmento en celda (1,0) = (50..100, 0..50)
    g.insert('s1', 'bot_0', 60, 10);
    // Head en celda (0,0) = (0..50, 0..50), muy cerca del borde
    const hit = g.queryHeadHit({ x: 49, y: 10 }, 'player1', WORLD.HIT_RADIUS);
    expect(hit).not.toBeNull();
    expect(hit.owner).toBe('bot_0');
  });
});

describe('SpatialGrid — remove', () => {
  it('removeSegment elimina un segmento especifico', () => {
    const g = new SpatialGrid();
    g.insert('s1', 'bot_0', 100, 100);
    g.removeSegment('s1', 100, 100);
    expect(g.queryHeadHit({ x: 100, y: 100 }, 'player1')).toBeNull();
  });

  it('removeOwner elimina todos los segmentos de un owner', () => {
    const g = new SpatialGrid();
    const segs = [
      { id: 'bot_0_0', x: 100, y: 100 },
      { id: 'bot_0_1', x: 110, y: 110 },
      { id: 'bot_0_2', x: 120, y: 120 },
    ];
    for (const s of segs) g.insert(s.id, 'bot_0', s.x, s.y);
    g.removeOwner('bot_0', segs);
    expect(g.queryHeadHit({ x: 100, y: 100 }, 'player1')).toBeNull();
    expect(g.queryHeadHit({ x: 110, y: 110 }, 'player1')).toBeNull();
    expect(g.queryHeadHit({ x: 120, y: 120 }, 'player1')).toBeNull();
  });
});

describe('SpatialGrid — clear', () => {
  it('clear vacia todas las celdas', () => {
    const g = new SpatialGrid();
    g.insert('s1', 'bot_0', 100, 100);
    g.insert('s2', 'bot_1', 500, 500);
    g.clear();
    expect(g.queryHeadHit({ x: 100, y: 100 }, 'player1')).toBeNull();
    expect(g.queryHeadHit({ x: 500, y: 500 }, 'player1')).toBeNull();
  });
});
