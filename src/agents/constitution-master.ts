import type { AgentRole, AgentContext, AgentOutput } from './types.js';
import type { ModelClient, ModelCallOptions, StreamCallback } from '../models/types.js';
import { BaseAgent } from './base-agent.js';
import { NovelConstitution, ConstitutionClause } from '../novel/constitution-types.js';
import { randomUUID } from 'node:crypto';
import { createHash } from 'node:crypto';
import { createLogger } from '../utils/logger.js';
import {
  RITUAL_MECHANIC_DRIFT_KEYWORDS,
  WAR_STATECRAFT_PAYOFF_KEYWORDS,
  WAR_STATECRAFT_SCENE_KEYWORDS,
} from '../pipeline/domain-drift-keywords.js';
import { getPrimaryTopicProfile, inferTopicProfiles } from '../pipeline/topic-profiles.js';

const log = createLogger('constitution-master');

/**
 * 宪章大师 Agent
 * 根据小说题材、标题、简介、标签自动生成结构化的小说宪章。
 * 宪章同时驱动 Agent 提示词注入和门禁确定性检测。
 */
export class ConstitutionMasterAgent extends BaseAgent {
  readonly role: AgentRole = 'constitution-master';
  readonly name = '宪章大师';
  readonly description = '根据小说题材和卖点生成结构化创作宪章';

  protected getModelOptions(_context?: AgentContext): ModelCallOptions {
    return { temperature: 0.4, maxTokens: 4096 };
  }

  protected buildUserMessage(context: AgentContext): string {
    const parts: string[] = [];
    parts.push(`书名：${context.novelTitle}`);
    parts.push(`题材：${context.genre}`);
    if (context.novelSynopsis) {
      parts.push(`简介：${context.novelSynopsis}`);
    }
    if (context.novelTags?.length) {
      parts.push(`标签：${context.novelTags.join('、')}`);
    }
    if (context.constitutionTags?.length) {
      parts.push(`宪章标签：${context.constitutionTags.join('、')}`);
    }
    parts.push('');
    parts.push('请根据以上信息生成小说宪章，严格按照系统提示词中的 JSON 格式输出。');
    return parts.join('\n');
  }

  /**
   * 生成宪章的高层入口。
   * 调用 LLM 生成 JSON，解析并校验后返回 NovelConstitution。
   */
  async generateConstitution(
    context: AgentContext,
    model: ModelClient,
    signal?: AbortSignal,
  ): Promise<NovelConstitution> {
    const output = await this.execute(context, model, undefined, signal);
    return this.parseConstitutionOutput(output, context);
  }

  private parseConstitutionOutput(output: AgentOutput, context: AgentContext): NovelConstitution {
    const raw = output.content;
    // 提取 JSON 块（兼容 ```json ... ``` 包裹）
    const jsonMatch = raw.match(/```json\s*([\s\S]*?)```/) ?? raw.match(/(\{[\s\S]*\})/);
    if (!jsonMatch?.[1]) {
      log.warn('宪章大师输出无法提取 JSON，使用 fallback', { raw: raw.slice(0, 200) });
      return this.buildFallbackConstitution(context);
    }

    try {
      const parsed = JSON.parse(jsonMatch[1]);
      const now = new Date().toISOString();
      const clauses: ConstitutionClause[] = (parsed.clauses ?? []).map((c: Record<string, unknown>) => ({
        id: randomUUID(),
        category: c.category ?? 'core-promise',
        title: String(c.title ?? ''),
        content: String(c.content ?? ''),
        rationale: String(c.rationale ?? ''),
        priority: c.priority ?? 'high',
        userEdited: false,
      }));

      const constitution: NovelConstitution = {
        version: 1,
        sourceDigest: this.computeSourceDigest(context),
        mainPromise: String(parsed.mainPromise ?? ''),
        secondaryPromises: Array.isArray(parsed.secondaryPromises) ? parsed.secondaryPromises.map(String) : [],
        clauses,
        keywords: {
          payoffKeywords: toStringArray(parsed.keywords?.payoffKeywords),
          sceneKeywords: toStringArray(parsed.keywords?.sceneKeywords),
          suspenseDriftKeywords: toStringArray(parsed.keywords?.suspenseDriftKeywords),
          maxSuspenseShare: clamp(Number(parsed.keywords?.maxSuspenseShare ?? 0.5), 0, 1),
        },
        generatedAt: now,
        updatedAt: now,
      };

      // Zod 校验
      const result = NovelConstitution.safeParse(constitution);
      if (!result.success) {
        log.warn('宪章 Zod 校验失败，使用 fallback', { errors: result.error.issues.slice(0, 3) });
        return this.buildFallbackConstitution(context);
      }
      return this.normalizeConstitution(result.data, context);
    } catch (err) {
      log.warn('宪章 JSON 解析失败，使用 fallback', { error: err instanceof Error ? err.message : String(err) });
      return this.buildFallbackConstitution(context);
    }
  }

  private buildFallbackConstitution(context: AgentContext): NovelConstitution {
    const now = new Date().toISOString();
    const inferred = this.inferFallbackProfile(context);
    return {
      version: 1,
      sourceDigest: this.computeSourceDigest(context),
      mainPromise: inferred.mainPromise,
      secondaryPromises: inferred.secondaryPromises,
      clauses: inferred.clauses,
      keywords: inferred.keywords,
      generatedAt: now,
      updatedAt: now,
    };
  }

  private normalizeConstitution(
    constitution: NovelConstitution,
    context: AgentContext,
  ): NovelConstitution {
    const inferred = this.inferFallbackProfile(context);
    return {
      ...constitution,
      mainPromise: constitution.mainPromise || inferred.mainPromise,
      secondaryPromises: mergeUnique([...constitution.secondaryPromises, ...inferred.secondaryPromises]),
      clauses: constitution.clauses.length > 0 ? constitution.clauses : inferred.clauses,
      keywords: {
        payoffKeywords: constitution.keywords.payoffKeywords.length > 0
          ? mergeUnique([...constitution.keywords.payoffKeywords, ...inferred.keywords.payoffKeywords])
          : inferred.keywords.payoffKeywords,
        sceneKeywords: constitution.keywords.sceneKeywords.length > 0
          ? mergeUnique([...constitution.keywords.sceneKeywords, ...inferred.keywords.sceneKeywords])
          : inferred.keywords.sceneKeywords,
        suspenseDriftKeywords: mergeUnique([
          ...constitution.keywords.suspenseDriftKeywords,
          ...inferred.keywords.suspenseDriftKeywords,
        ]),
        maxSuspenseShare: Math.min(
          constitution.keywords.maxSuspenseShare,
          inferred.keywords.maxSuspenseShare,
        ),
      },
      updatedAt: new Date().toISOString(),
    };
  }

  private inferFallbackProfile(context: AgentContext): Omit<NovelConstitution, 'version' | 'sourceDigest' | 'generatedAt' | 'updatedAt'> {
    const haystack = [
      context.novelTitle,
      context.genre,
      context.novelSynopsis,
      ...(context.novelTags ?? []),
      ...(context.constitutionTags ?? []),
    ].join('\n');

    if (/(战争|争霸|架空历史|架空|天朝|残兵|攻城|破城|军功爵|废奴|科举|国子监|旧贵族|兵权|军令|军营|战场|诸侯|王朝|权谋)/.test(haystack)) {
      return {
        mainPromise: '战争征服、权谋博弈与政权建设',
        secondaryPromises: ['攻城练兵', '制度落地', '旧贵族反扑'],
        clauses: [
          createClause('core-promise', '先兑现战争/建国主回报', '每章主回报必须落在攻城、收编、兵权、军令、废奴政令、军功爵、科举/国子监或旧贵族反扑上，不得让神秘遗迹抢主线。'),
          createClause('scene-mandate', '主场景必须军政可见', '优先落在战场、城门、军营、朝堂、府衙、校场、粮道、国子监等军政场景。'),
          createClause('anti-drift', '禁止祭坛钥匙化', '祭坛、坐标、钥匙、碎片、第三门、封印、传送只能作为背景压力，不能替代战争推进、权力格局变化和制度落地。'),
        ],
        keywords: {
          payoffKeywords: WAR_STATECRAFT_PAYOFF_KEYWORDS,
          sceneKeywords: WAR_STATECRAFT_SCENE_KEYWORDS,
          suspenseDriftKeywords: RITUAL_MECHANIC_DRIFT_KEYWORDS,
          maxSuspenseShare: 0.28,
        },
      };
    }

    if (/(塌房预警|塌房|预警者|预警系统|爆红|避雷|截胡)/.test(haystack) && /(娱乐圈|顶流|影帝|试镜|热搜|剧组)/.test(haystack)) {
      return {
        mainPromise: '塌房预警驱动的娱乐圈翻红与资源截胡',
        secondaryPromises: ['公开预警', '避雷截胡', '直播起量'],
        clauses: [
          createClause('core-promise', '主回报必须是预警换收益', '系统给的是预警权和抢跑权，本章主回报必须落成公开预警、避雷成功、资源截胡或翻红起量，不能只写知道了谁要塌房。'),
          createClause('payoff-rhythm', '前三章必须出现公开收益', '前三章至少一次把预警直接转成热搜、直播声量、试镜资源、商务避雷或角色反抢。'),
          createClause('scene-mandate', '优先落在公开战场', '优先写试镜、直播、热搜、录制现场、广告牌、发布会等公开场景，不要长期停在私下查证。'),
          createClause('anti-drift', '禁止写成黑料侦探文', '不能用深挖黑料、跟踪取证、偷拍视频、蹲守查证替代公开预警和流量博弈。'),
        ],
        keywords: {
          payoffKeywords: ['预警', '避雷', '截胡', '翻红', '爆红', '直播', '热搜', '资源反抢'],
          sceneKeywords: ['直播', '热搜', '录制现场', '试镜', '片场', '广告牌'],
          suspenseDriftKeywords: ['真相', '秘密', '线索', '调查', '监控', '匿名', '幕后', '谜团', '证据', '查证', '深挖', '取证', '跟拍', '偷拍视频', '蹲守'],
          maxSuspenseShare: 0.28,
        },
      };
    }

    if (/(娱乐圈|影帝|顶流|试镜|热搜|剧组|番位|综艺|经纪人)/.test(haystack)) {
      return {
        mainPromise: '娱乐圈逆袭与资源反抢',
        secondaryPromises: ['试镜翻盘', '热搜起爆', '站队变化'],
        clauses: [
          createClause('core-promise', '先兑现娱乐圈主回报', '每章优先兑现试镜输赢、资源归属、热搜涨跌、站队变化，不要让调查线占主位。'),
          createClause('payoff-rhythm', '冷启动阶段必须出结果', '前三章至少一次让主角拿到角色、资源、热搜、商务或站队变化中的一种可见结果。'),
          createClause('scene-mandate', '主场景必须公开可见', '优先落在试镜间、片场、节目组、直播、后台、评论区这些娱乐圈主场景。'),
          createClause('anti-drift', '黑幕只能做辅线', '黑幕和秘密只能服务娱乐圈资源争夺，不能把正文写成查幕后。'),
        ],
        keywords: {
          payoffKeywords: ['试镜', '角色', '热搜', '资源', '站队', '翻红', '通告', '番位'],
          sceneKeywords: ['试镜间', '片场', '导演组', '节目组', '直播', '后台'],
          suspenseDriftKeywords: ['真相', '秘密', '线索', '调查', '监控', '匿名', '幕后', '谜团', '证据'],
          maxSuspenseShare: 0.38,
        },
      };
    }

    if (/(羞耻系统|社死系统|羞耻|社死)/.test(haystack)) {
      return {
        mainPromise: '羞耻任务驱动的社死喜剧',
        secondaryPromises: ['任务惩罚', '围观反应', '关系翻车或升温'],
        clauses: [
          createClause('core-promise', '先交社死回报', '每章主回报必须是任务触发、社死现场、惩罚升级或围观反应，不要先研究系统来源。'),
          createClause('anti-drift', '系统谜团不能压过喜剧', '系统来源和幕后只能做调味，不能替代任务执行和公开处刑。'),
        ],
        keywords: {
          payoffKeywords: ['任务', '惩罚', '羞耻', '社死', '围观', '翻车', '奖励'],
          sceneKeywords: ['现场', '大厅', '教室', '办公室', '弹幕', '围观'],
          suspenseDriftKeywords: ['真相', '秘密', '调查', '来源', '幕后', '线索'],
          maxSuspenseShare: 0.32,
        },
      };
    }

    const topicProfile = getPrimaryTopicProfile(inferTopicProfiles({
      genre: context.genre,
      novelTitle: context.novelTitle,
      novelSynopsis: context.novelSynopsis,
      novelTags: context.novelTags,
      constitutionTags: context.constitutionTags,
    }));
    if (topicProfile) {
      return {
        mainPromise: topicProfile.directionHint,
        secondaryPromises: topicProfile.preferredEndingFocus ?? ['题材主场景', '可见回报', '章末追读点'],
        clauses: [
          createClause('core-promise', '先兑现题材主回报', topicProfile.directionHint),
          createClause('scene-mandate', '主场景必须可见', `优先落在这些题材场景：${topicProfile.requiredSceneKeywords.slice(0, 8).join('、')}。`),
          createClause('payoff-rhythm', '每章要有可见结果', topicProfile.payoffHint ?? '本章必须把题材动作转成可见结果，不要只铺设信息。'),
          createClause('anti-drift', '禁止偏离题材画像', topicProfile.antiDriftHint ?? '悬疑、秘密和来源只能做辅因，不能替代题材主回报。'),
        ],
        keywords: {
          payoffKeywords: topicProfile.requiredPayoffKeywords,
          sceneKeywords: topicProfile.requiredSceneKeywords,
          suspenseDriftKeywords: topicProfile.suspenseDriftKeywords ?? ['真相', '秘密', '线索', '调查', '监控', '匿名', '幕后', '来源'],
          maxSuspenseShare: topicProfile.maxSuspenseShare,
        },
      };
    }

    return {
      mainPromise: `${context.novelTitle} — 题材核心卖点兑现`,
      secondaryPromises: ['可见回报', '题材主场景', '章末追读点'],
      clauses: [
        createClause('core-promise', '优先兑现题材卖点', '每章必须优先兑现书名和简介承诺的核心幻想，不要让悬疑/解谜抢走主位。'),
        createClause('anti-drift', '防止悬疑漂移', '如果章节前半段的秘密、真相、调查词明显多于题材卖点词，说明已经偏题。'),
      ],
      keywords: {
        payoffKeywords: [],
        sceneKeywords: [],
        suspenseDriftKeywords: ['真相', '秘密', '线索', '调查', '监控', '匿名', '幕后', '谜团', '证据'],
        maxSuspenseShare: 0.5,
      },
    };
  }

  computeSourceDigest(context: AgentContext): string {
    const input = [
      context.novelTitle,
      context.genre,
      context.novelSynopsis,
      ...(context.novelTags ?? []),
      ...(context.constitutionTags ?? []),
    ].join('|');
    return createHash('sha256').update(input).digest('hex').slice(0, 16);
  }
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function createClause(
  category: ConstitutionClause['category'],
  title: string,
  content: string,
): ConstitutionClause {
  return {
    id: randomUUID(),
    category,
    title,
    content,
    rationale: '规则回填生成',
    priority: 'high',
    userEdited: false,
  };
}

function mergeUnique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}
