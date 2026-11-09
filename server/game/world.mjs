// server/game/world.mjs
// GameWorld: bucle de simulacion a 20 Hz. Resuelve colisiones (R4: solo servidor mata).
// Genera comida, ejecuta bots, emite snapshots delta.

import { Worm } from './worm.mjs';
import { FoodSystem } from './food.mjs';
import { SpatialGrid } from './grid.mjs';
import { WORLD } from '../protocol.mjs';

export class GameWorld {
  constructor({ width = WORLD.WIDTH, height = WORLD.HEIGHT } = {}) {
    this.width = width;
    this.height = height;
    this.worms = new Map(); // id -> Worm
    this.food = new FoodSystem();
    this.grid = new SpatialGrid();
    this.seq = 0;
    this.bots = new Map(); // id -> { state: 'WANDER'|'SEEK_FOOD'|'AVOID_HEAD', timer }
    this._inputs = new Map(); // id -> input pendiente
    this._pendingDeaths = [];
    this._spawnBots(8); // H1: 8 bots tontos para probar single-player
    this.food.spawn();
  }

  _spawnBots(n) {
    for (let i = 0; i < n; i++) {
      const id = `bot_${i}`;
      const head = this._randomSpawn();
      this.worms.set(id, new Worm({
        id, name: `Bot${i + 1}`, skin: i % 4,
        head, angle: Math.random() * Math.PI * 2,
      }));
      this.bots.set(id, { state: 'WANDER', timer: 0 });
    }
  }

  _randomSpawn() {
    const margin = 200;
    return {
      x: margin + Math.random() * (this.width - margin * 2),
      y: margin + Math.random() * (this.height - margin * 2),
    };
  }

  addPlayer({ playerId, name, skin }) {
    const head = this._randomSpawn();
    this.worms.set(playerId, new Worm({
      id: playerId, name: name || 'Player', skin: skin || 0,
      head, angle: Math.random() * Math.PI * 2,
    }));
  }

  removePlayer(playerId) {
    const w = this.worms.get(playerId);
    if (!w) return;
    if (w.alive) this._dropWormFood(w);
    this.worms.delete(playerId);
    this.bots.delete(playerId);
    this._inputs.delete(playerId);
  }

  applyInput(playerId, input) {
    this._inputs.set(playerId, input);
  }

  _applyPlayerInputs() {
    for (const [id, input] of this._inputs) {
      const w = this.worms.get(id);
      if (!w || !w.alive) continue;
      switch (input.t) {
        case 'target': w.setTarget(input); break;
        case 'boost_start': w.setBoost(true); break;
        case 'boost_stop': w.setBoost(false); break;
        case 'respawn': this._respawn(id); break;
      }
    }
    this._inputs.clear();
  }

  _tickBots(dt) {
    for (const [id, b] of this.bots) {
      const w = this.worms.get(id);
      if (!w || !w.alive) continue;
      b.timer -= dt;
      if (b.timer <= 0) {
        b.state = ['WANDER', 'SEEK_FOOD', 'AVOID_HEAD'][Math.floor(Math.random() * 3)];
        b.timer = 1 + Math.random() * 2;
      }
      // IA minima: cada estado genera un target
      if (b.state === 'WANDER') {
        w.setTarget({
          x: Math.max(50, Math.min(this.width - 50, w.head.x + (Math.random() - 0.5) * 400)),
          y: Math.max(50, Math.min(this.height - 50, w.head.y + (Math.random() - 0.5) * 400)),
        });
      } else if (b.state === 'SEEK_FOOD') {
        let best = null, bestD = Infinity;
        for (const f of this.food.items.values()) {
          const dx = f.x - w.head.x, dy = f.y - w.head.y;
          const d = dx * dx + dy * dy;
          if (d < bestD) { bestD = d; best = f; }
        }
        if (best) w.setTarget({ x: best.x, y: best.y });
      } else if (b.state === 'AVOID_HEAD') {
        // Huye del centro del mundo
        w.setTarget({ x: this.width / 2, y: this.height / 2 });
      }
    }
  }

  tick(dt, seq) {
    this.seq = seq;
    this._applyPlayerInputs();
    this._tickBots(dt);

    // Mover gusanos
    for (const w of this.worms.values()) {
      if (!w.alive) continue;
      w.tick(dt);
      // Worm.tick puede matar por borde (sin killer). Surfacerlo en pendingDeaths
      // para que el snapshot incluya el evento y el cliente/HUD reaccione.
      if (!w.alive) {
        this._pendingDeaths.push({ dead: w.id, by: null });
      }
    }

    // Indexar segmentos en el grid
    this.grid.clear();
    for (const w of this.worms.values()) {
      if (!w.alive) continue;
      let i = 0;
      for (const seg of w.path) {
        this.grid.insert(`${w.id}_${i}`, w.id, seg.x, seg.y);
        i++;
        // Muestrear cada N puntos para no llenar el grid
        if (i % 3 === 0 && i + 2 < w.path.length) i += 2;
      }
    }

    // Comida: comer
    for (const w of this.worms.values()) {
      if (!w.alive) continue;
      const eaten = this.food.eatAt(w.head);
      for (const e of eaten) w.grow(e.value);
    }
    this.food.spawn();

    // Colisiones cabeza-vs-cuerpo ajeno
    for (const w of this.worms.values()) {
      if (!w.alive) continue;
      const hit = this.grid.queryHeadHit(w.head, w.id);
      if (hit) {
        this._pendingDeaths.push({ dead: w.id, by: hit.owner });
      }
    }

    // Head vs head (configurable: BOTH_DIE por defecto)
    const aliveWorms = Array.from(this.worms.values()).filter((w) => w.alive);
    for (let i = 0; i < aliveWorms.length; i++) {
      for (let j = i + 1; j < aliveWorms.length; j++) {
        const a = aliveWorms[i], b = aliveWorms[j];
        const dx = a.head.x - b.head.x, dy = a.head.y - b.head.y;
        const r = WORLD.HIT_RADIUS * 2;
        if (dx * dx + dy * dy <= r * r) {
          if (WORLD.HEAD_VS_HEAD === 'BOTH_DIE') {
            this._pendingDeaths.push({ dead: a.id, by: b.id });
            this._pendingDeaths.push({ dead: b.id, by: a.id });
          }
          // NOBODY_DIES: no hacer nada
        }
      }
    }

    // Aplicar muertes (R4: solo servidor)
    // Set evita doble-proceso: una worm puede aparecer en _pendingDeaths por
    // borde + colision simultaneamente. Tambien permite procesar worms que
    // murieron durante tick() (p.ej. por borde) — w.alive ya es false pero
    // aun no han sido procesadas para drop de comida ni evento de muerte.
    const deaths = [];
    const processed = new Set();
    for (const d of this._pendingDeaths) {
      if (processed.has(d.dead)) continue;
      const w = this.worms.get(d.dead);
      if (!w) continue;
      processed.add(d.dead);
      if (w.alive) w.die();
      this._dropWormFood(w);
      deaths.push({ playerId: w.id, by: d.by });
    }
    this._pendingDeaths = [];

    return {
      seq,
      players: Array.from(this.worms.values()).map((w) => w.snapshot()),
      food: this.food.snapshot(),
      deaths,
      leaderboard: this._leaderboard(),
    };
  }

  _dropWormFood(w) {
    for (const seg of w.path) {
      if (Math.random() < 0.5) this.food.addDrop({ x: seg.x, y: seg.y, value: 1 });
    }
  }

  _respawn(id) {
    const old = this.worms.get(id);
    if (!old) return;
    const head = this._randomSpawn();
    const w = new Worm({
      id, name: old.name, skin: old.skin,
      head, angle: Math.random() * Math.PI * 2,
    });
    this.worms.set(id, w);
  }

  _leaderboard() {
    return Array.from(this.worms.values())
      .sort((a, b) => b.mass - a.mass)
      .slice(0, 10)
      .map((w) => ({ id: w.id, score: w.mass, name: w.name }));
  }

  getFullSnapshot() {
    return {
      seq: this.seq,
      players: Array.from(this.worms.values()).map((w) => w.snapshot()),
      food: this.food.snapshot(),
      deaths: [],
      leaderboard: this._leaderboard(),
    };
  }
}
