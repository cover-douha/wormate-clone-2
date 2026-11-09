// server/game/food.mjs
// Comida dispersa y drops. Spawn aleatorio hasta FOOD_CAP.
// ID uint32 (ADR-006); rotacion sin colision.

import { WORLD } from '../protocol.mjs';

export class FoodSystem {
  constructor() {
    this.items = new Map(); // id -> { id, x, y, value, kind }
    this._nextId = 1;
  }

  spawn(target = WORLD.FOOD_CAP) {
    while (this.items.size < target) {
      const id = this._nextId++;
      this.items.set(id, {
        id,
        x: Math.random() * WORLD.WIDTH,
        y: Math.random() * WORLD.HEIGHT,
        value: 1,
        kind: Math.floor(Math.random() * 4), // 0..3
      });
    }
  }

  addDrop({ x, y, value = 1 }) {
    const id = this._nextId++;
    this.items.set(id, { id, x, y, value, kind: 4 /* drop */ });
  }

  // Devuelve comida consumida por una cabeza en un radio.
  eatAt(head, radius = WORLD.HIT_RADIUS + 4) {
    const eaten = [];
    for (const [id, item] of this.items) {
      const dx = item.x - head.x;
      const dy = item.y - head.y;
      if (dx * dx + dy * dy <= radius * radius) {
        eaten.push(item);
        this.items.delete(id);
      }
    }
    return eaten;
  }

  remove(id) {
    this.items.delete(id);
  }

  snapshot() {
    return Array.from(this.items.values());
  }
}
