type DeliveryScene = {
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

type DeliveryShot = {
  shotId: string;
  chapterNumber: number;
  sceneNo: number;
  durationSec: number;
  camera: string;
  movement: string;
  composition: string;
  mood: string;
  dialogue: string;
  visualPromptZh: string;
  visualPromptEn: string;
};

type DeliveryClipCandidate = {
  sceneNo: number;
  chapterNumber: number;
  title: string;
  score: number;
  hook3s: string;
  conflict15s: string;
  twist45s: string;
  cta: string;
  reasons: string[];
};

type DeliveryQaLike = {
  overallScore: number;
  verdict: string;
  paidTier: string;
  qualityProfile: string;
  dimensions?: {
    averageSceneScore?: number;
    coverageScore?: number;
    consistencyScore?: number;
    hookStrengthScore?: number;
    candidateDiversityScore?: number;
  };
  clipCandidates?: DeliveryClipCandidate[];
};

export type ShortDramaDeliveryPack = {
  schemaVersion: '1.0';
  generatedAt: string;
  project: {
    id: string;
    name: string;
  };
  source: {
    sourceNovelId: string;
    targetNovelId: string;
    chapterRange: {
      start: number;
      end: number;
    };
    packageId: string;
  };
  commercial: {
    overallScore: number;
    verdict: string;
    paidTier: string;
    qualityProfile: string;
    dimensions: {
      averageSceneScore: number;
      coverageScore: number;
      consistencyScore: number;
      hookStrengthScore: number;
      candidateDiversityScore: number;
    };
    readyForClient: boolean;
  };
  clipDeliverables: Array<{
    rank: number;
    id: string;
    scene: {
      chapterNumber: number;
      sceneNo: number;
      title: string;
      score: number;
      cast: string[];
      location: string;
    };
    script: {
      hook3s: string;
      conflict15s: string;
      twist45s: string;
      cta: string;
      dialogueLines: string[];
      reasons: string[];
    };
    storyboard: Array<{
      shotId: string;
      durationSec: number;
      camera: string;
      movement: string;
      composition: string;
      mood: string;
      dialogue: string;
      visualPromptZh: string;
      visualPromptEn: string;
    }>;
  }>;
  files: {
    payloadPath: string;
    qaReportPath: string;
    deliveryPackPath: string;
    guidePath: string;
    storyboardPromptPath: string;
    characterPromptPath: string;
  };
};

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

function parseScenes(payload: unknown): DeliveryScene[] {
  if (!payload || typeof payload !== 'object') return [];
  const scenesRaw = (payload as { scenes?: unknown }).scenes;
  if (!Array.isArray(scenesRaw)) return [];

  return scenesRaw.map((raw) => {
    const scene = raw as Record<string, unknown>;
    return {
      sceneNo: asNumber(scene.sceneNo),
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
  }).filter((item) => item.sceneNo > 0 && item.chapterNumber > 0);
}

function parseShots(payload: unknown): DeliveryShot[] {
  if (!payload || typeof payload !== 'object') return [];
  const chapterStoryboardsRaw = (payload as { chapterStoryboards?: unknown }).chapterStoryboards;
  if (!Array.isArray(chapterStoryboardsRaw)) return [];

  const shots: DeliveryShot[] = [];
  for (const chapterRaw of chapterStoryboardsRaw) {
    const chapter = chapterRaw as Record<string, unknown>;
    const promptsRaw = chapter.shotPrompts;
    if (!Array.isArray(promptsRaw)) continue;
    for (const promptRaw of promptsRaw) {
      const prompt = promptRaw as Record<string, unknown>;
      shots.push({
        shotId: asText(prompt.shotId),
        chapterNumber: asNumber(prompt.chapterNumber),
        sceneNo: asNumber(prompt.sceneNo),
        durationSec: asNumber(prompt.durationSec),
        camera: asText(prompt.camera),
        movement: asText(prompt.movement),
        composition: asText(prompt.composition),
        mood: asText(prompt.mood),
        dialogue: asText(prompt.dialogue),
        visualPromptZh: asText(prompt.visualPromptZh),
        visualPromptEn: asText(prompt.visualPromptEn),
      });
    }
  }
  return shots.filter((shot) => shot.sceneNo > 0 && shot.chapterNumber > 0);
}

function normalizeClipCandidates(qa: DeliveryQaLike): DeliveryClipCandidate[] {
  const raw = Array.isArray(qa.clipCandidates) ? qa.clipCandidates : [];
  return raw.map((item) => ({
    sceneNo: asNumber(item.sceneNo),
    chapterNumber: asNumber(item.chapterNumber),
    title: asText(item.title),
    score: asNumber(item.score),
    hook3s: asText(item.hook3s),
    conflict15s: asText(item.conflict15s),
    twist45s: asText(item.twist45s),
    cta: asText(item.cta),
    reasons: asStringArray(item.reasons),
  })).filter((item) => item.sceneNo > 0 && item.chapterNumber > 0);
}

function keyByScene(chapterNumber: number, sceneNo: number): string {
  return `${chapterNumber}#${sceneNo}`;
}

export function buildShortDramaDeliveryPack(params: {
  projectId: string;
  projectName: string;
  sourceNovelId: string;
  targetNovelId: string;
  chapterStart: number;
  chapterEnd: number;
  packageId: string;
  payloadPath: string;
  qaReportPath: string;
  deliveryPackPath: string;
  payload: unknown;
  qa: DeliveryQaLike;
}): ShortDramaDeliveryPack {
  const scenes = parseScenes(params.payload);
  const shots = parseShots(params.payload);
  const scenesByKey = new Map(scenes.map((scene) => [keyByScene(scene.chapterNumber, scene.sceneNo), scene]));
  const shotsByKey = new Map<string, DeliveryShot[]>();
  for (const shot of shots) {
    const key = keyByScene(shot.chapterNumber, shot.sceneNo);
    const items = shotsByKey.get(key) ?? [];
    items.push(shot);
    shotsByKey.set(key, items);
  }

  const clipCandidates = normalizeClipCandidates(params.qa).slice(0, 2);
  const clipDeliverables = clipCandidates.map((clip, index) => {
    const key = keyByScene(clip.chapterNumber, clip.sceneNo);
    const scene = scenesByKey.get(key);
    const candidateShots = (shotsByKey.get(key) ?? []).slice(0, 3);
    return {
      rank: index + 1,
      id: `C${clip.chapterNumber}-S${clip.sceneNo}`,
      scene: {
        chapterNumber: clip.chapterNumber,
        sceneNo: clip.sceneNo,
        title: clip.title || scene?.title || `Scene ${clip.sceneNo}`,
        score: clip.score,
        cast: scene?.cast ?? [],
        location: scene?.location ?? '',
      },
      script: {
        hook3s: clip.hook3s || scene?.hook3s || '',
        conflict15s: clip.conflict15s || scene?.conflict15s || '',
        twist45s: clip.twist45s || scene?.twist45s || '',
        cta: clip.cta || scene?.cta || '',
        dialogueLines: scene?.dialogueLines ?? [],
        reasons: clip.reasons,
      },
      storyboard: candidateShots.map((shot) => ({
        shotId: shot.shotId,
        durationSec: shot.durationSec,
        camera: shot.camera,
        movement: shot.movement,
        composition: shot.composition,
        mood: shot.mood,
        dialogue: shot.dialogue,
        visualPromptZh: shot.visualPromptZh,
        visualPromptEn: shot.visualPromptEn,
      })),
    };
  });

  const payloadObj = (params.payload ?? {}) as Record<string, unknown>;
  const dimensions = params.qa.dimensions ?? {};

  return {
    schemaVersion: '1.0',
    generatedAt: new Date().toISOString(),
    project: {
      id: params.projectId,
      name: params.projectName,
    },
    source: {
      sourceNovelId: params.sourceNovelId,
      targetNovelId: params.targetNovelId,
      chapterRange: {
        start: params.chapterStart,
        end: params.chapterEnd,
      },
      packageId: params.packageId,
    },
    commercial: {
      overallScore: asNumber(params.qa.overallScore),
      verdict: asText(params.qa.verdict),
      paidTier: asText(params.qa.paidTier),
      qualityProfile: asText(params.qa.qualityProfile),
      dimensions: {
        averageSceneScore: asNumber(dimensions.averageSceneScore),
        coverageScore: asNumber(dimensions.coverageScore),
        consistencyScore: asNumber(dimensions.consistencyScore),
        hookStrengthScore: asNumber(dimensions.hookStrengthScore),
        candidateDiversityScore: asNumber(dimensions.candidateDiversityScore),
      },
      readyForClient: asText(params.qa.verdict) === 'ready-for-paid' && asText(params.qa.paidTier) !== 'test-only',
    },
    clipDeliverables,
    files: {
      payloadPath: params.payloadPath,
      qaReportPath: params.qaReportPath,
      deliveryPackPath: params.deliveryPackPath,
      guidePath: asText(payloadObj.guidePath),
      storyboardPromptPath: asText(payloadObj.storyboardPromptPath),
      characterPromptPath: asText(payloadObj.characterPromptPath),
    },
  };
}
