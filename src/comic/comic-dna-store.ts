import fs from 'node:fs/promises';
import { getNovelsDir } from '../config/index.js';
import { resolveNovelStorageDir } from '../novel/data-root.js';
import { createLogger } from '../utils/logger.js';
import { resolvePathWithin } from '../utils/path-safety.js';
import { now } from '../utils/text.js';
import type { CharacterDNA } from './comic-dna-types.js';

const log = createLogger('comic-dna-store');

/**
 * 角色 DNA 文件存储。
 * 路径：data/novels/{novelId}/character-dna/{characterId}.json
 * 独立于 CharacterProfile（向后兼容，无 DNA 的角色降级到当前逻辑）。
 */
export class CharacterDNAStore {
  constructor(private readonly novelsDir: string = getNovelsDir()) {}

  private dnaDir(novelId: string): string {
    return resolvePathWithin(resolveNovelStorageDir(this.novelsDir, novelId), 'character-dna');
  }

  private dnaPath(novelId: string, characterId: string): string {
    return resolvePathWithin(this.dnaDir(novelId), `${characterId}.json`);
  }

  async get(novelId: string, characterId: string): Promise<CharacterDNA | null> {
    try {
      const raw = await fs.readFile(this.dnaPath(novelId, characterId), 'utf-8');
      return JSON.parse(raw) as CharacterDNA;
    } catch {
      return null;
    }
  }

  async write(novelId: string, characterId: string, dna: CharacterDNA): Promise<void> {
    const dir = this.dnaDir(novelId);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(this.dnaPath(novelId, characterId), JSON.stringify(dna, null, 2), 'utf-8');
    log.info('角色 DNA 已保存', { novelId, characterId, version: dna.version });
  }

  async delete(novelId: string, characterId: string): Promise<void> {
    await fs.unlink(this.dnaPath(novelId, characterId)).catch(() => undefined);
  }

  async getBatch(novelId: string, characterIds: string[]): Promise<Map<string, CharacterDNA>> {
    const map = new Map<string, CharacterDNA>();
    await Promise.all(
      characterIds.map(async (id) => {
        const dna = await this.get(novelId, id);
        if (dna) map.set(id, dna);
      }),
    );
    return map;
  }
}

/** DNA 锚点文本最大长度，防止多角色分镜时 prompt token 失控 */
const DNA_ANCHOR_MAX_CHARS = 500;

/** 从角色 DNA 生成漫画锚点文本（替代 comic-character-anchor 的降级路径） */
export function dnaToAnchor(dna: CharacterDNA): string {
  const raw = [
    dna.promptFragment.anchor,
    `Signature features: ${dna.signatureAnchors.join(', ')}`,
    'consistent character design, NO face variation',
  ].join('\n');
  return raw.length <= DNA_ANCHOR_MAX_CHARS
    ? raw
    : raw.slice(0, DNA_ANCHOR_MAX_CHARS - 3) + '...';
}

/** 从角色 DNA 生成立绘 prompt（替代 portraitPrompt） */
export function dnaToPortraitPrompt(dna: CharacterDNA): string {
  return dna.promptFragment.full;
}
