import type { NovelGenre } from '../types';

export type IdeaKickstartCard = {
  key: string;
  label: string;
  title: string;
  hook: string;
  synopsis: string;
  seedIdea: string;
  protagonist: string;
  world: string;
  conflict: string;
  opening: string;
  whyItCanPop: string;
};

export type IdeaKickstartPayload = {
  ideas: IdeaKickstartCard[];
};

type BuildIdeaPromptParams = {
  title: string;
  genre: NovelGenre;
  synopsis: string;
  seedIdea: string;
};

function trimText(value: unknown, maxLength: number): string {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/\s+\n/g, '\n').slice(0, maxLength);
}

export function normalizeBookTitle(value: string): string {
  return value.replace(/[《》]/g, '').trim();
}

function normalizeIdeaRecord(record: Record<string, unknown>, index: number): IdeaKickstartCard | null {
  const title = normalizeBookTitle(trimText(record.title, 40)).slice(0, 40);
  const synopsis = trimText(record.synopsis, 220);
  const seedIdea = trimText(record.seedIdea, 260);
  if (!title || !synopsis || !seedIdea) return null;

  return {
    key: trimText(record.key, 24) || `idea-${index + 1}`,
    label: trimText(record.label, 12) || `方案 ${index + 1}`,
    title,
    hook: trimText(record.hook, 80),
    synopsis,
    seedIdea,
    protagonist: trimText(record.protagonist, 120),
    world: trimText(record.world, 120),
    conflict: trimText(record.conflict, 120),
    opening: trimText(record.opening, 120),
    whyItCanPop: trimText(record.whyItCanPop, 100),
  };
}

function extractBalancedJsonObjects(text: string): string[] {
  const objects: string[] = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === '{') {
      if (depth === 0) start = i;
      depth += 1;
      continue;
    }

    if (char === '}') {
      if (depth === 0) continue;
      depth -= 1;
      if (depth === 0 && start >= 0) {
        objects.push(text.slice(start, i + 1));
        start = -1;
      }
    }
  }

  return objects;
}

function parseIdeasFromMalformedPayload(raw: string): IdeaKickstartPayload | null {
  const ideasAnchor = raw.indexOf('"ideas"');
  const source = ideasAnchor >= 0 ? raw.slice(ideasAnchor) : raw;
  const objectCandidates = extractBalancedJsonObjects(source);
  if (objectCandidates.length === 0) return null;

  const ideas = objectCandidates
    .map((candidate, index) => {
      try {
        const parsed = JSON.parse(candidate) as Record<string, unknown>;
        return normalizeIdeaRecord(parsed, index);
      } catch {
        return null;
      }
    })
    .filter((item): item is IdeaKickstartCard => Boolean(item))
    .slice(0, 3);

  if (ideas.length === 0) return null;
  return { ideas };
}

function buildFallbackSeed(params: BuildIdeaPromptParams): string {
  const parts = [
    params.title.trim() ? `标题倾向：${params.title.trim()}` : '',
    params.synopsis.trim() ? `已有简介：${params.synopsis.trim()}` : '',
    params.seedIdea.trim() ? `已有想法：${params.seedIdea.trim()}` : '',
  ].filter(Boolean);

  if (parts.length > 0) return parts.join('\n');
  return '请直接给出适合当前题材、开局就有钩子、适合网文连载的原创脑洞。';
}

export function buildIdeaKickstartPrompt(params: BuildIdeaPromptParams): string {
  const reference = buildFallbackSeed(params);

  return [
    '你是资深网文策划编辑，擅长把一句话灵感扩成可直接开书的项目。',
    '请基于用户提供的信息，输出 3 套差异化脑洞方案，并帮用户补齐初始故事设定。',
    '必须只返回 JSON，不要任何解释，不要 Markdown 代码块。',
    '',
    '输出格式：',
    '{',
    '  "ideas": [',
    '    {',
    '      "key": "idea-1",',
    '      "label": "方案标签，6字内",',
    '      "title": "书名候选，最多18字",',
    '      "hook": "一句话爆点，20-40字",',
    '      "synopsis": "作品简介，100-180字",',
    '      "seedIdea": "开书提示，120-220字，必须写清题材、主角、目标、核心冲突、爽点或悬念",',
    '      "protagonist": "主角设定，40-80字",',
    '      "world": "世界/背景设定，40-80字",',
    '      "conflict": "核心冲突，40-80字",',
    '      "opening": "开篇驱动事件，40-80字",',
    '      "whyItCanPop": "这套脑洞为什么容易出爆点，30-60字"',
    '    }',
    '  ]',
    '}',
    '',
    '要求：',
    '1. 三套方案要明显不同，分别偏向：爆点开局 / 人设反差 / 长线悬念。',
    '2. 必须保留并放大用户已给出的核心元素，不要完全改题。',
    '3. 所有方案都要适合移动端作者快速开书，信息密度高，避免空话。',
    '4. 如果用户信息很少，就按题材补出最容易连载的设定。',
    '5. 标题、简介、开书提示都要能直接拿去创建项目。',
    '6. title 字段只写书名本身，不要添加《》、书名号、引号或其他包裹符号。',
    '7. 角色命名必须原创且有辨识度，严禁使用林默、叶辰、萧炎、陈平安等网文高频主角名，三套方案的主角姓名也不能雷同。',
    '',
    `题材：${params.genre}`,
    '用户已有信息：',
    reference,
  ].join('\n');
}

export function parseIdeaKickstartPayload(raw: string): IdeaKickstartPayload | null {
  const text = raw.trim();
  if (!text) return null;

  const candidates: string[] = [text];
  const codeBlock = text.match(/```json\s*([\s\S]*?)```/i) ?? text.match(/```\s*([\s\S]*?)```/i);
  if (codeBlock?.[1]) {
    candidates.push(codeBlock[1].trim());
  }

  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    candidates.push(text.slice(firstBrace, lastBrace + 1));
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as { ideas?: unknown };
      const ideas = Array.isArray(parsed.ideas) ? parsed.ideas : [];
      const normalized = ideas
        .map((item, index): IdeaKickstartCard | null => {
          if (!item || typeof item !== 'object') return null;
          return normalizeIdeaRecord(item as Record<string, unknown>, index);
        })
        .filter((item): item is IdeaKickstartCard => Boolean(item))
        .slice(0, 3);

      if (normalized.length > 0) {
        return { ideas: normalized };
      }
    } catch {
      // Ignore parse failure and continue trying other candidates.
    }
  }

  return parseIdeasFromMalformedPayload(text);
}
