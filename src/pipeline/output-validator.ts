import type { AgentRole, AgentOutput } from '../agents/types.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('output-validator');

export type ValidationResult = {
  valid: boolean;
  issues: string[];
};

type RoleRule = {
  minLength: number;
  maxLength?: number;
  requiredPatterns?: RegExp[];
  forbiddenPatterns?: RegExp[];
};

const FUTURE_FRAGMENT_WITH_CASEFILE_RE =
  /(?:画面一闪|破碎画面|破碎的画面|零碎画面|未来片段|未来画面|挤进脑海|脑海里闪过).{0,60}(?:账户|账号|流水|报销单|合同|金额|转账|发票号|尾号|监控|会所)/;
const SYSTEM_CASEFILE_LEAP_RE =
  /(?:系统|光幕|面板|倒计时|预警|提示框).{0,80}(?:账户|账号|流水|报销单|合同|金额|转账|发票号|尾号|监控|会所|采购款|空壳公司)/;

const SHADOW_EVIDENCE_FORBIDDEN_PATTERNS = [
  FUTURE_FRAGMENT_WITH_CASEFILE_RE,
  SYSTEM_CASEFILE_LEAP_RE,
];

const ROLE_RULES: Partial<Record<AgentRole, RoleRule>> = {
  writer: {
    minLength: 200,
    forbiddenPatterns: [/^```/, /^\s*$/, ...SHADOW_EVIDENCE_FORBIDDEN_PATTERNS],
  },
  editor: {
    minLength: 200,
    forbiddenPatterns: [/^\s*$/, ...SHADOW_EVIDENCE_FORBIDDEN_PATTERNS],
  },
  outline: {
    minLength: 50,
    forbiddenPatterns: [
      /破碎画面[^\n]{0,40}(账户|采购款|报销单|监控|合同|金额)/,
      /(账户|采购款|报销单|会所|监控|合同|金额).{0,20}(精准反击|反杀|打击|拿捏)/,
    ],
  },
  'opening-supervisor': {
    minLength: 20,
    forbiddenPatterns: [
      /系统(?:信息|标签信息)[^\n]{0,20}(精准反击|打脸|反击)/,
      /破碎画面[^\n]{0,40}(账户|采购款|报销单|监控|合同|金额)/,
    ],
  },
  'world-builder': {
    minLength: 200,
    requiredPatterns: [
      /###\s*正史依据/,
      /###\s*场景环境/,
      /###\s*适用规则/,
      /###\s*势力动态/,
      /###\s*背景知识/,
      /###\s*一致性检查/,
      /###\s*长期知识缺口/,
      /###\s*待确认提案/,
    ],
    forbiddenPatterns: [
      /关键词碎片[^\n]{0,30}(账户|公司名|金额|尾号)/,
      /模糊画面[^\n]{0,40}(采购款|报销单|监控|账户|合同)/,
      /作者心中有数|新增设定建议/,
    ],
  },
  character: {
    minLength: 30,
  },
  reader: {
    minLength: 20,
    requiredPatterns: [/overallScore/i],
  },
};

const GARBLED_PATTERN = /[\x00-\x08\x0E-\x1F]{3,}|(.)\1{20,}/;

function extractReaderJson(content: string): string | null {
  const trimmed = content.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1].trim();
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start >= 0 && end > start) {
    return trimmed.slice(start, end + 1);
  }
  return null;
}

function hasValidReaderScore(content: string): boolean {
  const payload = extractReaderJson(content);
  if (!payload) return false;
  try {
    const parsed = JSON.parse(payload) as { overallScore?: unknown };
    const score = Number(parsed.overallScore);
    return Number.isFinite(score) && score >= 0 && score <= 10;
  } catch {
    return false;
  }
}

export function validateAgentOutput(output: AgentOutput): ValidationResult {
  const issues: string[] = [];
  const content = output.content ?? '';

  // 空输出
  if (!content || content.trim().length === 0) {
    issues.push('输出为空');
    return { valid: false, issues };
  }

  // 乱码检测
  if (GARBLED_PATTERN.test(content)) {
    issues.push('检测到疑似乱码');
  }

  // 角色特定规则
  const rule = ROLE_RULES[output.agentRole];
  if (rule) {
    if (content.length < rule.minLength) {
      issues.push(`输出过短（${content.length} 字，最低 ${rule.minLength}）`);
    }
    if (rule.maxLength && content.length > rule.maxLength) {
      issues.push(`输出过长（${content.length} 字，最高 ${rule.maxLength}）`);
    }
    if (rule.requiredPatterns) {
      for (const pattern of rule.requiredPatterns) {
        if (!pattern.test(content)) {
          issues.push(`缺少必要格式：${pattern.source}`);
        }
      }
    }
    if (rule.forbiddenPatterns) {
      for (const pattern of rule.forbiddenPatterns) {
        if (pattern.test(content)) {
          issues.push(`包含禁止格式：${pattern.source}`);
        }
      }
    }
  }

  if (output.agentRole === 'reader' && !hasValidReaderScore(content)) {
    issues.push('reader 输出必须是可解析 JSON 且包含 0-10 的 overallScore');
  }

  const valid = issues.length === 0;
  if (!valid) {
    log.warn(`Agent "${output.agentRole}" 输出校验失败`, { issues });
  }
  return { valid, issues };
}

export type RetryPolicy = {
  maxRetries: number;
  temperatureIncrement: number;
};

const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxRetries: 2,
  temperatureIncrement: 0.1,
};

export function getRetryPolicy(role: AgentRole): RetryPolicy {
  switch (role) {
    case 'writer':
    case 'editor':
      return { maxRetries: 1, temperatureIncrement: 0.15 };
    case 'reader':
      return { maxRetries: 1, temperatureIncrement: 0.05 };
    default:
      return DEFAULT_RETRY_POLICY;
  }
}

export function buildValidationRetryDirective(
  role: AgentRole,
  issues: string[],
): string {
  const lines = [
    `## ${role} 输出校验回灌（下一轮必须消除）`,
    `- 上一轮输出命中的问题：${issues.join('；')}`,
  ];

  if (role === 'writer' || role === 'editor') {
    lines.push('- 不要复用上一轮触发校验的表达，必须直接改写相关段落，而不是只换同义词。');
    lines.push('- 禁止出现“系统/光幕/预警直接给出账户、流水、合同、金额、监控、会所、采购款、空壳公司”等案卷级细节。');
    lines.push('- 若剧情需要反击，只能保留现场可见的异动、公开反馈和角色当场能观察到的信息。');
    lines.push('- 娱乐圈题材若涉及谈判，只能压成辅戏，主回报必须回到直播、热搜、片场、围观反馈等公开战场。');
  }
  if (role === 'world-builder') {
    lines.push('- 必须完整输出：正史依据、场景环境、适用规则、势力动态、背景知识、一致性检查、长期知识缺口、待确认提案。');
    lines.push('- 只有输入明确给出的内容可以作为正史；信息不足时写“尚未建立”，不得自行补出精确年代、等级数量、势力规模、幕后身份或能力数值。');
    lines.push('- 所有新设定只能放入“待确认提案”，不得混入其他区块。');
  }

  return lines.join('\n');
}
