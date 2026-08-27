#!/usr/bin/env node

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  findCommandByTopic,
  formatCommandHelp,
  formatGlobalHelp,
  formatGroupHelp,
  isKnownGroup,
  resolveCliCommand,
} from './parser.js';

const currentFile = fileURLToPath(import.meta.url);
const runtimeRoot = path.resolve(path.dirname(currentFile), '..');
const scriptExtension = currentFile.endsWith('.ts') ? '.ts' : '.js';
const invokedName = process.argv[1]
  ? path.basename(process.argv[1], path.extname(process.argv[1]))
  : 'nw';
const binaryName = invokedName === 'index'
  ? (process.env.npm_lifecycle_event === 'cli' ? 'npm run cli --' : 'nw')
  : invokedName;

function printHelp(topic: string[]): number {
  if (topic.length === 0) {
    console.log(formatGlobalHelp(binaryName));
    return 0;
  }

  if (isKnownGroup(topic)) {
    console.log(formatGroupHelp(topic[0], binaryName));
    return 0;
  }

  const command = findCommandByTopic(topic);
  if (command) {
    console.log(formatCommandHelp(command, binaryName));
    return 0;
  }

  console.error(`未知的帮助主题：${topic.join(' ')}`);
  console.error('');
  console.error(formatGlobalHelp(binaryName));
  return 1;
}

function resolveScriptPath(scriptId: string): string {
  return path.join(runtimeRoot, `${scriptId}${scriptExtension}`);
}

class DirectRunnerLoadError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'DirectRunnerLoadError';
  }
}

async function runDirectCommand(
  moduleId: string,
  exportName: string,
  args: string[],
  invocation: string,
): Promise<number | null> {
  if (scriptExtension !== '.js') {
    return null;
  }

  let runner: unknown;
  try {
    const modulePath = resolveScriptPath(moduleId);
    const loaded = await import(pathToFileURL(modulePath).href) as Record<string, unknown>;
    runner = loaded[exportName];
    if (typeof runner !== 'function') {
      throw new Error(`CLI runner export not found: ${exportName}`);
    }
  } catch (error) {
    throw new DirectRunnerLoadError(
      error instanceof Error ? error.message : String(error),
      { cause: error },
    );
  }

  const result = await (runner as (argv: string[], invocation: string) => Promise<number | void>)(args, invocation);
  return typeof result === 'number' ? result : 0;
}

function runScript(scriptPath: string, args: string[]): Promise<number> {
  const runtimeCommand = scriptExtension === '.ts'
    ? (process.platform === 'win32' ? 'tsx.cmd' : 'tsx')
    : process.execPath;
  const launchArgs = scriptExtension === '.ts'
    ? [scriptPath, ...args]
    : [scriptPath, ...args];

  return new Promise((resolve, reject) => {
    const child = spawn(runtimeCommand, launchArgs, {
      cwd: process.cwd(),
      env: process.env,
      stdio: 'inherit',
    });

    child.on('error', reject);
    child.on('close', (code, signal) => {
      if (signal) {
        console.error(`Command terminated by signal: ${signal}`);
        resolve(1);
        return;
      }
      resolve(code ?? 0);
    });
  });
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const trailingHelp = argv.at(-1);
  const topicWithoutHelp = trailingHelp === '--help' || trailingHelp === '-h'
    ? argv.slice(0, -1)
    : null;

  if (argv.length === 0 || argv[0] === '--help' || argv[0] === '-h') {
    process.exitCode = printHelp([]);
    return;
  }

  if (argv[0] === 'help') {
    process.exitCode = printHelp(argv.slice(1));
    return;
  }

  if (topicWithoutHelp && topicWithoutHelp.length > 0) {
    if (isKnownGroup(topicWithoutHelp)) {
      process.exitCode = printHelp(topicWithoutHelp);
      return;
    }
  }

  const resolved = resolveCliCommand(argv);
  if (!resolved) {
    if (isKnownGroup(argv)) {
      process.exitCode = printHelp(argv);
      return;
    }

    console.error(`未知命令：${argv.join(' ')}`);
    console.error('');
    console.error(formatGlobalHelp(binaryName));
    process.exitCode = 1;
    return;
  }

  let exitCode: number;
  if (resolved.command.directRunner) {
    try {
      const directExitCode = await runDirectCommand(
        resolved.command.directRunner.module,
        resolved.command.directRunner.exportName,
        resolved.args,
        resolved.command.directRunner.invocation.replace(/^nw\b/, binaryName),
      );
      if (directExitCode !== null) {
        process.exitCode = directExitCode;
        return;
      }
    } catch (error) {
      if (!(error instanceof DirectRunnerLoadError)) throw error;
      console.warn(
        `[cli] direct runner failed for ${resolved.command.path.join(' ')}; falling back to script execution: `
        + `${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  exitCode = await runScript(resolveScriptPath(resolved.command.script), resolved.args);
  process.exitCode = exitCode;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
