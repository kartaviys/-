// Генератор кодов MAGISTER для ЕГЭ Квест.
// Запуск: node tools/magister-codes.mjs 10   — напечатает 10 новых кодов.
// Алгоритм проверки совпадает с app/js/world.js (validCode).
import { randomInt } from 'node:crypto';

const ALPH = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const fnv = (str) => { let x = 0x811c9dc5; for (const ch of str) { x ^= ch.charCodeAt(0); x = Math.imul(x, 0x01000193) >>> 0; } return x; };
const checkPart = (body) => { const x = fnv(body + '|MAGISTER|2026'); return ALPH[x % 32] + ALPH[(x >>> 5) % 32]; };

const n = Number(process.argv[2] || 5);
for (let i = 0; i < n; i++) {
  const body = Array.from({ length: 6 }, () => ALPH[randomInt(32)]).join('');
  const c = body + checkPart(body);
  console.log(`MAG-${c.slice(0, 4)}-${c.slice(4)}`);
}
