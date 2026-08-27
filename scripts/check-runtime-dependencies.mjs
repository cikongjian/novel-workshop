import { existsSync, readdirSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const root = process.cwd();

const { default: Database } = await import('better-sqlite3');
const database = new Database(':memory:');
try {
  const result = database.prepare('SELECT 1 AS ok').get();
  if (result?.ok !== 1) throw new Error('better-sqlite3 query returned an unexpected result.');
} finally {
  database.close();
}

const { default: sharp } = await import('sharp');
await sharp({
  create: {
    width: 1,
    height: 1,
    channels: 4,
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  },
}).png().toBuffer();

const lance = await import('@lancedb/lancedb');
if (typeof lance.connect !== 'function') throw new Error('@lancedb/lancedb did not expose connect().');

const lanceDirectory = await mkdtemp(path.join(tmpdir(), 'novel-workshop-lancedb-'));
try {
  await lance.connect(lanceDirectory);
} finally {
  await rm(lanceDirectory, { recursive: true, force: true });
}

const sharpPackageRoot = path.join(root, 'node_modules', '@img');
const sharpPackages = existsSync(sharpPackageRoot)
  ? readdirSync(sharpPackageRoot).filter((name) => name.startsWith('sharp-'))
  : [];
if (!sharpPackages.some((name) => existsSync(path.join(sharpPackageRoot, name, 'LICENSE')))) {
  throw new Error('Installed Sharp runtime packages do not include their license text.');
}

console.log('Native runtime dependency checks passed.');
