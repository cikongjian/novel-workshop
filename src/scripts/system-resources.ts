import path from 'node:path';
import { collectSystemResourcesSnapshot } from '../services/system-resources.js';

export async function runSystemResourcesCli(): Promise<number> {
  const snapshot = await collectSystemResourcesSnapshot();
  process.stdout.write(`${JSON.stringify(snapshot, null, 2)}\n`);
  return 0;
}

async function main(): Promise<void> {
  process.exitCode = await runSystemResourcesCli();
}

function isExecutedAsEntry(): boolean {
  const argv1 = process.argv[1];
  if (!argv1) return false;
  return path.basename(argv1).includes('system-resources');
}

if (isExecutedAsEntry()) {
  void main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
