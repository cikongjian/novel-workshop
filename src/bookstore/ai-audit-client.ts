/**
 * AI 智能内容审核客户端
 *
 * 两阶段审核：
 * 1. 关键词粗筛 — 快速找出疑似违规片段
 * 2. LLM 上下文精判 — 将疑似片段交给 AI，结合叙事语境判断是否真实违规
 *
 * 解决纯关键词方案的误判问题：
 *   「黄色」→ 颜色，不是色情
 *   「杀人」→ 小说情节，不是暴力煽动
 */

import type { ModelClient } from '../models/types.js';
import type { AuditClient } from './audit-client.js';
import type { AuditResultDetail, ViolationType } from './types.js';

// ─── 关键词粗筛规则 ─────────────────────────────────────────────
interface KeywordPattern {
  type: ViolationType;
  keywords: string[];
  baseConfidence: number;
}

const KEYWORD_PATTERNS: KeywordPattern[] = [
  {
    type: 'porn',
    keywords: ['做爱', '性交', '插入', '阴道', '阴茎', '射精', '高潮', '乳房', '裸体', '脱衣', '色情'],
    baseConfidence: 80,
  },
  {
    type: 'violence',
    keywords: ['杀人', '强奸', '砍头', '剁手', '爆头', '开膛', '虐待', '酷刑', '折磨致死'],
    baseConfidence: 70,
  },
  {
    type: 'politics',
    keywords: ['推翻政府', '颠覆国家', '分裂国家', '暴力革命'],
    baseConfidence: 90,
  },
  {
    type: 'ad',
    keywords: ['加我微信', '加我QQ', '私信领取', '扫码领红包', '点击链接'],
    baseConfidence: 75,
  },
];

/** 上下文窗口：关键词前后各取多少字符 */
const CONTEXT_WINDOW = 120;

// ─── 粗筛结果 ────────────────────────────────────────────────────
interface ViolationCandidate {
  index: number;
  type: ViolationType;
  keyword: string;
  position: { start: number; end: number };
  context: string;
  baseConfidence: number;
}

// ─── AI 评估结果 ──────────────────────────────────────────────────
interface AIAssessment {
  index: number;
  isViolation: boolean;
  confidence: number;
  reason: string;
}

interface AIAssessmentResponse {
  assessments: AIAssessment[];
}

// ─── 阈值 ────────────────────────────────────────────────────────
const PASS_THRESHOLD = 60;
const BLOCK_THRESHOLD = 80;

// ─── AI 验证提示词 ────────────────────────────────────────────────
const SYSTEM_PROMPT = `你是专业的中文网络小说内容合规审核员。请判断以下小说内容中的疑似违规点是否构成真实违规。

判断原则：
• 小说叙事中的武打、战争、死亡、复仇等描写属于正常文学表达，不构成"暴力违规"
• 日常词语（黄色、杀气、色彩、暗杀任务等）不因含有敏感字即算违规，必须结合语境
• 构成违规的是：直白的色情露骨性描写、对现实人物的恶意诽谤、政治煽动、商业广告植入
• 给出 0-100 的违规置信度：0=完全不违规，100=严重违规

必须以 JSON 格式回复，格式：
{"assessments":[{"index":0,"isViolation":false,"confidence":0,"reason":"说明"},{"index":1,"isViolation":true,"confidence":85,"reason":"说明"}]}

只输出 JSON，不要有任何其他文字。`;

function buildUserPrompt(candidates: ViolationCandidate[]): string {
  const lines = candidates.map((c, i) =>
    `[${i}] 类型:${c.type} 关键词:「${c.keyword}」\n上下文：…${c.context}…`
  );
  return `以下是疑似违规点（共 ${candidates.length} 处），请逐一判断：\n\n${lines.join('\n\n')}`;
}

function parseAIResponse(raw: string): AIAssessment[] {
  try {
    // 从可能带有 markdown 代码块的响应中提取 JSON
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return [];
    const parsed = JSON.parse(jsonMatch[0]) as AIAssessmentResponse;
    return Array.isArray(parsed.assessments) ? parsed.assessments : [];
  } catch {
    return [];
  }
}

// ─── AiAuditClient ────────────────────────────────────────────────
export class AiAuditClient implements AuditClient {
  readonly providerId = 'ai';
  private modelClient: ModelClient;

  constructor(modelClient: ModelClient) {
    this.modelClient = modelClient;
  }

  async auditText(content: string): Promise<AuditResultDetail> {
    const candidates = this.scanKeywords(content);

    // 无疑似违规直接通过
    if (candidates.length === 0) {
      return { violations: [], overallScore: 0, suggestion: 'pass' };
    }

    // 交给 AI 精判
    const assessments = await this.verifyWithAI(candidates);

    // 合并：仅保留 AI 认定为违规（或高度可疑）的候选项
    const violations = candidates
      .map((c, i) => {
        const assessment = assessments.find(a => a.index === i);
        if (!assessment) {
          // AI 未返回该项评估，保留原置信度但降级
          return { candidate: c, confidence: Math.round(c.baseConfidence * 0.6) };
        }
        return { candidate: c, confidence: assessment.confidence };
      })
      .filter(({ confidence }) => confidence >= PASS_THRESHOLD)
      .map(({ candidate, confidence }) => ({
        type: candidate.type,
        confidence,
        position: candidate.position,
        keyword: candidate.keyword,
        context: candidate.context,
      }));

    const overallScore = violations.length > 0
      ? Math.max(...violations.map(v => v.confidence))
      : 0;

    let suggestion: 'pass' | 'review' | 'block';
    if (overallScore < PASS_THRESHOLD) {
      suggestion = 'pass';
    } else if (overallScore < BLOCK_THRESHOLD) {
      suggestion = 'review';
    } else {
      suggestion = 'block';
    }

    return { violations, overallScore, suggestion };
  }

  async auditTextBatch(contents: string[]): Promise<AuditResultDetail[]> {
    return Promise.all(contents.map(c => this.auditText(c)));
  }

  // ─── 关键词粗筛 ─────────────────────────────────────────────────
  private scanKeywords(content: string): ViolationCandidate[] {
    const candidates: ViolationCandidate[] = [];
    let idx = 0;

    for (const pattern of KEYWORD_PATTERNS) {
      for (const keyword of pattern.keywords) {
        let searchFrom = 0;
        while (true) {
          const pos = content.indexOf(keyword, searchFrom);
          if (pos === -1) break;

          const start = Math.max(0, pos - CONTEXT_WINDOW);
          const end = Math.min(content.length, pos + keyword.length + CONTEXT_WINDOW);

          candidates.push({
            index: idx++,
            type: pattern.type,
            keyword,
            position: { start: pos, end: pos + keyword.length },
            context: content.substring(start, end).replace(/\n+/g, ' '),
            baseConfidence: pattern.baseConfidence,
          });

          searchFrom = pos + keyword.length;
        }
      }
    }

    return candidates;
  }

  // ─── AI 精判 ────────────────────────────────────────────────────
  private async verifyWithAI(candidates: ViolationCandidate[]): Promise<AIAssessment[]> {
    const userPrompt = buildUserPrompt(candidates);
    try {
      const response = await this.modelClient.chat(
        [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        { temperature: 0.1, maxTokens: 1000 },
      );
      return parseAIResponse(response.content);
    } catch {
      // AI 调用失败时退化为关键词置信度（适度降权）
      return candidates.map(c => ({
        index: c.index,
        isViolation: c.baseConfidence >= BLOCK_THRESHOLD,
        confidence: Math.round(c.baseConfidence * 0.7),
        reason: 'AI 验证失败，使用关键词置信度降权结果',
      }));
    }
  }
}
