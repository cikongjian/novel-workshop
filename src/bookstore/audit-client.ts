import type { AuditResultDetail, ViolationType } from './types.js';

/**
 * 内容审核客户端接口
 */
export interface AuditClient {
  readonly providerId: string;
  /**
   * 审核文本内容
   * @param content 待审核的文本内容
   * @returns 审核结果
   */
  auditText(content: string): Promise<AuditResultDetail>;

  /**
   * 批量审核文本内容
   * @param contents 待审核的文本内容数组
   * @returns 审核结果数组
   */
  auditTextBatch(contents: string[]): Promise<AuditResultDetail[]>;
}

/**
 * 审核配置
 */
export interface AuditConfig {
  provider: string;
  apiKey: string;
  secretKey?: string;
  region?: string;
  passThreshold: number;    // 通过阈值（置信度 < 此值自动通过）
  blockThreshold: number;   // 拒绝阈值（置信度 > 此值自动拒绝）
}

/**
 * 本地关键词审核客户端
 */
class LocalKeywordAuditClient implements AuditClient {
  readonly providerId = 'keyword';
  private config: AuditConfig;

  constructor(config: AuditConfig) {
    this.config = config;
  }

  async auditText(content: string): Promise<AuditResultDetail> {
    const violations = this.detectViolations(content);
    const overallScore = violations.length > 0
      ? Math.max(...violations.map(v => v.confidence))
      : 0;

    let suggestion: 'pass' | 'review' | 'block';
    if (overallScore < this.config.passThreshold) {
      suggestion = 'pass';
    } else if (overallScore < this.config.blockThreshold) {
      suggestion = 'review';
    } else {
      suggestion = 'block';
    }

    return {
      violations,
      overallScore,
      suggestion,
    };
  }

  async auditTextBatch(contents: string[]): Promise<AuditResultDetail[]> {
    // 批量审核
    return Promise.all(contents.map(content => this.auditText(content)));
  }

  private detectViolations(content: string): Array<{
    type: ViolationType;
    confidence: number;
    position: { start: number; end: number };
    keyword?: string;
    context: string;
  }> {
    const violations: Array<{
      type: ViolationType;
      confidence: number;
      position: { start: number; end: number };
      keyword?: string;
      context: string;
    }> = [];

    const patterns = [
      { type: 'porn' as ViolationType, keywords: ['色情', '黄色', '裸体'], confidence: 85 },
      { type: 'violence' as ViolationType, keywords: ['暴力', '杀人', '血腥'], confidence: 80 },
      { type: 'politics' as ViolationType, keywords: ['政治敏感词'], confidence: 90 },
      { type: 'ad' as ViolationType, keywords: ['广告', '微信', 'QQ'], confidence: 70 },
    ];

    for (const pattern of patterns) {
      for (const keyword of pattern.keywords) {
        const index = content.indexOf(keyword);
        if (index !== -1) {
          const start = Math.max(0, index - 20);
          const end = Math.min(content.length, index + keyword.length + 20);
          violations.push({
            type: pattern.type,
            confidence: pattern.confidence,
            position: { start: index, end: index + keyword.length },
            keyword,
            context: content.substring(start, end),
          });
        }
      }
    }

    return violations;
  }
}

/**
 * 未实现的云审核 provider。
 * 对公网场景必须 fail-safe，禁止再出现“伪接入但默认通过”。
 */
class UnsupportedAuditProviderClient implements AuditClient {
  readonly providerId: string;
  private readonly providerName: string;
  private readonly config: AuditConfig;

  constructor(providerName: string, config: AuditConfig) {
    this.providerName = providerName;
    this.providerId = providerName;
    this.config = config;
  }

  async auditText(_content: string): Promise<AuditResultDetail> {
    console.warn(`[ContentAudit] Provider "${this.providerName}" is configured but not implemented; forcing manual review.`);
    const overallScore = this.resolveReviewScore();
    return {
      violations: [
        {
          type: 'other',
          confidence: overallScore,
          position: { start: 0, end: 0 },
          keyword: this.providerName,
          context: `内容审核 provider "${this.providerName}" 尚未实现，已强制转人工复核。`,
        },
      ],
      overallScore,
      suggestion: 'review',
    };
  }

  async auditTextBatch(contents: string[]): Promise<AuditResultDetail[]> {
    return Promise.all(contents.map(() => this.auditText('')));
  }

  private resolveReviewScore(): number {
    const reviewFloor = Math.max(this.config.passThreshold, 60);
    const reviewCeiling = this.config.blockThreshold > 0
      ? this.config.blockThreshold - 1
      : reviewFloor;
    if (reviewCeiling >= reviewFloor) {
      return reviewFloor;
    }
    return reviewCeiling > 0 ? reviewCeiling : reviewFloor;
  }
}

/**
 * 创建审核客户端
 */
export function createAuditClient(config: AuditConfig): AuditClient {
  switch (config.provider.toLowerCase()) {
    case 'keyword':
    case 'local':
      return new LocalKeywordAuditClient(config);
    case 'tencent':
    case 'aliyun':
    case 'baidu':
      return new UnsupportedAuditProviderClient(config.provider.toLowerCase(), config);
    default:
      throw new Error(`Unknown audit provider: ${config.provider}`);
  }
}
