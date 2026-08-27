/**
 * 知识图谱 —— 角色间信息/秘密传播追踪
 *
 * 记录"谁知道什么"以及"如何得知"，用于检测信息一致性和生成戏剧性冲突。
 */

// ==================== 常量 ====================

const SECRET_ID_PREFIX = 'secret-';
const MIN_CONFIDENCE = 0;
const MAX_CONFIDENCE = 1;

// ==================== 类型 ====================

/** 知识传播方式 */
export type KnowledgeMethod = 'told' | 'overheard' | 'discovered' | 'inferred' | 'witnessed';

/** 一次知识传播事件 */
export interface KnowledgeEvent {
  /** 秘密唯一标识 */
  secretId: string;
  /** 秘密内容 */
  secretContent: string;
  /** 传播来源角色 */
  from: string;
  /** 接收知识的角色 */
  to: string;
  /** 发生章节 */
  chapter: number;
  /** 传播方式 */
  method: KnowledgeMethod;
  /** 信心度 0-1 */
  confidence: number;
  /** 传播过程中信息的扭曲描述（可选） */
  distortion?: string;
}

/** 角色持有的一条知识 */
export interface KnowledgeItem {
  /** 秘密唯一标识 */
  secretId: string;
  /** 秘密内容 */
  content: string;
  /** 获知章节 */
  learnedAt: number;
  /** 获知方式 */
  method: KnowledgeMethod;
  /** 信心度 0-1 */
  confidence: number;
  /** 传播过程中的信息扭曲（可选） */
  distortion?: string;
}

/** 两个角色之间的知识差距 */
export interface KnowledgeGap {
  /** charA 知道但 charB 不知道的知识 */
  aKnowsBDoesnt: KnowledgeItem[];
  /** charB 知道但 charA 不知道的知识 */
  bKnowsADoesnt: KnowledgeItem[];
}

/** 序列化格式 */
export interface KnowledgeGraphJSON {
  holders: Record<string, string[]>;
  events: KnowledgeEvent[];
  secrets: Record<string, string>;
  nextSecretNum: number;
}

// ==================== 核心类 ====================

export class KnowledgeGraph {
  /** secretId -> 持有该秘密的角色名集合 */
  private holders: Map<string, Set<string>>;
  /** 所有传播事件 */
  private events: KnowledgeEvent[];
  /** secretId -> 秘密内容 */
  private secrets: Map<string, string>;
  /** 下一个秘密编号（用于生成 secretId） */
  private nextSecretNum: number;

  constructor() {
    this.holders = new Map();
    this.events = [];
    this.secrets = new Map();
    this.nextSecretNum = 1;
  }

  /**
   * 注册一个新秘密，由指定角色首先持有。
   * @returns 生成的 secretId
   */
  addSecret(characterName: string, content: string, chapter: number): string {
    const secretId = `${SECRET_ID_PREFIX}${this.nextSecretNum++}`;
    this.secrets.set(secretId, content);

    const holderSet = new Set<string>();
    holderSet.add(characterName);
    this.holders.set(secretId, holderSet);

    // 记录初始获知事件（来源和目标均为同一人，method 标记为 discovered）
    this.events.push({
      secretId,
      secretContent: content,
      from: characterName,
      to: characterName,
      chapter,
      method: 'discovered',
      confidence: MAX_CONFIDENCE,
    });

    return secretId;
  }

  /**
   * 将知识从一个角色传播给另一个角色。
   * @throws 当 secretId 不存在时抛出错误
   */
  propagate(event: KnowledgeEvent): void {
    if (!this.secrets.has(event.secretId)) {
      throw new Error(`Unknown secretId: ${event.secretId}`);
    }

    const clampedConfidence = Math.max(MIN_CONFIDENCE, Math.min(MAX_CONFIDENCE, event.confidence));
    const normalizedEvent: KnowledgeEvent = { ...event, confidence: clampedConfidence };

    this.events.push(normalizedEvent);

    let holderSet = this.holders.get(event.secretId);
    if (!holderSet) {
      holderSet = new Set();
      this.holders.set(event.secretId, holderSet);
    }
    holderSet.add(event.to);
  }

  /** 查询某个秘密被哪些角色持有 */
  whoKnows(secretId: string): string[] {
    const holderSet = this.holders.get(secretId);
    if (!holderSet) return [];
    return [...holderSet];
  }

  /**
   * 查询某角色知道的所有知识。
   *
   * 对每个秘密，找到该角色作为接收者的最新事件以获取 method / confidence / distortion。
   */
  whatDoesCharKnow(characterName: string): KnowledgeItem[] {
    const items: KnowledgeItem[] = [];

    for (const [secretId, holderSet] of this.holders) {
      if (!holderSet.has(characterName)) continue;

      const content = this.secrets.get(secretId) ?? '';

      // 从后往前找最新的、以该角色为接收者的事件
      let latestEvent: KnowledgeEvent | undefined;
      for (let i = this.events.length - 1; i >= 0; i--) {
        const ev = this.events[i]!;
        if (ev.secretId === secretId && ev.to === characterName) {
          latestEvent = ev;
          break;
        }
      }

      items.push({
        secretId,
        content,
        learnedAt: latestEvent?.chapter ?? 0,
        method: latestEvent?.method ?? 'discovered',
        confidence: latestEvent?.confidence ?? MAX_CONFIDENCE,
        distortion: latestEvent?.distortion,
      });
    }

    return items;
  }

  /** 获取两个角色之间的知识差距 */
  getKnowledgeGap(charA: string, charB: string): KnowledgeGap {
    const aKnowledge = this.whatDoesCharKnow(charA);
    const bKnowledge = this.whatDoesCharKnow(charB);

    const aSecretIds = new Set(aKnowledge.map(k => k.secretId));
    const bSecretIds = new Set(bKnowledge.map(k => k.secretId));

    const aKnowsBDoesnt = aKnowledge.filter(k => !bSecretIds.has(k.secretId));
    const bKnowsADoesnt = bKnowledge.filter(k => !aSecretIds.has(k.secretId));

    return { aKnowsBDoesnt, bKnowsADoesnt };
  }

  /** 获取所有传播事件（只读副本） */
  getEvents(): KnowledgeEvent[] {
    return [...this.events];
  }

  /** 获取所有秘密（只读副本） */
  getSecrets(): Map<string, string> {
    return new Map(this.secrets);
  }

  // ==================== 序列化 ====================

  toJSON(): KnowledgeGraphJSON {
    const holdersRecord: Record<string, string[]> = {};
    for (const [secretId, holderSet] of this.holders) {
      holdersRecord[secretId] = [...holderSet];
    }

    const secretsRecord: Record<string, string> = {};
    for (const [secretId, content] of this.secrets) {
      secretsRecord[secretId] = content;
    }

    return {
      holders: holdersRecord,
      events: [...this.events],
      secrets: secretsRecord,
      nextSecretNum: this.nextSecretNum,
    };
  }

  static fromJSON(data: Partial<KnowledgeGraphJSON>): KnowledgeGraph {
    const graph = new KnowledgeGraph();

    if (data.secrets) {
      for (const [id, content] of Object.entries(data.secrets)) {
        graph.secrets.set(id, content);
      }
    }

    if (data.holders) {
      for (const [secretId, names] of Object.entries(data.holders)) {
        graph.holders.set(secretId, new Set(names));
      }
    }

    if (data.events) {
      graph.events = [...data.events];
    }

    graph.nextSecretNum = data.nextSecretNum ?? 1;

    return graph;
  }
}
