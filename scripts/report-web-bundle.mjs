import fs from 'node:fs/promises';
import path from 'node:path';

const projectRoot = process.cwd();
const distDir = path.resolve(projectRoot, 'web/dist');
const assetsDir = path.join(distDir, 'assets');

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

async function listFiles(dirPath) {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const resolvedPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listFiles(resolvedPath));
      continue;
    }
    files.push(resolvedPath);
  }

  return files;
}

function summarizeByExtension(files) {
  const totals = new Map();

  for (const file of files) {
    const ext = path.extname(file.path) || '(none)';
    totals.set(ext, (totals.get(ext) ?? 0) + file.size);
  }

  return [...totals.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([ext, size]) => ({ ext, size }));
}

async function main() {
  const allFiles = await listFiles(distDir);
  const stats = await Promise.all(allFiles.map(async (filePath) => {
    const fileStat = await fs.stat(filePath);
    return {
      path: filePath,
      relativePath: path.relative(distDir, filePath).replace(/\\/g, '/'),
      size: fileStat.size,
    };
  }));

  const assetStats = stats.filter((file) => file.path.startsWith(assetsDir));
  const topJs = assetStats
    .filter((file) => file.relativePath.endsWith('.js'))
    .sort((a, b) => b.size - a.size)
    .slice(0, 15);
  const topCss = assetStats
    .filter((file) => file.relativePath.endsWith('.css'))
    .sort((a, b) => b.size - a.size)
    .slice(0, 15);

  const extensionTotals = summarizeByExtension(assetStats);
  const totalSize = assetStats.reduce((sum, file) => sum + file.size, 0);

  console.log('Web bundle report');
  console.log(`Dist: ${distDir}`);
  console.log(`Asset files: ${assetStats.length}`);
  console.log(`Total asset size: ${formatBytes(totalSize)}`);
  console.log('');
  console.log('By extension:');
  for (const item of extensionTotals) {
    console.log(`  ${item.ext.padEnd(6)} ${formatBytes(item.size)}`);
  }
  console.log('');
  console.log('Top JS assets:');
  for (const item of topJs) {
    console.log(`  ${formatBytes(item.size).padStart(10)}  ${item.relativePath}`);
  }
  console.log('');
  console.log('Top CSS assets:');
  for (const item of topCss) {
    console.log(`  ${formatBytes(item.size).padStart(10)}  ${item.relativePath}`);
  }
}

main().catch((error) => {
  console.error('Failed to build bundle report:', error);
  process.exitCode = 1;
});
