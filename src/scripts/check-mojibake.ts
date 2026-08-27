import { execSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';

type Mode = 'staged' | 'changed' | 'all';

type Rule = {
  name: string;
  pattern: RegExp;
};

type Finding = {
  filePath: string;
  line: number;
  column: number;
  rule: string;
  snippet: string;
};

type GitLinesResult = {
  lines: string[];
  failed: boolean;
};

type CliOptions = {
  mode: Mode;
  explicitPaths: string[];
  help?: boolean;
};

export type CheckMojibakeCliOptions = CliOptions;

export type CheckMojibakeResult = {
  scannedFiles: number;
  findings: Finding[];
};

const TEXT_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.vue',
  '.md',
  '.json',
  '.yml',
  '.yaml',
  '.css',
  '.scss',
  '.html',
  '.txt',
  '.env',
]);

const ALWAYS_TEXT_FILES = new Set(['package.json', '.env', '.env.example']);

const IGNORED_DIRS = new Set(['node_modules', 'dist', 'data', '.git']);

const IGNORED_FILES = new Set(['src/scripts/check-mojibake.ts']);

const RULES: Rule[] = [
  { name: 'replacement-char', pattern: /\uFFFD/g },
  { name: 'garbled-word', pattern: /\u951f\u65a4\u62f7/g },
  { name: 'question-run', pattern: /\?{4,}/g },
  {
    name: 'suspect-sequence',
    pattern: /(?:[\u95ff\u93c2\u9359\u93b4\u9428\u93c8\u6fa6\u6d93\u935a\u7487\u951b\u9286]{3,})/g,
  },
  { name: 'suspect-punctuation', pattern: /(?:[\u951b\u9286]{2,})/g },
];

function normalizePath(input: string): string {
  return input.replace(/\\/g, '/');
}

function isIgnoredPath(filePath: string): boolean {
  const normalized = normalizePath(filePath);
  if (IGNORED_FILES.has(normalized)) return true;
  return normalized.split('/').some((segment) => IGNORED_DIRS.has(segment));
}

function isTextFile(filePath: string): boolean {
  const normalized = normalizePath(filePath);
  if (ALWAYS_TEXT_FILES.has(path.basename(normalized))) return true;
  return TEXT_EXTENSIONS.has(path.extname(normalized).toLowerCase());
}

function safeGitLines(command: string): GitLinesResult {
  try {
    const stdout = execSync(command, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return {
      failed: false,
      lines: stdout
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean),
    };
  } catch {
    return { lines: [], failed: true };
  }
}

function unique(items: string[]): string[] {
  return [...new Set(items.map(normalizePath))];
}

function getStagedFiles(): { files: string[]; failed: boolean } {
  const staged = safeGitLines('git -c core.quotepath=off diff --cached --name-only --diff-filter=ACMR');
  return { files: unique(staged.lines), failed: staged.failed };
}

function getChangedFiles(): { files: string[]; failed: boolean } {
  const unstaged = safeGitLines('git -c core.quotepath=off diff --name-only --diff-filter=ACMR');
  const staged = safeGitLines('git -c core.quotepath=off diff --cached --name-only --diff-filter=ACMR');
  const untracked = safeGitLines('git -c core.quotepath=off ls-files --others --exclude-standard');

  return {
    files: unique([...unstaged.lines, ...staged.lines, ...untracked.lines]),
    failed: unstaged.failed || staged.failed || untracked.failed,
  };
}

function parseCheckMojibakeArgs(argv: string[]): CliOptions {
  let mode: Mode = 'staged';
  const explicitPaths: string[] = [];
  let help = false;

  for (const arg of argv) {
    if (arg === '--help' || arg === '-h') {
      help = true;
    } else if (arg === '--all') {
      mode = 'all';
    } else if (arg === '--changed') {
      mode = 'changed';
    } else if (arg === '--staged') {
      mode = 'staged';
    } else if (!arg.startsWith('--')) {
      explicitPaths.push(arg);
    }
  }

  return { mode, explicitPaths: unique(explicitPaths), help };
}

function formatCheckMojibakeHelp(
  invocation = 'node --experimental-strip-types src/scripts/check-mojibake.ts',
): string {
  return [
    `用法: ${invocation} [--staged|--changed|--all] [paths...]`,
    '',
    '选项:',
    '  --staged            扫描暂存区文件，默认模式',
    '  --changed           扫描工作区已改动和未跟踪文件',
    '  --all               扫描仓库内常用源码目录',
    '  -h, --help          显示帮助',
    '',
    '示例:',
    `  ${invocation} --staged`,
    `  ${invocation} --changed src docs`,
    `  ${invocation} --all`,
  ].join('\n');
}

function printCheckMojibakeHelp(invocation?: string): void {
  console.log(formatCheckMojibakeHelp(invocation));
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function listFilesRecursively(root: string): Promise<string[]> {
  const results: string[] = [];
  const entries = await fs.readdir(root, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);
    const relPath = normalizePath(path.relative(process.cwd(), fullPath));
    if (isIgnoredPath(relPath)) continue;

    if (entry.isDirectory()) {
      results.push(...(await listFilesRecursively(fullPath)));
      continue;
    }
    results.push(relPath);
  }
  return results;
}

async function expandExplicitPaths(paths: string[]): Promise<string[]> {
  const results: string[] = [];
  for (const inputPath of paths) {
    const normalized = normalizePath(inputPath);
    if (isIgnoredPath(normalized)) continue;

    try {
      const stat = await fs.stat(normalized);
      if (stat.isDirectory()) {
        results.push(...(await listFilesRecursively(normalized)));
      } else {
        results.push(normalized);
      }
    } catch {
      // ignore non-existing paths
    }
  }
  return unique(results);
}

async function collectRepositoryFiles(): Promise<string[]> {
  const roots = ['src', 'web/src', 'docs'];
  const allFiles: string[] = [];
  for (const root of roots) {
    if (!(await fileExists(root))) continue;
    allFiles.push(...(await listFilesRecursively(root)));
  }
  if (await fileExists('package.json')) {
    allFiles.push('package.json');
  }
  return unique(allFiles).filter((filePath) => !isIgnoredPath(filePath));
}

async function collectTargetFiles(mode: Mode, explicitPaths: string[]): Promise<string[]> {
  if (explicitPaths.length > 0) {
    return (await expandExplicitPaths(explicitPaths)).filter((filePath) => !isIgnoredPath(filePath));
  }

  if (mode === 'staged') {
    const staged = getStagedFiles();
    if (staged.files.length > 0) {
      return staged.files.filter((filePath) => !isIgnoredPath(filePath));
    }
    if (!staged.failed) return [];
    return collectRepositoryFiles();
  }
  if (mode === 'changed') {
    const changed = getChangedFiles();
    if (changed.files.length > 0) {
      return changed.files.filter((filePath) => !isIgnoredPath(filePath));
    }
    if (!changed.failed) return [];
    return collectRepositoryFiles();
  }

  return collectRepositoryFiles();
}

function buildLineOffsets(content: string): number[] {
  const offsets = [0];
  for (let i = 0; i < content.length; i += 1) {
    if (content[i] === '\n') offsets.push(i + 1);
  }
  return offsets;
}

function locate(lineOffsets: number[], index: number): { line: number; column: number } {
  let left = 0;
  let right = lineOffsets.length - 1;
  while (left <= right) {
    const mid = (left + right) >> 1;
    if (lineOffsets[mid] <= index) left = mid + 1;
    else right = mid - 1;
  }
  const lineStart = lineOffsets[Math.max(0, right)] ?? 0;
  return { line: Math.max(1, right + 1), column: index - lineStart + 1 };
}

function buildMarkdownFenceMap(lines: string[]): boolean[] {
  const inFence: boolean[] = new Array(lines.length).fill(false);
  let inside = false;
  for (let i = 0; i < lines.length; i += 1) {
    const trimmed = lines[i].trimStart();
    if (trimmed.startsWith('```')) {
      inFence[i] = inside;
      inside = !inside;
      continue;
    }
    inFence[i] = inside;
  }
  return inFence;
}

function isInsideInlineBackticks(lineText: string, column: number): boolean {
  const ticks: number[] = [];
  for (let i = 0; i < lineText.length; i += 1) {
    if (lineText[i] === '`') ticks.push(i + 1);
  }
  if (ticks.length < 2) return false;
  for (let i = 0; i + 1 < ticks.length; i += 2) {
    if (column > ticks[i] && column < ticks[i + 1]) return true;
  }
  return false;
}

function shouldIgnoreMarkdownCode(
  filePath: string,
  line: number,
  column: number,
  lineText: string,
  fenceMap: boolean[],
): boolean {
  if (path.extname(filePath).toLowerCase() !== '.md') return false;
  if (fenceMap[line - 1]) return true;
  return isInsideInlineBackticks(lineText, column);
}

function trimSnippet(lineText: string): string {
  const cleaned = lineText.replace(/\t/g, ' ').trim();
  return cleaned.length > 140 ? `${cleaned.slice(0, 140)}...` : cleaned;
}

async function scanFile(filePath: string): Promise<Finding[]> {
  const normalized = normalizePath(filePath);
  if (!isTextFile(normalized)) return [];
  if (!(await fileExists(normalized))) return [];

  const content = await fs.readFile(normalized, 'utf8');
  if (content.includes('\u0000')) return [];

  const lineOffsets = buildLineOffsets(content);
  const lines = content.split(/\r?\n/);
  const fenceMap = buildMarkdownFenceMap(lines);
  const findings: Finding[] = [];

  for (const rule of RULES) {
    rule.pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = rule.pattern.exec(content)) !== null) {
      const { line, column } = locate(lineOffsets, match.index);
      const lineText = lines[line - 1] ?? '';
      if (shouldIgnoreMarkdownCode(normalized, line, column, lineText, fenceMap)) continue;

      findings.push({
        filePath: normalized,
        line,
        column,
        rule: rule.name,
        snippet: trimSnippet(lineText),
      });
    }
  }

  return findings;
}

export async function executeCheckMojibake(options: CliOptions): Promise<CheckMojibakeResult> {
  const targetFiles = await collectTargetFiles(options.mode, options.explicitPaths);
  if (targetFiles.length === 0) {
    return {
      scannedFiles: 0,
      findings: [],
    };
  }

  const findings: Finding[] = [];
  for (const filePath of targetFiles) {
    findings.push(...(await scanFile(filePath)));
  }

  findings.sort((a, b) => {
    if (a.filePath !== b.filePath) return a.filePath.localeCompare(b.filePath);
    if (a.line !== b.line) return a.line - b.line;
    return a.column - b.column;
  });

  return {
    scannedFiles: targetFiles.length,
    findings,
  };
}

export async function runCheckMojibakeCli(
  argv: string[] = process.argv.slice(2),
  invocation = 'node --experimental-strip-types src/scripts/check-mojibake.ts',
): Promise<number> {
  const options = parseCheckMojibakeArgs(argv);
  if (options.help) {
    printCheckMojibakeHelp(invocation);
    return 0;
  }

  const result = await executeCheckMojibake(options);
  if (result.scannedFiles === 0) {
    console.log('[mojibake-check] no files to scan.');
    return 0;
  }

  if (result.findings.length === 0) {
    console.log(`[mojibake-check] pass. scanned ${result.scannedFiles} files.`);
    return 0;
  }

  for (const finding of result.findings) {
    console.error(
      `[mojibake-check] ${finding.filePath}:${finding.line}:${finding.column} [${finding.rule}] ${finding.snippet}`,
    );
  }
  console.error(`[mojibake-check] failed. found ${result.findings.length} suspicious hits.`);
  return 1;
}

async function main(): Promise<void> {
  process.exitCode = await runCheckMojibakeCli();
}

function isExecutedAsEntry(): boolean {
  const argv1 = process.argv[1];
  if (!argv1) {
    return false;
  }

  return path.basename(argv1).includes('check-mojibake');
}

if (isExecutedAsEntry()) {
  void main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[mojibake-check] execution failed: ${message}`);
    process.exitCode = 1;
  });
}
