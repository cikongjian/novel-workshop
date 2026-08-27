import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const outputDirectory = path.join(root, 'artifacts', 'sbom');
const npmCliPath = process.env.npm_execpath;
const targets = [
  { name: 'backend', directory: root },
  { name: 'web', directory: path.join(root, 'web') },
];
const sbomArguments = [
  'sbom',
  '--package-lock-only',
  '--omit=dev',
  '--sbom-format',
  'cyclonedx',
  '--sbom-type',
  'application',
];

mkdirSync(outputDirectory, { recursive: true });

if (!npmCliPath) {
  throw new Error('Run SBOM generation through npm so the installed npm CLI can be resolved.');
}

for (const target of targets) {
  const result = spawnSync(process.execPath, [npmCliPath, ...sbomArguments], {
    cwd: target.directory,
    encoding: 'buffer',
  });

  if (result.error || result.status !== 0) {
    if (result.stderr) process.stderr.write(result.stderr);
    throw result.error ?? new Error(`Unable to generate ${target.name} SBOM (exit ${result.status}).`);
  }

  const manifest = JSON.parse(readFileSync(path.join(target.directory, 'package.json'), 'utf8'));
  const sbom = JSON.parse(result.stdout.toString('utf8'));
  const rootComponent = sbom?.metadata?.component;
  if (
    sbom?.bomFormat !== 'CycloneDX'
    || typeof rootComponent !== 'object'
    || rootComponent === null
    || typeof manifest.name !== 'string'
    || typeof manifest.version !== 'string'
  ) {
    throw new Error(`npm returned an invalid ${target.name} CycloneDX document.`);
  }

  rootComponent.name = manifest.name;
  rootComponent.version = manifest.version;

  const outputPath = path.join(outputDirectory, `${target.name}.cyclonedx.json`);
  writeFileSync(outputPath, `${JSON.stringify(sbom, null, 2)}\n`, 'utf8');
  console.log(`Generated ${path.relative(root, outputPath)}.`);
}
