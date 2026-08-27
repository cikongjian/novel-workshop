type RawScene = {
  sceneNo: number;
  chapterNumber: number;
  title: string;
  hook3s: string;
  conflict15s: string;
  twist45s: string;
  cta: string;
  cast: string[];
  dialogueLines: string[];
};

export type ShortDramaHookPolishProfile = 'balanced' | 'hook-first';

export type ShortDramaHookPolishResult = {
  payload: unknown;
  changedScenes: number;
  changedFields: number;
  strategy: 'auto-hook-polish-v1';
};

const HOOK_SIGNAL = ['发现', '异常', '警报', '秘密', '危机', '反转', '真相'];
const CONFLICT_SIGNAL = ['冲突', '威胁', '失控', '对峙', '生死', '倒计时', '背叛'];
const RETENTION_SIGNAL = ['下一场', '真相', '揭晓', '继续', '马上', '到底', '谁'];

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

function clipText(text: string, max = 24): string {
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1)).trim()}…`;
}

function hasAnySignal(text: string, signals: string[]): boolean {
  if (!text) return false;
  return signals.some((signal) => text.includes(signal));
}

function compact(text: string): string {
  return text.replace(/\s+/g, ' ').replace(/[，。！？、：]+$/g, '').trim();
}

function firstNonEmpty(...values: string[]): string {
  for (const value of values) {
    const normalized = compact(value);
    if (normalized) return normalized;
  }
  return '';
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
    dialogueLines: asStringArray(scene.dialogueLines),
  };
}

function shouldPolishScene(scene: RawScene, profile: ShortDramaHookPolishProfile): boolean {
  if (profile === 'hook-first') return true;
  const weakHook = !hasAnySignal(scene.hook3s, HOOK_SIGNAL);
  const weakConflict = !hasAnySignal(`${scene.conflict15s} ${scene.twist45s}`, CONFLICT_SIGNAL);
  const weakRetention = !hasAnySignal(scene.cta, RETENTION_SIGNAL);
  return weakHook || weakConflict || weakRetention;
}

function buildHook(scene: RawScene): string {
  const lead = scene.cast[0] || '主角';
  const core = firstNonEmpty(scene.conflict15s, scene.twist45s, scene.title, '关键证据突然消失');
  return clipText(`${lead}发现异常：${core}`);
}

function buildConflict(scene: RawScene): string {
  const core = firstNonEmpty(scene.conflict15s, scene.title, '局势失控');
  return clipText(`冲突升级：${core}，倒计时逼近`);
}

function buildTwist(scene: RawScene): string {
  const core = firstNonEmpty(scene.twist45s, scene.conflict15s, scene.title, '盟友身份反转');
  return clipText(`反转揭露：${core}，真相失控`);
}

function buildCta(scene: RawScene, profile: ShortDramaHookPolishProfile): string {
  if (profile === 'hook-first') {
    return clipText(`你站哪边？下一场马上揭晓`);
  }
  const lead = scene.cast[0] || '主角';
  return clipText(`${lead}会翻盘吗？下一场揭晓`);
}

function buildDialogue(scene: RawScene, hook3s: string, conflict15s: string, twist45s: string): string[] {
  const base = scene.dialogueLines.slice(0, 3);
  while (base.length < 3) {
    base.push('');
  }
  const next = [
    clipText(firstNonEmpty(base[0], hook3s)),
    clipText(firstNonEmpty(base[1], conflict15s)),
    clipText(firstNonEmpty(base[2], twist45s)),
  ];
  return next.map((line) => line || '……');
}

export function polishShortDramaPayloadForCommercial(params: {
  payload: unknown;
  qualityProfile: ShortDramaHookPolishProfile;
}): ShortDramaHookPolishResult {
  const root = params.payload;
  if (!root || typeof root !== 'object') {
    return {
      payload: params.payload,
      changedScenes: 0,
      changedFields: 0,
      strategy: 'auto-hook-polish-v1',
    };
  }

  const container = root as Record<string, unknown>;
  if (!Array.isArray(container.scenes)) {
    return {
      payload: params.payload,
      changedScenes: 0,
      changedFields: 0,
      strategy: 'auto-hook-polish-v1',
    };
  }

  let changedScenes = 0;
  let changedFields = 0;
  const polishedScenes = container.scenes.map((raw) => {
    const parsed = parseScene(raw);
    if (!parsed || !shouldPolishScene(parsed, params.qualityProfile)) {
      return raw;
    }

    const hook3s = buildHook(parsed);
    const conflict15s = buildConflict(parsed);
    const twist45s = buildTwist(parsed);
    const cta = buildCta(parsed, params.qualityProfile);
    const dialogueLines = buildDialogue(parsed, hook3s, conflict15s, twist45s);

    const current = raw as Record<string, unknown>;
    let sceneFieldChanges = 0;
    if (asText(current.hook3s) !== hook3s) sceneFieldChanges += 1;
    if (asText(current.conflict15s) !== conflict15s) sceneFieldChanges += 1;
    if (asText(current.twist45s) !== twist45s) sceneFieldChanges += 1;
    if (asText(current.cta) !== cta) sceneFieldChanges += 1;

    const oldDialogue = asStringArray(current.dialogueLines).join('\n');
    const newDialogue = dialogueLines.join('\n');
    if (oldDialogue !== newDialogue) sceneFieldChanges += 1;

    if (sceneFieldChanges > 0) {
      changedScenes += 1;
      changedFields += sceneFieldChanges;
    }

    return {
      ...current,
      hook3s,
      conflict15s,
      twist45s,
      cta,
      dialogueLines,
    };
  });

  return {
    payload: {
      ...container,
      scenes: polishedScenes,
    },
    changedScenes,
    changedFields,
    strategy: 'auto-hook-polish-v1',
  };
}
