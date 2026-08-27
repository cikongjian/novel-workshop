/**
 * Editor 输出解析器 — 从 chapter-pipeline.ts 的 ChapterPipeline.parseEditorOutput 静态方法提取。
 *
 * 负责将 Editor Agent 的原始输出拆分为：润色正文 / 编辑批注 / 章末状态更新 / 建议标题，
 * 并清理 AI 意外注入的元数据行和写作指令行。
 */

/**
 * 过滤正文中可能出现的"小标题"残留。
 * 当 editor 在正文中写下"# 第N章"或"## 标题"时，它们会被误识别为标题，
 * 这里在 parse 阶段把它们从 polishedText 中剥离。
 */
function stripInlineHeadingFromPolished(text: string): string {
  const lines = text.split(/\r?\n/);
  const kept: string[] = [];
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      kept.push(rawLine);
      continue;
    }
    // 匹配开头的 # / ## / ### 标题（包含"第N章"或纯短句）
    const headingMatch = line.match(/^#{1,6}\s+(.+?)\s*$/);
    if (headingMatch) {
      const headingText = headingMatch[1].trim();
      // 仅剥离"第N章"或"## 标题"型小标题，正文不会以 # 开头
      if (/^第\s*\d+\s*章([：:、\s].*)?$/u.test(headingText)) {
        continue;
      }
    }
    kept.push(rawLine);
  }
  return kept.join('\n').trim();
}

export function parseEditorOutput(raw: string): { polishedText: string; editorNotes: string; statusUpdate: string; suggestedTitle: string } {
  let text = raw;
  let editorNotes = '';
  let statusUpdate = '';
  let suggestedTitle = '';

  // 1. 处理 ---EDITOR_NOTES--- 分隔符
  const separatorIdx = text.indexOf('---EDITOR_NOTES---');
  if (separatorIdx !== -1) {
    editorNotes = text.slice(separatorIdx + '---EDITOR_NOTES---'.length).trim();
    text = text.slice(0, separatorIdx).trim();
  }

  // 2. 处理 "修改说明" 标题
  const notesMatch = text.match(/\n#{1,3}\s*修改说明\s*\n/);
  if (notesMatch && notesMatch.index !== undefined) {
    if (!editorNotes) editorNotes = text.slice(notesMatch.index).trim();
    text = text.slice(0, notesMatch.index).trim();
  }

  // 3. 处理 "润色后的正文" 标题
  const polishedMatch = text.match(/#{1,3}\s*润色后的正文\s*\n/);
  if (polishedMatch && polishedMatch.index !== undefined) {
    const textStart = polishedMatch.index + polishedMatch[0].length;
    const nextHeading = text.slice(textStart).match(/\n#{1,3}\s/);
    if (nextHeading && nextHeading.index !== undefined) {
      if (!editorNotes) editorNotes = text.slice(textStart + nextHeading.index).trim();
      text = text.slice(textStart, textStart + nextHeading.index).trim();
    } else {
      text = text.slice(textStart).trim();
    }
  }

  // 4. 提取并移除 AI 添加的元数据块（章末状态更新等）
  // 这些内容不应该出现在正文中，但保存到 statusUpdate 供下一章参考
  const metadataPatterns = [
    // 章末状态更新块（提取整个块）
    /\n*---+\s*\n*(\*{0,2}章末状态更新\*{0,2}[\s\S]*?)$/i,
    // 末尾的分隔线和后续内容
    /\n*---+\s*\n*((?:#{1,3}\s*)?(?:状态|更新|总结)[\s\S]*?)$/i,
  ];

  for (const pattern of metadataPatterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      statusUpdate = match[1].trim();
      text = text.replace(pattern, '');
      break; // 只提取一次
    }
  }

  // 4.1 提取并移除正文中的"状态备注行"（常见为整行加粗的数值/等级变化提示）
  // 例如：**军心稳定度-15。** / **威胁等级：极高。**
  // 这些内容不应出现在正文中，移入 statusUpdate 供后续参考。
  const extractedInlineMeta = new Set<string>();
  const inlineMetaKeywords = /等级|稳定度|好感度|忠诚度|声望|军心|威胁|秘密|风险|收益|危机|状态|数值|触发|提示/;
  const inlineMetaLevelHint = /[：:]\s*(?:极高|很高|高|中|低|未知)/;
  const inlineMetaDelta = /[+-]\s*\d+/;

  const lines = text.split(/\r?\n/);
  const keptLines: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      keptLines.push(line);
      continue;
    }

    const boldLine = trimmed.match(/^(?:[-*]\s*)?\*{2}\s*(.+?)\s*\*{2}\s*$/);
    if (!boldLine) {
      keptLines.push(line);
      continue;
    }

    const inner = boldLine[1]?.trim() ?? '';
    // AI 写作指令/结构提示关键词（如"**目标建立：……**"、"**阻力升级：……**"）
    const isWritingDirective = Boolean(inner)
      && /[：:]/.test(inner)
      && /目标建立|阻力升级|代价变化|推进触发|冲突升级|悬念设置|节奏控制|伏笔埋设|高潮铺垫|转折点|情节推进|线索回收|信息反转|策略失效|章尾触发|场景目标|情绪转折|视角切换|张力递进/.test(inner);
    const isMeta = Boolean(inner)
      && (inlineMetaKeywords.test(inner) || inlineMetaLevelHint.test(inner) || inlineMetaDelta.test(inner));

    if (!isMeta && !isWritingDirective) {
      keptLines.push(line);
      continue;
    }

    extractedInlineMeta.add(inner);
  }

  text = keptLines.join('\n').trim();

  if (extractedInlineMeta.size > 0) {
    const payload = Array.from(extractedInlineMeta).map(item => `- ${item}`).join('\n');
    const block = `章内状态备注（已从正文移除）：\n${payload}`;
    statusUpdate = statusUpdate
      ? `${statusUpdate}\n\n${block}`.trim()
      : block;
  }

  // 5. 清理正文中残留的状态行和写作指令行
  const inlineStatusPatterns = [
    // 权力威望、危机等级等状态行
    /\n+(?:\*{1,2})?(?:权力威望|危机等级|关键收获|下一步行动触发器|状态更新|章末总结)(?:\*{1,2})?[：:].*/gi,
    // 带有 emoji 的状态行
    /\n+[📊🎯⚡💰🔥✨🌟⭐]+\s*(?:权力|威望|等级|收获|触发器|状态).*/gi,
    // AI 写作指令/结构提示行（非加粗形式，如 "目标建立：……" 独占一行）
    /\n+(?:目标建立|阻力升级|代价变化|推进触发器?|冲突升级|悬念设置|节奏控制|伏笔埋设|高潮铺垫|章尾触发器?|场景目标|情绪转折|张力递进)[：:].*(?:\n|$)/gi,
  ];

  for (const pattern of inlineStatusPatterns) {
    text = text.replace(pattern, '');
  }

  // 6. 过滤正文中可能出现的"小标题"残留
  const cleanedText = stripInlineHeadingFromPolished(text);

  // 7. 从 editorNotes 中提取建议标题
  // 匹配 "**建议标题**：xxx" / "建议标题：xxx" / "**建议标题**:xxx"
  if (editorNotes) {
    const titleMatch = editorNotes.match(/\*{0,2}建议标题\*{0,2}\s*[:：]\s*([^\n*]+)/);
    if (titleMatch) {
      const candidate = titleMatch[1]
        .replace(/^["""''「」《》]+|["""''「」《》]+$/g, '') // 去掉首尾的引号/书名号
        .replace(/\s*\(.*?\)\s*$/g, '') // 去掉尾部括号说明
        .trim();
      // 标题应在 1-30 字之间
      if (candidate && candidate.length >= 1 && candidate.length <= 30) {
        suggestedTitle = candidate;
        // 从 notes 中移除该行，避免影响其他用途
        editorNotes = editorNotes.replace(titleMatch[0], '').trim();
      }
    }
  }

  return { polishedText: cleanedText.trim(), editorNotes, statusUpdate, suggestedTitle };
}
