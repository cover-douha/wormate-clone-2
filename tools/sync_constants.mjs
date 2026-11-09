// tools/sync_constants.mjs
// Sincroniza constantes entre GDScript (autoload/tuning_store.gd) y JS (server/protocol.mjs).
// Fuente de verdad: server/protocol.mjs (este archivo).
// Destino: scripts/game/worm_constants.gd (autogenerado).
// Uso: pnpm sync:constants

import { writeFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { WORLD as W } from '../server/protocol.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const lines = [
  '# AUTOGENERADO por tools/sync_constants.mjs — NO EDITAR A MANO.',
  '# Fuente de verdad: server/protocol.mjs',
  '',
  'extends RefCounted',
  'class_name WormConstants',
  '',
];

for (const [k, v] of Object.entries(W)) {
  let gd;
  if (typeof v === 'string') {
    gd = `"${v}"`;
  } else if (typeof v === 'number') {
    gd = Number.isInteger(v) ? String(v) : String(v);
  } else {
    gd = JSON.stringify(v);
  }
  lines.push(`const ${k} := ${gd}`);
}

lines.push('');

const out = join(root, 'scripts', 'game', 'worm_constants.gd');
writeFileSync(out, lines.join('\n'), 'utf8');
console.log(`[sync] wrote ${out}`);

// Verificacion: leer de vuelta y comparar
const back = readFileSync(out, 'utf8');
const ok = back.includes(`const WIDTH := ${W.WIDTH}`);
if (!ok) {
  console.error('[sync] verification FAILED');
  process.exit(1);
}
console.log('[sync] verification OK');
