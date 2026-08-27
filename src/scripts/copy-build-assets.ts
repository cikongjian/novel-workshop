import fs from 'node:fs/promises';
import path from 'node:path';

export async function copyBuildAssets(): Promise<void> {
  const srcPromptsDir = path.resolve('src/agents/prompts');
  const distPromptsDir = path.resolve('dist/agents/prompts');

  await fs.mkdir(path.dirname(distPromptsDir), { recursive: true });
  await fs.cp(srcPromptsDir, distPromptsDir, { recursive: true });
}

export async function runCopyBuildAssetsCli(): Promise<number> {
  await copyBuildAssets();
  return 0;
}

async function main(): Promise<void> {
  await runCopyBuildAssetsCli();
}

function isExecutedAsEntry(): boolean {
  const argv1 = process.argv[1];
  if (!argv1) return false;
  return path.basename(argv1).includes('copy-build-assets');
}

if (isExecutedAsEntry()) {
  void main().catch((err) => {
    console.error('[copy-build-assets] failed:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
