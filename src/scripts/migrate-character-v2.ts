import fs from 'node:fs/promises';
import path from 'node:path';

type JsonObject = Record<string, unknown>;

type CliOptions = {
  dryRun: boolean;
  strict: boolean;
  help?: boolean;
};

export type MigrateCharacterV2CliOptions = CliOptions;

export type MigrateCharacterV2Summary = {
  mode: 'dry-run' | 'apply';
  touchedNovels: number;
  changedCharacters: number;
  validationIssues: number;
  issueSamples: string[];
};

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function inferTempoFromSpeechStyle(style: unknown): 'slow' | 'mid' | 'fast' {
  if (typeof style !== 'string') return 'mid';
  const text = style.toLowerCase();
  if (text.includes('急') || text.includes('快') || text.includes('激动')) return 'fast';
  if (text.includes('慢') || text.includes('缓') || text.includes('沉稳')) return 'slow';
  return 'mid';
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === 'string')
    .map(item => item.trim())
    .filter(Boolean);
}

function normalizeNumberTuple(params: {
  value: unknown;
  fallback: [number, number];
  fieldName: string;
  issues: string[];
  min?: number;
  max?: number;
}): [number, number] {
  const { value, fallback, fieldName, issues, min, max } = params;
  if (!Array.isArray(value) || value.length !== 2) {
    issues.push(`${fieldName} 非法，已回退默认值`);
    return fallback;
  }

  const first = Number(value[0]);
  const second = Number(value[1]);
  if (!Number.isFinite(first) || !Number.isFinite(second)) {
    issues.push(`${fieldName} 非数字，已回退默认值`);
    return fallback;
  }

  let start = first;
  let end = second;
  if (start > end) {
    [start, end] = [end, start];
    issues.push(`${fieldName} 区间顺序颠倒，已自动纠正`);
  }

  if (min !== undefined || max !== undefined) {
    const beforeStart = start;
    const beforeEnd = end;
    if (min !== undefined) {
      start = Math.max(min, start);
      end = Math.max(min, end);
    }
    if (max !== undefined) {
      start = Math.min(max, start);
      end = Math.min(max, end);
    }
    if (start !== beforeStart || end !== beforeEnd) {
      issues.push(`${fieldName} 超出范围，已自动裁剪`);
    }
  }

  return [start, end];
}

function ensureCharacterV2(raw: JsonObject): { character: JsonObject; changed: boolean; issues: string[] } {
  const drivesRaw = isObject(raw.drives) ? raw.drives : {};
  const personalityModelRaw = isObject(raw.personalityModel) ? raw.personalityModel : {};
  const speechDNARaw = isObject(raw.speechDNA) ? raw.speechDNA : {};
  const ttsProfileRaw = isObject(raw.ttsProfile) ? raw.ttsProfile : {};
  const prosodyRangeRaw = isObject(ttsProfileRaw.prosodyRange) ? ttsProfileRaw.prosodyRange : {};
  const issues: string[] = [];

  const motivation = typeof raw.motivation === 'string' ? raw.motivation : '';
  const personalityTraits = toStringArray(raw.personalityTraits);
  const speechStyle = typeof raw.speechStyle === 'string' ? raw.speechStyle : '';
  const ttsVoice = typeof raw.ttsVoice === 'string' ? raw.ttsVoice : 'default';
  const tempo = ['slow', 'mid', 'fast'].includes(String(speechDNARaw.tempo))
    ? speechDNARaw.tempo as 'slow' | 'mid' | 'fast'
    : inferTempoFromSpeechStyle(speechStyle);
  if (!['slow', 'mid', 'fast'].includes(String(speechDNARaw.tempo ?? ''))) {
    issues.push('speechDNA.tempo 非法，已回退');
  }

  const rate = normalizeNumberTuple({
    value: prosodyRangeRaw.rate,
    fallback: [0.9, 1.1],
    fieldName: 'ttsProfile.prosodyRange.rate',
    issues,
    min: 0.5,
    max: 2,
  });
  const pitch = normalizeNumberTuple({
    value: prosodyRangeRaw.pitch,
    fallback: [-2, 2],
    fieldName: 'ttsProfile.prosodyRange.pitch',
    issues,
    min: -12,
    max: 12,
  });
  const emotionMap = isObject(ttsProfileRaw.emotionMap)
    ? Object.fromEntries(
      Object.entries(ttsProfileRaw.emotionMap)
        .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
        .map(([key, value]) => [key, value.trim()]),
    )
    : {};
  if (!isObject(ttsProfileRaw.emotionMap)) {
    issues.push('ttsProfile.emotionMap 非对象，已回退空映射');
  }

  const character: JsonObject = {
    ...raw,
    drives: {
      want: typeof drivesRaw.want === 'string' ? drivesRaw.want : motivation,
      need: typeof drivesRaw.need === 'string' ? drivesRaw.need : '',
      fear: typeof drivesRaw.fear === 'string' ? drivesRaw.fear : undefined,
      secret: typeof drivesRaw.secret === 'string' ? drivesRaw.secret : undefined,
      taboo: toStringArray(drivesRaw.taboo),
    },
    personalityModel: {
      traits: toStringArray(personalityModelRaw.traits).length > 0
        ? toStringArray(personalityModelRaw.traits)
        : personalityTraits,
      innerContradictions: toStringArray(personalityModelRaw.innerContradictions),
      moralBoundary: toStringArray(personalityModelRaw.moralBoundary),
    },
    speechDNA: {
      lexicon: toStringArray(speechDNARaw.lexicon),
      tempo,
      tone: toStringArray(speechDNARaw.tone).length > 0
        ? toStringArray(speechDNARaw.tone)
        : (speechStyle ? [speechStyle] : []),
      tics: toStringArray(speechDNARaw.tics),
    },
    ttsProfile: {
      baseVoice: typeof ttsProfileRaw.baseVoice === 'string' ? ttsProfileRaw.baseVoice : ttsVoice,
      prosodyRange: {
        rate,
        pitch,
      },
      emotionMap,
    },
  };

  const changed = !isObject(raw.drives)
    || !isObject(raw.personalityModel)
    || !isObject(raw.speechDNA)
    || !isObject(raw.ttsProfile)
    || issues.length > 0;
  return { character, changed, issues };
}

function parseMigrateCharacterV2Args(argv: string[]): CliOptions {
  let dryRun = false;
  let strict = false;
  let help = false;

  for (const arg of argv) {
    if (arg === '--dry-run') {
      dryRun = true;
      continue;
    }
    if (arg === '--strict') {
      strict = true;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      help = true;
    }
  }

  return { dryRun, strict, help };
}

function formatMigrateCharacterV2Help(invocation = 'npm run migrate:character-v2 --'): string {
  return [
    `用法: ${invocation} [options]`,
    '',
    '选项:',
    '  --dry-run           仅检查，不写回角色文件',
    '  --strict            有校验问题时返回非 0 退出码',
    '  -h, --help          显示帮助',
    '',
    '示例:',
    `  ${invocation} --dry-run`,
    `  ${invocation} --strict`,
  ].join('\n');
}

function printMigrateCharacterV2Help(invocation?: string): void {
  console.log(formatMigrateCharacterV2Help(invocation));
}

export async function executeMigrateCharacterV2(options: CliOptions): Promise<MigrateCharacterV2Summary> {
  const novelsRoot = path.join(path.resolve('data'), 'novels');
  const stateFileName = 'character-states.json';
  const characterFileName = 'characters.json';

  const entries = await fs.readdir(novelsRoot, { withFileTypes: true });
  let touchedNovels = 0;
  let changedCharacters = 0;
  let validationIssues = 0;
  const issueSamples: string[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const novelDir = path.join(novelsRoot, entry.name);
    const characterPath = path.join(novelDir, characterFileName);
    const statePath = path.join(novelDir, stateFileName);

    let rawCharacters: unknown[] = [];
    try {
      const content = await fs.readFile(characterPath, 'utf-8');
      rawCharacters = JSON.parse(content) as unknown[];
    } catch {
      continue;
    }

    let novelChanged = false;
    const migrated = rawCharacters.map((item, idx) => {
      if (!isObject(item)) return item;
      const { character, changed, issues } = ensureCharacterV2(item);
      if (changed) {
        novelChanged = true;
        changedCharacters += 1;
      }
      if (issues.length > 0) {
        validationIssues += issues.length;
        if (issueSamples.length < 30) {
          const name = typeof item.name === 'string' ? item.name : `#${idx}`;
          issueSamples.push(`${entry.name}/${name}: ${issues.join('；')}`);
        }
      }
      return character;
    });

    if (novelChanged) {
      touchedNovels += 1;
      if (!options.dryRun) {
        await fs.writeFile(characterPath, JSON.stringify(migrated, null, 2), 'utf-8');
      }
    }

    try {
      await fs.access(statePath);
    } catch {
      touchedNovels += 1;
      if (!options.dryRun) {
        await fs.writeFile(statePath, '[]\n', 'utf-8');
      }
    }
  }

  return {
    mode: options.dryRun ? 'dry-run' : 'apply',
    touchedNovels,
    changedCharacters,
    validationIssues,
    issueSamples,
  };
}

export async function runMigrateCharacterV2Cli(
  argv: string[] = process.argv.slice(2),
  invocation = 'npm run migrate:character-v2 --',
): Promise<number> {
  const options = parseMigrateCharacterV2Args(argv);
  if (options.help) {
    printMigrateCharacterV2Help(invocation);
    return 0;
  }

  const summary = await executeMigrateCharacterV2(options);
  console.log(`[migrate-character-v2] mode=${summary.mode}`);
  console.log(`[migrate-character-v2] touchedNovels=${summary.touchedNovels}`);
  console.log(`[migrate-character-v2] changedCharacters=${summary.changedCharacters}`);
  console.log(`[migrate-character-v2] validationIssues=${summary.validationIssues}`);
  if (summary.issueSamples.length > 0) {
    console.log('[migrate-character-v2] issueSamples:');
    for (const sample of summary.issueSamples) {
      console.log(`- ${sample}`);
    }
  }
  if (options.strict && summary.validationIssues > 0) {
    throw new Error(`[migrate-character-v2] strict mode failed, validationIssues=${summary.validationIssues}`);
  }
  return 0;
}

async function main(): Promise<void> {
  process.exitCode = await runMigrateCharacterV2Cli();
}

function isExecutedAsEntry(): boolean {
  const argv1 = process.argv[1];
  if (!argv1) return false;
  return path.basename(argv1).includes('migrate-character-v2');
}

if (isExecutedAsEntry()) {
  void main().catch((error) => {
    console.error('[migrate-character-v2] failed:', error);
    process.exit(1);
  });
}
