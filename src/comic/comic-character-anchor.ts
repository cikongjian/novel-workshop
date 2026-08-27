import type { CharacterProfile } from '../novel/types.js';
import { MAX_REFERENCE_CHARACTERS_PER_PANEL } from './comic-config.js';
import type { CharacterDNA } from './comic-dna-types.js';
import { dnaToAnchor } from './comic-dna-store.js';

/** 单角色立绘 prompt 的截断长度，避免锚点块过长吃掉 token */
const ANCHOR_VISUAL_MAX_CHARS = 500;

/**
 * 为单个角色构造「视觉锚点块」（英文）。
 *
 * 优先使用角色 DNA（结构化、预生成、立绘和漫画共享），
 * 无 DNA 时降级到 portraitPrompt/appearance 自由文本提取。
 */
export function buildComicCharacterAnchor(character: CharacterProfile): string {
  // 降级路径：从 portraitPrompt/appearance 提取
  const portraitPrompt = character.portraitPrompt?.trim() ?? '';
  const appearance = character.appearance?.trim() ?? '';
  const visualSource = (portraitPrompt || appearance).slice(0, ANCHOR_VISUAL_MAX_CHARS).trim();
  const visualLine = visualSource
    ? `Visual identity: ${visualSource}`
    : 'Visual identity: consistent with the reference image';

  return [
    visualLine,
    'Preserve identical face, hairstyle, outfit and build as the reference image.',
    'consistent character design, NO face variation, NO text in image, NO caption, NO speech bubble',
  ].join(' ');
}

/**
 * 为单个角色构造视觉锚点块——优先用 DNA，无则降级。
 * DNA 版本：骨骼级面部描述 + 预生成英文锚点 + 标志性特征，比自由文本提取精确得多。
 */
export function buildComicCharacterAnchorWithDNA(character: CharacterProfile, dna: CharacterDNA | null): string {
  if (dna) {
    return dnaToAnchor(dna);
  }
  return buildComicCharacterAnchor(character);
}

export type ComicPanelAnchor = {
  /** 拼好的锚点文本（追加到分镜 prompt 末尾） */
  anchorText: string;
  /** 出场角色 id 列表（顺序与 image1/image2 严格对应，1-based） */
  referenceCharacterIds: string[];
  /** 截断标志：出场角色超过上限时为 true，调用方可据此提示用户 */
  truncated: boolean;
};

/**
 * 为一格分镜的出场角色构造锚点块 + 参考图编号映射。
 *
 * 角色按名字稳定排序（localeCompare），prompt 里 image1/image2 严格对应排序顺序，
 * 这样无论调用方何时取角色，参考图顺序都确定，避免锁错脸。
 * 超过 MAX_REFERENCE_CHARACTERS_PER_PANEL 的角色被截断，避免漂移与 token 失控。
 */
export function buildComicPanelAnchor(characters: CharacterProfile[]): ComicPanelAnchor {
  return buildComicPanelAnchorWithDNA(characters, new Map());
}

/**
 * 为一格分镜的出场角色构造锚点块——优先用 DNA，无则降级到自由文本。
 * dnaMap: characterId → CharacterDNA（可为空 Map，全降级）
 */
export function buildComicPanelAnchorWithDNA(
  characters: CharacterProfile[],
  dnaMap: Map<string, CharacterDNA>,
): ComicPanelAnchor {
  const sorted = [...characters]
    .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'zh'))
    .slice(0, MAX_REFERENCE_CHARACTERS_PER_PANEL);
  const truncated = characters.length > MAX_REFERENCE_CHARACTERS_PER_PANEL;
  const referenceCharacterIds = sorted
    .map((c) => c.id)
    .filter((id): id is string => Boolean(id));

  if (sorted.length === 0) {
    return { anchorText: '', referenceCharacterIds: [], truncated };
  }

  const lines = sorted.map((char, index) => {
    const refNumber = index + 1;
    const dna = char.id ? dnaMap.get(char.id) ?? null : null;
    return `image${refNumber} (preserve face identity from this reference image). ${buildComicCharacterAnchorWithDNA(char, dna)}`;
  });
  const anchorText = [
    'Reference images:',
    ...lines,
    'Apply the style and identity of the reference images consistently across the panel.',
  ].join('\n');

  return { anchorText, referenceCharacterIds, truncated };
}
