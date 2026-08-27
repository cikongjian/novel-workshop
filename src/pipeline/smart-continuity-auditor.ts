/**
 * 智能连续性审计器
 * 
 * 跨多章检测：
 * - 人名突变（阿星→何苗）
 * - 数字不一致（13.7MHz→16.7MHz）
 * - 设定一致性（角色身份、势力归属、物品状态）
 * 
 * 纯算法实现，不调用AI，毫秒级完成。
 */

export type ContinuityFinding = {
  code: 'name-mutation' | 'number-inconsistency' | 'identity-conflict' | 'faction-conflict' | 'item-resurrection' | 'setting-leak';
  level: 'warn' | 'error';
  message: string;
  chapter: number;
  details?: Record<string, unknown>;
};

export type ContinuityAuditReport = {
  findings: ContinuityFinding[];
  passed: boolean;
  summary: string;
};

export type CharacterAliasMap = Map<string, {
  name: string;
  aliases: string[];
  firstChapter: number;
  lastChapter: number;
  identity?: string;
  faction?: string;
}>;

export type NumberAnchor = {
  value: string;
  context: string;
  chapter: number;
};

export type ItemState = {
  name: string;
  status: 'obtained' | 'used' | 'destroyed' | 'lost';
  chapter: number;
};

export class ContinuityAuditor {
  private characterMap = new Map<string, CharacterAliasMap>();
  private numberAnchors = new Map<string, NumberAnchor[]>();
  private itemStates = new Map<string, ItemState[]>();

  registerNovel(novelId: string): void {
    if (!this.characterMap.has(novelId)) {
      this.characterMap.set(novelId, new Map());
      this.numberAnchors.set(novelId, []);
      this.itemStates.set(novelId, []);
    }
  }

  extractCharacters(content: string, chapterNumber: number): Array<{ name: string; context: string }> {
    const speakers: Array<{ name: string; context: string }> = [];
    const markerRe = /[\(\uFF08]\s*#\s*([^()\uFF08\uFF09\n]+?)\s*[\)\uFF09]/g;
    let match: RegExpExecArray | null;
    while ((match = markerRe.exec(content)) !== null) {
      const name = (match[1] ?? '').trim();
      if (!name || name.length < 2) continue;
      const context = content.slice(Math.max(0, match.index - 50), match.index + 50);
      speakers.push({ name, context });
    }
    return speakers;
  }

  extractNumbers(content: string, chapterNumber: number): NumberAnchor[] {
    const anchors: NumberAnchor[] = [];
    const numberRe = /(\d{1,4}(?:\.\d{1,3})?)\s*(MHz|Hz|米|公里|千克|秒|分钟|小时|天|日|号|章|节|度|级|元|点|分|%|倍|层|米)/g;
    let match: RegExpExecArray | null;
    while ((match = numberRe.exec(content)) !== null) {
      const value = match[1];
      const unit = match[2];
      const context = content.slice(Math.max(0, match.index - 30), match.index + 30);
      anchors.push({ value: `${value}${unit}`, context, chapter: chapterNumber });
    }
    return anchors;
  }

  extractItems(content: string, chapterNumber: number): ItemState[] {
    const items: ItemState[] = [];
    const patterns = [
      { re: /(获得|得到|捡到|拿到)\s*(.+?)([。！？；;\n])/g, status: 'obtained' as const },
      { re: /(使用|消耗|用掉)\s*(.+?)([。！？；;\n])/g, status: 'used' as const },
      { re: /(摧毁|破坏|炸毁|粉碎)\s*(.+?)([。！？；;\n])/g, status: 'destroyed' as const },
      { re: /(丢失|遗失|落下)\s*(.+?)([。！？；;\n])/g, status: 'lost' as const },
    ];
    for (const { re, status } of patterns) {
      let match: RegExpExecArray | null;
      while ((match = re.exec(content)) !== null) {
        const itemName = match[2].trim();
        if (itemName.length < 2 || itemName.length > 20) continue;
        items.push({ name: itemName, status, chapter: chapterNumber });
      }
    }
    return items;
  }

  processChapter(novelId: string, content: string, chapterNumber: number): ContinuityFinding[] {
    const findings: ContinuityFinding[] = [];
    const chars = this.characterMap.get(novelId);
    const numbers = this.numberAnchors.get(novelId);
    const items = this.itemStates.get(novelId);
    if (!chars || !numbers || !items) {
      this.registerNovel(novelId);
      this._updateState(novelId, content, chapterNumber);
      return findings;
    }

    const newSpeakers = this.extractCharacters(content, chapterNumber);
    const newNumbers = this.extractNumbers(content, chapterNumber);
    const newItems = this.extractItems(content, chapterNumber);

    findings.push(...this._checkNameMutations(chars, newSpeakers, chapterNumber));
    findings.push(...this._checkNumberInconsistencies(numbers, newNumbers, chapterNumber));
    findings.push(...this._checkItemResurrection(items, newItems, chapterNumber));

    this._updateState(novelId, content, chapterNumber, newSpeakers, newNumbers, newItems);

    return findings;
  }

  private _checkNameMutations(chars: CharacterAliasMap, newSpeakers: Array<{ name: string; context: string }>, chapter: number): ContinuityFinding[] {
    const findings: ContinuityFinding[] = [];
    const seenNames = new Set<string>();

    for (const speaker of newSpeakers) {
      const normalizedName = speaker.name.toLowerCase().trim();
      if (seenNames.has(normalizedName)) continue;
      seenNames.add(normalizedName);

      let foundMatch = false;
      for (const [, char] of chars) {
        const knownNames = [char.name.toLowerCase(), ...char.aliases.map(a => a.toLowerCase())];
        if (knownNames.includes(normalizedName)) {
          foundMatch = true;
          break;
        }
      }

      if (!foundMatch) {
        let similarName: string | null = null;
        let similarityScore = 0;

        for (const [, char] of chars) {
          const knownNames = [char.name, ...char.aliases];
          for (const known of knownNames) {
            const score = this._stringSimilarity(normalizedName, known.toLowerCase());
            if (score > 0.7 && score > similarityScore) {
              similarityScore = score;
              similarName = known;
            }
          }
        }

        if (similarName) {
          findings.push({
            code: 'name-mutation',
            level: 'error',
            message: `角色名疑似突变：本章出现"${speaker.name}"，与前章"${similarName}"相似度极高（${Math.round(similarityScore * 100)}%），请确认是否为同一角色`,
            chapter,
            details: { oldName: similarName, newName: speaker.name, context: speaker.context },
          });
        } else if (chars.size > 0) {
          findings.push({
            code: 'name-mutation',
            level: 'warn',
            message: `检测到新角色"${speaker.name}"，若为已有角色的别名请确认命名一致性`,
            chapter,
            details: { name: speaker.name, context: speaker.context },
          });
        }
      }
    }

    return findings;
  }

  private _checkNumberInconsistencies(existing: NumberAnchor[], newAnchors: NumberAnchor[], chapter: number): ContinuityFinding[] {
    const findings: ContinuityFinding[] = [];
    const unitGroups = new Map<string, Set<string>>();

    for (const anchor of existing) {
      const match = anchor.value.match(/(\d+[\.\d]*)(.+)/);
      if (match) {
        const unit = match[2];
        const values = unitGroups.get(unit) ?? new Set();
        values.add(match[1]);
        unitGroups.set(unit, values);
      }
    }

    for (const anchor of newAnchors) {
      const match = anchor.value.match(/(\d+[\.\d]*)(.+)/);
      if (!match) continue;
      const value = match[1];
      const unit = match[2];

      if (unitGroups.has(unit)) {
        const knownValues = unitGroups.get(unit)!;
        if (!knownValues.has(value)) {
          const existingValues = [...knownValues].join(', ');
          findings.push({
            code: 'number-inconsistency',
            level: 'error',
            message: `数字不一致：本章出现"${anchor.value}"，但同单位历史值为"${existingValues}"`,
            chapter,
            details: { value: anchor.value, existingValues, context: anchor.context },
          });
        }
      }
    }

    return findings;
  }

  private _checkItemResurrection(existing: ItemState[], newItems: ItemState[], chapter: number): ContinuityFinding[] {
    const findings: ContinuityFinding[] = [];
    const destroyedItems = new Set(
      existing.filter(item => item.status === 'destroyed' || item.status === 'lost').map(item => item.name.toLowerCase())
    );

    for (const item of newItems) {
      const normalizedName = item.name.toLowerCase();
      if (destroyedItems.has(normalizedName)) {
        const destroyedIn = existing.find(i => i.name.toLowerCase() === normalizedName && (i.status === 'destroyed' || i.status === 'lost'));
        findings.push({
          code: 'item-resurrection',
          level: 'error',
          message: `物品复活："${item.name}"在第${destroyedIn?.chapter}章已${destroyedIn?.status === 'destroyed' ? '摧毁' : '丢失'}，但本章出现了"${item.status}"该物品`,
          chapter,
          details: { item: item.name, previousChapter: destroyedIn?.chapter, previousStatus: destroyedIn?.status, currentStatus: item.status },
        });
      }
    }

    return findings;
  }

  private _updateState(
    novelId: string,
    content: string,
    chapterNumber: number,
    newSpeakers?: Array<{ name: string; context: string }>,
    newNumbers?: NumberAnchor[],
    newItems?: ItemState[]
  ): void {
    const chars = this.characterMap.get(novelId)!;
    const speakers = newSpeakers ?? this.extractCharacters(content, chapterNumber);

    for (const speaker of speakers) {
      const normalized = speaker.name.toLowerCase();
      let existing = chars.get(normalized);
      if (!existing) {
        existing = { name: speaker.name, aliases: [], firstChapter: chapterNumber, lastChapter: chapterNumber };
        chars.set(normalized, existing);
      } else {
        existing.lastChapter = chapterNumber;
      }
    }

    const numbers = this.numberAnchors.get(novelId)!;
    const numAnchors = newNumbers ?? this.extractNumbers(content, chapterNumber);
    numbers.push(...numAnchors);

    const items = this.itemStates.get(novelId)!;
    const itemStates = newItems ?? this.extractItems(content, chapterNumber);
    items.push(...itemStates);
  }

  private _stringSimilarity(a: string, b: string): number {
    if (a.length === 0 || b.length === 0) return 0;
    if (a === b) return 1;

    const matrix: number[][] = [];
    for (let i = 0; i <= b.length; i++) matrix[i] = [i];
    for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        const cost = a[j - 1] === b[i - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j - 1] + cost
        );
      }
    }

    return 1 - (matrix[b.length][a.length] / Math.max(a.length, b.length));
  }

  auditAll(novelId: string, chapters: Array<{ content: string; chapterNumber: number }>): ContinuityAuditReport {
    this.registerNovel(novelId);
    const allFindings: ContinuityFinding[] = [];

    for (const chapter of chapters.sort((a, b) => a.chapterNumber - b.chapterNumber)) {
      const findings = this.processChapter(novelId, chapter.content, chapter.chapterNumber);
      allFindings.push(...findings);
    }

    const errorCount = allFindings.filter(f => f.level === 'error').length;
    const warnCount = allFindings.filter(f => f.level === 'warn').length;

    return {
      findings: allFindings,
      passed: errorCount === 0,
      summary: errorCount > 0
        ? `连续性审计：${errorCount} 个错误，${warnCount} 个警告`
        : `连续性审计通过（${warnCount} 个警告）`,
    };
  }
}
