type RawScene = {
  sceneNo: number;
  chapterNumber: number;
  title: string;
  hook3s: string;
  conflict15s: string;
  twist45s: string;
  cta: string;
  cast: string[];
  location: string;
  cameraPlan: string[];
  dialogueLines: string[];
};

export type ShortDramaPremiumRefineResult = {
  payload: unknown;
  changedScenes: number;
  changedFields: number;
  strategy: 'premium-boost-v1';
};

const CONFLICT_SIGNALS = ['冲突', '危机', '倒计时', '背叛', '真相', '失控', '生死', '威胁', '反转'];
const RETENTION_SIGNALS = ['下一场', '揭晓', '到底', '谁', '为什么', '继续', '马上', '真相'];

function asText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function asNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => asText(item)).filter(Boolean);
}

function trimLine(text: string): string {
  return text.replace(/\s+/g, ' ').replace(/[，。！？、：]+$/g, '').trim();
}

function clipLine(text: string, max = 24): string {
  const normalized = trimLine(text);
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, Math.max(0, max - 1)).trim()}…`;
}

function hasAny(text: string, signals: string[]): boolean {
  const content = asText(text);
  return signals.some((signal) => content.includes(signal));
}

function parseScene(raw: unknown): RawScene | null {
  if (!raw || typeof raw !== 'object') return null;
  const scene = raw as Record<string, unknown>;
  const sceneNo = asNumber(scene.sceneNo);
  if (sceneNo <= 0) return null;
  return {
    sceneNo,
    chapterNumber: asNumber(scene.chapterNumber),
    title: asText(scene.title),
    hook3s: asText(scene.hook3s),
    conflict15s: asText(scene.conflict15s),
    twist45s: asText(scene.twist45s),
    cta: asText(scene.cta),
    cast: asStringArray(scene.cast),
    location: asText(scene.location),
    cameraPlan: asStringArray(scene.cameraPlan),
    dialogueLines: asStringArray(scene.dialogueLines),
  };
}

function estimatedWeakness(scene: RawScene): number {
  let score = 0;
  if (!hasAny(scene.hook3s, CONFLICT_SIGNALS)) score += 3;
  if (!hasAny(`${scene.conflict15s} ${scene.twist45s}`, CONFLICT_SIGNALS)) score += 3;
  if (!hasAny(scene.cta, RETENTION_SIGNALS)) score += 2;
  if (scene.dialogueLines.length < 3) score += 1;
  if (scene.cameraPlan.length < 3) score += 1;
  return score;
}

function firstNonEmpty(...items: string[]): string {
  for (const item of items) {
    const next = trimLine(item);
    if (next) return next;
  }
  return '';
}

function rewriteScene(scene: RawScene): {
  hook3s: string;
  conflict15s: string;
  twist45s: string;
  cta: string;
  dialogueLines: string[];
  cameraPlan: string[];
} {
  const lead = scene.cast[0] || '主角';
  const rival = scene.cast[1] || '对手';
  const core = firstNonEmpty(scene.conflict15s, scene.twist45s, scene.title, '线索突然断裂');
  const twistCore = firstNonEmpty(scene.twist45s, scene.conflict15s, scene.title, '盟友突然翻脸');

  const hook3s = clipLine(`${lead}撞破背叛，危机反转倒计时`);
  const conflict15s = clipLine(`冲突失控：${core}，生死威胁逼近`);
  const twist45s = clipLine(`反转揭晓：${twistCore}，真相失控`);
  const cta = clipLine(`下一场真相揭晓：谁会先崩盘`);

  const dialogueLines = [
    clipLine(`${lead}：真相被改写，倒计时开始`),
    clipLine(`${rival}：你再追下去，就是生死局`),
    clipLine(`${lead}：那就现在摊牌，看谁崩盘`),
  ];

  const cameraPlan = scene.cameraPlan.length >= 3
    ? scene.cameraPlan.slice(0, 3)
    : [
      '开场特写（3秒）',
      '对峙中景（15秒）',
      '反转推近（15秒）',
    ];

  return {
    hook3s,
    conflict15s,
    twist45s,
    cta,
    dialogueLines,
    cameraPlan,
  };
}

function selectTargetSceneNos(scenes: RawScene[]): Set<number> {
  const sorted = scenes
    .map((scene) => ({ sceneNo: scene.sceneNo, weakness: estimatedWeakness(scene) }))
    .sort((a, b) => b.weakness - a.weakness);
  const maxTargets = Math.max(12, Math.min(160, Math.ceil(scenes.length * 0.7)));
  const picked = sorted
    .filter((item) => item.weakness >= 1)
    .slice(0, maxTargets)
    .map((item) => item.sceneNo);
  return new Set(picked);
}

export function refineShortDramaPayloadForPremium(params: {
  payload: unknown;
}): ShortDramaPremiumRefineResult {
  const root = params.payload;
  if (!root || typeof root !== 'object') {
    return {
      payload: params.payload,
      changedScenes: 0,
      changedFields: 0,
      strategy: 'premium-boost-v1',
    };
  }
  const container = root as Record<string, unknown>;
  if (!Array.isArray(container.scenes)) {
    return {
      payload: params.payload,
      changedScenes: 0,
      changedFields: 0,
      strategy: 'premium-boost-v1',
    };
  }

  const parsedScenes = container.scenes.map(parseScene).filter((item): item is RawScene => Boolean(item));
  const targetSceneNos = selectTargetSceneNos(parsedScenes);
  if (targetSceneNos.size === 0) {
    return {
      payload: params.payload,
      changedScenes: 0,
      changedFields: 0,
      strategy: 'premium-boost-v1',
    };
  }

  let changedScenes = 0;
  let changedFields = 0;
  const nextScenes = container.scenes.map((raw) => {
    const parsed = parseScene(raw);
    if (!parsed || !targetSceneNos.has(parsed.sceneNo)) return raw;

    const rewritten = rewriteScene(parsed);
    const current = raw as Record<string, unknown>;
    let sceneChanges = 0;

    if (asText(current.hook3s) !== rewritten.hook3s) sceneChanges += 1;
    if (asText(current.conflict15s) !== rewritten.conflict15s) sceneChanges += 1;
    if (asText(current.twist45s) !== rewritten.twist45s) sceneChanges += 1;
    if (asText(current.cta) !== rewritten.cta) sceneChanges += 1;
    if (asStringArray(current.dialogueLines).join('\n') !== rewritten.dialogueLines.join('\n')) sceneChanges += 1;
    if (asStringArray(current.cameraPlan).join('\n') !== rewritten.cameraPlan.join('\n')) sceneChanges += 1;

    if (sceneChanges > 0) {
      changedScenes += 1;
      changedFields += sceneChanges;
    }

    return {
      ...current,
      hook3s: rewritten.hook3s,
      conflict15s: rewritten.conflict15s,
      twist45s: rewritten.twist45s,
      cta: rewritten.cta,
      dialogueLines: rewritten.dialogueLines,
      cameraPlan: rewritten.cameraPlan,
    };
  });

  return {
    payload: {
      ...container,
      scenes: nextScenes,
    },
    changedScenes,
    changedFields,
    strategy: 'premium-boost-v1',
  };
}
