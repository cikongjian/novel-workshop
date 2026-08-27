import type { ShortStoryBlueprint } from './short-story-types.js';
import {
  getShortStoryTemplatePreset,
} from './short-story-template-catalog.js';

export const sonInLawTemplate =
  getShortStoryTemplatePreset('son-in-law')?.blueprint ?? null;

export const rebirthRevengeTemplate =
  getShortStoryTemplatePreset('rebirth-revenge')?.blueprint ?? null;

export const fastCultivationTemplate =
  getShortStoryTemplatePreset('fast-cultivation')?.blueprint ?? null;

export const ceoRomanceTemplate =
  getShortStoryTemplatePreset('ceo-romance')?.blueprint ?? null;

export const systemUpgradeTemplate =
  getShortStoryTemplatePreset('system-upgrade')?.blueprint ?? null;

export const faceSlappingTemplate =
  getShortStoryTemplatePreset('face-slapping')?.blueprint ?? null;

export function getShortStoryTemplate(
  template: string
): Partial<ShortStoryBlueprint> | null {
  return getShortStoryTemplatePreset(template)?.blueprint ?? null;
}

export function createShortStoryBlueprint(
  template: string,
  userConfig: Partial<ShortStoryBlueprint>
): ShortStoryBlueprint {
  const templateConfig = getShortStoryTemplate(template);
  const now = new Date().toISOString();

  return {
    targetWordCount: userConfig.targetWordCount || 25000,
    targetChapters: userConfig.targetChapters || 18,
    chapterWordCount: userConfig.chapterWordCount,
    paywall: userConfig.paywall || {
      enabled: true,
      type: 'chapter',
      freeChapters: 2,
      paywallMessage: '精彩内容，解锁继续阅读',
    },
    template: template as any,
    payoffDensity: userConfig.payoffDensity || templateConfig?.payoffDensity || 'extreme',
    paceMode: userConfig.paceMode || templateConfig?.paceMode || 'ultra-fast',
    styleGuide: userConfig.styleGuide || templateConfig?.styleGuide || '短句为主，对话占比 50% 以上，保证每章都有明确爽点。',
    hook: {
      openingPunch: '',
      coreLoop: '',
      climaxChain: '',
      chapterEndStrategy: '悬念型为主，危机型为辅',
      ...templateConfig?.hook,
      ...userConfig.hook,
    } as any,
    protagonist: {
      ...templateConfig?.protagonist,
      ...userConfig.protagonist,
    } as any,
    antagonists: userConfig.antagonists || templateConfig?.antagonists || [],
    forbidden: userConfig.forbidden || templateConfig?.forbidden || [
      '支线剧情',
      '大段环境描写',
      '冗长心理活动',
      '慢节奏铺垫',
    ],
    createdAt: now,
    updatedAt: now,
  };
}
