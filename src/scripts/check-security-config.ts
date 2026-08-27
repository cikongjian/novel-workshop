import path from 'node:path';
import { getConfig } from '../config/index.js';
import {
  validateProductionSecurityConfig,
  type SecurityConfigValidationResult,
} from '../auth/security-config.js';

export type CheckSecurityConfigResult = SecurityConfigValidationResult;

function formatCheckSecurityConfigHelp(invocation = 'npm run check:security'): string {
  return [
    `用法: ${invocation}`,
    '',
    '基于当前环境变量校验生产环境相关安全配置。',
  ].join('\n');
}

function printCheckSecurityConfigHelp(invocation?: string): void {
  console.log(formatCheckSecurityConfigHelp(invocation));
}

export function executeCheckSecurityConfig(): CheckSecurityConfigResult {
  return validateProductionSecurityConfig(getConfig());
}

export async function runCheckSecurityConfigCli(
  argv: string[] = process.argv.slice(2),
  invocation = 'npm run check:security',
): Promise<number> {
  if (argv.includes('--help') || argv.includes('-h')) {
    printCheckSecurityConfigHelp(invocation);
    return 0;
  }

  const result = executeCheckSecurityConfig();
  if (!result.ok) {
    console.error('发现安全配置问题:');
    result.issues.forEach(issue => console.error(`  - ${issue}`));
    return 1;
  }

  console.log('安全配置检查通过');
  return 0;
}

async function main(): Promise<void> {
  process.exitCode = await runCheckSecurityConfigCli();
}

function isExecutedAsEntry(): boolean {
  const argv1 = process.argv[1];
  if (!argv1) return false;
  return path.basename(argv1).includes('check-security-config');
}

if (isExecutedAsEntry()) {
  void main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
