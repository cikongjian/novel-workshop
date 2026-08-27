import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const maximumGitBatchOutputBytes = Number.parseInt(process.env.OSS_HISTORY_SCAN_MAX_BYTES ?? '67108864', 10);

if (!Number.isSafeInteger(maximumGitBatchOutputBytes) || maximumGitBatchOutputBytes <= 0) {
  throw new Error('OSS_HISTORY_SCAN_MAX_BYTES must be a positive integer.');
}

const credentialPatterns = [
  { name: 'private key', expression: /-----BEGIN(?: [A-Z]+)? PRIVATE KEY-----/u },
  { name: 'AWS access key', expression: /\bAKIA[0-9A-Z]{16}\b/u },
  { name: 'OpenAI-style API key', expression: /\bsk-[A-Za-z0-9_-]{20,}\b/u },
  { name: 'GitHub token', expression: /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/u },
  { name: 'Slack token', expression: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/u },
  { name: 'Google API key', expression: /\bAIza[0-9A-Za-z_-]{30,}\b/u },
  {
    name: 'non-empty credential environment fallback',
    expression: /process\.env\.[A-Z0-9_]*(?:PASSWORD|SECRET|TOKEN|CREDENTIAL|API_?KEY)[A-Z0-9_]*\s*(?:\|\||\?\?)\s*(['"`])(?!\1)/u,
  },
];

function runGit(args, encoding = 'utf8') {
  return execFileSync('git', args, { encoding });
}

function objectLocations() {
  const locations = new Map();
  for (const line of runGit(['rev-list', '--objects', '--all']).split(/\r?\n/u)) {
    const [objectId, ...pathParts] = line.split(' ');
    if (objectId) locations.set(objectId, pathParts.join(' ') || 'repository history');
  }

  const fsckOutput = runGit(['fsck', '--full', '--no-reflogs', '--unreachable']);
  for (const line of fsckOutput.split(/\r?\n/u)) {
    const match = /^unreachable blob ([0-9a-f]{40})$/u.exec(line);
    if (match) locations.set(match[1], 'unreachable Git object');
  }

  return locations;
}

function scanGitObjects(locations, collectFindings) {
  const objectIds = [...locations.keys()];
  const result = spawnSync('git', ['cat-file', '--batch'], {
    input: Buffer.from(`${objectIds.join('\n')}\n`, 'utf8'),
    maxBuffer: maximumGitBatchOutputBytes,
  });

  if (result.error || result.status !== 0) {
    if (result.stderr) process.stderr.write(result.stderr);
    throw result.error ?? new Error(`Unable to scan Git objects (exit ${result.status}).`);
  }

  const output = result.stdout;
  let offset = 0;
  while (offset < output.length) {
    const headerEnd = output.indexOf(0x0a, offset);
    if (headerEnd === -1) throw new Error('Git object scan returned an incomplete header.');

    const [objectId, objectType, sizeText] = output.subarray(offset, headerEnd).toString('ascii').split(' ');
    const size = Number.parseInt(sizeText, 10);
    const contentStart = headerEnd + 1;
    if (!Number.isSafeInteger(size) || size < 0 || contentStart + size >= output.length) {
      throw new Error(`Git object scan returned invalid metadata for ${objectId}.`);
    }

    if (objectType === 'blob') {
      const location = locations.get(objectId) ?? 'Git object';
      collectFindings(`${location} (${objectId.slice(0, 12)})`, output.subarray(contentStart, contentStart + size).toString('latin1'));
    }
    offset = contentStart + size + 1;
  }
}

const findings = [];
function collectFindings(location, content) {
  for (const pattern of credentialPatterns) {
    if (pattern.expression.test(content)) {
      findings.push(`${location}: possible ${pattern.name}`);
    }
  }
}

for (const trackedPath of runGit(['ls-files', '-z'], 'buffer').toString('utf8').split('\0')) {
  if (trackedPath && existsSync(trackedPath)) {
    collectFindings(trackedPath, readFileSync(trackedPath).toString('latin1'));
  }
}

scanGitObjects(objectLocations(), collectFindings);

if (findings.length > 0) {
  console.error('Repository history contains possible credential material:');
  for (const finding of findings) console.error(`- ${finding}`);
  process.exitCode = 1;
} else {
  console.log('Repository history credential scan passed.');
}
