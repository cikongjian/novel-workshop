import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const failures = [];

function readText(relativePath) {
  return readFileSync(path.join(root, relativePath), 'utf8');
}

function requireCondition(condition, message) {
  if (!condition) failures.push(message);
}

function isCanonicalNpmArtifact(resolved) {
  if (typeof resolved !== 'string' || !/^https?:/u.test(resolved)) return true;
  try {
    return new URL(resolved).hostname === 'registry.npmjs.org';
  } catch {
    return false;
  }
}

const packageJson = JSON.parse(readText('package.json'));
const packageLock = JSON.parse(readText('package-lock.json'));
const webPackageJson = JSON.parse(readText('web/package.json'));
const webPackageLock = JSON.parse(readText('web/package-lock.json'));
const readme = readText('README.md');
const notice = readText('NOTICE');
const envExample = readText('.env.example');
const gitignore = readText('.gitignore');
const dockerignore = readText('.dockerignore');
const appCompose = readText('docker-compose.yml');
const dockerfile = readText('Dockerfile');
const paymentConfig = readText('src/billing/payment-config.ts');
const viteConfig = readText('web/vite.config.ts');
const authSessionRoutes = readText('src/server/routes/handlers/auth/session-routes.ts');
const authSessionCookie = readText('src/server/routes/handlers/auth/session-cookie.ts');
const browserAuthSession = readText('web/src/utils/auth-session.ts');
const browserUserApiStorage = readText('web/src/utils/user-api-local.ts');
const legacyApiCacheCleanup = readText('web/src/utils/legacy-api-cache.ts');
const harmonyPackage = JSON.parse(readText('harmony/oh-package.json5'));
const harmonyEntryPackage = JSON.parse(readText('harmony/entry/oh-package.json5'));
const workflowFiles = readdirSync(path.join(root, '.github', 'workflows')).filter((name) => /\.ya?ml$/u.test(name));

requireCondition(packageJson.private === true, 'Root package must prevent accidental npm publication.');
requireCondition(packageJson.license === 'Apache-2.0', 'Root package license must be Apache-2.0.');
requireCondition(webPackageJson.private === true, 'Web package must prevent accidental npm publication.');
requireCondition(webPackageJson.license === 'Apache-2.0', 'Web package license must be Apache-2.0.');
requireCondition(typeof webPackageJson.version === 'string' && webPackageJson.version.length > 0, 'Web package must declare a version for SBOM generation.');
requireCondition(readText('LICENSE').includes('Apache License'), 'LICENSE must contain the Apache License text.');
requireCondition(/Apache License 2\.0/.test(readme), 'README must state the Apache-2.0 license.');
requireCondition(notice.includes('msedge-tts (MIT)'), 'NOTICE must describe the Edge TTS integration.');
requireCondition(harmonyPackage.license === 'Apache-2.0', 'Harmony root package must declare Apache-2.0.');
requireCondition(harmonyEntryPackage.license === 'Apache-2.0', 'Harmony entry package must declare Apache-2.0.');
requireCondition(existsSync(path.join(root, 'SECURITY.md')), 'SECURITY.md is required.');
requireCondition(existsSync(path.join(root, 'CONTRIBUTING.md')), 'CONTRIBUTING.md is required.');
requireCondition(!existsSync(path.join(root, 'DEPLOY.md')), 'Environment-specific DEPLOY.md must not be published.');
requireCondition(!existsSync(path.join(root, 'docker-compose.auth.yml')), 'Legacy MySQL compose stack must not be published.');
requireCondition(gitignore.includes('/.tmp-auth-token*.txt'), 'Temporary auth token files must be ignored by Git.');
requireCondition(dockerignore.includes('/.tmp-auth-token*.txt'), 'Temporary auth token files must be excluded from Docker contexts.');
const envAssignments = new Map();
for (const line of envExample.split(/\r?\n/u)) {
  const match = /^([A-Z][A-Z0-9_]*)=(.*)$/u.exec(line);
  if (match) envAssignments.set(match[1], match[2].trim());
}

function isCredentialVariable(name) {
  if (/(?:^|_)PUBLIC_KEY(?:_|$)/u.test(name)) return false;
  if (/_PASS_(?:SCORE|THRESHOLD)$/u.test(name)) return false;
  return /(?:^|_)(?:PASSWORD|PASS|SECRET|TOKEN|CREDENTIAL)(?:_|$)/u.test(name)
    || /(?:^|_)PRIVATE_KEY(?:_|$)/u.test(name)
    || /(?:^|_)API(?:_[A-Z0-9]+)*_KEY(?:_|$)/u.test(name);
}

for (const [name, value] of envAssignments) {
  if (isCredentialVariable(name)) {
    requireCondition(value.length === 0, `.env.example credential placeholder must be empty: ${name}`);
  }
}
requireCondition(envAssignments.get('HF_ENDPOINT') === '', '.env.example must use the official Hugging Face source by default.');
requireCondition(!envExample.includes('AUTH_MYSQL_'), '.env.example must not expose unused MySQL authentication settings.');
requireCondition(
  envAssignments.get('BILLING_PAYMENT_QR_CODE_PROVIDER') === '',
  '.env.example must not send payment QR contents to a third party by default.',
);
requireCondition(
  !paymentConfig.includes('api.qrserver.com'),
  'Payment QR generation must not default to a third-party service.',
);
requireCondition(!viteConfig.includes('api-cache'), 'The PWA must not cache private API responses across sessions.');
requireCondition(
  legacyApiCacheCleanup.includes("delete(LEGACY_API_CACHE_NAME)"),
  'The web client must delete the private API cache created by older releases.',
);
requireCondition(
  authSessionCookie.includes('httpOnly: true')
    && authSessionCookie.includes("sameSite: 'lax'")
    && authSessionCookie.includes("setHeader('Cache-Control', 'no-store')"),
  'Refresh token responses must remain HttpOnly, SameSite=Lax, and non-cacheable.',
);
requireCondition(
  authSessionRoutes.includes('setRefreshTokenCookie') && !/^\s+refreshToken,\s*$/mu.test(authSessionRoutes),
  'Authentication responses must keep refresh tokens out of JavaScript-readable response bodies.',
);
requireCondition(
  !/(?:localStorage|window\.localStorage)\.setItem/u.test(browserAuthSession),
  'Browser authentication tokens must not be written to localStorage.',
);
requireCondition(
  !/(?:readJson|writeJson)[^\n]*LEGACY_LOCAL_SECRET_KEY/u.test(browserUserApiStorage),
  'Browser-local API keys must remain memory-only.',
);
requireCondition(
  appCompose.includes('CORS_ORIGINS: ${CORS_ORIGINS:-http://127.0.0.1:3001}'),
  'Local Docker Compose must provide a loopback CORS origin by default.',
);
requireCondition(
  /apt-get install[^\n]*build-essential[^\n]*python3/u.test(dockerfile),
  'Docker dependency stage must support native source builds.',
);
requireCondition(
  dockerfile.includes('rm -rf /var/lib/apt/lists/*'),
  'Docker dependency stage must remove apt package lists.',
);
requireCondition(/npm rebuild[^\n]*better-sqlite3[^\n]*@lancedb\/lancedb[^\n]*sharp/u.test(dockerfile), 'Docker build must rebuild all required native dependencies.');
requireCondition(dockerfile.includes('node scripts/check-runtime-dependencies.mjs'), 'Docker build must verify native runtime dependencies.');
requireCondition(dockerfile.includes('COPY LICENSE NOTICE ./'), 'Docker runtime image must include LICENSE and NOTICE.');
requireCondition(
  dockerfile.includes('COPY config/brand.defaults.json ./config/brand.defaults.json'),
  'Docker build must include the central brand configuration.',
);
requireCondition(
  dockerfile.includes('COPY --from=build /app/config/brand.defaults.json ./config/brand.defaults.json'),
  'Docker runtime image must include the central brand configuration.',
);
requireCondition(dockerfile.includes('ENV LOG_DIR=/app/data/logs'), 'Docker logs must stay inside the writable data volume.');
requireCondition(dockerfile.includes('chown node:node /app/data'), 'Docker data directory must be writable by the runtime user.');
requireCondition(/^USER node$/mu.test(dockerfile), 'Docker runtime image must run as the non-root node user.');
requireCondition(dockerfile.includes('HEALTHCHECK'), 'Docker runtime image must declare a health check.');

const releaseFacingFiles = [
  'README.md',
  'SECURITY.md',
  'CONTRIBUTING.md',
  'CODE_OF_CONDUCT.md',
  'CHANGELOG.md',
  'TESTING_GUIDE.md',
  '.env.example',
  'android/README.md',
  'android/release-branding.local.properties.example',
];
const releaseMarkdownFiles = [
  ...releaseFacingFiles.filter(relativePath => relativePath.endsWith('.md')),
  '.github/PULL_REQUEST_TEMPLATE.md',
];

function isSafeDocumentationIpv4(value) {
  const octets = value.split('.').map(Number);
  const [first, second] = octets;
  return first === 0
    || first === 10
    || first === 127
    || (first === 169 && second === 254)
    || (first === 172 && second >= 16 && second <= 31)
    || (first === 192 && second === 168)
    || (first === 192 && second === 0 && octets[2] === 2)
    || (first === 198 && second === 51 && octets[2] === 100)
    || (first === 203 && second === 0 && octets[2] === 113)
    || value === '255.255.255.255';
}

for (const relativePath of releaseFacingFiles) {
  const content = readText(relativePath);
  for (const match of content.matchAll(/\b(?:\d{1,3}\.){3}\d{1,3}\b/gu)) {
    requireCondition(
      isSafeDocumentationIpv4(match[0]),
      `Release-facing file contains a public IPv4 address: ${relativePath} (${match[0]})`,
    );
  }
}

for (const relativePath of releaseMarkdownFiles) {
  const bytes = readFileSync(path.join(root, relativePath));
  const content = bytes.toString('utf8');
  if (/[\u3400-\u9fff]/u.test(content)) {
    requireCondition(
      bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf,
      `Chinese Markdown must use UTF-8 with BOM: ${relativePath}`,
    );
  }
}

for (const workflowFile of workflowFiles) {
  const workflow = readText(path.join('.github', 'workflows', workflowFile));
  for (const match of workflow.matchAll(/^\s*uses:\s*[^@\s]+@([^\s#]+)/gmu)) {
    requireCondition(/^[0-9a-f]{40}$/u.test(match[1]), `${workflowFile} uses an action that is not pinned to a commit SHA: ${match[0].trim()}`);
  }
}

// 凭据类环境变量不得有非空字面量兜底：这类兜底会在使用者漏配时静默生成
// 一个口令公开可知的账户，且容易把开发者的真实密码写进仓库。
const secretEnvFallbackPattern =
  /process\.env\.[A-Z0-9_]*(?:PASSWORD|SECRET|TOKEN|CREDENTIAL|API_?KEY)[A-Z0-9_]*\s*(?:\|\||\?\?)\s*(['"`])(?!\1)/gu;

function scanSourceFiles(directory, filePattern = /\.ts$/u) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...scanSourceFiles(entryPath, filePattern));
    } else if (filePattern.test(entry.name) && !/\.test\.ts$/u.test(entry.name)) {
      files.push(entryPath);
    }
  }
  return files;
}

for (const sourceFile of scanSourceFiles(path.join(root, 'src'))) {
  const source = readFileSync(sourceFile, 'utf8');
  for (const match of source.matchAll(secretEnvFallbackPattern)) {
    const relativePath = path.relative(root, sourceFile).replace(/\\/gu, '/');
    failures.push(
      `Credential environment variable must not fall back to a literal value: ${relativePath} (${match[0].trim()})`,
    );
  }
}

const persistentBrowserCredentialPattern =
  /(?:localStorage|window\.localStorage)\.setItem\([^\n)]*(?:TOKEN|SECRET|PASSWORD|API_?KEY|token|secret|password|api.?key)/gu;

for (const sourceFile of scanSourceFiles(path.join(root, 'web', 'src'), /\.(?:ts|vue)$/u)) {
  const source = readFileSync(sourceFile, 'utf8');
  for (const match of source.matchAll(persistentBrowserCredentialPattern)) {
    const relativePath = path.relative(root, sourceFile).replace(/\\/gu, '/');
    failures.push(`Browser credential must not be persisted in localStorage: ${relativePath} (${match[0].trim()})`);
  }
}

const leakedTokenFiles = readdirSync(root).filter((name) => /^\.tmp-auth-token(?:-\d+)?\.txt$/u.test(name));
requireCondition(leakedTokenFiles.length === 0, `Temporary auth token files are present: ${leakedTokenFiles.join(', ')}`);

for (const [packageName, manifest, lockfile] of [
  ['backend', packageJson, packageLock],
  ['web', webPackageJson, webPackageLock],
]) {
  for (const dependency of Object.keys(manifest.dependencies ?? {})) {
    const license = lockfile.packages?.[`node_modules/${dependency}`]?.license;
    requireCondition(Boolean(license), `${packageName} direct production dependency lacks lockfile license metadata: ${dependency}`);
  }
}

for (const [packageName, lockfile] of [
  ['backend', packageLock],
  ['web', webPackageLock],
]) {
  for (const [packagePath, metadata] of Object.entries(lockfile.packages ?? {})) {
    if (!isCanonicalNpmArtifact(metadata?.resolved)) {
      failures.push(`${packageName} lockfile contains a non-canonical HTTP(S) artifact: ${packagePath}`);
    }
    const license = metadata?.license;
    if (typeof license === 'string' && /(?:^|[^A-Za-z])(?:A?GPL)-/u.test(license)) {
      failures.push(`Copyleft dependency requires a release review: ${packageName}/${packagePath} (${license})`);
    }
  }
}

if (failures.length > 0) {
  console.error('Open-source readiness checks failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log('Open-source readiness checks passed.');
}
