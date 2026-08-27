type ScenePlanCard = {
  title: string;
  detail: string;
  keywords: string[];
};

export type ScenePlanCheck = {
  title: string;
  keywords: string[];
};

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

function normalizeLine(line: string): string {
  return line
    .replace(/^\s*(?:[-•]|\*)\s+/, '')
    .replace(/^\s+/, '')
    .replace(/^\d+[.)、]\s*/, '')
    .replace(/^#+\s*/, '')
    .trim();
}

function cleanSceneTitle(line: string): string {
  return normalizeLine(line)
    .replace(/^场景\s*\d+\s*[：:]\s*/, '')
    .replace(/^第[一二三四五六七八九十\d]+场\s*[：:]\s*/, '')
    .trim();
}

function summarizeDetail(lines: string[]): string {
  const detail = lines
    .map(line => normalizeLine(line).replace(/^\*\*(.+?)\*\*[：:]?/, '$1：'))
    .filter(Boolean)
    .join('；');
  return detail.slice(0, 140);
}

function extractSceneBlocks(lines: string[]): ScenePlanCard[] {
  const cards: ScenePlanCard[] = [];
  let currentTitle = '';
  let currentLines: string[] = [];

  const flush = () => {
    if (!currentTitle) return;
    const detail = summarizeDetail(currentLines);
    cards.push({
      title: currentTitle,
      detail,
      keywords: extractExecutionKeywords(`${detail} ${currentTitle}`),
    });
    currentTitle = '';
    currentLines = [];
  };

  for (const raw of lines) {
    const line = raw.replace(/^#{1,6}\s*/, '').trim();
    if (/^(?:场景\s*\d+|第[一二三四五六七八九十\d]+场)\s*[：:]/.test(line)) {
      flush();
      currentTitle = cleanSceneTitle(line);
      continue;
    }
    if (currentTitle) currentLines.push(line);
  }
  flush();
  return cards;
}

function extractFallbackCards(lines: string[]): ScenePlanCard[] {
  const bulletCandidates = lines
    .map(normalizeLine)
    .filter(line => line.length >= 8 && line.length <= 90)
    .filter(line => !/^(?:地点|出场角色|节拍|紧张度|内容要点|过桥钩子|转场|可埋设的伏笔|章末钩子)[：:]/.test(line));
  const weighted = bulletCandidates.filter(line => /场景|冲突|转折|高潮|目标|反转|结尾|发现|选择|代价|伏击|交易/.test(line));
  const picked = unique((weighted.length >= 3 ? weighted : bulletCandidates).slice(0, 6));
  return picked.map(item => ({
    title: cleanSceneTitle(item) || item,
    detail: item,
    keywords: extractExecutionKeywords(item),
  }));
}

export function extractExecutionKeywords(text: string): string[] {
  const normalized = text
    .replace(/[#*_`~【】《》“”"']/g, ' ')
    .replace(/[，。！？、；;,!?：:（）()、+→]/g, ' ');
  const knownTerms = normalized.match(/沈渊|苏清月|赵铁山|沈忠|徐谦|乌木|太后|女帝|皇帝|祭坛|太后府|城隍庙|马道|石匣|卷轴|空卷轴|血书|神石|钥匙|圣旨|废婚圣旨|地宫|戍卫营|正殿|隔帘/g) ?? [];
  const splitParts = normalized
    .split(/以|把|拿|给出|发现|留下|决定|挡住|逼问|换|离开|入|出|在|向|与|和|及|的|了|为|被|将|让|使|从|到|里|外|上|下|前|后|\s+/)
    .map(part => part.trim())
    .filter(Boolean);
  const rawWords = normalized.match(/[\u4e00-\u9fa5A-Za-z0-9]{2,12}/g) ?? [];
  const stopWords = new Set([
    '场景', '章节', '本章', '主线', '推进', '关系', '关系线', '剧情', '情节',
    '目标', '冲突', '阻碍', '选择', '决定', '后果', '即时后果', '信息增量',
    '结尾', '章末', '钩子', '线索', '角色', '人物', '出场角色', '内容要点',
    '张力', '目标字数', '必须', '至少', '一个', '可验证', '自然', '通过',
    '外部', '内部', '地点', '建议', '沿用', '大纲', '功能', '节拍',
    '出场角色', '内容要点', '紧张度', '第一轮', '第二轮', '轻量收束',
  ]);
  const concreteWords = [...knownTerms, ...splitParts, ...rawWords]
    .map(cleanKeyword)
    .filter(word => word.length >= 2 && word.length <= 8 && !stopWords.has(word))
    .filter(word => !/^(?:教学失败|覆顶教学|压力逼近|联合阻挡|人物反应|关系变化|场角色|内容要点|紧张度|轻量收束)$/.test(word))
    .filter(word => !/^\d+$/.test(word))
    .filter(word => !/^第?\d+章?$/.test(word));
  const namedLike = concreteWords.filter(word =>
    /沈渊|苏清月|赵铁山|沈忠|徐谦|乌木|太后|女帝|皇帝|祭坛|太后府|城隍庙|马道|石匣|卷轴|血书|神石|钥匙|圣旨|地宫|戍卫营|正殿|隔帘/.test(word),
  );
  return unique([...namedLike, ...concreteWords]).slice(0, 8);
}

function cleanKeyword(raw: string): string {
  return raw
    .replace(/\*\*/g, '')
    .replace(/^[：:，,、/（）()]+/, '')
    .replace(/[：:，,、/（）()]+$/g, '')
    .replace(/^(?:地点|出场角色|节拍|紧张度|内容要点|功能|目标|阻碍|选择|即时后果|验收词)[：:]/, '')
    .trim();
}

export function buildScenePlanFromOutline(
  outlineText: string,
  chapterNumber: number,
): string {
  const lines = outlineText.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const parsedCards = extractSceneBlocks(lines);
  const fallbackCards = parsedCards.length > 0 ? parsedCards : extractFallbackCards(lines);
  const cards = (fallbackCards.length > 0
    ? fallbackCards
    : [
      {
        title: `第${chapterNumber}章开场推进`,
        detail: '承接上一章结果，立刻进入新动作。',
        keywords: [`第${chapterNumber}章`, '开场推进'],
      },
      {
        title: '中段冲突升级',
        detail: '让阻力升级，迫使角色改变方案。',
        keywords: ['冲突升级', '改变方案'],
      },
      {
        title: '结尾留钩并收束当章目标',
        detail: '收束当章目标，留下具体下一步。',
        keywords: ['结尾', '下一步'],
      },
    ]).slice(0, 6);

  const rows = cards.map((card, idx) => {
    const sceneNo = idx + 1;
    const keywords = card.keywords.length > 0 ? card.keywords : extractExecutionKeywords(card.title);
    return [
      `场景${sceneNo}：${card.title}`,
      card.detail ? `- 功能：${card.detail}` : '- 功能：推进主线并承接上一场结果',
      '- 目标：让角色为本场目标采取可见行动，不用旁白说明替代剧情。',
      '- 阻碍：设置一个会迫使角色变招的外部阻力、关系拉扯或规则代价。',
      '- 选择：安排角色当场做出不可撤回的小决定。',
      '- 即时后果：本场结尾必须改变人物处境、持有线索、伤势代价、阵营关系或下一步路线。',
      `- 验收词：${keywords.slice(0, 6).join('、')}`,
      '- 反空转：不要只复述地图、设定、局势或心情；每场都要写出行动后的新局面。',
    ].join('\n');
  });

  return rows.join('\n\n');
}

export function extractScenePlanChecks(scenePlan?: string): ScenePlanCheck[] {
  if (!scenePlan) return [];
  const blocks = scenePlan
    .split(/\n\s*\n/)
    .map(block => block.trim())
    .filter(Boolean);
  const checks: ScenePlanCheck[] = [];
  for (const block of blocks) {
    const lines = block.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    const titleLine = lines.find(line => /^场景\s*\d+\s*[：:]/.test(line));
    if (!titleLine) continue;
    const title = cleanSceneTitle(titleLine);
    const keywordLine = lines.find(line => /^[-*]?\s*验收词\s*[：:]/.test(normalizeLine(line)));
    const explicitKeywords = keywordLine
      ? normalizeLine(keywordLine)
        .replace(/^验收词\s*[：:]\s*/, '')
        .split(/[、,，/]/)
        .map(cleanKeyword)
        .filter(Boolean)
      : [];
    const keywords = unique([...explicitKeywords, ...extractExecutionKeywords(title)])
      .filter(keyword => !/^(?:教学失败|覆顶教学|压力逼近|联合阻挡|人物反应|关系变化|场角色|轻量收束)$/.test(keyword))
      .slice(0, 6);
    checks.push({ title, keywords });
  }
  return checks.slice(0, 8);
}
