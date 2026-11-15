// Minimal Replicate client shared by the asset generation scripts.
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

export const root = resolve(import.meta.dirname, '../..');

if (existsSync(resolve(root, '.env.local'))) process.loadEnvFile(resolve(root, '.env.local'));
const token = process.env.REPLICATE_API_TOKEN;
if (!token) throw new Error('REPLICATE_API_TOKEN missing - add it to .env.local');

async function api(path, body) {
  const res = await fetch(`https://api.replicate.com/v1/${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Prefer: 'wait=60' },
    body: body && JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${path}: ${res.status} ${await res.text()}`);
  return res.json();
}

/** Runs a model to completion and returns its (first) output URL. */
export async function run(model, input) {
  let p = await api(`models/${model}/predictions`, { input });
  while (!['succeeded', 'failed', 'canceled'].includes(p.status)) {
    await new Promise((r) => setTimeout(r, 2000));
    p = await api(`predictions/${p.id}`);
  }
  if (p.status !== 'succeeded') throw new Error(`${model} ${p.status}: ${p.error}`);
  return Array.isArray(p.output) ? p.output[0] : p.output;
}

export async function download(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download ${url}: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

/** Picks the assets named on the command line, or every asset whose output file is missing. */
export function selectTodo(assets, fileFor) {
  const wanted = process.argv.slice(2);
  return assets.filter((a) => (wanted.length ? wanted.includes(a.name) : !existsSync(fileFor(a))));
}

export async function runAll(todo, fn) {
  const results = await Promise.allSettled(todo.map(fn));
  results.forEach((r, i) => r.status === 'rejected' && console.error(`✗ ${todo[i].name}: ${r.reason.message}`));
  if (results.some((r) => r.status === 'rejected')) process.exitCode = 1;
}
