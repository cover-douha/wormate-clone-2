// tests/server/world.test.mjs
// Smoke test del GameWorld. Cubre H1: spawn, tick, comida, muerte por borde.
// H2 anadira: dos gusanos, colision cabeza-vs-cuerpo, snapshot delta.

import { describe, it, expect } from 'vitest';
import { GameWorld } from '../../server/game/world.mjs';
import { WORLD } from '../../server/protocol.mjs';

describe('GameWorld H1 smoke', () => {
  it('genera comida hasta FOOD_CAP al arrancar', () => {
    const w = new GameWorld();
    expect(w.food.items.size).toBeGreaterThanOrEqual(WORLD.FOOD_CAP - 1);
  });

  it('mueve gusanos vivos en un tick', () => {
    const w = new GameWorld();
    const head0 = { ...w.worms.get('bot_0').head };
    w.applyInput('bot_0', { t: 'target', x: WORLD.WIDTH, y: WORLD.HEIGHT });
    w.tick(0.05, 1);
    const head1 = w.worms.get('bot_0').head;
    // La cabeza debe haberse movido (a menos que el bot eligiera otro target).
    expect(Math.abs(head1.x - head0.x) + Math.abs(head1.y - head0.y)).toBeGreaterThan(0);
  });

  it('detecta muerte por salir del mundo', () => {
    const w = new WorldEdgeTest();
    w._spawnPlayerOutsideEdge();
    w.tick(0.05, 1);
    expect(w.deaths.length).toBeGreaterThan(0);
  });
});

class WorldEdgeTest extends GameWorld {
  constructor() { super(); this.deaths = []; }
  _spawnPlayerOutsideEdge() {
    // Forzar un gusano fuera de los limites en el primer tick.
    const Worm = this.worms.get('bot_0').constructor;
    const w = new Worm({
      id: 'edge_test', name: 'Edge', skin: 0,
      head: { x: -100, y: -100 }, angle: 0,
    });
    this.worms.set('edge_test', w);
  }
  // Capturar muertes: override del tick para empujar deaths al array.
  tick(dt, seq) {
    const snap = super.tick(dt, seq);
    for (const d of snap.deaths) this.deaths.push(d);
    return snap;
  }
}
