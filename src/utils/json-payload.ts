import { jsonrepair } from 'jsonrepair';

export function parseJsonPayload(raw: string): unknown {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error('empty json payload');
  }

  const normalized = trimmed
    .replace(/^\uFEFF/, '')
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2018\u2019]/g, '\'')
    .replace(/,\s*([}\]])/g, '$1')
    .trim();

  const fenced = normalized.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    return parseJsonPayload(fenced[1]);
  }

  try {
    return JSON.parse(normalized);
  } catch {
    // 提取 {...} 或 [...] 后再解析
    const objectStart = normalized.indexOf('{');
    const objectEnd = normalized.lastIndexOf('}');
    if (objectStart !== -1 && objectEnd > objectStart) {
      try {
        return JSON.parse(normalized.slice(objectStart, objectEnd + 1));
      } catch {
        // 继续尝试更激进的修复
      }
    }

    const arrayStart = normalized.indexOf('[');
    const arrayEnd = normalized.lastIndexOf(']');
    if (arrayStart !== -1 && arrayEnd > arrayStart) {
      try {
        return JSON.parse(normalized.slice(arrayStart, arrayEnd + 1));
      } catch {
        // 继续尝试更激进的修复
      }
    }

    // 最后兜底：用 jsonrepair 修复模型返回的常见 JSON 错误
    // （缺逗号、未转义引号、截断、单引号、注释等），LLM 生成长 JSON 时偶发
    try {
      return JSON.parse(jsonrepair(normalized));
    } catch {
      throw new Error('invalid json payload');
    }
  }
}
