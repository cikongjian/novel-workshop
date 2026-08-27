import { spawn } from 'node:child_process';
import path from 'node:path';

function printUsage(): void {
  console.error('Usage: tsx src/scripts/run-with-file-logs.ts [--watch] <entry>');
}

const rawArgs = process.argv.slice(2);
const watch = rawArgs[0] === '--watch';
const entry = rawArgs[watch ? 1 : 0];

if (!entry) {
  printUsage();
  process.exit(1);
}

const env = {
  ...process.env,
  LOG_TO_FILE: process.env.LOG_TO_FILE || 'true',
  LOG_DIR: process.env.LOG_DIR || path.join(process.cwd(), 'logs'),
};

const childArgs = watch
  ? [path.join(process.cwd(), 'node_modules', 'tsx', 'dist', 'cli.mjs'), 'watch', entry]
  : [entry];

const child = spawn(process.execPath, childArgs, {
  cwd: process.cwd(),
  env,
  stdio: 'inherit',
});

function forwardSignal(signal: NodeJS.Signals): void {
  if (!child.killed) {
    child.kill(signal);
  }
}

process.on('SIGINT', () => forwardSignal('SIGINT'));
process.on('SIGTERM', () => forwardSignal('SIGTERM'));

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
