/**
 * 尝试解析可能被截断的 JSON，自动修复缺失的括号
 */
export function parseJsonWithRepair<T = unknown>(jsonStr: string): T | null {
  // Clean markdown code fences
  const clean = jsonStr.replace(/^```json?\s*/i, '').replace(/\s*```\s*$/, '');

  try {
    return JSON.parse(clean) as T;
  } catch {
    // Try to repair truncated JSON
    let repaired = clean;
    const opens = (repaired.match(/[{[]/g) || []).length;
    const closes = (repaired.match(/[}\]]/g) || []).length;
    // Remove incomplete trailing key-value pair
    repaired = repaired.replace(/,\s*"[^"]*"?\s*:?\s*[^}\]]*$/, '');
    for (let i = 0; i < opens - closes; i++) {
      repaired += repaired.lastIndexOf('[') > repaired.lastIndexOf('{') ? ']' : '}';
    }
    try {
      return JSON.parse(repaired) as T;
    } catch {
      return null;
    }
  }
}
