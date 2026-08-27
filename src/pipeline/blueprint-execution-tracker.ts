/**
 * 蓝图执行追踪器
 * 
 * 检测大纲规划的场景/事件是否在正文中实际执行。
 * 纯算法实现，基于关键词匹配和段落分析。
 */

export type BlueprintScene = {
  id: string;
  title: string;
  keywords: string[];
  required: boolean;
  source: 'chapter-outline' | 'foreshadowing' | 'world-contract';
};

export type BlueprintFinding = {
  code: 'scene-not-executed' | 'scene-partial-execution' | 'foreshadowing-not-recovered' | 'contract-violation';
  level: 'warn' | 'error';
  message: string;
  sceneId?: string;
  sceneTitle?: string;
  chapter: number;
};

export type BlueprintExecutionReport = {
  totalScenes: number;
  executedScenes: number;
  partiallyExecutedScenes: number;
  notExecutedScenes: number;
  findings: BlueprintFinding[];
  passed: boolean;
  summary: string;
};

export class BlueprintTracker {
  private scenePlanCache = new Map<string, BlueprintScene[]>();

  cacheScenePlan(novelId: string, scenes: BlueprintScene[]): void {
    this.scenePlanCache.set(novelId, scenes);
  }

  trackChapter(novelId: string, content: string, chapterNumber: number, scenePlan?: BlueprintScene[]): BlueprintExecutionReport {
    const scenes = scenePlan ?? this.scenePlanCache.get(novelId) ?? [];
    if (scenes.length === 0) {
      return {
        totalScenes: 0,
        executedScenes: 0,
        partiallyExecutedScenes: 0,
        notExecutedScenes: 0,
        findings: [],
        passed: true,
        summary: '无场景计划需要追踪',
      };
    }

    const findings: BlueprintFinding[] = [];
    let executedCount = 0;
    let partialCount = 0;

    for (const scene of scenes) {
      const result = this._evaluateSceneExecution(content, scene);
      
      if (result.executed) {
        executedCount++;
      } else if (result.partial) {
        partialCount++;
        if (scene.required) {
          findings.push({
            code: 'scene-partial-execution',
            level: 'warn',
            message: `场景"${scene.title}"执行不完整，关键词命中不足`,
            sceneId: scene.id,
            sceneTitle: scene.title,
            chapter: chapterNumber,
          });
        }
      } else {
        if (scene.required) {
          findings.push({
            code: 'scene-not-executed',
            level: 'error',
            message: `大纲规划的场景"${scene.title}"未在正文中执行`,
            sceneId: scene.id,
            sceneTitle: scene.title,
            chapter: chapterNumber,
          });
        } else {
          findings.push({
            code: 'scene-not-executed',
            level: 'warn',
            message: `可选场景"${scene.title}"未在正文中执行`,
            sceneId: scene.id,
            sceneTitle: scene.title,
            chapter: chapterNumber,
          });
        }
      }
    }

    const notExecutedCount = scenes.length - executedCount - partialCount;
    const coverage = Math.round((executedCount / scenes.length) * 100);

    return {
      totalScenes: scenes.length,
      executedScenes: executedCount,
      partiallyExecutedScenes: partialCount,
      notExecutedScenes: notExecutedCount,
      findings,
      passed: findings.filter(f => f.level === 'error').length === 0,
      summary: `蓝图执行追踪：${coverage}% 场景已执行（${executedCount}/${scenes.length}）`,
    };
  }

  private _evaluateSceneExecution(content: string, scene: BlueprintScene): { executed: boolean; partial: boolean; hitCount: number } {
    if (scene.keywords.length === 0) {
      return { executed: true, partial: false, hitCount: 0 };
    }

    const hits = scene.keywords.filter(keyword => this._keywordMatched(content, keyword));
    const hitCount = hits.length;

    if (hitCount === 0) {
      return { executed: false, partial: false, hitCount: 0 };
    }

    if (hitCount >= scene.keywords.length) {
      return { executed: true, partial: false, hitCount };
    }

    const strongHit = hits.some(keyword => keyword.length >= 4 || this._hasActionOrDialogueNearKeyword(content, keyword));
    if (strongHit || hitCount / scene.keywords.length >= 0.5) {
      return { executed: false, partial: true, hitCount };
    }

    return { executed: false, partial: false, hitCount };
  }

  private _keywordMatched(content: string, keyword: string): boolean {
    const normalized = keyword.trim();
    if (!normalized) return false;
    if (content.includes(normalized)) return true;
    
    const fragments = this._extractFragments(normalized);
    if (fragments.length === 0) return false;
    
    const fragmentHits = fragments.filter(f => content.includes(f));
    return fragmentHits.length >= Math.min(2, fragments.length);
  }

  private _extractFragments(keyword: string): string[] {
    const normalized = keyword.replace(/[^\u4e00-\u9fa5A-Za-z0-9]/g, '');
    if (normalized.length < 4) return [];

    const fragments = new Set<string>();
    for (const match of normalized.matchAll(/[\u4e00-\u9fa5]{2,4}|[A-Za-z0-9]{2,8}/g)) {
      fragments.add(match[0]);
    }
    return [...fragments].slice(0, 6);
  }

  private _hasActionOrDialogueNearKeyword(content: string, keyword: string): boolean {
    const idx = content.indexOf(keyword);
    if (idx === -1) return false;

    const windowSize = 80;
    const window = content.slice(Math.max(0, idx - windowSize), idx + keyword.length + windowSize);
    
    const actionRe = /[冲扑抓推拉砸撞拔刺躲追跑走赶绕翻蹲按握塞递挡问回答喊笑哭跪站起转身推门关门抬手落下接过取出割写滴打开开启激活加固封死检查受伤碎裂渗出]/;
    const dialogueRe = /[“"「『][^”"」』]{2,60}[”"」』]/;

    return actionRe.test(window) || dialogueRe.test(window);
  }

  extractScenePlanFromOutline(outlineText: string): BlueprintScene[] {
    const scenes: BlueprintScene[] = [];
    const lines = outlineText.split('\n').map(l => l.trim()).filter(Boolean);
    
    let currentScene: BlueprintScene | null = null;
    let currentKeywords: string[] = [];

    for (const line of lines) {
      if (/^[一二三四五六七八九十\d]+[\.、]/.test(line)) {
        if (currentScene) {
          currentScene.keywords = currentKeywords;
          scenes.push(currentScene);
          currentKeywords = [];
        }
        
        const title = line.replace(/^[一二三四五六七八九十\d]+[\.、]\s*/, '');
        currentScene = {
          id: `scene-${scenes.length + 1}`,
          title,
          keywords: [],
          required: true,
          source: 'chapter-outline',
        };
        
        const nouns = this._extractNouns(title);
        currentKeywords.push(...nouns);
      } else if (line.startsWith('- ') || line.startsWith('• ') || line.startsWith('* ')) {
        const item = line.slice(2).trim();
        if (item) {
          currentKeywords.push(item);
          const nouns = this._extractNouns(item);
          currentKeywords.push(...nouns);
        }
      }
    }

    if (currentScene) {
      currentScene.keywords = [...new Set(currentKeywords)].slice(0, 10);
      scenes.push(currentScene);
    }

    return scenes;
  }

  private _extractNouns(text: string): string[] {
    const results: string[] = [];
    const re = /[\u4e00-\u9fa5]{2,6}/g;
    let match: RegExpExecArray | null;
    while ((match = re.exec(text)) !== null) {
      const word = match[0];
      if (!/[的地得着了过是在有和与及]/g.test(word) && word.length >= 2) {
        results.push(word);
      }
    }
    return [...new Set(results)].slice(0, 5);
  }
}
