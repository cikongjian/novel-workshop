import { promises as fs } from 'node:fs';
import path from 'node:path';

const MARKER_START = '# novel-workshop-mojibake-hook-start';
const MARKER_END = '# novel-workshop-mojibake-hook-end';

export type InstallGitHooksSummary = {
  installed: boolean;
  skipped: boolean;
  hookPath?: string;
  reason?: string;
};

function normalizeLf(text: string): string {
  return text.replace(/\r\n/g, '\n');
}

async function resolveGitDir(repoRoot: string): Promise<string | null> {
  const dotGitPath = path.join(repoRoot, '.git');
  try {
    const stat = await fs.stat(dotGitPath);
    if (stat.isDirectory()) return dotGitPath;
    if (stat.isFile()) {
      const raw = await fs.readFile(dotGitPath, 'utf8');
      const match = raw.match(/^gitdir:\s*(.+)\s*$/m);
      if (!match) return null;
      return path.resolve(repoRoot, match[1].trim());
    }
  } catch {
    return null;
  }
  return null;
}

function managedBlock(): string {
  return [
    MARKER_START,
    'npm run check:mojibake',
    'status=$?',
    'if [ $status -ne 0 ]; then',
    '  echo "[pre-commit] blocked: mojibake check failed."',
    '  exit $status',
    'fi',
    MARKER_END,
  ].join('\n');
}

function mergeHookContent(existing: string): string {
  const block = managedBlock();
  const normalized = normalizeLf(existing);

  if (!normalized.trim()) {
    return `#!/usr/bin/env sh\n\n${block}\n`;
  }

  if (normalized.includes(MARKER_START) && normalized.includes(MARKER_END)) {
    const pattern = new RegExp(`${MARKER_START}[\\s\\S]*?${MARKER_END}`, 'm');
    return `${normalized.replace(pattern, block).replace(/\n*$/, '\n')}`;
  }

  const withTrailingNewline = normalized.endsWith('\n') ? normalized : `${normalized}\n`;
  return `${withTrailingNewline}\n${block}\n`;
}

function formatInstallGitHooksHelp(invocation = 'npm run hooks:install'): string {
  return [
    `用法: ${invocation}`,
    '',
    '安装或刷新用于乱码检查的托管 pre-commit hook。',
  ].join('\n');
}

function printInstallGitHooksHelp(invocation?: string): void {
  console.log(formatInstallGitHooksHelp(invocation));
}

export async function executeInstallGitHooks(repoRoot = process.cwd()): Promise<InstallGitHooksSummary> {
  const gitDir = await resolveGitDir(repoRoot);
  if (!gitDir) {
    return {
      installed: false,
      skipped: true,
      reason: '未找到 .git 目录。',
    };
  }

  const hooksDir = path.join(gitDir, 'hooks');
  const hookPath = path.join(hooksDir, 'pre-commit');

  await fs.mkdir(hooksDir, { recursive: true });

  let existing = '';
  try {
    existing = await fs.readFile(hookPath, 'utf8');
  } catch {
    existing = '';
  }

  const merged = mergeHookContent(existing);
  await fs.writeFile(hookPath, merged, 'utf8');

  try {
    await fs.chmod(hookPath, 0o755);
  } catch {
    // Ignore chmod errors on platforms that do not support POSIX permissions.
  }

  return {
    installed: true,
    skipped: false,
    hookPath,
  };
}

export async function runInstallGitHooksCli(
  argv: string[] = process.argv.slice(2),
  invocation = 'npm run hooks:install',
): Promise<number> {
  if (argv.includes('--help') || argv.includes('-h')) {
    printInstallGitHooksHelp(invocation);
    return 0;
  }

  const summary = await executeInstallGitHooks();
  if (summary.skipped) {
    console.log(`[hooks] 已跳过: ${summary.reason}`);
    return 0;
  }

  console.log(`[hooks] pre-commit 已就绪: ${summary.hookPath}`);
  return 0;
}

async function main(): Promise<void> {
  process.exitCode = await runInstallGitHooksCli();
}

function isExecutedAsEntry(): boolean {
  const argv1 = process.argv[1];
  if (!argv1) return false;
  return path.basename(argv1).includes('install-git-hooks');
}

if (isExecutedAsEntry()) {
  void main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[hooks] 安装失败: ${message}`);
    process.exit(1);
  });
}
