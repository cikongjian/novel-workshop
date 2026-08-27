import { cliCommands, cliGroupDescriptions, type CliCommand } from './registry.js';

export type ResolvedCliCommand = {
  command: CliCommand;
  args: string[];
  matchedLength: number;
};

function matchesPath(input: string[], candidate: string[]): boolean {
  if (input.length < candidate.length) return false;
  return candidate.every((segment, index) => input[index] === segment);
}

function commandPaths(command: CliCommand): string[][] {
  return [command.path, ...(command.aliases ?? [])];
}

export function resolveCliCommand(argv: string[]): ResolvedCliCommand | null {
  let bestMatch: ResolvedCliCommand | null = null;

  for (const command of cliCommands) {
    for (const candidate of commandPaths(command)) {
      if (!matchesPath(argv, candidate)) continue;
      if (!bestMatch || candidate.length > bestMatch.matchedLength) {
        bestMatch = {
          command,
          args: argv.slice(candidate.length),
          matchedLength: candidate.length,
        };
      }
    }
  }

  return bestMatch;
}

export function findCommandByTopic(topic: string[]): CliCommand | null {
  for (const command of cliCommands) {
    for (const candidate of commandPaths(command)) {
      if (candidate.length !== topic.length) continue;
      if (candidate.every((segment, index) => segment === topic[index])) {
        return command;
      }
    }
  }
  return null;
}

export function isKnownGroup(topic: string[]): boolean {
  return topic.length === 1 && Object.hasOwn(cliGroupDescriptions, topic[0]);
}

export function formatGlobalHelp(binaryName = 'nw'): string {
  const lines = [
    'Novel Workshop 命令行工具',
    '',
    `用法：${binaryName} <group> <command> [...args]`,
    '',
    '命令分组：',
  ];

  for (const [group, description] of Object.entries(cliGroupDescriptions).sort(([a], [b]) => a.localeCompare(b))) {
    lines.push(`  ${group.padEnd(14)} ${description}`);
  }

  lines.push('');
  lines.push('示例：');
  lines.push(`  ${binaryName} memory reindex --novel <novelId>`);
  lines.push(`  ${binaryName} world gate-report --novel <novelId> --last 20`);
  lines.push(`  ${binaryName} dev check-mojibake --staged`);
  lines.push('');
  lines.push(`运行 "${binaryName} help <group>" 或 "${binaryName} help <group> <command>" 查看更详细说明。`);

  return lines.join('\n');
}

export function formatGroupHelp(group: string, binaryName = 'nw'): string {
  const description = cliGroupDescriptions[group];
  const commands = cliCommands
    .filter((command) => command.path[0] === group)
    .sort((left, right) => left.path.join(' ').localeCompare(right.path.join(' ')));

  if (!description || commands.length === 0) {
    return `未知的 CLI 分组：${group}`;
  }

  const lines = [
    `${group} 命令`,
    '',
    description,
    '',
    '可用命令：',
  ];

  for (const command of commands) {
    lines.push(`  ${command.path.slice(1).join(' ').padEnd(22)} ${command.description}`);
  }

  const example = commands[0]?.example?.replace(/^nw\b/, binaryName) ?? `${binaryName} ${group}`;
  lines.push('');
  lines.push(`示例：${example}`);

  return lines.join('\n');
}

export function formatCommandHelp(command: CliCommand, binaryName = 'nw'): string {
  const aliases = command.aliases?.map((alias) => alias.join(' ')) ?? [];
  const lines = [
    `${command.path.join(' ')} 命令`,
    '',
    command.description,
    '',
    `用法：${binaryName} ${command.path.join(' ')} [...args]`,
  ];

  if (aliases.length > 0) {
    lines.push(`别名：${aliases.join(', ')}`);
  }

  if (command.example) {
    lines.push(`示例：${command.example.replace(/^nw\b/, binaryName)}`);
  }

  lines.push('在命令后附加 --help 可查看底层脚本的参数说明。');
  return lines.join('\n');
}
